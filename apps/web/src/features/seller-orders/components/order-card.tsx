import { Phone } from "lucide-react";
import { Link } from "react-router";
import { itemOptions, type SellerOrder } from "@/shared/api/orders";
import { useNow } from "@/shared/hooks/use-now";
import { formatVND } from "@/shared/lib/money";
import { cancelReasonLabel, isOpen, SELLER_STATUS_LABEL } from "@/shared/lib/order-status";
import { elapsedMs, formatElapsed, formatTime, type ServerClock } from "@/shared/lib/time";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { isLate } from "../store";
import { OrderActions } from "./order-actions";

interface Props {
  order: SellerOrder;
  clock: ServerClock | null;
  unseen?: boolean;
  onSeen?: () => void;
  linkToDetail?: boolean;
}

export function OrderCard({ order, clock, unseen, onSeen, linkToDetail = true }: Props) {
  const now = useNow(1000);
  const open = isOpen(order.status);
  const elapsed = clock ? elapsedMs(order.created_at, clock, now) : 0;
  const late = isLate(order, clock, now);

  return (
    // Chạm hoặc đưa focus bàn phím vào thẻ đều tính là đã xem.
    <article
      onClick={onSeen}
      onFocus={onSeen}
      className={cn(
        "space-y-3 rounded-xl border bg-card p-4 shadow-sm",
        late && "border-2 border-warning",
        unseen && "ring-2 ring-primary",
      )}
      aria-label={`Đơn ${order.code}`}
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-2">
            {linkToDetail ? (
              <Link to={`/seller/orders/${order.id}`} className="-my-2 inline-flex min-h-11 items-center font-mono text-lg font-semibold">
                #{order.code}
              </Link>
            ) : (
              <span className="font-mono text-lg font-semibold">#{order.code}</span>
            )}
            {unseen && <Badge>Mới</Badge>}
          </p>
          <p className="text-sm font-medium">
            {order.partner_name} · {order.table_label}
          </p>
        </div>
        <div className="text-right text-sm">
          {open ? (
            <p className={cn("tabular-nums", late && "font-semibold text-destructive")}>{formatElapsed(elapsed)}</p>
          ) : (
            <Badge variant={order.status === "paid" ? "secondary" : "outline"}>{SELLER_STATUS_LABEL[order.status]}</Badge>
          )}
          <p className="text-muted-foreground">{formatTime(order.created_at)}</p>
        </div>
      </header>

      <ul className="space-y-1">
        {order.items.map((it, i) => (
          <li key={i}>
            <span className="font-semibold">{it.qty} ×</span> {it.name}
            {itemOptions(it) && <span className="text-sm text-muted-foreground"> — {itemOptions(it)}</span>}
          </li>
        ))}
      </ul>
      {order.note && <p className="rounded-md bg-secondary px-3 py-2 text-sm">Ghi chú: {order.note}</p>}
      {order.recipient_address && (
        <p className="rounded-md bg-secondary px-3 py-2 text-sm">Địa chỉ người nhận: {order.recipient_address}</p>
      )}

      <div className="flex items-center justify-between">
        <span className="text-lg font-semibold tabular-nums">{formatVND(order.total)}</span>
        {order.customer_phone && (
          <a
            href={`tel:${order.customer_phone}`}
            onClick={(e) => e.stopPropagation()}
            className="-mr-2 inline-flex min-h-11 items-center gap-1 px-2 text-sm font-medium text-primary"
          >
            <Phone className="size-4" aria-hidden /> {order.customer_phone}
          </a>
        )}
      </div>

      {!open && (order.cancel_reason || order.payment_method) && (
        <p className="text-sm text-muted-foreground">
          {order.payment_method === "cash" && "Tiền mặt"}
          {order.payment_method === "transfer" && "Chuyển khoản"}
          {cancelReasonLabel(order.cancel_reason)}
        </p>
      )}
      <OrderActions order={order} />
    </article>
  );
}
