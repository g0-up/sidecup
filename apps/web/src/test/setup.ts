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
