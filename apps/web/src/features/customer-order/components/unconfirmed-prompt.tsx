import { useEffect, useRef, useState } from "react";
import { Button } from "@/shared/ui/button";

interface Props {
  onWait: () => void;
  onCancel: () => void;
  cancelling: boolean;
}

// Đơn `sent` quá 60 giây: khách chọn chờ thêm hoặc huỷ. Huỷ cần bấm hai lần để không lỡ tay.
// Ở bước xác nhận, "Không huỷ" nằm đúng chỗ nút "Huỷ đơn" và nhận focus: chạm đúp hay Enter hai lần chỉ quay lại.
export function UnconfirmedPrompt({ onWait, onCancel, cancelling }: Props) {
  const [confirming, setConfirming] = useState(false);
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-warning bg-warning/15 p-4">
      <div>
        <p className="font-semibold">Quán chưa xác nhận</p>
        <p className="text-sm text-muted-foreground">
          {confirming ? "Huỷ đơn này? Bạn chưa phải trả tiền." : "Người bán có thể đang bận. Bạn muốn chờ thêm hay huỷ đơn?"}
        </p>
      </div>
      {confirming ? (
        <div key="confirm" className="grid grid-cols-2 gap-2">
          <Button variant="destructive" size="lg" className="min-h-11" onClick={onCancel} disabled={cancelling}>
            {cancelling ? "Đang huỷ…" : "Xác nhận huỷ"}
          </Button>
          <Button ref={keepRef} variant="outline" size="lg" className="min-h-11" onClick={() => setConfirming(false)} disabled={cancelling}>
            Không huỷ
          </Button>
        </div>
      ) : (
        <div key="ask" className="grid grid-cols-2 gap-2">
          <Button size="lg" className="min-h-11" onClick={onWait}>
            Chờ thêm
          </Button>
          <Button variant="outline" size="lg" className="min-h-11 text-destructive hover:text-destructive" onClick={() => setConfirming(true)}>
            Huỷ đơn
          </Button>
        </div>
      )}
    </div>
  );
}
