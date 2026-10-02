import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useSellerBoard } from "../board-context";
import { OrderCard } from "../components/order-card";
import { closedSince, openColumns, startOfDayVN } from "../store";

const COLUMNS = [
  { key: "sent", title: "Đã gửi" },
  { key: "accepted", title: "Đang pha" },
  { key: "delivering", title: "Đang mang ra" },
] as const;

export function Component() {
  const { state, dispatch, loadError, retryLoad, loadClosed } = useSellerBoard();
  const [tab, setTab] = useState("open");
  const cols = openColumns(state);
  const closed = closedSince(state, startOfDayVN(Date.now()));

  if (!state.loaded) {
    if (!loadError) return <p className="p-6 text-muted-foreground">Đang tải đơn…</p>;
    return (
      <div role="alert" className="space-y-3 p-6">
        <p>Không tải được đơn: {loadError}. Đang tự thử lại…</p>
        <Button onClick={retryLoad}>Thử lại ngay</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4">
      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v);
          if (v === "closed") void loadClosed();
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="open">Đang mở ({cols.sent.length + cols.accepted.length + cols.delivering.length})</TabsTrigger>
            <TabsTrigger value="closed">Đã đóng hôm nay</TabsTrigger>
          </TabsList>
          {state.unseen.length > 0 && (
            <Button variant="outline" size="sm" onClick={() => dispatch({ type: "seen" })}>
              Đã xem {state.unseen.length} đơn mới
            </Button>
          )}
        </div>

        <TabsContent value="open">
          <div className="grid gap-4 md:grid-cols-3">
            {COLUMNS.map((c) => (
              <section key={c.key} aria-label={c.title} className="space-y-3">
                <h2 className="sticky top-0 z-10 bg-background py-1 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {c.title} ({cols[c.key].length})
                </h2>
                {cols[c.key].length === 0 && <p className="text-sm text-muted-foreground">Không có đơn</p>}
                {cols[c.key].map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    clock={state.clock}
                    unseen={state.unseen.includes(o.id)}
                    onSeen={() => dispatch({ type: "seen", ids: [o.id] })}
                  />
                ))}
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
