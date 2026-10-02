import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAdminMock } from "@/mocks/admin-handlers";
import { server } from "@/test/msw-server";
import type { PartnerInput } from "../api";
import { PartnerFormDialog } from "./partner-form";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderForm(onSaved = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <PartnerFormDialog target="new" onClose={() => {}} onSaved={onSaved} />
    </QueryClientProvider>,
  );
  return onSaved;
}

describe("PartnerFormDialog", () => {
  beforeEach(() => {
    resetAdminMock();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("báo lỗi theo từng khung giờ ở phía client", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText("Tên quán"), "Quán Cô Ba");
    await userEvent.click(screen.getByRole("button", { name: /Thêm khung giờ/ }));
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Chọn ít nhất một thứ")).toBeInTheDocument();
  });

  it("báo khi xoá hết khung giờ", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText("Tên quán"), "Quán Cô Ba");
    await userEvent.click(screen.getByRole("button", { name: "Xoá khung 1" }));
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Cần ít nhất một khung giờ bán")).toBeInTheDocument();
  });

  it("gửi tỷ lệ hoa hồng dạng 0..1 và hiện lỗi 422 của open_hours", async () => {
    let sent: PartnerInput | null = null;
    server.use(
      http.post("/api/seller/partners", async ({ request }) => {
        sent = (await request.json()) as PartnerInput;
        return HttpResponse.json(
          { error: { code: "VALIDATION", message: "Dữ liệu chưa hợp lệ", details: { fields: { open_hours: "Khung 1: thứ bị lặp" } } } },
          { status: 422 },
        );
      }),
    );
    renderForm();
    await userEvent.type(screen.getByLabelText("Tên quán"), "Quán Cô Ba");
    await userEvent.clear(screen.getByLabelText("Hoa hồng (%)"));
    await userEvent.type(screen.getByLabelText("Hoa hồng (%)"), "12.5");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Khung 1: thứ bị lặp")).toBeInTheDocument();
    await waitFor(() => expect(sent).not.toBeNull());
    expect(sent).toMatchObject({
      name: "Quán Cô Ba",
      commission_rate: 0.125,
      payout_period: "week",
      active: true,
      open_hours: [{ days: [1, 2, 3, 4, 5, 6, 7], from: "11:00", to: "13:30" }],
      hidden_product_ids: [],
    });
  });
});
