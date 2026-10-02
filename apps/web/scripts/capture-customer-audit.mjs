// Chụp và đo các màn khách ở bốn khung nhìn, cho rà soát UX/AX (docs/review.md).
// Chạy trên dev server dữ liệu giả, bằng Chromium của @playwright/test:
//   VITE_USE_MOCK=1 pnpm dev
//   node scripts/capture-customer-audit.mjs http://localhost:5173 <thư-mục-ra>
// Kết quả: <khung>-<màn>.png và audit.json (đích chạm < 44 px, ô nhập < 16 px, tiêu đề, tràn ngang, robots).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const [base, outArg] = process.argv.slice(2);
if (!base || !outArg) {
  console.error("Usage: node scripts/capture-customer-audit.mjs <base-url> <out-dir>");
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
const TOKEN = "DEVTEST001";
const MIN_TARGET = 44;
const MIN_INPUT_PX = 16;

// Dữ liệu giả sống trong trang (MSW), nên mỗi page.goto tạo lại nó. Gieo dữ liệu bằng chính module db
// mà app đang dùng, rồi chuyển route phía client để không nạp lại trang.
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

function seedOrder(db, { status, ageSec }) {
  const created = new Date(Date.now() - ageSec * 1000).toISOString();
  const at = (s) => (s ? created : null);
  const closed = ["paid", "cancelled", "rejected"].includes(status);
  db.orders.push({
    id: `audit-${status}-${ageSec}`,
    code: "AB12CD",
    status,
    items: [
      { product_id: "p-cfsd", name: "Cà phê sữa đá", unit_price: 25000, qty: 2, sweet: "medium", ice: "normal", line_total: 50000 },
      { product_id: "p-nuoc", name: "Nước suối", unit_price: 10000, qty: 1, sweet: null, ice: null, line_total: 10000 },
    ],
    note: null,
    total: 60000,
    partner_name: "Quán test",
    table_label: "Bàn 1",
    cancel_reason: status === "cancelled" ? "customer" : status === "rejected" ? "out_of_stock" : null,
    payment_method: status === "paid" ? "cash" : null,
    created_at: created,
    accepted_at: at(["accepted", "delivering", "paid"].includes(status)),
    delivering_at: at(["delivering", "paid"].includes(status)),
    paid_at: at(status === "paid"),
    closed_at: at(closed),
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

const ORDER_STATES = [
  { name: "sent", status: "sent", ageSec: 5 },
  { name: "unconfirmed", status: "sent", ageSec: 90 },
  { name: "accepted", status: "accepted", ageSec: 120 },
  { name: "delivering", status: "delivering", ageSec: 300 },
  { name: "paid", status: "paid", ageSec: 600 },
  { name: "cancelled", status: "cancelled", ageSec: 60 },
  { name: "rejected", status: "rejected", ageSec: 60 },
];

const menuReady = (page) => page.getByRole("list", { name: "Menu" }).waitFor();
const openFirstProduct = async (page) => {
  await page.getByRole("button", { name: /Cà phê sữa đá/ }).click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(400);
};

// Mỗi màn: tên ảnh và các bước dựng màn. sellerOnly chỉ chụp ở desktop.
const SCENES = [
  { name: "home", run: (p) => openApp(p, "/") },
  { name: "404", run: (p) => openApp(p, "/khong-co-trang-nay") },
  { name: "menu-loaded", run: async (p) => (await openApp(p, `/t/${TOKEN}`), menuReady(p)) },
  { name: "menu-product-sheet", run: async (p) => (await openApp(p, `/t/${TOKEN}`), await menuReady(p), openFirstProduct(p)) },
  {
    name: "menu-after-add",
    run: async (p) => {
      await openApp(p, `/t/${TOKEN}`);
      await menuReady(p);
      await openFirstProduct(p);
      await p.getByRole("button", { name: /Thêm vào giỏ/ }).click();
      await p.getByRole("button", { name: /Xem giỏ/ }).waitFor();
      await p.waitForTimeout(400);
    },
  },
  {
    name: "cart-sheet-invalid-phone",
    run: async (p) => {
      await openApp(p, `/t/${TOKEN}`);
      await menuReady(p);
      await openFirstProduct(p);
      await p.getByRole("button", { name: /Thêm vào giỏ/ }).click();
      await p.getByRole("button", { name: /Xem giỏ/ }).click();
      await p.getByRole("dialog").waitFor();
      await p.getByLabel(/Số điện thoại/).fill("123");
      await p.getByLabel(/Số điện thoại/).blur();
      await p.waitForTimeout(400);
    },
  },
  {
    name: "menu-paused",
    run: async (p) => {
      await openApp(p, "/");
      await seed(p, (db) => (db.settings.accepting_orders = false));
      await clientNavigate(p, `/t/${TOKEN}`);
      await menuReady(p);
    },
  },
  { name: "qr-not-found", run: async (p) => (await openApp(p, "/t/KHONGCO"), p.getByRole("heading").first().waitFor()) },
  { name: "revoked", run: (p) => openApp(p, "/revoked") },
  { name: "order-not-found", run: async (p) => (await openApp(p, "/o/khong-co"), p.getByRole("heading").first().waitFor()) },
  ...ORDER_STATES.map((s) => ({
    name: `order-${s.name}`,
    run: async (p) => {
      await openApp(p, "/");
      await seed(p, seedOrder, s);
      await clientNavigate(p, `/o/audit-${s.status}-${s.ageSec}`);
      await p.getByRole("heading", { level: 1 }).waitFor();
      await p.waitForLoadState("networkidle");
    },
  })),
  { name: "seller-login", sellerOnly: true, run: (p) => openApp(p, "/seller/login") },
  {
    name: "seller-settings",
    sellerOnly: true,
    run: async (p) => {
      await openApp(p, "/seller/login");
      await p.getByLabel(/Mật khẩu/).fill("password");
      await p.getByRole("button", { name: /Đăng nhập/ }).click();
      await p.getByRole("link", { name: "Cài đặt" }).click();
      await p.waitForURL(/\/seller\/settings$/);
      await p.getByLabel(/Số tài khoản/).waitFor();
    },
  },
];

// Đo trong trang: khi có sheet mở, phần nền bị inert nên chỉ đo trong sheet.
function measure({ minTarget, minInputPx }) {
  const scope = document.querySelector("dialog[open]") ?? document;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const label = (el) =>
    (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 60);
  const interactive = [...scope.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role="button"], summary')].filter(visible);
  return {
    title: document.title,
    robots: document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    smallTargets: interactive
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width < minTarget || r.height < minTarget)
      .map(({ el, r }) => ({ tag: el.tagName.toLowerCase(), label: label(el), width: Math.round(r.width), height: Math.round(r.height) })),
    smallInputs: [...document.querySelectorAll("input:not([type=hidden]), textarea, select")]
      .filter(visible)
      .map((el) => ({ label: label(el), fontSize: parseFloat(getComputedStyle(el).fontSize) }))
      .filter((i) => i.fontSize < minInputPx),
  };
}

const browser = await chromium.launch();
const audit = { base, capturedAt: new Date().toISOString(), minTarget: MIN_TARGET, minInputPx: MIN_INPUT_PX, pages: [] };
try {
  for (const vp of VIEWPORTS) {
    for (const scene of SCENES) {
      if (scene.sellerOnly && vp.name !== "desktop") continue;
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
      const page = await context.newPage();
      const file = `${vp.name}-${scene.name}.png`;
      try {
        await scene.run(page);
        await page.screenshot({ path: join(out, file), fullPage: true });
        audit.pages.push({ viewport: vp.name, scene: scene.name, path: new URL(page.url()).pathname, screenshot: file, ...(await page.evaluate(measure, { minTarget: MIN_TARGET, minInputPx: MIN_INPUT_PX })) });
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

// Ngưỡng 44 px chỉ áp cho màn khách; màn người bán được chụp để kiểm tràn ngang và cỡ chữ ô nhập.
const ok = audit.pages.filter((p) => !p.error);
const isSeller = (p) => p.scene.startsWith("seller");
audit.summary = {
  pages: audit.pages.length,
  errors: audit.pages.length - ok.length,
  smallTargets: ok.filter((p) => !isSeller(p)).reduce((n, p) => n + p.smallTargets.length, 0),
  sellerSmallTargets: ok.filter(isSeller).reduce((n, p) => n + p.smallTargets.length, 0),
  smallInputs: ok.reduce((n, p) => n + p.smallInputs.length, 0),
  overflowX: ok.filter((p) => p.overflowX).map((p) => `${p.viewport}/${p.scene}`),
  titles: Object.fromEntries(ok.filter((p) => p.viewport === "mobile" || isSeller(p)).map((p) => [p.scene, p.title])),
};
writeFileSync(join(out, "audit.json"), JSON.stringify(audit, null, 2) + "\n");
console.log(JSON.stringify(audit.summary, null, 2));
process.exit(audit.summary.errors > 0 ? 1 : 0);
