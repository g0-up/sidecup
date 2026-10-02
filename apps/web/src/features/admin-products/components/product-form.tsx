import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { createProduct, productsKey, updateProduct, type Product, type ProductInput } from "../api";
import { FormField } from "../form-field";
import { applyServerErrors } from "../server-errors";

const schema = z.object({
  name: z.string().trim().min(1, "Nhập tên món").max(100, "Tên món tối đa 100 ký tự"),
  price: z
    .number({ error: "Nhập giá bằng số" })
    .int("Giá là số nguyên (đồng)")
    .min(0, "Giá không được âm")
    .max(10_000_000, "Giá tối đa 10.000.000đ"),
  image_url: z
    .string()
    .trim()
    .max(500, "Đường dẫn ảnh tối đa 500 ký tự")
    .refine((v) => v === "" || /^https:\/\/\S+$/i.test(v), "Đường dẫn ảnh phải bắt đầu bằng https://"),
  has_sweet: z.boolean(),
  has_ice: z.boolean(),
  sort: z
    .number({ error: "Nhập thứ tự bằng số" })
    .int("Thứ tự là số nguyên")
    .min(-10000, "Thứ tự từ -10000 tới 10000")
    .max(10000, "Thứ tự từ -10000 tới 10000"),
});

type FormValues = z.infer<typeof schema>;
const FIELDS = ["name", "price", "image_url", "has_sweet", "has_ice", "sort"] as const;

interface Props {
  // null: đóng; "new": tạo món; Product: sửa món đó.
  target: Product | "new" | null;
  nextSort: number;
  onClose: () => void;
}

export function ProductFormDialog({ target, nextSort, onClose }: Props) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        {target !== null && (
          <ProductForm
            key={target === "new" ? "new" : target.id}
            product={target === "new" ? null : target}
            nextSort={nextSort}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProductForm({ product, nextSort, onDone }: { product: Product | null; nextSort: number; onDone: () => void }) {
  const qc = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      name: product?.name ?? "",
      price: product?.price ?? 0,
      image_url: product?.image_url ?? "",
      has_sweet: product?.has_sweet ?? true,
      has_ice: product?.has_ice ?? true,
      sort: product?.sort ?? nextSort,
    },
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => {
      const body: ProductInput = { ...v, image_url: v.image_url === "" ? null : v.image_url };
      return product ? updateProduct(product.id, body) : createProduct(body);
    },
    onSuccess: (saved) => {
      qc.setQueryData<Product[]>(productsKey, (list) => {
        if (!list) return list;
        const rest = list.filter((p) => p.id !== saved.id);
        return [...rest, saved].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "vi"));
      });
      void qc.invalidateQueries({ queryKey: productsKey });
      toast.success(product ? "Đã lưu món" : "Đã thêm món");
      onDone();
    },
    onError: (err) => applyServerErrors(err, setError, FIELDS),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{product ? "Sửa món" : "Thêm món"}</DialogTitle>
        <DialogDescription>Giá tính bằng đồng; món mới mặc định đang bán.</DialogDescription>
      </DialogHeader>

      <FormField id="product-name" label="Tên món" error={errors.name?.message}>
        <Input id="product-name" autoComplete="off" aria-invalid={!!errors.name} {...register("name")} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="product-price" label="Giá (đồng)" error={errors.price?.message}>
          <Input
            id="product-price"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            aria-invalid={!!errors.price}
            {...register("price", { valueAsNumber: true })}
          />
        </FormField>
        <FormField id="product-sort" label="Thứ tự" error={errors.sort?.message} hint="Số nhỏ hiện trước">
          <Input
            id="product-sort"
            type="number"
            inputMode="numeric"
            aria-invalid={!!errors.sort}
            {...register("sort", { valueAsNumber: true })}
          />
        </FormField>
      </div>
      <FormField id="product-image" label="Ảnh (đường dẫn, không bắt buộc)" error={errors.image_url?.message}>
        <Input
          id="product-image"
          type="url"
          inputMode="url"
          placeholder="https://…"
          aria-invalid={!!errors.image_url}
          {...register("image_url")}
        />
      </FormField>
      <div className="flex flex-wrap gap-6">
        <Controller
          control={control}
          name="has_sweet"
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox id="product-sweet" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
              <Label htmlFor="product-sweet">Cho chọn độ ngọt</Label>
            </div>
          )}
        />
        <Controller
          control={control}
          name="has_ice"
          render={({ field }) => (
            <div className="flex items-center gap-2">
              <Checkbox id="product-ice" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} />
              <Label htmlFor="product-ice">Cho chọn đá</Label>
            </div>
          )}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Huỷ
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Đang lưu…" : "Lưu"}
        </Button>
      </DialogFooter>
    </form>
  );
}
