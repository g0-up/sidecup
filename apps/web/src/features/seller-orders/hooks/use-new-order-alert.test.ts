import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNewOrderAlert } from "./use-new-order-alert";

vi.mock("../sound", () => ({ playChime: vi.fn() }));

describe("useNewOrderAlert", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.title = "Món — Gọi nước";
  });
  afterEach(() => vi.useRealTimers());

  it("nháy xen kẽ với tiêu đề trang đang mở và trả lại đúng tiêu đề khi hết đơn mới", () => {
    const { rerender } = renderHook((p: { unseen: number }) => useNewOrderAlert(p.unseen, false), { initialProps: { unseen: 1 } });
    expect(document.title).toBe("(1) Đơn mới");
    act(() => vi.advanceTimersByTime(1000));
    expect(document.title).toBe("Món — Gọi nước");
    rerender({ unseen: 0 });
    expect(document.title).toBe("Món — Gọi nước");
  });

  it("trang đổi tiêu đề giữa lúc nháy thì nhịp sau dùng tiêu đề mới", () => {
    const { unmount } = renderHook(() => useNewOrderAlert(2, false));
    document.title = "Báo cáo — Gọi nước";
    act(() => vi.advanceTimersByTime(1000));
    expect(document.title).toBe("Báo cáo — Gọi nước");
    act(() => vi.advanceTimersByTime(1000));
    expect(document.title).toBe("(2) Đơn mới");
    unmount();
    expect(document.title).toBe("Báo cáo — Gọi nước");
  });
});
