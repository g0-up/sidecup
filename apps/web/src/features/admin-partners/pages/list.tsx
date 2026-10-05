import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { errorMessage } from "@/shared/api/errors";
import { useDocumentHead } from "@/shared/hooks/use-document-head";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { listPartners, partnersKey } from "../api";
import { PartnerFormDialog } from "../components/partner-form";
import { formatRatePercent, PAYOUT_LABEL } from "../format";
import { summarizeOpenHours } from "../open-hours";

export function Component() {
  const { data, isPending, error, refetch } = useQuery({ queryKey: partnersKey, queryFn: ({ signal }) => listPartners(signal) });
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  useDocumentHead({ title: "Quán — Gọi nước" });

  const partners = [...(data ?? [])].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "vi"));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Quán</h1>
          <p className="text-sm text-muted-foreground">Bấm vào tên quán để quản lý bàn và in mã QR.</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus /> Thêm quán
        </Button>
      </div>

      {isPending ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : error ? (
        <div role="alert" className="space-y-2">
          <p className="text-destructive">{errorMessage(error)}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Thử lại
          </Button>
        </div>
      ) : partners.length === 0 ? (
        <p className="text-muted-foreground">Chưa có quán nào. Bấm “Thêm quán” để bắt đầu.</p>
      ) : (
        <div className="rounded-lg border bg-background">
          <Table stacked>
            <TableHeader>
              <TableRow>
                <TableHead>Quán</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Hoa hồng</TableHead>
                <TableHead>Kỳ trả</TableHead>
                <TableHead>Giờ bán</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((p) => (
                // Dưới sm: tên + trạng thái, rồi hoa hồng · kỳ trả, giờ bán.
                <TableRow
                  key={p.id}
                  className={cn("max-sm:grid-cols-[minmax(0,1fr)_auto]", !p.active && "text-muted-foreground")}
                >
                  <TableCell className="font-medium max-sm:col-start-1 max-sm:row-start-1">
                    <Link
                      to={`/seller/partners/${encodeURIComponent(p.id)}`}
                      className="inline-flex min-h-6 items-center text-primary underline-offset-4 hover:underline"
                    >
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell className="max-sm:col-start-2 max-sm:row-start-1">
                    {p.active ? <Badge>Đang hợp tác</Badge> : <Badge variant="secondary">Ngừng</Badge>}
                  </TableCell>
                  <TableCell className="tabular-nums max-sm:col-start-1 max-sm:row-start-2 max-sm:text-muted-foreground">
                    <span className="sm:hidden">Hoa hồng </span>
                    {formatRatePercent(p.commission_rate)}
                  </TableCell>
                  <TableCell className="max-sm:col-start-2 max-sm:row-start-2 max-sm:text-right max-sm:text-muted-foreground">
                    {PAYOUT_LABEL[p.payout_period] ?? p.payout_period}
                  </TableCell>
                  <TableCell className="min-w-48 whitespace-normal max-sm:col-span-2 max-sm:row-start-3 max-sm:min-w-0 max-sm:text-muted-foreground">
                    {summarizeOpenHours(p.open_hours)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <PartnerFormDialog
        target={creating ? "new" : null}
        onClose={() => setCreating(false)}
        onSaved={(saved) => navigate(`/seller/partners/${encodeURIComponent(saved.id)}`)}
      />
    </div>
  );
}
