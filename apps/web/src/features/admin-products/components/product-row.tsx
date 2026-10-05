import { Pencil } from "lucide-react";
import { formatVND } from "@/shared/lib/money";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Switch } from "@/shared/ui/switch";
import { TableCell, TableRow } from "@/shared/ui/table";
import type { Product } from "../api";

interface Props {
  product: Product;
  onToggle: (available: boolean) => void;
  onEdit: () => void;
}

export function ProductRow({ product, onToggle, onEdit }: Props) {
  const options = [product.has_sweet && "ngọt", product.has_ice && "đá"].filter(Boolean).join(", ");
  // Dưới sm: tên + giá bên trái, công tắc (cả nhãn là vùng chạm) + "Sửa" bên phải, tuỳ chọn và thứ tự mờ bên dưới.
  return (
    <TableRow className={cn("max-sm:grid-cols-[minmax(0,1fr)_auto]", !product.available && "text-muted-foreground")}>
      <TableCell className="w-12 tabular-nums max-sm:col-start-2 max-sm:row-start-3 max-sm:w-auto max-sm:text-right max-sm:text-xs max-sm:text-muted-foreground">
        <span className="sm:hidden">Thứ tự </span>
        {product.sort}
      </TableCell>
      <TableCell className="font-medium max-sm:col-start-1 max-sm:row-start-1">{product.name}</TableCell>
      <TableCell className="tabular-nums max-sm:col-start-1 max-sm:row-start-2">{formatVND(product.price)}</TableCell>
      <TableCell className="max-sm:col-start-1 max-sm:row-start-3 max-sm:text-xs max-sm:text-muted-foreground">
        {options ? `Chọn ${options}` : "—"}
      </TableCell>
      <TableCell className="max-sm:col-start-2 max-sm:row-start-1">
        <label className="flex cursor-pointer items-center gap-2 max-sm:justify-end">
          <Switch
            size="lg"
            checked={product.available}
            onCheckedChange={onToggle}
            aria-label={`${product.name}: ${product.available ? "đang bán" : "hết món"}`}
          />
          <span className="text-xs">{product.available ? "Đang bán" : "Hết món"}</span>
        </label>
      </TableCell>
      <TableCell className="text-right max-sm:col-start-2 max-sm:row-start-2">
        <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Sửa ${product.name}`}>
          <Pencil /> Sửa
        </Button>
      </TableCell>
    </TableRow>
  );
}
