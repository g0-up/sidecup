import { useQuery } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import { Link } from "react-router";
import { isApiError } from "@/shared/api/errors";
import type { SellerOrder } from "@/shared/api/orders";
import { formatVND } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { getVietQR } from "../api";

interface Props {
  order: SellerOrder;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPaid: () => void;
  busy: boolean;
}

// VietQR để khách quét bằng app ngân hàng; "Đã nhận tiền" chuyển đơn sang paid/transfer (P0-8).
export function VietQrDialog({ order, open, onOpenChange, onPaid, busy }: Props) {
  const qr = useQuery({
    queryKey: ["seller", "vietqr", order.id, order.total],
    queryFn: () => getVietQR(order.id),
    enabled: open,
    staleTime: Infinity,
  });
  const notConfigured = isApiError(qr.error, "BANK_NOT_CONFIGURED");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Chuyển khoản · #{order.code}</DialogTitle>
          <DialogDescription>Đưa khách quét mã bằng app ngân hàng</DialogDescription>
        </DialogHeader>
        {qr.isPending && <p className="py-10 text-center text-muted-foreground">Đang tạo mã…</p>}
        {notConfigured && (
          <div className="space-y-2 text-sm">
            <p>Chưa cài đặt tài khoản ngân hàng nhận tiền.</p>
            <Link to="/seller/settings" className="font-medium text-primary underline">
              Mở Cài đặt
            </Link>
          </div>
        )}
        {qr.isError && !notConfigured && <p className="text-sm text-destructive">Không tạo được mã, thử lại sau.</p>}
        {qr.data && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg bg-white p-3">
              <QRCodeSVG value={qr.data.payload} size={240} level="M" marginSize={2} title="Mã VietQR" />
            </div>
            <dl className="grid w-full grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Số tiền</dt>
              <dd className="text-right text-lg font-semibold tabular-nums">{formatVND(qr.data.amount)}</dd>
              <dt className="text-muted-foreground">Nội dung</dt>
              <dd className="text-right font-mono">{qr.data.purpose}</dd>
              <dt className="text-muted-foreground">Người nhận</dt>
              <dd className="text-right">{qr.data.bank_account_name || "—"}</dd>
              <dt className="text-muted-foreground">Tài khoản</dt>
              <dd className="text-right font-mono">{qr.data.bank_account}</dd>
            </dl>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button onClick={onPaid} disabled={busy || !qr.data}>
            {busy ? "Đang lưu…" : "Đã nhận tiền"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
