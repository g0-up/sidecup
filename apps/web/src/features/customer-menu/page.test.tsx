import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { db, MOCK_TOKEN } from "@/mocks/db";
import { renderRoutes, stubWebSocket } from "@/test/render";
import { server } from "@/test/msw-server";
import * as menuPage from "./page";
import * as revokedPage from "./revoked-page";

function renderMenu() {
  return renderRoutes(
    [
      { path: "/t/:token", Component: menuPage.Component },
      { path: "/o/:id", element: <p>Trang đơn</p> },
      { path: "/revoked", Component: revokedPage.Component },
    ],
    `/t/${MOCK_TOKEN}`,
  );
}

async function addToCart(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("button", { name: new RegExp(name) }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: /Thêm vào giỏ/ }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
}

describe("trang menu khách", () => {
  beforeEach(() => stubWebSocket());

  it("hiện bàn, ETA, món hết bị mờ và chân trang người bán", async () => {
    renderMenu();
    expect(await screen.findByRole("heading", { name: "Bàn 1" })).toBeInTheDocument();
    expect(screen.getByText(/Giao trong khoảng 7 phút/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trà đào cam sả/ })).toBeDisabled();
    expect(screen.getByText(/pha và giao, không phải của quán/)).toBeInTheDocument();
  });

  it("đặt đơn: gửi Idempotency-Key, xoá giỏ, lưu SĐT và chuyển sang trang đơn", async () => {
    const user = userEvent.setup();
    const keys: string[] = [];
    server.events.on("request:start", ({ request }) => {
      if (request.method === "POST") keys.push(request.headers.get("Idempotency-Key") ?? "");
    });
    const { router } = renderMenu();
    await addToCart(user, "Cà phê sữa đá");
    await user.click(screen.getByRole("button", { name: /Xem giỏ · 1 ly/ }));
    const sheet = await screen.findByRole("dialog");
    const submit = within(sheet).getByRole("button", { name: "Đặt nước" });
    const phone = within(sheet).getByLabelText(/Số điện thoại/);
    await user.type(phone, "0901");
    expect(submit).toBeDisabled();
    expect(within(sheet).getByText("Sửa số điện thoại hoặc bỏ trống để đặt")).toBeInTheDocument();

    await user.type(phone, " 234 567");
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/o\//));
    expect(db.orders).toHaveLength(1);
    expect(db.orders[0].customer_phone).toBe("0901234567");
    expect(keys).toHaveLength(1);
    expect(sessionStorage.getItem(`sc_idem_${MOCK_TOKEN}`)).toBeNull();
    expect(sessionStorage.getItem(`sc_cart_${MOCK_TOKEN}`)).toBeNull();
    expect(localStorage.getItem("sc_phone")).toBe("0901234567");
    server.events.removeAllListeners();
  });

  it("bỏ trống SĐT vẫn đặt được và không gửi field phone", async () => {
    const user = userEvent.setup();
    const bodies: Record<string, unknown>[] = [];
    server.events.on("request:start", async ({ request }) => {
      if (request.method === "POST") bodies.push((await request.clone().json()) as Record<string, unknown>);
    });
    const { router } = renderMenu();
    await addToCart(user, "Cà phê sữa đá");
    await user.click(screen.getByRole("button", { name: /Xem giỏ · 1 ly/ }));
    const sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByLabelText(/Số điện thoại/)).toHaveValue("");
    expect(within(sheet).getByText(/Bỏ trống thì không nhận tin/)).toBeInTheDocument();
    await user.click(within(sheet).getByRole("button", { name: "Đặt nước" }));

    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/o\//));
    expect(db.orders[0].customer_phone).toBeNull();
    expect(bodies[0]).not.toHaveProperty("phone");
    server.events.removeAllListeners();
  });

  it("SĐT đã lưu được điền sẵn và giữ nguyên; chỉ xoá khi khách tự xoá ô", async () => {
    localStorage.setItem("sc_phone", "0901234567");
    const user = userEvent.setup();
    const { router } = renderMenu();
    await addToCart(user, "Bạc xỉu");
    await user.click(screen.getByRole("button", { name: /Xem giỏ/ }));
    let sheet = await screen.findByRole("dialog");
    expect(within(sheet).getByLabelText(/Số điện thoại/)).toHaveValue("0901234567");
    await user.click(within(sheet).getByRole("button", { name: "Đặt nước" }));
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/o\//));
    expect(db.orders[0].customer_phone).toBe("0901234567");
    expect(localStorage.getItem("sc_phone")).toBe("0901234567");

    await act(() => router.navigate(`/t/${MOCK_TOKEN}`));
    await addToCart(user, "Bạc xỉu");
    await user.click(screen.getByRole("button", { name: /Xem giỏ/ }));
    sheet = await screen.findByRole("dialog");
    await user.clear(within(sheet).getByLabelText(/Số điện thoại/));
    await user.click(within(sheet).getByRole("button", { name: "Đặt nước" }));
    await waitFor(() => expect(db.orders).toHaveLength(2));
    expect(db.orders[1].customer_phone).toBeNull();
    expect(localStorage.getItem("sc_phone")).toBe("");
  });

  it("lỗi mạng giữ nguyên key; bấm lại dùng cùng key nên không trùng đơn", async () => {
    const user = userEvent.setup();
    let calls = 0;
    const keys: string[] = [];
    server.use(
      http.post("/api/t/:token/orders", ({ request }) => {
        keys.push(request.headers.get("Idempotency-Key") ?? "");
        calls++;
        if (calls === 1) return HttpResponse.error();
        return undefined;
      }),
    );
    renderMenu();
    await addToCart(user, "Bạc xỉu");
    await user.click(screen.getByRole("button", { name: /Xem giỏ/ }));
    const sheet = await screen.findByRole("dialog");
    await user.type(within(sheet).getByLabelText(/Số điện thoại/), "0901234567");
    await user.click(within(sheet).getByRole("button", { name: "Đặt nước" }));
    expect(await within(sheet).findByRole("alert")).toHaveTextContent("Mất kết nối");
    expect(sessionStorage.getItem(`sc_idem_${MOCK_TOKEN}`)).toBe(keys[0]);

    await user.click(within(sheet).getByRole("button", { name: "Đặt nước" }));
    await waitFor(() => expect(db.orders).toHaveLength(1));
    expect(keys[1]).toBe(keys[0]);
  });

  it("món hết giữa chừng: đánh dấu Hết món, khoá nút đặt, giữ giỏ", async () => {
    const user = userEvent.setup();
    renderMenu();
    await addToCart(user, "Bạc xỉu");
    db.products.find((p) => p.id === "p-bacxiu")!.available = false;
    await user.click(screen.getByRole("button", { name: /Xem giỏ/ }));
    const sheet = await screen.findByRole("dialog");
    await user.type(within(sheet).getByLabelText(/Số điện thoại/), "0901234567");
    await user.click(within(sheet).getByRole("button", { name: "Đặt nước" }));
    expect(await within(sheet).findByText("Hết món")).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Đặt nước" })).toBeDisabled();
    expect(db.orders).toHaveLength(0);
  });

  it("mã đã thu hồi → trang Mã này không còn dùng", async () => {
    db.revokedTokens.add(MOCK_TOKEN);
    renderMenu();
    expect(await screen.findByRole("heading", { name: "Mã này không còn dùng" })).toBeInTheDocument();
  });

  it("tạm ngưng: hiện banner và khoá đặt", async () => {
    db.settings.accepting_orders = false;
    renderMenu();
    expect(await screen.findByRole("status")).toHaveTextContent("Quán tạm ngưng nhận đơn");
  });
});
