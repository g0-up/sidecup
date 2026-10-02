import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu as MenuIcon } from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { logout } from "@/features/seller-auth/api";
import { RequireSeller } from "@/features/seller-auth/guard";
import { SellerBoardProvider, useSellerBoard } from "@/features/seller-orders/board-context";
import { NotifierBanner } from "@/features/seller-orders/components/notifier-banner";
import { PauseSwitch } from "@/features/seller-orders/components/pause-switch";
import { SoundToggle } from "@/features/seller-orders/components/sound-toggle";
import { useNewOrderAlert } from "@/features/seller-orders/hooks/use-new-order-alert";
import { useSoundPref } from "@/features/seller-orders/hooks/use-sound-pref";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Toaster } from "@/shared/ui/sonner";
import { queryClient } from "./query-client";

const NAV = [
  { to: "/seller", label: "Đơn", end: true },
  { to: "/seller/products", label: "Món" },
  { to: "/seller/partners", label: "Quán" },
  { to: "/seller/settings", label: "Cài đặt" },
  { to: "/seller/reports", label: "Báo cáo" },
];

export function Component() {
  return (
    <QueryClientProvider client={queryClient}>
      <RequireSeller>
        <SellerBoardProvider>
          <Shell />
        </SellerBoardProvider>
      </RequireSeller>
      <Toaster position="top-center" richColors />
    </QueryClientProvider>
  );
}

function Shell() {
  const { state, socket } = useSellerBoard();
  const sound = useSoundPref();
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  useNewOrderAlert(state.unseen.length, sound.playing);

  async function onLogout() {
    try {
      await logout();
    } finally {
      qc.clear();
      navigate("/seller/login", { replace: true });
    }
  }

  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="no-print sticky top-0 z-30 bg-primary text-primary-foreground shadow-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 py-2">
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground md:hidden" aria-label="Mở menu" onClick={() => setNavOpen((v) => !v)}>
            <MenuIcon />
          </Button>
          <span className="font-semibold tracking-tight">Gọi nước</span>
          <nav className={cn("order-last w-full gap-1 md:order-none md:flex md:w-auto", navOpen ? "flex flex-col" : "hidden")}>
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                onClick={() => setNavOpen(false)}
                className={({ isActive }) =>
                  cn("rounded-md px-3 py-1.5 text-sm font-medium", isActive ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white")
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <PauseSwitch />
            <SoundToggle wanted={sound.wanted} unlocked={sound.unlocked} onEnable={() => void sound.enable()} onDisable={sound.disable} />
            <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-white/10 hover:text-primary-foreground" aria-label="Đăng xuất" onClick={() => void onLogout()}>
              <LogOut />
            </Button>
          </div>
        </div>
      </header>
      <NotifierBanner socket={socket} />
      <Outlet />
    </div>
  );
}
