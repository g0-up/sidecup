---
title: "Zalo báo trạng thái đơn cho khách: hoàn tất và các bài học"
date: 2026-10-02
summary: "Liên kết Zalo cá nhân phụ qua QR, dispatcher in-process gửi trạng thái đơn; review sửa expire giả và race relink; migrate-down xoá sạch DB dev"
---

# Zalo báo trạng thái đơn cho khách: hoàn tất và các bài học

# Zalo báo trạng thái đơn cho khách: hoàn tất và các bài học

**Date**: 2026-10-02 11:23
**Severity**: Medium
**Component**: `apps/api` (Zalo dispatcher, notifications, orders), `apps/web` (Settings, customer menu)
**Status**: Resolved (code) — còn chờ kiểm tay với tài khoản Zalo thật

## What happened
- Hoàn tất plan `plans/261002-1011-zalo-customer-order-status/plan.md`: người bán liên kết một tài khoản Zalo cá nhân phụ bằng QR trong Settings; dispatcher chạy in-process trong API Go gửi tin trạng thái đơn cho khách có để SĐT (SĐT giờ là tuỳ chọn).
- Credential mã hoá AES-GCM bằng `ZALO_CREDENTIAL_KEY`. Thiếu key → API vẫn chạy, worker không claim, route ghi trả `503 ZALO_NOT_CONFIGURED`.

## The brutal truth
- Bản đầu sẽ **đánh dấu tài khoản hết hạn chỉ vì một lần relogin dính lỗi mạng/5xx/429/timeout** — tức người bán phải quét QR lại vì Zalo hắt hơi. Thêm race: relogin cũ hoàn tất sau khi người bán vừa relink có thể ghi đè session mới hoặc đánh expired. Cả hai lọt qua test, chỉ review mới bắt được.
- Cú đau nhất: `make migrate-down` **rollback toàn bộ migration**, không phải một bước. DB dev bay sạch, phải khôi phục từ dump. Lẽ ra đọc Makefile trước khi gõ.

## Fixes từ review
Chi tiết: `plans/reports/code-reviewer-261002-1103-zalo-customer-status.md`.
- Lỗi tạm thời khi relogin bọc thành `protocol.ErrTransport`, không expire tài khoản.
- Relink race: eviction counter + `statusMu` để relogin cũ không thể mark expired hay ghi đè session mới.
- Ack dùng ctx tách rời 5s → shutdown không làm mất ack của tin đã gửi.
- Health probe không còn evict cache; lỗi Zalo ở envelope bên trong trả về `APIError`.
- Thêm `DELETE /api/seller/zalo/link/:id` để nút "Huỷ" dừng phiên QR phía server; web polling retry 2 lần với network/5xx, không retry 4xx.

## Decision
- Rollback trong docs giờ quy định DROP thủ công + cập nhật version `schema_migrations`, cấm dùng `make migrate-down` trên DB có dữ liệu.
- Giao nhận at-least-once, chấp nhận và ghi trong `docs/runbook.md` thay vì cố exactly-once.

## Result
- API: `make test` (integration, `-race`), vet, golangci-lint 0 issue.
- Web: lint, vitest 106/107 (duy nhất `QrPrintCard` fail do `VITE_SELLER_NAME` trong `apps/web/.env` local; bỏ biến thì pass), build, size budget OK.
- E2E chưa chạy. Chưa commit.

## Lessons
- Phân loại lỗi (transient vs auth) phải là hợp đồng có type ngay từ đầu, không phải chuỗi so khớp sau.
- Mọi state machine có relink/relogin đồng thời cần thế hệ (generation counter) — viết test race trước.
- Đọc target Makefile trước khi chạy lệnh phá huỷ; dump DB trước mọi thao tác migration.

## Next steps (backlog mở)
- Kiểm tay với tài khoản Zalo thật; chạy e2e.
- Edge case expiry tại thời điểm claim.
- Row `customer_status` xếp hàng mãi khi Zalo chưa cấu hình — cần TTL/dọn.
- Log `SessionHealthy` spam khi DB down; chưa có backoff relogin khi expired.
- Card Settings chưa refresh qua WS; text banner heartbeat cũ.
- Sửa test `QrPrintCard` để không phụ thuộc `.env` local.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
