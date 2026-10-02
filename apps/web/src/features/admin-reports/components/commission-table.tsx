import { formatRatePercent } from "@/features/admin-partners/format";
import { formatVND } from "@/shared/lib/money";
import { cn } from "@/shared/lib/utils";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import type { CommissionReport } from "../api";
import { formatDayRange } from "../format";

const num = "text-right tabular-nums";

export function CommissionTable({ report }: { report: CommissionReport }) {
  if (report.rows.length === 0) {
    return <p className="text-muted-foreground">Chưa có số liệu trong khoảng thời gian này.</p>;
  }
  const { total } = report;
  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quán</TableHead>
            <TableHead>Kỳ</TableHead>
            <TableHead className="text-right">Đơn thu tiền</TableHead>
            <TableHead className="text-right">Doanh thu</TableHead>
            <TableHead className="text-right">Không giao</TableHead>
            <TableHead className="text-right">Hoa hồng</TableHead>
            <TableHead className="text-right">Điều chỉnh</TableHead>
            <TableHead className="text-right">Phải trả</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {report.rows.map((r) => (
            <TableRow key={`${r.partner_id}-${r.from}`}>
              <TableCell className="font-medium">{r.partner_name}</TableCell>
              <TableCell>{formatDayRange(r.from, r.to)}</TableCell>
              <TableCell className={num}>{r.paid_count}</TableCell>
              <TableCell className={num}>{formatVND(r.revenue)}</TableCell>
              <TableCell className={num}>{r.failed_count}</TableCell>
              <TableCell className={num}>
                {formatVND(r.commission)}
                <span className="block text-xs text-muted-foreground">{formatRatePercent(r.commission_rate)}</span>
              </TableCell>
              <TableCell className={cn(num, r.adjustments_total < 0 && "text-destructive")}>
                {r.adjustments_total === 0 ? "—" : formatVND(r.adjustments_total)}
              </TableCell>
              <TableCell className={cn(num, "font-semibold")}>{formatVND(r.net)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>Tổng</TableCell>
            <TableCell className={num}>{total.paid_count}</TableCell>
            <TableCell className={num}>{formatVND(total.revenue)}</TableCell>
            <TableCell className={num}>{total.failed_count}</TableCell>
            <TableCell className={num}>{formatVND(total.commission)}</TableCell>
            <TableCell className={num}>{total.adjustments_total === 0 ? "—" : formatVND(total.adjustments_total)}</TableCell>
            <TableCell className={num} data-testid="commission-total-net">
              {formatVND(total.net)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
