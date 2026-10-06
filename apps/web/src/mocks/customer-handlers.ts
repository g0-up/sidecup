import { http, HttpResponse } from "msw";
import type { CreateOrderBody } from "@/features/customer-menu/api";
import type { PublicOrder, SellerOrder } from "@/shared/api/orders";
import { db, mockMenu, MOCK_TOKEN } from "./db";

const err = (status: number, code: string, message: string, details?: Record<string, unknown>) =>
  HttpResponse.json({ error: { code, message, details } }, { status });

// Mock coi Zalo luôn gửi được: có SĐT là khách nhận tin.
function publicView(o: SellerOrder): PublicOrder {
  const { customer_phone, commission_rate: _r, commission_amount: _a, partner_id: _pi, qr_token: _q, ...pub } = o;
  delete (pub as { client_id?: string }).client_id;
  return { ...pub, eta_minutes: db.settings.eta_minutes, notify_zalo: customer_phone !== null };
}

export const customerHandlers = [
  http.get("/api/t/:token", ({ params, request }) => {
    if (params.token !== MOCK_TOKEN) return err(404, "QR_NOT_FOUND", "Không tìm thấy mã này");
    if (db.revokedTokens.has(String(params.token))) return err(410, "QR_REVOKED", "Mã này không còn dùng");
    return HttpResponse.json(mockMenu(request.headers.get("X-Client-Id") ?? ""));
  }),

  http.post("/api/t/:token/orders", async ({ params, request }) => {
    const key = request.headers.get("Idempotency-Key");
    const clientId = request.headers.get("X-Client-Id") ?? "";
    if (!key) return err(400, "IDEMPOTENCY_KEY_REQUIRED", "Thiếu mã chống trùng đơn");
    const existing = db.idempotency.get(key);
    if (existing) {
      const o = db.orders.find((x) => x.id === existing)!;
      return HttpResponse.json({ ...publicView(o), server_time: new Date().toISOString() }, { status: 200 });
    }
    if (db.revokedTokens.has(String(params.token))) return err(409, "QR_REVOKED", "Mã này không còn dùng");
    if (!db.settings.accepting_orders) return err(409, "PAUSED", "Quán tạm ngưng nhận đơn");
    const body = (await request.json()) as CreateOrderBody;
    if (body.phone && !/^0\d{9}$/.test(body.phone)) {
      return err(422, "VALIDATION", "Dữ liệu chưa hợp lệ", { fields: { phone: "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0" } });
    }
    const unavailable = body.items
      .filter((l) => !db.products.find((p) => p.id === l.product_id)?.available)
      .map((l) => l.product_id);
    if (unavailable.length > 0) {
      return err(409, "PRODUCT_UNAVAILABLE", "Có món vừa hết, vui lòng bỏ khỏi giỏ", { product_ids: unavailable });
    }
    const now = new Date().toISOString();
    const items = body.items.map((l) => {
      const p = db.products.find((x) => x.id === l.product_id)!;
      return {
        product_id: p.id,
        name: p.name,
        unit_price: p.price,
        qty: l.qty,
        sweet: p.has_sweet ? (l.sweet ?? "medium") : null,
        ice: p.has_ice ? (l.ice ?? "normal") : null,
        line_total: p.price * l.qty,
      };
    });
    const order: SellerOrder & { client_id: string } = {
      id: crypto.randomUUID(),
      code: Math.random().toString(36).slice(2, 8).toUpperCase(),
      status: "sent",
      items,
      note: body.note ?? null,
      recipient_address: body.recipient_address ?? null,
      total: items.reduce((s, i) => s + i.line_total, 0),
      partner_name: "Quán test",
      table_label: "Bàn 1",
      cancel_reason: null,
      payment_method: null,
      created_at: now,
      accepted_at: null,
      delivering_at: null,
      paid_at: null,
      closed_at: null,
      updated_at: now,
      partner_id: "partner-1",
      qr_token: String(params.token),
      menu_path: `/t/${encodeURIComponent(String(params.token))}`,
      customer_phone: body.phone || null,
      commission_rate: null,
      commission_amount: null,
      client_id: clientId,
    };
    db.orders.push(order);
    db.idempotency.set(key, order.id);
    return HttpResponse.json({ ...publicView(order), server_time: now }, { status: 201 });
  }),

  http.get("/api/orders/:id", ({ params }) => {
    const o = db.orders.find((x) => x.id === params.id);
    if (!o) return err(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn");
    return HttpResponse.json({ ...publicView(o), server_time: new Date().toISOString() });
  }),

  http.post("/api/orders/:id/cancel", ({ params }) => {
    const o = db.orders.find((x) => x.id === params.id);
    if (!o) return err(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn");
    if (o.status !== "sent") {
      return err(409, "INVALID_TRANSITION", "Đơn đã đổi trạng thái", { current_status: o.status });
    }
    const now = new Date().toISOString();
    Object.assign(o, { status: "cancelled", cancel_reason: "customer", closed_at: now, updated_at: now });
    return HttpResponse.json({ ...publicView(o), server_time: now });
  }),
];
