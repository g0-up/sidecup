import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { errorMessage, isApiError } from "@/shared/api/errors";
import type { SellerOrder } from "@/shared/api/orders";
import { settingsKey, type Settings } from "@/shared/api/settings";
import { isOpen } from "@/shared/lib/order-status";
import { MSG, wsUrl } from "@/shared/realtime/messages";
import type { SocketStatus } from "@/shared/realtime/socket-controller";
import { useSocket } from "@/shared/realtime/use-socket";
import { getOrder, listOrders, notifierKey, transition, type NotifierStatus, type TransitionBody } from "./api";
import { boardReducer, initialBoard, type BoardAction, type BoardState } from "./store";

interface BoardContextValue {
  state: BoardState;
  dispatch: (a: BoardAction) => void;
  socket: SocketStatus;
  loadError: string | null;
  retryLoad: () => void;
  // runTransition gửi expected_from = trạng thái đang hiển thị; 409 → báo và tải lại đúng đơn đó.
  runTransition: (order: SellerOrder, body: Omit<TransitionBody, "expected_from">) => Promise<boolean>;
  refreshOrder: (id: string) => Promise<SellerOrder | null>;
  loadClosed: () => Promise<void>;
}

const BoardContext = createContext<BoardContextValue | null>(null);

// SellerBoardProvider giữ một kết nối /ws/seller cho mọi trang người bán (bảng đơn, chi tiết, quản trị):
// đơn mới vẫn kêu chuông khi người bán đang ở trang Món hay Báo cáo.
export function SellerBoardProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [state, dispatch] = useReducer(boardReducer, initialBoard);
  const orders = useRef(state.orders);
  const [loadError, setLoadError] = useState<string | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    orders.current = state.orders;
  }, [state.orders]);

  // Lần tải đầu lỗi (mất mạng, API khởi động lại) thì tự thử lại mỗi 5 giây; bảng không được đứng im.
  const initialLoad = useCallback(async () => {
    clearTimeout(retryTimer.current);
    try {
      const res = await listOrders({ scope: "open" });
      dispatch({ type: "loaded", orders: res.orders, serverTime: res.server_time, initial: true });
      setLoadError(null);
    } catch (e) {
      setLoadError(errorMessage(e));
      retryTimer.current = setTimeout(() => void initialLoad(), 5_000);
    }
  }, []);

  useEffect(() => () => clearTimeout(retryTimer.current), []);

  // resync sau mỗi lần (re)connect và mỗi nhịp polling: lấy lại TOÀN BỘ đơn đang mở (tập nhỏ, không phụ thuộc
  // mốc thời gian nên không bỏ sót đơn commit lệch giờ). Đơn đang hiện là mở mà không còn trong danh sách
  // thì đã đóng trong lúc mất kết nối → hỏi lại từng đơn để cập nhật trạng thái cuối.
  const resync = useCallback(async () => {
    try {
      const res = await listOrders({ scope: "open" });
      const fresh = new Set(res.orders.map((o) => o.id));
      const stale = Object.values(orders.current).filter((o) => isOpen(o.status) && !fresh.has(o.id));
      dispatch({ type: "loaded", orders: res.orders, serverTime: res.server_time, initial: false });
      await Promise.all(
        stale.map(async (o) => {
          try {
            const { server_time, ...order } = await getOrder(o.id);
            dispatch({ type: "upsert", order, serverTime: server_time });
          } catch {
            /* lần resync sau thử lại */
          }
        }),
      );
      setLoadError(null);
    } catch {
      /* lần poll/reconnect sau thử lại */
    }
    void qc.invalidateQueries({ queryKey: notifierKey });
    void qc.invalidateQueries({ queryKey: settingsKey });
  }, [qc]);

  useEffect(() => {
    void initialLoad();
  }, [initialLoad]);

  const socket = useSocket(state.loaded ? wsUrl("/ws/seller") : null, {
    onResync: () => void resync(),
    onMessage: (msg) => {
      switch (msg.type) {
        case MSG.orderCreated:
        case MSG.orderUpdated:
          dispatch({ type: "message", msg });
          break;
        case MSG.settingsUpdated:
          qc.setQueryData<Settings>(settingsKey, msg.data as Settings);
          break;
        case MSG.notifierStatus:
          qc.setQueryData<NotifierStatus>(notifierKey, msg.data as NotifierStatus);
          break;
      }
    },
  });

  const refreshOrder = useCallback(async (id: string) => {
    try {
      const res = await getOrder(id);
      const { server_time, ...order } = res;
      dispatch({ type: "upsert", order, serverTime: server_time });
      return order;
    } catch {
      return null;
    }
  }, []);

  const runTransition = useCallback(
    async (order: SellerOrder, body: Omit<TransitionBody, "expected_from">) => {
      try {
        const res = await transition(order.id, { ...body, expected_from: order.status });
        const { server_time, ...updated } = res;
        dispatch({ type: "upsert", order: updated, serverTime: server_time });
        dispatch({ type: "seen", ids: [order.id] });
        return true;
      } catch (e) {
        if (isApiError(e, "INVALID_TRANSITION")) {
          toast.warning("Đơn đã đổi trạng thái", { description: `Đơn #${order.code} vừa được cập nhật ở máy khác.` });
          await refreshOrder(order.id);
        } else {
          toast.error(errorMessage(e));
        }
        return false;
      }
    },
    [refreshOrder],
  );

  const loadClosed = useCallback(async () => {
    try {
      const res = await listOrders({ scope: "closed" });
      dispatch({ type: "merge", orders: res.orders });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }, []);

  const value = useMemo<BoardContextValue>(
    () => ({ state, dispatch, socket, loadError, retryLoad: () => void initialLoad(), runTransition, refreshOrder, loadClosed }),
    [state, socket, loadError, initialLoad, runTransition, refreshOrder, loadClosed],
  );
  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useSellerBoard(): BoardContextValue {
  const v = useContext(BoardContext);
  if (!v) throw new Error("useSellerBoard phải nằm trong SellerBoardProvider");
  return v;
}
