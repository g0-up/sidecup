// Nội dung chữ trên thẻ QR dùng chung cho thẻ HTML (xem/in) và ảnh PNG tải về.
export function sellerName(): string {
  return import.meta.env.VITE_SELLER_NAME?.trim() || "người bán";
}

export function cardFooter(): string {
  return `Đồ uống do ${sellerName()} pha — giao tới bàn, thanh toán khi nhận`;
}

// Tên file không dấu, an toàn trên mọi hệ điều hành: "qr-quan-a-ban-5.png".
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
