import type { RouteObject } from "react-router";

export const reportsRoutes: RouteObject[] = [{ path: "reports", lazy: () => import("./page") }];
