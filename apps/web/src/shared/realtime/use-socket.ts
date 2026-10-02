import { useEffect, useRef, useState } from "react";
import type { WsMessage } from "./messages";
import { SocketController, type SocketStatus } from "./socket-controller";

export interface UseSocketHandlers {
  onMessage: (msg: WsMessage) => void;
  onResync: () => void;
}

// useSocket mở WebSocket tới `url` (null = tắt) và trả trạng thái để UI hiện banner khi đang ở chế độ fallback.
export function useSocket(url: string | null, handlers: UseSocketHandlers): SocketStatus {
  const ref = useRef(handlers);
  const [status, setStatus] = useState<SocketStatus>("connecting");

  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    if (!url) return;
    const ctl = new SocketController({
      url,
      onMessage: (m) => ref.current.onMessage(m),
      onResync: () => ref.current.onResync(),
      onStatus: setStatus,
    });
    ctl.start();
    return () => ctl.stop();
  }, [url]);

  return status;
}
