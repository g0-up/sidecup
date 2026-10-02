import { Input } from "@/shared/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";
import { BANKS, BANKS_SOURCE, BANKS_UPDATED_AT, findBank } from "../banks";

const OTHER = "other";

interface Props {
  id: string;
  value: string;
  onChange: (bin: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
}

// Chọn ngân hàng từ danh sách hoặc nhập BIN tay (ngân hàng không có trong danh sách / danh sách cũ).
export function BankPicker({ id, value, onChange, onBlur, invalid }: Props) {
  const known = findBank(value);
  return (
    <div className="space-y-2">
      <Select value={known ? known.bin : OTHER} onValueChange={(v) => onChange(v === OTHER ? "" : v)}>
        <SelectTrigger id={id} className="w-full" aria-label="Ngân hàng">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {BANKS.map((b) => (
            <SelectItem key={b.bin} value={b.bin}>
              {b.short} — {b.name}
            </SelectItem>
          ))}
          <SelectItem value={OTHER}>Ngân hàng khác (nhập mã BIN)</SelectItem>
        </SelectContent>
      </Select>
      <Input
        id={`${id}-manual`}
        aria-label="Mã BIN ngân hàng"
        inputMode="numeric"
        maxLength={6}
        placeholder="Mã BIN 6 số, ví dụ 970436"
        value={value}
        aria-invalid={invalid}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        onBlur={onBlur}
      />
      <p className="text-xs text-muted-foreground">
        Danh sách theo {BANKS_SOURCE}, cập nhật {BANKS_UPDATED_AT}. Không thấy ngân hàng của bạn thì nhập mã BIN tay.
      </p>
    </div>
  );
}
