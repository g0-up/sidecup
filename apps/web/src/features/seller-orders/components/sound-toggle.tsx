import { Bell, BellOff, BellRing } from "lucide-react";
import { Button } from "@/shared/ui/button";

interface Props {
  wanted: boolean;
  unlocked: boolean;
  onEnable: () => void;
  onDisable: () => void;
}

// Trình duyệt chặn âm thanh tới khi người dùng chạm; sau khi tải lại trang cần chạm lại một lần.
export function SoundToggle({ wanted, unlocked, onEnable, onDisable }: Props) {
  if (wanted && unlocked) {
    return (
      <Button variant="outline" size="sm" onClick={onDisable} aria-label="Tắt âm báo">
        <BellRing /> Âm báo bật
      </Button>
    );
  }
  return (
    <Button variant={wanted ? "secondary" : "outline"} size="sm" onClick={onEnable} className={wanted ? "animate-pulse" : ""}>
      {wanted ? <Bell /> : <BellOff />} {wanted ? "Chạm để bật lại âm" : "Bật âm báo"}
    </Button>
  );
}
