import { useMutation } from "@tanstack/react-query";
import { ImageIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { errorMessage, isApiError } from "@/shared/api/errors";
import { Button } from "@/shared/ui/button";
import { uploadProductImage } from "../api";
import { shrinkImage } from "../image-shrink";

interface Props {
  // id của input file, để nhãn của FormField mở được hộp chọn ảnh.
  id: string;
  value: string;
  error?: string;
  onChange: (url: string) => void;
  // null: xoá lỗi cũ khi bắt đầu chọn ảnh khác.
  onError: (message: string | null) => void;
  onBusyChange: (busy: boolean) => void;
}

function uploadError(err: unknown): string {
  if (isApiError(err)) {
    if (err.fields.file) return err.fields.file;
    // nginx chặn body quá lớn trước khi tới API nên không có envelope JSON.
    if (err.status === 413) return "Ảnh tối đa 5 MB";
    return err.message;
  }
  return err instanceof Error ? err.message : errorMessage(err);
}

// ProductImageField: chọn ảnh từ máy (điện thoại mở luôn camera hoặc thư viện), thu nhỏ rồi tải lên kho ảnh;
// form chỉ giữ URL trả về.
export function ProductImageField({ id, value, error, onChange, onError, onBusyChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useMutation({
    mutationFn: async (file: File) => uploadProductImage(await shrinkImage(file)),
    onSuccess: (url) => onChange(url),
    onError: (err) => onError(uploadError(err)),
  });
  const busy = upload.isPending;

  useEffect(() => {
    onBusyChange(busy);
  }, [busy, onBusyChange]);

  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className="flex items-center gap-3">
      <div className="grid size-24 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
        {value ? (
          <img src={value} alt="Ảnh món hiện tại" className="size-full object-cover" />
        ) : (
          <ImageIcon className="size-8 text-muted-foreground" aria-hidden />
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={busy}
          aria-label={busy ? undefined : value ? "Đổi ảnh món" : "Chọn ảnh món"}
          aria-describedby={errorId}
          aria-invalid={!!error}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Đang tải ảnh…" : value ? "Đổi ảnh" : "Chọn ảnh"}
        </Button>
        {value && !busy && (
          <Button
            type="button"
            variant="ghost"
            className="h-11 text-destructive"
            aria-label="Xoá ảnh món"
            onClick={() => {
              onError(null);
              onChange("");
            }}
          >
            Xoá ảnh
          </Button>
        )}
      </div>
      <span role="status" className="sr-only">
        {busy ? "Đang tải ảnh lên" : ""}
      </span>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*"
        hidden
        // Nhãn của ô vẫn mở được hộp chọn ảnh; khoá lại để không có hai lần tải chạy song song.
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Xoá giá trị để chọn lại đúng file đó (sau khi lỗi) vẫn kích hoạt onChange.
          e.target.value = "";
          if (!file) return;
          onError(null);
          upload.mutate(file);
        }}
      />
    </div>
  );
}
