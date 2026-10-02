import { useRoutes, type RouteObject } from "react-router";
import { useDocumentHead } from "@/shared/hooks/use-document-head";
import { CustomerBrand } from "@/shared/layout/customer-brand";
import { toElementRoutes } from "./lazy-routes";
import { customerRoutes } from "./routes/customer";
import { sellerRoutes } from "./routes/seller";

function Home() {
  useDocumentHead({ title: "Gọi nước tại bàn" });
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <CustomerBrand />
      <h1 className="text-2xl font-bold">Gọi nước tại bàn</h1>
      <p className="text-muted-foreground">Xem menu, đặt nước và theo dõi đơn ngay trên điện thoại.</p>
      <p className="font-medium">Quét mã QR trên bàn để gọi nước</p>
    </main>
  );
}

function NotFound() {
  useDocumentHead({ title: "Không tìm thấy trang", noindex: true });
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-xl font-semibold">Không tìm thấy trang</h1>
      <p className="font-medium">Quét mã QR trên bàn để gọi nước</p>
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
