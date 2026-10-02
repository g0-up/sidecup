import { describe, expect, it } from "vitest";
import { statusHeadline } from "./status-copy";

const base = { accepted_at: null, eta_minutes: 7 };
// Giờ server lúc vẽ: trước mọi giờ dự kiến trong các ca dưới.
const NOW = Date.parse("2026-10-02T03:00:00Z");

describe("statusHeadline", () => {
  it("mỗi trạng thái có một câu riêng", () => {
    expect(statusHeadline({ ...base, status: "sent" }, NOW)).toBe("Đã gửi đơn, chờ quán xác nhận");
    expect(statusHeadline({ ...base, status: "delivering" }, NOW)).toBe("Nước đang được mang ra bàn");
    expect(statusHeadline({ ...base, status: "paid" }, NOW)).toBe("Cảm ơn bạn! Chúc ngon miệng");
    expect(statusHeadline({ ...base, status: "rejected" }, NOW)).toBe("Quán từ chối");
    expect(statusHeadline({ ...base, status: "cancelled" }, NOW)).toBe("Đã huỷ");
    expect(statusHeadline({ ...base, status: "failed" }, NOW)).toBe("Không giao được");
  });

  it("đang pha: giờ dự kiến = lúc nhận + ETA, theo giờ Sài Gòn", () => {
    // 03:10 UTC = 10:10 Sài Gòn; + 7 phút.
    expect(statusHeadline({ status: "accepted", accepted_at: "2026-10-02T03:10:00Z", eta_minutes: 7 }, NOW)).toBe(
      "Quán đang pha, nước tới khoảng 10:17",
    );
  });

  it("đang pha qua nửa đêm vẫn ra giờ đúng", () => {
    // 16:55 UTC = 23:55 Sài Gòn; + 10 phút = 00:05 hôm sau.
    expect(statusHeadline({ status: "accepted", accepted_at: "2026-10-02T16:55:00Z", eta_minutes: 10 }, NOW)).toBe(
      "Quán đang pha, nước tới khoảng 00:05",
    );
  });

  it("đang pha mà chưa có giờ nhận thì bỏ giờ", () => {
    expect(statusHeadline({ status: "accepted", accepted_at: null, eta_minutes: 7 }, NOW)).toBe("Quán đang pha nước cho bạn");
  });

  it("đang pha mà đã qua giờ dự kiến thì không hứa giờ đã qua", () => {
    const accepted = { status: "accepted", accepted_at: "2026-10-02T03:10:00Z", eta_minutes: 7 } as const;
    expect(statusHeadline(accepted, Date.parse("2026-10-02T03:16:59Z"))).toBe("Quán đang pha, nước tới khoảng 10:17");
    expect(statusHeadline(accepted, Date.parse("2026-10-02T03:17:00Z"))).toBe("Quán đang pha, sắp xong");
  });
});
