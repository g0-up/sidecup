// Chuông đơn mới tổng hợp bằng WebAudio (hai nốt "ding-dong"), không cần file âm thanh.
// Safari iOS chỉ cho phát sau một chạm: AudioContext phải được tạo/resume trong handler click "Bật âm báo".

type Ctx = AudioContext;
let ctx: Ctx | null = null;

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
    playChime(0.0001); // phát im lặng một lần để iOS mở khoá đường âm thanh
    return ctx.state === "running";
  } catch {
    return false;
  }
}

export function playChime(volume = 0.4) {
  if (!ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime;
  const notes: [number, number][] = [
    [880, 0],
    [660, 0.22],
  ];
  for (const [freq, at] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t0 + at);
    gain.gain.linearRampToValueAtTime(volume, t0 + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + 0.55);
  }
}
