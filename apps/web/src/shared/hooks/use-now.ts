import { useEffect, useState } from "react";

// useNow trả Date.now() và vẽ lại mỗi `everyMs` (đồng hồ đếm lên trên thẻ đơn).
export function useNow(everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}
