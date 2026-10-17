import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import type { SellerOrder } from "@/shared/api/orders";
import { errorMessage } from "@/shared/api/errors";
import { formatVND } from "@/shared/lib/money";
import { isOpen, SELLER_STATUS_LABEL } from "@/shared/lib/order-status";
import { formatDate, formatTime } from "@/shared/lib/time";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { historyKey, listOrderHistory } from "../api";
import { useSellerBoard } from "../board-context";
import { historyError, historyParams, type HistoryFilter } from "../history-filter";
import { HistoryFilters } from "./history-filters";

// Dưới sm mỗi đơn là một khối hai cột: mã + tổng, giờ đặt + trạng thái, rồi quán · bàn.
const row = "max-sm:grid-cols-2";
const right = "max-sm:col-start-2 max-sm:text-right";

function statusVariant(o: SellerOrder) {
  if (o.status === "paid") return "secondary";
  return isOpen(o.status) ? "default" : "outline";
}

interface Props {
  filter: HistoryFilter;
  onFilterChange: (value: HistoryFilter) => void;
}

export function OrderHistory({ filter, onFilterChange }: Props) {
  const { state } = useSellerBoard();
  const params = historyParams(filter);
  const query = useInfiniteQuery({
    queryKey: historyKey(params),
    queryFn: ({ pageParam, signal }) => listOrderHistory(params, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: !historyError(filter),
  });

  // Trạng thái sống: bảng đơn đã nhận thay đổi qua WebSocket hoặc nút trên bảng thì lấy bản mới hơn (cùng
  // luật updated_at với store). Đơn vừa đổi sang trạng thái khác bộ lọc vẫn hiện tới lần tải lại sau
  // (order.created làm mới danh sách, hoặc đổi bộ lọc) — chấp nhận để danh sách không nhảy dưới tay người bán.
  const orders = (query.data?.pages ?? []).flatMap((p) =>
    p.orders.map((o) => {
      const live = state.orders[o.id];
      return live && Date.parse(live.updated_at) > Date.parse(o.updated_at) ? live : o;
    }),
  );

  return (
    <div className="space-y-4">
      <HistoryFilters value={filter} onChange={onFilterChange} />

      {query.isLoading && <p className="text-muted-foreground">Đang tải đơn…</p>}

      {query.isError && (
        <div role="alert" className="space-y-3">
          <p>Không tải được đơn: {errorMessage(query.error)}</p>
          <Button className="h-11" onClick={() => void (query.isFetchNextPageError ? query.fetchNextPage() : query.refetch())}>
            Thử lại
          </Button>
        </div>
      )}

      {query.isSuccess && orders.length === 0 && <p className="text-muted-foreground">Không có đơn trong khoảng này</p>}

      {orders.length > 0 && (
        <div className="rounded-lg border bg-background">
          <Table stacked>
            <TableHeader>
              <TableRow>
                <TableHead>Thời gian</TableHead>
                <TableHead>Mã</TableHead>
                <TableHead>Quán · Bàn</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Tổng</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((o) => (
                <TableRow key={o.id} className={row}>
                  <TableCell className="tabular-nums max-sm:row-start-2 max-sm:text-sm max-sm:text-muted-foreground">
                    {formatDate(o.created_at)} {formatTime(o.created_at)}
                  </TableCell>
                  <TableCell className="max-sm:row-start-1">
                    <Link to={`/seller/orders/${o.id}`} className="inline-flex min-h-11 items-center font-mono font-semibold underline-offset-4 hover:underline">
                      #{o.code}
                    </Link>
                  </TableCell>
                  <TableCell className="max-sm:col-span-2 max-sm:row-start-3 max-sm:text-sm">
                    {o.partner_name} · {o.table_label}
                  </TableCell>
                  <TableCell className={`${right} max-sm:row-start-2`}>
                    <Badge variant={statusVariant(o)}>{SELLER_STATUS_LABEL[o.status]}</Badge>
                  </TableCell>
                  <TableCell className={`${right} text-right font-medium tabular-nums max-sm:row-start-1`}>{formatVND(o.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {orders.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{query.hasNextPage ? `Đã hiện ${orders.length} đơn` : `${orders.length} đơn`}</p>
          {query.hasNextPage && !query.isFetchNextPageError && (
            <Button variant="outline" className="h-11" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              {query.isFetchingNextPage ? "Đang tải…" : "Tải thêm"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
