import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Plus, Printer, QrCode as QrIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { toast } from "sonner";
import { z } from "zod";
import { FieldError } from "@/features/admin-products/form-field";
import { applyServerErrors } from "@/features/admin-products/server-errors";
import { errorMessage } from "@/shared/api/errors";
import { formatDate } from "@/shared/lib/time";
import { cn } from "@/shared/lib/utils";
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { createQrCode, listQrCodes, qrcodesKey, revokeQrCode, type Partner, type QrCode } from "../api";
import { QrDownloadButton } from "./qr-download-button";
import { QrPrintCard } from "./qr-print-card";

const addSchema = z.object({
  table_label: z.string().trim().min(1, "Nhập tên bàn, ví dụ Bàn 5").max(50, "Tên bàn tối đa 50 ký tự"),
});

export function TableList({ partner }: { partner: Pick<Partner, "id" | "name"> }) {
  const qc = useQueryClient();
  const key = qrcodesKey(partner.id);
  const { data, isPending, error, refetch } = useQuery({ queryKey: key, queryFn: ({ signal }) => listQrCodes(partner.id, signal) });
  const [viewing, setViewing] = useState<QrCode | null>(null);
  const [revoking, setRevoking] = useState<QrCode | null>(null);

  const replace = (code: QrCode) =>
    qc.setQueryData<QrCode[]>(key, (list) => {
      if (!list) return [code];
      return list.some((q) => q.token === code.token) ? list.map((q) => (q.token === code.token ? code : q)) : [...list, code];
    });

  const revoke = useMutation({
    mutationFn: (token: string) => revokeQrCode(token),
    onSuccess: (code) => {
      replace(code);
      void qc.invalidateQueries({ queryKey: key });
      toast.success(`Đã thu hồi mã của ${code.table_label}`);
      setRevoking(null);
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  const activeCount = data?.filter((q) => q.active).length ?? 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <AddTableForm partnerId={partner.id} onAdded={replace} />
        {activeCount > 0 ? (
          <Button variant="outline" asChild>
            <Link to={`/seller/partners/${encodeURIComponent(partner.id)}/print`}>
              <Printer /> In tất cả bàn
            </Link>
          </Button>
        ) : (
          <Button variant="outline" disabled>
            <Printer /> In tất cả bàn
          </Button>
        )}
      </div>

      {isPending ? (
        <p className="text-muted-foreground">Đang tải danh sách bàn…</p>
      ) : error ? (
        <div role="alert" className="space-y-2">
          <p className="text-destructive">{errorMessage(error)}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Thử lại
          </Button>
        </div>
      ) : data.length === 0 ? (
        <p className="text-muted-foreground">Quán chưa có bàn nào. Thêm bàn để tạo mã QR.</p>
      ) : (
        <div className="rounded-lg border bg-background">
          <Table stacked>
            <TableHeader>
              <TableRow>
                <TableHead>Bàn</TableHead>
                <TableHead>Mã</TableHead>
                <TableHead>Đường dẫn</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((q) => (
                // Dưới sm: bàn + trạng thái, mã, đường dẫn một dòng, rồi hai nút rộng.
                <TableRow
                  key={q.token}
                  className={cn("max-sm:grid-cols-[minmax(0,1fr)_auto]", !q.active && "text-muted-foreground")}
                >
                  <TableCell className="font-medium max-sm:col-start-1 max-sm:row-start-1">{q.table_label}</TableCell>
                  <TableCell className="font-mono text-xs max-sm:col-span-2 max-sm:row-start-2">{q.token}</TableCell>
                  <TableCell className="max-w-56 max-sm:col-span-2 max-sm:row-start-3 max-sm:max-w-none">
                    <a
                      href={q.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate py-0.5 text-primary underline-offset-4 hover:underline"
                    >
                      {q.url}
                    </a>
                  </TableCell>
                  <TableCell className="max-sm:col-start-2 max-sm:row-start-1">
                    {q.active ? (
                      <Badge>Đang dùng</Badge>
                    ) : (
                      <Badge variant="secondary">Đã thu hồi{q.revoked_at ? ` ${formatDate(q.revoked_at)}` : ""}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="max-sm:col-span-2 max-sm:row-start-4 max-sm:empty:hidden">
                    {q.active && (
                      <div className="flex justify-end gap-1 max-sm:grid max-sm:grid-cols-2 max-sm:gap-2">
                        <Button variant="ghost" size="sm" className="max-sm:h-10 max-sm:border" onClick={() => setViewing(q)}>
                          <QrIcon /> Xem thẻ
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive max-sm:h-10 max-sm:border"
                          onClick={() => setRevoking(q)}
                        >
                          <Ban /> Thu hồi
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="max-h-[95dvh] overflow-y-auto">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>Thẻ QR · {viewing.table_label}</DialogTitle>
                <DialogDescription>Tải ảnh để in hoặc gửi qua Zalo; in nhiều bàn một lúc dùng “In tất cả bàn”.</DialogDescription>
              </DialogHeader>
              <QrPrintCard className="mx-auto" partnerName={partner.name} tableLabel={viewing.table_label} url={viewing.url} />
              <DialogFooter>
                <QrDownloadButton partnerName={partner.name} tableLabel={viewing.table_label} url={viewing.url} />
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={revoking !== null} onOpenChange={(open) => !open && !revoke.isPending && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Thu hồi mã của {revoking?.table_label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Thẻ đã in với mã này sẽ hiện “Mã này không còn dùng” khi khách quét. Không thể bật lại; muốn dùng tiếp bàn này
              thì thêm bàn mới và in thẻ mới.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>Giữ lại</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revoke.isPending}
              onClick={(e) => {
                // Giữ hộp thoại mở tới khi API trả lời để thấy lỗi nếu có.
                e.preventDefault();
                if (revoking) revoke.mutate(revoking.token);
              }}
            >
              {revoke.isPending ? "Đang thu hồi…" : "Thu hồi mã"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function AddTableForm({ partnerId, onAdded }: { partnerId: string; onAdded: (code: QrCode) => void }) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm({ resolver: zodResolver(addSchema), defaultValues: { table_label: "" } });

  const add = useMutation({
    mutationFn: (label: string) => createQrCode(partnerId, label),
    onSuccess: (code) => {
      onAdded(code);
      reset();
      toast.success(`Đã thêm ${code.table_label}`);
    },
    onError: (err) => applyServerErrors(err, setError, ["table_label"]),
  });

  return (
    <form onSubmit={handleSubmit((v) => add.mutate(v.table_label))} noValidate className="space-y-1 max-sm:w-full">
      <div className="flex gap-2">
        <Input
          aria-label="Tên bàn mới"
          placeholder="Ví dụ: Bàn 5"
          className="min-w-0 flex-1 sm:w-44 sm:flex-none"
          aria-invalid={!!errors.table_label}
          {...register("table_label")}
        />
        <Button type="submit" disabled={add.isPending}>
          <Plus /> Thêm bàn
        </Button>
      </div>
      <FieldError message={errors.table_label?.message} />
    </form>
  );
}
