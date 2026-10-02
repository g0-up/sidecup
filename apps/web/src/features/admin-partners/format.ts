const percentFmt = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 2 });

// 0.15 → "15%"; 0.125 → "12,5%".
export function formatRatePercent(rate: number): string {
  return `${percentFmt.format(Math.round(rate * 10000) / 100)}%`;
}

export const PAYOUT_LABEL: Record<string, string> = { week: "Theo tuần", month: "Theo tháng" };
