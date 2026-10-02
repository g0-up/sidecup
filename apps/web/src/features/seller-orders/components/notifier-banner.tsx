import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import type { SocketStatus } from "@/shared/realtime/socket-controller";
import { getNotifierStatus, notifierAlert, notifierKey } from "../api";

// Đỏ: phiên Zalo gửi tin cho khách đã hết hạn (API gửi kèm câu hoàn chỉnh) hoặc worker gửi tin ngừng chạy
// → khách không nhận được tin trạng thái đơn. Chưa cấu hình / chưa liên kết Zalo thì không đỏ.
// Vàng: chính màn này đang mất WebSocket và tự cập nhật bằng polling.
export function NotifierBanner({ socket }: { socket: SocketStatus }) {
  const { data } = useQuery({ queryKey: notifierKey, queryFn: getNotifierStatus, refetchInterval: 60_000 });
  return (
    <div className="no-print">
      {notifierAlert(data) && (
        <div role="alert" className="bg-destructive px-4 py-2 text-center text-sm font-medium text-white">
          {data?.message ? (
            <>
              {data.message}{" "}
              <Link to="/seller/settings" className="underline underline-offset-2">
                Mở Cài đặt
              </Link>
            </>
          ) : (
            "Zalo không gửi được tin — chỉ còn chuông báo trên màn này"
          )}
        </div>
      )}
      {socket === "fallback" && (
        <div role="status" className="bg-warning px-4 py-1.5 text-center text-sm">
          Kết nối chậm, đang tự thử lại
        </div>
      )}
    </div>
  );
}
