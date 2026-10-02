---
title: "Phase 5: API outbox thông báo, VietQR, báo cáo"
status: todo
priority: P1
effort: 1.5d
dependencies: [4]
---

# Phase 5: API outbox thông báo, VietQR, báo cáo

## Context Links

- [architecture.md §5 (Nội bộ cho notifier, Báo cáo)](./architecture.md#5-hợp-đồng-api), quyết định A3, A8, A10
- PRD: P0-5 (retry, cảnh báo đỏ), P0-8 (VietQR), P0-9 (báo cáo, điều chỉnh, export), P0-11 (tin cho khách, không lộ SĐT), G4 (phễu)

## Overview

Ba việc độc lập trên dữ liệu đã có: (1) API nội bộ để dịch vụ notifier kéo outbox, ack, heartbeat và endpoint trạng thái cho màn người bán; (2) sinh chuỗi VietQR EMVCo; (3) báo cáo hoa hồng theo quán/kỳ, phễu G4, bản ghi điều chỉnh, export văn bản.

## Key Insights

- Notifier (ngoài plan) chạy vòng lặp: `GET pending` → gửi Zalo → `ack`. API khoá mềm bằng `next_attempt_at = now()+60s` lúc trả ra để hai vòng lặp không gửi trùng; ack `ok=false` tăng `attempts`, backoff `30s * 2^attempts`; `attempts >= 3` → `failed` (P0-5 "sau 3 lần").
- `notifier/status.healthy = last_seen_at > now()-90s AND session_ok`; `failed_last_hour` đếm outbox `failed` có `created_at` trong 1 giờ. Màn người bán hiện đỏ khi `!healthy || failed_last_hour > 0`. Publish `notifier.status` tới topic `seller` khi heartbeat đổi `session_ok`, khi một outbox chuyển `failed`, và từ một goroutine kiểm tra mỗi 30s khi heartbeat quá hạn (để màn người bán biết notifier chết lặng mà không cần poll).
- VietQR (NAPAS EMVCo): `00=01`, `01=12` (dynamic), `38` = `00=A000000727` + `01=(00=<BIN>,01=<account>)` + `02=QRIBFTTA`, `52=0000`, `53=704`, `54=<amount>`, `58=VN`, `62=(08=<purpose>)`, `63=<CRC16-CCITT-FALSE>`. Purpose = `code` của đơn (chữ + số, không dấu). Hàm thuần `vietqr.Payload(bin, account, amount, purpose) string` test với một vector đã verify bằng app ngân hàng lúc implement (ghi vector vào test).
- Kỳ hoa hồng: `period=current|previous` theo `partners.payout_period`; tuần = Thứ Hai → Chủ Nhật theo APP_TZ; tháng = ngày 1 → cuối tháng. `from/to` là ngày (inclusive) theo APP_TZ, API đổi sang khoảng `timestamptz`.
- Báo cáo chỉ `SUM(commission_amount)`, không tính lại từ rate (A10). Điều chỉnh gom riêng: `adjustments_total`, `net = commission + adjustments_total`.
- Phễu G4 theo quán theo ngày: `views = COUNT(DISTINCT client_id) FROM page_views`, `orders = COUNT(*) orders created in day`, `paid = COUNT(*) status=paid`. Join theo `qr_codes.partner_id` cho views; theo `orders.partner_id` cho đơn.

## Requirements

- [x] `notifications`: publish `notifier.status` theo Key Insights; `GET /internal/notifications/pending?limit` (mặc định 20, tối đa 100; `WHERE status='pending' AND (next_attempt_at IS NULL OR next_attempt_at <= now()) ORDER BY id FOR UPDATE SKIP LOCKED` rồi set `next_attempt_at`), `POST /internal/notifications/{id}/ack`, `POST /internal/notifier/heartbeat`, `GET /api/seller/notifier/status`.
- [x] `payments/vietqr`: hàm `Payload` + CRC16; `GET /api/seller/orders/{id}/vietqr` → `{payload, amount, purpose, bank_account_name}`; 409 `BANK_NOT_CONFIGURED` khi settings thiếu.
- [x] `reports`: commission (theo quán + tổng, lọc `partner_id`, `from/to` hoặc `period`), funnel, adjustments (list/create với `amount ≠ 0`, `reason` bắt buộc, `created_by='seller'`), export text.
- [x] Export text mẫu (không SĐT, không mã đơn của khách):
  ```text
  BÁO CÁO HOA HỒNG — Quán test
  Kỳ: 29/09/2026 – 05/10/2026 (tuần)
  Đơn đã thu tiền: 23   Doanh thu: 1.035.000đ
  Đơn không giao được: 2
  Hoa hồng 15%: 155.250đ
  Điều chỉnh: -20.000đ (1 bản ghi)
  Phải trả: 135.250đ
  ```
- [x] Test unit: CRC16 vector chuẩn (`"123456789"` → `0x29B1`), `Payload` vector, tính kỳ tuần/tháng quanh biên (31/12, năm nhuận), backoff. Test integration: pending khoá mềm (gọi hai lần liên tiếp không trả trùng), ack fail 3 lần → `failed`, báo cáo khớp số liệu fixture (3 đơn paid, 1 failed, 1 adjustment), funnel đếm distinct client.

## Architecture

`reports/repository.go` dùng SQL tường minh (`db.Raw`) với CTE, scan vào struct; không ORM aggregate. `payments` không chạm DB ngoài đọc settings/order.

## Related Code Files

Create:
- `apps/api/internal/features/notifications/{handler_internal,handler_seller,service,repository,dto}.go` + `service_test.go`, `repository_integration_test.go`
- `apps/api/internal/features/payments/vietqr/{vietqr,crc16}.go` + test; `apps/api/internal/features/payments/{handler,service}.go`
- `apps/api/internal/features/reports/{handler,service,repository,dto,period,export}.go` + `period_test.go`, `export_test.go`, `repository_integration_test.go`

Modify:
- `apps/api/internal/app/router.go`
- `apps/api/internal/features/notifications/outbox_repo.go` (từ phase 4: thêm hàm claim/ack)

## Implementation Steps

1. `vietqr` + CRC16 thuần, test trước.
2. Outbox claim/ack/heartbeat + status; test khoá mềm với hai request liên tiếp.
3. `period.go` (`Resolve(partner, period, now) (from, to)`) + test biên.
4. SQL báo cáo hoa hồng và phễu; DTO.
5. Adjustments list/create.
6. Export text (`text/template`), header `Content-Disposition: attachment; filename="hoa-hong-<slug>-<from>-<to>.txt"`.
7. Router + integration test trên dữ liệu seed mở rộng (thêm hàm `seedReportFixture` trong testdb).

## Todo

- [x] vietqr + crc16 + endpoint
- [x] outbox pending/ack/heartbeat/status
- [x] period resolve + test
- [x] commission report + funnel SQL
- [x] adjustments
- [x] export text
- [x] tests xanh

## Success Criteria

- `Payload("970415","0123456789",45000,"AB12CD")` cho chuỗi bắt đầu `000201010212` và CRC cuối khớp vector; quét bằng app ngân hàng thật lúc nghiệm thu thấy đúng số tiền và nội dung.
- `pending` gọi hai lần cách nhau < 60s không trả trùng id; ack fail lần 3 → `status=failed`; `notifier/status` phản ánh heartbeat.
- Báo cáo quán test với fixture: `paid_count=3, revenue=135000, commission=20250, failed_count=1, adjustments_total=-5000, net=15250`.
- Export không chứa chuỗi khớp `0\d{9}`.

## Risk Assessment

- Vector VietQR sai do tài liệu NAPAS thay đổi: nghiệm thu bằng quét thật là bắt buộc; nếu lệch, chỉ sửa `vietqr.go`.
- `FOR UPDATE SKIP LOCKED` cần transaction; dùng `WithTx` của phase 2.

## Security Considerations

- `/internal/*` chỉ nhận bearer `NOTIFIER_TOKEN`; compose prod không publish cổng API ra ngoài, chỉ qua reverse proxy, và proxy không forward `/internal` (phase 9).
- Export và báo cáo không có SĐT, không có `client_id`.
- Số tài khoản ngân hàng chỉ trả cho người bán đã đăng nhập (qua endpoint vietqr); không nằm trong payload trang khách.

## Next Steps

Phase 7 và 8 tiêu thụ các endpoint này; dịch vụ notifier bên ngoài tích hợp theo §5 "Nội bộ cho notifier".
