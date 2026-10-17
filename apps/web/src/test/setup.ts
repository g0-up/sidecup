import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { resetMockDb } from "@/mocks/db";
import { setMockLoggedIn } from "@/mocks/seller-handlers";
import { resetClientIdForTest } from "@/shared/api/client-id";
import { server } from "./msw-server";

// jsdom chưa cài showModal/close của <dialog>.
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

// Radix (checkbox, select) đo kích thước bằng ResizeObserver; jsdom không có.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// Radix Select mở danh sách bằng pointer capture và cuộn tới mục đang chọn; jsdom không có hai hàm này.
if (typeof Element !== "undefined" && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
}
if (typeof Element !== "undefined" && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// jsdom thay AbortController/AbortSignal toàn cục nhưng Request vẫn của Node, chỉ nhận AbortSignal của Node:
// query truyền signal (TanStack) hay điều hướng react-router sẽ ném TypeError. Trong test bỏ signal khỏi Request;
// TanStack vẫn bỏ kết quả của query đã huỷ nên hành vi trang không đổi. Hệ quả: request trong test không bao giờ
// bị huỷ thật, nên test về huỷ request (abort) phải kiểm ở tầng khác, không dựa vào fetch.
const NodeRequest = globalThis.Request;
globalThis.Request = class extends NodeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init?.signal ? { ...init, signal: undefined } : init);
  }
};

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  resetMockDb();
  setMockLoggedIn(false);
  localStorage.clear();
  sessionStorage.clear();
  resetClientIdForTest();
});
afterAll(() => server.close());
