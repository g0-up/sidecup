import { lazy, Suspense, type ComponentType } from "react";
import type { RouteObject } from "react-router";

type RouteModule = { Component: ComponentType };
type Loader = () => Promise<RouteModule>;

function Fallback() {
  return <div aria-busy="true" className="p-6 text-muted-foreground" />;
}

// toElementRoutes đổi RouteObject có `lazy` (quy ước của các feature) thành route dùng React.lazy cho useRoutes.
// App dùng chế độ khai báo (BrowserRouter) thay vì data router để route khách nhẹ hơn ~10 KB gzip.
export function toElementRoutes(routes: RouteObject[]): RouteObject[] {
  return routes.map((r) => {
    const out: RouteObject = { ...r, lazy: undefined };
    if (typeof r.lazy === "function") {
      const load = r.lazy as unknown as Loader;
      const C = lazy(() => load().then((m) => ({ default: m.Component })));
      out.element = (
        <Suspense fallback={<Fallback />}>
          <C />
        </Suspense>
      );
    }
    if (r.children) out.children = toElementRoutes(r.children);
    return out;
  }) as RouteObject[];
}
