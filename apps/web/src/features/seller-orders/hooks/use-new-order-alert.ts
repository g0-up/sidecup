import { useEffect, useRef } from "react";
import { playChime } from "../sound";

const REPEAT_MS = 10_000;
const BLINK_MS = 1_000;

// Kêu ngay khi có thêm đơn chưa xem, lặp mỗi 10 giây khi còn đơn `sent` chưa xem; tiêu đề tab nháy "(n) Đơn mới".
export function useNewOrderAlert(unseen: number, soundOn: boolean) {
  const prev = useRef(unseen);

  useEffect(() => {
    if (unseen > prev.current && soundOn) playChime();
    prev.current = unseen;
  }, [unseen, soundOn]);

  useEffect(() => {
    if (unseen === 0 || !soundOn) return;
    const t = setInterval(() => playChime(), REPEAT_MS);
    return () => clearInterval(t);
  }, [unseen, soundOn]);

  useEffect(() => {
    const base = "Màn người bán";
    if (unseen === 0) {
      document.title = base;
      return;
    }
    let on = true;
    document.title = `(${unseen}) Đơn mới`;
    const t = setInterval(() => {
      on = !on;
      document.title = on ? `(${unseen}) Đơn mới` : base;
    }, BLINK_MS);
    return () => {
      clearInterval(t);
      document.title = base;
    };
  }, [unseen]);
}
