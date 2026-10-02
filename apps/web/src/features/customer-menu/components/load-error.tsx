import { Camera } from "lucide-react";
import type { ApiError } from "@/shared/api/errors";
import { Button } from "@/shared/ui/button";

export function LoadError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const notFound = error.status === 404;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      {notFound && <Camera aria-hidden className="size-10 text-muted-foreground" />}
      <h1 className="text-xl font-semibold">{notFound ? "Không tìm thấy mã này" : "Không tải được menu"}</h1>
      {notFound && <p className="font-medium">Quét lại mã QR trên bàn</p>}
      <p className="text-muted-foreground">
        {notFound
          ? "Nếu vẫn không được, mã có thể bị in sai. Bạn báo người bán giúp nhé."
          : error.isNetwork
            ? "Mạng đang chập chờn. Kiểm tra kết nối rồi thử lại."
            : error.message}
      </p>
      {!notFound && (
        <Button size="lg" className="min-h-11" onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </main>
  );
}
