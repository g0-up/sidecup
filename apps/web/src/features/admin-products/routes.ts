import type { RouteObject } from "react-router";

// Route con của layout /seller; tải lười để không kéo code quản trị vào chunk khách.
export const productsRoutes: RouteObject[] = [{ path: "products", lazy: () => import("./page") }];
