import { elapsedMs, type ServerClock } from "@/shared/lib/time";

export const UNCONFIRMED_AFTER_MS = 60_000;
export const SNOOZE_MS = 60_000;

// shouldPromptUnconfirmed: đơn còn `sent` quá 60 giây (tính theo giờ server) và khách chưa bấm "Chờ thêm"
// trong 60 giây gần nhất (snoozedAt cũng là giờ server ước lượng).
export function shouldPromptUnconfirmed(
  status: string,
  createdAt: string,
  clock: ServerClock,
  snoozedAtServerMs: number | null,
  now = Date.now(),
): boolean {
  if (status !== "sent") return false;
  if (elapsedMs(createdAt, clock, now) < UNCONFIRMED_AFTER_MS) return false;
  if (snoozedAtServerMs === null) return true;
  const serverNowMs = Date.parse(clock.serverTime) + (now - clock.receivedAt);
  return serverNowMs - snoozedAtServerMs >= SNOOZE_MS;
}
