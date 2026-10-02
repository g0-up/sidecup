import { test as base, devices, expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";

export const SELLER_PASSWORD = process.env.E2E_SELLER_PASSWORD ?? "e2e-password-not-for-production";

// Khung giờ mở cả ngày để spec không phụ thuộc giờ chạy.
const ALL_DAY = [{ days: [1, 2, 3, 4, 5, 6, 7], from: "00:00", to: "23:59" }];

export interface Table {
  partnerId: string;
  partnerName: string;
  token: string;
  tea: { id: string; name: string; price: number };
  water: { id: string; name: string; price: number };
}

function uniq(prefix: string) {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

async function ok<T>(res: Awaited<ReturnType<APIRequestContext["post"]>>): Promise<T> {
  expect(res.ok(), `${res.url()} → ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

// SellerApi dựng dữ liệu cho từng spec qua API người bán (không chạm DB trực tiếp):
// mỗi spec có quán, món, bàn riêng nên chạy lại nhiều lần không đụng nhau.
export class SellerApi {
  constructor(private readonly req: APIRequestContext) {}

  async setupTable(): Promise<Table> {
    const partnerName = uniq("Quán E2E");
    const partner = await ok<{ id: string }>(
      await this.req.post("/api/seller/partners", {
        data: { name: partnerName, commission_rate: 0.15, payout_period: "week", open_hours: ALL_DAY },
      }),
    );
    const tea = await ok<{ id: string; name: string; price: number }>(
      await this.req.post("/api/seller/products", {
        data: { name: uniq("Trà đá"), price: 15000, has_sweet: true, has_ice: true, sort: 1 },
      }),
    );
    const water = await ok<{ id: string; name: string; price: number }>(
      await this.req.post("/api/seller/products", {
        data: { name: uniq("Nước suối"), price: 10000, has_sweet: false, has_ice: false, sort: 2 },
      }),
    );
    const qr = await ok<{ token: string }>(
      await this.req.post(`/api/seller/partners/${partner.id}/qrcodes`, { data: { table_label: "Bàn 9" } }),
    );
    return { partnerId: partner.id, partnerName, token: qr.token, tea, water };
  }

  async setAccepting(accepting: boolean) {
    await ok(await this.req.put("/api/seller/settings", { data: { accepting_orders: accepting } }));
  }

  async setAvailable(productId: string, available: boolean) {
    await ok(await this.req.patch(`/api/seller/products/${productId}/availability`, { data: { available } }));
  }

  async revoke(token: string) {
    await ok(await this.req.post(`/api/seller/qrcodes/${token}/revoke`));
  }

  async ordersOf(partnerId: string) {
    const all = await ok<{ orders: { id: string; status: string; partner_id: string; total: number }[] }>(
      await this.req.get("/api/seller/orders"),
    );
    return all.orders.filter((o) => o.partner_id === partnerId);
  }

  async transition(id: string, from: string, to: string, extra: Record<string, string> = {}) {
    return ok(await this.req.post(`/api/seller/orders/${id}/transition`, { data: { to, expected_from: from, ...extra } }));
  }

  async commission(partnerId: string) {
    return ok<{ rows: { paid_count: number; revenue: number; commission: number }[] }>(
      await this.req.get(`/api/seller/reports/commission?partner_id=${partnerId}&period=current`),
    );
  }
}

type Fixtures = {
  sellerContext: BrowserContext;
  sellerPage: Page;
  seller: SellerApi;
  customerContext: BrowserContext;
  customerPage: Page;
  table: Table;
};

export const test = base.extend<Fixtures>({
  sellerContext: async ({ browser, baseURL }, use) => {
    // Cookie phiên từ global-setup (đăng nhập một lần cho cả bộ).
    const ctx = await browser.newContext({
      baseURL,
      viewport: { width: 1280, height: 860 },
      locale: "vi-VN",
      storageState: "e2e/.auth/seller.json",
    });
    await use(ctx);
    await ctx.close();
  },
  sellerPage: async ({ sellerContext }, use) => {
    await use(await sellerContext.newPage());
  },
  seller: async ({ sellerContext }, use) => {
    const api = new SellerApi(sellerContext.request);
    await api.setAccepting(true);
    await use(api);
  },
  // Khách trên điện thoại (khung iPhone 13), engine theo project đang chạy.
  customerContext: async ({ browser, baseURL, browserName }, use) => {
    const { viewport, deviceScaleFactor, hasTouch, userAgent } = devices["iPhone 13"];
    const ctx = await browser.newContext({
      baseURL,
      viewport,
      deviceScaleFactor,
      hasTouch,
      isMobile: browserName === "chromium",
      userAgent,
      locale: "vi-VN",
    });
    await use(ctx);
    await ctx.close();
  },
  customerPage: async ({ customerContext }, use) => {
    await use(await customerContext.newPage());
  },
  table: async ({ seller }, use) => {
    await use(await seller.setupTable());
  },
});

export { expect };

// sql chạy một câu lệnh lên DB của stack E2E: qua psql với E2E_DATABASE_URL, hoặc psql trong container postgres.
// Chỉ dùng để dựng tình huống thời gian (đơn đã chờ 70 giây) mà không thêm endpoint test-only vào API.
export function sql(statement: string) {
  const url = process.env.E2E_DATABASE_URL;
  if (url) {
    execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-qc", statement], { stdio: "pipe" });
    return;
  }
  execFileSync(
    "docker",
    ["compose", "-f", "../../infra/docker-compose.yml", "exec", "-T", "postgres", "psql", "-U", "sidecup", "-d", "sidecup", "-v", "ON_ERROR_STOP=1", "-qc", statement],
    { stdio: "pipe" },
  );
}

// ageOrder lùi created_at để đơn `sent` trông như đã chờ `seconds` giây.
export function ageOrder(id: string, seconds: number) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error(`id đơn không hợp lệ: ${id}`);
  sql(`UPDATE orders SET created_at = now() - interval '${seconds} seconds' WHERE id = '${id}' AND status = 'sent'`);
}

// placeOrder đi đúng luồng của khách: chọn món → giỏ → SĐT → Đặt nước → trang đơn.
export async function addToCart(page: Page, productName: string) {
  await page.getByRole("button", { name: new RegExp(productName) }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: /Thêm vào giỏ/ }).click();
  await expect(sheet).toBeHidden();
}

export async function openCartAndFillPhone(page: Page, phone = "0901234567") {
  await page.getByRole("button", { name: /Xem giỏ/ }).click();
  const sheet = page.getByRole("dialog", { name: "Giỏ của bạn" });
  await sheet.getByLabel("Số điện thoại").fill(phone);
  return sheet;
}

export async function placeOrder(page: Page, table: Table): Promise<string> {
  await page.goto(`/t/${table.token}`);
  await addToCart(page, table.tea.name);
  const sheet = await openCartAndFillPhone(page);
  await sheet.getByRole("button", { name: "Đặt nước" }).click();
  await page.waitForURL(/\/o\/[0-9a-f-]{36}$/);
  return page.url().split("/o/")[1];
}
