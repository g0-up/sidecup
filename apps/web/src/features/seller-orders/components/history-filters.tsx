import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { listPartners, partnersKey } from "@/features/admin-partners/api";
import { todayISO } from "@/features/admin-reports/period";
import { FieldError } from "@/features/admin-products/form-field";
import { SELLER_STATUS_LABEL, type OrderStatus } from "@/shared/lib/order-status";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import {
  canStepForward,
  changeMode,
  HISTORY_MODE_LABEL,
  historyError,
  periodLabel,
  step,
  type HistoryFilter,
  type HistoryMode,
} from "../history-filter";

const ALL = "all";
// Mọi nút và ô chọn cao 44px để bấm chắc tay trên điện thoại.
const trigger = "w-full data-[size=default]:h-11";

interface Props {
  value: HistoryFilter;
  onChange: (value: HistoryFilter) => void;
}

export function HistoryFilters({ value, onChange }: Props) {
  const set = (patch: Partial<HistoryFilter>) => onChange({ ...value, ...patch });
  const error = historyError(value);
  const partners = useQuery({ queryKey: partnersKey, queryFn: ({ signal }) => listPartners(signal) });
  const partnerOptions = [...(partners.data ?? [])]
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name, "vi"))
    .map((p) => ({ id: p.id, name: p.active ? p.name : `${p.name} (ngừng)` }));

  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:flex sm:flex-wrap sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="history-mode">Thời gian</Label>
          <Select value={value.mode} onValueChange={(v) => onChange(changeMode(value, v as HistoryMode))}>
            <SelectTrigger id="history-mode" className={`${trigger} sm:w-40`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(HISTORY_MODE_LABEL) as HistoryMode[]).map((m) => (
                <SelectItem key={m} value={m}>
                  {HISTORY_MODE_LABEL[m]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {value.mode === "range" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="history-from">Từ ngày</Label>
              <Input
                id="history-from"
                type="date"
                className="h-11 w-full sm:w-40"
                value={value.from}
                onChange={(e) => set({ from: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="history-to">Đến ngày</Label>
              <Input id="history-to" type="date" className="h-11 w-full sm:w-40" value={value.to} onChange={(e) => set({ to: e.target.value })} />
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            {value.mode === "day" ? (
              <Label htmlFor="history-day">Ngày</Label>
            ) : (
              <span className="block text-sm leading-none font-medium">
                {HISTORY_MODE_LABEL[value.mode]}
              </span>
            )}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="size-11" aria-label="Kỳ trước" disabled={!!error} onClick={() => onChange(step(value, -1))}>
                <ChevronLeft />
              </Button>
              {value.mode === "day" ? (
                <Input
                  id="history-day"
                  type="date"
                  className="h-11 min-w-0 flex-1 sm:w-40 sm:flex-none"
                  max={todayISO()}
                  value={value.anchor}
                  onChange={(e) => set({ anchor: e.target.value })}
                />
              ) : (
                <p
                  aria-live="polite"
                  className="flex h-11 flex-1 items-center justify-center rounded-md border px-3 text-sm whitespace-nowrap tabular-nums sm:min-w-44 sm:flex-none"
                >
                  <span className="sr-only">{HISTORY_MODE_LABEL[value.mode]} </span>
                  {periodLabel(value)}
                </p>
              )}
              <Button
                variant="outline"
                size="icon"
                className="size-11"
                aria-label="Kỳ sau"
                disabled={!canStepForward(value)}
                onClick={() => onChange(step(value, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="history-status">Trạng thái</Label>
          <Select value={value.status ?? ALL} onValueChange={(v) => set({ status: v === ALL ? null : (v as OrderStatus) })}>
            <SelectTrigger id="history-status" className={`${trigger} sm:w-44`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Mọi trạng thái</SelectItem>
              {(Object.keys(SELLER_STATUS_LABEL) as OrderStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {SELLER_STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="history-partner">Quán</Label>
          <Select value={value.partnerId ?? ALL} onValueChange={(v) => set({ partnerId: v === ALL ? null : v })}>
            <SelectTrigger id="history-partner" className={`${trigger} sm:w-52`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tất cả quán</SelectItem>
              {partnerOptions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <FieldError message={error ?? undefined} />
    </div>
  );
}
