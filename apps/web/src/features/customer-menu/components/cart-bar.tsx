import { ShoppingBag } from "lucide-react";
import { useState } from "react";
import { formatVND } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";

export function CartBar({ count, total, onOpen }: { count: number; total: number; onOpen: () => void }) {
  // Số ly nảy một nhịp mỗi khi tăng: đổi key để gắn lại phần tử, animation chạy lại từ đầu.
  const [prev, setPrev] = useState(count);
  const [bumps, setBumps] = useState(0);
  if (count !== prev) {
    setPrev(count);
    if (count > prev) setBumps((n) => n + 1);
  }

  if (count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      <Button variant="cta" className="w-full justify-between" onClick={onOpen}>
        <span key={bumps} data-bump={bumps > 0 || undefined} className="count-bump inline-flex items-center gap-2">
          <ShoppingBag aria-hidden /> Xem giỏ · {count} ly
        </span>
        <span className="tabular-nums">{formatVND(total)}</span>
      </Button>
    </div>
  );
}
