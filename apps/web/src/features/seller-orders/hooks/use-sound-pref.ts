import { useCallback, useState } from "react";
import { useLocalStorage } from "@/shared/hooks/use-local-storage";
import { audioUnlocked, unlockAudio } from "../sound";

// Người bán bật âm một lần thì nhớ ý muốn; sau mỗi lần tải lại trang vẫn cần một chạm để mở khoá âm thanh.
export function useSoundPref() {
  const [pref, setPref] = useLocalStorage("sc_sound", "off");
  const [unlocked, setUnlocked] = useState(audioUnlocked());
  const wanted = pref === "on";

  const enable = useCallback(async () => {
    const ok = await unlockAudio();
    setUnlocked(ok);
    setPref("on");
  }, [setPref]);

  const disable = useCallback(() => setPref("off"), [setPref]);

  return { wanted, unlocked, playing: wanted && unlocked, enable, disable };
}
