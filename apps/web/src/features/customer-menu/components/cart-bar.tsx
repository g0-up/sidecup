import { ShoppingBag } from "lucide-react";
import { formatVND } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";

export function CartBar({ count, total, onOpen }: { count: number; total: number; onOpen: () => void }) {
  if (count === 0) return null;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
      <Button variant="cta" className="w-full justify-between" onClick={onOpen}>
        <span className="inline-flex items-center gap-2">
          <ShoppingBag aria-hidden /> Xem giỏ · {count} ly
        </span>
        <span className="tabular-nums">{formatVND(total)}</span>
      </Button>
    </div>
  );
}
