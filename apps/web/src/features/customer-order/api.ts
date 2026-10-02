import { request } from "@/shared/api/http";
import type { PublicOrder } from "@/shared/api/orders";

export type { PublicOrder } from "@/shared/api/orders";

export interface OrderResponse extends PublicOrder {
  server_time: string;
}

export function getOrder(id: string, signal?: AbortSignal) {
  return request<OrderResponse>(`/api/orders/${encodeURIComponent(id)}`, { signal });
}

export function cancelOrder(id: string) {
  return request<OrderResponse>(`/api/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" });
}
