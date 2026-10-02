import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FormField } from "@/features/admin-products/form-field";
import { applyServerErrors } from "@/features/admin-products/server-errors";
import { formatVND } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { createAdjustment, reportsKey } from "../api";
import type { PartnerOption } from "./report-filters";

const LIMIT = 100_000_000;

const schema = z.object({
  partner_id: z.string().min(1, "Chọn quán"),
  amount: z
    .number({ error: "Nhập số tiền bằng số" })
    .int("Số tiền là số nguyên (đồng)")
    .refine((v) => v !== 0, "Số tiền phải khác 0")
    .refine((v) => Math.abs(v) <= LIMIT, `Số tiền tối đa ±${formatVND(LIMIT)}`),
  reason: z.string().trim().min(1, "Nhập lý do").max(200, "Lý do tối đa 200 ký tự"),
  order_code: z.string().trim().toUpperCase().max(12, "Mã đơn tối đa 12 ký tự"),
});

type FormValues = z.output<typeof schema>;
const FIELDS = ["partner_id", "amount", "reason", "order_code"] as const;

interface Props {
  partners: PartnerOption[];
  defaultPartnerId: string | null;
}

// Điều chỉnh cộng/trừ vào số phải trả của quán (vd. -20.000đ khi đơn bị trả lại sau khi đã thu tiền).
export function AdjustmentForm({ partners, defaultPartnerId }: Props) {
  const qc = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    getValues,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { partner_id: defaultPartnerId ?? "", amount: Number.NaN, reason: "", order_code: "" },
  });

  const save = useMutation({
    mutationFn: (v: FormValues) =>
      createAdjustment({ partner_id: v.partner_id, amount: v.amount, reason: v.reason, order_code: v.order_code || undefined }),
    onSuccess: (adj) => {
      void qc.invalidateQueries({ queryKey: reportsKey });
      reset({ partner_id: getValues("partner_id"), amount: Number.NaN, reason: "", order_code: "" });
      toast.success(`Đã ghi điều chỉnh ${formatVND(adj.amount)} cho ${adj.partner_name}`);
    },
    onError: (err) => applyServerErrors(err, setError, FIELDS),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="grid gap-3 sm:grid-cols-2">
      <Controller
        control={control}
        name="partner_id"
        render={({ field }) => (
          <FormField id="adj-partner" label="Quán" error={errors.partner_id?.message}>
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="adj-partner" className="w-full" aria-invalid={!!errors.partner_id}>
                <SelectValue placeholder="Chọn quán" />
              </SelectTrigger>
              <SelectContent>
                {partners.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}
      />
      <FormField id="adj-amount" label="Số tiền (đồng, âm để trừ)" error={errors.amount?.message} hint="Ví dụ -20000 để trừ 20.000đ">
        <Input
          id="adj-amount"
          type="number"
          inputMode="numeric"
          step={1000}
          aria-invalid={!!errors.amount}
          {...register("amount", { valueAsNumber: true })}
        />
      </FormField>
      <FormField id="adj-reason" label="Lý do" error={errors.reason?.message}>
        <Input id="adj-reason" autoComplete="off" aria-invalid={!!errors.reason} {...register("reason")} />
      </FormField>
      <FormField id="adj-order" label="Mã đơn (không bắt buộc)" error={errors.order_code?.message}>
        <Input id="adj-order" autoComplete="off" aria-invalid={!!errors.order_code} {...register("order_code")} />
      </FormField>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Đang lưu…" : "Ghi điều chỉnh"}
        </Button>
      </div>
    </form>
  );
}
