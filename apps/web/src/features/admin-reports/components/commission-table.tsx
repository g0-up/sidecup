import { formatRatePercent } from "@/features/admin-partners/format";
import { formatVND } from "@/shared/lib/money";
import { cn } from "@/shared/lib/utils";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import type { CommissionReport } from "../api";
import { formatDayRange } from "../format";

const num = "text-right tabular-nums max-sm:text-left";
// Dưới sm mỗi quán là một khối: tên, kỳ, "Phải trả" cỡ lớn, rồi các số khác thành hai cột có nhãn.
const row = "max-sm:grid-cols-2";
const head = "max-sm:col-span-2 max-sm:row-start-1";
const net = "max-sm:col-span-2 max-sm:row-start-3 max-sm:text-xl";

function Label({ children }: { children: string }) {
  return <span className="block text-xs font-normal text-muted-foreground sm:hidden">{children}</span>;
}

export function CommissionTable({ report }: { report: CommissionReport }) {
  if (report.rows.length === 0) {
    return <p className="text-muted-foreground">Chưa có số liệu trong khoảng thời gian này.</p>;
  }
  const { total } = report;
  return (
    <div className="rounded-lg border bg-background">
      <Table stacked className="max-lg:[&_th]:whitespace-normal">
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
            <TableRow key={`${r.partner_id}-${r.from}`} className={row}>
              <TableCell className={cn(head, "font-medium")}>{r.partner_name}</TableCell>
              <TableCell className="max-lg:whitespace-normal max-sm:col-span-2 max-sm:row-start-2 max-sm:text-sm max-sm:text-muted-foreground">
                {formatDayRange(r.from, r.to)}
              </TableCell>
              <TableCell className={num}>
                <Label>Đơn thu tiền</Label>
                {r.paid_count}
              </TableCell>
              <TableCell className={num}>
                <Label>Doanh thu</Label>
                {formatVND(r.revenue)}
              </TableCell>
              <TableCell className={num}>
                <Label>Không giao</Label>
                {r.failed_count}
              </TableCell>
              <TableCell className={num}>
                <Label>Hoa hồng</Label>
                {formatVND(r.commission)}
                <span className="block text-xs text-muted-foreground">{formatRatePercent(r.commission_rate)}</span>
              </TableCell>
              <TableCell className={cn(num, r.adjustments_total < 0 && "text-destructive")}>
                <Label>Điều chỉnh</Label>
                {r.adjustments_total === 0 ? "—" : formatVND(r.adjustments_total)}
              </TableCell>
              <TableCell className={cn(num, net, "font-semibold")}>
                <Label>Phải trả</Label>
                {formatVND(r.net)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className={row}>
            <TableCell colSpan={2} className={head}>
              Tổng
            </TableCell>
            <TableCell className={num}>
              <Label>Đơn thu tiền</Label>
              {total.paid_count}
            </TableCell>
            <TableCell className={num}>
              <Label>Doanh thu</Label>
              {formatVND(total.revenue)}
            </TableCell>
            <TableCell className={num}>
              <Label>Không giao</Label>
              {total.failed_count}
            </TableCell>
            <TableCell className={num}>
              <Label>Hoa hồng</Label>
              {formatVND(total.commission)}
            </TableCell>
            <TableCell className={num}>
              <Label>Điều chỉnh</Label>
              {total.adjustments_total === 0 ? "—" : formatVND(total.adjustments_total)}
            </TableCell>
            <TableCell className={cn(num, "max-sm:col-span-2 max-sm:row-start-2 max-sm:text-xl")} data-testid="commission-total-net">
              <Label>Phải trả</Label>
              {formatVND(total.net)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
