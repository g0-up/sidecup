---
phase: 3
title: "Worker gửi tin cho khách + SĐT không bắt buộc"
status: completed
priority: P1
effort: "5h"
dependencies: [2]
---

# Phase 3: Worker gửi tin cho khách + SĐT không bắt buộc (API)

## Goal
Tin `customer_status` trong outbox được gửi trong khoảng ~10 giây bằng worker chạy trong process API. Khách không nhập SĐT vẫn đặt được và không phát sinh tin.

## Files
- Modify: `apps/api/internal/features/notifications/service.go`
  - `ClaimKind(ctx, kind string, limit int)` — giống `Claim` nhưng có thêm `AND kind = ?`. `Claim` giữ nguyên cho `/internal` (đổi ruột thành `claim(ctx, "", limit)` để không lặp code).
  - `AckPermanent(ctx, id, errMsg)` — đặt `failed` ngay, bỏ qua backoff (người nhận không dùng Zalo / chặn người lạ). Ack trên tin đã xử lý vẫn là no-op như `Ack`.
- Create: `apps/api/internal/features/notifications/dispatcher.go` (+ `dispatcher_test.go`).
- Create: `apps/api/internal/features/notifications/message.go` (+ `message_test.go`) — tạo nội dung tin tiếng Việt từ `Payload`.
- Modify: `apps/api/internal/features/orders/dto.go:79` — `validate:"omitempty,max=20"`.
- Modify: `apps/api/internal/features/orders/service.go` (`Create`, ~dòng 72 và 123) — trim rỗng → `CustomerPhone = nil`; khác rỗng thì vẫn qua `NormalizePhone`, sai vẫn trả `apperr.Field("phone", …)`. Nhánh enqueue ở `transitionTx` đã chặn phone nil/rỗng — giữ nguyên, thêm test.
- Modify: `apps/api/internal/app/router.go`, `apps/api/cmd/api/main.go` — luôn chạy `a.Dispatcher.Run(gctx)` trong errgroup. Khi Zalo tắt (`a.Zalo == nil`) dispatcher chỉ chạy vòng heartbeat với `ok = true`, không claim tin — để banner không đỏ chỉ vì chưa cấu hình.
- Tests integration: `apps/api/internal/app/*_test.go` — thêm ca tạo đơn không SĐT, và ca dispatcher với sender giả.

## Dispatcher
Phụ thuộc qua interface hẹp để test được không cần Zalo:

```go
type CustomerSender interface {
    SendToPhone(ctx context.Context, phone, text string) (string, error)
    SessionHealthy(ctx context.Context) (ok bool, message string)
}
```

Vòng lặp (một goroutine, tuần tự — gửi dồn dập là cách nhanh nhất để tài khoản phụ bị khoá):
1. `ClaimKind(ctx, KindCustomerStatus, 5)`. Rỗng → chờ 2 giây (dùng `clock`, huỷ theo ctx).
2. Với từng tin: `SendToPhone(recipient, Render(payload))`.
   - ok → `Ack(id, true, "")`.
   - `zalo.ErrRecipientNotFound` → `AckPermanent(id, "không tìm thấy Zalo")`.
   - `zalo.ErrNotLinked` / `zalo.ErrLinkExpired` → **không ack**; dừng lô, để lease 60 giây trả tin về hàng đợi mà không tốn lượt thử; ngủ 30 giây. Tin quá `MessageTTL` (30 phút) tự `failed` "expired" theo luật có sẵn.
   - lỗi khác → `Ack(id, false, err.Error())` (thử lại theo backoff, lần 3 → `failed`). `err.Error()` không được chứa SĐT — kiểm trong test.
   - Giữa hai tin nghỉ ngẫu nhiên 1–3 giây.
3. Mỗi 30 giây (và ngay khi `OnStatusChange` bắn): `ok, msg := SessionHealthy()`; `Heartbeat(ctx, ok, msg)`; `PublishStatus(ctx, true)` khi được gọi từ callback. `ok = false` **chỉ** khi tài khoản `expired`, msg = "Phiên Zalo đã hết hạn — khách không nhận được tin trạng thái đơn. Vào Cài đặt để quét lại mã QR." Chưa cấu hình / chưa liên kết → `ok = true`, msg rỗng. Tin khách `failed` không bật banner (vì `failed_last_hour` chỉ đếm `seller_new_order`). Kết quả: banner đỏ chỉ hiện khi phiên hết hạn (hoặc khi chính worker chết và heartbeat quá 90 giây).

Tin `seller_new_order` không bị chạm tới: vẫn nằm `pending` và hết hạn sau 30 phút như hiện nay (non-goal).

## Nội dung tin
```
Sidecup – đơn #{Code}
{PartnerName} · Bàn {TableLabel}
Trạng thái: {nhãn}
Tổng: {Total đ, phân tách nghìn bằng dấu chấm}
Xem đơn: {OrderURL}
```
Nhãn: accepted → "Đang pha", delivering → "Đang mang ra", paid → "Đã thu tiền", rejected → "Quán từ chối", cancelled + timeout → "Đã huỷ do quán không nhận kịp". Dùng lại nhãn đang có ở web/API nếu đã có hằng số; không bịa tên shop — `PartnerName` có sẵn trong payload.

## Verification
- `go test -race ./internal/features/notifications/... ./internal/features/orders/...`:
  - dispatcher: ok → sent; not found → failed ngay, attempts không tăng quá 1; expired → không ack, tin vẫn pending sau lease; lỗi tạm → attempts+1; chỉ claim `customer_status`; heartbeat: linked → `ok=true`; chưa liên kết → `ok=true`; expired → `ok=false` + đúng câu thông báo; Zalo tắt → chỉ heartbeat `ok=true`, không claim.
  - message: đủ 5 nhãn, định dạng tiền, có link.
- `make test-integration`: `POST /api/orders` không có `phone` → 201, `customer_phone` null; chuyển trạng thái không tạo hàng outbox `customer_status`; `phone: "123"` → 422 `phone`; `TestCreateOrderRejections` cập nhật ca SĐT rỗng (không còn là lỗi).
- `make lint`.

## Risk — ý nghĩa banner đổi
Hiện chưa có notifier nên banner đỏ luôn bật. Sau phase này banner chỉ đỏ khi phiên Zalo hết hạn (người dùng chốt 02/10/2026). Tin báo đơn mới cho người bán qua Zalo vẫn chưa làm; chuông trên màn người bán vẫn là kênh chính của P0-5.
