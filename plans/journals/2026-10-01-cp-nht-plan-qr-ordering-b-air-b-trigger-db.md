---
title: "Cập nhật plan QR ordering: bỏ Air, bỏ trigger DB"
date: 2026-10-01
summary: "Plan 261001-0655-qr-table-ordering-mvp: phase 1 dùng go run thay air; bất biến đơn paid và updated_at chuyển từ trigger PostgreSQL sang orders.Writer ở tầng ứng dụng (A14)."
---

# Cập nhật plan QR ordering: bỏ Air, bỏ trigger DB

## What happened
User yêu cầu sửa plan `plans/261001-0655-qr-table-ordering-mvp` với hai chỉ thị: không dùng Air cho Go và không dùng trigger PostgreSQL, chuyển toàn bộ logic đó lên tầng ứng dụng ở phase 2.

Rà toàn bộ thư mục plan bằng grep: Air chỉ xuất hiện ở phase 1; trigger xuất hiện ở `architecture.md` (A9, §3), `plan.md` (Goal 3, R3), phase 2 (requirements, SQL mẫu, test, risk), còn phase 4 là nơi ghi vào `orders`.

## Decision
- Phase 1: `make dev` chạy `go run ./cmd/api`, bỏ `.air.toml`, thêm target `dev-api` để chạy lại tay.
- Thêm A14 vào `architecture.md`: ràng buộc nghiệp vụ nằm ở Go. `orders.Writer` là đường ghi duy nhất vào `orders` với ba phương thức `Insert`, `UpdateWhereStatus` (luôn `WHERE id AND status = $from`, từ chối `from = paid`), `ClearCustomerPhone`; không có DELETE. Hook GORM `BeforeCreate/Update/Delete` trên `Order` chặn đường ORM. `updated_at` dùng `autoUpdateTime` cho CRUD và set tường minh trong raw SQL.
- Trade-off ghi rõ: mất chốt chặn cuối ở DB trước UPDATE tay qua psql; bù bằng runbook phase 9, `adjustments`, `order_events`. Thêm lại trigger chỉ là một migration nếu cần.
- Phase 2 effort 1d → 1.25d; tổng plan giữ 14d. Phase 4 đổi mọi đường ghi sang Writer và thêm test đơn `paid` không chuyển được.

## Next steps
Chạy `/ak:cook` từ phase 1 khi sẵn sàng triển khai. Khi review phase 4, kiểm quy ước "chỉ `orders/writer.go` chứa `INSERT INTO orders` / `UPDATE orders`".

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
