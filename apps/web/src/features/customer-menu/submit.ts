import { uuid } from "@/shared/lib/uuid";

// Idempotency key gắn với một ý định đặt đơn: sinh và lưu sessionStorage TRƯỚC khi gọi API,
// chỉ xoá khi nhận 2xx. Reload hoặc bấm lại giữa chừng dùng lại key cũ → server trả đơn cũ, không tạo trùng.

const keyName = (token: string) => `sc_idem_${token}`;

export function ensureIdempotencyKey(token: string, storage: Storage = sessionStorage): string {
  try {
    const existing = storage.getItem(keyName(token));
    if (existing) return existing;
    const k = uuid();
    storage.setItem(keyName(token), k);
    return k;
  } catch {
    // sessionStorage bị chặn: vẫn chống bấm đúp trong cùng trang nhờ state submitting.
    return memoryKeys.get(token) ?? memoryKeys.set(token, uuid()).get(token)!;
  }
}

export function clearIdempotencyKey(token: string, storage: Storage = sessionStorage) {
  memoryKeys.delete(token);
  try {
    storage.removeItem(keyName(token));
  } catch {
    /* bỏ qua */
  }
}

const memoryKeys = new Map<string, string>();

export type SubmitState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string; fields: Record<string, string> };

export type SubmitAction =
  | { type: "start" }
  | { type: "fail"; message: string; fields?: Record<string, string> }
  | { type: "reset" };

export function submitReducer(state: SubmitState, action: SubmitAction): SubmitState {
  switch (action.type) {
    case "start":
      return state.status === "submitting" ? state : { status: "submitting" };
    case "fail":
      return { status: "error", message: action.message, fields: action.fields ?? {} };
    case "reset":
      return { status: "idle" };
  }
}
