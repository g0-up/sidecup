import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { FieldError } from "@/features/admin-products/form-field";
import { DAY_LABEL, DEFAULT_WINDOW, parseHHMM, WEEKDAYS, type OpenWindow } from "../open-hours";

interface Props {
  value: OpenWindow[];
  onChange: (value: OpenWindow[]) => void;
  rowErrors?: (string | undefined)[];
  error?: string;
}

// Trình sửa giờ bán nhiều khung: mỗi dòng = các thứ áp dụng + từ + đến.
export function OpenHoursEditor({ value, onChange, rowErrors = [], error }: Props) {
  const update = (i: number, patch: Partial<OpenWindow>) => onChange(value.map((w, k) => (k === i ? { ...w, ...patch } : w)));
  const toggleDay = (i: number, day: number) => {
    const days = value[i].days;
    update(i, { days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b) });
  };

  return (
    <fieldset className="space-y-3">
      <legend className="mb-1 text-sm font-medium">Giờ bán</legend>
      {value.map((w, i) => {
        const from = parseHHMM(w.from);
        const to = parseHHMM(w.to);
        const overnight = from !== null && to !== null && to < from;
        return (
          <div key={i} className="space-y-2 rounded-md border p-3" aria-label={`Khung ${i + 1}`} role="group">
            <div className="flex flex-wrap gap-1">
              {WEEKDAYS.map((d) => {
                const on = w.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={on}
                    aria-label={`Khung ${i + 1} ${DAY_LABEL[d]}`}
                    onClick={() => toggleDay(i, d)}
                    className={cn(
                      "h-9 min-w-10 rounded-md border px-2 text-sm",
                      on ? "border-primary bg-primary/10 font-medium text-primary" : "bg-background text-muted-foreground",
                    )}
                  >
                    {DAY_LABEL[d]}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="time"
                className="w-32"
                aria-label={`Khung ${i + 1} từ`}
                value={w.from}
                onChange={(e) => update(i, { from: e.target.value })}
              />
              <span aria-hidden>–</span>
              <Input
                type="time"
                className="w-32"
                aria-label={`Khung ${i + 1} đến`}
                value={w.to}
                onChange={(e) => update(i, { to: e.target.value })}
              />
              {overnight && <span className="text-xs text-muted-foreground">qua nửa đêm</span>}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ml-auto"
                aria-label={`Xoá khung ${i + 1}`}
                onClick={() => onChange(value.filter((_, k) => k !== i))}
              >
                <Trash2 />
              </Button>
            </div>
            <FieldError message={rowErrors[i]} />
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...value, { ...DEFAULT_WINDOW, days: [] }])}
        >
          <Plus /> Thêm khung giờ
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([{ ...DEFAULT_WINDOW, days: [...WEEKDAYS] }])}>
          Mọi ngày 11:00–13:30
        </Button>
      </div>
      <FieldError message={error} />
    </fieldset>
  );
}
