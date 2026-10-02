import { describe, expect, it } from "vitest";
import { serverClock } from "@/shared/lib/time";
import { shouldPromptUnconfirmed } from "./timing";

describe("shouldPromptUnconfirmed", () => {
  // Đồng hồ máy khách nhanh hơn server 1 giờ: nếu dùng Date.now() trực tiếp sẽ cảnh báo ngay.
  const receivedAt = Date.parse("2026-10-01T09:00:10Z");
  const clock = serverClock("2026-10-01T08:00:10Z", receivedAt);
  const created = "2026-10-01T08:00:00Z";

  it("không cảnh báo trước 60 giây dù đồng hồ máy khách lệch", () => {
    expect(shouldPromptUnconfirmed("sent", created, clock, null, receivedAt)).toBe(false);
    expect(shouldPromptUnconfirmed("sent", created, clock, null, receivedAt + 49_000)).toBe(false);
  });

  it("cảnh báo khi quá 60 giây và còn sent", () => {
    expect(shouldPromptUnconfirmed("sent", created, clock, null, receivedAt + 50_000)).toBe(true);
    expect(shouldPromptUnconfirmed("accepted", created, clock, null, receivedAt + 50_000)).toBe(false);
  });

  it("Chờ thêm ẩn hộp 60 giây rồi hiện lại", () => {
    const snoozedAt = Date.parse("2026-10-01T08:01:00Z");
    expect(shouldPromptUnconfirmed("sent", created, clock, snoozedAt, receivedAt + 50_000)).toBe(false);
    expect(shouldPromptUnconfirmed("sent", created, clock, snoozedAt, receivedAt + 109_000)).toBe(false);
    expect(shouldPromptUnconfirmed("sent", created, clock, snoozedAt, receivedAt + 110_000)).toBe(true);
  });
});
