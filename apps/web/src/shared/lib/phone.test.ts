import { describe, expect, it } from "vitest";
import { formatVND } from "./money";
import { isVNMobile, normalizePhone } from "./phone";
import { elapsedMs, formatElapsed, serverClock } from "./time";

describe("phone", () => {
  it("chấp nhận số 10 chữ số bắt đầu bằng 0 sau khi bỏ khoảng trắng", () => {
    expect(isVNMobile("0901234567")).toBe(true);
    expect(isVNMobile("090 123 4567")).toBe(true);
    expect(isVNMobile("090.123.4567")).toBe(true);
    expect(isVNMobile("+84901234567")).toBe(true);
    expect(normalizePhone("+84 90 123 4567")).toBe("0901234567");
    expect(isVNMobile("901234567")).toBe(false);
    expect(isVNMobile("09012345678")).toBe(false);
    expect(isVNMobile("09012a4567")).toBe(false);
    expect(isVNMobile("")).toBe(false);
  });
});

describe("money", () => {
  it("định dạng VND có dấu chấm", () => {
    expect(formatVND(0)).toBe("0đ");
    expect(formatVND(45000)).toBe("45.000đ");
    expect(formatVND(1035000)).toBe("1.035.000đ");
    expect(formatVND(-20000)).toBe("-20.000đ");
  });
});

describe("time", () => {
  it("tính thời gian đã trôi theo đồng hồ server, không theo đồng hồ máy khách", () => {
    // Máy khách chạy chậm 10 phút so với server; đơn tạo lúc server 08:00:00, response trả lúc 08:00:30.
    const receivedAt = Date.parse("2026-10-01T07:50:30Z");
    const clock = serverClock("2026-10-01T08:00:30Z", receivedAt);
    const now = receivedAt + 31_000; // 31 giây sau khi nhận
    expect(elapsedMs("2026-10-01T08:00:00Z", clock, now)).toBe(61_000);
    expect(elapsedMs("2026-10-01T08:05:00Z", clock, now)).toBe(0);
  });

  it("định dạng thời gian đã trôi", () => {
    expect(formatElapsed(45_000)).toBe("45 giây");
    expect(formatElapsed(185_000)).toBe("3 phút 05 giây");
  });
});
