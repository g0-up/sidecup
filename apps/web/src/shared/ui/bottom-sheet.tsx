import { XIcon } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

// BottomSheet dùng <dialog> gốc của trình duyệt (showModal: focus trap, Esc, backdrop) thay cho Radix Dialog,
// để route khách giữ ngân sách ≤ 120 KB gzip. Chỉ mount khi mở nên không có dialog ẩn trong DOM.
export function BottomSheet({ open, onOpenChange, ...rest }: Props) {
  if (!open) return null;
  return <SheetDialog onOpenChange={onOpenChange} {...rest} />;
}

function SheetDialog({ onOpenChange, title, description, children, className }: Omit<Props, "open">) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onOpenChange(false);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onOpenChange(false);
      }}
      className={cn(
        "fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-md bg-background p-0 text-foreground shadow-float backdrop:bg-primary/70",
        "pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      <div className="flex flex-col gap-4 pb-4">
        <div className="flex items-start justify-between gap-2 px-4 pt-4">
          <div className="space-y-1">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent"
          >
            <XIcon className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
