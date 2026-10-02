import { XIcon } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
// Esc, bấm nền và nút Đóng chạy hiệu ứng trượt xuống (tối đa CLOSE_FALLBACK_MS) rồi mới báo onOpenChange(false);
// parent tự đặt open=false (vd. sau khi thêm món) thì đóng ngay.
export function BottomSheet({ open, onOpenChange, ...rest }: Props) {
  if (!open) return null;
  return <SheetDialog onOpenChange={onOpenChange} {...rest} />;
}

// Dự phòng khi không có transitionend (trình duyệt cũ, jsdom): dài hơn --duration-base một chút.
const CLOSE_FALLBACK_MS = 300;

function prefersReducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function SheetDialog({ onOpenChange, title, description, children, className }: Omit<Props, "open">) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const [closing, setClosing] = useState(false);
  // Parent thường truyền arrow mới mỗi lần render; giữ trong ref để render lại giữa lúc đóng không đặt lại hẹn giờ.
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  const requestClose = () => {
    if (prefersReducedMotion()) onOpenChange(false);
    else setClosing(true);
  };

  useEffect(() => {
    const d = ref.current;
    if (!closing || !d) return;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onOpenChangeRef.current(false);
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === d && e.propertyName === "transform") finish();
    };
    const timer = window.setTimeout(finish, CLOSE_FALLBACK_MS);
    d.addEventListener("transitionend", onEnd);
    return () => {
      done = true;
      window.clearTimeout(timer);
      d.removeEventListener("transitionend", onEnd);
    };
  }, [closing]);

  // close() do chính sheet gọi (lúc gỡ, hay StrictMode ở dev gỡ rồi gắn lại) phát sự kiện close về sau;
  // cờ này để onClose bỏ qua nó và chỉ báo parent khi trình duyệt tự đóng.
  const selfClosed = useRef(false);

  // Đóng dialog trước khi React gỡ nó khỏi DOM để trình duyệt trả focus về nút đã mở sheet.
  useLayoutEffect(() => {
    const d = ref.current;
    return () => {
      if (!d?.open) return;
      selfClosed.current = true;
      d.close();
    };
  }, []);

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
      data-closing={closing || undefined}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose();
      }}
      // Trình duyệt có thể đóng thẳng mà bỏ qua preventDefault ở cancel (Chrome: Esc lặp lại không có thao tác người dùng).
      // Khi đó vẫn báo parent để sheet không kẹt ở trạng thái mở mà không thấy.
      onClose={() => {
        if (selfClosed.current) selfClosed.current = false;
        else onOpenChangeRef.current(false);
      }}
      className={cn(
        "sheet fixed inset-x-0 bottom-0 top-auto m-0 mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-md bg-background p-0 text-foreground shadow-float backdrop:bg-primary/70",
        "pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      {/* Đang trượt xuống thì nội dung là inert: cú chạm hay Enter lúc này không thêm món hay đặt đơn lần nữa. */}
      <div className="flex flex-col gap-4 pb-4" inert={closing}>
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
            onClick={requestClose}
            className="-mr-2 -mt-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          >
            <XIcon className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
