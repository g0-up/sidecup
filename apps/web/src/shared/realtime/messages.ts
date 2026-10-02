import { API_ORIGIN } from "@/shared/api/http";

// Mọi message WebSocket có dạng {type, data, server_time} (architecture §5).
export interface WsMessage<T = unknown> {
  type: string;
  data: T;
  server_time: string;
}

export const MSG = {
  orderCreated: "order.created",
  orderUpdated: "order.updated",
  settingsUpdated: "settings.updated",
  notifierStatus: "notifier.status",
  menuUpdated: "menu.updated",
  ping: "ping",
} as const;

// Mã đóng của ứng dụng: không có quyền nghe topic → không thử lại, chỉ còn polling.
export const CLOSE_UNAUTHORIZED = 4401;
export const CLOSE_FORBIDDEN = 4403;

export function wsUrl(path: string, apiOrigin = API_ORIGIN): string {
  if (apiOrigin) return apiOrigin.replace(/^http/, "ws") + path;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}
