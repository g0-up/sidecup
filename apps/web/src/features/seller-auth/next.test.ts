import { describe, expect, it } from "vitest";
import { loginPath, safeNext } from "./next";

describe("safeNext", () => {
  it("giữ đường dẫn nội bộ của màn người bán", () => {
    expect(safeNext("/seller/orders/abc")).toBe("/seller/orders/abc");
    expect(safeNext(null)).toBe("/seller");
  });

  it("chặn chuyển hướng ra ngoài", () => {
    expect(safeNext("https://evil.example")).toBe("/seller");
    expect(safeNext("//evil.example/seller")).toBe("/seller");
    expect(safeNext("/t/ABC")).toBe("/seller");
    expect(safeNext("/seller/../http://x")).toBe("/seller");
  });

  it("mã hoá đường dẫn hiện tại vào ?next", () => {
    expect(loginPath("/seller/orders/1?x=1")).toBe("/seller/login?next=%2Fseller%2Forders%2F1%3Fx%3D1");
  });
});
