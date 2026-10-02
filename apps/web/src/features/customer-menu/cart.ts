import type { Ice, MenuProduct, Sweet } from "./api";

export const MAX_QTY = 20;

export interface CartLine {
  productId: string;
  name: string;
  unitPrice: number;
  qty: number;
  sweet: Sweet | null; // null: món không có tuỳ chọn ngọt
  ice: Ice | null;
}

export type CartState = CartLine[];

export type CartAction =
  | { type: "add"; line: CartLine }
  | { type: "setQty"; index: number; qty: number }
  | { type: "remove"; index: number }
  | { type: "removeProducts"; productIds: string[] }
  | { type: "replace"; state: CartState }
  | { type: "clear" };

const sameKey = (a: CartLine, b: CartLine) => a.productId === b.productId && a.sweet === b.sweet && a.ice === b.ice;
const clamp = (n: number) => Math.min(MAX_QTY, Math.max(1, Math.floor(n)));

// Gộp dòng cùng (món, ngọt, đá) giống API; số ly tối đa 20 mỗi dòng sau khi gộp.
export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      const i = state.findIndex((l) => sameKey(l, action.line));
      if (i === -1) return [...state, { ...action.line, qty: clamp(action.line.qty) }];
      return state.map((l, j) => (j === i ? { ...l, qty: clamp(l.qty + action.line.qty) } : l));
    }
    case "setQty":
      return state.map((l, j) => (j === action.index ? { ...l, qty: clamp(action.qty) } : l));
    case "remove":
      return state.filter((_, j) => j !== action.index);
    case "removeProducts":
      return state.filter((l) => !action.productIds.includes(l.productId));
    case "replace":
      return action.state;
    case "clear":
      return [];
  }
}

export function cartTotal(state: CartState): number {
  return state.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);
}

export function cartCount(state: CartState): number {
  return state.reduce((sum, l) => sum + l.qty, 0);
}

// unavailableIds: món trong giỏ đã hết hoặc không còn trên menu (bị ẩn) → khoá nút đặt tới khi bỏ dòng.
export function unavailableIds(state: CartState, products: MenuProduct[]): string[] {
  const avail = new Map(products.map((p) => [p.id, p.available]));
  return [...new Set(state.filter((l) => avail.get(l.productId) !== true).map((l) => l.productId))];
}

// Giá hiển thị theo menu mới nhất; số tiền server trả về sau khi đặt mới là chân lý.
export function refreshPrices(state: CartState, products: MenuProduct[]): CartState {
  const byId = new Map(products.map((p) => [p.id, p]));
  let changed = false;
  const next = state.map((l) => {
    const p = byId.get(l.productId);
    if (p && (p.price !== l.unitPrice || p.name !== l.name)) {
      changed = true;
      return { ...l, unitPrice: p.price, name: p.name };
    }
    return l;
  });
  return changed ? next : state;
}

export const SWEET_LABEL: Record<Sweet, string> = { less: "Ít ngọt", medium: "Vừa", sweet: "Ngọt" };
export const ICE_LABEL: Record<Ice, string> = { none: "Không đá", less: "Ít đá", normal: "Đá bình thường" };

export function optionsLabel(sweet: Sweet | null, ice: Ice | null): string {
  const parts: string[] = [];
  if (sweet) parts.push(sweet === "medium" ? "Ngọt vừa" : SWEET_LABEL[sweet]);
  if (ice) parts.push(ICE_LABEL[ice]);
  return parts.join(" · ");
}
