import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { renderRoutes, withQuery } from "@/test/render";
import { server } from "@/test/msw-server";
import type { NotifierStatus } from "../api";
import { NotifierBanner } from "./notifier-banner";

const EXPIRED =
  "Phiên Zalo đã hết hạn — khách không nhận được tin trạng thái đơn. Vào Cài đặt để quét lại mã QR.";

function mockStatus(s: Partial<NotifierStatus>) {
  server.use(
    http.get("/api/seller/notifier/status", () =>
      HttpResponse.json({
        healthy: true,
        last_seen_at: new Date().toISOString(),
        session_ok: true,
        message: "",
        failed_last_hour: 0,
        ...s,
      }),
    ),
  );
}

function renderBanner(socket: "open" | "fallback" = "open") {
  return renderRoutes(
    [
      { path: "/seller/orders", element: withQuery(<NotifierBanner socket={socket} />) },
      { path: "/seller/settings", element: <p>Trang cài đặt</p> },
    ],
    "/seller/orders",
  );
}

describe("NotifierBanner", () => {
  it("phiên Zalo hết hạn: hiện đúng câu từ API kèm link tới Cài đặt", async () => {
    mockStatus({ healthy: false, session_ok: false, message: EXPIRED });
    const { router } = renderBanner();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(EXPIRED);
    expect(alert).not.toHaveTextContent("chỉ còn chuông báo");
    const link = screen.getByRole("link", { name: "Mở Cài đặt" });
    expect(link).toHaveAttribute("href", "/seller/settings");
    await userEvent.setup().click(link);
    expect(await screen.findByText("Trang cài đặt")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/seller/settings");
  });

  it("worker ngừng chạy mà không có câu cụ thể: giữ câu chung, không có link", async () => {
    mockStatus({ healthy: false, last_seen_at: null });
    renderBanner();
    expect(await screen.findByRole("alert")).toHaveTextContent("Zalo không gửi được tin — chỉ còn chuông báo trên màn này");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("healthy=true: không hiện banner đỏ", async () => {
    let fetched = false;
    server.use(
      http.get("/api/seller/notifier/status", () => {
        fetched = true;
        return HttpResponse.json({ healthy: true, last_seen_at: null, session_ok: true, message: "", failed_last_hour: 0 });
      }),
    );
    renderBanner("fallback");
    expect(await screen.findByRole("status")).toHaveTextContent("Kết nối chậm");
    await vi.waitFor(() => expect(fetched).toBe(true));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
