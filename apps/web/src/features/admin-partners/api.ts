import { request } from "@/shared/api/http";
import type { OpenWindow } from "./open-hours";

export type PayoutPeriod = "week" | "month";

export interface Partner {
  id: string;
  name: string;
  commission_rate: number; // 0..1, tối đa 4 chữ số thập phân
  payout_period: PayoutPeriod;
  open_hours: OpenWindow[];
  active: boolean;
  hidden_product_ids: string[];
  created_at: string;
  updated_at: string;
}

// Body POST/PUT đúng theo UpsertReq của API (API từ chối field lạ).
export interface PartnerInput {
  name: string;
  commission_rate: number;
  payout_period: PayoutPeriod;
  open_hours: OpenWindow[];
  active: boolean;
  hidden_product_ids: string[];
}

export interface QrCode {
  token: string;
  url: string;
  table_label: string;
  active: boolean;
  created_at: string;
  revoked_at: string | null;
}

export const partnersKey = ["seller", "partners"] as const;
export const partnerKey = (id: string) => ["seller", "partners", id] as const;
export const qrcodesKey = (partnerId: string) => ["seller", "partners", partnerId, "qrcodes"] as const;

const partnerPath = (id: string) => `/api/seller/partners/${encodeURIComponent(id)}`;

export async function listPartners(signal?: AbortSignal) {
  return (await request<{ partners: Partner[] }>("/api/seller/partners", { signal })).partners;
}

export function getPartner(id: string, signal?: AbortSignal) {
  return request<Partner>(partnerPath(id), { signal });
}

export function createPartner(body: PartnerInput) {
  return request<Partner>("/api/seller/partners", { method: "POST", body });
}

export function updatePartner(id: string, body: PartnerInput) {
  return request<Partner>(partnerPath(id), { method: "PUT", body });
}

export async function listQrCodes(partnerId: string, signal?: AbortSignal) {
  return (await request<{ qrcodes: QrCode[] }>(`${partnerPath(partnerId)}/qrcodes`, { signal })).qrcodes;
}

export function createQrCode(partnerId: string, tableLabel: string) {
  return request<QrCode>(`${partnerPath(partnerId)}/qrcodes`, { method: "POST", body: { table_label: tableLabel } });
}

// Thu hồi idempotent: gọi lại vẫn trả 200 với mốc thu hồi đầu tiên.
export function revokeQrCode(token: string) {
  return request<QrCode>(`/api/seller/qrcodes/${encodeURIComponent(token)}/revoke`, { method: "POST" });
}
