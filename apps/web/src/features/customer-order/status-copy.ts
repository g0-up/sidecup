import { CUSTOMER_STATUS_LABEL, type OrderStatus } from "@/shared/lib/order-status";
import { formatTime } from "@/shared/lib/time";
import type { PublicOrder } from "./api";

type CopyInput = Pick<PublicOrder, "status" | "accepted_at" | "eta_minutes">;

// statusHeadline: câu lớn đầu trang đơn. Giờ dự kiến = lúc quán nhận + ETA, theo giờ Sài Gòn;
// quá giờ đó (so với giờ server ước lượng) thì không hứa một giờ đã qua.
// Đơn đã đóng dùng nhãn trạng thái ngắn; lời giải thích nằm trong ClosedNotice.
export function statusHeadline(order: CopyInput, serverNowMs: number): string {
  switch (order.status as OrderStatus) {
    case "sent":
      return "Đã gửi đơn, chờ quán xác nhận";
    case "accepted": {
      if (!order.accepted_at) return "Quán đang pha nước cho bạn";
      const dueMs = Date.parse(order.accepted_at) + order.eta_minutes * 60_000;
      if (dueMs <= serverNowMs) return "Quán đang pha, sắp xong";
      return `Quán đang pha, nước tới khoảng ${formatTime(new Date(dueMs).toISOString())}`;
    }
    case "delivering":
      return "Nước đang được mang ra bàn";
    case "paid":
      return "Cảm ơn bạn! Chúc ngon miệng";
    default:
      return CUSTOMER_STATUS_LABEL[order.status as OrderStatus] ?? order.status;
  }
}
