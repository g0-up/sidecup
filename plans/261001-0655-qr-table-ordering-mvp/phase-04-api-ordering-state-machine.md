---
title: "Phase 4: API đặt đơn, máy trạng thái, scheduler"
status: todo
priority: P1
effort: 2d
dependencies: [3]
---

# Phase 4: API đặt đơn, máy trạng thái, scheduler

## Context Links

- [architecture.md §4 Máy trạng thái](./architecture.md#4-máy-trạng-thái-đơn), [§5 Hợp đồng API (Khách, Người bán)](./architecture.md#5-hợp-đồng-api), quyết định A5, A6, A10, A11, A12, A13, A14 (mọi ghi vào `orders` qua `orders.Writer` của phase 2)
- PRD: P0-2 (menu, page view), P0-3 (gộp dòng, giới hạn), P0-4 (chống trùng), P0-6 (chuyển trạng thái), P0-7 (huỷ), §Quy tắc nghiệp vụ, §Quy tắc thời gian

## Overview

Lõi nghiệp vụ: trang menu theo token, ghi page view, tạo đơn idempotent với validate đầy đủ, xem/huỷ đơn phía khách, chuyển trạng thái phía người bán với chống ghi đè, ghi `order_events`, scheduler tự huỷ đơn quá 5 phút và xoá SĐT sau 90 ngày. Outbox thông báo được ghi trong cùng transaction qua interface `notifications.Enqueuer`; phần API cho notifier thuộc phase 5.

## Key Insights

- Server là nguồn chân lý của giá và gộp dòng: client gửi `{product_id, qty, sweet, ice}`; server tra `products`, loại món ẩn của quán, kiểm `available`, gộp dòng cùng `(product_id, sweet, ice)`, giới hạn `qty` 1..20 sau gộp, tính `line_total`, `total`.
- `sweet`/`ice` chỉ hợp lệ khi món có `has_sweet`/`has_ice`; mặc định `"medium"` / `"normal"`; giá trị cho phép `sweet ∈ {less, medium, sweet}`, `ice ∈ {none, less, normal}`.
- `ordering.enabled=false` với `reason` ưu tiên: `paused` (settings) > `closed` (không khung nào trong `partner.OpenHours.Contains(now)`, `now` theo `APP_TZ`) > `inactive` (partner `active=false`). Cả GET menu và POST order dùng chung hàm `orderingGate(partner, settings, now)`.
- Realtime (A1): sau khi transaction commit, service gọi `hub.Publish("seller", order.created|order.updated)` và `hub.Publish("order:"+id, order.updated)` với view public. Scheduler huỷ đơn cũng publish. Không publish trong transaction để client không thấy trạng thái chưa commit.
- Idempotency: key là UUID trong header; cùng key → trả đơn cũ **bất kể body** (status 200). Đơn chỉ được trả lại khi `client_id` khớp, nếu không → 409 `IDEMPOTENCY_MISMATCH` (chống đoán key).
- Mã đơn `code`: 6 ký tự bảng chữ của `ids` + retry 3 lần khi trùng unique.
- `my_orders` trong GET menu: đơn của `client_id` trên cùng `qr_token`, `created_at` trong ngày (APP_TZ), mọi trạng thái, giới hạn 5. Đáp ứng P0-7 "quét lại thấy lối vào đơn đang chạy".
- Chuyển trạng thái: `writer.UpdateWhereStatus(id, from, set)` với `set` = `status=$to, <timestamp col>=now(), payment_method=$pm, commission_rate=$rate, commission_amount=ROUND(total*$rate), closed_at=...` (Writer tự thêm `updated_at = now()` và `WHERE id=$id AND status=$from RETURNING *`), trong transaction cùng `order_events` và outbox. `$rate` đọc từ `partners` trong cùng transaction khi `to='paid'`. Đơn `paid` không thể bị sửa qua API vì `paid` không có chuyển đi trong `CanTransition` và Writer từ chối `from=paid` (P0-9, A14); không có trigger nào ở DB.
- Scheduler: mỗi 15s `SELECT id FROM orders WHERE status='sent' AND created_at < now() - interval '5 minutes'` rồi với từng id gọi `writer.UpdateWhereStatus(id, from=sent, cancelled/timeout)` trong một transaction cùng events + outbox; `ErrNotFound` nghĩa là seller đã thắng, bỏ qua và log info. Hằng ngày 03:00 APP_TZ: `writer.ClearCustomerPhone(now - 90d)` và `UPDATE notification_outbox SET recipient='' WHERE created_at < now() - interval '90 days' AND status <> 'pending'` (outbox không thuộc Writer).

## Requirements

- [x] `menu`: `GET /api/t/{token}` theo hợp đồng; 404/410; ghi `page_views` với `INSERT ... ON CONFLICT DO NOTHING` (ngày theo APP_TZ); không ghi khi QR thu hồi.
- [x] `orders` (khách): `POST /api/t/{token}/orders` (201/200/409/422 như hợp đồng; rate limit 10/phút/client), `GET /api/orders/{id}` (không SĐT, có `server_time`), `POST /api/orders/{id}/cancel`.
- [x] `orders` (người bán): `GET /api/seller/orders?scope&updated_after` (sort `created_at asc` cho open, `desc` cho closed, kèm SĐT, `server_time`), `GET /api/seller/orders/{id}`, `POST /api/seller/orders/{id}/transition`.
- [x] `orders/statemachine.go`: bảng chuyển hợp lệ thuần Go (`CanTransition(from, to, actor)`), hàm `applyTransition` sinh SET clause; `payment_method` bắt buộc khi `to=paid`, cấm khi khác.
- [x] `orders/events.go`: ghi `order_events` cho mọi chuyển, actor `customer|seller|system`.
- [x] Mọi ghi vào `orders` (create, cancel, transition, scheduler, purge) chỉ qua `orders.Writer`; `orders/repository.go` chỉ chứa câu đọc, không có `INSERT INTO orders`/`UPDATE orders` riêng (A14).
- [x] `orders/scheduler.go`: goroutine với `context`, ticker 15s + job hằng ngày, log số đơn bị huỷ; dừng theo graceful shutdown.
- [x] `notifications.Enqueuer` interface `Enqueue(ctx, tx, Notification)` và implementation `OutboxRepo` ghi bảng. Payload: `{order_id, code, partner_name, table_label, status, total, items_summary, seller_url}`; `kind=seller_new_order` (recipient `seller`) khi tạo đơn; `kind=customer_status` (recipient SĐT) khi `accepted`, `delivering`, `paid`, `rejected`, `cancelled(timeout)`. Không gửi khi khách tự huỷ.
- [x] Validate phone: regex `^0\d{9}$` sau khi bỏ khoảng trắng; lỗi 422 field `phone`.
- [x] Publish realtime sau commit cho create, transition (khách huỷ, người bán chuyển, scheduler huỷ): topic `seller` và `order:{id}`.
- [x] Test unit: state machine toàn bảng (hợp lệ + từng cặp không hợp lệ), gộp dòng, gate giờ bán (nhiều khung, khung qua nửa đêm, ngày không có khung), phone. Test integration: idempotent song song (10 goroutine cùng key → đúng 1 đơn), 409 khi hai transition cùng `expected_from`, transition trên đơn `paid` với mọi `to` → 409 `INVALID_TRANSITION` và row không đổi, scheduler huỷ đúng đơn > 5 phút với `FakeClock`, đơn `paid` lưu `commission_amount = ROUND(total*rate)`, page view dedupe trong ngày, WS seller nhận `order.created` sau POST và WS customer nhận `order.updated` sau transition.

## Architecture

```text
POST /api/t/{token}/orders
  handler → service.Create(ctx, token, clientID, idemKey, req)
    tx: load qr(active) → partner → settings → gate
        load products (not hidden, ids in req) → merge lines → validate → total
        writer.Insert (ON CONFLICT (idempotency_key) DO NOTHING RETURNING *)
        if not inserted: SELECT by key; check client_id; return existing (200)
        INSERT order_events(sent, customer); enqueuer.Enqueue(seller_new_order)
    commit → hub.Publish(seller, order.created) ; hub.Publish(order:{id}, order.updated)
  → 201 OrderView
```

Transition và scheduler đi cùng một hàm `transition(ctx, tx, id, from, to, actor, opts)` để một chỗ duy nhất biết cột nào phải set; hàm này gọi `writer.UpdateWhereStatus`, không tự viết SQL.

## Related Code Files

Create:
- `apps/api/internal/features/menu/{handler,service,repository,dto,gate}.go` + `gate_test.go`, `service_test.go`
- `apps/api/internal/features/orders/{handler_customer,handler_seller,service,repository,dto,statemachine,pricing,events,scheduler}.go` + `statemachine_test.go`, `pricing_test.go`, `service_integration_test.go`, `scheduler_test.go`
- `apps/api/internal/features/notifications/{enqueuer,outbox_repo}.go` (phần còn lại ở phase 5)

Modify:
- `apps/api/internal/platform/ids/ids.go` (thêm `NewOrderCode`)
- `apps/api/internal/app/router.go` (đăng ký route menu/orders, khởi động scheduler)
- `apps/api/cmd/api/main.go` (chạy scheduler, dừng khi shutdown)

## Implementation Steps

1. `statemachine.go` + test bảng đầy đủ trước (TDD cho phần có quy tắc rõ).
2. `pricing.go`: `MergeLines(req, products, hidden) (lines, total, err)`; lỗi trả `PRODUCT_UNAVAILABLE{product_ids}` gom tất cả món lỗi trong một lần.
3. `menu/gate.go` + test; `menu` handler/service/repo; page view.
4. `orders` create qua `writer.Insert`; DTO `OrderView` (public) và `SellerOrderView` (kèm phone).
5. Get/cancel khách; list/get/transition người bán.
6. `events.go`, `enqueuer` ghi outbox trong cùng tx.
7. `scheduler.go`; wire vào `main.go` với `errgroup`.
8. Integration test theo Requirements; test song song dùng `sync.WaitGroup` + `httptest`.

## Todo

- [x] state machine + test
- [x] pricing/merge + test
- [x] menu GET + page views + gate
- [x] create order idempotent + validate
- [x] get/cancel khách
- [x] list/get/transition người bán
- [x] events + outbox enqueue
- [x] publish realtime sau commit
- [x] scheduler timeout + purge SĐT (qua Writer)
- [x] integration tests xanh

## Success Criteria

- 10 request song song cùng `Idempotency-Key` → DB có 1 đơn, 1 request 201, 9 request 200 cùng `id`.
- Hai `transition` cùng `expected_from=sent` → một 200, một 409 `{current_status:"accepted"}`; `order_events` có đúng 1 dòng.
- Đơn `sent` tạo lúc T, `FakeClock` tới T+5m01s, chạy một tick → `cancelled/timeout`, có event `system`, có outbox `customer_status`.
- GET menu với món ẩn của quán → không thấy; món `available=false` → thấy kèm `available:false`; POST với món đó → 409 `PRODUCT_UNAVAILABLE`.
- Đơn `paid` với `total=45000`, rate `0.15` → `commission_amount=6750`.

## Risk Assessment

- Scheduler và seller đua cùng đơn: cả hai dùng conditional update, bên thua bỏ qua (ghi log info). Test có kịch bản này.
- Postgres `ON CONFLICT DO NOTHING` + `RETURNING` trả 0 row khi trùng: phải SELECT lại ngoài câu insert; viết test tường minh.
- Ngân sách thời gian 2d là chặt; nếu trượt, chuyển `scope=closed` list sang phase 5 (không ảnh hưởng luồng chính).

## Security Considerations

- `GET /api/orders/{id}` công khai theo UUID: không trả SĐT, không trả `client_id`.
- Cancel đòi `X-Client-Id` khớp; sai → 403 `NOT_OWNER`.
- Rate limit tạo đơn theo `client_id` và thêm một tầng theo IP (30/phút) để chặn client đổi id liên tục.
- Ghi chú (`note`) được trim, cắt 200 ký tự, escape khi render phía web; API không render HTML.

## Next Steps

Phase 5 hoàn thiện API notifier, VietQR và báo cáo trên dữ liệu đơn của phase này.
