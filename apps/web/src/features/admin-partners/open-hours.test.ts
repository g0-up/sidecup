import { describe, expect, it } from "vitest";
import { formatDays, summarizeOpenHours, validateOpenHours, type OpenWindow } from "./open-hours";

const all = [1, 2, 3, 4, 5, 6, 7];

describe("validateOpenHours", () => {
  it("hợp lệ: mọi ngày 11:00–13:30", () => {
    expect(validateOpenHours([{ days: all, from: "11:00", to: "13:30" }])).toEqual([]);
  });

  it("danh sách trống", () => {
    expect(validateOpenHours([])).toEqual([{ row: null, message: "Cần ít nhất một khung giờ bán" }]);
  });

  it("khung chưa chọn thứ", () => {
    expect(validateOpenHours([{ days: [], from: "11:00", to: "13:30" }])).toEqual([{ row: 0, message: "Chọn ít nhất một thứ" }]);
  });

  it.each(["", "7:00", "24:00", "11:60", "ab:cd"])("giờ sai %j", (bad) => {
    const issues = validateOpenHours([
      { days: [1], from: "11:00", to: "13:30" },
      { days: [2], from: bad, to: "13:30" },
    ]);
    expect(issues).toEqual([{ row: 1, message: "Giờ phải có dạng HH:MM, ví dụ 11:00" }]);
  });

  it("giờ bắt đầu trùng giờ kết thúc", () => {
    expect(validateOpenHours([{ days: [1], from: "11:00", to: "11:00" }])[0].message).toBe("Giờ bắt đầu và kết thúc trùng nhau");
  });

  it("hai khung chồng giờ cùng ngày", () => {
    const hours: OpenWindow[] = [
      { days: [1, 2], from: "11:00", to: "13:30" },
      { days: [2, 3], from: "13:00", to: "15:00" },
    ];
    expect(validateOpenHours(hours)).toEqual([{ row: 1, message: "Trùng giờ với khung 1" }]);
  });

  it("khung nối tiếp (13:30 kết thúc, 13:30 bắt đầu) không tính là trùng", () => {
    const hours: OpenWindow[] = [
      { days: all, from: "11:00", to: "13:30" },
      { days: all, from: "13:30", to: "15:00" },
    ];
    expect(validateOpenHours(hours)).toEqual([]);
  });

  it("khung qua nửa đêm Chủ Nhật trùng với sáng Thứ Hai", () => {
    const hours: OpenWindow[] = [
      { days: [7], from: "22:00", to: "02:00" },
      { days: [1], from: "01:00", to: "03:00" },
    ];
    expect(validateOpenHours(hours)).toEqual([{ row: 1, message: "Trùng giờ với khung 1" }]);
  });
});

describe("summarizeOpenHours", () => {
  it("mọi ngày", () => {
    expect(summarizeOpenHours([{ days: all, from: "11:00", to: "13:30" }])).toBe("T2–CN 11:00–13:30");
  });

  it("nhiều khung", () => {
    expect(
      summarizeOpenHours([
        { days: [5, 1, 2, 3, 4], from: "11:00", to: "13:30" },
        { days: [6, 7], from: "08:00", to: "10:00" },
      ]),
    ).toBe("T2–T6 11:00–13:30; T7, CN 08:00–10:00");
  });

  it("chưa có khung", () => {
    expect(summarizeOpenHours([])).toBe("Chưa đặt giờ bán");
  });

  it("gộp chuỗi ngày liên tiếp từ 3 ngày", () => {
    expect(formatDays([1, 3, 5])).toBe("T2, T4, T6");
    expect(formatDays([1, 2, 3, 5, 6])).toBe("T2–T4, T6, T7");
  });
});
