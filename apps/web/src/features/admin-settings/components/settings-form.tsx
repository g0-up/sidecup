import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { FormField } from "@/features/admin-products/form-field";
import { applyServerErrors } from "@/features/admin-products/server-errors";
import { settingsKey, updateSettings, type Settings } from "@/shared/api/settings";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { BankPicker } from "./bank-picker";

const schema = z
  .object({
    eta_minutes: z
      .number({ error: "Nhập số phút" })
      .int("Số phút là số nguyên")
      .min(1, "Thời gian giao từ 1 tới 60 phút")
      .max(60, "Thời gian giao từ 1 tới 60 phút"),
    bank_bin: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{6}$/.test(v), "Mã BIN ngân hàng gồm đúng 6 chữ số"),
    bank_account: z
      .string()
      .transform((v) => v.replace(/\s+/g, ""))
      .refine((v) => v === "" || /^\d{6,19}$/.test(v), "Số tài khoản gồm 6 tới 19 chữ số"),
    bank_account_name: z.string().trim().max(100, "Tên chủ tài khoản tối đa 100 ký tự"),
  })
  .superRefine((v, ctx) => {
    // Mã VietQR cần đủ ngân hàng + số tài khoản; để trống cả hai là tắt chuyển khoản.
    if (v.bank_account !== "" && v.bank_bin === "") {
      ctx.addIssue({ code: "custom", path: ["bank_bin"], message: "Chọn ngân hàng cho số tài khoản này" });
    }
    if (v.bank_bin !== "" && v.bank_account === "") {
      ctx.addIssue({ code: "custom", path: ["bank_account"], message: "Nhập số tài khoản" });
    }
  });

type FormValues = z.output<typeof schema>;
const FIELDS = ["eta_minutes", "bank_bin", "bank_account", "bank_account_name"] as const;

// Form không gửi accepting_orders: công tắc nhận đơn lưu riêng ngay khi bấm (API cập nhật từng phần).
export function SettingsForm({ settings }: { settings: Settings }) {
  const qc = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      eta_minutes: settings.eta_minutes,
      bank_bin: settings.bank_bin,
      bank_account: settings.bank_account,
      bank_account_name: settings.bank_account_name,
    },
  });

  const save = useMutation({
    mutationFn: (v: FormValues) => updateSettings(v),
    onSuccess: (data) => {
      qc.setQueryData(settingsKey, data);
      reset({
        eta_minutes: data.eta_minutes,
        bank_bin: data.bank_bin,
        bank_account: data.bank_account,
        bank_account_name: data.bank_account_name,
      });
      toast.success("Đã lưu cài đặt");
    },
    onError: (err) => applyServerErrors(err, setError, FIELDS),
  });

  return (
    <form onSubmit={handleSubmit((v) => save.mutate(v))} noValidate className="space-y-4">
      <FormField
        id="settings-eta"
        label="Thời gian giao dự kiến (phút)"
        error={errors.eta_minutes?.message}
        hint="Khách thấy “khoảng N phút” sau khi đặt."
      >
        <Input
          id="settings-eta"
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          className="w-32"
          aria-invalid={!!errors.eta_minutes}
          {...register("eta_minutes", { valueAsNumber: true })}
        />
      </FormField>

      <Controller
        control={control}
        name="bank_bin"
        render={({ field }) => (
          <FormField id="settings-bank" label="Ngân hàng nhận chuyển khoản" error={errors.bank_bin?.message}>
            <BankPicker id="settings-bank" value={field.value} onChange={field.onChange} onBlur={field.onBlur} invalid={!!errors.bank_bin} />
          </FormField>
        )}
      />
      <FormField id="settings-account" label="Số tài khoản" error={errors.bank_account?.message}>
        <Input
          id="settings-account"
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={!!errors.bank_account}
          {...register("bank_account")}
        />
      </FormField>
      <FormField
        id="settings-account-name"
        label="Tên chủ tài khoản"
        error={errors.bank_account_name?.message}
        hint="Viết như trên app ngân hàng, ví dụ NGUYEN VAN A."
      >
        <Input
          id="settings-account-name"
          autoComplete="off"
          aria-invalid={!!errors.bank_account_name}
          {...register("bank_account_name")}
        />
      </FormField>

      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending || !isDirty}>
          {save.isPending ? "Đang lưu…" : "Lưu cài đặt"}
        </Button>
        {isDirty && (
          <Button type="button" variant="outline" onClick={() => reset()}>
            Huỷ thay đổi
          </Button>
        )}
      </div>
    </form>
  );
}
