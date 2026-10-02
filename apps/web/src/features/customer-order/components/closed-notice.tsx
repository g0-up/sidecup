import type { PublicOrder } from "../api";

const MESSAGES: Record<string, { title: string; body: string }> = {
  rejected: { title: "Quán từ chối đơn", body: "Người bán không nhận được đơn lúc này. Bạn chưa phải trả tiền." },
  failed: { title: "Không giao được", body: "Người bán không tìm thấy bạn tại bàn. Bạn chưa phải trả tiền." },
};

export function ClosedNotice({ order }: { order: PublicOrder }) {
  let msg = MESSAGES[order.status];
  if (order.status === "cancelled") {
    msg =
      order.cancel_reason === "timeout"
        ? { title: "Đơn đã tự huỷ", body: "Quán chưa xác nhận sau 5 phút nên đơn được huỷ. Bạn chưa phải trả tiền." }
        : { title: "Bạn đã huỷ đơn", body: "Đơn đã được huỷ. Bạn có thể đặt lại từ menu." };
  }
  if (!msg) return null;
  return (
    <div role="status" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
      <p className="font-semibold">{msg.title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{msg.body}</p>
    </div>
  );
}
