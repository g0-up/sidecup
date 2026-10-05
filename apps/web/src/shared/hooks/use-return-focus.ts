import { useRef } from "react";

type FocusHandler = (e: Event) => void;

// useReturnFocus: Radix chỉ trả focus về Trigger của nó; hộp thoại mở bằng state thì focus rơi về <body>.
// Ghi lại phần tử đang có focus lúc hộp mở và trả focus về đó khi đóng, nếu phần tử vẫn còn trên trang.
export function useReturnFocus(onOpenAutoFocus?: FocusHandler, onCloseAutoFocus?: FocusHandler) {
  const opener = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus: (e: Event) => {
      opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      onOpenAutoFocus?.(e);
    },
    onCloseAutoFocus: (e: Event) => {
      onCloseAutoFocus?.(e);
      const el = opener.current;
      opener.current = null;
      if (e.defaultPrevented || !el?.isConnected || el === document.body) return;
      e.preventDefault();
      el.focus();
    },
  };
}
