import { Camera } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { isApiError } from "@/shared/api/errors";
import { useDocumentHead } from "@/shared/hooks/use-document-head";
import { CustomerBrand } from "@/shared/layout/customer-brand";
import { CUSTOMER_STATUS_LABEL, isOpen } from "@/shared/lib/order-status";
import { serverNow } from "@/shared/lib/time";
import { cn } from "@/shared/lib/utils";
import { Button, buttonVariants } from "@/shared/ui/button";
import { CustomerFooter } from "@/shared/layout/customer-footer";
import { cancelOrder, type PublicOrder } from "./api";
import { ClosedNotice } from "./components/closed-notice";
import { OrderItems } from "./components/order-items";
import { OrderSkeleton } from "./components/order-skeleton";
import { StatusSteps } from "./components/status-steps";
import { UnconfirmedPrompt } from "./components/unconfirmed-prompt";
import { useOrder, type OrderState } from "./hooks/use-order";
import { statusHeadline } from "./status-copy";
import { shouldPromptUnconfirmed } from "./timing";

function headTitle(state: OrderState): string {
  if (state.status === "loading") return "Đang tải đơn…";
  if (state.status === "error") return state.error.status === 404 ? "Không tìm thấy đơn" : "Không tải được đơn";
  return `Đơn #${state.order.code} · ${CUSTOMER_STATUS_LABEL[state.order.status]}`;
}

// Quay về menu của bàn để gọi thêm: nút phụ khi đơn còn chạy, nút chính duy nhất khi đơn đã xong hoặc đã đóng.
function ReorderLink({ order, primary }: { order: PublicOrder; primary: boolean }) {
  return (
    <Link
      to={order.menu_path}
      data-variant={primary ? "cta" : "outline"}
      className={cn(buttonVariants({ variant: primary ? "cta" : "outline", size: "lg" }), "min-h-11 w-full")}
    >
      Gọi thêm nước
    </Link>
  );
}

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
  useDocumentHead({ title: headTitle(state), noindex: true });

  // Đồng hồ cho hộp "quá 60 giây" (đơn `sent`) và câu "sắp xong" khi qua giờ dự kiến (đơn `accepted`): vẽ lại mỗi giây.
  const ticking = state.status === "ready" && (state.order.status === "sent" || state.order.status === "accepted");
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  if (state.status === "loading") return <OrderSkeleton />;
  if (state.status === "error") {
    const notFound = state.error.status === 404;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
        {notFound && <Camera aria-hidden className="size-10 text-muted-foreground" />}
        <h1 className="text-xl font-semibold">{notFound ? "Không tìm thấy đơn" : "Không tải được đơn"}</h1>
        {notFound ? (
          <p className="text-muted-foreground">Quét mã QR trên bàn để đặt lại</p>
        ) : (
          <Button size="lg" className="min-h-11" onClick={() => void reload()}>
            Thử lại
          </Button>
        )}
      </main>
    );
  }

  const { order, clock } = state;
  const showPrompt = shouldPromptUnconfirmed(order.status, order.created_at, clock, snoozedAt);
  const open = isOpen(order.status);

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
      <header className="space-y-2">
        <CustomerBrand place={`${order.partner_name} · ${order.table_label}`} />
        <h1 className="text-2xl leading-tight font-bold text-balance" aria-live="polite">
          {statusHeadline(order, serverNow(clock))}
        </h1>
        <p className="font-mono text-sm text-muted-foreground">Đơn #{order.code}</p>
      </header>

      {open || order.status === "paid" ? <StatusSteps status={order.status} /> : <ClosedNotice order={order} />}
      {!open && <ReorderLink order={order} primary />}
      {open && (
        <p className="text-sm text-muted-foreground">
          {order.notify_zalo ? "Bạn sẽ nhận tin Zalo khi trạng thái đổi, có thể đóng trang này." : "Giữ trang này mở để theo dõi đơn."}
        </p>
      )}

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
      {open && (
        <>
          <p className="text-center text-sm text-muted-foreground">Trả tiền khi nhận nước: tiền mặt hoặc chuyển khoản</p>
          <ReorderLink order={order} primary={false} />
        </>
      )}
      <CustomerFooter />
    </div>
  );
}
