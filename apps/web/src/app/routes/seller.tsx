import type { RouteObject } from "react-router";
import { partnersRoutes } from "@/features/admin-partners/routes";
import { productsRoutes } from "@/features/admin-products/routes";
import { reportsRoutes } from "@/features/admin-reports/routes";
import { settingsRoutes } from "@/features/admin-settings/routes";

// Chunk người bán: layout (đăng nhập, WebSocket, chuông) bọc mọi trang; trang quản trị do từng feature khai báo.
export const sellerRoutes: RouteObject[] = [
  { path: "/seller/login", lazy: () => import("@/features/seller-auth/page") },
  {
    path: "/seller",
    lazy: () => import("../seller-layout"),
    children: [
      { index: true, lazy: () => import("@/features/seller-orders/pages/board") },
      { path: "orders/:id", lazy: () => import("@/features/seller-orders/pages/order-detail") },
      ...productsRoutes,
      ...partnersRoutes,
      ...settingsRoutes,
      ...reportsRoutes,
    ],
  },
];
