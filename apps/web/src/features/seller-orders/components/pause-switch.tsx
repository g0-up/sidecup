import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/shared/api/errors";
import { getSettings, settingsKey, updateSettings } from "@/shared/api/settings";
import { cn } from "@/shared/lib/utils";
import { Switch } from "@/shared/ui/switch";

// Công tắc ảnh hưởng mọi quán nên trạng thái phải nhìn thấy rõ (màu + chữ).
export function PauseSwitch() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: settingsKey, queryFn: getSettings });
  const m = useMutation({
    mutationFn: (accepting: boolean) => updateSettings({ accepting_orders: accepting }),
    onSuccess: (s) => qc.setQueryData(settingsKey, s),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const accepting = m.isPending ? m.variables : (data?.accepting_orders ?? true);

  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium",
        accepting ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive",
      )}
    >
      <Switch checked={accepting} disabled={!data || m.isPending} onCheckedChange={(v) => m.mutate(v)} />
      {accepting ? "Đang nhận đơn" : "Tạm ngưng nhận đơn"}
    </label>
  );
}
