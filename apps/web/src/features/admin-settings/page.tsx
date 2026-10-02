import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { errorMessage } from "@/shared/api/errors";
import { getSettings, settingsKey, updateSettings } from "@/shared/api/settings";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { Label } from "@/shared/ui/label";
import { Switch } from "@/shared/ui/switch";
import { SettingsForm } from "./components/settings-form";
import { ZaloCard } from "./components/zalo-card";

export function Component() {
  const qc = useQueryClient();
  const { data, isPending, error, refetch } = useQuery({ queryKey: settingsKey, queryFn: getSettings });

  const accepting = useMutation({
    mutationFn: (v: boolean) => updateSettings({ accepting_orders: v }),
    onSuccess: (s) => {
      qc.setQueryData(settingsKey, s);
      toast.success(s.accepting_orders ? "Đã mở nhận đơn" : "Đã tạm ngưng nhận đơn");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <h1 className="text-xl font-semibold">Cài đặt</h1>
      {isPending ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : error ? (
        <div role="alert" className="space-y-2">
          <p className="text-destructive">{errorMessage(error)}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Thử lại
          </Button>
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Nhận đơn</CardTitle>
              <CardDescription>Tắt khi hết hàng hoặc bận; mọi quán sẽ hiện “Tạm ngưng nhận đơn”.</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Switch
                id="settings-accepting"
                checked={accepting.isPending ? accepting.variables : data.accepting_orders}
                disabled={accepting.isPending}
                onCheckedChange={(v) => accepting.mutate(v)}
              />
              <Label htmlFor="settings-accepting">{data.accepting_orders ? "Đang nhận đơn" : "Đang tạm ngưng"}</Label>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Giao hàng và chuyển khoản</CardTitle>
              <CardDescription>Thông tin ngân hàng dùng để tạo mã VietQR khi thu tiền.</CardDescription>
            </CardHeader>
            <CardContent>
              <SettingsForm settings={data} />
            </CardContent>
          </Card>
          <ZaloCard />
        </>
      )}
    </div>
  );
}
