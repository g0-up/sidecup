import { CLOSE_FORBIDDEN, CLOSE_UNAUTHORIZED, MSG, type WsMessage } from "./messages";

export type SocketStatus = "connecting" | "open" | "fallback";

export interface SocketControllerOptions {
  url: string;
  onMessage: (msg: WsMessage) => void;
  // Gọi REST để đồng bộ lại: sau mỗi lần (re)connect thành công và mỗi nhịp polling khi ở chế độ fallback.
  onResync: () => void;
  onStatus?: (status: SocketStatus) => void;
  fallbackMs?: number;
  hiddenFallbackMs?: number;
  connectTimeoutMs?: number;
  heartbeatMs?: number;
  maxBackoffMs?: number;
  createSocket?: (url: string) => WebSocket;
}

// SocketController giữ một WebSocket sống: reconnect backoff 1s→30s, phát hiện server im lặng (không có
// message "ping" 65 giây), và tự bật polling REST khi không nối được trong 5 giây hoặc kết nối bị đóng.
// Không phụ thuộc React để test được bằng fake WebSocket + fake timer.
export class SocketController {
  private readonly o: Required<Omit<SocketControllerOptions, "onStatus">> & Pick<SocketControllerOptions, "onStatus">;
  private ws: WebSocket | null = null;
  private status: SocketStatus = "connecting";
  private stopped = false;
  private forbidden = false;
  private attempt = 0;
  private fallback = false;
  private connectTimer: ReturnType<typeof setTimeout> | undefined;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private heartbeatTimer: ReturnType<typeof setTimeout> | undefined;
  private pollTimer: ReturnType<typeof setInterval> | undefined;

  constructor(opts: SocketControllerOptions) {
    this.o = {
      fallbackMs: 15_000,
      hiddenFallbackMs: 30_000,
      connectTimeoutMs: 5_000,
      heartbeatMs: 65_000,
      maxBackoffMs: 30_000,
      createSocket: (url) => new WebSocket(url),
      ...opts,
    };
  }

  start() {
    this.stopped = false;
    document.addEventListener("visibilitychange", this.onVisibility);
    this.connect();
  }

  stop() {
    this.stopped = true;
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.clearConnectionTimers();
    clearTimeout(this.reconnectTimer);
    this.stopPolling();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close(1000);
      } catch {
        /* đã đóng */
      }
    }
  }

  getStatus(): SocketStatus {
    return this.status;
  }

  private setStatus(s: SocketStatus) {
    if (this.status === s) return;
    this.status = s;
    this.o.onStatus?.(s);
  }

  private connect() {
    if (this.stopped || this.forbidden) return;
    if (!this.fallback) this.setStatus("connecting");
    let ws: WebSocket;
    try {
      ws = this.o.createSocket(this.o.url);
    } catch {
      this.handleClose(1006);
      return;
    }
    this.ws = ws;
    this.connectTimer = setTimeout(() => this.enterFallback(), this.o.connectTimeoutMs);
    ws.onopen = () => {
      clearTimeout(this.connectTimer);
      this.attempt = 0;
      this.exitFallback();
      this.setStatus("open");
      this.armHeartbeat();
      this.o.onResync();
    };
    ws.onmessage = (ev: MessageEvent) => {
      this.armHeartbeat();
      let msg: WsMessage;
      try {
        msg = JSON.parse(String(ev.data)) as WsMessage;
      } catch {
        return;
      }
      if (msg.type !== MSG.ping) this.o.onMessage(msg);
    };
    ws.onclose = (ev: CloseEvent) => {
      if (this.ws === ws) this.handleClose(ev.code);
    };
  }

  private handleClose(code: number) {
    this.ws = null;
    this.clearConnectionTimers();
    if (this.stopped) return;
    if (code === CLOSE_FORBIDDEN || code === CLOSE_UNAUTHORIZED) this.forbidden = true;
    this.enterFallback();
    if (this.forbidden) return;
    const delay = Math.min(this.o.maxBackoffMs, 1000 * 2 ** this.attempt);
    this.attempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  // Server gửi "ping" mỗi 30 giây; im lặng quá heartbeatMs nghĩa là kết nối chết lặng (proxy/4G cắt).
  private armHeartbeat() {
    clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = setTimeout(() => {
      const ws = this.ws;
      if (!ws) return;
      try {
        ws.close(4000, "heartbeat timeout");
      } catch {
        /* bỏ qua */
      }
      this.handleClose(1006);
    }, this.o.heartbeatMs);
  }

  private clearConnectionTimers() {
    clearTimeout(this.connectTimer);
    clearTimeout(this.heartbeatTimer);
  }

  private enterFallback() {
    if (this.fallback || this.stopped) return;
    this.fallback = true;
    this.setStatus("fallback");
    console.info("ws_fallback", { url: this.o.url.replace(/client_id=[^&]+/, "client_id=…") });
    this.startPolling();
  }

  private exitFallback() {
    if (!this.fallback) return;
    this.fallback = false;
    this.stopPolling();
  }

  private startPolling() {
    this.stopPolling();
    const every = document.hidden ? this.o.hiddenFallbackMs : this.o.fallbackMs;
    this.pollTimer = setInterval(() => this.o.onResync(), every);
  }

  private stopPolling() {
    clearInterval(this.pollTimer);
    this.pollTimer = undefined;
  }

  private onVisibility = () => {
    if (this.fallback) this.startPolling();
  };
}
