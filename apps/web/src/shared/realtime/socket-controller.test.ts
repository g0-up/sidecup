import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLOSE_FORBIDDEN } from "./messages";
import { SocketController } from "./socket-controller";

class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  open() {
    this.onopen?.();
  }
  send(type: string, data: unknown = null) {
    this.onmessage?.({ data: JSON.stringify({ type, data, server_time: "2026-10-01T08:00:00Z" }) });
  }
  serverClose(code = 1006) {
    this.onclose?.({ code });
  }
  close() {
    this.closed = true;
  }
}

function setup() {
  const onMessage = vi.fn();
  const onResync = vi.fn();
  const statuses: string[] = [];
  const ctl = new SocketController({
    url: "ws://test/ws/customer?client_id=abc&token=T",
    onMessage,
    onResync,
    onStatus: (s) => statuses.push(s),
    createSocket: (url) => new FakeSocket(url) as unknown as WebSocket,
  });
  ctl.start();
  const last = () => FakeSocket.all[FakeSocket.all.length - 1];
  return { ctl, onMessage, onResync, statuses, last };
}

describe("SocketController", () => {
  beforeEach(() => {
    FakeSocket.all = [];
    vi.useFakeTimers();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => vi.useRealTimers());

  it("mở kết nối, resync một lần, chuyển message (bỏ qua ping)", () => {
    const { ctl, onMessage, onResync, statuses, last } = setup();
    last().open();
    expect(statuses).toEqual(["open"]);
    expect(onResync).toHaveBeenCalledTimes(1);
    last().send("ping");
    last().send("order.updated", { id: "1" });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0][0].type).toBe("order.updated");
    ctl.stop();
  });

  it("không nối được trong 5 giây thì bật polling 15 giây và log ws_fallback", () => {
    const { ctl, onResync, statuses } = setup();
    vi.advanceTimersByTime(5_000);
    expect(statuses).toEqual(["fallback"]);
    expect(console.info).toHaveBeenCalledWith("ws_fallback", expect.anything());
    vi.advanceTimersByTime(15_000);
    expect(onResync).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    expect(onResync).toHaveBeenCalledTimes(3);
    ctl.stop();
  });

  it("bị đóng thì fallback ngay, reconnect với backoff và tắt polling khi nối lại", () => {
    const { ctl, onResync, statuses, last } = setup();
    last().open();
    last().serverClose();
    expect(statuses).toEqual(["open", "fallback"]);
    expect(FakeSocket.all).toHaveLength(1);

    vi.advanceTimersByTime(1_000); // backoff 1s
    expect(FakeSocket.all).toHaveLength(2);
    last().serverClose();
    vi.advanceTimersByTime(1_999);
    expect(FakeSocket.all).toHaveLength(2);
    vi.advanceTimersByTime(1); // backoff 2s
    expect(FakeSocket.all).toHaveLength(3);

    last().open();
    expect(statuses[statuses.length - 1]).toBe("open");
    expect(onResync).toHaveBeenCalledTimes(2); // lần open đầu + lần nối lại
    vi.advanceTimersByTime(60_000);
    expect(onResync).toHaveBeenCalledTimes(2); // không còn polling
    ctl.stop();
  });

  it("server im lặng quá 65 giây thì coi như chết và kết nối lại", () => {
    const { ctl, last } = setup();
    last().open();
    vi.advanceTimersByTime(30_000);
    last().send("ping");
    vi.advanceTimersByTime(64_000);
    expect(last().closed).toBe(false);
    vi.advanceTimersByTime(1_000);
    expect(FakeSocket.all[0].closed).toBe(true);
    vi.advanceTimersByTime(1_000);
    expect(FakeSocket.all).toHaveLength(2);
    ctl.stop();
  });

  it("mã đóng 4403 thì không thử lại, chỉ còn polling", () => {
    const { ctl, onResync, last } = setup();
    last().serverClose(CLOSE_FORBIDDEN);
    vi.advanceTimersByTime(60_000);
    expect(FakeSocket.all).toHaveLength(1);
    expect(onResync).toHaveBeenCalledTimes(4);
    ctl.stop();
  });

  it("stop dọn mọi timer", () => {
    const { ctl, onResync, last } = setup();
    last().serverClose();
    ctl.stop();
    vi.advanceTimersByTime(120_000);
    expect(onResync).not.toHaveBeenCalled();
    expect(FakeSocket.all).toHaveLength(1);
  });
});
