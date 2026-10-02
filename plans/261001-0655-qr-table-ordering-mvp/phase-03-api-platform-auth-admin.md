---
title: "Phase 3: API nền tảng, đăng nhập, quản trị quán/món/QR"
status: todo
priority: P1
effort: 2d
dependencies: [2]
---

# Phase 3: API nền tảng, đăng nhập, quản trị quán/món/QR

## Context Links

- [architecture.md §5 Hợp đồng API (Người bán)](./architecture.md#5-hợp-đồng-api), [§7 Env](./architecture.md#7-biến-môi-trường-api), quyết định A4, A12, A13
- PRD: P0-1 (mã QR), P0-10 (trang quản trị), §Bảo mật

## Overview

Dựng lớp platform HTTP (config, middleware, error envelope, validator, clock) và các feature quản trị không có nghiệp vụ trạng thái: `auth`, `settings`, `partners`, `products`, `qrcodes`. Sau phase này người bán đã đăng nhập, tạo được quán, món, bàn và lấy link QR; chưa có đặt đơn.

## Key Insights

- Một mật khẩu, một người bán: không có bảng user. `SELLER_PASSWORD_HASH` là **MD5 hex** của mật khẩu (quyết định của user, xem A4 và cảnh báo kèm theo); so sánh bằng `subtle.ConstantTimeCompare` trên hex. Hàm `auth.VerifyPassword(hash, password) bool` là nơi duy nhất biết thuật toán, để đổi sang bcrypt chỉ sửa một hàm và một biến env. API từ chối khởi động nếu env thiếu, hash không phải 32 hex, hoặc `SESSION_SECRET` < 32 byte.
- WebSocket hub (`platform/realtime`) là hạ tầng dùng chung: `Hub.Publish(topic, msg)`, `Hub.Subscribe(conn, topics...)`; mỗi conn có buffer 32 message, đầy thì đóng conn (client tự reconnect + resync) thay vì chặn publisher. Publisher gọi **sau khi** transaction commit.
- Giờ bán nhiều khung theo thứ: `partners.OpenHours.Contains(now)` (type ở phase 2) xử lý khung qua nửa đêm (`to < from` → thuộc ngày bắt đầu, kéo sang ngày sau); thứ tính theo APP_TZ, ISO 1=Thứ Hai.
- Cookie phiên: payload `{exp, iat, nonce}` base64url + HMAC-SHA256; không cần JWT lib. `Secure` tắt khi `APP_ENV=dev` trên http.
- Token QR: 12 ký tự từ bảng chữ `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (bỏ ký tự dễ nhầm), `crypto/rand`; không chứa thông tin quán/bàn (P0-1). URL = `PUBLIC_BASE_URL + "/t/" + token`.
- `products.sort` để sắp menu; món hết chỉ đổi `available=false`, không xoá (đơn cũ tham chiếu `product_id` trong JSON).

## Requirements

- [x] `platform/config`: struct `Config` từ env (`caarlos0/env`), `Validate()` fail-fast.
- [x] `platform/httpx`: `Error{Code, Message, Details}`, `AbortWithError(c, status, code, msg)`, `BindJSON` bọc `validator/v10` với thông báo tiếng Việt cho các tag thường dùng; map lỗi `ErrNotFound/ErrConflict/ErrValidation` của service → HTTP.
- [x] `platform/middleware`: `RequestID` (header `X-Request-Id`, sinh nếu thiếu), `Logger` (slog JSON: method, path, status, latency, request_id, client_id), `Recover` (500 envelope, log stack), `ClientID` (bắt buộc `X-Client-Id` dạng UUID cho route `/api/t`, `/api/orders`), `RateLimit(keyFn, r, burst)` dựa `x/time/rate` với map có GC, `SellerAuth` (đọc cookie, verify HMAC, hết hạn → 401), `NotifierAuth` (bearer constant-time, phase 5 dùng).
- [x] `platform/clock`: interface `Clock{Now() time.Time; Location() *time.Location}`; `RealClock` dùng `APP_TZ`; `FakeClock` cho test. Hàm `TodayIn(loc)`.
- [x] `platform/realtime`: `Hub` (map topic → set conn, mutex, `Publish`, `Subscribe`, `Unsubscribe`), `Conn` wrapper trên `coder/websocket` (write pump, ping 30s, read deadline 60s), handler `GET /ws/seller` (qua `SellerAuth`) và `GET /ws/customer` (validate `client_id` khớp đơn, `token` active; trả 4401/4403 close code khi sai). Message `{type, data, server_time}`.
- [x] `auth`: `POST /api/seller/login` (rate limit 5/phút/IP, `VerifyPassword` MD5 constant-time, set cookie 30 ngày), `POST /api/seller/logout` (xoá cookie), `GET /api/seller/me` (`{authenticated:true, expires_at}`).
- [x] `settings`: `GET/PUT /api/seller/settings` (validate `eta_minutes` 1..60, `bank_bin` 6 chữ số nếu có, `bank_account` 6..19 chữ số); sau PUT publish `settings.updated` tới `seller` và `menu.updated` tới mọi `menu:*`.
- [x] `partners`: list/create/update; body gồm `name`, `commission_rate` (0..1), `payout_period`, `open_hours[] {days[], from, to}` (validate qua `OpenHours.Validate()`), `active`, `hidden_product_ids[]` (replace toàn bộ trong transaction). Không có delete (chỉ `active=false`). Sau update publish `menu.updated` tới `menu:*` của quán.
- [x] `products`: list/create/update; `PATCH /{id}/availability {available}`; `price` ≥ 0; `has_sweet/has_ice`; `sort`. Không delete. Sau update/availability publish `menu.updated` tới mọi `menu:*`.
- [x] `qrcodes`: `GET /api/seller/partners/{id}/qrcodes` (kèm `url`), `POST` tạo `{table_label}` → `{token, url, table_label}`, `POST /api/seller/qrcodes/{token}/revoke` set `active=false, revoked_at=now()` (idempotent).
- [x] `app/router.go`: nhóm route `/api/seller` với `SellerAuth`; `/api` public với `ClientID`; `/internal` với `NotifierAuth`; `/ws/*`; `/healthz`, `/readyz`.
- [x] Unit test: HMAC cookie round-trip và hết hạn, rate limiter, `VerifyPassword`, `OpenHours.Contains` (nhiều khung, qua nửa đêm, thứ theo APP_TZ), token sinh đúng bảng chữ và độ dài, hub publish/subscribe (conn chậm bị đóng, không chặn publisher). Integration test: login sai/đúng, CRUD partner kèm hidden products + open_hours, tạo/thu hồi QR, WS seller nhận `settings.updated` sau PUT settings.

## Architecture

Handler → Service → Repository trong từng feature; service nhận `clock.Clock` và `*gorm.DB` qua constructor; `app/router.go` là nơi duy nhất wiring. Không dùng DI framework.

## Related Code Files

Create:
- `apps/api/internal/platform/config/config.go`, `config_test.go`
- `apps/api/internal/platform/httpx/errors.go`, `bind.go`, `respond.go`
- `apps/api/internal/platform/middleware/{request_id,logger,recover,client_id,rate_limit,seller_auth,notifier_auth}.go` + test
- `apps/api/internal/platform/clock/clock.go`, `clock_test.go`
- `apps/api/internal/platform/realtime/{hub,conn,message,handler_seller,handler_customer}.go` + `hub_test.go`, `handler_integration_test.go`
- `apps/api/internal/platform/ids/ids.go` (`NewQRToken()`, `NewOrderCode()`), `ids_test.go`
- `apps/api/internal/features/auth/{handler,service,password,session,dto}.go` + test
- `apps/api/internal/features/settings/{handler,service,repository,dto}.go` + test
- `apps/api/internal/features/partners/{handler,service,repository,dto}.go` + test
- `apps/api/internal/features/products/{handler,service,repository,dto}.go` + test
- `apps/api/internal/features/qrcodes/{handler,service,repository,dto}.go` + test
- `apps/api/internal/app/router.go`

Modify:
- `apps/api/cmd/api/main.go` (load config, open db, lắp router, start)
- `apps/api/.env.example`

## Implementation Steps

1. Config + fail-fast validate; `main.go` dừng với thông báo rõ nếu thiếu env.
2. `httpx` error envelope + binder; viết test map tag `required`, `min`, `max`, `uuid`.
3. Middleware theo thứ tự: RequestID → Logger → Recover → (nhóm) ClientID/RateLimit/SellerAuth.
4. Session cookie: `session.Sign(now, ttl, secret)` / `session.Verify(raw, now, secret)`; tên cookie `sc_session`, `Path=/`, `HttpOnly`, `SameSite=Lax`, `Secure` theo env.
5. Feature `auth` → `settings` → `products` → `partners` (hidden products cần products) → `qrcodes`.
6. Repository dùng GORM thường (`Find/Create/Updates`), transaction cho replace hidden products.
7. Router + `readyz` (ping DB với timeout 1s).
8. Test: unit cho platform, integration cho feature với `testdb` của phase 2; dùng `httptest` + router thật.

## Todo

- [x] platform: config, httpx, middleware, clock, ids
- [x] platform/realtime hub + hai endpoint WS + test
- [x] auth login/logout/me + session test
- [x] settings GET/PUT
- [x] products CRUD + availability
- [x] partners CRUD + hidden products
- [x] qrcodes create/list/revoke
- [x] router + readyz
- [x] tests xanh (unit + integration)

## Success Criteria

- `curl -X POST /api/seller/login -d '{"password":"..."}'` set cookie; gọi `/api/seller/me` bằng cookie → 200; không cookie → 401 với envelope chuẩn.
- Tạo partner với `hidden_product_ids`, đọc lại thấy đúng; tạo QR → `url` đúng `PUBLIC_BASE_URL/t/<12 ký tự>`; revoke hai lần vẫn 200.
- Login sai 6 lần trong 1 phút → lần 6 trả 429.
- `go test ./...` và `go test -tags integration ./...` xanh.

## Risk Assessment

- Rate limiter in-memory mất khi restart: chấp nhận (một instance).
- `validator/v10` thông báo tiếng Anh mặc định: map thủ công tại `httpx/bind.go`; test bao phủ các tag dùng.

## Security Considerations

- MD5 cho mật khẩu là quyết định của user, đã ghi cảnh báo ở A4: nếu `.env` rò rỉ thì mật khẩu bị crack gần như tức thì. Runbook (phase 9) yêu cầu mật khẩu ≥ 16 ký tự ngẫu nhiên và hướng dẫn đổi sang bcrypt bằng cách thay `VerifyPassword` + env.
- WS seller xác thực bằng cookie; kiểm tra `Origin` khớp `PUBLIC_BASE_URL` (chống CSWSH). WS customer không có cookie, chỉ dựa `client_id` + UUID đơn.
- So sánh HMAC bằng `hmac.Equal`; bearer notifier và hash mật khẩu bằng `subtle.ConstantTimeCompare`.
- Không log body request login; logger bỏ qua header `Cookie`/`Authorization`.
- `readyz` không lộ chuỗi kết nối.

## Next Steps

Phase 4 thêm `menu` và `orders` trên nền này.
