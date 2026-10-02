import { Check } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { OrderStatus } from "@/shared/lib/order-status";

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: "sent", label: "Đã gửi" },
  { key: "accepted", label: "Quán nhận" },
  { key: "delivering", label: "Mang ra" },
  { key: "paid", label: "Đã nhận nước" },
];

export function StatusSteps({ status }: { status: OrderStatus }) {
  const current = STEPS.findIndex((s) => s.key === status);
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label="Tiến độ đơn">
      {STEPS.map((s, i) => {
        const done = i < current || status === "paid";
        const active = i === current && status !== "paid";
        return (
          <li key={s.key} className="flex flex-col items-center gap-1.5 text-center" aria-current={active ? "step" : undefined}>
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold",
                done && "border-success bg-success text-white",
                active && "motion-safe:animate-pulse border-primary text-primary",
                !done && !active && "border-muted text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" /> : i + 1}
            </span>
            <span className={cn("text-xs", active ? "font-semibold" : "text-muted-foreground")}>{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
