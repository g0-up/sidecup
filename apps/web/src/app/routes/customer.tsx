import type { RouteObject } from "react-router";

// Chunk khách: mỗi trang tải lười để trang menu chỉ kéo đúng phần nó cần.
export const customerRoutes: RouteObject[] = [
  { path: "/t/:token", lazy: () => import("@/features/customer-menu/page") },
  { path: "/o/:id", lazy: () => import("@/features/customer-order/page") },
  { path: "/revoked", lazy: () => import("@/features/customer-menu/revoked-page") },
];
