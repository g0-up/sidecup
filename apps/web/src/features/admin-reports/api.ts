import { query, request } from "@/shared/api/http";
import type { ReportParams } from "./period";

export interface CommissionLine {
  partner_id: string;
  partner_name: string;
  commission_rate: number;
  payout_period: "week" | "month";
  from: string;
  to: string;
  paid_count: number;
  revenue: number;
  failed_count: number;
  commission: number;
  adjustments_total: number;
  adjustments_count: number;
  net: number;
}

export interface CommissionTotal {
  paid_count: number;
  revenue: number;
  failed_count: number;
  commission: number;
  adjustments_total: number;
  net: number;
}

export interface CommissionReport {
  rows: CommissionLine[];
  total: CommissionTotal;
}

export interface FunnelLine {
  partner_id: string;
  partner_name: string;
  day: string;
  views: number;
  orders: number;
  paid: number;
}

export interface FunnelReport {
  from: string;
  to: string;
  rows: FunnelLine[];
}

export interface Adjustment {
  id: string;
  partner_id: string;
  partner_name: string;
  order_id: string | null;
  order_code: string | null;
  amount: number;
  reason: string;
  created_by: string;
  created_at: string;
}

export interface AdjustmentInput {
  partner_id: string;
  amount: number;
  reason: string;
  order_code?: string;
}

export const reportsKey = ["seller", "reports"] as const;
export const commissionKey = (p: ReportParams) => [...reportsKey, "commission", p] as const;
export const funnelKey = (p: ReportParams) => [...reportsKey, "funnel", p] as const;
export const adjustmentsKey = (p: ReportParams) => [...reportsKey, "adjustments", p] as const;

export function getCommission(p: ReportParams, signal?: AbortSignal) {
  return request<CommissionReport>(`/api/seller/reports/commission${query(p)}`, { signal });
}

// Bản tóm tắt text do server soạn (không có SĐT khách); client không ghép thêm dữ liệu đơn.
export function exportCommission(p: ReportParams) {
  return request<string>(`/api/seller/reports/commission/export${query(p)}`, { headers: { Accept: "text/plain, application/json" } });
}

export function getFunnel(p: ReportParams, signal?: AbortSignal) {
  return request<FunnelReport>(`/api/seller/reports/funnel${query(p)}`, { signal });
}

export async function listAdjustments(p: ReportParams, signal?: AbortSignal) {
  return (await request<{ adjustments: Adjustment[] }>(`/api/seller/adjustments${query(p)}`, { signal })).adjustments;
}

export function createAdjustment(body: AdjustmentInput) {
  return request<Adjustment>("/api/seller/adjustments", { method: "POST", body });
}
