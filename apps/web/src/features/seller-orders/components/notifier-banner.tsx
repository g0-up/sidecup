import { useQuery } from "@tanstack/react-query";
import type { SocketStatus } from "@/shared/realtime/socket-controller";
import { getNotifierStatus, notifierAlert, notifierKey } from "../api";

// Đỏ: notifier Zalo chết hoặc có tin gửi lỗi trong 1 giờ → chuông trên màn này là kênh duy nhất (P0-5).
// Vàng: chính màn này đang mất WebSocket và tự cập nhật bằng polling.
export function NotifierBanner({ socket }: { socket: SocketStatus }) {
  const { data } = useQuery({ queryKey: notifierKey, queryFn: getNotifierStatus, refetchInterval: 60_000 });
  return (
    <div className="no-print">
      {notifierAlert(data) && (
        <div role="alert" className="bg-destructive px-4 py-2 text-center text-sm font-medium text-white">
          Zalo không gửi được tin — chỉ còn chuông báo trên màn này
          {data?.message ? ` (${data.message})` : ""}
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
