import { describe, expect, it } from "vitest";
import type { MenuProduct } from "./api";
import { cartCount, cartReducer, cartTotal, refreshPrices, unavailableIds, type CartLine } from "./cart";

const tea: CartLine = { productId: "tea", name: "Trà đá", unitPrice: 15000, qty: 1, sweet: "medium", ice: "normal" };
const water: CartLine = { productId: "water", name: "Nước suối", unitPrice: 10000, qty: 2, sweet: null, ice: null };

const product = (id: string, available = true, price = 15000): MenuProduct => ({
  id,
  name: id,
  price,
  image_url: null,
  has_sweet: true,
  has_ice: true,
  available,
});

describe("cartReducer", () => {
  it("gộp dòng cùng món và tuỳ chọn, tách dòng khác tuỳ chọn", () => {
    let s = cartReducer([], { type: "add", line: tea });
    s = cartReducer(s, { type: "add", line: { ...tea, qty: 2 } });
    s = cartReducer(s, { type: "add", line: { ...tea, sweet: "less" } });
    s = cartReducer(s, { type: "add", line: water });
    expect(s).toHaveLength(3);
    expect(s[0].qty).toBe(3);
    expect(s[1].sweet).toBe("less");
    expect(cartCount(s)).toBe(6);
    expect(cartTotal(s)).toBe(3 * 15000 + 15000 + 2 * 10000);
  });

  it("giới hạn 1..20 ly mỗi dòng kể cả khi gộp", () => {
    let s = cartReducer([], { type: "add", line: { ...tea, qty: 15 } });
    s = cartReducer(s, { type: "add", line: { ...tea, qty: 10 } });
    expect(s[0].qty).toBe(20);
    s = cartReducer(s, { type: "setQty", index: 0, qty: 0 });
    expect(s[0].qty).toBe(1);
    s = cartReducer(s, { type: "setQty", index: 0, qty: 99 });
    expect(s[0].qty).toBe(20);
  });

  it("xoá dòng, xoá theo món, xoá hết", () => {
    let s = cartReducer([tea, water], { type: "remove", index: 0 });
    expect(s).toEqual([water]);
    s = cartReducer([tea, { ...tea, sweet: "less" }, water], { type: "removeProducts", productIds: ["tea"] });
    expect(s).toEqual([water]);
    expect(cartReducer(s, { type: "clear" })).toEqual([]);
  });
});

describe("unavailableIds", () => {
  it("đánh dấu món hết hoặc biến khỏi menu", () => {
    expect(unavailableIds([tea, water], [product("tea", false), product("water")])).toEqual(["tea"]);
    expect(unavailableIds([tea, water], [product("tea")])).toEqual(["water"]);
    expect(unavailableIds([tea, { ...tea, ice: "none" }], [product("tea", false)])).toEqual(["tea"]);
    expect(unavailableIds([tea], [product("tea")])).toEqual([]);
  });
});

describe("refreshPrices", () => {
  it("cập nhật giá theo menu mới và giữ nguyên tham chiếu khi không đổi", () => {
    const s = [tea];
    expect(refreshPrices(s, [product("tea", true, 15000)].map((p) => ({ ...p, name: "Trà đá" })))).toBe(s);
    expect(refreshPrices(s, [{ ...product("tea", true, 18000), name: "Trà đá" }])[0].unitPrice).toBe(18000);
  });
});
