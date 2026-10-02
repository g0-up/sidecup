import type { ReactNode } from "react";
import { Label } from "@/shared/ui/label";

interface Props {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}

// Khối nhãn + ô nhập + lỗi dùng chung cho các form quản trị.
export function FormField({ id, label, error, hint, children }: Props) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
