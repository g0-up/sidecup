import { request } from "@/shared/api/http";

export interface Me {
  authenticated: boolean;
  expires_at: string;
}

export function login(password: string) {
  return request<Me>("/api/seller/login", { method: "POST", body: { password } });
}

export function logout() {
  return request<void>("/api/seller/logout", { method: "POST" });
}

export function getMe() {
  return request<Me>("/api/seller/me");
}
