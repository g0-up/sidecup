// Bộ lọc tab "Tất cả đơn" → khoảng ngày from–to cho API. Ngày là chuỗi YYYY-MM-DD theo giờ Việt Nam;
// mọi phép tính làm trên chuỗi ISO (UTC), không dùng getter giờ địa phương của máy.
import { addDays, todayISO, validateRange } from "@/features/admin-reports/period";
import type { OrderStatus } from "@/shared/lib/order-status";

export type HistoryMode = "day" | "week" | "month" | "range";

export const HISTORY_MODE_LABEL: Record<HistoryMode, string> = {
  day: "Ngày",
  week: "Tuần",
  month: "Tháng",
  range: "Khoảng ngày",
};

export interface HistoryFilter {
  mode: HistoryMode;
  anchor: string; // một ngày bất kỳ trong ngày/tuần/tháng đang xem
  from: string; // dùng khi mode = range
  to: string;
  status: OrderStatus | null; // null = mọi trạng thái
  partnerId: string | null; // null = tất cả quán
}

export type HistoryParams = Record<string, string | undefined>;

export function defaultHistoryFilter(now: Date = new Date()): HistoryFilter {
  const today = todayISO(now);
  return { mode: "day", anchor: today, from: addDays(today, -6), to: today, status: null, partnerId: null };
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function iso(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Tuần Thứ Hai → Chủ Nhật.
function mondayOf(day: string): string {
  const wd = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, -((wd + 6) % 7));
}

// addMonths giữ ngày trong tháng, kẹp về ngày cuối khi tháng đích ngắn hơn (31/03 − 1 tháng → 28 hoặc 29/02).
function addMonths(day: string, n: number): string {
  const [y, m, d] = parts(day);
  const total = y * 12 + (m - 1) + n;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  return iso(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}

export function historyRange(f: HistoryFilter): { from: string; to: string } {
  switch (f.mode) {
    case "day":
      return { from: f.anchor, to: f.anchor };
    case "week": {
      const from = mondayOf(f.anchor);
      return { from, to: addDays(from, 6) };
    }
    case "month": {
      const [y, m] = parts(f.anchor);
      return { from: iso(y, m, 1), to: iso(y, m, daysInMonth(y, m)) };
    }
    case "range":
      return { from: f.from, to: f.to };
  }
}

export function step(f: HistoryFilter, dir: 1 | -1): HistoryFilter {
  switch (f.mode) {
    case "day":
      return { ...f, anchor: addDays(f.anchor, dir) };
    case "week":
      return { ...f, anchor: addDays(f.anchor, 7 * dir) };
    case "month":
      return { ...f, anchor: addMonths(f.anchor, dir) };
    case "range":
      return f;
  }
}

// changeMode: sang "Khoảng ngày" thì điền sẵn kỳ đang xem để người bán chỉ cần nới thêm. Ô ngày đang trống
// (người bán đã xoá) thì về hôm nay, vì tuần/tháng không tính được từ ngày trống.
export function changeMode(f: HistoryFilter, mode: HistoryMode, now: Date = new Date()): HistoryFilter {
  if (mode === f.mode) return f;
  const anchorOk = validateRange(f.anchor, f.anchor) === null;
  if (mode === "range") return anchorOk ? { ...f, mode, ...historyRange(f) } : { ...f, mode };
  return { ...f, mode, anchor: anchorOk ? f.anchor : todayISO(now) };
}

// canStepForward: kỳ sau không được bắt đầu sau hôm nay.
export function canStepForward(f: HistoryFilter, now: Date = new Date()): boolean {
  if (f.mode === "range" || historyError(f)) return false;
  return historyRange(step(f, 1)).from <= todayISO(now);
}

function dayMonth(day: string): string {
  const [, m, d] = parts(day);
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

function fullDay(day: string): string {
  return `${dayMonth(day)}/${parts(day)[0]}`;
}

// periodLabel: "17/10/2026", "12/10 – 18/10/2026", "29/12/2025 – 04/01/2026", "Tháng 10/2026".
export function periodLabel(f: HistoryFilter): string {
  const { from, to } = historyRange(f);
  if (f.mode === "month") {
    const [y, m] = parts(from);
    return `Tháng ${m}/${y}`;
  }
  if (from === to) return fullDay(from);
  const sameYear = parts(from)[0] === parts(to)[0];
  return `${sameYear ? dayMonth(from) : fullDay(from)} – ${fullDay(to)}`;
}

// historyError: câu báo lỗi giống API, hoặc null khi lọc được.
export function historyError(f: HistoryFilter): string | null {
  if (f.mode === "range") return validateRange(f.from, f.to);
  return validateRange(f.anchor, f.anchor) === null ? null : "Chọn ngày";
}

export function historyParams(f: HistoryFilter): HistoryParams {
  return { ...historyRange(f), status: f.status ?? undefined, partner_id: f.partnerId ?? undefined };
}
