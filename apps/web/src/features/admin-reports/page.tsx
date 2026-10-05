import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { listPartners, partnersKey } from "@/features/admin-partners/api";
import { FieldError } from "@/features/admin-products/form-field";
import { errorMessage } from "@/shared/api/errors";
import { useDocumentHead } from "@/shared/hooks/use-document-head";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import {
  adjustmentsKey,
  commissionKey,
  funnelKey,
  getCommission,
  getFunnel,
  listAdjustments,
} from "./api";
import { AdjustmentForm } from "./components/adjustment-form";
import { AdjustmentList } from "./components/adjustment-list";
import { CommissionTable } from "./components/commission-table";
import { ExportActions } from "./components/export-actions";
import { FunnelTable } from "./components/funnel-table";
import { ReportFilters, type PartnerOption } from "./components/report-filters";
import { adjustmentParams, commissionParams, defaultFilter, filterError, lastNDays, validateRange } from "./period";

export function Component() {
  const partners = useQuery({ queryKey: partnersKey, queryFn: ({ signal }) => listPartners(signal) });
  const options: PartnerOption[] = [...(partners.data ?? [])]
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "vi"))
    .map((p) => ({ id: p.id, name: p.active ? p.name : `${p.name} (ngừng)` }));
  useDocumentHead({ title: "Báo cáo — Gọi nước" });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Báo cáo</h1>
      <Tabs defaultValue="commission">
        <TabsList>
          <TabsTrigger value="commission">Hoa hồng</TabsTrigger>
          <TabsTrigger value="funnel">Phễu</TabsTrigger>
        </TabsList>
        <TabsContent value="commission" className="pt-2">
          <CommissionTab partners={options} />
        </TabsContent>
        <TabsContent value="funnel" className="pt-2">
          <FunnelTab partners={options} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QueryError({ error }: { error: unknown }) {
  return (
    <p role="alert" className="text-destructive">
      {errorMessage(error)}
    </p>
  );
}

function CommissionTab({ partners }: { partners: PartnerOption[] }) {
  const [filter, setFilter] = useState(() => defaultFilter());
  const valid = filterError(filter) === null;
  const params = commissionParams(filter);
  const adjParams = adjustmentParams(filter);

  const report = useQuery({
    queryKey: commissionKey(params),
    queryFn: ({ signal }) => getCommission(params, signal),
    enabled: valid,
    placeholderData: keepPreviousData,
  });
  const adjustments = useQuery({
    queryKey: adjustmentsKey(adjParams),
    queryFn: ({ signal }) => listAdjustments(adjParams, signal),
    enabled: valid,
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-6">
      <ReportFilters value={filter} onChange={setFilter} partners={partners} />

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Hoa hồng theo quán</h2>
          {valid && report.data && !report.isPlaceholderData && <ExportActions filter={filter} rows={report.data.rows} />}
        </div>
        {!valid ? null : report.isPending ? (
          <p className="text-muted-foreground">Đang tải…</p>
        ) : report.error ? (
          <QueryError error={report.error} />
        ) : (
          <CommissionTable report={report.data} />
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Ghi điều chỉnh</h2>
        <AdjustmentForm key={filter.partnerId ?? "all"} partners={partners} defaultPartnerId={filter.partnerId} />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Điều chỉnh</h2>
        {Object.keys(adjParams).length === 0 && (
          <p className="text-xs text-muted-foreground">Tất cả quán: hiện điều chỉnh trong 90 ngày gần nhất.</p>
        )}
        {!valid ? null : adjustments.isPending ? (
          <p className="text-muted-foreground">Đang tải…</p>
        ) : adjustments.error ? (
          <QueryError error={adjustments.error} />
        ) : (
          <AdjustmentList items={adjustments.data} />
        )}
      </section>
    </div>
  );
}

const ALL = "all";

function FunnelTab({ partners }: { partners: PartnerOption[] }) {
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [range, setRange] = useState(() => lastNDays(7));
  const rangeError = validateRange(range.from, range.to);
  const params = { partner_id: partnerId ?? undefined, from: range.from, to: range.to };

  const funnel = useQuery({
    queryKey: funnelKey(params),
    queryFn: ({ signal }) => getFunnel(params, signal),
    enabled: rangeError === null,
    placeholderData: keepPreviousData,
  });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="funnel-partner">Quán</Label>
          <Select value={partnerId ?? ALL} onValueChange={(v) => setPartnerId(v === ALL ? null : v)}>
            <SelectTrigger id="funnel-partner" className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả quán</SelectItem>
              {partners.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="funnel-from">Từ ngày</Label>
          <Input
            id="funnel-from"
            type="date"
            className="w-full sm:w-40"
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="funnel-to">Đến ngày</Label>
          <Input
            id="funnel-to"
            type="date"
            className="w-full sm:w-40"
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
          />
        </div>
      </div>
      <FieldError message={rangeError ?? undefined} />
      <p className="text-xs text-muted-foreground">Tỷ lệ đặt = số đơn / số thiết bị mở trang menu.</p>
      {rangeError ? null : funnel.isPending ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : funnel.error ? (
        <QueryError error={funnel.error} />
      ) : (
        <FunnelTable rows={funnel.data.rows} />
      )}
    </div>
  );
}
