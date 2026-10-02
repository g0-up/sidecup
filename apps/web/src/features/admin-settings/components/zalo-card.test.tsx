import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/mocks/db";
import { setMockLoggedIn } from "@/mocks/seller-handlers";
import type { ZaloLink } from "@/shared/api/zalo";
import { server } from "@/test/msw-server";
import { ZALO_CONSENT_VERSION, ZaloCard } from "./zalo-card";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ZaloCard />
    </QueryClientProvider>,
  );
}

// Trả lần lượt từng trạng thái cho mỗi lần poll; hết danh sách thì giữ trạng thái cuối.
function scriptLink(states: Omit<ZaloLink, "link_id">[]) {
  const calls = { count: 0 };
  server.use(
    http.get("/api/seller/zalo/link/:id", ({ params }) => {
      const step = states[Math.min(calls.count, states.length - 1)];
      calls.count++;
      if (step.state === "linked") {
        db.zalo = { configured: true, linked: true, status: "linked", display_name: "Quán Test", linked_at: "2026-10-02T03:00:00Z" };
      }
      return HttpResponse.json({ link_id: String(params.id), ...step });
    }),
  );
  return calls;
}

describe("Thẻ Zalo trong Cài đặt", () => {
  beforeEach(() => {
    setMockLoggedIn(true);
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("máy chủ chưa cấu hình: chỉ hiện hướng dẫn, không có nút", async () => {
    db.zalo = { configured: false, linked: false, status: "", display_name: "", linked_at: null };
    renderCard();
    expect(await screen.findByText("Chưa cấu hình Zalo trên máy chủ")).toBeInTheDocument();
    expect(screen.getByText("ZALO_CREDENTIAL_KEY")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("chưa liên kết: khoá nút tới khi đồng ý, rồi quét QR tới khi kết nối và ngừng poll", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let consentSent: unknown;
    server.use(
      http.post("/api/seller/zalo/link", async ({ request }) => {
        consentSent = ((await request.json()) as { consent_version: string }).consent_version;
        return HttpResponse.json({ link_id: "link-1" }, { status: 202 });
      }),
    );
    const calls = scriptLink([
      { state: "qr_ready", qr_png_base64: "QUJD" },
      { state: "scanned" },
      { state: "linked", display_name: "Quán Test" },
    ]);
    renderCard();

    const connect = await screen.findByRole("button", { name: "Kết nối Zalo" });
    expect(connect).toBeDisabled();
    expect(screen.getByLabelText(/tài khoản Zalo phụ/)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox"));
    expect(connect).toBeEnabled();
    await user.click(connect);

    const qr = await screen.findByRole("img", { name: "Mã QR đăng nhập Zalo" });
    expect(qr).toHaveAttribute("src", "data:image/png;base64,QUJD");
    expect(screen.getByText("Mở Zalo trên điện thoại phụ → Quét mã")).toBeInTheDocument();
    expect(consentSent).toBe(ZALO_CONSENT_VERSION);

    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(await screen.findByText("Xác nhận đăng nhập trên điện thoại")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1500));
    expect(await screen.findByText("Đã kết nối")).toBeInTheDocument();
    expect(screen.getByText("Quán Test")).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Đã kết nối Zalo");

    const polled = calls.count;
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(calls.count).toBe(polled);
  });

  it("đã kết nối: ngắt kết nối chỉ gọi DELETE sau khi xác nhận", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    db.zalo = { configured: true, linked: true, status: "linked", display_name: "Quán Test", linked_at: "2026-10-02T03:00:00Z" };
    let deleted = 0;
    server.use(
      http.delete("/api/seller/zalo", () => {
        deleted++;
        db.zalo = { configured: true, linked: false, status: "", display_name: "", linked_at: null };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderCard();

    expect(await screen.findByText("Đã kết nối")).toBeInTheDocument();
    expect(screen.getByText("Quán Test")).toBeInTheDocument();
    expect(screen.getByText(/^từ /)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ngắt kết nối" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Giữ kết nối" }));
    expect(deleted).toBe(0);

    await user.click(screen.getByRole("button", { name: "Ngắt kết nối" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Ngắt kết nối" }));
    await waitFor(() => expect(deleted).toBe(1));
    expect(await screen.findByRole("button", { name: "Kết nối Zalo" })).toBeDisabled();
    expect(toast.success).toHaveBeenCalledWith("Đã ngắt kết nối Zalo");
  });

  it("phiên hết hạn: badge đỏ và quét lại mã QR ngay", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    db.zalo = { configured: true, linked: true, status: "expired", display_name: "Quán Test", linked_at: "2026-10-02T03:00:00Z" };
    scriptLink([{ state: "qr_ready", qr_png_base64: "QUJD" }]);
    renderCard();

    const badge = await screen.findByText("Phiên hết hạn");
    expect(badge).toHaveAttribute("data-variant", "destructive");
    await user.click(screen.getByRole("button", { name: "Quét lại mã QR" }));
    expect(await screen.findByRole("img", { name: "Mã QR đăng nhập Zalo" })).toBeInTheDocument();
  });

  it("mã QR hết hạn: báo lỗi, ngừng poll và cho tạo mã mới", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const starts: string[] = [];
    server.use(
      http.post("/api/seller/zalo/link", () => {
        const id = `link-${starts.length + 1}`;
        starts.push(id);
        return HttpResponse.json({ link_id: id }, { status: 202 });
      }),
    );
    const calls = scriptLink([{ state: "expired" }]);
    renderCard();

    await user.click(await screen.findByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Kết nối Zalo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Mã QR đã hết hạn. Tạo mã mới để thử lại.");
    const polled = calls.count;
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(calls.count).toBe(polled);

    await user.click(screen.getByRole("button", { name: "Tạo mã mới" }));
    await waitFor(() => expect(starts).toEqual(["link-1", "link-2"]));
  });

  it("lỗi đăng nhập: hiện câu từ API", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    scriptLink([{ state: "error", failure: "Không hoàn tất được đăng nhập Zalo, vui lòng thử lại" }]);
    renderCard();

    await user.click(await screen.findByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Kết nối Zalo" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Không hoàn tất được đăng nhập Zalo, vui lòng thử lại");
    expect(screen.getByRole("button", { name: "Tạo mã mới" })).toBeEnabled();
  });

  it("huỷ khi đang quét: báo server dừng mã QR và về màn chưa liên kết", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    server.use(http.post("/api/seller/zalo/link", () => HttpResponse.json({ link_id: "link-1" }, { status: 202 })));
    const calls = scriptLink([{ state: "qr_ready", qr_png_base64: "QUJD" }]);
    const cancelled: string[] = [];
    server.use(
      http.delete("/api/seller/zalo/link/:id", ({ params }) => {
        cancelled.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderCard();

    await user.click(await screen.findByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Kết nối Zalo" }));
    await screen.findByRole("img", { name: "Mã QR đăng nhập Zalo" });
    await user.click(screen.getByRole("button", { name: "Huỷ" }));

    await waitFor(() => expect(cancelled).toEqual(["link-1"]));
    expect(await screen.findByRole("button", { name: "Kết nối Zalo" })).toBeInTheDocument();
    const polled = calls.count;
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(calls.count).toBe(polled);
  });

  it("một lần poll rớt mạng không báo hỏng, vẫn quét tiếp", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let polls = 0;
    server.use(
      http.get("/api/seller/zalo/link/:id", ({ params }) => {
        polls++;
        if (polls === 2) return HttpResponse.error();
        return HttpResponse.json({ link_id: String(params.id), state: "qr_ready", qr_png_base64: "QUJD" });
      }),
    );
    renderCard();

    await user.click(await screen.findByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Kết nối Zalo" }));
    await screen.findByRole("img", { name: "Mã QR đăng nhập Zalo" });

    await act(() => vi.advanceTimersByTimeAsync(4500));
    expect(polls).toBeGreaterThanOrEqual(3);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Mã QR đăng nhập Zalo" })).toBeInTheDocument();
  });

  it("mã QR không còn trên server: báo hỏng ngay, không thử lại", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    let polls = 0;
    server.use(
      http.get("/api/seller/zalo/link/:id", () => {
        polls++;
        return HttpResponse.json({ error: { code: "ZALO_LINK_NOT_FOUND", message: "Không tìm thấy phiên quét mã" } }, { status: 404 });
      }),
    );
    renderCard();

    await user.click(await screen.findByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Kết nối Zalo" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(6000));
    expect(polls).toBe(1);
  });
});
