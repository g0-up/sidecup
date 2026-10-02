import type { RouteObject } from "react-router";

export const partnersRoutes: RouteObject[] = [
  { path: "partners", lazy: () => import("./pages/list") },
  { path: "partners/:id", lazy: () => import("./pages/detail") },
  { path: "partners/:id/print", lazy: () => import("./pages/print") },
];
