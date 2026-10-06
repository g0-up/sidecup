import { http, HttpResponse, type HttpHandler } from "msw";
import type { Partner, PartnerInput, QrCode } from "@/features/admin-partners/api";
import type { Product, ProductInput } from "@/features/admin-products/api";
import type { Adjustment, AdjustmentInput, CommissionLine, FunnelLine } from "@/features/admin-reports/api";
import { addDays, todayISO } from "@/features/admin-reports/period";
import { formatVND } from "@/shared/lib/money";
import { db, MOCK_TOKEN } from "./db";

// Endpoint quản trị (món, quán, bàn/QR, báo cáo) cho MSW. State riêng của file này; món khởi tạo từ db.products (chỉ đọc).

const err = (status: number, code: string, message: string, details?: Record<string, unknown>) =>
  HttpResponse.json({ error: { code, message, details } }, { status });

const invalid = (fields: Record<string, string>) => err(422, "VALIDATION", "Dữ liệu chưa hợp lệ", { fields });

interface AdminState {
  products: Product[];
  partners: Partner[];
  qrcodes: (QrCode & { partner_id: string })[];
  adjustments: Adjustment[];
}

const MOCK_PARTNER_ID = "00000000-0000-4000-8000-000000000001";

function fresh(): AdminState {
  const now = new Date().toISOString();
  return {
    products: db.products.map((p, i) => ({ ...p, sort: (i + 1) * 10, created_at: now, updated_at: now })),
    partners: [
      {
        id: MOCK_PARTNER_ID,
        name: "Quán test",
        commission_rate: 0.1,
        payout_period: "week",
        open_hours: [{ days: [1, 2, 3, 4, 5, 6, 7], from: "00:00", to: "23:59" }],
        active: true,
        hidden_product_ids: [],
        created_at: now,
        updated_at: now,
      },
    ],
    qrcodes: [
      {
        partner_id: MOCK_PARTNER_ID,
        token: MOCK_TOKEN,
        url: `${location.origin}/t/${MOCK_TOKEN}`,
        table_label: "Bàn 1",
        active: true,
        created_at: now,
        revoked_at: null,
      },
    ],
    adjustments: [],
  };
}

let state = fresh();

export function resetAdminMock() {
  state = fresh();
}

const newId = () => crypto.randomUUID();
const newToken = () => Math.random().toString(36).slice(2, 12).toUpperCase().padEnd(10, "X");
const view = ({ partner_id: _p, ...q }: AdminState["qrcodes"][number]): QrCode => q;

function weekRange(which: string): { from: string; to: string } {
  const today = todayISO();
  const iso = new Date(`${today}T00:00:00Z`).getUTCDay() || 7;
  const from = addDays(today, -(iso - 1) - (which === "previous" ? 7 : 0));
  return { from, to: addDays(from, 6) };
}

function commissionRows(url: URL): CommissionLine[] {
  const partnerId = url.searchParams.get("partner_id");
  const period = url.searchParams.get("period");
  const partners = state.partners.filter((p) => !partnerId || p.id === partnerId);
  return partners.map((p) => {
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const range = !period && from && to ? { from, to } : weekRange(period ?? "current");
    const adj = state.adjustments.filter((a) => a.partner_id === p.id);
    const adjustments_total = adj.reduce((s, a) => s + a.amount, 0);
    return {
      partner_id: p.id,
      partner_name: p.name,
      commission_rate: p.commission_rate,
      payout_period: p.payout_period,
      ...range,
      paid_count: 0,
      revenue: 0,
      failed_count: 0,
      commission: 0,
      adjustments_total,
      adjustments_count: adj.length,
      net: adjustments_total,
    };
  });
}

export const adminHandlers: HttpHandler[] = [
  http.get("/api/seller/products", () => HttpResponse.json({ products: state.products })),
  http.post("/api/seller/products", async ({ request }) => {
    const body = (await request.json()) as ProductInput;
    if (!body.name?.trim()) return invalid({ name: "Không được để trống" });
    const now = new Date().toISOString();
    const p: Product = { id: newId(), available: true, ...body, created_at: now, updated_at: now };
    state.products.push(p);
    return HttpResponse.json(p, { status: 201 });
  }),
  // Ảnh tải lên: dev mock không có kho ảnh nên trả về một ảnh mẫu https.
  http.post("/api/seller/products/images", async ({ request }) => {
    const file = (await request.formData()).get("file");
    if (!(file instanceof Blob) || file.size === 0) return invalid({ file: "Chọn ảnh" });
    return HttpResponse.json({ url: `https://picsum.photos/seed/${newId()}/600/600.webp` }, { status: 201 });
  }),
  http.put("/api/seller/products/:id", async ({ params, request }) => {
    const p = state.products.find((x) => x.id === params.id);
    if (!p) return err(404, "PRODUCT_NOT_FOUND", "Không tìm thấy món");
    const body = (await request.json()) as ProductInput;
    if (!body.name?.trim()) return invalid({ name: "Không được để trống" });
    Object.assign(p, body, { updated_at: new Date().toISOString() });
    return HttpResponse.json(p);
  }),
  http.patch("/api/seller/products/:id/availability", async ({ params, request }) => {
    const p = state.products.find((x) => x.id === params.id);
    if (!p) return err(404, "PRODUCT_NOT_FOUND", "Không tìm thấy món");
    const { available } = (await request.json()) as { available: boolean };
    Object.assign(p, { available, updated_at: new Date().toISOString() });
    return HttpResponse.json(p);
  }),

  http.get("/api/seller/partners", () => HttpResponse.json({ partners: state.partners })),
  http.get("/api/seller/partners/:id", ({ params }) => {
    const p = state.partners.find((x) => x.id === params.id);
    return p ? HttpResponse.json(p) : err(404, "PARTNER_NOT_FOUND", "Không tìm thấy quán");
  }),
  http.post("/api/seller/partners", async ({ request }) => {
    const body = (await request.json()) as PartnerInput;
    if (!body.name?.trim()) return invalid({ name: "Không được để trống" });
    const now = new Date().toISOString();
    const p: Partner = { id: newId(), ...body, created_at: now, updated_at: now };
    state.partners.push(p);
    return HttpResponse.json(p, { status: 201 });
  }),
  http.put("/api/seller/partners/:id", async ({ params, request }) => {
    const p = state.partners.find((x) => x.id === params.id);
    if (!p) return err(404, "PARTNER_NOT_FOUND", "Không tìm thấy quán");
    const body = (await request.json()) as PartnerInput;
    if (!body.name?.trim()) return invalid({ name: "Không được để trống" });
    Object.assign(p, body, { updated_at: new Date().toISOString() });
    return HttpResponse.json(p);
  }),

  http.get("/api/seller/partners/:id/qrcodes", ({ params }) => {
    if (!state.partners.some((p) => p.id === params.id)) return err(404, "PARTNER_NOT_FOUND", "Không tìm thấy quán");
    const list = state.qrcodes.filter((q) => q.partner_id === params.id).sort((a, b) => Number(b.active) - Number(a.active));
    return HttpResponse.json({ qrcodes: list.map(view) });
  }),
  http.post("/api/seller/partners/:id/qrcodes", async ({ params, request }) => {
    if (!state.partners.some((p) => p.id === params.id)) return err(404, "PARTNER_NOT_FOUND", "Không tìm thấy quán");
    const { table_label } = (await request.json()) as { table_label: string };
    if (!table_label?.trim()) return invalid({ table_label: "Không được để trống" });
    const token = newToken();
    const q = {
      partner_id: String(params.id),
      token,
      url: `${location.origin}/t/${token}`,
      table_label: table_label.trim(),
      active: true,
      created_at: new Date().toISOString(),
      revoked_at: null,
    };
    state.qrcodes.push(q);
    return HttpResponse.json(view(q), { status: 201 });
  }),
  http.post("/api/seller/qrcodes/:token/revoke", ({ params }) => {
    const q = state.qrcodes.find((x) => x.token === params.token);
    if (!q) return err(404, "QR_NOT_FOUND", "Không tìm thấy mã QR");
    q.active = false;
    q.revoked_at ??= new Date().toISOString();
    return HttpResponse.json(view(q));
  }),

  http.get("/api/seller/reports/commission", ({ request }) => {
    const rows = commissionRows(new URL(request.url));
    const total = rows.reduce(
      (t, r) => ({
        paid_count: t.paid_count + r.paid_count,
        revenue: t.revenue + r.revenue,
        failed_count: t.failed_count + r.failed_count,
        commission: t.commission + r.commission,
        adjustments_total: t.adjustments_total + r.adjustments_total,
        net: t.net + r.net,
      }),
      { paid_count: 0, revenue: 0, failed_count: 0, commission: 0, adjustments_total: 0, net: 0 },
    );
    return HttpResponse.json({ rows, total });
  }),
  http.get("/api/seller/reports/commission/export", ({ request }) => {
    const url = new URL(request.url);
    if (!url.searchParams.get("partner_id")) return invalid({ partner_id: "Chọn một quán để xuất báo cáo" });
    const [r] = commissionRows(url);
    if (!r) return err(404, "PARTNER_NOT_FOUND", "Không tìm thấy quán");
    const text = [
      `Hoa hồng ${r.partner_name}: ${r.from} – ${r.to}`,
      `Đơn thu tiền: ${r.paid_count}`,
      `Doanh thu: ${formatVND(r.revenue)}`,
      `Hoa hồng: ${formatVND(r.commission)}`,
      `Điều chỉnh: ${formatVND(r.adjustments_total)}`,
      `Phải trả: ${formatVND(r.net)}`,
    ].join("\n");
    return new HttpResponse(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }),
  http.get("/api/seller/reports/funnel", ({ request }) => {
    const url = new URL(request.url);
    const to = url.searchParams.get("to") || todayISO();
    const from = url.searchParams.get("from") || addDays(to, -6);
    const partnerId = url.searchParams.get("partner_id");
    const rows: FunnelLine[] = [];
    for (const p of state.partners.filter((x) => !partnerId || x.id === partnerId)) {
      for (let d = from; d <= to; d = addDays(d, 1)) {
        rows.push({ partner_id: p.id, partner_name: p.name, day: d, views: 0, orders: 0, paid: 0 });
      }
    }
    return HttpResponse.json({ from, to, rows });
  }),
  http.get("/api/seller/adjustments", ({ request }) => {
    const partnerId = new URL(request.url).searchParams.get("partner_id");
    const list = state.adjustments.filter((a) => !partnerId || a.partner_id === partnerId);
    return HttpResponse.json({ adjustments: [...list].reverse() });
  }),
  http.post("/api/seller/adjustments", async ({ request }) => {
    const body = (await request.json()) as AdjustmentInput;
    const p = state.partners.find((x) => x.id === body.partner_id);
    if (!p) return err(404, "PARTNER_NOT_FOUND", "Không tìm thấy quán");
    if (!body.amount) return invalid({ amount: "Không được bằng 0" });
    if (!body.reason?.trim()) return invalid({ reason: "Không được để trống" });
    const a: Adjustment = {
      id: newId(),
      partner_id: p.id,
      partner_name: p.name,
      order_id: null,
      order_code: body.order_code?.toUpperCase() || null,
      amount: body.amount,
      reason: body.reason.trim(),
      created_by: "seller",
      created_at: new Date().toISOString(),
    };
    state.adjustments.push(a);
    return HttpResponse.json(a, { status: 201 });
  }),
];
