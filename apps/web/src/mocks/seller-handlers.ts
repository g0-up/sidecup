import { http, HttpResponse } from "msw";
import type { SellerOrder } from "@/shared/api/orders";
import type { SettingsUpdate } from "@/shared/api/settings";
import { db } from "./db";

const err = (status: number, code: string, message: string, details?: Record<string, unknown>) =>
  HttpResponse.json({ error: { code, message, details } }, { status });

let loggedIn = false;

export function setMockLoggedIn(v: boolean) {
  loggedIn = v;
}

const OPEN = ["sent", "accepted", "delivering"];

const guard = () => (loggedIn ? null : err(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết, vui lòng đăng nhập lại"));

export const sellerHandlers = [
  http.post("/api/seller/login", async ({ request }) => {
    const { password } = (await request.json()) as { password: string };
    if (password !== "password") return err(401, "INVALID_PASSWORD", "Mật khẩu không đúng");
    loggedIn = true;
    return HttpResponse.json({ authenticated: true, expires_at: new Date(Date.now() + 30 * 86400_000).toISOString() });
  }),
  http.post("/api/seller/logout", () => {
    loggedIn = false;
    return new HttpResponse(null, { status: 204 });
  }),
  http.get("/api/seller/me", () => guard() ?? HttpResponse.json({ authenticated: true, expires_at: new Date().toISOString() })),

  http.get("/api/seller/orders", ({ request }) => {
    const g = guard();
    if (g) return g;
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope");
    const after = url.searchParams.get("updated_after");
    let list = db.orders as SellerOrder[];
    if (scope === "open") list = list.filter((o) => OPEN.includes(o.status));
    if (scope === "closed") list = list.filter((o) => !OPEN.includes(o.status));
    if (after) list = list.filter((o) => Date.parse(o.updated_at) > Date.parse(after));
    return HttpResponse.json({ orders: list, server_time: new Date().toISOString() });
  }),
  http.get("/api/seller/orders/:id", ({ params }) => {
    const o = db.orders.find((x) => x.id === params.id);
    return o ? HttpResponse.json({ ...o, server_time: new Date().toISOString() }) : err(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn");
  }),
  http.post("/api/seller/orders/:id/transition", async ({ params, request }) => {
    const o = db.orders.find((x) => x.id === params.id);
    if (!o) return err(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn");
    const body = (await request.json()) as { to: string; expected_from: string; payment_method?: "cash" | "transfer" };
    if (o.status !== body.expected_from) {
      return err(409, "INVALID_TRANSITION", "Đơn đã đổi trạng thái, vui lòng xem lại", { current_status: o.status });
    }
    const now = new Date().toISOString();
    Object.assign(o, { status: body.to, updated_at: now });
    if (body.to === "paid") Object.assign(o, { payment_method: body.payment_method, paid_at: now, closed_at: now });
    return HttpResponse.json({ ...o, server_time: now });
  }),
  http.get("/api/seller/orders/:id/vietqr", ({ params }) => {
    const o = db.orders.find((x) => x.id === params.id);
    if (!o) return err(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn");
    return HttpResponse.json({
      payload: "00020101021238540010A00000072701240006970415011001234567890208QRIBFTTA53037045405" + o.total + "5802VN6304ABCD",
      amount: o.total,
      purpose: o.code,
      bank_bin: db.settings.bank_bin,
      bank_account: db.settings.bank_account,
      bank_account_name: db.settings.bank_account_name,
    });
  }),

  http.get("/api/seller/settings", () => guard() ?? HttpResponse.json(db.settings)),
  http.put("/api/seller/settings", async ({ request }) => {
    const body = (await request.json()) as SettingsUpdate;
    db.settings = { ...db.settings, ...body, updated_at: new Date().toISOString() };
    return HttpResponse.json(db.settings);
  }),
  http.get("/api/seller/notifier/status", () =>
    HttpResponse.json({ healthy: true, last_seen_at: new Date().toISOString(), session_ok: true, message: "", failed_last_hour: 0 }),
  ),
];
