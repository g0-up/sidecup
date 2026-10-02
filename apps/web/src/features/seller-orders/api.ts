import { query, request } from "@/shared/api/http";
import type { SellerOrder } from "@/shared/api/orders";
import type { OrderStatus } from "@/shared/lib/order-status";

export interface OrderList {
  orders: SellerOrder[];
  server_time: string;
}

export type SellerOrderResponse = SellerOrder & { server_time: string };

export function listOrders(params: { scope?: "open" | "closed"; updatedAfter?: string }) {
  return request<OrderList>(`/api/seller/orders${query({ scope: params.scope, updated_after: params.updatedAfter })}`);
}

export function getOrder(id: string) {
  return request<SellerOrderResponse>(`/api/seller/orders/${encodeURIComponent(id)}`);
}

export interface TransitionBody {
  to: OrderStatus;
  expected_from: OrderStatus;
  payment_method?: "cash" | "transfer";
  reason?: string;
}

export function transition(id: string, body: TransitionBody) {
  return request<SellerOrderResponse>(`/api/seller/orders/${encodeURIComponent(id)}/transition`, { method: "POST", body });
}

export interface VietQR {
  payload: string;
  amount: number;
  purpose: string;
  bank_bin: string;
  bank_account: string;
  bank_account_name: string;
}

export function getVietQR(id: string) {
  return request<VietQR>(`/api/seller/orders/${encodeURIComponent(id)}/vietqr`);
}

export interface NotifierStatus {
  healthy: boolean;
  last_seen_at: string | null;
  session_ok: boolean;
  message: string;
  failed_last_hour: number;
}

export const notifierKey = ["seller", "notifier"] as const;

export function getNotifierStatus() {
  return request<NotifierStatus>("/api/seller/notifier/status");
}

export function notifierAlert(s: NotifierStatus | undefined): boolean {
  return !!s && (!s.healthy || s.failed_last_hour > 0);
}
