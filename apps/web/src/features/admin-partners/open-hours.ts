// Giờ bán của quán, cùng hình dạng với API: days theo ISO (1 = Thứ Hai … 7 = Chủ Nhật),
// from/to dạng "HH:MM"; to < from nghĩa là khung qua nửa đêm (kéo sang sáng hôm sau).
export interface OpenWindow {
  days: number[];
  from: string;
  to: string;
}

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const DAY_LABEL: Record<number, string> = { 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 7: "CN" };

export const DEFAULT_WINDOW: OpenWindow = { days: [...WEEKDAYS], from: "11:00", to: "13:30" };

const DAY_MINUTES = 24 * 60;
const WEEK_MINUTES = 7 * DAY_MINUTES;

// parseHHMM trả số phút từ 00:00, hoặc null nếu không đúng dạng HH:MM (giống kiểm tra ở API).
export function parseHHMM(s: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

export interface OpenHoursIssue {
  // Chỉ số khung (0-based); null là lỗi chung của cả danh sách.
  row: number | null;
  message: string;
}

// validateOpenHours kiểm tra giống API (thiếu thứ, giờ sai, từ = đến) và thêm kiểm tra khung trùng giờ
// để người bán không nhập hai khung chồng nhau mà không biết.
export function validateOpenHours(hours: OpenWindow[]): OpenHoursIssue[] {
  if (hours.length === 0) return [{ row: null, message: "Cần ít nhất một khung giờ bán" }];
  const issues: OpenHoursIssue[] = [];
  const intervals: { row: number; start: number; end: number }[] = [];

  hours.forEach((w, row) => {
    if (w.days.length === 0) {
      issues.push({ row, message: "Chọn ít nhất một thứ" });
      return;
    }
    if (w.days.some((d) => !Number.isInteger(d) || d < 1 || d > 7) || new Set(w.days).size !== w.days.length) {
      issues.push({ row, message: "Thứ không hợp lệ" });
      return;
    }
    const from = parseHHMM(w.from);
    const to = parseHHMM(w.to);
    if (from === null || to === null) {
      issues.push({ row, message: "Giờ phải có dạng HH:MM, ví dụ 11:00" });
      return;
    }
    if (from === to) {
      issues.push({ row, message: "Giờ bắt đầu và kết thúc trùng nhau" });
      return;
    }
    const length = to > from ? to - from : to + DAY_MINUTES - from;
    for (const d of w.days) {
      const start = (d - 1) * DAY_MINUTES + from;
      const end = start + length;
      // Khung CN qua nửa đêm tràn sang sáng T2 đầu tuần.
      if (end > WEEK_MINUTES) {
        intervals.push({ row, start, end: WEEK_MINUTES }, { row, start: 0, end: end - WEEK_MINUTES });
      } else {
        intervals.push({ row, start, end });
      }
    }
  });

  const overlapped = new Map<number, number>();
  for (const a of intervals) {
    for (const b of intervals) {
      if (b.row <= a.row || overlapped.has(b.row)) continue;
      if (a.start < b.end && b.start < a.end) overlapped.set(b.row, a.row);
    }
  }
  for (const [row, other] of overlapped) {
    issues.push({ row, message: `Trùng giờ với khung ${other + 1}` });
  }
  return issues.sort((x, y) => (x.row ?? -1) - (y.row ?? -1));
}

// formatDays: [1..5] → "T2–T6"; [1,3,5] → "T2, T4, T6"; chuỗi liên tiếp từ 3 ngày gộp bằng gạch nối.
export function formatDays(days: number[]): string {
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    if (j - i >= 2) {
      parts.push(`${DAY_LABEL[sorted[i]]}–${DAY_LABEL[sorted[j]]}`);
    } else {
      for (let k = i; k <= j; k++) parts.push(DAY_LABEL[sorted[k]]);
    }
    i = j + 1;
  }
  return parts.join(", ");
}

// summarizeOpenHours: "T2–T6 11:00–13:30; T7, CN 08:00–10:00".
export function summarizeOpenHours(hours: OpenWindow[]): string {
  if (hours.length === 0) return "Chưa đặt giờ bán";
  return hours.map((w) => `${formatDays(w.days)} ${w.from}–${w.to}`).join("; ");
}
