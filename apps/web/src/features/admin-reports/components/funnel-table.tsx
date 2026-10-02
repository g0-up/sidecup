import { Fragment } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import type { FunnelLine } from "../api";
import { formatConversion, formatDay } from "../format";

const num = "text-right tabular-nums";

interface Group {
  partnerId: string;
  partnerName: string;
  days: FunnelLine[];
  views: number;
  orders: number;
  paid: number;
}

function group(rows: FunnelLine[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    let g = map.get(r.partner_id);
    if (!g) {
      g = { partnerId: r.partner_id, partnerName: r.partner_name, days: [], views: 0, orders: 0, paid: 0 };
      map.set(r.partner_id, g);
    }
    g.days.push(r);
    g.views += r.views;
    g.orders += r.orders;
    g.paid += r.paid;
  }
  const groups = [...map.values()].sort((a, b) => a.partnerName.localeCompare(b.partnerName, "vi"));
  for (const g of groups) g.days.sort((a, b) => b.day.localeCompare(a.day));
  return groups;
}

// Phễu theo quán theo ngày; "Thiết bị mở trang" đếm thiết bị khác nhau trong ngày nên dòng cộng là tổng lượt-ngày.
export function FunnelTable({ rows }: { rows: FunnelLine[] }) {
  if (rows.length === 0) return <p className="text-muted-foreground">Chưa có lượt mở trang nào trong khoảng này.</p>;
  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Quán / ngày</TableHead>
            <TableHead className="text-right">Thiết bị mở trang</TableHead>
            <TableHead className="text-right">Đơn</TableHead>
            <TableHead className="text-right">Đã thu tiền</TableHead>
            <TableHead className="text-right">Tỷ lệ đặt</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {group(rows).map((g) => (
            <Fragment key={g.partnerId}>
              <TableRow className="bg-muted/50 font-medium">
                <TableCell>{g.partnerName} · cộng</TableCell>
                <TableCell className={num}>{g.views}</TableCell>
                <TableCell className={num}>{g.orders}</TableCell>
                <TableCell className={num}>{g.paid}</TableCell>
                <TableCell className={num}>{formatConversion(g.orders, g.views)}</TableCell>
              </TableRow>
              {g.days.map((d) => (
                <TableRow key={`${g.partnerId}-${d.day}`}>
                  <TableCell className="pl-6">{formatDay(d.day)}</TableCell>
                  <TableCell className={num}>{d.views}</TableCell>
                  <TableCell className={num}>{d.orders}</TableCell>
                  <TableCell className={num}>{d.paid}</TableCell>
                  <TableCell className={num}>{formatConversion(d.orders, d.views)}</TableCell>
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
