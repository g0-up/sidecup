import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QrPrintCard } from "./qr-print-card";

describe("QrPrintCard", () => {
  it("hiện tên quán, số bàn, chân thẻ và mã hoá đúng đường dẫn", () => {
    const url = "https://goinuoc.vn/t/AB12CD34EF";
    const { container } = render(<QrPrintCard partnerName="Quán Cô Ba" tableLabel="Bàn 5" url={url} />);

    const card = screen.getByRole("article", { name: "Thẻ QR Quán Cô Ba Bàn 5" });
    expect(card).toHaveTextContent("Quán Cô Ba");
    expect(card).toHaveTextContent("Bàn 5");
    // Không đặt VITE_SELLER_NAME trong test → tên mặc định.
    expect(card).toHaveTextContent("Đồ uống do người bán pha — giao tới bàn, thanh toán khi nhận");

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.querySelector("title")?.textContent).toBe(url);
    expect(svg?.querySelectorAll("path").length).toBeGreaterThan(0);
  });

  it("đổi URL thì đổi mã QR", () => {
    const { container, rerender } = render(<QrPrintCard partnerName="A" tableLabel="Bàn 1" url="https://x.vn/t/AAAAAAAAAA" />);
    const first = container.querySelector("svg path:last-of-type")?.getAttribute("d");
    rerender(<QrPrintCard partnerName="A" tableLabel="Bàn 1" url="https://x.vn/t/BBBBBBBBBB" />);
    expect(container.querySelector("svg path:last-of-type")?.getAttribute("d")).not.toBe(first);
  });
});
