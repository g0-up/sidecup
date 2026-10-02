import { describe, expect, it } from "vitest";
import {
  addDays,
  adjustmentParams,
  commissionParams,
  defaultFilter,
  filterError,
  lastNDays,
  todayISO,
  validateRange,
  type ReportFilter,
} from "./period";

const base: ReportFilter = { partnerId: null, mode: "current", day: "2026-10-01", from: "2026-09-01", to: "2026-09-30" };

describe("todayISO", () => {
  it("lấy ngày theo giờ Việt Nam, không theo UTC", () => {
    // 18:30 UTC ngày 30/9 = 01:30 ngày 1/10 ở Việt Nam.
    expect(todayISO(new Date("2026-09-30T18:30:00Z"))).toBe("2026-10-01");
    expect(todayISO(new Date("2026-09-30T16:59:00Z"))).toBe("2026-09-30");
  });
});

describe("addDays / lastNDays", () => {
  it("qua tháng và năm nhuận", () => {
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("7 ngày gần nhất tính cả hôm nay", () => {
    expect(lastNDays(7, new Date("2026-10-01T05:00:00Z"))).toEqual({ from: "2026-09-25", to: "2026-10-01" });
  });

  it("bộ lọc mặc định: tất cả quán, kỳ hiện tại", () => {
    expect(defaultFilter(new Date("2026-10-01T05:00:00Z"))).toEqual({
      partnerId: null,
      mode: "current",
      day: "2026-10-01",
      from: "2026-09-25",
      to: "2026-10-01",
    });
  });
});

describe("commissionParams", () => {
  it("kỳ hiện tại / kỳ trước để server tính theo kỳ trả của từng quán", () => {
    expect(commissionParams(base)).toEqual({ partner_id: undefined, period: "current" });
    expect(commissionParams({ ...base, mode: "previous", partnerId: "p1" })).toEqual({ partner_id: "p1", period: "previous" });
  });

  it("một ngày → from = to = ngày đó", () => {
    expect(commissionParams({ ...base, mode: "day" })).toEqual({ partner_id: undefined, from: "2026-10-01", to: "2026-10-01" });
  });

  it("khoảng ngày", () => {
    expect(commissionParams({ ...base, mode: "range", partnerId: "p1" })).toEqual({
      partner_id: "p1",
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });
});

describe("adjustmentParams", () => {
  it("tất cả quán + kỳ: không gửi gì (API lấy 90 ngày gần nhất)", () => {
    expect(adjustmentParams(base)).toEqual({});
  });

  it("một quán + kỳ: gửi kỳ", () => {
    expect(adjustmentParams({ ...base, partnerId: "p1" })).toEqual({ partner_id: "p1", period: "current" });
  });

  it("khoảng ngày: gửi from/to kể cả khi tất cả quán", () => {
    expect(adjustmentParams({ ...base, mode: "range" })).toEqual({ partner_id: undefined, from: "2026-09-01", to: "2026-09-30" });
  });
});

describe("validateRange / filterError", () => {
  it("ngày kết thúc trước ngày bắt đầu", () => {
    expect(validateRange("2026-10-02", "2026-10-01")).toBe("Ngày kết thúc phải sau ngày bắt đầu");
  });

  it("thiếu ngày hoặc ngày không tồn tại", () => {
    expect(validateRange("", "2026-10-01")).toBe("Chọn đủ ngày bắt đầu và kết thúc");
    expect(validateRange("2026-02-30", "2026-03-01")).toBe("Chọn đủ ngày bắt đầu và kết thúc");
  });

  it("quá 366 ngày", () => {
    expect(validateRange("2025-01-01", "2026-01-02")).toBe("Khoảng ngày tối đa 366 ngày");
    expect(validateRange("2025-01-01", "2026-01-01")).toBeNull();
  });

  it("chế độ kỳ không cần ngày", () => {
    expect(filterError({ ...base, day: "" })).toBeNull();
    expect(filterError({ ...base, mode: "day", day: "" })).toBe("Chọn ngày");
  });
});
