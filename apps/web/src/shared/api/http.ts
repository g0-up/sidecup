import { getClientId } from "./client-id";
import { ApiError, networkError, type ErrorEnvelope } from "./errors";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

// Màn người bán đăng ký handler để cookie hết hạn giữa chừng thì quay về trang đăng nhập.
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  onUnauthorized = fn;
}

async function send(path: string, opts: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json", "X-Client-Id": getClientId(), ...opts.headers };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  try {
    return await fetch(path, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "same-origin",
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw networkError();
  }
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as ErrorEnvelope;
    if (body?.error?.code) {
      return new ApiError(res.status, body.error.code, body.error.message, body.error.details ?? {});
    }
  } catch {
    /* body không phải JSON (proxy lỗi, 502) */
  }
  return new ApiError(res.status, `HTTP_${res.status}`, "Máy chủ đang bận, vui lòng thử lại");
}

export interface ApiResponse<T> {
  status: number;
  data: T;
}

// requestWithStatus dùng khi caller cần phân biệt 200 và 201 (đặt đơn idempotent).
export async function requestWithStatus<T>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
  const res = await send(path, opts);
  if (!res.ok) {
    const err = await toError(res);
    if (err.status === 401 && path.startsWith("/api/seller") && !path.endsWith("/login")) onUnauthorized?.();
    throw err;
  }
  if (res.status === 204) return { status: res.status, data: undefined as T };
  const ct = res.headers.get("Content-Type") ?? "";
  const data = ct.includes("application/json") ? ((await res.json()) as T) : ((await res.text()) as T);
  return { status: res.status, data };
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return (await requestWithStatus<T>(path, opts)).data;
}

export function query(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}
