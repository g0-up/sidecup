// Chụp và đo các màn người bán ở bốn khung nhìn, cho rà soát UX/AX (docs/review.md).
// Chạy trên dev server dữ liệu giả, bằng Chromium của @playwright/test:
//   VITE_USE_MOCK=1 pnpm dev
//   node scripts/capture-seller-audit.mjs http://localhost:5173 <thư-mục-ra>
// Kết quả: <khung>-seller-<màn>.png và audit.json (tiêu đề, h1, tràn ngang, bảng cuộn ngang, chiều cao header,
// đích chạm < 24 px và < 44 px, ô nhập < 16 px, tiêu đề cột dính).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const [base, outArg] = process.argv.slice(2);
if (!base || !outArg) {
  console.error("Usage: node scripts/capture-seller-audit.mjs <base-url> <out-dir>");
  process.exit(2);
}
const out = resolve(outArg);
mkdirSync(out, { recursive: true });

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 812 },
  { name: "narrow320", width: 320, height: 640 },
];
const PARTNER_ID = "00000000-0000-4000-8000-000000000001";
const MIN_INPUT_PX = 16;

// Dữ liệu giả sống trong trang (MSW), nên mỗi page.goto tạo lại nó. Gieo dữ liệu bằng chính module db
// mà app đang dùng, rồi chuyển route phía client để không nạp lại trang (và không mất phiên đăng nhập).
async function seed(page, fn, arg) {
  await page.evaluate(
    async ({ src, arg }) => {
      const { db } = await import("/src/mocks/db.ts");
      new Function("db", "arg", `(${src})(db, arg)`)(db, arg);
    },
    { src: fn.toString(), arg },
  );
}

async function clientNavigate(page, path) {
  await page.evaluate((p) => {
    window.history.pushState({}, "", p);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

async function openApp(page, path) {
  await page.goto(base + path);
  await page.waitForLoadState("networkidle");
}

// Đủ đơn cho ba cột (một đơn "Đã gửi" trễ) và một đơn đã đóng hôm nay.
function seedOrders(db, orders) {
  for (const { id, code, status, ageSec } of orders) {
    const created = new Date(Date.now() - ageSec * 1000).toISOString();
    const at = (s) => (s ? created : null);
    db.orders.push({
      id,
      code,
      status,
      items: [
        { product_id: "p-cfsd", name: "Cà phê sữa đá", unit_price: 25000, qty: 2, sweet: "medium", ice: "normal", line_total: 50000 },
        { product_id: "p-nuoc", name: "Nước suối", unit_price: 10000, qty: 1, sweet: null, ice: null, line_total: 10000 },
      ],
      note: status === "sent" ? "Ít đá, mang ra bàn ngoài hiên" : null,
      total: 60000,
      partner_name: "Quán test",
      table_label: "Bàn 1",
      cancel_reason: null,
      payment_method: status === "paid" ? "cash" : null,
      created_at: created,
      accepted_at: at(["accepted", "delivering", "paid"].includes(status)),
      delivering_at: at(["delivering", "paid"].includes(status)),
      paid_at: at(status === "paid"),
      closed_at: at(status === "paid"),
      updated_at: created,
      partner_id: "partner-1",
      qr_token: "DEVTEST001",
      menu_path: "/t/DEVTEST001",
      customer_phone: "0901234567",
      commission_rate: null,
      commission_amount: null,
      client_id: "",
    });
  }
}

const ORDERS = [
  { id: "audit-sent-late", code: "LATE01", status: "sent", ageSec: 150 },
  { id: "audit-sent", code: "NEW002", status: "sent", ageSec: 10 },
  { id: "audit-accepted", code: "BREW03", status: "accepted", ageSec: 240 },
  { id: "audit-delivering", code: "WALK04", status: "delivering", ageSec: 420 },
  { id: "audit-paid", code: "DONE05", status: "paid", ageSec: 900 },
];

// Đăng nhập một lần trên trang đã gieo đơn, rồi đi tiếp bằng route phía client.
async function signIn(page, path = "/seller") {
  await openApp(page, "/");
  await seed(page, seedOrders, ORDERS);
  await clientNavigate(page, "/seller/login");
  await page.getByLabel(/Mật khẩu/).fill("password");
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await page.getByRole("heading", { name: "Bảng đơn" }).waitFor({ state: "attached" });
  if (path !== "/seller") await clientNavigate(page, path);
  await page.waitForLoadState("networkidle");
}

const settle = (page) => page.waitForTimeout(400);
const heading = (page) => page.getByRole("heading", { level: 1 }).first().waitFor({ state: "attached" });
const dialog = async (page, role = "dialog") => (await page.getByRole(role).waitFor(), settle(page));
// Dưới lg bảng chỉ hiện một cột: chọn cột chứa đơn trước khi bấm nút trên thẻ.
async function showColumn(page, title) {
  const pick = page.getByRole("group", { name: "Chọn cột" }).getByRole("button", { name: new RegExp(`^${title}`) });
  if (await pick.isVisible()) await pick.click();
}

// kind quyết định ngưỡng đích chạm: "service" (bảng đơn, đơn, hộp thoại giao) cần 44 px dưới lg, "manage" cần 24 px.
// below: chỉ chụp khi khung nhìn hẹp hơn số này.
const SCENES = [
  { name: "login", kind: "manage", run: async (p) => (await openApp(p, "/seller/login"), heading(p)) },
  { name: "board-open", kind: "service", run: (p) => signIn(p) },
  {
    name: "board-closed",
    kind: "service",
    run: async (p) => {
      await signIn(p);
      await p.getByRole("tab", { name: /Đã đóng hôm nay/ }).click();
      await p.getByRole("article", { name: "Đơn DONE05" }).waitFor();
    },
  },
  {
    name: "reject-confirm",
    kind: "service",
    run: async (p) => {
      await signIn(p);
      await showColumn(p, "Đã gửi");
      await p.getByRole("article", { name: "Đơn NEW002" }).getByRole("button", { name: "Từ chối" }).click();
      await dialog(p, "alertdialog");
    },
  },
  {
    name: "vietqr",
    kind: "service",
    run: async (p) => {
      await signIn(p);
      await showColumn(p, "Đang mang ra");
      await p.getByRole("article", { name: "Đơn WALK04" }).getByRole("button", { name: "Chuyển khoản" }).click();
      await dialog(p);
    },
  },
  { name: "order-detail", kind: "service", run: async (p) => (await signIn(p, "/seller/orders/audit-accepted"), p.getByRole("heading", { name: "Đơn #BREW03" }).waitFor({ state: "attached" })) },
  {
    name: "menu-open",
    kind: "service",
    below: 1024,
    run: async (p) => {
      await signIn(p);
      await p.getByRole("button", { name: "Mở menu" }).click();
      await dialog(p);
    },
  },
  { name: "products", kind: "manage", run: async (p) => (await signIn(p, "/seller/products"), p.getByRole("switch", { name: /Cà phê sữa đá/ }).waitFor()) },
  {
    name: "product-form",
    kind: "manage",
    run: async (p) => {
      await signIn(p, "/seller/products");
      await p.getByRole("button", { name: /Thêm món/ }).click();
      await dialog(p);
    },
  },
  { name: "partners", kind: "manage", run: async (p) => (await signIn(p, "/seller/partners"), p.getByRole("link", { name: "Quán test" }).waitFor()) },
  {
    name: "partner-form",
    kind: "manage",
    run: async (p) => {
      await signIn(p, "/seller/partners");
      await p.getByRole("button", { name: /Thêm quán/ }).click();
      await dialog(p);
    },
  },
  {
    name: "partner-detail",
    kind: "manage",
    run: async (p) => (await signIn(p, `/seller/partners/${PARTNER_ID}`), p.getByRole("button", { name: /Xem thẻ/ }).first().waitFor()),
  },
  {
    name: "partner-qr-card",
    kind: "manage",
    run: async (p) => {
      await signIn(p, `/seller/partners/${PARTNER_ID}`);
      await p.getByRole("button", { name: /Xem thẻ/ }).first().click();
      await dialog(p);
    },
  },
  { name: "print", kind: "manage", run: async (p) => (await signIn(p, `/seller/partners/${PARTNER_ID}/print`), heading(p), settle(p)) },
  { name: "settings", kind: "manage", run: async (p) => (await signIn(p, "/seller/settings"), p.getByLabel(/Số tài khoản/).waitFor()) },
  {
    name: "reports-commission",
    kind: "manage",
    run: async (p) => (await signIn(p, "/seller/reports"), p.getByText("Quán test").first().waitFor(), settle(p)),
  },
  {
    name: "reports-funnel",
    kind: "manage",
    run: async (p) => {
      await signIn(p, "/seller/reports");
      await p.getByRole("tab", { name: "Phễu" }).click();
      await p.waitForLoadState("networkidle");
      await settle(p);
    },
  },
];

// Đo trong trang: khi có hộp thoại mở, phần nền bị inert nên chỉ đo đích chạm trong hộp thoại.
function measure({ minInputPx }) {
  const scope = document.querySelector('[role="dialog"], [role="alertdialog"]') ?? document;
  // Bỏ phần tử ẩn với người dùng: sr-only, aria-hidden (input phụ của Radix), select gốc 1 px của Radix Select.
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest(".sr-only, [aria-hidden=true]");
  };
  // Nhãn gắn với điều khiển cũng nhận chạm, nên vùng chạm là hợp của điều khiển và nhãn.
  const hitRect = (el) => {
    const rects = [el, ...(el.labels ?? []), el.closest("label")].filter(Boolean).map((x) => x.getBoundingClientRect());
    const left = Math.min(...rects.map((r) => r.left));
    const top = Math.min(...rects.map((r) => r.top));
    return { width: Math.max(...rects.map((r) => r.right)) - left, height: Math.max(...rects.map((r) => r.bottom)) - top };
  };
  const label = (el) =>
    (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 60);
  const interactive = [
    ...scope.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role="button"], [role="switch"], [role="tab"], summary'),
  ].filter(visible);
  const targets = interactive.map((el) => {
    const r = hitRect(el);
    return { tag: el.tagName.toLowerCase(), label: label(el), width: Math.round(r.width), height: Math.round(r.height) };
  });
  const under = (min) => targets.filter((t) => t.width < min || t.height < min);
  const header = document.querySelector("header");
  return {
    title: document.title,
    h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()),
    robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    headerHeight: header ? Math.round(header.getBoundingClientRect().height) : null,
    tablesScrolling: [...document.querySelectorAll('[data-slot="table-container"]')]
      .filter(visible)
      .map((el) => el.scrollWidth - el.clientWidth)
      .filter((hidden) => hidden > 0),
    under24: under(24),
    under44: under(44),
    smallInputs: [...document.querySelectorAll("input:not([type=hidden]), textarea, select")]
      .filter(visible)
      .map((el) => ({ label: label(el), fontSize: parseFloat(getComputedStyle(el).fontSize) }))
      .filter((i) => i.fontSize < minInputPx),
    stickyHeadings: [...document.querySelectorAll("h2")].filter((h) => getComputedStyle(h).position === "sticky").map((h) => h.textContent.trim()),
  };
}

const browser = await chromium.launch();
const audit = { base, capturedAt: new Date().toISOString(), minInputPx: MIN_INPUT_PX, pages: [] };
try {
  for (const vp of VIEWPORTS) {
    for (const scene of SCENES) {
      if (scene.below && vp.width >= scene.below) continue;
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
      const page = await context.newPage();
      const file = `${vp.name}-seller-${scene.name}.png`;
      try {
        await scene.run(page);
        await page.screenshot({ path: join(out, file), fullPage: true });
        const m = await page.evaluate(measure, { minInputPx: MIN_INPUT_PX });
        audit.pages.push({ viewport: vp.name, width: vp.width, scene: scene.name, kind: scene.kind, path: new URL(page.url()).pathname, screenshot: file, ...m });
      } catch (e) {
        audit.pages.push({ viewport: vp.name, scene: scene.name, error: String(e).split("\n")[0] });
        console.error(`${vp.name}/${scene.name}: ${String(e).split("\n")[0]}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

// Ngưỡng: mọi màn ≥ 24 px; màn giao dưới lg (1024 px) ≥ 44 px.
const ok = audit.pages.filter((p) => !p.error);
const at = (p) => `${p.viewport}/${p.scene}`;
audit.summary = {
  pages: audit.pages.length,
  errors: audit.pages.length - ok.length,
  overflowX: ok.filter((p) => p.overflowX).map(at),
  tablesScrolling: ok.filter((p) => p.width < 1024 && p.tablesScrolling.length > 0).map((p) => `${at(p)} (${p.tablesScrolling.join(", ")} px)`),
  under24: ok.flatMap((p) => p.under24.map((t) => `${at(p)}: ${t.label} ${t.width}×${t.height}`)),
  serviceUnder44: ok
    .filter((p) => p.kind === "service" && p.width < 1024)
    .flatMap((p) => p.under44.map((t) => `${at(p)}: ${t.label} ${t.width}×${t.height}`)),
  smallInputs: ok.reduce((n, p) => n + p.smallInputs.length, 0),
  missingH1: ok.filter((p) => p.h1.length === 0).map(at),
  headerHeight: Object.fromEntries(ok.filter((p) => p.scene === "board-open").map((p) => [p.viewport, p.headerHeight])),
  stickyHeadings: ok.filter((p) => p.stickyHeadings.length > 0).map(at),
  titles: Object.fromEntries(ok.filter((p) => p.viewport === "desktop").map((p) => [p.scene, p.title])),
};
writeFileSync(join(out, "audit.json"), JSON.stringify(audit, null, 2) + "\n");
console.log(JSON.stringify(audit.summary, null, 2));
process.exit(audit.summary.errors > 0 ? 1 : 0);
