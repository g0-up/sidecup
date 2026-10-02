import { Download } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/button";
import { downloadBlob, drawCardPng, QR_PNG_SIZE } from "../card-image";
import { slugify } from "../card-text";

interface Props {
  partnerName: string;
  tableLabel: string;
  url: string;
}

// Canvas QR ẩn chỉ để lấy điểm ảnh khi tải PNG; phần hiển thị dùng SVG trong QrPrintCard.
export function QrDownloadButton({ partnerName, tableLabel, url }: Props) {
  const qrRef = useRef<HTMLCanvasElement>(null);
  const [busy, setBusy] = useState(false);

  async function onDownload() {
    if (!qrRef.current) return;
    setBusy(true);
    try {
      const blob = await drawCardPng(qrRef.current, partnerName, tableLabel);
      downloadBlob(blob, `qr-${slugify(partnerName) || "quan"}-${slugify(tableLabel) || "ban"}.png`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không tạo được ảnh");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <QRCodeCanvas ref={qrRef} value={url} level="M" size={QR_PNG_SIZE} marginSize={2} className="hidden" aria-hidden />
      <Button type="button" variant="outline" onClick={() => void onDownload()} disabled={busy}>
        <Download /> {busy ? "Đang tạo ảnh…" : "Tải ảnh"}
      </Button>
    </>
  );
}
