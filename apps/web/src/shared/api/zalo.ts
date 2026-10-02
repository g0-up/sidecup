import { request } from "./http";

// Trạng thái tài khoản Zalo gửi tin cho khách; không bao giờ mang credentials.
export interface ZaloStatus {
  configured: boolean;
  linked: boolean;
  status: "" | "linked" | "expired";
  display_name: string;
  linked_at: string | null;
}

export type ZaloLinkState = "pending" | "qr_ready" | "scanned" | "confirmed" | "linked" | "expired" | "error";

export interface ZaloLink {
  link_id: string;
  state: ZaloLinkState;
  qr_png_base64?: string;
  display_name?: string;
  failure?: string;
}

export const zaloKey = ["seller", "zalo"] as const;
export const zaloLinkKey = (id: string) => ["seller", "zalo", "link", id] as const;

export function getZaloStatus() {
  return request<ZaloStatus>("/api/seller/zalo");
}

export function startZaloLink(consentVersion: string) {
  return request<{ link_id: string }>("/api/seller/zalo/link", {
    method: "POST",
    body: { consent_version: consentVersion },
  });
}

export function getZaloLink(id: string) {
  return request<ZaloLink>(`/api/seller/zalo/link/${encodeURIComponent(id)}`);
}

// Huỷ lần quét đang mở để mã QR còn trên màn hình không liên kết sau lưng người bán; id cũ hay lạ vẫn 204.
export function cancelZaloLink(id: string) {
  return request<void>(`/api/seller/zalo/link/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function unlinkZalo() {
  return request<void>("/api/seller/zalo", { method: "DELETE" });
}
