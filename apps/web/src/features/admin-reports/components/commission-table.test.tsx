import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CommissionLine, CommissionReport } from "../api";
import { CommissionTable } from "./commission-table";

const line = (over: Partial<CommissionLine>): CommissionLine => ({
  partner_id: "p1",
  partner_name: "Quán A",
  commission_rate: 0.15,
  payout_period: "week",
  from: "2026-09-28",
  to: "2026-10-04",
  paid_count: 0,
  revenue: 0,
  failed_count: 0,
  commission: 0,
  adjustments_total: 0,
  adjustments_count: 0,
  net: 0,
  ...over,
});

describe("CommissionTable", () => {
  it("hiện tiền dạng 1.234.000đ, điều chỉnh âm và dòng tổng", () => {
    const report: CommissionReport = {
      rows: [
        line({ paid_count: 52, revenue: 1_234_000, failed_count: 1, commission: 185_100, adjustments_total: -20_000, adjustments_count: 1, net: 165_100 }),
        line({ partner_id: "p2", partner_name: "Quán B", commission_rate: 0.1, payout_period: "month", from: "2026-10-01", to: "2026-10-31" }),
      ],
      total: { paid_count: 52, revenue: 1_234_000, failed_count: 1, commission: 185_100, adjustments_total: -20_000, net: 165_100 },
    };
    render(<CommissionTable report={report} />);

    const rowA = screen.getByRole("row", { name: /Quán A/ });
    expect(within(rowA).getByText("1.234.000đ")).toBeInTheDocument();
    expect(within(rowA).getByText("185.100đ")).toBeInTheDocument();
    expect(within(rowA).getByText("15%")).toBeInTheDocument();
    expect(within(rowA).getByText("-20.000đ")).toBeInTheDocument();
    expect(within(rowA).getByText("165.100đ")).toBeInTheDocument();
    expect(within(rowA).getByText("28/09/2026 – 04/10/2026")).toBeInTheDocument();

    const rowB = screen.getByRole("row", { name: /Quán B/ });
    expect(within(rowB).getAllByText("0đ").length).toBeGreaterThan(0);
    expect(within(rowB).getByText("—")).toBeInTheDocument();

    expect(screen.getByTestId("commission-total-net")).toHaveTextContent("165.100đ");
  });

  it("không có dòng nào", () => {
    render(<CommissionTable report={{ rows: [], total: { paid_count: 0, revenue: 0, failed_count: 0, commission: 0, adjustments_total: 0, net: 0 } }} />);
    expect(screen.getByText("Chưa có số liệu trong khoảng thời gian này.")).toBeInTheDocument();
  });
});
