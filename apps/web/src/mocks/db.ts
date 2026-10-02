// Dữ liệu giả trong bộ nhớ cho MSW (dev khi chưa chạy API, và test). Hình dạng khớp hợp đồng API.
import type { Menu, MenuProduct } from "@/features/customer-menu/api";
import type { SellerOrder } from "@/shared/api/orders";
import type { Settings } from "@/shared/api/settings";
import type { ZaloLinkState, ZaloStatus } from "@/shared/api/zalo";

export const MOCK_TOKEN = "DEVTEST001";

export interface MockDb {
  products: MenuProduct[];
  orders: SellerOrder[];
  settings: Settings;
  revokedTokens: Set<string>;
  idempotency: Map<string, string>;
  zalo: ZaloStatus;
  zaloLinks: Map<string, ZaloLinkState>;
}

function fresh(): MockDb {
  return {
    products: [
      { id: "p-cfsd", name: "Cà phê sữa đá", price: 25000, image_url: null, has_sweet: true, has_ice: true, available: true },
      { id: "p-bacxiu", name: "Bạc xỉu", price: 29000, image_url: null, has_sweet: true, has_ice: true, available: true },
      { id: "p-nuoc", name: "Nước suối", price: 10000, image_url: null, has_sweet: false, has_ice: false, available: true },
      { id: "p-tradao", name: "Trà đào cam sả", price: 35000, image_url: null, has_sweet: true, has_ice: true, available: false },
    ],
    orders: [],
    settings: {
      accepting_orders: true,
      eta_minutes: 7,
      bank_bin: "970415",
      bank_account: "0123456789",
      bank_account_name: "NGUYEN VAN A",
      updated_at: new Date().toISOString(),
    },
    revokedTokens: new Set(),
    idempotency: new Map(),
    zalo: { configured: true, linked: false, status: "", display_name: "", linked_at: null },
    zaloLinks: new Map(),
  };
}

export let db: MockDb = fresh();

export function resetMockDb() {
  db = fresh();
}

export function mockMenu(clientId: string): Menu {
  const today = new Date().toDateString();
  return {
    partner: { name: "Quán test" },
    table_label: "Bàn 1",
    eta_minutes: db.settings.eta_minutes,
    ordering: db.settings.accepting_orders
      ? { enabled: true, reason: null, hours_today: ["00:00–23:59"] }
      : { enabled: false, reason: "paused", hours_today: ["00:00–23:59"] },
    products: db.products,
    my_orders: db.orders
      .filter((o) => (o as SellerOrder & { client_id?: string }).client_id === clientId && new Date(o.created_at).toDateString() === today)
      .slice(-5)
      .reverse()
      .map((o) => ({ id: o.id, code: o.code, status: o.status })),
    server_time: new Date().toISOString(),
  };
}
