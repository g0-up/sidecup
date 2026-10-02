import { Camera } from "lucide-react";
import { useDocumentHead } from "@/shared/hooks/use-document-head";

export function Component() {
  useDocumentHead({ title: "Mã QR không còn dùng", noindex: true });
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
      <Camera aria-hidden className="size-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Mã này không còn dùng</h1>
      <p className="font-medium">Quét mã QR mới trên bàn</p>
      <p className="text-muted-foreground">Không thấy mã mới thì báo người bán giúp nhé.</p>
    </main>
  );
}
