import { useState } from "react";
import { useDocumentHead } from "@/shared/hooks/use-document-head";
import { useNow } from "@/shared/hooks/use-now";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useSellerBoard } from "../board-context";
import { OrderCard } from "../components/order-card";
import { closedSince, isLate, openColumns, startOfDayVN, type BoardState } from "../store";

const COLUMNS = [
  { key: "sent", title: "Đã gửi" },
  { key: "accepted", title: "Đang pha" },
  { key: "delivering", title: "Đang mang ra" },
] as const;

type ColumnKey = (typeof COLUMNS)[number]["key"];
type Columns = ReturnType<typeof openColumns>;

// Cột mở sẵn dưới lg: cột chứa đơn trễ lâu nhất, không có thì "Đã gửi".
function defaultColumn(cols: Columns, state: BoardState, now: number): ColumnKey {
  const late = COLUMNS.flatMap((c) => cols[c.key].filter((o) => isLate(o, state.clock, now)).map((o) => ({ key: c.key, o })));
  late.sort((a, b) => Date.parse(a.o.created_at) - Date.parse(b.o.created_at));
  return late[0]?.key ?? "sent";
}

export function Component() {
  const { state, dispatch, loadError, retryLoad, loadClosed } = useSellerBoard();
  const [tab, setTab] = useState("open");
  const [column, setColumn] = useState<ColumnKey | null>(null);
  const cols = openColumns(state);
  const openCount = cols.sent.length + cols.accepted.length + cols.delivering.length;
  const closed = closedSince(state, startOfDayVN(Date.now()));
  useDocumentHead({ title: state.loaded ? `(${openCount}) Bảng đơn — Gọi nước` : "Bảng đơn — Gọi nước" });

  // Chọn cột mặc định một lần khi bảng tải xong; sau đó giữ cột người bán đã chọn.
  if (state.loaded && column === null) setColumn(defaultColumn(cols, state, Date.now()));
  const active = column ?? "sent";

  if (!state.loaded) {
    if (!loadError) return <p className="p-6 text-muted-foreground">Đang tải đơn…</p>;
    return (
      <div role="alert" className="space-y-3 p-6">
        <p>Không tải được đơn: {loadError}. Đang tự thử lại…</p>
        <Button onClick={retryLoad}>Thử lại ngay</Button>
      </div>
    );
  }

  // Bảng ba cột cần chỗ: giữ max-w-7xl (trang quản trị dùng max-w-5xl) để mỗi thẻ đủ rộng cho cả ba nút giao.
  return (
    <div className="mx-auto max-w-7xl p-4">
      <h1 className="sr-only">Bảng đơn</h1>
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          if (v === "closed") void loadClosed();
        }}
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <TabsList className="group-data-[orientation=horizontal]/tabs:h-auto">
            <TabsTrigger value="open" className="h-11 px-3">
              Đang mở ({openCount})
            </TabsTrigger>
            <TabsTrigger value="closed" className="h-11 px-3">
              Đã đóng hôm nay
            </TabsTrigger>
          </TabsList>
          {state.unseen.length > 0 && (
            <Button variant="outline" className="h-11" onClick={() => dispatch({ type: "seen" })}>
              Đã xem {state.unseen.length} đơn mới
            </Button>
          )}
        </div>

        <TabsContent value="open">
          <ColumnPicker cols={cols} state={state} active={active} onPick={setColumn} />
          <div className="grid gap-4 lg:grid-cols-3">
            {COLUMNS.map((c) => (
              <section key={c.key} aria-label={c.title} className={cn("space-y-3", active !== c.key && "hidden lg:block")}>
                <h2 className="max-lg:sr-only py-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                  {c.title} ({cols[c.key].length})
                </h2>
                {cols[c.key].length === 0 && <p className="text-sm text-muted-foreground">Không có đơn</p>}
                {cols[c.key].map((o) => {
                  const unseen = state.unseen.includes(o.id);
                  return (
                    <OrderCard
                      key={o.id}
                      order={o}
                      clock={state.clock}
                      unseen={unseen}
                      onSeen={unseen ? () => dispatch({ type: "seen", ids: [o.id] }) : undefined}
                    />
                  );
                })}
              </section>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="closed">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {closed.length === 0 && <p className="text-sm text-muted-foreground">Chưa có đơn nào đóng hôm nay</p>}
            {closed.map((o) => (
              <OrderCard key={o.id} order={o} clock={state.clock} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Dưới lg chỉ hiện một cột; bộ chọn cho tới mọi trạng thái trong một chạm, chấm báo cột có đơn mới hoặc trễ.
// Tách riêng để nhịp đồng hồ mỗi giây (cho chấm trễ) chỉ vẽ lại bộ chọn, không vẽ lại cả bảng.
function ColumnPicker({
  cols,
  state,
  active,
  onPick,
}: {
  cols: Columns;
  state: BoardState;
  active: ColumnKey;
  onPick: (key: ColumnKey) => void;
}) {
  const now = useNow(1000);
  return (
    <div role="group" aria-label="Chọn cột" className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 lg:hidden">
      {COLUMNS.map((c) => {
        const alert = cols[c.key].some((o) => state.unseen.includes(o.id) || isLate(o, state.clock, now));
        return (
          <button
            key={c.key}
            type="button"
            aria-pressed={active === c.key}
            onClick={() => onPick(c.key)}
            className={cn(
              "relative flex min-h-11 items-center justify-center rounded-md px-1 text-center text-sm leading-tight font-medium text-foreground/70 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active === c.key && "bg-background text-foreground shadow-sm",
            )}
          >
            {c.title} ({cols[c.key].length})
            {alert && (
              <span className="absolute top-1 right-1 size-2.5 rounded-full bg-destructive">
                <span className="sr-only">, có đơn cần xử lý</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
