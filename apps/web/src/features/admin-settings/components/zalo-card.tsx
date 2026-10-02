import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { notifierKey } from "@/features/seller-orders/api";
import { ApiError, errorMessage } from "@/shared/api/errors";
import {
  cancelZaloLink,
  getZaloLink,
  getZaloStatus,
  startZaloLink,
  unlinkZalo,
  zaloKey,
  zaloLinkKey,
  type ZaloLink,
  type ZaloLinkState,
} from "@/shared/api/zalo";
import { formatDate } from "@/shared/lib/time";
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
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Checkbox } from "@/shared/ui/checkbox";
import { Label } from "@/shared/ui/label";

// Đổi văn bản đồng ý bên dưới thì tăng hằng này; API lưu lại phiên bản người bán đã đồng ý.
export const ZALO_CONSENT_VERSION = "2026-10-02";

const LINK_POLL_MS = 1500;
const TERMINAL_STATES: ZaloLinkState[] = ["linked", "expired", "error"];

// Một lần poll rớt mạng hay API 5xx thì thử lại trước khi báo hỏng; lỗi 4xx (mã đã bị thay, hết phiên) là thật.
const LINK_POLL_RETRIES = 2;

function retryLinkPoll(failures: number, err: unknown) {
  const clientError = err instanceof ApiError && err.status >= 400 && err.status < 500;
  return failures < LINK_POLL_RETRIES && !clientError;
}

function isTerminal(state: ZaloLinkState | undefined) {
  return state !== undefined && TERMINAL_STATES.includes(state);
}

export function ZaloCard() {
  const qc = useQueryClient();
  const [consent, setConsent] = useState(false);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  const status = useQuery({ queryKey: zaloKey, queryFn: getZaloStatus });

  const link = useQuery({
    queryKey: zaloLinkKey(linkId ?? ""),
    queryFn: () => getZaloLink(linkId!),
    enabled: linkId !== null,
    retry: retryLinkPoll,
    retryDelay: LINK_POLL_MS,
    refetchInterval: (q) => (isTerminal(q.state.data?.state) || q.state.error ? false : LINK_POLL_MS),
  });

  const refreshStatus = () => {
    void qc.invalidateQueries({ queryKey: zaloKey });
    void qc.invalidateQueries({ queryKey: notifierKey });
  };

  // Đóng bảng ngay; báo server dừng attempt rồi đọc lại trạng thái, vì lần quét vừa kịp xong vẫn có thể đã lưu.
  const cancelLink = () => {
    const id = linkId;
    setLinkId(null);
    if (id === null) return;
    cancelZaloLink(id)
      .catch(() => undefined) // không huỷ được thì attempt tự hết hạn sau ~100 giây
      .finally(refreshStatus);
  };

  const linkedNow = link.data?.state === "linked";
  useEffect(() => {
    if (!linkedNow) return;
    setLinkId(null);
    setConsent(false);
    toast.success("Đã kết nối Zalo");
    void qc.invalidateQueries({ queryKey: zaloKey });
    void qc.invalidateQueries({ queryKey: notifierKey });
  }, [linkedNow, qc]);

  const start = useMutation({
    mutationFn: () => startZaloLink(ZALO_CONSENT_VERSION),
    onSuccess: (res) => setLinkId(res.link_id),
    onError: (err) => toast.error(errorMessage(err)),
  });

  const unlink = useMutation({
    mutationFn: unlinkZalo,
    onSuccess: () => {
      setConfirmUnlink(false);
      toast.success("Đã ngắt kết nối Zalo");
      refreshStatus();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gửi trạng thái đơn qua Zalo</CardTitle>
        <CardDescription>
          Khi bạn đổi trạng thái đơn, khách có nhập số điện thoại sẽ nhận tin Zalo từ tài khoản bạn kết nối ở đây.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {status.isPending ? (
          <p className="text-muted-foreground">Đang tải…</p>
        ) : status.error ? (
          <div role="alert" className="space-y-2">
            <p className="text-destructive">{errorMessage(status.error)}</p>
            <Button variant="outline" onClick={() => void status.refetch()}>
              Thử lại
            </Button>
          </div>
        ) : !status.data.configured ? (
          <div className="space-y-1">
            <p className="font-medium">Chưa cấu hình Zalo trên máy chủ</p>
            <p className="text-sm text-muted-foreground">
              Đặt biến môi trường <code>ZALO_CREDENTIAL_KEY</code> cho API rồi khởi động lại để bật tính năng này.
            </p>
          </div>
        ) : linkId !== null ? (
          <LinkPanel
            link={link.data}
            failed={link.error !== null}
            retrying={start.isPending}
            onRetry={() => start.mutate()}
            onCancel={cancelLink}
          />
        ) : status.data.status === "linked" ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge>Đã kết nối</Badge>
            <span className="font-medium">{status.data.display_name || "Tài khoản Zalo"}</span>
            {status.data.linked_at && (
              <span className="text-sm text-muted-foreground">từ {formatDate(status.data.linked_at)}</span>
            )}
            <Button variant="outline" className="ml-auto" onClick={() => setConfirmUnlink(true)}>
              Ngắt kết nối
            </Button>
          </div>
        ) : status.data.status === "expired" ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge variant="destructive">Phiên hết hạn</Badge>
              <span className="font-medium">{status.data.display_name || "Tài khoản Zalo"}</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Zalo đã đăng xuất tài khoản này nên khách không nhận được tin. Quét lại mã QR để gửi tiếp.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={start.isPending} onClick={() => start.mutate()}>
                {start.isPending ? "Đang tạo mã…" : "Quét lại mã QR"}
              </Button>
              <Button variant="outline" onClick={() => setConfirmUnlink(true)}>
                Ngắt kết nối
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <Checkbox
                id="zalo-consent"
                className="mt-0.5"
                checked={consent}
                onCheckedChange={(c) => setConsent(c === true)}
              />
              <Label htmlFor="zalo-consent" className="block leading-snug font-normal">
                Tôi hiểu đây là cách gửi tin không chính thức qua Zalo cá nhân: Zalo có thể khoá hoặc đăng xuất tài khoản,
                nên dùng một tài khoản Zalo phụ. Tin chỉ gửi tới khách có nhập số điện thoại khi đặt.
              </Label>
            </div>
            <Button disabled={!consent || start.isPending} onClick={() => start.mutate()}>
              {start.isPending ? "Đang tạo mã…" : "Kết nối Zalo"}
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmUnlink} onOpenChange={(open) => !open && !unlink.isPending && setConfirmUnlink(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ngắt kết nối Zalo?</AlertDialogTitle>
            <AlertDialogDescription>
              Khách sẽ không nhận tin trạng thái đơn nữa cho tới khi bạn kết nối lại bằng mã QR.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlink.isPending}>Giữ kết nối</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={unlink.isPending}
              onClick={(e) => {
                // Giữ hộp thoại mở tới khi API trả lời để thấy lỗi nếu có.
                e.preventDefault();
                unlink.mutate();
              }}
            >
              {unlink.isPending ? "Đang ngắt…" : "Ngắt kết nối"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

interface LinkPanelProps {
  link: ZaloLink | undefined;
  failed: boolean;
  retrying: boolean;
  onRetry: () => void;
  onCancel: () => void;
}

// Một lần quét QR: hiện ảnh mã, rồi nhắc xác nhận trên điện thoại; hỏng thì cho tạo mã mới.
function LinkPanel({ link, failed, retrying, onRetry, onCancel }: LinkPanelProps) {
  const state = link?.state;
  const failure = failed
    ? "Không tạo được mã QR. Vui lòng thử lại."
    : state === "expired"
      ? "Mã QR đã hết hạn. Tạo mã mới để thử lại."
      : state === "error"
        ? (link?.failure ?? "Không hoàn tất được đăng nhập Zalo. Tạo mã mới để thử lại.")
        : null;

  if (failure) {
    return (
      <div className="space-y-3">
        <p role="alert" className="text-destructive">
          {failure}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={retrying} onClick={onRetry}>
            {retrying ? "Đang tạo mã…" : "Tạo mã mới"}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Huỷ
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {state === "qr_ready" && link?.qr_png_base64 ? (
        <>
          <img
            src={`data:image/png;base64,${link.qr_png_base64}`}
            alt="Mã QR đăng nhập Zalo"
            className="size-56 rounded-md border bg-white p-2"
          />
          <p className="text-sm">Mở Zalo trên điện thoại phụ → Quét mã</p>
        </>
      ) : state === "scanned" || state === "confirmed" || state === "linked" ? (
        <p className="text-sm">Xác nhận đăng nhập trên điện thoại</p>
      ) : (
        <p className="text-muted-foreground">Đang tạo mã QR…</p>
      )}
      <Button variant="outline" onClick={onCancel}>
        Huỷ
      </Button>
    </div>
  );
}
