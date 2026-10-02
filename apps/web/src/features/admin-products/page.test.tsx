import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAdminMock } from "@/mocks/admin-handlers";
import { server } from "@/test/msw-server";
import { Component as ProductsPage } from "./page";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProductsPage />
    </QueryClientProvider>,
  );
}

describe("Trang món", () => {
  beforeEach(() => {
    resetAdminMock();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("tắt món đổi ngay trên danh sách rồi trả lại khi API lỗi", async () => {
    let patched = false;
    server.use(
      http.patch("/api/seller/products/:id/availability", async () => {
        patched = true;
        await delay(50);
        return HttpResponse.json({ error: { code: "INTERNAL", message: "Máy chủ lỗi" } }, { status: 500 });
      }),
    );
    renderPage();

    const sw = await screen.findByRole("switch", { name: /Cà phê sữa đá/ });
    expect(sw).toHaveAttribute("aria-checked", "true");

    await userEvent.click(sw);
    // Optimistic: đổi trước khi API trả lời.
    expect(screen.getByRole("switch", { name: /Cà phê sữa đá/ })).toHaveAttribute("aria-checked", "false");

    await waitFor(() => expect(screen.getByRole("switch", { name: /Cà phê sữa đá/ })).toHaveAttribute("aria-checked", "true"));
    expect(patched).toBe(true);
    expect(toast.error).toHaveBeenCalledWith("Không đổi được trạng thái món: Máy chủ lỗi");
  });

  it("tắt món thành công giữ trạng thái mới", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("switch", { name: /Bạc xỉu/ }));
    await waitFor(() => expect(screen.getByRole("switch", { name: /Bạc xỉu/ })).toHaveAttribute("aria-checked", "false"));
    expect(screen.getByRole("switch", { name: /Bạc xỉu/ })).toHaveAccessibleName("Bạc xỉu: hết món");
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("lỗi 422 từ server hiện dưới đúng ô nhập", async () => {
    server.use(
      http.post("/api/seller/products", () =>
        HttpResponse.json(
          { error: { code: "VALIDATION", message: "Dữ liệu chưa hợp lệ", details: { fields: { image_url: "Đường dẫn ảnh không mở được" } } } },
          { status: 422 },
        ),
      ),
    );
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Thêm món/ }));
    await userEvent.type(screen.getByLabelText("Tên món"), "Trà tắc");
    await userEvent.clear(screen.getByLabelText("Giá (đồng)"));
    await userEvent.type(screen.getByLabelText("Giá (đồng)"), "15000");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Đường dẫn ảnh không mở được")).toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("validate phía client bằng tiếng Việt", async () => {
    renderPage();
    await userEvent.click(await screen.findByRole("button", { name: /Thêm món/ }));
    await userEvent.clear(screen.getByLabelText("Giá (đồng)"));
    await userEvent.type(screen.getByLabelText("Ảnh (đường dẫn, không bắt buộc)"), "ftp://x");
    await userEvent.click(screen.getByRole("button", { name: "Lưu" }));

    expect(await screen.findByText("Nhập tên món")).toBeInTheDocument();
    expect(screen.getByText("Nhập giá bằng số")).toBeInTheDocument();
    expect(screen.getByText("Đường dẫn ảnh phải bắt đầu bằng https://")).toBeInTheDocument();
  });
});
