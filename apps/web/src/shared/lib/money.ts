// 1035000 → "1.035.000đ"; VND không có phần lẻ.
export function formatVND(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const digits = Math.abs(Math.round(amount)).toString();
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}đ`;
}
