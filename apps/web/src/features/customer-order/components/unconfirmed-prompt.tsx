import { Button } from "@/shared/ui/button";

interface Props {
  onWait: () => void;
  onCancel: () => void;
  cancelling: boolean;
}

// Đơn `sent` quá 60 giây: khách chọn chờ thêm hoặc huỷ (P0-7).
export function UnconfirmedPrompt({ onWait, onCancel, cancelling }: Props) {
  return (
    <div role="alert" className="space-y-3 rounded-lg border border-warning bg-warning/15 p-4">
      <div>
        <p className="font-semibold">Quán chưa xác nhận</p>
        <p className="text-sm text-muted-foreground">Người bán có thể đang bận. Bạn muốn chờ thêm hay huỷ đơn?</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" size="lg" onClick={onWait}>
          Chờ thêm
        </Button>
        <Button variant="destructive" size="lg" onClick={onCancel} disabled={cancelling}>
          {cancelling ? "Đang huỷ…" : "Huỷ đơn"}
        </Button>
      </div>
    </div>
  );
}
