import { cardFooter } from "./card-text";

// Ảnh PNG cùng bố cục với thẻ HTML, khổ A6 ở ~10 px/mm để in rõ.
const W = 1050;
const H = 1480;
const PAD = 70;
// Kích thước QR trên ảnh; QRCodeCanvas nguồn render đúng cỡ này để không phải co giãn lẻ.
export const QR_PNG_SIZE = 860;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Vẽ từ QRCodeCanvas (không qua SVG → Image) vì Safari hay làm bẩn canvas khi vẽ SVG data URI.
export function drawCardPng(qr: HTMLCanvasElement, partnerName: string, tableLabel: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Trình duyệt không hỗ trợ vẽ ảnh"));

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000000";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  ctx.font = `bold 64px ${FONT}`;
  let y = PAD;
  for (const line of wrap(ctx, partnerName, W - PAD * 2).slice(0, 2)) {
    ctx.fillText(line, W / 2, y);
    y += 78;
  }

  const qrSize = QR_PNG_SIZE;
  const qrTop = Math.max(y + 30, 250);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, (W - qrSize) / 2, qrTop, qrSize, qrSize);

  ctx.font = `bold 96px ${FONT}`;
  ctx.fillText(tableLabel, W / 2, qrTop + qrSize + 30);

  ctx.font = `34px ${FONT}`;
  const footer = wrap(ctx, cardFooter(), W - PAD * 2);
  let fy = H - PAD - footer.length * 44;
  for (const line of footer) {
    ctx.fillText(line, W / 2, fy);
    fy += 44;
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không tạo được ảnh"))), "image/png"),
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Safari cần URL còn sống một lúc sau click mới tải xong.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
