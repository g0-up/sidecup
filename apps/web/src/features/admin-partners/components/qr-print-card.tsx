import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/shared/lib/utils";
import { cardFooter } from "../card-text";

interface Props {
  partnerName: string;
  tableLabel: string;
  url: string;
  className?: string;
}

// Thẻ đặt trên bàn: tỷ lệ A6 (105 × 148 mm). SVG để nét khi in; level M chịu được thẻ hơi bẩn/nhăn.
export function QrPrintCard({ partnerName, tableLabel, url, className }: Props) {
  return (
    <article
      aria-label={`Thẻ QR ${partnerName} ${tableLabel}`}
      className={cn(
        "qr-card flex aspect-[105/148] w-full max-w-[320px] flex-col items-center justify-between rounded-lg border bg-white p-[6%] text-center text-black",
        className,
      )}
    >
      <h2 className="qr-card-partner text-lg leading-tight font-bold break-words">{partnerName}</h2>
      <QRCodeSVG value={url} level="M" size={512} marginSize={2} title={url} className="h-auto w-[86%]" />
      <p className="qr-card-table text-2xl font-bold">{tableLabel}</p>
      <p className="qr-card-footer text-[11px] leading-snug">{cardFooter()}</p>
    </article>
  );
}
