import { useQuery } from "@tanstack/react-query";
import { listProducts, productsKey } from "@/features/admin-products/api";
import { errorMessage } from "@/shared/api/errors";
import { formatVND } from "@/shared/lib/money";
import { Checkbox } from "@/shared/ui/checkbox";
import { Label } from "@/shared/ui/label";
import { FieldError } from "@/features/admin-products/form-field";

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
  error?: string;
}

// Món được đánh dấu sẽ không hiện trên menu của quán này (vd. quán tự bán món tương tự).
export function HiddenProductsPicker({ value, onChange, error }: Props) {
  const { data, isPending, error: loadError } = useQuery({
    queryKey: productsKey,
    queryFn: ({ signal }) => listProducts(signal),
  });
  const hidden = new Set(value);
  const toggle = (id: string, on: boolean) => onChange(on ? [...value, id] : value.filter((v) => v !== id));

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">Món ẩn ở quán này</legend>
      {isPending ? (
        <p className="text-sm text-muted-foreground">Đang tải danh sách món…</p>
      ) : loadError ? (
        <p className="text-sm text-destructive">{errorMessage(loadError)}</p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Chưa có món nào.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {data.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <Checkbox id={`hide-${p.id}`} checked={hidden.has(p.id)} onCheckedChange={(c) => toggle(p.id, c === true)} />
              <Label htmlFor={`hide-${p.id}`} className="font-normal">
                {p.name} <span className="text-muted-foreground">· {formatVND(p.price)}</span>
              </Label>
            </li>
          ))}
        </ul>
      )}
      <FieldError message={error} />
    </fieldset>
  );
}
