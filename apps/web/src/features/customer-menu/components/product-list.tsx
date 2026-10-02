import { formatVND } from "@/shared/lib/money";
import { cn } from "@/shared/lib/utils";
import type { MenuProduct } from "../api";

interface Props {
  products: MenuProduct[];
  onPick: (p: MenuProduct) => void;
}

export function ProductList({ products, onPick }: Props) {
  if (products.length === 0) {
    return <p className="px-4 py-8 text-center text-muted-foreground">Menu đang được cập nhật</p>;
  }
  return (
    <ul className="divide-y" aria-label="Menu">
      {products.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            disabled={!p.available}
            onClick={() => onPick(p)}
            className={cn(
              "flex w-full items-center gap-3 px-4 py-3 text-left active:bg-accent",
              !p.available && "opacity-50",
            )}
          >
            {p.image_url ? (
              <img
                src={p.image_url}
                alt=""
                loading="lazy"
                decoding="async"
                width={56}
                height={56}
                className="size-14 shrink-0 rounded-md bg-muted object-cover"
              />
            ) : (
              <span aria-hidden className="size-14 shrink-0 rounded-md bg-secondary" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="text-sm text-muted-foreground">
                {p.available ? formatVND(p.price) : "Hết món"}
              </span>
            </span>
            {p.available && (
              <span className="rounded-full bg-primary px-3 py-1 text-sm font-medium text-primary-foreground">Thêm</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
