import { useQuery } from "@tanstack/react-query";
import { errorMessage } from "@/shared/api/errors";
import { getSettings, settingsKey } from "@/shared/api/settings";
import { useDocumentHead } from "@/shared/hooks/use-document-head";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card";
import { SettingsForm } from "./components/settings-form";
import { ZaloCard } from "./components/zalo-card";

export function Component() {
  const { data, isPending, error, refetch } = useQuery({ queryKey: settingsKey, queryFn: getSettings });
  useDocumentHead({ title: "Cài đặt — Gọi nước" });

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
            {/* Chỉ một công tắc nhận đơn (trên thanh đầu trang) để hai nơi không lệch nhau; ở đây chỉ báo trạng thái. */}
            <CardContent className="space-y-1">
              <p className={cn("font-medium", data.accepting_orders ? "text-success" : "text-destructive")}>
                {data.accepting_orders ? "Đang nhận đơn" : "Đang tạm ngưng nhận đơn"}
              </p>
              <p className="text-sm text-muted-foreground">Bật hoặc tắt bằng công tắc “Nhận đơn” trên thanh đầu trang.</p>
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
