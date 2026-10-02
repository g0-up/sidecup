import { Check } from "lucide-react";
import { useState } from "react";
import { formatVND } from "@/shared/lib/money";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import type { Ice, MenuProduct, Sweet } from "../api";
import { ICE_LABEL, SWEET_LABEL, type CartLine } from "../cart";
import { QtyStepper } from "./qty-stepper";

interface Props {
  product: MenuProduct | null;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}

export function ProductSheet({ product, onClose, onAdd }: Props) {
  return (
    <BottomSheet
      open={product !== null}
      onOpenChange={(open) => !open && onClose()}
      title={product?.name}
      description={product ? `${formatVND(product.price)} / ly` : undefined}
    >
      {product && <ProductForm key={product.id} product={product} onAdd={onAdd} />}
    </BottomSheet>
  );
}

function ProductForm({ product, onAdd }: { product: MenuProduct; onAdd: (line: CartLine) => void }) {
  const [sweet, setSweet] = useState<Sweet>("medium");
  const [ice, setIce] = useState<Ice>("normal");
  const [qty, setQty] = useState(1);

  return (
    <>
      <div className="space-y-5 px-4">
        {product.has_sweet && (
          <Choice<Sweet> label="Độ ngọt" value={sweet} onChange={setSweet} options={SWEET_LABEL} />
        )}
        {product.has_ice && <Choice<Ice> label="Đá" value={ice} onChange={setIce} options={ICE_LABEL} />}
        <div className="flex items-center justify-between">
          <span className="font-medium">Số ly</span>
          <QtyStepper value={qty} onChange={setQty} label="Số ly" />
        </div>
      </div>
      <div className="px-4">
        <Button
          variant="cta"
          className="w-full"
          onClick={() =>
            onAdd({
              productId: product.id,
              name: product.name,
              unitPrice: product.price,
              qty,
              sweet: product.has_sweet ? sweet : null,
              ice: product.has_ice ? ice : null,
            })
          }
        >
          Thêm vào giỏ · {formatVND(product.price * qty)}
        </Button>
      </div>
    </>
  );
}

function Choice<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: Record<T, string>;
}) {
  return (
    <fieldset>
      <legend className="mb-2 font-medium">{label}</legend>
      {/* Ô rộng theo chữ và giãn cho đầy hàng; hết chỗ thì cả ô xuống hàng, chữ không bao giờ gãy hay bị cắt. */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(options) as T[]).map((k) => {
          const selected = value === k;
          return (
            <button
              key={k}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(k)}
              className={cn(
                "grid h-11 flex-auto place-items-center rounded-lg border px-2 text-sm whitespace-nowrap transition-colors duration-(--duration-fast)",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-background",
              )}
            >
              {/* Lớp ẩn giữ chỗ cho dấu tích và chữ đậm, để chọn ô không làm ô đổi cỡ hay nhảy hàng. */}
              <span aria-hidden className="invisible col-start-1 row-start-1 inline-flex items-center gap-1 font-semibold">
                <Check className="size-4" />
                {options[k]}
              </span>
              <span className={cn("col-start-1 row-start-1 inline-flex items-center gap-1", selected && "font-semibold")}>
                {selected && <Check aria-hidden className="size-4 shrink-0" />}
                {options[k]}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
