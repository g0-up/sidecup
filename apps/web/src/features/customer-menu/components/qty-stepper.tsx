import { Minus, Plus } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { MAX_QTY } from "../cart";

interface Props {
  value: number;
  onChange: (qty: number) => void;
  label: string;
}

export function QtyStepper({ value, onChange, label }: Props) {
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        aria-label="Bớt một ly"
        disabled={value <= 1}
        onClick={() => onChange(value - 1)}
      >
        <Minus />
      </Button>
      <span className="w-8 text-center tabular-nums" aria-live="polite">
        {value}
      </span>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-11"
        aria-label="Thêm một ly"
        disabled={value >= MAX_QTY}
        onClick={() => onChange(value + 1)}
      >
        <Plus />
      </Button>
    </div>
  );
}
