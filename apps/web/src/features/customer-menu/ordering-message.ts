import type { Ordering } from "./api";

export function orderingMessage(o: Ordering): string | null {
  if (o.enabled) return null;
  switch (o.reason) {
    case "paused":
      return "Quán tạm ngưng nhận đơn, bạn thử lại sau ít phút nhé";
    case "closed":
      return o.hours_today.length > 0
        ? `Ngoài giờ bán (${o.hours_today.join(", ")})`
        : "Hôm nay quán không bán";
    default:
      return "Quán hiện không nhận đơn qua mã này";
  }
}
