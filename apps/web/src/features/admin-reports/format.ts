const pctFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

// Tỷ lệ đặt = đơn / thiết bị mở trang; chưa có lượt mở thì không có tỷ lệ.
export function formatConversion(orders: number, views: number): string {
  if (views <= 0) return "—";
  return `${pctFmt.format((orders / views) * 100)}%`;
}

const dayFmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

// "2026-10-01" → "01/10/2026" (chuỗi ngày thuần, không đổi múi giờ).
export function formatDay(iso: string): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isNaN(t) ? iso : dayFmt.format(t);
}

export function formatDayRange(from: string, to: string): string {
  return from === to ? formatDay(from) : `${formatDay(from)} – ${formatDay(to)}`;
}
