---
phase: 5
title: "Docs, PRD, e2e"
status: completed
priority: P2
effort: "2h"
dependencies: [3, 4]
---

# Phase 5: Docs, PRD, e2e

## Goal
Tài liệu và e2e khớp hành vi mới: SĐT không bắt buộc, gửi tin cho khách chạy trong process API, người bán kết nối Zalo trong Cài đặt.

## Files
- `prd.md`:
  - P0-11 dòng 194: "ô số điện thoại không bắt buộc; bỏ trống thì không gửi tin trạng thái; nhập thì phải đúng định dạng…". Dòng 195: đổi câu ghi chú cho khớp UI.
  - Thêm một dòng P0-11: người bán kết nối tài khoản gửi tin bằng mã QR trong Cài đặt.
  - P0-5: ghi chú tin báo người bán qua Zalo **chưa** làm trong bản này (chỉ chuông + banner); không xoá yêu cầu.
  - P0-5 dòng cảnh báo đỏ: ghi rõ banner đỏ hiện khi phiên Zalo hết hạn, kèm hướng dẫn quét lại QR trong Cài đặt.
- `docs/acceptance-p0.md` P0-11 (dòng 102+): cập nhật bằng chứng (test mới của phase 3/4), bỏ "Gửi thật thuộc notifier — CHƯA KIỂM" → thay bằng kiểm tay với tài khoản phụ.
- `docs/api.md`: thêm 4 route `/api/seller/zalo*`; `POST /api/orders` `phone` không bắt buộc; ghi chú `/internal/notifications/*` vẫn còn cho notifier ngoài nhưng trong process đã nhận `customer_status`.
- `docs/runbook.md`: biến `ZALO_CREDENTIAL_KEY` (≥ 32 byte, tạo bằng `openssl rand -base64 48`; đổi key = mọi phiên cũ thành `expired`, phải quét lại); khuyến nghị tài khoản Zalo phụ; xử lý khi banner "Phiên Zalo đã hết hạn" (vào Cài đặt → "Quét lại mã QR"); chỉ chạy một replica API (phiên Zalo nằm trong bộ nhớ); backup DB trước `migrate up` lên `000003`.
- `README.md`/`docs/README.md`: chỉ sửa nếu đang liệt kê biến môi trường hoặc kiến trúc notifier.
- `apps/web/e2e/`: thêm spec đặt đơn bỏ trống SĐT (đơn tạo được, màn người bán không có link `tel:`). `openCartAndFillPhone` giữ nguyên cho các spec cũ. Không có e2e cho QR thật (cần Zalo thật) — thẻ Zalo chạy với `configured=false` trong CI.

## Verification
- Link và tên test trong docs khớp file thật (`grep` từng tên test).
- `make test` + `go vet` (apps/api); `pnpm lint && pnpm test && pnpm build` (apps/web); `pnpm e2e` nếu môi trường có trình duyệt.
- Kiểm tay cuối: tài khoản phụ, đơn có SĐT nhận đủ tin Đang pha → Đang mang ra → Đã thu tiền; đơn không SĐT không nhận gì; SĐT không dùng Zalo → outbox `failed` ngay, banner không đỏ.
