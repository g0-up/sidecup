import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { errorMessage } from "@/shared/api/errors";
import { Button } from "@/shared/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/shared/ui/table";
import { listProducts, productsKey, type Product } from "./api";
import { ProductFormDialog } from "./components/product-form";
import { ProductRow } from "./components/product-row";
import { useToggleAvailability } from "./hooks/use-toggle-availability";

export function Component() {
  const { data, isPending, error, refetch } = useQuery({ queryKey: productsKey, queryFn: ({ signal }) => listProducts(signal) });
  const toggle = useToggleAvailability();
  const [target, setTarget] = useState<Product | "new" | null>(null);

  const products = useMemo(
    () => [...(data ?? [])].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "vi")),
    [data],
  );
  const nextSort = products.length > 0 ? Math.min(10000, products[products.length - 1].sort + 10) : 10;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Món</h1>
          <p className="text-sm text-muted-foreground">Tắt công tắc khi hết món; menu khách cập nhật ngay.</p>
        </div>
        <Button onClick={() => setTarget("new")}>
          <Plus /> Thêm món
        </Button>
      </div>

      {isPending ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : error ? (
        <div role="alert" className="space-y-2">
          <p className="text-destructive">{errorMessage(error)}</p>
          <Button variant="outline" onClick={() => void refetch()}>
            Thử lại
          </Button>
        </div>
      ) : products.length === 0 ? (
        <p className="text-muted-foreground">Chưa có món nào. Bấm “Thêm món” để bắt đầu.</p>
      ) : (
        <div className="rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Thứ tự</TableHead>
                <TableHead>Món</TableHead>
                <TableHead>Giá</TableHead>
                <TableHead>Tuỳ chọn</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  onToggle={(available) => toggle.mutate({ id: p.id, available })}
                  onEdit={() => setTarget(p)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ProductFormDialog target={target} nextSort={nextSort} onClose={() => setTarget(null)} />
    </div>
  );
}
