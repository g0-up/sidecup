import { useQuery } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";
import { setUnauthorizedHandler } from "@/shared/api/http";
import { isApiError } from "@/shared/api/errors";
import { Button } from "@/shared/ui/button";
import { getMe } from "./api";
import { loginPath } from "./next";

// RequireSeller chặn mọi trang người bán khi chưa đăng nhập; cookie hết hạn giữa chừng (401 ở bất kỳ API nào)
// cũng đưa về trang đăng nhập, giữ lại đường dẫn để quay lại.
export function RequireSeller({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const here = location.pathname + location.search;
  const me = useQuery({ queryKey: ["seller", "me"], queryFn: getMe, retry: false, staleTime: 60_000 });

  useEffect(() => {
    setUnauthorizedHandler(() => navigate(loginPath(window.location.pathname + window.location.search), { replace: true }));
    return () => setUnauthorizedHandler(null);
  }, [navigate]);

  if (me.isPending) return <p className="p-6 text-muted-foreground">Đang kiểm tra đăng nhập…</p>;
  if (me.isError) {
    if (isApiError(me.error) && me.error.status === 401) return <Navigate to={loginPath(here)} replace />;
    return (
      <div className="space-y-3 p-6">
        <p>Không kết nối được máy chủ.</p>
        <Button onClick={() => void me.refetch()}>Thử lại</Button>
      </div>
    );
  }
  return <>{children}</>;
}
