import { describe, expect, it } from "vitest";
import type { SellerOrder } from "@/shared/api/orders";
import { serverClock } from "@/shared/lib/time";
import { actionsFor, boardReducer, closedSince, initialBoard, isLate, openColumns, startOfDayVN, type BoardState } from "./store";

function order(id: string, status: SellerOrder["status"], updated = "2026-10-01T05:00:00Z", extra: Partial<SellerOrder> = {}): SellerOrder {
  return {
    id,
    code: id.toUpperCase(),
    status,
    items: [],
    note: null,
    total: 45000,
    partner_name: "Quán test",
    table_label: "Bàn 1",
    cancel_reason: null,
    payment_method: null,
    created_at: "2026-10-01T05:00:00Z",
    accepted_at: null,
    delivering_at: null,
    paid_at: null,
    closed_at: null,
    updated_at: updated,
    partner_id: "p",
    qr_token: "T",
    menu_path: "/t/T",
    customer_phone: "0901234567",
    commission_rate: null,
    commission_amount: null,
    ...extra,
  };
}

const msg = (type: string, data: SellerOrder) => ({ type, data, server_time: "2026-10-01T05:00:05Z" });

function load(orders: SellerOrder[]): BoardState {
  return boardReducer(initialBoard, { type: "loaded", orders, serverTime: "2026-10-01T05:00:00Z", initial: true });
}

describe("boardReducer", () => {
  it("lần tải đầu không kêu chuông", () => {
    const s = load([order("a", "sent"), order("b", "accepted")]);
    expect(s.unseen).toEqual([]);
    expect(s.loaded).toBe(true);
    expect(s.lastServerTime).toBe("2026-10-01T05:00:00Z");
  });

  it("order.created thêm đơn mới và đánh dấu chưa xem", () => {
    const s = boardReducer(load([]), { type: "message", msg: msg("order.created", order("a", "sent")) });
    expect(Object.keys(s.orders)).toEqual(["a"]);
    expect(s.unseen).toEqual(["a"]);
  });

  it("order.updated upsert theo id và bỏ khỏi danh sách chưa xem khi rời `sent`", () => {
    let s = boardReducer(load([]), { type: "message", msg: msg("order.created", order("a", "sent")) });
    s = boardReducer(s, { type: "message", msg: msg("order.updated", order("a", "accepted", "2026-10-01T05:01:00Z")) });
    expect(s.orders.a.status).toBe("accepted");
    expect(s.unseen).toEqual([]);
  });

  it("bỏ qua bản cũ tới muộn", () => {
    let s = load([order("a", "accepted", "2026-10-01T05:01:00Z")]);
    s = boardReducer(s, { type: "message", msg: msg("order.updated", order("a", "sent", "2026-10-01T05:00:00Z")) });
    expect(s.orders.a.status).toBe("accepted");
  });

  it("resync sau reconnect không kêu chuông trùng cho đơn đã biết, nhưng kêu cho đơn mới thật", () => {
    let s = boardReducer(load([]), { type: "message", msg: msg("order.created", order("a", "sent")) });
    s = boardReducer(s, { type: "seen", ids: ["a"] });
    s = boardReducer(s, {
      type: "loaded",
      orders: [order("a", "sent"), order("b", "sent")],
      serverTime: "2026-10-01T05:02:00Z",
      initial: false,
    });
    expect(s.unseen).toEqual(["b"]);
    expect(s.lastServerTime).toBe("2026-10-01T05:02:00Z");
  });

  it("đã xem tất cả", () => {
    let s = boardReducer(load([]), { type: "message", msg: msg("order.created", order("a", "sent")) });
    s = boardReducer(s, { type: "message", msg: msg("order.created", order("b", "sent")) });
    expect(boardReducer(s, { type: "seen" }).unseen).toEqual([]);
  });

  it("bỏ qua message không phải đơn", () => {
    const s = load([]);
    expect(boardReducer(s, { type: "message", msg: { type: "settings.updated", data: {}, server_time: "x" } })).toBe(s);
  });
});

describe("selectors", () => {
  it("chia cột theo trạng thái, cũ nhất trước", () => {
    const s = load([
      order("b", "sent", undefined, { created_at: "2026-10-01T05:02:00Z" }),
      order("a", "sent", undefined, { created_at: "2026-10-01T05:01:00Z" }),
      order("c", "delivering"),
      order("d", "paid", undefined, { closed_at: "2026-10-01T05:03:00Z" }),
    ]);
    const cols = openColumns(s);
    expect(cols.sent.map((o) => o.id)).toEqual(["a", "b"]);
    expect(cols.delivering.map((o) => o.id)).toEqual(["c"]);
    expect(cols.accepted).toEqual([]);
    expect(closedSince(s, startOfDayVN(Date.parse("2026-10-01T05:00:00Z"))).map((o) => o.id)).toEqual(["d"]);
  });

  it("đầu ngày theo giờ Việt Nam", () => {
    // 18:30 UTC 30/09 = 01:30 01/10 giờ VN → đầu ngày là 17:00 UTC 30/09.
    expect(new Date(startOfDayVN(Date.parse("2026-09-30T18:30:00Z"))).toISOString()).toBe("2026-09-30T17:00:00.000Z");
  });
});

describe("isLate", () => {
  // Đơn tạo lúc 05:00:00 giờ server; đồng hồ nhận server_time 05:01:00 tại mốc 1000 ms.
  const clock = serverClock("2026-10-01T05:01:00Z", 1000);

  it("đơn Đã gửi trễ từ đúng 60 giây", () => {
    expect(isLate(order("a", "sent"), clock, 999)).toBe(false);
    expect(isLate(order("a", "sent"), clock, 1000)).toBe(true);
  });

  it("chưa có đồng hồ server thì không coi là trễ", () => {
    expect(isLate(order("a", "sent"), null, 1000)).toBe(false);
  });

  it("chỉ đơn chờ nhận mới trễ", () => {
    expect(isLate(order("a", "accepted"), clock, 60_000)).toBe(false);
    expect(isLate(order("a", "delivering"), clock, 60_000)).toBe(false);
  });
});

describe("actionsFor", () => {
  it("map trạng thái → nút đúng P0-6", () => {
    expect(actionsFor("sent").map((a) => a.label)).toEqual(["Nhận đơn", "Từ chối"]);
    expect(actionsFor("accepted").map((a) => a.label)).toEqual(["Mang ra bàn"]);
    expect(actionsFor("delivering").map((a) => a.label)).toEqual(["Thu tiền mặt", "Chuyển khoản", "Không gặp khách"]);
    expect(actionsFor("paid")).toEqual([]);
    expect(actionsFor("sent")[1].confirm).toBeTruthy();
    expect(actionsFor("delivering")[2].confirm).toBeTruthy();
  });
});
