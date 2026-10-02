import { SELLER_NAME } from "@/shared/lib/seller";

// Dòng thương hiệu chữ ở đầu trang khách: tên người bán màu navy, chấm gradient, kèm nơi đang ngồi nếu có.
export function CustomerBrand({ place }: { place?: string }) {
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm">
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-(image:--gradient-accent)" />
      <span className="shrink-0 font-semibold text-primary">{SELLER_NAME}</span>
      {place && <span className="truncate text-muted-foreground">· {place}</span>}
    </p>
  );
}
