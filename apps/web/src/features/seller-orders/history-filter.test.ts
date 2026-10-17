import { describe, expect, it } from "vitest";
import {
  canStepForward,
  changeMode,
  defaultHistoryFilter,
  historyError,
  historyParams,
  historyRange,
  periodLabel,
  step,
  type HistoryFilter,
} from "./history-filter";

// 10:00 ngày 17/10/2026 giờ Việt Nam (Thứ Bảy).
const NOW = new Date("2026-10-17T03:00:00Z");

const base: HistoryFilter = { ...defaultHistoryFilter(NOW) };

describe("defaultHistoryFilter", () => {
  it("mặc định xem hôm nay theo giờ Việt Nam, mọi trạng thái và mọi quán", () => {
    expect(base).toEqual({
      mode: "day",
      anchor: "2026-10-17",
      from: "2026-10-11",
      to: "2026-10-17",
      status: null,
      partnerId: null,
    });
    // 18:30 UTC ngày 16/10 đã là 01:30 ngày 17/10 ở Việt Nam.
    expect(defaultHistoryFilter(new Date("2026-10-16T18:30:00Z")).anchor).toBe("2026-10-17");
  });
});

describe("historyRange", () => {
  it("tuần chạy từ Thứ Hai đến Chủ Nhật, kể cả khi đang ở Chủ Nhật", () => {
    expect(historyRange({ ...base, mode: "week", anchor: "2026-10-18" })).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(historyRange({ ...base, mode: "week", anchor: "2026-10-12" })).toEqual({ from: "2026-10-12", to: "2026-10-18" });
  });

  it("tuần vắt qua năm mới", () => {
    expect(historyRange({ ...base, mode: "week", anchor: "2026-01-01" })).toEqual({ from: "2025-12-29", to: "2026-01-04" });
  });

  it("tháng từ ngày 1 đến ngày cuối, có năm nhuận", () => {
    expect(historyRange({ ...base, mode: "month", anchor: "2026-10-17" })).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(historyRange({ ...base, mode: "month", anchor: "2028-02-10" })).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("khoảng ngày dùng nguyên from–to", () => {
    expect(historyRange({ ...base, mode: "range" })).toEqual({ from: "2026-10-11", to: "2026-10-17" });
  });
});

describe("step", () => {
  it("lùi một ngày, một tuần qua tháng", () => {
    expect(step(base, -1).anchor).toBe("2026-10-16");
    expect(historyRange(step({ ...base, mode: "week", anchor: "2026-10-01" }, -1))).toEqual({ from: "2026-09-21", to: "2026-09-27" });
  });

  it("lùi một tháng từ 31/03 kẹp về ngày cuối tháng Hai", () => {
    expect(step({ ...base, mode: "month", anchor: "2026-03-31" }, -1).anchor).toBe("2026-02-28");
    expect(step({ ...base, mode: "month", anchor: "2028-03-31" }, -1).anchor).toBe("2028-02-29");
    expect(step({ ...base, mode: "month", anchor: "2026-01-15" }, -1).anchor).toBe("2025-12-15");
    expect(step({ ...base, mode: "month", anchor: "2025-12-15" }, 1).anchor).toBe("2026-01-15");
  });
});

describe("changeMode", () => {
  it("sang Khoảng ngày thì điền sẵn kỳ đang xem", () => {
    expect(changeMode({ ...base, mode: "week" }, "range", NOW)).toMatchObject({ mode: "range", from: "2026-10-12", to: "2026-10-18" });
  });

  it("ô ngày đã xoá trống thì tuần/tháng tính từ hôm nay, không ném lỗi", () => {
    const cleared = { ...base, anchor: "" };
    const week = changeMode(cleared, "week", NOW);
    expect(week.anchor).toBe("2026-10-17");
    expect(periodLabel(week)).toBe("12/10 – 18/10/2026");
    expect(historyParams(changeMode(cleared, "month", NOW))).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(changeMode(cleared, "range", NOW)).toMatchObject({ mode: "range", from: "2026-10-11", to: "2026-10-17" });
  });
});

describe("canStepForward", () => {
  it("không sang được kỳ bắt đầu sau hôm nay", () => {
    expect(canStepForward(base, NOW)).toBe(false);
    expect(canStepForward({ ...base, mode: "week" }, NOW)).toBe(false);
    expect(canStepForward({ ...base, mode: "month" }, NOW)).toBe(false);
  });

  it("lùi một kỳ thì sang lại được", () => {
    expect(canStepForward(step(base, -1), NOW)).toBe(true);
    const week = { ...base, mode: "week" as const };
    expect(canStepForward(step(week, -1), NOW)).toBe(true);
    const month = { ...base, mode: "month" as const };
    expect(canStepForward(step(month, -1), NOW)).toBe(true);
  });

  it("khoảng ngày và ngày trống không có kỳ sau", () => {
    expect(canStepForward({ ...base, mode: "range", to: "2026-10-01" }, NOW)).toBe(false);
    expect(canStepForward({ ...base, anchor: "" }, NOW)).toBe(false);
  });
});

describe("periodLabel", () => {
  it("định dạng theo kiểu xem", () => {
    expect(periodLabel(base)).toBe("17/10/2026");
    expect(periodLabel({ ...base, mode: "week", anchor: "2026-10-18" })).toBe("12/10 – 18/10/2026");
    expect(periodLabel({ ...base, mode: "week", anchor: "2026-01-01" })).toBe("29/12/2025 – 04/01/2026");
    expect(periodLabel({ ...base, mode: "month" })).toBe("Tháng 10/2026");
    expect(periodLabel({ ...base, mode: "range", from: "2026-10-05", to: "2026-10-05" })).toBe("05/10/2026");
  });
});

describe("historyError", () => {
  it("báo lỗi khoảng ngày như API, ngày trống thì nhắc chọn ngày", () => {
    expect(historyError(base)).toBeNull();
    expect(historyError({ ...base, mode: "range", from: "2026-10-17", to: "2026-10-01" })).toBe("Ngày kết thúc phải sau ngày bắt đầu");
    expect(historyError({ ...base, mode: "range", from: "2025-01-01", to: "2026-10-17" })).toBe("Khoảng ngày tối đa 366 ngày");
    expect(historyError({ ...base, anchor: "" })).toBe("Chọn ngày");
  });
});

describe("historyParams", () => {
  it("bỏ trạng thái và quán khi không lọc", () => {
    expect(historyParams(base)).toEqual({ from: "2026-10-17", to: "2026-10-17", status: undefined, partner_id: undefined });
  });

  it("gửi trạng thái và mã quán khi có", () => {
    expect(historyParams({ ...base, mode: "month", status: "rejected", partnerId: "p1" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-31",
      status: "rejected",
      partner_id: "p1",
    });
  });
});
