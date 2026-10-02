import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AudioContext giả: đếm số nốt tổng hợp và số lần phát file; thời gian do test điều khiển.
class FakeContext {
  state = "suspended";
  currentTime = 0;
  destination = {};
  oscillators = 0;
  buffers = 0;
  resume = vi.fn(async () => {
    this.state = "running";
  });
  decodeAudioData = vi.fn(async () => ({ duration: 2 }) as AudioBuffer);
  createOscillator() {
    this.oscillators++;
    return { type: "", frequency: { value: 0 }, connect: (n: unknown) => n, start() {}, stop() {} };
  }
  createGain() {
    const node = {
      gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} },
      connect: (n: unknown) => n,
    };
    return node;
  }
  createBufferSource() {
    this.buffers++;
    return { buffer: null, connect: (n: unknown) => n, start() {} };
  }
}

let ctx: FakeContext;

async function load() {
  vi.resetModules();
  return import("./sound");
}

beforeEach(() => {
  vi.stubGlobal(
    "AudioContext",
    vi.fn(function () {
      ctx = new FakeContext();
      return ctx;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("chuông đơn mới", () => {
  it("phát file mp3 sau khi mở khoá và không phát đè khi chuông trước chưa dứt", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ArrayBuffer(8))));
    const sound = await load();
    expect(await sound.unlockAudio()).toBe(true);
    await vi.waitFor(() => expect(ctx.decodeAudioData).toHaveBeenCalled());
    await Promise.resolve();

    sound.playChime();
    expect(ctx.buffers).toBe(1);
    ctx.currentTime = 1.5;
    sound.playChime();
    expect(ctx.buffers).toBe(1);
    ctx.currentTime = 2;
    sound.playChime();
    expect(ctx.buffers).toBe(2);
  });

  it("tải file lỗi thì dùng chuông tổng hợp và thử tải lại ở lần chuông sau", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    const sound = await load();
    await sound.unlockAudio();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r));
    const silent = ctx.oscillators;

    sound.playChime();
    expect(ctx.buffers).toBe(0);
    expect(ctx.oscillators).toBe(silent + 2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("chưa mở khoá thì không kêu", async () => {
    const sound = await load();
    sound.playChime();
    expect(sound.audioUnlocked()).toBe(false);
  });
});
