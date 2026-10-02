// Bộ lọc báo cáo → tham số query cho API. Ngày luôn theo giờ Việt Nam (APP_TZ của server).
export type PeriodMode = "current" | "previous" | "day" | "range";

export const PERIOD_LABEL: Record<PeriodMode, string> = {
  current: "Kỳ hiện tại",
  previous: "Kỳ trước",
  day: "Ngày",
  range: "Khoảng ngày",
};

export interface ReportFilter {
  partnerId: string | null; // null = tất cả quán
  mode: PeriodMode;
  day: string; // YYYY-MM-DD, dùng khi mode = day
  from: string; // YYYY-MM-DD, dùng khi mode = range
  to: string;
}

export type ReportParams = Record<string, string | undefined>;

const TZ = "Asia/Ho_Chi_Minh";
const MAX_RANGE_DAYS = 366;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// todayISO: ngày hôm nay theo giờ Việt Nam, không phụ thuộc múi giờ của máy.
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function parseISO(d: string): number | null {
  if (!ISO_DATE.test(d)) return null;
  const t = Date.parse(`${d}T00:00:00Z`);
  if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== d) return null;
  return t;
}

export function addDays(iso: string, n: number): string {
  const t = parseISO(iso);
  if (t === null) throw new Error(`Ngày không hợp lệ: ${iso}`);
  return new Date(t + n * 86_400_000).toISOString().slice(0, 10);
}

// lastNDays: n ngày gần nhất tính cả hôm nay (mặc định phễu 7 ngày, giống API).
export function lastNDays(n: number, now: Date = new Date()): { from: string; to: string } {
  const to = todayISO(now);
  return { from: addDays(to, -(n - 1)), to };
}

export function defaultFilter(now: Date = new Date()): ReportFilter {
  const today = todayISO(now);
  return { partnerId: null, mode: "current", day: today, from: addDays(today, -6), to: today };
}

// validateRange trả lỗi tiếng Việt (giống API) hoặc null.
export function validateRange(from: string, to: string): string | null {
  const f = parseISO(from);
  const t = parseISO(to);
  if (f === null || t === null) return "Chọn đủ ngày bắt đầu và kết thúc";
  if (t < f) return "Ngày kết thúc phải sau ngày bắt đầu";
  if ((t - f) / 86_400_000 + 1 > MAX_RANGE_DAYS) return "Khoảng ngày tối đa 366 ngày";
  return null;
}

export function filterError(f: ReportFilter): string | null {
  if (f.mode === "day") return parseISO(f.day) === null ? "Chọn ngày" : null;
  if (f.mode === "range") return validateRange(f.from, f.to);
  return null;
}

function dates(f: ReportFilter): { from: string; to: string } {
  return f.mode === "day" ? { from: f.day, to: f.day } : { from: f.from, to: f.to };
}

// commissionParams: kỳ hiện tại/kỳ trước để server tự tính theo kỳ trả của từng quán (tuần hoặc tháng);
// ngày/khoảng ngày gửi from–to cố định.
export function commissionParams(f: ReportFilter): ReportParams {
  const partner_id = f.partnerId ?? undefined;
  if (f.mode === "current" || f.mode === "previous") return { partner_id, period: f.mode };
  return { partner_id, ...dates(f) };
}

// adjustmentParams: API chỉ lọc điều chỉnh theo kỳ khi đã chọn một quán (mỗi quán một kỳ);
// "tất cả quán" + kỳ thì lấy 90 ngày gần nhất (mặc định của API).
export function adjustmentParams(f: ReportFilter): ReportParams {
  if ((f.mode === "current" || f.mode === "previous") && f.partnerId === null) return {};
  return commissionParams(f);
}
