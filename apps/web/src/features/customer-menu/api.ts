import { request, requestWithStatus } from "@/shared/api/http";

export type Sweet = "less" | "medium" | "sweet";
export type Ice = "none" | "less" | "normal";
export type OrderingReason = "paused" | "closed" | "inactive";

export interface MenuProduct {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  has_sweet: boolean;
  has_ice: boolean;
  available: boolean;
}

export interface Ordering {
  enabled: boolean;
  reason: OrderingReason | null;
  hours_today: string[];
}

export interface MyOrder {
  id: string;
  code: string;
  status: string;
}

export interface Menu {
  partner: { name: string };
  table_label: string;
  eta_minutes: number;
  ordering: Ordering;
  products: MenuProduct[];
  my_orders: MyOrder[];
  server_time: string;
}

// Data của message menu.updated; `revoked` chỉ có khi mã vừa bị thu hồi.
export interface MenuUpdate {
  products?: MenuProduct[];
  ordering?: Ordering;
  revoked?: boolean;
}

export interface CreateOrderLine {
  product_id: string;
  qty: number;
  sweet?: Sweet;
  ice?: Ice;
}

export interface CreateOrderBody {
  items: CreateOrderLine[];
  note?: string;
  // Không bắt buộc; bỏ trống thì khách không nhận tin trạng thái đơn qua Zalo.
  phone?: string;
}

export interface CreatedOrder {
  id: string;
  code: string;
  status: string;
}

export function getMenu(token: string, signal?: AbortSignal) {
  return request<Menu>(`/api/t/${encodeURIComponent(token)}`, { signal });
}

export function createOrder(token: string, body: CreateOrderBody, idempotencyKey: string) {
  return requestWithStatus<CreatedOrder>(`/api/t/${encodeURIComponent(token)}/orders`, {
    method: "POST",
    body,
    headers: { "Idempotency-Key": idempotencyKey },
  });
}
