import type { RouteObject } from "react-router";

export const settingsRoutes: RouteObject[] = [{ path: "settings", lazy: () => import("./page") }];
