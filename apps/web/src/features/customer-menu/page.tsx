import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { isApiError } from "@/shared/api/errors";
import { useDocumentHead } from "@/shared/hooks/use-document-head";
import { useLocalStorage } from "@/shared/hooks/use-local-storage";
import { normalizePhone } from "@/shared/lib/phone";
import { createOrder, type MenuProduct } from "./api";
import { cartCount, cartTotal, refreshPrices, unavailableIds } from "./cart";
import { CartBar } from "./components/cart-bar";
import { CartSheet } from "./components/cart-sheet";
import { CustomerFooter } from "@/shared/layout/customer-footer";
import { LoadError } from "./components/load-error";
import { MenuHeader } from "./components/menu-header";
import { MyOrders } from "./components/my-orders";
import { OrderingBanner } from "./components/ordering-banner";
import { orderingMessage } from "./ordering-message";
import { ProductList } from "./components/product-list";
import { ProductSheet } from "./components/product-sheet";
import { useCart } from "./hooks/use-cart";
import { useMenu, type MenuState } from "./hooks/use-menu";
import { clearIdempotencyKey, ensureIdempotencyKey, submitReducer } from "./submit";

const ANNOUNCE_MS = 3000;

function headTitle(state: MenuState): string {
  if (state.status === "loading") return "Đang mở menu…";
  if (state.status === "error") return state.error.status === 404 ? "Không tìm thấy mã" : "Không tải được menu";
  return `${state.menu.table_label} · ${state.menu.partner.name} — Gọi nước`;
}

export function Component() {
  const { token = "" } = useParams();
  return <MenuPage key={token} token={token} />;
}

function MenuPage({ token }: { token: string }) {
  const navigate = useNavigate();
  const { state, reload } = useMenu(token);
  const [cart, dispatch] = useCart(token);
  const [picking, setPicking] = useState<MenuProduct | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [note, setNote] = useState("");
  const [address, setAddress] = useState("");
  const [savedPhone, savePhone] = useLocalStorage("sc_phone");
  const [phone, setPhone] = useState(savedPhone);
  const [submit, dispatchSubmit] = useReducer(submitReducer, { status: "idle" });
  const inflight = useRef(false);
  // Lời báo "Đã thêm…" cho trình đọc màn hình; kèm tổng số ly nên lần thêm nào chữ cũng đổi và được đọc lại,
  // kể cả thêm đúng món cũ trong 3 giây. Xoá sau 3 giây để vùng status không giữ chữ cũ.
  const [announcement, setAnnouncement] = useState("");
  useDocumentHead({ title: headTitle(state), noindex: true });

  useEffect(() => {
    if (!announcement) return;
    const t = setTimeout(() => setAnnouncement(""), ANNOUNCE_MS);
    return () => clearTimeout(t);
  }, [announcement]);

  const menu = state.status === "ready" ? state.menu : null;
  const products = useMemo(() => menu?.products ?? [], [menu]);
  const unavailable = useMemo(() => (menu ? unavailableIds(cart, products) : []), [menu, cart, products]);

  useEffect(() => {
    if (!menu) return;
    const next = refreshPrices(cart, products);
    if (next !== cart) dispatch({ type: "replace", state: next });
  }, [menu, products, cart, dispatch]);

  if (state.status === "loading") return <MenuSkeleton />;
  if (state.status === "error") return <LoadError error={state.error} onRetry={() => void reload()} />;
  const m = state.menu;
  const blocked = orderingMessage(m.ordering);

  async function placeOrder() {
    if (inflight.current) return;
    inflight.current = true;
    dispatchSubmit({ type: "start" });
    const key = ensureIdempotencyKey(token);
    try {
      const res = await createOrder(
        token,
        {
          items: cart.map((l) => ({
            product_id: l.productId,
            qty: l.qty,
            ...(l.sweet ? { sweet: l.sweet } : {}),
            ...(l.ice ? { ice: l.ice } : {}),
          })),
          note: note.trim() || undefined,
          recipient_address: address.trim() || undefined,
          // SĐT không bắt buộc: bỏ trống thì không gửi field, khách không nhận tin Zalo.
          ...(normalizePhone(phone) ? { phone: normalizePhone(phone) } : {}),
        },
        key,
      );
      clearIdempotencyKey(token);
      savePhone(normalizePhone(phone));
      dispatch({ type: "clear" });
      dispatchSubmit({ type: "reset" });
      navigate(`/o/${res.data.id}`);
    } catch (e) {
      if (!isApiError(e)) {
        dispatchSubmit({ type: "fail", message: "Có lỗi xảy ra, vui lòng thử lại" });
      } else if (e.code === "QR_REVOKED") {
        navigate("/revoked", { replace: true });
      } else if (e.code === "PRODUCT_UNAVAILABLE" || e.code === "PAUSED" || e.code === "OUTSIDE_HOURS" || e.code === "PARTNER_INACTIVE") {
        // Giữ giỏ, tải lại menu để đánh dấu món hết / hiện lý do khoá.
        void reload();
        dispatchSubmit({ type: "fail", message: e.message });
      } else if (e.code === "IDEMPOTENCY_MISMATCH") {
        clearIdempotencyKey(token);
        dispatchSubmit({ type: "fail", message: e.message });
      } else if (e.isNetwork) {
        // Giữ nguyên key: bấm lại không tạo đơn trùng.
        dispatchSubmit({ type: "fail", message: "Mất kết nối. Bấm Đặt nước lần nữa, đơn sẽ không bị trùng." });
      } else {
        dispatchSubmit({ type: "fail", message: e.message, fields: e.fields });
      }
    } finally {
      inflight.current = false;
    }
  }

  const count = cartCount(cart);
  return (
    <div className="mx-auto min-h-dvh max-w-md pb-24">
      <MenuHeader menu={m} />
      <OrderingBanner ordering={m.ordering} />
      <MyOrders orders={m.my_orders} />
      <ProductList products={m.products} onPick={setPicking} />
      <CustomerFooter />
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <CartBar count={count} total={cartTotal(cart)} onOpen={() => setCartOpen(true)} />
      <ProductSheet
        product={picking}
        onClose={() => setPicking(null)}
        onAdd={(line) => {
          dispatch({ type: "add", line });
          setPicking(null);
          setAnnouncement(`Đã thêm ${line.qty > 1 ? `${line.qty} ly ` : ""}${line.name} vào giỏ, giỏ có ${count + line.qty} ly`);
        }}
      />
      <CartSheet
        open={cartOpen && cart.length > 0}
        onOpenChange={setCartOpen}
        cart={cart}
        dispatch={dispatch}
        unavailable={unavailable}
        orderingMessage={blocked}
        note={note}
        onNote={setNote}
        address={address}
        onAddress={setAddress}
        phone={phone}
        onPhone={(v) => {
          setPhone(v);
          if (submit.status === "error") dispatchSubmit({ type: "reset" });
        }}
        submit={submit}
        onSubmit={() => void placeOrder()}
      />
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="mx-auto max-w-md animate-pulse space-y-3 px-4 pt-6" aria-busy="true" aria-label="Đang tải menu">
      <div className="h-4 w-32 rounded bg-muted" />
      <div className="h-7 w-24 rounded bg-muted" />
      <div className="h-4 w-56 rounded bg-muted" />
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="h-16 rounded-lg bg-muted" />
      ))}
    </div>
  );
}
