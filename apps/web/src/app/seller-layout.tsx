import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { LogOut, Menu as MenuIcon } from "lucide-react";
import { useState, type ReactElement } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { logout } from "@/features/seller-auth/api";
import { RequireSeller } from "@/features/seller-auth/guard";
import { SellerBoardProvider, useSellerBoard } from "@/features/seller-orders/board-context";
import { NotifierBanner } from "@/features/seller-orders/components/notifier-banner";
import { PauseSwitch } from "@/features/seller-orders/components/pause-switch";
import { SoundToggle } from "@/features/seller-orders/components/sound-toggle";
import { useNewOrderAlert } from "@/features/seller-orders/hooks/use-new-order-alert";
import { useSoundPref } from "@/features/seller-orders/hooks/use-sound-pref";
import { cn } from "@/shared/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/shared/ui/sheet";
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

// "Đơn" sáng cả khi đang xem chi tiết một đơn (/seller/orders/:id).
function useNavActive() {
  const { pathname } = useLocation();
  return (to: string, isActive: boolean) => isActive || (to === "/seller" && pathname.startsWith("/seller/orders/"));
}

// Đăng xuất thì màn này thôi báo đơn mới, nên luôn hỏi lại trước.
function LogoutConfirm({ trigger, onLogout }: { trigger: ReactElement; onLogout: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Đăng xuất?</AlertDialogTitle>
          <AlertDialogDescription>Sau khi đăng xuất, máy này không còn kêu chuông khi có đơn mới.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="h-11">Ở lại</AlertDialogCancel>
          <AlertDialogAction className="h-11" onClick={onLogout}>
            Đăng xuất
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const headerIcon = "text-primary-foreground hover:bg-white/10 hover:text-primary-foreground";

function Shell() {
  const { state, socket } = useSellerBoard();
  const sound = useSoundPref();
  const [navOpen, setNavOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const navActive = useNavActive();
  useNewOrderAlert(state.unseen.length, sound.playing);

  async function onLogout() {
    try {
      await logout();
    } finally {
      qc.clear();
      navigate("/seller/login", { replace: true });
    }
  }

  // Dưới lg header là một hàng (menu, tên, công tắc, chuông); trang và đăng xuất nằm trong ngăn kéo phủ lên nội dung.
  return (
    <div className="min-h-dvh bg-muted/40">
      <header className="no-print sticky top-0 z-30 bg-primary text-primary-foreground shadow-card">
        <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-1.5 lg:py-2">
          <Sheet open={navOpen} onOpenChange={setNavOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className={cn("-ml-2 size-11 lg:hidden", headerIcon)} aria-label="Mở menu">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" aria-describedby={undefined} className="gap-0">
              <SheetHeader className="pr-14">
                <SheetTitle>Gọi nước</SheetTitle>
              </SheetHeader>
              <nav aria-label="Trang người bán" className="flex flex-col gap-1 px-2">
                {NAV.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    end={n.end}
                    onClick={() => setNavOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex min-h-11 items-center rounded-md px-3 font-medium",
                        navActive(n.to, isActive) ? "bg-secondary text-foreground" : "text-foreground/80 hover:bg-accent",
                      )
                    }
                  >
                    {n.label}
                  </NavLink>
                ))}
              </nav>
              <div className="mt-auto space-y-2 border-t p-4">
                <SoundToggle wanted={sound.wanted} unlocked={sound.unlocked} onEnable={() => void sound.enable()} onDisable={sound.disable} />
                <LogoutConfirm
                  onLogout={() => void onLogout()}
                  trigger={
                    <Button variant="outline" className="h-11 w-full">
                      <LogOut /> Đăng xuất
                    </Button>
                  }
                />
              </div>
            </SheetContent>
          </Sheet>
          <span className="truncate font-semibold tracking-tight">Gọi nước</span>
          <nav aria-label="Trang người bán" className="hidden gap-1 lg:flex">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium",
                    navActive(n.to, isActive) ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white",
                  )
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <PauseSwitch />
            <SoundToggle compact wanted={sound.wanted} unlocked={sound.unlocked} onEnable={() => void sound.enable()} onDisable={sound.disable} />
            <LogoutConfirm
              onLogout={() => void onLogout()}
              trigger={
                <Button variant="ghost" size="icon" className={cn("hidden lg:inline-flex", headerIcon)} aria-label="Đăng xuất">
                  <LogOut />
                </Button>
              }
            />
          </div>
        </div>
      </header>
      <NotifierBanner socket={socket} />
      <Outlet />
    </div>
  );
}
