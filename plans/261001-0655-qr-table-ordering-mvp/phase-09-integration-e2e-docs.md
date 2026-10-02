---
title: "Phase 9: Tích hợp, E2E, docs, compose production"
status: todo
priority: P1
effort: 1d
dependencies: [6, 7, 8]
---

# Phase 9: Tích hợp, E2E, docs, compose production

## Context Links

- [plan.md §Success Criteria](./plan.md#success-criteria), [architecture.md §2, §5, §7](./architecture.md)
- PRD: §Yêu cầu bắt buộc (P0-1 → P0-11) làm checklist nghiệm thu; §Lộ trình "Cổng 2: nghiệm thu đủ P0"; §Yêu cầu phi chức năng (bảo mật, dữ liệu cá nhân)

## Overview

Chốt cổng 2 của PRD: E2E Playwright cho luồng chính và các nhánh, checklist nghiệm thu P0 có bằng chứng, docs kỹ thuật tối thiểu để một người vận hành, compose production chạy được trên một VPS với reverse proxy.

## Key Insights

- E2E chạy trên compose `full` profile (postgres + api + web build) với seed; Playwright điều khiển hai context: khách (mobile viewport, `X-Client-Id` tự nhiên qua app) và người bán (desktop, đăng nhập).
- Nhánh cần phủ ngoài luồng chính: từ chối; khách huỷ khi `sent`; món hết khi đang trong giỏ; tạm ngưng; mã thu hồi; bấm đặt hai lần. Không thêm endpoint test-only để chỉnh đồng hồ: tự huỷ sau 5 phút đã được chứng minh bằng integration test Go với `FakeClock` (phase 4); prompt "quá 60 giây" được E2E kiểm tra bằng cách seed một đơn `sent` có `created_at = now() - 70s` qua SQL trước khi mở trang.
- Reverse proxy production: Caddy (TLS tự động) → `web` (nginx tĩnh), `/api/*` và `/ws/*` → `api:8080` (Caddy tự nâng cấp WebSocket, không cần cấu hình thêm; đặt `transport http { read_timeout 0 }` cho `/ws/*` để không cắt kết nối dài); **không** route `/internal/*` ra ngoài; notifier gọi thẳng `api:8080` trong mạng docker.
- Docs: `docs/README.md` (chạy dev, cấu trúc, lệnh), `docs/api.md` (sinh từ `architecture.md §5`, cập nhật theo code thật), `docs/runbook.md` (deploy, migrate, xoay `SESSION_SECRET`, đổi mật khẩu, backup thủ công `pg_dump`, khi notifier chết), `docs/acceptance-p0.md` (bảng P0-1 → P0-11, từng tiêu chí → test tự động hoặc bước tay + kết quả).

## Requirements

- [x] Playwright (`apps/web/e2e/`): `happy-path.spec.ts` (quét → đặt → nhận → mang ra → thu tiền mặt → báo cáo tăng 1 đơn, hoa hồng đúng), `reject.spec.ts`, `customer-cancel.spec.ts`, `unavailable-product.spec.ts` (tắt món khi đang trong giỏ), `paused.spec.ts`, `revoked-qr.spec.ts`, `idempotent-double-submit.spec.ts` (bấm nhanh 2 lần), `unconfirmed-prompt.spec.ts` (seed đơn 70s), `realtime-fallback.spec.ts` (chặn `/ws` bằng `page.route` → trang khách và màn người bán vẫn cập nhật qua polling).
- [x] `infra/docker-compose.prod.yml`: `postgres` (volume, không publish port), `api` (env từ `.env`, `MIGRATE_ON_START=true`, healthcheck `/readyz`, restart always, không publish port), `web` (nginx), `caddy` (80/443, volume cert); `infra/caddy/Caddyfile` với `handle /api/*` → api, `handle /internal/*` → `respond 404`, còn lại → web.
- [x] `apps/web/nginx.conf`: gzip, cache tĩnh có hash 1 năm, `index.html` no-cache, SPA fallback.
- [x] Role DB cho API trong prod: migration chạy bằng role owner lúc khởi động; để đơn giản v1 dùng cùng role nhưng `docs/runbook.md` ghi rõ cách tách khi cần. (Giữ KISS; ghi nhận.)
- [x] `docs/README.md`, `docs/api.md` (REST + WebSocket), `docs/runbook.md` (kèm mục "Mật khẩu người bán": yêu cầu ≥ 16 ký tự ngẫu nhiên vì hash là MD5, cách tạo hash, cách chuyển sang bcrypt; mục "Không sửa tay bảng orders": bất biến đơn `paid` nằm ở tầng ứng dụng, DB không có trigger (A14), mọi điều chỉnh tiền đi qua `adjustments`, cách thêm trigger bằng migration nếu cần chốt chặn DB), `docs/acceptance-p0.md` theo Key Insights.
- [x] CI: thêm job `e2e` chạy compose + Playwright (chromium + webkit mobile emulation).
- [ ] Kiểm tra tay cuối: checklist 3 trình duyệt (Safari iOS, Chrome Android, webview Zalo) cho trang khách; màn người bán trên iPad/laptop; thời gian mở trang khách trên 4G thật (ghi số vào `acceptance-p0.md`).
- [x] Rà bảo mật nhanh: `gitleaks` hoặc `git secrets` trong CI; header bảo mật ở Caddy (`X-Content-Type-Options`, `Referrer-Policy`, CSP cơ bản cho SPA); cookie `Secure` bật ở prod.

## Architecture

```text
Internet → Caddy :443
   ├── /api/*       → api:8080 (Gin)
   ├── /ws/*        → api:8080 (WebSocket upgrade)
   ├── /internal/*  → 404
   └── /*           → web:80 (nginx, SPA)
notifier (ngoài plan) → api:8080/internal/* (mạng docker nội bộ, bearer token)
api → postgres:5432
```

## Related Code Files

Create:
- `apps/web/e2e/*.spec.ts`, `apps/web/e2e/fixtures.ts` (login helper, seed helper qua `psql` trong container), `apps/web/playwright.config.ts`
- `infra/docker-compose.prod.yml`, `infra/caddy/Caddyfile`, `infra/.env.example`
- `docs/README.md`, `docs/api.md`, `docs/runbook.md`, `docs/acceptance-p0.md`
- `.github/workflows/e2e.yml`

Modify:
- `apps/web/nginx.conf`, `infra/docker-compose.yml` (profile `full`), root `Makefile` (`e2e`, `prod-up`), `README.md` root (trỏ sang `docs/`)

## Implementation Steps

1. Compose `full` profile + Makefile `e2e`; seed chạy sau migrate.
2. Playwright config (hai project: `customer-mobile` iPhone 13 viewport, `seller-desktop`), fixtures.
3. Viết spec theo Requirements; spec chạy độc lập (mỗi spec tạo bàn/token riêng qua API seller để không đụng nhau).
4. Compose prod + Caddyfile + nginx; thử trên máy local với `localhost` TLS nội bộ của Caddy.
5. Docs bốn file; `acceptance-p0.md` điền kết quả thật.
6. CI e2e; gitleaks.
7. Chạy checklist tay, ghi số đo.

## Todo

- [x] compose full + e2e target
- [x] 8 spec Playwright xanh local
- [x] compose prod + Caddy + nginx chạy được
- [x] docs 4 file
- [x] CI e2e + gitleaks
- [ ] checklist tay 3 trình duyệt + số đo 4G

## Success Criteria

- `make e2e` xanh trên máy sạch (chỉ cần Docker + Node).
- `docker compose -f infra/docker-compose.prod.yml up -d` trên VPS thử → mở `https://<domain>/t/<token>` đặt được đơn; `https://<domain>/internal/notifications/pending` trả 404.
- `docs/acceptance-p0.md` không còn dòng nào trống; mọi tiêu chí P0 có "Tự động: <spec/test>" hoặc "Tay: <kết quả, ngày>".
- CI toàn bộ xanh.

## Risk Assessment

- E2E phụ thuộc thời gian (WS vài trăm ms, fallback 15s) dễ flaky: dùng `expect.poll` với timeout 20s, không `waitForTimeout` cố định.
- WebKit trong Playwright không phải Safari thật: vẫn cần checklist tay trên thiết bị thật.

## Security Considerations

- `/internal` không ra Internet; `NOTIFIER_TOKEN` chỉ trong `.env` trên VPS.
- Backup `pg_dump` ra ngoài VPS là bước vận hành ngoài plan, nhưng runbook ghi lệnh và lịch đề xuất (PRD yêu cầu hằng ngày).

## Next Steps

Qua cổng 2 → chạy thử 2 tuần theo PRD; dữ liệu phễu từ `/seller/reports` phục vụ cổng 3.
