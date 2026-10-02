import { formatVND } from "@/shared/lib/money";
import { formatDate, formatTime } from "@/shared/lib/time";
import { cn } from "@/shared/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import type { Adjustment } from "../api";

export function AdjustmentList({ items }: { items: Adjustment[] }) {
  if (items.length === 0) return <p className="text-muted-foreground">Chưa có điều chỉnh nào.</p>;
  return (
    <div className="rounded-lg border bg-background">
      <Table>
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
            <TableRow key={a.id}>
              <TableCell className="tabular-nums">
                {formatDate(a.created_at)} {formatTime(a.created_at)}
              </TableCell>
              <TableCell>{a.partner_name}</TableCell>
              <TableCell className={cn("text-right tabular-nums", a.amount < 0 && "text-destructive")}>
                {a.amount > 0 ? "+" : ""}
                {formatVND(a.amount)}
              </TableCell>
              <TableCell className="min-w-48 whitespace-normal">{a.reason}</TableCell>
              <TableCell className="font-mono text-xs">{a.order_code ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
