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

  // Nháy xen kẽ "(n) Đơn mới" với tiêu đề của trang đang mở; trang đổi tiêu đề giữa chừng thì nhịp sau lấy tiêu đề mới.
  useEffect(() => {
    if (unseen === 0) return;
    const alert = `(${unseen}) Đơn mới`;
    let base = document.title;
    let on = true;
    document.title = alert;
    const t = setInterval(() => {
      if (document.title !== alert) base = document.title;
      on = !on;
      document.title = on ? alert : base;
    }, BLINK_MS);
    return () => {
      clearInterval(t);
      if (document.title === alert) document.title = base;
    };
  }, [unseen]);
}
