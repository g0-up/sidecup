import { FieldError } from "@/features/admin-products/form-field";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { filterError, PERIOD_LABEL, type PeriodMode, type ReportFilter } from "../period";

const ALL = "all";

export interface PartnerOption {
  id: string;
  name: string;
}

interface Props {
  value: ReportFilter;
  onChange: (value: ReportFilter) => void;
  partners: PartnerOption[];
}

export function ReportFilters({ value, onChange, partners }: Props) {
  const set = (patch: Partial<ReportFilter>) => onChange({ ...value, ...patch });
  const error = filterError(value);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="report-partner">Quán</Label>
          <Select value={value.partnerId ?? ALL} onValueChange={(v) => set({ partnerId: v === ALL ? null : v })}>
            <SelectTrigger id="report-partner" className="w-52">
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
          <Label htmlFor="report-mode">Thời gian</Label>
          <Select value={value.mode} onValueChange={(v) => set({ mode: v as PeriodMode })}>
            <SelectTrigger id="report-mode" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABEL) as PeriodMode[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {PERIOD_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {value.mode === "day" && (
          <div className="space-y-1.5">
            <Label htmlFor="report-day">Ngày</Label>
            <Input id="report-day" type="date" className="w-40" value={value.day} onChange={(e) => set({ day: e.target.value })} />
          </div>
        )}
        {value.mode === "range" && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="report-from">Từ ngày</Label>
              <Input id="report-from" type="date" className="w-40" value={value.from} onChange={(e) => set({ from: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="report-to">Đến ngày</Label>
              <Input id="report-to" type="date" className="w-40" value={value.to} onChange={(e) => set({ to: e.target.value })} />
            </div>
          </>
        )}
      </div>
      {(value.mode === "current" || value.mode === "previous") && (
        <p className="text-xs text-muted-foreground">Mỗi quán tính theo kỳ trả của quán đó (tuần: T2–CN, tháng: ngày 1 – cuối tháng).</p>
      )}
      <FieldError message={error ?? undefined} />
    </div>
  );
}
