---
title: "Gọi nước tại bàn qua mã QR — MVP (api, web, database)"
description: "Xây đủ 11 yêu cầu P0 của PRD bằng Go/Gin/GORM/PostgreSQL và React/Vite/shadcn trong monorepo apps/api + apps/web, kèm hợp đồng outbox cho dịch vụ gửi tin Zalo."
status: in-progress
priority: P1
effort: 14d
branch: master
tags: [feature, backend, frontend, database, api, auth, infra]
blockedBy: []
blocks: []
created: 2026-10-01
---

# Gọi nước tại bàn qua mã QR — MVP

## Overview

Xây sản phẩm theo `prd.md` (cập nhật 01/10/2026): khách quét mã QR trên bàn, đặt nước trên web, người bán xử lý đơn trên màn web, hoa hồng tính tự động theo quán. Plan này bao phủ ba phạm vi user yêu cầu: **api** (Go, Gin, GORM, golang-migrate), **web** (React, Vite, Tailwind, shadcn/ui), **database** (PostgreSQL), và hạ tầng Docker tối thiểu để chạy cả ba. Mọi hợp đồng dùng chung (cấu trúc thư mục, schema, API, máy trạng thái, env) nằm ở [architecture.md](./architecture.md); phase chỉ tham chiếu, không chép lại.

**Ngoài phạm vi plan** (đã nêu rõ để không ai mong đợi): dịch vụ gửi tin Zalo cá nhân (TypeScript, PRD §Kiến trúc) — plan chỉ định nghĩa outbox + API nội bộ mà dịch vụ đó sẽ gọi; sao lưu DB, cảnh báo vận hành, tên miền/TLS thật; P1/P2.

## Scope Challenge

- Mã có sẵn: không có (repo trống, chỉ `prd.md`). Không có gì để tái dùng hay tránh xây lại.
- Phạm vi yêu cầu: đủ P0-1 → P0-11, đúng stack user chốt, feature-based trong `apps/api` và `apps/web`. Giữ nguyên (HOLD SCOPE); không thêm P1.
- Độ phức tạp: ~90 file mới, 10 feature API, 9 feature web, 1 migration init. Hợp lý cho sản phẩm greenfield; không gộp phase vì mỗi phase có cổng kiểm thử riêng.
- Mode: auto-detect → `hard` (tự red-team + validation), bỏ bước research ngoài vì stack đã chốt và quen thuộc.

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Khách đặt xong trong ≤ 60 giây, không cài app, không đăng nhập (G1, P0-2/3/4/11) | P1 |
| 2 | Người bán thấy đơn ≤ 2 giây qua WebSocket (≤ 15 giây khi fallback) kèm chuông; chuyển trạng thái một chạm, không ghi đè nhau (G2, P0-5/6/8) | P1 |
| 3 | 100% đơn gắn đúng quán/bàn; báo cáo hoa hồng chỉ cộng từ đơn `paid`, đơn `paid` bất biến qua một đường ghi duy nhất ở tầng ứng dụng, không trigger (G3, P0-9, A14) | P1 |
| 4 | Phễu mở trang → đặt → giao theo quán, theo ngày (G4, P0-2) | P1 |
| 5 | Outbox + API nội bộ đủ để notifier Zalo gửi tin cho người bán và khách, kèm cảnh báo đỏ khi notifier lỗi (P0-5/11) | P1 |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Dựng monorepo và hạ tầng dev](./phase-01-monorepo-scaffold-infra.md) | Pending |
| 2 | [Schema PostgreSQL và migration](./phase-02-database-schema-migrations.md) | Pending |
| 3 | [API nền tảng, đăng nhập, quản trị quán/món/QR](./phase-03-api-platform-auth-admin.md) | Pending |
| 4 | [API đặt đơn, máy trạng thái, scheduler](./phase-04-api-ordering-state-machine.md) | Pending |
| 5 | [API outbox thông báo, VietQR, báo cáo](./phase-05-api-notifications-vietqr-reports.md) | Pending |
| 6 | [Web trang khách: menu, giỏ, trạng thái đơn](./phase-06-web-customer-ordering.md) | Pending |
| 7 | [Web màn người bán: đăng nhập, bảng đơn, chuông, VietQR](./phase-07-web-seller-order-board.md) | Pending |
| 8 | [Web quản trị: món, quán, bàn/QR, cài đặt, báo cáo](./phase-08-web-admin-reports.md) | Pending |
| 9 | [Tích hợp, E2E, docs, compose production](./phase-09-integration-e2e-docs.md) | Pending |

## Dependencies

```text
P1 ─► P2 ─► P3 ─► P4 ─► P5 ─► P7 ─► P9
                  │           └──► P8 ─┘
                  └──► P6 (bắt đầu skeleton sau P3, cần P4 để chạy thật) ─► P9
```

- Hai làn song song sau P3: làn API (P4 → P5) và làn web khách (P6, mock bằng hợp đồng trong `architecture.md` tới khi P4 xong).
- P7 và P8 song song với nhau sau P5 (file ownership rời nhau: `features/seller-*` vs `features/admin-*`).
- Dịch vụ notifier (ngoài plan) chỉ cần P5 xong để tích hợp.

## Success Criteria

- [ ] `make test` (Go unit + integration với Postgres) và `pnpm test` (vitest) xanh; `make build` tạo image api và web.
- [ ] Kịch bản E2E phase 9 chạy xanh: quét mã → đặt → nhận → mang ra → thu tiền → báo cáo hoa hồng khớp; kịch bản chặn `/ws` vẫn xanh qua fallback polling.
- [ ] Mọi tiêu chí nghiệm thu P0-1 → P0-11 trong `prd.md` được đánh dấu "có test hoặc checklist tay" trong `docs/acceptance-p0.md` (phase 9).
- [ ] Route khách build ≤ 120 KB gzip JS; Lighthouse mobile "Slow 4G" LCP ≤ 2.5s trên `/t/:token`.
- [ ] Không có secret trong repo; `.env.example` đầy đủ biến theo `architecture.md §7`.

## Risk Register

| Rủi ro | Dấu hiệu | Ứng phó đã chốt |
|--------|----------|-----------------|
| Bundle route khách vượt ngân sách vì shadcn/Tailwind | `vite build` report > 120 KB gzip | Tách app khách (A2); route khách chỉ dùng 4 primitive shadcn |
| Trình duyệt nhúng Zalo chặn `localStorage`/âm thanh autoplay | `client_id` đổi mỗi lần; chuông không kêu | Fallback cookie; chuông yêu cầu một chạm "Bật âm" trên màn người bán (P7) |
| Hai người bán bấm cùng lúc | 409 xuất hiện trong log | Conditional update (A5) + UI reload đơn khi 409 |
| Đồng hồ máy khách lệch → cảnh báo "quá 60 giây" sai | Cảnh báo hiện ngay sau khi đặt | Tính 60s/5 phút theo `server_time` trả về (P6) |
| Scheduler và seller cùng chuyển một đơn `sent` | 409 ở scheduler | Scheduler cũng dùng conditional update; thua thì bỏ qua |
| WebSocket không nối được (webview Zalo, proxy, 4G) | Log client `ws_fallback`; banner vàng trên màn người bán | Fallback polling 15s; nếu > 30% phiên khách fallback thì hạ còn 5s (một hằng số) |
| Socket màn người bán bị cắt im lặng sau nhiều giờ | Không nhận đơn mới dù API sống | Ping/pong 30s/60s, reconnect + resync `updated_after` |
| Notifier chết lặng | `notifier_heartbeat.last_seen_at` > 90s | Màn người bán hiện cảnh báo đỏ, chuông vẫn là kênh chính |
| Không còn trigger, UPDATE tay qua `psql` có thể sửa đơn `paid` | Đơn `paid` đổi mà `order_events` không có event tương ứng | Runbook cấm sửa tay `orders`; điều chỉnh tiền đi qua `adjustments`; thêm lại trigger chỉ là một migration nếu cần (A14) |

## Red Team Review

Tự review theo 4 lăng kính (Assumptions, Failure, Scope, Security) trên bản nháp; kết quả đã được đưa thẳng vào phase.

| # | Lăng kính | Phát hiện | Xử lý |
|---|-----------|-----------|-------|
| R1 | Failure | Idempotency chỉ bằng UNIQUE sẽ trả 500 cho request thứ hai nếu không bắt lỗi conflict | P4: `INSERT ... ON CONFLICT DO NOTHING` + SELECT lại, test song song 10 goroutine |
| R2 | Failure | Khách huỷ đơn bằng URL đoán được | Order id là UUIDv4 và cancel đòi `X-Client-Id` khớp (P4) |
| R3 | Security | Guard bất biến đơn `paid` chặn luôn việc xoá SĐT sau 90 ngày | `orders.Writer.ClearCustomerPhone` là phương thức riêng chỉ set `customer_phone` (P2). Ban đầu là trigger; đã chuyển lên tầng ứng dụng theo quyết định user 01/10/2026 (A14) |
| R4 | Assumptions | "Ngoài giờ bán" tính theo UTC trên VPS sẽ sai nửa ngày | Mọi tính toán ngày/giờ theo `APP_TZ` qua `platform/clock` (P3/P4) |
| R5 | Scope | Server ảnh QR kèm chữ kéo thêm font rendering vào Go | Render ở web (A7) |
| R6 | Security | Endpoint nội bộ cho notifier lộ SĐT khách nếu không có token | Bearer `NOTIFIER_TOKEN`, so sánh constant-time, chỉ bind qua mạng docker (P5) |
| R7 | Failure | Polling 3s từ nhiều tab người bán làm DB nặng | Query `updated_after` dùng index `orders(updated_at)`; chấp nhận với 1–3 tab |
| R8 | Assumptions | Hoa hồng tính lại mỗi lần báo cáo sẽ sai khi đổi tỷ lệ | Lưu `commission_rate` + `commission_amount` lúc `paid` (A10, P4); báo cáo chỉ SUM |
| R9 | Scope | Export "ảnh" cho chủ quán cần thêm html2canvas | PRD cho phép "ảnh hoặc văn bản"; chọn text + nút sao chép (P8) |
| R10 | Failure | Mất `Idempotency-Key` khi reload trang giữa chừng tạo 2 đơn | Key lưu `sessionStorage` khi bắt đầu submit, xoá khi 2xx (P6) |
| R11 | Failure | Publish WebSocket bên trong transaction làm client thấy trạng thái chưa commit hoặc đã rollback | Publish chỉ sau commit; client luôn resync bằng REST khi reconnect (P4, A1) |
| R12 | Failure | WebSocket bị chặn ở webview Zalo/4G làm trang khách "đứng" | Fallback polling 15s tự bật; E2E `realtime-fallback` (P6, P9) |
| R13 | Security | MD5 cho mật khẩu người bán crack được ngay nếu env rò rỉ | Quyết định user (Validation 1); ghi cảnh báo A4, rate limit, mật khẩu ≥ 16 ký tự, `VerifyPassword` tách riêng để đổi sang bcrypt (P3, P9 runbook) |
| R14 | Security | WS seller nhận cookie từ origin lạ (cross-site WebSocket hijacking) | Kiểm tra `Origin` khớp `PUBLIC_BASE_URL` khi upgrade (P3) |

### Whole-Plan Consistency Sweep

Đã rà `plan.md`, `architecture.md`, 9 phase: tên bảng/cột, mã lỗi, route web và env thống nhất với `architecture.md`. Không còn mâu thuẫn mở.

## Validation Log

### Session 1 — 2026-10-01
**Trigger:** Cổng validation sau khi viết plan (mode `prompt`, 3–8 câu).
**Questions asked:** 4

#### Questions & Answers

1. **[Architecture]** Plan chọn polling (màn người bán 3s, trang khách 5s, menu 10s) thay vì SSE/WebSocket để cập nhật thời gian thực. Giữ quyết định này?
   - Options: Polling (Recommended) | SSE cho màn người bán | WebSocket cả hai phía
   - **Answer:** WebSocket cả hai phía
   - **Rationale:** Đổi A1: hub WebSocket in-process, hai endpoint `/ws/seller` và `/ws/customer`, REST polling 15s chỉ còn là fallback. Thêm `platform/realtime` (P3), publish sau commit (P4/P5), `use-socket` ở web (P6/P7).
2. **[Scope]** Dịch vụ gửi tin Zalo cá nhân hiện nằm ngoài plan; plan chỉ định nghĩa outbox + API nội bộ. Xử lý thế nào?
   - Options: Giữ ngoài plan (Recommended) | Thêm phase 10 cho notifier
   - **Answer:** Giữ ngoài plan
   - **Rationale:** Phạm vi giữ đúng api/web/database; hợp đồng `/internal/notifications/*` là điểm tích hợp.
3. **[Assumptions]** Đăng nhập người bán: một mật khẩu (bcrypt hash trong env) và cookie phiên stateless HMAC, không có bảng user. Đồng ý?
   - Options: Một mật khẩu + cookie HMAC (Recommended) | Bảng users + sessions ngay từ đầu
   - **Answer:** Other
   - **Custom input:** "using md5"
   - **Rationale:** Giữ mô hình một mật khẩu + cookie HMAC; thuật toán băm đổi từ bcrypt sang MD5 theo quyết định user. Plan ghi cảnh báo bảo mật ở A4 và P3, cô lập thuật toán trong `auth.VerifyPassword` để đổi lại bằng một thay đổi.
4. **[Architecture]** Giờ bán của quán: một khung `open_from/open_to` áp dụng mọi ngày. Đủ chưa?
   - Options: Một khung giờ mỗi ngày (Recommended) | Nhiều khung giờ theo thứ trong tuần
   - **Answer:** Nhiều khung giờ theo thứ trong tuần
   - **Rationale:** Cột `partners.open_hours JSONB [{days, from, to}]`, type `partners.OpenHours` với `Contains(now)` (P2/P3), gate dùng type này (P4), `OpenHoursEditor` ở admin (P8).

#### Confirmed Decisions
- Realtime: WebSocket hai phía + fallback polling 15s — theo yêu cầu user; một instance nên hub in-process đủ.
- Notifier Zalo: ngoài plan — đúng phạm vi.
- Mật khẩu: MD5 hex trong env — quyết định user, có cảnh báo và đường đổi sang bcrypt.
- Giờ bán: nhiều khung theo thứ — JSONB, không cần bảng phụ.

#### Action Items
- [x] Cập nhật `architecture.md` A1, A4, §2, §3, §5 (WebSocket), giả định chịu tải.
- [x] Cập nhật phase 1, 2, 3, 4, 5, 6, 7, 8, 9 theo Impact bên dưới.

#### Impact on Phases
- Phase 1: Vite proxy thêm `/ws` với `ws: true`.
- Phase 2: type `OpenHours` JSONB + validate; seed dùng `open_hours`.
- Phase 3: `platform/realtime` hub + 2 endpoint WS; auth MD5 constant-time; partners nhận `open_hours[]`; publish `menu.updated`/`settings.updated`; effort 1.5d → 2d.
- Phase 4: gate dùng `OpenHours.Contains`; publish `order.created/updated` sau commit, kể cả scheduler.
- Phase 5: publish `notifier.status`.
- Phase 6: `use-socket` + fallback polling; tiêu chí ≤ 2s qua WS.
- Phase 7: board nhận WS, resync khi reconnect, banner vàng khi fallback; effort 1.5d → 2d.
- Phase 8: `OpenHoursEditor`; effort 1.5d → 1.75d.
- Phase 9: Caddy `/ws/*`, spec `realtime-fallback`, runbook mục mật khẩu.

### Whole-Plan Consistency Sweep
Sau khi áp dụng: rà toàn bộ file plan tìm `open_from`, `open_to`, `bcrypt`, `poll 3s/5s/10s`, `WithinHours`; mọi chỗ còn lại đều là ngữ cảnh lịch sử trong Validation Log hoặc đã đổi. Không còn mâu thuẫn mở.

### Session 2 — 2026-10-01 14:52
**Trigger:** User yêu cầu sửa plan trực tiếp: bỏ Air cho Go, bỏ trigger PostgreSQL.
**Questions asked:** 0 (chỉ thị rõ, không cần hỏi lại)

#### Decisions
1. **[Tooling]** Không dùng `air`. `make dev` chạy API bằng `go run ./cmd/api`; khởi động lại tay khi đổi code Go. Bỏ `apps/api/.air.toml`.
2. **[Architecture]** Không dùng trigger PostgreSQL. Bất biến đơn `paid` và `updated_at` chuyển sang tầng ứng dụng, giao cho phase 2: `orders.Writer` (đường ghi duy nhất, không DELETE, UPDATE luôn kèm `status = $from` với `$from ≠ paid`), hook GORM chặn đường ORM, `autoUpdateTime` cho `updated_at`. Ghi thành A14 trong `architecture.md`. Trade-off đã nêu rõ: mất chốt chặn ở DB trước UPDATE tay; bù bằng runbook + `adjustments` + `order_events`.

#### Action Items
- [x] `architecture.md`: A9 sửa lý do, A14 mới, §3 bỏ hai đoạn trigger, thêm quy tắc Writer và `updated_at`.
- [x] Phase 1: bỏ `air`, `.air.toml`; `make dev` dùng `go run`.
- [x] Phase 2: thay trigger + test bằng `orders/writer.go` + hook GORM + test; cập nhật Overview, Requirements, Steps, Todo, Success Criteria, Risk; effort 1d → 1.25d.
- [x] Phase 4: create, transition, scheduler, purge gọi qua `orders.Writer`; thêm test đơn `paid` không chuyển được.
- [x] Phase 9: runbook thêm mục "Không sửa tay bảng orders".
- [x] `plan.md`: Goal 3, R3, Risk Register, Validation Log.

#### Impact on Phases
- Phase 1: effort giữ 0.5d.
- Phase 2: effort 1d → 1.25d; tổng plan vẫn 14d (tổng phase trước là 13.75d).
- Phase 4: không đổi effort, đổi đường gọi ghi.
- Phase 9: thêm một mục runbook.

### Whole-Plan Consistency Sweep
Sau session 2: rà toàn bộ file plan tìm `air`, `.air.toml`, `trigger`, `plpgsql`, `CREATE FUNCTION`, `RAISE EXCEPTION`, `tầng DB`; mọi chỗ còn lại là ngữ cảnh lịch sử trong Red Team / Validation Log hoặc chữ "Trigger:" của template log. Không còn mâu thuẫn mở.

<!-- slug: qr-table-ordering-mvp -->
