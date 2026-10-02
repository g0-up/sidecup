import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import { errorMessage, isApiError } from "@/shared/api/errors";

// applyServerErrors đưa lỗi 422 (theo tên field JSON) vào đúng ô nhập của form.
// `rename` đổi tên field API sang tên field form khi hai bên khác nhau (vd. commission_rate → commission_percent).
// Lỗi không gắn được vào ô nào thì hiện toast để không bị nuốt mất.
export function applyServerErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  known: readonly Path<T>[],
  rename: Record<string, Path<T>> = {},
) {
  if (isApiError(err) && err.status === 422) {
    const leftovers: string[] = [];
    let mapped = 0;
    for (const [apiField, message] of Object.entries(err.fields)) {
      const name = rename[apiField] ?? (apiField as Path<T>);
      if (known.includes(name)) {
        setError(name, { type: "server", message });
        mapped++;
      } else {
        leftovers.push(message);
      }
    }
    if (mapped > 0 && leftovers.length === 0) return;
    toast.error(leftovers.length > 0 ? leftovers.join(". ") : err.message);
    return;
  }
  toast.error(errorMessage(err));
}
