import { Pencil } from "lucide-react";
import { formatVND } from "@/shared/lib/money";
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
  return (
    <TableRow className={product.available ? undefined : "text-muted-foreground"}>
      <TableCell className="w-12 tabular-nums">{product.sort}</TableCell>
      <TableCell className="font-medium">{product.name}</TableCell>
      <TableCell className="tabular-nums">{formatVND(product.price)}</TableCell>
      <TableCell>{options ? `Chọn ${options}` : "—"}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch
            checked={product.available}
            onCheckedChange={onToggle}
            aria-label={`${product.name}: ${product.available ? "đang bán" : "hết món"}`}
          />
          <span className="text-xs">{product.available ? "Đang bán" : "Hết món"}</span>
        </div>
      </TableCell>
      <TableCell className="text-right">
        <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`Sửa ${product.name}`}>
          <Pencil /> Sửa
        </Button>
      </TableCell>
    </TableRow>
  );
}
