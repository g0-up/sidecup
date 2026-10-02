import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { isApiError } from "@/shared/api/errors";
import { CUSTOMER_STATUS_LABEL, isOpen } from "@/shared/lib/order-status";
import { serverNow } from "@/shared/lib/time";
import { Button } from "@/shared/ui/button";
import { CustomerFooter } from "@/shared/layout/customer-footer";
import { cancelOrder } from "./api";
import { ClosedNotice } from "./components/closed-notice";
import { OrderItems } from "./components/order-items";
import { StatusSteps } from "./components/status-steps";
import { UnconfirmedPrompt } from "./components/unconfirmed-prompt";
import { useOrder } from "./hooks/use-order";
import { shouldPromptUnconfirmed } from "./timing";

export function Component() {
  const { id = "" } = useParams();
  return <OrderPage key={id} id={id} />;
}

function OrderPage({ id }: { id: string }) {
  const { state, reload, replace } = useOrder(id);
  const [snoozedAt, setSnoozedAt] = useState<number | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [, tick] = useState(0);

  // Đồng hồ cho hộp "quá 60 giây": vẽ lại mỗi giây khi đơn còn `sent`.
  const sent = state.status === "ready" && state.order.status === "sent";
  useEffect(() => {
    if (!sent) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [sent]);

  if (state.status === "loading") {
    return <p className="mx-auto max-w-md px-4 py-10 text-center text-muted-foreground">Đang tải đơn…</p>;
  }
  if (state.status === "error") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-semibold">{state.error.status === 404 ? "Không tìm thấy đơn" : "Không tải được đơn"}</h1>
        {state.error.status !== 404 && <Button onClick={() => void reload()}>Thử lại</Button>}
      </main>
    );
  }

  const { order, clock } = state;
  const showPrompt = shouldPromptUnconfirmed(order.status, order.created_at, clock, snoozedAt);

  async function onCancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await cancelOrder(id);
      const { server_time, ...o } = res;
      replace(o, server_time);
    } catch (e) {
      // 409: đơn vừa được nhận hoặc đã đổi trạng thái → tải lại để hiện đúng.
      if (isApiError(e) && e.status === 409) await reload();
      else setCancelError(isApiError(e) ? e.message : "Không huỷ được, vui lòng thử lại");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md space-y-5 px-4 pt-6 pb-10">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">
          {order.partner_name} · {order.table_label}
        </p>
        <h1 className="text-2xl font-semibold">
          Đơn <span className="font-mono">#{order.code}</span>
        </h1>
        <p className="text-sm font-medium" aria-live="polite">
          {CUSTOMER_STATUS_LABEL[order.status]}
        </p>
      </header>

      {isOpen(order.status) || order.status === "paid" ? <StatusSteps status={order.status} /> : <ClosedNotice order={order} />}

      {showPrompt && (
        <UnconfirmedPrompt
          cancelling={cancelling}
          onWait={() => setSnoozedAt(serverNow(clock))}
          onCancel={() => void onCancel()}
        />
      )}
      {cancelError && (
        <p role="alert" className="text-sm text-destructive">
          {cancelError}
        </p>
      )}

      <OrderItems order={order} />
      {isOpen(order.status) && (
        <p className="text-center text-sm text-muted-foreground">Trả tiền khi nhận nước: tiền mặt hoặc chuyển khoản</p>
      )}
      <CustomerFooter />
    </div>
  );
}
