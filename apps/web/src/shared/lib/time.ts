// Mốc thời gian phía client luôn suy ra từ server_time để không lệ thuộc đồng hồ máy khách bị lệch.

export interface ServerClock {
  serverTime: string; // ISO từ response
  receivedAt: number; // performance-độc lập: Date.now() lúc nhận response
}

export function serverClock(serverTime: string, receivedAt = Date.now()): ServerClock {
  return { serverTime, receivedAt };
}

// serverNow ước lượng giờ server hiện tại = server_time + thời gian đã trôi kể từ lúc nhận.
export function serverNow(clock: ServerClock, now = Date.now()): number {
  return Date.parse(clock.serverTime) + (now - clock.receivedAt);
}

// elapsedMs tính thời gian từ `since` (giờ server) tới hiện tại theo giờ server.
export function elapsedMs(since: string, clock: ServerClock, now = Date.now()): number {
  return Math.max(0, serverNow(clock, now) - Date.parse(since));
}

// "3 phút 05 giây" / "45 giây"
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m === 0) return `${s} giây`;
  return `${m} phút ${String(s).padStart(2, "0")} giây`;
}

const timeFmt = new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
const dateFmt = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "Asia/Ho_Chi_Minh",
});

export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}
