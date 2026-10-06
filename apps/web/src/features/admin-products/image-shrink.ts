// Thu nhỏ ảnh chụp điện thoại (thường 4000 px, vài MB) trước khi tải lên: menu chỉ cần ảnh nhỏ.
export const SHRINK_DECODE_ERROR = "Không đọc được ảnh này, chọn ảnh JPG hoặc PNG";

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// shrinkImage giữ cạnh dài ≤ maxEdge (không phóng to) và mã hoá lại WebP; trình duyệt không mã hoá
// được WebP (Safari trả PNG) thì dùng JPEG.
export async function shrinkImage(file: File, maxEdge = 1200): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // Trình duyệt cũ (iOS 15, Chrome < 112) không nhận "from-image" và ném lỗi: thử lại không kèm tuỳ chọn.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => createImageBitmap(file));
  } catch {
    throw new Error(SHRINK_DECODE_ERROR);
  }
  const canvas = document.createElement("canvas");
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error(SHRINK_DECODE_ERROR);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const webp = await toBlob(canvas, "image/webp", 0.82);
    if (webp?.type === "image/webp") return webp;
    const jpeg = await toBlob(canvas, "image/jpeg", 0.85);
    if (!jpeg) throw new Error(SHRINK_DECODE_ERROR);
    return jpeg;
  } finally {
    bitmap.close();
    // Safari giới hạn tổng bộ nhớ canvas; trả lại ngay thay vì chờ GC.
    canvas.width = 0;
    canvas.height = 0;
  }
}
