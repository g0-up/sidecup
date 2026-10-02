import { useCallback, useState } from "react";

// useLocalStorage nhớ một chuỗi qua các lần mở trang; storage bị chặn (webview, private mode) thì chỉ giữ trong phiên.
export function useLocalStorage(key: string, initial = ""): [string, (v: string) => void] {
  const [value, setValue] = useState<string>(() => {
    try {
      return localStorage.getItem(key) ?? initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v: string) => {
      setValue(v);
      try {
        localStorage.setItem(key, v);
      } catch {
        /* storage bị chặn */
      }
    },
    [key],
  );
  return [value, set];
}
