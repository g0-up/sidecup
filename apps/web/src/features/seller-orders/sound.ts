// Chuông đơn mới: phát file new-order.mp3 qua WebAudio; chưa tải/giải mã được file thì dùng chuông tổng hợp
// hai nốt "ding-dong" để người bán không bao giờ mất âm báo.
// Safari iOS chỉ cho phát sau một chạm: AudioContext phải được tạo/resume trong handler click "Bật âm báo".
import chimeUrl from "./assets/new-order.mp3";

const CHIME_GAIN = 0.9;
const SYNTH_GAIN = 0.4;
const SYNTH_LENGTH = 0.75;

type Ctx = AudioContext;
let ctx: Ctx | null = null;
let chime: AudioBuffer | null = null;
let loading: Promise<void> | null = null;
// Mốc (theo ctx.currentTime) chuông đang phát sẽ dứt; vài đơn tới dồn thì không phát đè lên nhau.
let busyUntil = 0;

export function audioUnlocked(): boolean {
  return ctx !== null && ctx.state === "running";
}

export async function unlockAudio(): Promise<boolean> {
  try {
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    ctx ??= new AC();
    if (ctx.state !== "running") await ctx.resume();
    playSynth(ctx, 0.0001); // phát im lặng một lần để iOS mở khoá đường âm thanh
    loadChime(ctx);
    return ctx.state === "running";
  } catch {
    return false;
  }
}

export function playChime() {
  if (!ctx || ctx.state !== "running" || ctx.currentTime < busyUntil) return;
  if (!chime) {
    loadChime(ctx);
    busyUntil = ctx.currentTime + SYNTH_LENGTH;
    playSynth(ctx, SYNTH_GAIN);
    return;
  }
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = chime;
  gain.gain.value = CHIME_GAIN;
  src.connect(gain).connect(ctx.destination);
  busyUntil = ctx.currentTime + chime.duration;
  src.start();
}

// Tải nền, không chặn lần mở khoá; lỗi (mất mạng lúc mở trang) thì lần chuông sau thử lại.
function loadChime(c: Ctx) {
  if (chime || loading) return;
  loading = fetch(chimeUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`chime ${res.status}`);
      return res.arrayBuffer();
    })
    .then((data) => c.decodeAudioData(data))
    .then((buf) => {
      chime = buf;
    })
    .catch(() => {})
    .finally(() => {
      loading = null;
    });
}

function playSynth(c: Ctx, volume: number) {
  const t0 = c.currentTime;
  const notes: [number, number][] = [
    [880, 0],
    [660, 0.22],
  ];
  for (const [freq, at] of notes) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0 + at);
    gain.gain.linearRampToValueAtTime(volume, t0 + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.5);
    osc.connect(gain).connect(c.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + 0.55);
  }
}
