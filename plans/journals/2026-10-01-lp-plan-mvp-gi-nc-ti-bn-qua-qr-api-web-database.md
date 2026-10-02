---
title: "Lập plan MVP gọi nước tại bàn qua QR (api, web, database)"
date: 2026-10-01
summary: "Tạo plan 9 phase từ PRD; validation đổi sang WebSocket hai phía, MD5 cho mật khẩu theo user, giờ bán JSONB nhiều khung"
---

# Lập plan MVP gọi nước tại bàn qua QR (api, web, database)

## What happened

- Repo trống (chỉ `prd.md`), nên không có scouting; đọc PRD và viết plan trực tiếp theo `ak:plan` mode hard (tự red-team, validation gate ở cuối).
- Scaffold bằng `ak plan create` + `ak plan add-phase` (9 phase), đổi tên phase-01 thành `monorepo-scaffold-infra`. Hợp đồng dùng chung (cấu trúc `apps/api`, `apps/web`, schema Postgres, API REST + WebSocket, máy trạng thái đơn, env) đặt ở `plans/261001-0655-qr-table-ordering-mvp/architecture.md` để phase chỉ tham chiếu.
- Hook `scout-block.cjs` chặn lệnh Bash có chuỗi `build` trong heredoc, nên nội dung phase 3–9 được ghi bằng Write tool thay vì `cat <<EOF`.
- Validation session 1 (4 câu): user chọn WebSocket hai phía (thay polling), giữ notifier Zalo ngoài plan, dùng MD5 cho mật khẩu người bán, giờ bán nhiều khung theo thứ.

## Decision

- A1: hub WebSocket in-process (`platform/realtime`, `coder/websocket`), publish sau commit, REST polling 15s chỉ là fallback; client resync bằng `updated_after` khi reconnect.
- A4: `SELLER_PASSWORD_HASH` là MD5 hex theo quyết định user; plan ghi cảnh báo bảo mật, cô lập trong `auth.VerifyPassword` để đổi sang bcrypt bằng một thay đổi.
- `partners.open_hours` JSONB `[{days, from, to}]` với type `partners.OpenHours.Contains(now)` theo `APP_TZ`.
- Đơn `paid` bất biến bằng trigger DB chỉ cho phép đổi `customer_phone` (xoá sau 90 ngày).
- Effort tổng 14d; plan đã pin bằng `ak plan use`.

## Next steps

- Chạy `/ak:cook plans/261001-0655-qr-table-ordering-mvp/plan.md` bắt đầu từ phase 1.
- Khi implement phase 5, nghiệm thu VietQR bằng quét app ngân hàng thật và ghi vector vào test.
- Cân nhắc lại MD5 trước khi chạy thử nếu môi trường VPS dùng chung.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
