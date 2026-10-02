import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { db, MOCK_TOKEN } from "@/mocks/db";
import type { SellerOrder } from "@/shared/api/orders";
import type { OrderStatus } from "@/shared/lib/order-status";
import { renderRoutes, stubWebSocket } from "@/test/render";
import * as orderPage from "./page";

function seedOrder(status: OrderStatus, opts: { phone?: string | null; ageSec?: number } = {}): SellerOrder {
  const created = new Date(Date.now() - (opts.ageSec ?? 5) * 1000).toISOString();
  const order: SellerOrder = {
    id: "o-1",
    code: "AB12CD",
    status,
    items: [{ product_id: "p-cfsd", name: "Cà phê sữa đá", unit_price: 25000, qty: 1, sweet: "medium", ice: "normal", line_total: 25000 }],
    note: null,
    total: 25000,
    partner_name: "Quán test",
    table_label: "Bàn 1",
    cancel_reason: null,
    payment_method: null,
    created_at: created,
    accepted_at: status === "sent" ? null : created,
    delivering_at: null,
    paid_at: null,
    closed_at: null,
    updated_at: created,
    partner_id: "partner-1",
    qr_token: MOCK_TOKEN,
    menu_path: `/t/${MOCK_TOKEN}`,
    customer_phone: opts.phone ?? null,
    commission_rate: null,
    commission_amount: null,
  };
  db.orders.push(order);
  return order;
}

function renderOrder(id = "o-1") {
  return renderRoutes(
    [
      { path: "/o/:id", Component: orderPage.Component },
      { path: "/t/:token", element: <p>Trang menu</p> },
    ],
    `/o/${id}`,
  );
}

const robots = () => document.head.querySelector('meta[name="robots"]');

describe("trang đơn khách", () => {
  beforeEach(() => stubWebSocket());

  it("đơn đang chạy: câu trạng thái là H1, link gọi thêm về menu của bàn là nút phụ", async () => {
    seedOrder("sent");
    renderOrder();
    expect(await screen.findByRole("heading", { level: 1, name: "Đã gửi đơn, chờ quán xác nhận" })).toBeInTheDocument();
    expect(screen.getByText("Đơn #AB12CD")).toBeInTheDocument();
    const reorder = screen.getByRole("link", { name: "Gọi thêm nước" });
    expect(reorder).toHaveAttribute("href", `/t/${MOCK_TOKEN}`);
    expect(reorder).toHaveAttribute("data-variant", "outline");
  });

  it("đơn đã nhận nước: gọi thêm là nút chính duy nhất", async () => {
    seedOrder("paid");
    renderOrder();
    expect(await screen.findByRole("heading", { level: 1, name: "Cảm ơn bạn! Chúc ngon miệng" })).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Gọi thêm nước" });
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("data-variant", "cta");
    await userEvent.setup().click(links[0]);
    expect(await screen.findByText("Trang menu")).toBeInTheDocument();
  });

  it("dòng trấn an theo notify_zalo", async () => {
    seedOrder("accepted", { phone: "0901234567" });
    const { unmount } = renderOrder();
    expect(await screen.findByText(/Bạn sẽ nhận tin Zalo khi trạng thái đổi/)).toBeInTheDocument();
    expect(screen.queryByText("Giữ trang này mở để theo dõi đơn.")).not.toBeInTheDocument();
    unmount();

    db.orders[0].customer_phone = null;
    renderOrder();
    expect(await screen.findByText("Giữ trang này mở để theo dõi đơn.")).toBeInTheDocument();
    expect(screen.queryByText(/nhận tin Zalo/)).not.toBeInTheDocument();
  });

  it("huỷ cần hai lần bấm; tiêu đề tab và noindex theo trạng thái", async () => {
    const user = userEvent.setup();
    seedOrder("sent", { ageSec: 70 });
    renderOrder();
    const prompt = await screen.findByRole("alert");
    await waitFor(() => expect(document.title).toBe("Đơn #AB12CD · Đã gửi"));
    expect(robots()).toHaveAttribute("content", "noindex, nofollow");

    await user.click(within(prompt).getByRole("button", { name: "Huỷ đơn" }));
    expect(db.orders[0].status).toBe("sent");
    await user.click(within(prompt).getByRole("button", { name: "Không huỷ" }));
    await user.click(within(prompt).getByRole("button", { name: "Huỷ đơn" }));
    await user.click(within(prompt).getByRole("button", { name: "Xác nhận huỷ" }));

    expect(await screen.findByText("Bạn đã huỷ đơn")).toBeInTheDocument();
    expect(db.orders[0].status).toBe("cancelled");
    expect(document.title).toBe("Đơn #AB12CD · Đã huỷ");
    expect(screen.getByRole("link", { name: "Gọi thêm nước" })).toHaveAttribute("data-variant", "cta");
  });

  it("chạm đúp hay Enter hai lần vào Huỷ đơn không huỷ đơn", async () => {
    const user = userEvent.setup();
    seedOrder("sent", { ageSec: 70 });
    renderOrder();
    const prompt = await screen.findByRole("alert");

    // Trước đây nút thứ hai được tái dùng, cú chạm thứ hai rơi đúng vào "Xác nhận huỷ".
    await user.dblClick(within(prompt).getByRole("button", { name: "Huỷ đơn" }));
    expect(db.orders[0].status).toBe("sent");
    await user.click(within(prompt).getByRole("button", { name: "Không huỷ" }));

    within(prompt).getByRole("button", { name: "Huỷ đơn" }).focus();
    await user.keyboard("{Enter}");
    expect(within(prompt).getByRole("button", { name: "Không huỷ" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(within(prompt).getByRole("button", { name: "Huỷ đơn" })).toBeInTheDocument();
    expect(db.orders[0].status).toBe("sent");
  });

  it("không tìm thấy đơn: chỉ cách quét lại mã QR", async () => {
    renderOrder("missing");
    expect(await screen.findByRole("heading", { name: "Không tìm thấy đơn" })).toBeInTheDocument();
    expect(screen.getByText("Quét mã QR trên bàn để đặt lại")).toBeInTheDocument();
    expect(document.title).toBe("Không tìm thấy đơn");
    expect(screen.queryByRole("button", { name: "Thử lại" })).not.toBeInTheDocument();
  });
});
