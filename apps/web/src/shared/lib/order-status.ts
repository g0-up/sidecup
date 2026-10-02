export type OrderStatus = "sent" | "accepted" | "delivering" | "paid" | "rejected" | "cancelled" | "failed";

export const OPEN_STATUSES: OrderStatus[] = ["sent", "accepted", "delivering"];

export function isOpen(status: string): boolean {
  return (OPEN_STATUSES as string[]).includes(status);
}

// Nhãn phía khách (thanh 4 bước) và phía người bán (cột bảng đơn).
export const CUSTOMER_STATUS_LABEL: Record<OrderStatus, string> = {
  sent: "Đã gửi",
  accepted: "Quán đã nhận, đang pha",
  delivering: "Đang mang ra",
  paid: "Đã nhận nước",
  rejected: "Quán từ chối",
  cancelled: "Đã huỷ",
  failed: "Không giao được",
};

export const SELLER_STATUS_LABEL: Record<OrderStatus, string> = {
  sent: "Đã gửi",
  accepted: "Đang pha",
  delivering: "Đang mang ra",
  paid: "Đã thu tiền",
  rejected: "Đã từ chối",
  cancelled: "Đã huỷ",
  failed: "Không gặp khách",
};

export function cancelReasonLabel(reason: string | null | undefined): string {
  switch (reason) {
    case "customer":
      return "Khách huỷ";
    case "timeout":
      return "Quá 5 phút chưa nhận";
    case "seller_rejected":
      return "Người bán từ chối";
    case "customer_not_found":
      return "Không gặp khách";
    case null:
    case undefined:
    case "":
      return "";
    default:
      return reason;
  }
}
