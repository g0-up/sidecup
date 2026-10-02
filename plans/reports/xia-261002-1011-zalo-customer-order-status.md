# Xia: Zalo cá nhân gửi trạng thái đơn cho khách (port từ teka)

## Source manifest
- Repo: github.com/0pen-future/teka (user là admin repo; không có file LICENSE)
- Ref: master @ 4b33e6e06e1fc12fc681f27bb37d552eba022656
- Phạm vi: `apps/api/internal/features/zalo/**`, `apps/api/internal/shared/secrets/secrets.go`, `apps/api/migrations/000004_zalo_accounts.*`, `apps/web/src/features/profile/{api,components,hooks,schemas}/zalo*`
- Gói `zalo/protocol` port từ zcago (MIT, github.com/amrakk/zcago) — phải giữ ghi công trong `doc.go`.
- Mode: `--port` (stack gần trùng: Go + gin + gorm + pgx + golang-migrate + slog; web khác UI kit: teka dùng `@/components/hv`, sidecup dùng shadcn `shared/ui`).

## Yêu cầu user
1. Người bán liên kết Zalo cá nhân trong menu "Cài đặt".
2. Khi người bán đổi trạng thái đơn, khách nhận tin Zalo.
3. Khách không nhập SĐT thì không gửi (SĐT trở thành tuỳ chọn — lệch PRD P0-11 đang ghi "bắt buộc").
4. Đã chốt: worker chỉ xử lý `customer_status`; `seller_new_order` giữ nguyên pending (ngoài phạm vi).

## Source anatomy (teka)
| Thành phần | File | Vai trò |
|---|---|---|
| protocol | `protocol/{auth,client,config,crypto,contacts,send,models,errors,doc}.go` (~1.7k LOC + test) | Client không chính thức: LoginQR, LoginWithCredentials, FindUser (phone→uid, cần dạng 84…), SendMessage, FetchFriends, SendFriendRequest. Cách ly, không import gì của teka. `ErrCodeNotLoggedIn = -3`. |
| service | `service.go` | sessionFor (cache → giải mã creds → relogin → PutUnlessEvicted), expire/recordHealthy, SendDM, MatchFriends (chuẩn hoá SĐT, chunk 30, pace 1–3s), persistLink (seal + relogin để lấy service map). |
| link_manager | `link_manager.go` | Phiên QR chạy nền theo teacher: pending→qr_ready→scanned→confirmed→linked/expired/error, TTL 105s, retention 2m, Cancel/Close đợi goroutine. |
| session_cache | `session_cache.go` | Cache phiên + bộ đếm eviction chống race unlink/relogin. |
| health_probe | `health_probe.go` | Mỗi 15m ± jitter verify creds, đánh dấu expired. |
| repository/model | `repository.go`, `model.go`, migration 000004 | `zalo_accounts` (PK teacher_id, encrypted_credentials BYTEA, zalo_uid, display_name, status linked/expired, consent_version/at, linked_at, last_verified_at). |
| handler/routes | `handler.go`, `routes.go`, `dto.go` | `GET/DELETE /me/zalo`, `POST /me/zalo/link/start {consent_version}`, `GET /me/zalo/link/status?id=` (QR PNG base64). |
| secrets | `shared/secrets/secrets.go` | AES-256-GCM, key ≥32 byte, sha256 derive, nonce prefix. |
| web | `zalo-connect-card.tsx`, `zalo-link-modal.tsx`, `use-zalo.ts`, `zalo-api.ts`, `zalo-schemas.ts` | Card trạng thái + modal: bước đồng ý → QR → polling đến trạng thái kết thúc, dừng sau N lỗi polling. |

## Local map (sidecup)
- Outbox đã có: `notification_outbox` (kind seller_new_order|customer_status, recipient, payload jsonb, status pending|sent|failed, attempts, next_attempt_at). Enqueue trong transaction đổi trạng thái: `internal/features/orders/service.go:276` — đã bỏ qua khi `customer_phone` rỗng. `notifiesCustomer` ở `orders/statemachine.go:67` (accepted, delivering, paid, rejected, cancelled do timeout).
- `notifications.Service` (`internal/features/notifications/service.go`): `Claim(ctx, limit)` (FOR UPDATE SKIP LOCKED + khoá mềm 60s), `Ack` (backoff, attempts>=3 → failed), `Heartbeat(sessionOK, msg)`, `Status` (healthy = heartbeat < 90s && session_ok; alert khi failed_last_hour > 0), `Monitor`. API `/internal/*` cho notifier bên ngoài (chưa tồn tại).
- Màn người bán đã có `notifier-banner.tsx` đọc `notifier.status`.
- SĐT: API `orders/dto.go:79` `validate:"required"`, `NormalizePhone` ở `orders/service.go:59`, insert luôn `&phone` (`service.go:123`). Web `customer-menu/components/cart-sheet.tsx` chặn đặt khi SĐT sai/rỗng; `shared/lib/phone.ts`.
- Cài đặt: `apps/web/src/features/admin-settings/page.tsx` (Card + TanStack Query + `shared/api/http.ts`).
- Một người bán / deployment (`settings id=1`, session cookie không có seller id). Wiring: `internal/app/router.go`, goroutine nền ở `cmd/api/main.go:107` (errgroup), config `internal/platform/config/config.go` (caarlos0/env).
- Chưa có mã hoá at-rest.

## Dependency matrix
| Source | Local | Trạng thái |
|---|---|---|
| protocol package | — | NEW (chép gần nguyên văn, đổi tên module) |
| shared/secrets | — | NEW (`internal/platform/secrets`) |
| zalo_accounts per teacher | singleton | CONFLICT → bảng `zalo_account (id smallint pk check id=1)` |
| authctx.Scope / apperror / response / validation | middleware.SellerAuth / apperr / httpx | EXISTS (đổi helper) |
| Notification runs + friend mapping | outbox + claim/ack có sẵn | CONFLICT → bỏ runs/mapping, dùng outbox |
| LookupPhone (chỉ bạn bè) | khách là người lạ | CONFLICT → FindUser + gửi cho người lạ, cache phone→uid trong bộ nhớ |
| Health probe | notifier_heartbeat + banner | EXISTS → worker ghi heartbeat |
| Web HV components | shadcn shared/ui | CONFLICT → viết lại |

## Decision matrix
| Quyết định | Source | Local | Đề xuất |
|---|---|---|---|
| Nơi chạy | API in-process | Notifier ngoài (chưa có) | In-process: `features/zalo` + worker lấy outbox; giữ `/internal/*` |
| Người nhận | Bạn bè | Người lạ theo SĐT | FindUser (84…) → SendMessage; cache uid TTL trong bộ nhớ, không lưu DB |
| Lưu creds | AES-GCM theo teacher | — | Singleton, `ZALO_CREDENTIAL_KEY` ≥32 byte; thiếu key → tính năng tắt (endpoint 503, worker không chạy) |
| Lỗi người nhận (không có Zalo, chặn người lạ) | — | Ack fail → retry 3 lần → failed | `AckPermanent` → `failed` ngay, không retry. Không cần trạng thái mới: `failed_last_hour` chỉ đếm `seller_new_order` nên banner không đỏ |
| Phiên chết (-3 / relogin fail) | expire | — | Đánh dấu expired, nhả item về pending (không tăng attempts), heartbeat session_ok=false → banner đỏ |
| Claim | — | Claim mọi kind | Thêm lọc theo kind; worker chỉ lấy `customer_status` |
| Nhịp gửi | pace 1–3s cho lookup | — | Một item mỗi lần, nghỉ 1–3s jitter giữa các lần gửi |
| SĐT khách | — | Bắt buộc | Tuỳ chọn ở API + web; rỗng → `customer_phone NULL`; cập nhật PRD P0-11 |
| Đồng ý | consent_version | — | Giữ checkbox đồng ý + lưu consent_version |
| Health probe | 15m | — | Port, cùng nhịp |

## Rủi ro
- Vận hành CAO: protocol không chính thức, nhắn người lạ dễ bị Zalo hạn chế/khoá (PRD đã chấp nhận); FindUser có hạn mức không công bố; Zalo đổi wire format thì vỡ.
- Code TRUNG BÌNH: stack trùng; điểm khó là race unlink/relogin (đã có lời giải ở session_cache) và vòng đời goroutine khi shutdown.
- Bảo mật: creds = chiếm quyền tài khoản; không log, không trả về API; SĐT không vào log.
- Một instance (A1): session cache/link manager in-memory chỉ đúng khi 1 replica.

## Non-goals
- `seller_new_order` qua Zalo; danh sách bạn bè, gửi lời mời kết bạn; notification runs; Zalo OA/ZNS; gỡ `/internal/*`.

## Cập nhật sau phản hồi (02/10/2026)
- Banner đỏ chỉ hiện khi phiên Zalo hết hạn, kèm câu hướng dẫn và link tới Cài đặt; chưa cấu hình hay chưa liên kết thì không đỏ.
- Tin báo đơn mới cho người bán (P0-5) chưa làm.
