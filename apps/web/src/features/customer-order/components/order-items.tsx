import { itemOptions } from "@/shared/api/orders";
import { formatVND } from "@/shared/lib/money";
import type { PublicOrder } from "../api";

export function OrderItems({ order }: { order: PublicOrder }) {
  return (
    <section className="rounded-lg border">
      <ul className="divide-y">
        {order.items.map((it, i) => {
          const opts = itemOptions(it);
          return (
            <li key={i} className="flex items-start justify-between gap-3 p-3">
              <div>
                <p className="font-medium">
                  {it.qty} × {it.name}
                </p>
                {opts && <p className="text-sm text-muted-foreground">{opts}</p>}
              </div>
              <span className="tabular-nums">{formatVND(it.line_total)}</span>
            </li>
          );
        })}
      </ul>
      {order.note && <p className="border-t p-3 text-sm text-muted-foreground">Ghi chú: {order.note}</p>}
      {order.recipient_address && (
        <p className="border-t p-3 text-sm text-muted-foreground">Địa chỉ người nhận: {order.recipient_address}</p>
      )}
      <div className="flex justify-between border-t p-3 font-semibold">
        <span>Tổng</span>
        <span className="tabular-nums">{formatVND(order.total)}</span>
      </div>
    </section>
  );
}
