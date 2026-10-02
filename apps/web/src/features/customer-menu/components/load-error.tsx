import { Button } from "@/shared/ui/button";
import type { ApiError } from "@/shared/api/errors";

export function LoadError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const notFound = error.status === 404;
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">{notFound ? "Không tìm thấy mã này" : "Không tải được menu"}</h1>
      <p className="text-muted-foreground">
        {notFound
          ? "Mã QR có thể bị in sai. Bạn báo người bán giúp nhé."
          : error.isNetwork
            ? "Mạng đang chập chờn. Kiểm tra kết nối rồi thử lại."
            : error.message}
      </p>
      {!notFound && (
        <Button size="lg" onClick={onRetry}>
          Thử lại
        </Button>
      )}
    </main>
  );
}
