import { useCallback, useEffect, useRef, useState } from "react";
import { getClientId } from "@/shared/api/client-id";
import { ApiError, isApiError } from "@/shared/api/errors";
import { isOpen } from "@/shared/lib/order-status";
import { serverClock, type ServerClock } from "@/shared/lib/time";
import { MSG, wsUrl } from "@/shared/realtime/messages";
import { useSocket } from "@/shared/realtime/use-socket";
import { getOrder, type PublicOrder } from "../api";

export type OrderState =
  | { status: "loading" }
  | { status: "ready"; order: PublicOrder; clock: ServerClock }
  | { status: "error"; error: ApiError };

// useOrder: tải đơn, nghe order.updated; đóng socket khi đơn đã đóng (không còn gì để chờ).
export function useOrder(id: string) {
  const [state, setState] = useState<OrderState>({ status: "loading" });
  const hasData = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await getOrder(id);
      hasData.current = true;
      const { server_time, ...order } = res;
      setState({ status: "ready", order, clock: serverClock(server_time) });
    } catch (e) {
      if (hasData.current && isApiError(e) && (e.isNetwork || e.status >= 500)) return;
      setState({ status: "error", error: isApiError(e) ? e : new ApiError(0, "UNKNOWN", "Không tải được đơn") });
    }
  }, [id]);

  useEffect(() => {
    hasData.current = false;
    setState({ status: "loading" });
    void load();
  }, [load]);

  const open = state.status === "ready" && isOpen(state.order.status);
  const url = open ? wsUrl(`/ws/customer?client_id=${encodeURIComponent(getClientId())}&order=${encodeURIComponent(id)}`) : null;

  const socket = useSocket(url, {
    onResync: () => void load(),
    onMessage: (msg) => {
      if (msg.type !== MSG.orderUpdated) return;
      const order = msg.data as PublicOrder;
      if (order.id !== id) return;
      setState((s) =>
        s.status === "ready" && Date.parse(s.order.updated_at) > Date.parse(order.updated_at)
          ? s
          : { status: "ready", order, clock: serverClock(msg.server_time) },
      );
    },
  });

  const replace = useCallback((order: PublicOrder, serverTime: string) => {
    setState({ status: "ready", order, clock: serverClock(serverTime) });
  }, []);

  return { state, reload: load, replace, socket };
}
