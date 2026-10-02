import { useEffect, useReducer } from "react";
import { cartReducer, type CartState } from "../cart";

// Giỏ sống theo tab và theo bàn (sessionStorage): reload không mất giỏ, đóng tab thì thôi.
export function useCart(token: string) {
  const key = `sc_cart_${token}`;
  const [cart, dispatch] = useReducer(cartReducer, key, load);

  useEffect(() => {
    try {
      if (cart.length === 0) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(cart));
    } catch {
      /* storage bị chặn: giỏ chỉ sống trong bộ nhớ */
    }
  }, [key, cart]);

  return [cart, dispatch] as const;
}

function load(key: string): CartState {
  try {
    const raw = sessionStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as CartState) : [];
  } catch {
    return [];
  }
}
