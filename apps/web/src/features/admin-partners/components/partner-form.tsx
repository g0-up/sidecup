import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FormField } from "@/features/admin-products/form-field";
import { applyServerErrors } from "@/features/admin-products/server-errors";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { Switch } from "@/shared/ui/switch";
import { createPartner, partnerKey, partnersKey, updatePartner, type Partner, type PartnerInput } from "../api";
import { DEFAULT_WINDOW, validateOpenHours } from "../open-hours";
import { HiddenProductsPicker } from "./hidden-products-picker";
import { OpenHoursEditor } from "./open-hours-editor";

const schema = z.object({
  name: z.string().trim().min(1, "Nhập tên quán").max(100, "Tên quán tối đa 100 ký tự"),
  // Nhập theo %, gửi lên dạng tỷ lệ 0..1 tối đa 4 chữ số thập phân ⇒ % tối đa 2 chữ số thập phân.
  commission_percent: z
    .number({ error: "Nhập tỷ lệ hoa hồng bằng số" })
    .min(0, "Tỷ lệ hoa hồng từ 0 tới 100%")
    .max(100, "Tỷ lệ hoa hồng từ 0 tới 100%")
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "Tối đa 2 chữ số thập phân, ví dụ 12,5"),
  payout_period: z.enum(["week", "month"], { error: "Chọn kỳ trả hoa hồng" }),
  active: z.boolean(),
  open_hours: z.array(z.object({ days: z.array(z.number()), from: z.string(), to: z.string() })).superRefine((hours, ctx) => {
    for (const issue of validateOpenHours(hours)) {
      ctx.addIssue({ code: "custom", path: issue.row === null ? [] : [issue.row], message: issue.message });
    }
  }),
  hidden_product_ids: z.array(z.string()),
});

type FormValues = z.infer<typeof schema>;
const FIELDS = ["name", "commission_percent", "payout_period", "active", "open_hours", "hidden_product_ids"] as const;

// Lỗi của open_hours có thể là lỗi chung ({message}) hoặc mảng lỗi theo khung ([i].message).
function openHoursErrors(e: unknown): { rows: (string | undefined)[]; form?: string } {
  if (!e || typeof e !== "object") return { rows: [] };
  const rows = Array.isArray(e) ? Array.from(e, (x: { message?: string } | undefined) => x?.message) : [];
  const own = e as { message?: string; root?: { message?: string } };
  return { rows, form: own.message ?? own.root?.message };
}

function toPartnerInput(v: FormValues): PartnerInput {
  return {
    name: v.name,
    commission_rate: Math.round(v.commission_percent * 100) / 10000,
    payout_period: v.payout_period,
    active: v.active,
    open_hours: v.open_hours.map((w) => ({ days: [...w.days].sort((a, b) => a - b), from: w.from, to: w.to })),
    hidden_product_ids: v.hidden_product_ids,
  };
}

interface Props {
  // null: đóng; "new": tạo quán; Partner: sửa quán đó.
  target: Partner | "new" | null;
  onClose: () => void;
  onSaved?: (partner: Partner, created: boolean) => void;
}

export function PartnerFormDialog({ target, onClose, onSaved }: Props) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        {target !== null && (
          <PartnerForm
            key={target === "new" ? "new" : target.id}
            partner={target === "new" ? null : target}
            onDone={(saved) => {
              onClose();
              onSaved?.(saved, target === "new");
            }}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function PartnerForm({
  partner,
  onDone,
  onCancel,
}: {
  partner: Partner | null;
  onDone: (saved: Partner) => void;
  onCancel: () => void;
}) {
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
      name: partner?.name ?? "",
      commission_percent: partner ? Math.round(partner.commission_rate * 10000) / 100 : 10,
      payout_period: partner?.payout_period ?? "week",
      active: partner?.active ?? true,
      open_hours: partner?.open_hours ?? [{ ...DEFAULT_WINDOW, days: [...DEFAULT_WINDOW.days] }],
      hidden_product_ids: partner?.hidden_product_ids ?? [],
    },
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => (partner ? updatePartner(partner.id, toPartnerInput(v)) : createPartner(toPartnerInput(v))),
    onSuccess: (saved) => {
      qc.setQueryData(partnerKey(saved.id), saved);
      void qc.invalidateQueries({ queryKey: partnersKey, exact: true });
      toast.success(partner ? "Đã lưu quán" : "Đã thêm quán");
      onDone(saved);
    },
    onError: (err) => applyServerErrors(err, setError, FIELDS, { commission_rate: "commission_percent" }),
  });

  const oh = openHoursErrors(errors.open_hours);

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
      <DialogHeader>
        <DialogTitle>{partner ? "Sửa quán" : "Thêm quán"}</DialogTitle>
        <DialogDescription>Hoa hồng tính trên đơn đã thu tiền; kỳ trả tuần tính từ Thứ Hai tới Chủ Nhật.</DialogDescription>
      </DialogHeader>

      <FormField id="partner-name" label="Tên quán" error={errors.name?.message}>
        <Input id="partner-name" autoComplete="off" aria-invalid={!!errors.name} {...register("name")} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField id="partner-commission" label="Hoa hồng (%)" error={errors.commission_percent?.message}>
          <Input
            id="partner-commission"
            type="number"
            inputMode="decimal"
            min={0}
            max={100}
            step={0.01}
            aria-invalid={!!errors.commission_percent}
            {...register("commission_percent", { valueAsNumber: true })}
          />
        </FormField>
        <Controller
          control={control}
          name="payout_period"
          render={({ field }) => (
            <FormField id="partner-period" label="Kỳ trả" error={errors.payout_period?.message}>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="partner-period" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Theo tuần</SelectItem>
                  <SelectItem value="month">Theo tháng</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
          )}
        />
      </div>
      <Controller
        control={control}
        name="active"
        render={({ field }) => (
          <div className="flex items-center gap-2">
            <Switch id="partner-active" checked={field.value} onCheckedChange={field.onChange} />
            <Label htmlFor="partner-active">Đang hợp tác (tắt để ngừng nhận đơn ở mọi bàn của quán)</Label>
          </div>
        )}
      />
      <Controller
        control={control}
        name="open_hours"
        render={({ field }) => (
          <OpenHoursEditor value={field.value} onChange={field.onChange} rowErrors={oh.rows} error={oh.form} />
        )}
      />
      <Controller
        control={control}
        name="hidden_product_ids"
        render={({ field }) => (
          <HiddenProductsPicker value={field.value} onChange={field.onChange} error={errors.hidden_product_ids?.message} />
        )}
      />

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Huỷ
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? "Đang lưu…" : "Lưu"}
        </Button>
      </DialogFooter>
    </form>
  );
}
