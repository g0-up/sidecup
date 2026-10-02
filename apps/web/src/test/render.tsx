import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router";
import { vi } from "vitest";

// WebSocket giả không bao giờ mở: test trang chạy ở chế độ REST, không phụ thuộc mạng.
export class SilentSocket {
  static instances: SilentSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public url: string) {
    SilentSocket.instances.push(this);
  }
  close() {}
  // Test có thể đẩy message như server.
  emit(type: string, data: unknown) {
    this.onmessage?.({ data: JSON.stringify({ type, data, server_time: new Date().toISOString() }) });
  }
}

export function stubWebSocket() {
  SilentSocket.instances = [];
  vi.stubGlobal("WebSocket", SilentSocket);
}

export function renderRoutes(routes: RouteObject[], initialPath: string) {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const utils = render(<RouterProvider router={router} />);
  return { router, ...utils };
}

export function withQuery(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
