import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OrderingBanner } from "./ordering-banner";

describe("OrderingBanner", () => {
  it("không hiện gì khi đang nhận đơn", () => {
    const { container } = render(<OrderingBanner ordering={{ enabled: true, reason: null, hours_today: [] }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("hiện lý do tạm ngưng", () => {
    render(<OrderingBanner ordering={{ enabled: false, reason: "paused", hours_today: ["11:00–13:30"] }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Quán tạm ngưng nhận đơn");
  });

  it("hiện giờ bán hôm nay khi ngoài giờ", () => {
    render(<OrderingBanner ordering={{ enabled: false, reason: "closed", hours_today: ["11:00–13:30", "17:00–19:00"] }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Ngoài giờ bán (11:00–13:30, 17:00–19:00)");
  });

  it("ngày không có khung giờ", () => {
    render(<OrderingBanner ordering={{ enabled: false, reason: "closed", hours_today: [] }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Hôm nay quán không bán");
  });
});
