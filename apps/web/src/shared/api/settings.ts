import { request } from "./http";

export interface Settings {
  accepting_orders: boolean;
  eta_minutes: number;
  bank_bin: string;
  bank_account: string;
  bank_account_name: string;
  updated_at: string;
}

export type SettingsUpdate = Partial<Omit<Settings, "updated_at">>;

export const settingsKey = ["seller", "settings"] as const;

export function getSettings() {
  return request<Settings>("/api/seller/settings");
}

// Cập nhật từng phần: field vắng mặt giữ nguyên; chuỗi rỗng xoá thông tin ngân hàng.
export function updateSettings(body: SettingsUpdate) {
  return request<Settings>("/api/seller/settings", { method: "PUT", body });
}
