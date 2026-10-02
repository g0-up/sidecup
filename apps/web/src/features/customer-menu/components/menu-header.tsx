import { Clock, Wallet } from "lucide-react";
import type { Menu } from "../api";

export function MenuHeader({ menu }: { menu: Menu }) {
  return (
    <header className="space-y-2 px-4 pt-5 pb-3">
      <p className="text-sm text-muted-foreground">{menu.partner.name}</p>
      <h1 className="text-2xl font-semibold tracking-tight">{menu.table_label}</h1>
      <div className="flex flex-col gap-1 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Clock className="size-4" aria-hidden /> Giao trong khoảng {menu.eta_minutes} phút
        </span>
        <span className="inline-flex items-center gap-2">
          <Wallet className="size-4" aria-hidden /> Trả tiền khi nhận, tiền mặt hoặc chuyển khoản
        </span>
      </div>
    </header>
  );
}
