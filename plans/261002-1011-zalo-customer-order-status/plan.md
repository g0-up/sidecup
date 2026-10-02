---
title: "Gửi trạng thái đơn cho khách qua Zalo cá nhân (port từ teka)"
description: "Người bán liên kết Zalo cá nhân bằng mã QR trong Cài đặt; khi người bán đổi trạng thái đơn, API tự gửi tin Zalo cho khách nếu khách đã nhập số điện thoại."
status: completed
priority: P1
effort: 3d
branch: master
tags: [feature, backend, frontend, database, api]
blockedBy: []
blocks: []
created: 2026-10-02
---

# Gửi trạng thái đơn cho khách qua Zalo cá nhân

## Overview

Port tính năng `features/zalo` của teka (commit `4b33e6e`) vào sidecup theo mode `--port`. Phân tích nguồn, ma trận phụ thuộc và ma trận quyết định nằm ở [báo cáo xia](../reports/xia-261002-1011-zalo-customer-order-status.md); plan này chỉ ghi những gì cần để làm.

Thay đổi kiến trúc so với quyết định A3 của plan MVP: phiên Zalo chạy **trong process API** thay vì một dịch vụ notifier bên ngoài (chưa từng được viết). Outbox, claim/ack, heartbeat và banner đỏ có sẵn được dùng lại nguyên vẹn; một worker trong process thay chỗ notifier cho loại tin `customer_status`. API `/internal/*` giữ nguyên.

## Outcome và acceptance criteria

1. Trong **Cài đặt**, người bán thấy card "Kết nối Zalo": chưa kết nối / đã kết nối (tên Zalo, thời điểm) / phiên hết hạn. Bấm "Kết nối" → tick đồng ý → hiện mã QR → quét trên điện thoại → card chuyển "Đã kết nối" không cần tải lại trang. Có nút "Ngắt kết nối".
2. Khi đơn chuyển sang Đang pha, Đang mang ra, Đã thu tiền, Quán từ chối, hoặc Đã huỷ do quá hạn, khách có SĐT nhận một tin Zalo (mã đơn, quán, bàn, trạng thái mới, tổng tiền, link xem đơn) trong vòng ~10 giây.
3. Khách **không** nhập SĐT vẫn đặt được đơn; đơn đó không sinh tin Zalo nào.
4. SĐT không có Zalo / không tìm thấy: tin bị đánh dấu `failed` ngay, không thử lại, không bật banner đỏ; đơn chạy bình thường.
5. Phiên Zalo chết (Zalo trả not-logged-in hoặc relogin bị từ chối): tài khoản chuyển `expired`, tin chưa gửi nằm lại hàng đợi (không tốn lượt thử), banner đỏ trên màn người bán hiện "Phiên Zalo đã hết hạn — khách không nhận được tin trạng thái đơn. Vào Cài đặt để quét lại mã QR." kèm link tới `/seller/settings` trong vòng vài giây; banner **chỉ** đỏ vì lý do này (chưa cấu hình hay chưa liên kết thì không đỏ); quét lại QR thì banner tắt và thì tin còn trong hạn 30 phút được gửi tiếp.
6. Credentials Zalo chỉ lưu dạng mã hoá AES-GCM, không xuất hiện trong log hay response; SĐT không xuất hiện trong log.
7. Thiếu `ZALO_CREDENTIAL_KEY`: API vẫn khởi động, worker không chạy, endpoint Zalo trả 503 "Chưa cấu hình Zalo", card hiện thông báo tương ứng.
8. `make test` (có `TEST_DATABASE_URL`), `go vet`, `pnpm lint`, `pnpm test`, `pnpm build` đều xanh.

## Non-goals

- Gửi `seller_new_order` (báo đơn mới cho người bán) qua Zalo — user chốt ngoài phạm vi; các tin đó vẫn pending/hết hạn như hiện nay.
- Danh sách bạn bè, gửi lời mời kết bạn, notification runs, Zalo OA/ZNS, gỡ API `/internal/*`, chạy nhiều replica API.

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | [Nền tảng: secrets, protocol, migration, config](./phase-01-api-foundation-secrets-protocol.md) | Completed | 4h |
| 2 | [Feature zalo: liên kết QR, phiên, gửi tin theo SĐT](./phase-02-api-zalo-feature.md) | Completed | 7h |
| 3 | [Worker outbox và SĐT tuỳ chọn ở API](./phase-03-api-dispatcher-optional-phone.md) | Completed | 5h |
| 4 | [Web: card Kết nối Zalo và giỏ hàng SĐT tuỳ chọn](./phase-04-web-settings-zalo-optional-phone.md) | Completed | 5h |
| 5 | [Docs, PRD, E2E](./phase-05-docs-prd-e2e.md) | Completed | 2h |

## Dependencies

```text
P1 ─► P2 ─► P3 ─► P5
      └───► P4 ─┘   (P4 cần hợp đồng HTTP của P2; phần SĐT tuỳ chọn ở web cần P3)
```

## Rủi ro chính

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Zalo khoá/hạn chế tài khoản vì nhắn người lạ (PRD đã chấp nhận) | Cao | Gửi tuần tự, nghỉ 1–3s ngẫu nhiên; khuyến nghị dùng tài khoản Zalo phụ (ghi trong runbook và consent) |
| `FindUser` có hạn mức không công bố | Trung bình | Cache phone→uid trong bộ nhớ (24h, âm 1h); một đơn chỉ tra một lần cho cả 4 tin |
| Zalo đổi wire format → protocol vỡ | Trung bình | Gói `protocol` cách ly; lỗi chỉ làm mất tin Zalo, web trạng thái vẫn là kênh chính |
| Go 1.25 (local) vs 1.26 (teka) | Thấp | Phase 1 build + test protocol ngay sau khi chép |
| Race ngắt kết nối khi đang relogin | Thấp | Giữ cơ chế `PutUnlessEvicted` của teka |

## Rollback

Mỗi phase là commit riêng. Rollback toàn bộ: sao lưu DB, revert các commit, rồi chạy tay `DROP TABLE IF EXISTS zalo_account;` và `UPDATE schema_migrations SET version = 2, dirty = false;`. **Không** dùng `migrate down`: lệnh này lùi toàn bộ migration về 0 (xoá mọi bảng), không có số bước — xem `docs/runbook.md`. Outbox không đổi schema nên không mất dữ liệu đơn. Tắt nóng không cần deploy: bỏ `ZALO_CREDENTIAL_KEY` rồi restart → worker không claim tin, chỉ còn heartbeat.

## Quyết định đã chốt (02/10/2026)
- Banner đỏ trên màn người bán chỉ hiện khi phiên Zalo hết hạn, nói rõ hậu quả và dẫn tới Cài đặt. Hết cảnh báo đỏ thường trực như hiện nay.
- Tin báo đơn mới cho người bán qua Zalo (P0-5) chưa làm; không lên plan tiếp lúc này.
