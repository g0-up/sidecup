import { useRoutes, type RouteObject } from "react-router";
import { toElementRoutes } from "./lazy-routes";
import { customerRoutes } from "./routes/customer";
import { sellerRoutes } from "./routes/seller";

function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-xl font-semibold">Gọi nước tại bàn</h1>
      <p className="text-muted-foreground">Quét mã QR trên bàn để xem menu và đặt nước.</p>
    </main>
  );
}

function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-2 px-6 text-center">
      <h1 className="text-xl font-semibold">Không tìm thấy trang</h1>
      <p className="text-muted-foreground">Bạn quét lại mã QR trên bàn nhé.</p>
    </main>
  );
}

export const routes: RouteObject[] = toElementRoutes([
  { path: "/", element: <Home /> },
  ...customerRoutes,
  ...sellerRoutes,
  { path: "*", element: <NotFound /> },
]);

export function AppRoutes() {
  return useRoutes(routes);
}
