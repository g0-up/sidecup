import type { SellerOrder } from "@/shared/api/orders";
import { isOpen, type OrderStatus } from "@/shared/lib/order-status";
import { elapsedMs, serverClock, type ServerClock } from "@/shared/lib/time";
import { MSG, type WsMessage } from "@/shared/realtime/messages";

export interface BoardState {
  orders: Record<string, SellerOrder>;
  // Mốc server_time của lần tải REST gần nhất; resync sau reconnect hỏi `updated_after` từ mốc này.
  lastServerTime: string | null;
  clock: ServerClock | null;
  // Đơn `sent` mới chưa xem → chuông + nhấp nháy tiêu đề. Lần tải đầu không tính.
  unseen: string[];
  loaded: boolean;
}

export const initialBoard: BoardState = { orders: {}, lastServerTime: null, clock: null, unseen: [], loaded: false };

export type BoardAction =
  | { type: "loaded"; orders: SellerOrder[]; serverTime: string; initial: boolean }
  | { type: "message"; msg: WsMessage }
  | { type: "upsert"; order: SellerOrder; serverTime?: string }
  // merge: gộp danh sách phụ (tab đã đóng) mà không dời mốc resync.
  | { type: "merge"; orders: SellerOrder[] }
  | { type: "seen"; ids?: string[] };

// upsert bỏ qua bản cũ hơn bản đang có (message WS và resync REST có thể tới lệch thứ tự).
function upsert(state: BoardState, order: SellerOrder, alertIfNew: boolean): BoardState {
  const prev = state.orders[order.id];
  if (prev && Date.parse(prev.updated_at) > Date.parse(order.updated_at)) return state;
  let unseen = state.unseen;
  if (!prev && alertIfNew && order.status === "sent" && !unseen.includes(order.id)) unseen = [...unseen, order.id];
  if (order.status !== "sent" && unseen.includes(order.id)) unseen = unseen.filter((id) => id !== order.id);
  return { ...state, orders: { ...state.orders, [order.id]: order }, unseen };
}

export function boardReducer(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case "loaded": {
      let next: BoardState = {
        ...state,
        loaded: true,
        lastServerTime: action.serverTime,
        clock: serverClock(action.serverTime),
      };
      for (const o of action.orders) next = upsert(next, o, !action.initial);
      return next;
    }
    case "message": {
      const { msg } = action;
      if (msg.type !== MSG.orderCreated && msg.type !== MSG.orderUpdated) return state;
      const next = upsert(state, msg.data as SellerOrder, true);
      return next === state ? state : { ...next, clock: serverClock(msg.server_time) };
    }
    case "upsert": {
      const next = upsert(state, action.order, false);
      return action.serverTime ? { ...next, clock: serverClock(action.serverTime) } : next;
    }
    case "merge":
      return action.orders.reduce((acc, o) => upsert(acc, o, false), state);
    case "seen":
      return { ...state, unseen: action.ids ? state.unseen.filter((id) => !action.ids!.includes(id)) : [] };
  }
}

const byCreated = (a: SellerOrder, b: SellerOrder) => Date.parse(a.created_at) - Date.parse(b.created_at);

export function openColumns(state: BoardState): Record<"sent" | "accepted" | "delivering", SellerOrder[]> {
  const cols = { sent: [] as SellerOrder[], accepted: [] as SellerOrder[], delivering: [] as SellerOrder[] };
  for (const o of Object.values(state.orders)) {
    if (o.status === "sent" || o.status === "accepted" || o.status === "delivering") cols[o.status].push(o);
  }
  cols.sent.sort(byCreated);
  cols.accepted.sort(byCreated);
  cols.delivering.sort(byCreated);
  return cols;
}

// closedSince: đơn đã đóng từ mốc `since` (đầu ngày theo giờ Việt Nam), mới nhất trước.
export function closedSince(state: BoardState, since: number): SellerOrder[] {
  return Object.values(state.orders)
    .filter((o) => !isOpen(o.status) && o.closed_at && Date.parse(o.closed_at) >= since)
    .sort((a, b) => Date.parse(b.closed_at!) - Date.parse(a.closed_at!));
}

// Đơn chờ nhận quá 60 giây: khách đang thấy cảnh báo "Quán chưa xác nhận".
export const LATE_MS = 60_000;

export function isLate(order: SellerOrder, clock: ServerClock | null, now: number): boolean {
  return order.status === "sent" && clock !== null && elapsedMs(order.created_at, clock, now) >= LATE_MS;
}

// startOfDayVN trả mốc 00:00 Asia/Ho_Chi_Minh (UTC+7, không có giờ mùa hè) của thời điểm ms.
export function startOfDayVN(ms: number): number {
  const offset = 7 * 3600_000;
  return Math.floor((ms + offset) / 86400_000) * 86400_000 - offset;
}

// Nút theo từng bước (P0-6). `confirm`: không có đường quay lại → hỏi lại một lần.
export interface ActionSpec {
  to: OrderStatus;
  label: string;
  variant: "default" | "outline";
  // danger: bước không quay lại được; nút đầu viền + chữ đỏ, nền đỏ chỉ ở bước xác nhận.
  danger?: boolean;
  payment?: "cash" | "transfer";
  confirm?: string;
  vietqr?: boolean;
}

export function actionsFor(status: OrderStatus): ActionSpec[] {
  switch (status) {
    case "sent":
      return [
        { to: "accepted", label: "Nhận đơn", variant: "default" },
        { to: "rejected", label: "Từ chối", variant: "outline", danger: true, confirm: "Từ chối đơn này? Khách sẽ nhận tin quán từ chối." },
      ];
    case "accepted":
      return [{ to: "delivering", label: "Mang ra bàn", variant: "default" }];
    case "delivering":
      return [
        { to: "paid", label: "Thu tiền mặt", variant: "default", payment: "cash" },
        { to: "paid", label: "Chuyển khoản", variant: "outline", payment: "transfer", vietqr: true },
        {
          to: "failed",
          label: "Không gặp khách",
          variant: "outline",
          danger: true,
          confirm: "Đánh dấu không gặp khách? Đơn sẽ đóng và không quay lại được.",
        },
      ];
    default:
      return [];
  }
}
