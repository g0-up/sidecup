import { Copy, FileDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { downloadBlob } from "@/features/admin-partners/card-image";
import { slugify } from "@/features/admin-partners/card-text";
import { errorMessage } from "@/shared/api/errors";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Textarea } from "@/shared/ui/textarea";
import { exportCommission, type CommissionLine } from "../api";
import { commissionParams, type ReportFilter } from "../period";

interface Props {
  filter: ReportFilter;
  rows: CommissionLine[];
}

// Bản tóm tắt do server soạn cho từng quán; "tất cả quán" thì nối bản của từng quán đang có trong bảng.
async function fetchSummary(filter: ReportFilter, rows: CommissionLine[]): Promise<string> {
  const params = commissionParams(filter);
  if (filter.partnerId) return exportCommission(params);
  const parts = await Promise.all(rows.map((r) => exportCommission({ ...params, partner_id: r.partner_id })));
  return parts.map((p) => p.trim()).join("\n\n");
}

export function ExportActions({ filter, rows }: Props) {
  const [busy, setBusy] = useState<"copy" | "download" | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const disabled = rows.length === 0 || busy !== null;

  async function onCopy() {
    setBusy("copy");
    try {
      const text = await fetchSummary(filter, rows);
      try {
        await navigator.clipboard.writeText(text);
        toast.success("Đã sao chép bản tóm tắt, dán vào Zalo để gửi quán");
      } catch {
        // Trình duyệt chặn clipboard (http, Safari mất cử chỉ người dùng sau khi chờ mạng): cho chép tay.
        setManual(text);
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function onDownload() {
    const row = rows[0];
    if (!filter.partnerId || !row) return;
    setBusy("download");
    try {
      const text = await exportCommission(commissionParams(filter));
      const name = slugify(row.partner_name) || "quan";
      downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), `hoa-hong-${name}-${row.from}-${row.to}.txt`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => void onCopy()} disabled={disabled}>
        <Copy /> {busy === "copy" ? "Đang lấy…" : "Sao chép bản tóm tắt"}
      </Button>
      {filter.partnerId && (
        <Button variant="outline" onClick={() => void onDownload()} disabled={disabled}>
          <FileDown /> {busy === "download" ? "Đang tải…" : "Tải .txt"}
        </Button>
      )}
      <Dialog open={manual !== null} onOpenChange={(open) => !open && setManual(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bản tóm tắt</DialogTitle>
            <DialogDescription>Không sao chép tự động được. Chạm giữ để chọn tất cả rồi sao chép.</DialogDescription>
          </DialogHeader>
          <Textarea readOnly value={manual ?? ""} rows={12} onFocus={(e) => e.currentTarget.select()} aria-label="Bản tóm tắt" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
