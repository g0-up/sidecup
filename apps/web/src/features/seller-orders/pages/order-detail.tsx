import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useSellerBoard } from "../board-context";
import { OrderCard } from "../components/order-card";

// Trang chi tiết mở từ link trong tin Zalo; dùng chung thẻ và bộ nút với bảng đơn.
export function Component() {
  const { id = "" } = useParams();
  const { state, refreshOrder, dispatch } = useSellerBoard();
  const order = state.orders[id];
  const [missing, setMissing] = useState(false);

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
      <Link to="/seller" className="text-sm text-primary">
        ← Bảng đơn
      </Link>
      {order ? (
        <OrderCard order={order} clock={state.clock} linkToDetail={false} />
      ) : (
        <p className="text-muted-foreground">{missing ? "Không tìm thấy đơn" : "Đang tải đơn…"}</p>
      )}
    </div>
  );
}
