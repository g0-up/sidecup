---
title: "Triển khai homelab sau Traefik: overlay compose"
date: 2026-10-02
summary: "Thêm infra/docker-compose.homelab.yml theo mẫu teka; web và api hai hostname, Traefik thay Caddy, DB không map cổng; kiểm thật qua Traefik đang chạy rồi dọn sạch"
---

# Triển khai homelab sau Traefik: overlay compose

**Date**: 2026-10-02 12:00
**Severity**: Low
**Component**: `infra/`, `Makefile`, `apps/web` (API origin lúc build), `docs/runbook.md`
**Status**: Resolved — đã deploy homelab 2026-10-02 13:23, kiểm qua hostname thật: login, `/api/seller/me`, WebSocket 101 (origin lạ 403), không cổng nào map ra host

## What happened
- Plan `plans/261002-1149-homelab-traefik-deployment/plan.md`: overlay ghép sau `infra/docker-compose.prod.yml`, tắt Caddy bằng profile, gắn label Traefik (entrypoint `web`, mạng ngoài `homelab`), thêm `make homelab-config | homelab-up | homelab-down`.
- Bản đầu dùng một hostname; người dùng chốt hai hostname như teka: web `sidecup.cauchuyenlaptrinh.com`, api `sidecup-api.cauchuyenlaptrinh.com`. Web vốn gọi `/api`, `/ws` cùng origin nên thêm `VITE_API_ORIGIN` lúc build (rỗng = hành vi cũ cho dev, VPS, E2E), `credentials: "include"`, CSP `connect-src` mở cho hostname api, API bật `CORS_ORIGINS` cho hostname web.
- Database (và api, web) bị ép `ports: !reset []` trong overlay: không map cổng ra host kể cả khi file gốc đổi sau này.

## Bài học
- Mạng `homelab` dùng chung đã có hai container alias `api` và hai alias `web` (teka, loc-monitoring). Postgres được thêm alias `sidecup-postgres` và `DATABASE_URL` của overlay trỏ vào đó để không bao giờ phân giải nhầm DB của stack khác.
- `profiles` không cứu được biến `:?` trong file gốc: compose nội suy cả service bị tắt, nên `ACME_EMAIL` vẫn bắt buộc. Chọn ghi rõ trong docs thay vì tách Caddy khỏi file prod (giữ nguyên quy trình VPS).
- Traefik chỉ thấy http (TLS ở Cloudflare) nên HSTS cần `forceSTSHeader=true`.
- Traefik hiện chưa có `forwardedHeaders.trustedIPs`: API sẽ thấy IP của cloudflared, rate limit đăng nhập thành dùng chung. Đã ghi vào runbook; không sửa `homelab-infras` (ngoài phạm vi).
- Hai hostname cùng site `cauchuyenlaptrinh.com` nên cookie `SameSite=Lax` host-only của api vẫn đi kèm fetch và WebSocket từ web; không cần đổi cookie.
- Web host phải chặn `/api/`, `/ws/` ở Traefik: nginx.conf còn location proxy tới `api:8080`, mà trên mạng `homelab` tên `api` trỏ cả sang teka và loc-monitoring.
- Hai hostname đã có DNS Cloudflare và đang trả 404 từ Traefik: `make homelab-up` sẽ lên public ngay, nên lần kiểm thử dùng bản sao overlay với hostname `*.localhost`.

## Kiểm chứng
- Stack tạm `-p sidecup-verify`, overlay sao chép với hostname `*.localhost`, gọi qua `traefik:80` trên mạng `homelab`: web 200, web `/api/*`, `/ws/*`, `/internal/*` 404; api `/api/healthz` ok, `/internal*` 404; bundle chứa origin api; preflight CORS từ web 204 có credentials, origin lạ không có header CORS; login trả cookie `Secure`, `/api/seller/me` 200, WebSocket từ web 101, từ origin lạ 403; không container nào map cổng ra host. Đã `down -v --rmi local`.
- Web: 112 test (thêm 5 cho `VITE_API_ORIGIN`), lint, typecheck pass trong container `node:22`.
