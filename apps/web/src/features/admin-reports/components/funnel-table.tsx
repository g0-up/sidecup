import { Fragment, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import type { FunnelLine } from "../api";
import { formatConversion, formatDay } from "../format";

const num = "text-right tabular-nums max-sm:text-left";
// Dưới sm mỗi dòng là một khối: tên quán hoặc ngày trên cùng, bốn số có nhãn bên dưới.
const row = "max-sm:grid-cols-4";
const head = "max-sm:col-span-4";

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TableCell className={num}>
      <span className="block text-xs font-normal text-muted-foreground sm:hidden">{label}</span>
      {children}
    </TableCell>
  );
}

function Numbers({ views, orders, paid }: { views: number; orders: number; paid: number }) {
  return (
    <>
      <Cell label="Thiết bị">{views}</Cell>
      <Cell label="Đơn">{orders}</Cell>
      <Cell label="Đã thu tiền">{paid}</Cell>
      <Cell label="Tỷ lệ đặt">{formatConversion(orders, views)}</Cell>
    </>
  );
}

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
      <Table stacked>
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
              <TableRow className={cn(row, "bg-muted/50 font-medium")}>
                <TableCell className={head}>{g.partnerName} · cộng</TableCell>
                <Numbers views={g.views} orders={g.orders} paid={g.paid} />
              </TableRow>
              {g.days.map((d) => (
                <TableRow key={`${g.partnerId}-${d.day}`} className={row}>
                  {/* Dưới sm, p-0 của bảng xếp khối thắng pl-6 nên thụt bằng margin. */}
                  <TableCell className={cn(head, "pl-6 max-sm:ml-4")}>{formatDay(d.day)}</TableCell>
                  <Numbers views={d.views} orders={d.orders} paid={d.paid} />
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
