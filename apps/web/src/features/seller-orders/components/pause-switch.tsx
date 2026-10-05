import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/shared/api/errors";
import { getSettings, settingsKey, updateSettings } from "@/shared/api/settings";
import { cn } from "@/shared/lib/utils";
import { Switch } from "@/shared/ui/switch";

// Công tắc ảnh hưởng mọi quán nên trạng thái phải nhìn thấy rõ (màu + chữ). Dưới lg header chỉ còn một hàng nên chữ ngắn lại.
// Tên đọc cho trình đọc màn hình cố định là "Nhận đơn" (bật/tắt do switch báo); chữ trạng thái chỉ để nhìn.
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
        "inline-flex min-h-11 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap lg:min-h-0",
        accepting ? "bg-white text-success" : "bg-white text-destructive",
      )}
    >
      <Switch size="lg" aria-label="Nhận đơn" checked={accepting} disabled={!data || m.isPending} onCheckedChange={(v) => m.mutate(v)} />
      <span aria-hidden="true" className="lg:hidden">{accepting ? "Nhận đơn" : "Tạm ngưng"}</span>
      <span aria-hidden="true" className="hidden lg:inline">{accepting ? "Đang nhận đơn" : "Tạm ngưng nhận đơn"}</span>
    </label>
  );
}
