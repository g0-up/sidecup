import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { CUSTOMER_STATUS_LABEL, type OrderStatus } from "@/shared/lib/order-status";
import type { MyOrder } from "../api";

// Quét lại cùng bàn trong ngày thấy lối vào đơn đang chạy (P0-7).
export function MyOrders({ orders }: { orders: MyOrder[] }) {
  if (orders.length === 0) return null;
  return (
    <section aria-label="Đơn của bạn hôm nay" className="mx-4 mb-3 rounded-lg border bg-secondary/60">
      <p className="px-4 pt-3 text-sm font-medium">Đơn của bạn hôm nay</p>
      <ul>
        {orders.map((o) => (
          <li key={o.id}>
            <Link to={`/o/${o.id}`} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>
                <span className="font-mono font-semibold">#{o.code}</span>
                <span className="ml-2 text-muted-foreground">
                  {CUSTOMER_STATUS_LABEL[o.status as OrderStatus] ?? o.status}
                </span>
              </span>
              <ChevronRight className="size-4" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
