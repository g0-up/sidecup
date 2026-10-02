import { describe, expect, it } from "vitest";
import { clearIdempotencyKey, ensureIdempotencyKey, submitReducer } from "./submit";

describe("idempotency key", () => {
  it("giữ nguyên key qua nhiều lần bấm và reload cho tới khi đặt thành công", () => {
    const k1 = ensureIdempotencyKey("T1");
    const k2 = ensureIdempotencyKey("T1");
    expect(k1).toBe(k2);
    expect(sessionStorage.getItem("sc_idem_T1")).toBe(k1);
    expect(ensureIdempotencyKey("T2")).not.toBe(k1);

    clearIdempotencyKey("T1");
    expect(sessionStorage.getItem("sc_idem_T1")).toBeNull();
    expect(ensureIdempotencyKey("T1")).not.toBe(k1);
  });

  it("vẫn trả key ổn định khi sessionStorage ném lỗi", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    const k = ensureIdempotencyKey("T3", broken);
    expect(ensureIdempotencyKey("T3", broken)).toBe(k);
    clearIdempotencyKey("T3", broken);
    expect(ensureIdempotencyKey("T3", broken)).not.toBe(k);
  });
});

describe("submitReducer", () => {
  it("bỏ qua lần start thứ hai khi đang gửi (chống bấm đúp)", () => {
    const s1 = submitReducer({ status: "idle" }, { type: "start" });
    expect(submitReducer(s1, { type: "start" })).toBe(s1);
    const s2 = submitReducer(s1, { type: "fail", message: "x", fields: { phone: "sai" } });
    expect(s2).toEqual({ status: "error", message: "x", fields: { phone: "sai" } });
    expect(submitReducer(s2, { type: "reset" })).toEqual({ status: "idle" });
  });
});
