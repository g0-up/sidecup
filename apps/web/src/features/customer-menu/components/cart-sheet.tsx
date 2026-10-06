import { Trash2 } from "lucide-react";
import { useState } from "react";
import { formatVND } from "@/shared/lib/money";
import { isVNMobile } from "@/shared/lib/phone";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { Textarea } from "@/shared/ui/textarea";
import { cartTotal, optionsLabel, type CartAction, type CartState } from "../cart";
import type { SubmitState } from "../submit";
import { QtyStepper } from "./qty-stepper";

export const NOTE_MAX = 200;
export const ADDRESS_MAX = 200;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cart: CartState;
  dispatch: (a: CartAction) => void;
  unavailable: string[];
  orderingMessage: string | null;
  note: string;
  onNote: (v: string) => void;
  address: string;
  onAddress: (v: string) => void;
  phone: string;
  onPhone: (v: string) => void;
  submit: SubmitState;
  onSubmit: () => void;
}

export function CartSheet(p: Props) {
  const total = cartTotal(p.cart);
  // Bỏ trống là hợp lệ; đã nhập thì phải đúng số di động.
  const phoneValid = p.phone.trim() === "" || isVNMobile(p.phone);
  // Báo lỗi khi rời ô hoặc khi đã gõ đủ 10 ký tự, không báo giữa lúc đang gõ dở.
  const [phoneBlurred, setPhoneBlurred] = useState(false);
  const phoneTouched = phoneBlurred || p.phone.trim().length >= 10;
  const serverFields = p.submit.status === "error" ? p.submit.fields : {};
  const blockedReason =
    p.cart.length === 0
      ? "Giỏ đang trống"
      : p.unavailable.length > 0
        ? "Bỏ món đã hết khỏi giỏ để đặt"
        : p.orderingMessage
          ? p.orderingMessage
          : !phoneValid
            ? "Sửa số điện thoại hoặc bỏ trống để đặt"
            : null;
  const submitting = p.submit.status === "submitting";

  return (
    <BottomSheet
      open={p.open}
      onOpenChange={p.onOpenChange}
      title="Giỏ của bạn"
      description="Kiểm tra món rồi bấm Đặt nước"
    >
      <form
        className="space-y-4 px-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!blockedReason && !submitting) p.onSubmit();
        }}
      >
        <ul className="divide-y rounded-lg border">
          {p.cart.map((l, i) => {
            const out = p.unavailable.includes(l.productId);
            return (
              <li key={`${l.productId}-${l.sweet}-${l.ice}`} className={cn("space-y-2 p-3", out && "bg-destructive/5")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {l.name}
                      {out && <span className="ml-2 text-sm font-semibold text-destructive">Hết món</span>}
                    </p>
                    {optionsLabel(l.sweet, l.ice) && (
                      <p className="text-sm text-muted-foreground">{optionsLabel(l.sweet, l.ice)}</p>
                    )}
                  </div>
                  <span className="tabular-nums">{formatVND(l.unitPrice * l.qty)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <QtyStepper
                    value={l.qty}
                    onChange={(qty) => p.dispatch({ type: "setQty", index: i, qty })}
                    label={`Số ly ${l.name}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="min-h-11 min-w-11"
                    onClick={() => p.dispatch({ type: "remove", index: i })}
                  >
                    <Trash2 /> Bỏ
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="space-y-1.5">
          <Label htmlFor="note">Ghi chú</Label>
          <Textarea
            id="note"
            value={p.note}
            maxLength={NOTE_MAX}
            rows={2}
            placeholder="Ví dụ: để riêng đá"
            onChange={(e) => p.onNote(e.target.value)}
          />
          <p className="text-right text-xs text-muted-foreground">
            {p.note.length}/{NOTE_MAX}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="recipient-address">Địa chỉ người nhận</Label>
          <Textarea
            id="recipient-address"
            value={p.address}
            maxLength={ADDRESS_MAX}
            rows={2}
            autoComplete="street-address"
            placeholder="Ví dụ: Phòng 302, toà B"
            onChange={(e) => p.onAddress(e.target.value)}
          />
          <p className="text-right text-xs text-muted-foreground">
            {p.address.length}/{ADDRESS_MAX}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Số điện thoại (không bắt buộc)</Label>
          <Input
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            placeholder="09xx xxx xxx"
            value={p.phone}
            className="h-11"
            aria-invalid={(phoneTouched && !phoneValid) || !!serverFields.phone}
            aria-describedby="phone-help"
            onChange={(e) => p.onPhone(e.target.value)}
            onBlur={() => setPhoneBlurred(true)}
          />
          <p id="phone-help" className="text-xs text-muted-foreground">
            Nhận tin Zalo khi nước sắp tới. Bỏ trống nếu không cần.
          </p>
          {((phoneTouched && !phoneValid) || serverFields.phone) && (
            <p className="text-sm text-destructive">
              {serverFields.phone ?? "Số điện thoại gồm 10 chữ số, bắt đầu bằng 0"}
            </p>
          )}
        </div>
        <div className="sticky bottom-0 flex flex-col gap-2 bg-background pt-2">
          {p.submit.status === "error" && (
            <p role="alert" className="text-sm text-destructive">
              {p.submit.message}
            </p>
          )}
          <div className="flex items-center justify-between text-base font-semibold">
            <span>Tổng</span>
            <span className="tabular-nums">{formatVND(total)}</span>
          </div>
          <Button type="submit" variant="cta" className="w-full" disabled={!!blockedReason || submitting}>
            {submitting ? "Đang gửi…" : "Đặt nước"}
          </Button>
          {blockedReason && p.cart.length > 0 && (
            <p className="text-center text-sm text-muted-foreground">{blockedReason}</p>
          )}
        </div>
      </form>
    </BottomSheet>
  );
}
