import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Printer } from "lucide-react";
import { Link, useParams } from "react-router";
import { errorMessage } from "@/shared/api/errors";
import { Button } from "@/shared/ui/button";
import { getPartner, listQrCodes, partnerKey, qrcodesKey } from "../api";
import { QrPrintCard } from "../components/qr-print-card";
import "@/print.css";

// Khổ giấy A6 chỉ áp dụng khi trang này đang mở; @page trong file CSS chung sẽ dính vào mọi lần in khác.
const PAGE_RULE = "@page { size: A6 portrait; margin: 0; }";

export function Component() {
  const { id = "" } = useParams();
  const partner = useQuery({ queryKey: partnerKey(id), queryFn: ({ signal }) => getPartner(id, signal) });
  const codes = useQuery({ queryKey: qrcodesKey(id), queryFn: ({ signal }) => listQrCodes(id, signal) });
  const active = (codes.data ?? []).filter((q) => q.active);
  const error = partner.error ?? codes.error;

  return (
    <div className="qr-print-root mx-auto max-w-5xl space-y-6 p-4">
      <style>{PAGE_RULE}</style>
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/seller/partners/${encodeURIComponent(id)}`}>
            <ArrowLeft /> Về quán
          </Link>
        </Button>
        <Button onClick={() => window.print()} disabled={active.length === 0}>
          <Printer /> In {active.length} thẻ
        </Button>
      </div>
      <p className="no-print text-sm text-muted-foreground">
        Mỗi thẻ một trang A6. Trong hộp thoại in, chọn khổ A6 (hoặc “Lưu PDF”), tỷ lệ 100%, tắt đầu trang/chân trang.
      </p>

      {partner.isPending || codes.isPending ? (
        <p className="text-muted-foreground">Đang tải…</p>
      ) : error ? (
        <p role="alert" className="text-destructive">
          {errorMessage(error)}
        </p>
      ) : active.length === 0 ? (
        <p className="text-muted-foreground">Quán chưa có bàn nào đang dùng.</p>
      ) : (
        <div className="qr-print-sheet">
          {active.map((q) => (
            <div key={q.token} className="qr-print-page">
              <QrPrintCard partnerName={partner.data?.name ?? ""} tableLabel={q.table_label} url={q.url} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
