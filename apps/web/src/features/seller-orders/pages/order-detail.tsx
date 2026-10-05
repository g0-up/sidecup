import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useDocumentHead } from "@/shared/hooks/use-document-head";
import { useSellerBoard } from "../board-context";
import { OrderCard } from "../components/order-card";

// Trang chi tiết mở từ link trong tin Zalo; dùng chung thẻ và bộ nút với bảng đơn.
export function Component() {
  const { id = "" } = useParams();
  const { state, refreshOrder, dispatch } = useSellerBoard();
  const order = state.orders[id];
  const [missing, setMissing] = useState(false);
  const heading = order ? `Đơn #${order.code}` : missing ? "Không tìm thấy đơn" : "Đang tải đơn…";
  useDocumentHead({ title: `${heading} — Gọi nước` });

  useEffect(() => {
    let alive = true;
    void refreshOrder(id).then((o) => {
      if (alive && !o) setMissing(true);
    });
    dispatch({ type: "seen", ids: [id] });
    return () => {
      alive = false;
    };
  }, [id, refreshOrder, dispatch]);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-4">
      <Link to="/seller" className="-ml-2 inline-flex min-h-11 items-center px-2 text-sm text-primary">
        ← Bảng đơn
      </Link>
      <h1 className={order ? "sr-only" : "text-muted-foreground"}>{heading}</h1>
      {order && (
        <OrderCard order={order} clock={state.clock} linkToDetail={false} />
      )}
    </div>
  );
}
