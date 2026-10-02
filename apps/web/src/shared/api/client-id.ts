import { isUuid, uuid } from "@/shared/lib/uuid";

const KEY = "sc_client_id";
const ONE_YEAR = 60 * 60 * 24 * 365;

let cached: string | null = null;

// Danh tính thiết bị (không phải PII): localStorage, fallback cookie khi webview/private mode chặn storage.
// Nếu cả hai đều hỏng, id chỉ sống trong phiên trang; đặt đơn vẫn chạy, chỉ mất "nhớ đơn".
export function getClientId(): string {
  if (cached) return cached;
  cached = readStorage() ?? readCookie() ?? uuid();
  writeStorage(cached);
  writeCookie(cached);
  return cached;
}

export function resetClientIdForTest() {
  cached = null;
}

function readStorage(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    return isUuid(v) ? v : null;
  } catch {
    return null;
  }
}

function writeStorage(v: string) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* storage bị chặn: dựa vào cookie */
  }
}

function readCookie(): string | null {
  try {
    const m = document.cookie.match(/(?:^|;\s*)sc_client_id=([^;]+)/);
    return m && isUuid(m[1]) ? m[1] : null;
  } catch {
    return null;
  }
}

function writeCookie(v: string) {
  try {
    document.cookie = `${KEY}=${v}; Max-Age=${ONE_YEAR}; Path=/; SameSite=Lax`;
  } catch {
    /* cookie bị chặn */
  }
}
