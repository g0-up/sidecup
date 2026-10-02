export interface ErrorEnvelope {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

// ApiError mang mã lỗi máy đọc từ envelope của API; status 0 nghĩa là lỗi mạng (chưa tới server).
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isNetwork() {
    return this.status === 0;
  }

  // fields: lỗi 422 theo tên field JSON, ví dụ { phone: "...", "items[0].qty": "..." }.
  get fields(): Record<string, string> {
    const f = this.details.fields;
    return f && typeof f === "object" ? (f as Record<string, string>) : {};
  }
}

export function networkError(): ApiError {
  return new ApiError(0, "NETWORK", "Không kết nối được, kiểm tra mạng rồi thử lại");
}

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return "Có lỗi xảy ra, vui lòng thử lại";
}
