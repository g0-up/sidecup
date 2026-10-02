import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useDocumentHead } from "./use-document-head";

const robots = () => document.head.querySelectorAll('meta[name="robots"]');

describe("useDocumentHead", () => {
  beforeEach(() => {
    document.title = "Gốc";
  });

  it("đặt tiêu đề, đổi theo props và khôi phục khi unmount", () => {
    const { rerender, unmount } = renderHook((p: { title: string }) => useDocumentHead(p), { initialProps: { title: "A" } });
    expect(document.title).toBe("A");
    rerender({ title: "B" });
    expect(document.title).toBe("B");
    unmount();
    expect(document.title).toBe("Gốc");
  });

  it("thêm đúng một thẻ robots noindex và gỡ khi unmount", () => {
    const { unmount } = renderHook(() => useDocumentHead({ title: "A", noindex: true }));
    expect(robots()).toHaveLength(1);
    expect(robots()[0].getAttribute("content")).toBe("noindex, nofollow");
    unmount();
    expect(robots()).toHaveLength(0);
  });

  it("không thêm thẻ khi trang được lập chỉ mục", () => {
    renderHook(() => useDocumentHead({ title: "Trang chủ" }));
    expect(robots()).toHaveLength(0);
  });

  it("hai hook cùng mount dùng chung một thẻ; chỉ gỡ khi cả hai unmount", () => {
    const a = renderHook(() => useDocumentHead({ title: "A", noindex: true }));
    const b = renderHook(() => useDocumentHead({ title: "B", noindex: true }));
    expect(robots()).toHaveLength(1);
    a.unmount();
    expect(robots()).toHaveLength(1);
    b.unmount();
    expect(robots()).toHaveLength(0);
  });

  it("không đụng thẻ robots có sẵn trong trang", () => {
    const own = document.createElement("meta");
    own.name = "robots";
    own.content = "index";
    document.head.appendChild(own);
    const { unmount } = renderHook(() => useDocumentHead({ title: "A", noindex: true }));
    unmount();
    expect(robots()).toHaveLength(1);
    expect(robots()[0]).toBe(own);
    own.remove();
  });
});
