import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { getClientId } from "@/shared/api/client-id";
import { ApiError, isApiError } from "@/shared/api/errors";
import { MSG, wsUrl } from "@/shared/realtime/messages";
import { useSocket } from "@/shared/realtime/use-socket";
import { getMenu, type Menu, type MenuUpdate } from "../api";

export type MenuState =
  | { status: "loading" }
  | { status: "ready"; menu: Menu }
  | { status: "error"; error: ApiError };

// useMenu: tải menu một lần, nghe menu.updated qua WebSocket, tự polling 15 giây khi WS không nối được.
// Mã đã thu hồi (410 hoặc message revoked) → chuyển sang /revoked.
export function useMenu(token: string) {
  const navigate = useNavigate();
  const [state, setState] = useState<MenuState>({ status: "loading" });
  const hasData = useRef(false);

  const load = useCallback(async () => {
    try {
      const menu = await getMenu(token);
      hasData.current = true;
      setState({ status: "ready", menu });
    } catch (e) {
      if (isApiError(e, "QR_REVOKED")) {
        navigate("/revoked", { replace: true });
        return;
      }
      // Lỗi mạng khi đã có menu (đang polling) thì giữ nguyên màn hình, lần sau thử lại.
      if (hasData.current && isApiError(e) && (e.isNetwork || e.status >= 500)) return;
      setState({ status: "error", error: isApiError(e) ? e : new ApiError(0, "UNKNOWN", "Không tải được menu") });
    }
  }, [token, navigate]);

  useEffect(() => {
    hasData.current = false;
    setState({ status: "loading" });
    void load();
  }, [load]);

  // Server không phát sự kiện theo mốc giờ: ngoài giờ bán thì tự hỏi lại mỗi phút để nút đặt mở đúng lúc tới giờ.
  const closed = state.status === "ready" && state.menu.ordering.reason === "closed";
  useEffect(() => {
    if (!closed) return;
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [closed, load]);

  const ready = state.status === "ready";
  const url = ready
    ? wsUrl(`/ws/customer?client_id=${encodeURIComponent(getClientId())}&token=${encodeURIComponent(token)}`)
    : null;

  const socket = useSocket(url, {
    onResync: () => void load(),
    onMessage: (msg) => {
      if (msg.type !== MSG.menuUpdated) return;
      const upd = msg.data as MenuUpdate;
      if (upd.revoked) {
        navigate("/revoked", { replace: true });
        return;
      }
      setState((s) =>
        s.status === "ready"
          ? {
              status: "ready",
              menu: {
                ...s.menu,
                products: upd.products ?? s.menu.products,
                ordering: upd.ordering ?? s.menu.ordering,
              },
            }
          : s,
      );
    },
  });

  return { state, reload: load, socket };
}
