import { useState } from "react";
import type { SellerOrder } from "@/shared/api/orders";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { useSellerBoard } from "../board-context";
import { actionsFor, type ActionSpec } from "../store";
import { VietQrDialog } from "./vietqr-dialog";

// OrderActions: một chạm cho mỗi bước; từ chối và không gặp khách phải xác nhận vì không quay lại được.
export function OrderActions({ order }: { order: SellerOrder }) {
  const { runTransition } = useSellerBoard();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<ActionSpec | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const actions = actionsFor(order.status);
  if (actions.length === 0) return null;

  async function run(a: ActionSpec) {
    setBusy(true);
    const ok = await runTransition(order, { to: a.to, payment_method: a.payment });
    setBusy(false);
    if (ok) {
      setQrOpen(false);
      setConfirming(null);
    }
  }

  function onClick(a: ActionSpec) {
    if (a.vietqr) setQrOpen(true);
    else if (a.confirm) setConfirming(a);
    else void run(a);
  }

  const transfer = actions.find((a) => a.vietqr);
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <Button
            key={a.label}
            variant={a.variant}
            size="lg"
            className="min-w-28 flex-1"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onClick(a);
            }}
          >
            {a.label}
          </Button>
        ))}
      </div>

      <AlertDialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming?.label} · #{order.code}
            </AlertDialogTitle>
            <AlertDialogDescription>{confirming?.confirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Quay lại</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                if (confirming) void run(confirming);
              }}
            >
              Xác nhận
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {transfer && (
        <VietQrDialog order={order} open={qrOpen} onOpenChange={setQrOpen} busy={busy} onPaid={() => void run(transfer)} />
      )}
    </>
  );
}
