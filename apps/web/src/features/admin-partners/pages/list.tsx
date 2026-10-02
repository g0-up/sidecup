import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { errorMessage } from "@/shared/api/errors";
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
          <Table>
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
                <TableRow key={p.id} className={p.active ? undefined : "text-muted-foreground"}>
                  <TableCell className="font-medium">
                    <Link to={`/seller/partners/${encodeURIComponent(p.id)}`} className="text-primary underline-offset-4 hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>{p.active ? <Badge>Đang hợp tác</Badge> : <Badge variant="secondary">Ngừng</Badge>}</TableCell>
                  <TableCell className="tabular-nums">{formatRatePercent(p.commission_rate)}</TableCell>
                  <TableCell>{PAYOUT_LABEL[p.payout_period] ?? p.payout_period}</TableCell>
                  <TableCell className="min-w-48 whitespace-normal">{summarizeOpenHours(p.open_hours)}</TableCell>
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
