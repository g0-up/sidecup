import { formatVND } from "@/shared/lib/money";
import { formatDate, formatTime } from "@/shared/lib/time";
import { cn } from "@/shared/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import type { Adjustment } from "../api";

export function AdjustmentList({ items }: { items: Adjustment[] }) {
  // Dưới sm: thời gian và số tiền trên cùng, quán và mã đơn ở giữa, lý do xuống dòng cuối.
  if (items.length === 0) return <p className="text-muted-foreground">Chưa có điều chỉnh nào.</p>;
  return (
    <div className="rounded-lg border bg-background">
      <Table stacked>
        <TableHeader>
          <TableRow>
            <TableHead>Thời gian</TableHead>
            <TableHead>Quán</TableHead>
            <TableHead className="text-right">Số tiền</TableHead>
            <TableHead>Lý do</TableHead>
            <TableHead>Mã đơn</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((a) => (
            <TableRow key={a.id} className="max-sm:grid-cols-[minmax(0,1fr)_auto]">
              <TableCell className="tabular-nums max-sm:col-start-1 max-sm:row-start-1 max-sm:text-xs max-sm:text-muted-foreground">
                {formatDate(a.created_at)} {formatTime(a.created_at)}
              </TableCell>
              <TableCell className="max-sm:col-start-1 max-sm:row-start-2 max-sm:font-medium">{a.partner_name}</TableCell>
              <TableCell
                className={cn(
                  "text-right tabular-nums max-sm:col-start-2 max-sm:row-start-1 max-sm:font-semibold",
                  a.amount < 0 && "text-destructive",
                )}
              >
                {a.amount > 0 ? "+" : ""}
                {formatVND(a.amount)}
              </TableCell>
              <TableCell className="min-w-48 whitespace-normal max-sm:col-span-2 max-sm:row-start-3 max-sm:min-w-0">{a.reason}</TableCell>
              <TableCell className="font-mono text-xs max-sm:col-start-2 max-sm:row-start-2 max-sm:text-right">{a.order_code ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
