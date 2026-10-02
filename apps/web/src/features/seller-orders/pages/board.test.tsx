import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Outlet } from "react-router";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/mocks/db";
import { setMockLoggedIn } from "@/mocks/seller-handlers";
import type { SellerOrder } from "@/shared/api/orders";
import { Toaster } from "@/shared/ui/sonner";
import { renderRoutes, SilentSocket, stubWebSocket, withQuery } from "@/test/render";
import { SellerBoardProvider } from "../board-context";
import * as board from "./board";

function seed(id: string, status: SellerOrder["status"], code: string): SellerOrder {
  const now = new Date().toISOString();
  const o: SellerOrder = {
    id,
    code,
    status,
    items: [{ product_id: "p-cfsd", name: "Cà phê sữa đá", unit_price: 25000, qty: 2, sweet: "less", ice: "normal", line_total: 50000 }],
    note: "ít đá",
    total: 50000,
    partner_name: "Quán test",
    table_label: "Bàn 3",
    cancel_reason: null,
    payment_method: null,
    created_at: now,
    accepted_at: null,
    delivering_at: null,
    paid_at: null,
    closed_at: null,
    updated_at: now,
    partner_id: "p1",
    qr_token: "DEVTEST001",
    customer_phone: "0901234567",
    commission_rate: null,
    commission_amount: null,
  };
  db.orders.push(o);
  return o;
}

function renderBoard() {
  return renderRoutes(
    [
      {
        path: "/seller",
        element: withQuery(
          <SellerBoardProvider>
            <Outlet />
            <Toaster />
          </SellerBoardProvider>,
        ),
        children: [{ index: true, Component: board.Component }],
      },
    ],
    "/seller",
  );
}

describe("bảng đơn người bán", () => {
  beforeEach(() => {
    stubWebSocket();
    setMockLoggedIn(true);
  });

  it("chia đơn theo cột, hiện SĐT dạng tel: và ghi chú", async () => {
    seed("a", "sent", "AAA111");
    seed("b", "delivering", "BBB222");
    renderBoard();
    const sent = await screen.findByRole("region", { name: "Đã gửi" });
    expect(within(sent).getByText("#AAA111")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Đang mang ra" })).getByText("#BBB222")).toBeInTheDocument();
    expect(within(sent).getByRole("link", { name: /0901234567/ })).toHaveAttribute("href", "tel:0901234567");
    expect(within(sent).getByText(/ít đá/)).toBeInTheDocument();
    expect(within(sent).queryByText("Mới")).not.toBeInTheDocument();
  });

  it("đơn khách bỏ trống SĐT vẫn hiện đủ, không có link gọi", async () => {
    seed("a", "sent", "AAA111").customer_phone = null;
    renderBoard();
    const sent = await screen.findByRole("region", { name: "Đã gửi" });
    const card = within(sent).getByRole("article", { name: "Đơn AAA111" });
    expect(within(card).getByText(/Cà phê sữa đá/)).toBeInTheDocument();
    expect(within(card).getByText("50.000đ")).toBeInTheDocument();
    expect(card.querySelector('a[href^="tel:"]')).toBeNull();
    expect(within(card).getByRole("button", { name: /Nhận đơn/ })).toBeInTheDocument();
  });

  it("order.created qua WebSocket thêm thẻ mới có nhãn Mới", async () => {
    renderBoard();
    await screen.findByRole("region", { name: "Đã gửi" });
    await waitFor(() => expect(SilentSocket.instances.length).toBeGreaterThan(0));
    const ws = SilentSocket.instances[SilentSocket.instances.length - 1];
    const o = seed("c", "sent", "CCC333");
    act(() => ws.emit("order.created", o));
    const card = await screen.findByRole("article", { name: "Đơn CCC333" });
    expect(within(card).getByText("Mới")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Đã xem 1 đơn mới/ })).toBeInTheDocument();
  });

  it("nhận đơn thành công chuyển thẻ sang cột Đang pha", async () => {
    const user = userEvent.setup();
    seed("d", "sent", "DDD444");
    renderBoard();
    const card = await screen.findByRole("article", { name: "Đơn DDD444" });
    await user.click(within(card).getByRole("button", { name: "Nhận đơn" }));
    await waitFor(() =>
      expect(within(screen.getByRole("region", { name: "Đang pha" })).getByText("#DDD444")).toBeInTheDocument(),
    );
  });

  it("409 khi tab khác đã nhận: báo đơn đã đổi và tải lại đúng đơn", async () => {
    const user = userEvent.setup();
    const o = seed("e", "sent", "EEE555");
    renderBoard();
    const card = await screen.findByRole("article", { name: "Đơn EEE555" });
    o.status = "accepted";
    o.updated_at = new Date(Date.now() + 1000).toISOString();
    await user.click(within(card).getByRole("button", { name: "Nhận đơn" }));
    expect(await screen.findByText("Đơn đã đổi trạng thái")).toBeInTheDocument();
    await waitFor(() =>
      expect(within(screen.getByRole("region", { name: "Đang pha" })).getByText("#EEE555")).toBeInTheDocument(),
    );
  });

  it("từ chối cần xác nhận hai bước", async () => {
    const user = userEvent.setup();
    seed("f", "sent", "FFF666");
    renderBoard();
    const card = await screen.findByRole("article", { name: "Đơn FFF666" });
    await user.click(within(card).getByRole("button", { name: "Từ chối" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(db.orders.find((x) => x.id === "f")!.status).toBe("sent");
    await user.click(within(dialog).getByRole("button", { name: "Xác nhận" }));
    await waitFor(() => expect(db.orders.find((x) => x.id === "f")!.status).toBe("rejected"));
  });

  it("resync khi nối lại: đơn mới trong lúc mất kết nối hiện kèm Mới, đơn đã đóng rời bảng", async () => {
    const closing = seed("g", "accepted", "GGG777");
    renderBoard();
    await screen.findByRole("article", { name: "Đơn GGG777" });
    await waitFor(() => expect(SilentSocket.instances.length).toBeGreaterThan(0));

    // Trong lúc mất kết nối: đơn g đã được giao xong ở máy khác, khách đặt đơn h.
    Object.assign(closing, { status: "paid", closed_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    seed("h", "sent", "HHH888");
    const ws = SilentSocket.instances[SilentSocket.instances.length - 1];
    act(() => ws.onopen?.());

    const fresh = await screen.findByRole("article", { name: "Đơn HHH888" });
    expect(within(fresh).getByText("Mới")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("article", { name: "Đơn GGG777" })).not.toBeInTheDocument());
  });

  it("tải lần đầu lỗi thì hiện nút thử lại và tự hồi phục", async () => {
    const user = userEvent.setup();
    setMockLoggedIn(false);
    renderBoard();
    expect(await screen.findByRole("alert")).toHaveTextContent("Không tải được đơn");
    setMockLoggedIn(true);
    seed("i", "sent", "III999");
    await user.click(screen.getByRole("button", { name: "Thử lại ngay" }));
    expect(await screen.findByRole("article", { name: "Đơn III999" })).toBeInTheDocument();
  });
});
