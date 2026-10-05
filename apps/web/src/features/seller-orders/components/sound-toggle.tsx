import { Bell, BellOff, BellRing } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

interface Props {
  wanted: boolean;
  unlocked: boolean;
  onEnable: () => void;
  onDisable: () => void;
  // compact: dưới lg chỉ còn biểu tượng 44 px (header một hàng); tên nút vẫn đọc qua aria-label.
  // Bản đủ chữ (trong menu) cao 44 px dưới lg.
  compact?: boolean;
}

// Trình duyệt chặn âm thanh tới khi người dùng chạm; sau khi tải lại trang cần chạm lại một lần.
export function SoundToggle({ wanted, unlocked, onEnable, onDisable, compact = false }: Props) {
  const text = compact ? "hidden lg:inline" : undefined;
  const size = compact ? "max-lg:size-11" : "max-lg:h-11";
  if (wanted && unlocked) {
    return (
      <Button variant="outline" size="sm" onClick={onDisable} aria-label="Âm báo bật, chạm để tắt" className={size}>
        <BellRing />
        <span className={text}>Âm báo bật</span>
      </Button>
    );
  }
  const label = wanted ? "Chạm để bật lại âm" : "Bật âm báo";
  return (
    <Button
      variant={wanted ? "secondary" : "outline"}
      size="sm"
      onClick={onEnable}
      aria-label={label}
      className={cn(size, wanted && "motion-safe:animate-pulse")}
    >
      {wanted ? <Bell /> : <BellOff />}
      <span className={text}>{label}</span>
    </Button>
  );
}
