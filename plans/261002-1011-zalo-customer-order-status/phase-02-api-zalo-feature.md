---
phase: 2
title: "Feature zalo: liên kết QR, phiên, gửi tin theo SĐT"
status: completed
priority: P1
effort: "7h"
dependencies: [1]
---

# Phase 2: Feature `zalo` — liên kết QR, phiên, gửi tin theo SĐT

## Goal
Người bán (đã đăng nhập) liên kết / xem / ngắt Zalo qua HTTP; service có `SendToPhone(ctx, phone, text)` dùng được cho worker ở phase 3.

## Thích nghi từ teka
| teka | sidecup |
|---|---|
| Khoá theo `teacherID uuid` khắp nơi | Singleton: bỏ tham số teacher. `SessionCache` thành một slot + bộ đếm eviction; `LinkManager` giữ một attempt hiện hành |
| `authctx.Scope`, `apperror`, `response`, `validation` | `middleware.SellerAuth` (group `/api/seller`), `apperr`, `httpx.OK/Fail`, `httpx` bind |
| `LookupPhone` chỉ trả bạn bè | `SendToPhone` gửi cho cả người lạ (PRD P0-11) |
| `MatchFriends`, `ListFriends`, `SendRequest`, routes friends | Bỏ (non-goal) |
| `zalo_accounts` + gorm soft delete | `zalo_account` id=1, xoá cứng |

## Files (tất cả trong `apps/api/internal/features/zalo/`)
- `model.go` — `Account` (TableName `zalo_account`), hằng `StatusLinked/StatusExpired`.
- `errors.go` — `ErrNotLinked`, `ErrLinkExpired`, `ErrLinkNotFound`, `ErrConsentRequired`, `ErrRecipientNotFound`, `ErrNotConfigured`.
- `repository.go` — `Get`, `Upsert` (ON CONFLICT (id) DO UPDATE), `Delete`, `UpdateStatus`, `MarkVerified`.
- `session_cache.go`, `link_manager.go`, `health_probe.go` — port, bỏ khoá teacher.
- `service.go` — `StartLink(consentVersion)`, `LinkStatus(id)`, `Status(ctx)`, `Unlink(ctx)`, `VerifyAccount(ctx)`, `SessionHealthy(ctx) (bool, string)` (đọc DB, không gọi Zalo — cho heartbeat; chỉ trả `false` khi hàng `zalo_account` có `status = expired`, chưa liên kết vẫn là `true`), `SendToPhone(ctx, phone, text) (msgID string, err error)`, `StartHealthProbe`, `Close`. Giữ nguyên `sessionFor`, `expire`, `expireIfLoggedOut`, `recordHealthy`, `openCredentials`, `persistLink` (gồm bước relogin để lấy service map).
- Callback `OnStatusChange func(ctx context.Context)` truyền vào service, gọi sau mỗi lần `expire`, `persistLink` thành công và `Unlink` — router nối nó với heartbeat + `notifications.PublishStatus(ctx, true)` để banner bật/tắt ngay qua WebSocket thay vì chờ chu kỳ 30 giây.
- `uid_cache.go` — cache phone→uid trong bộ nhớ: dương 24h, âm 1h, tối đa 1000 mục (xoá mục cũ nhất khi đầy). `Unlink` và link mới xoá sạch cache (uid có thể khác giữa các tài khoản gửi).
- `dto.go`, `handler.go`, `routes.go` — `RegisterSeller(g *gin.RouterGroup)`.
- Tests: `service_test.go`, `link_manager_test.go`, `health_probe_test.go`, `uid_cache_test.go`, `handler_test.go` — port test teka tương ứng, dùng fake `LoginFunc/ReloginFunc/SendFunc/FindUserFunc`; không test nào gọi Zalo thật. `repository_integration_test.go` (build tag `integration`).
- Modify: `apps/api/internal/app/router.go` — dựng `zalo.Service` khi `cfg.ZaloEnabled()` (cipher từ `secrets.New([]byte(cfg.ZaloCredentialKey))`), luôn đăng ký route; khi tắt, handler trả 503. `App` thêm field `Zalo *zalo.Service` (nil khi tắt).
- Modify: `apps/api/cmd/api/main.go` — khi `a.Zalo != nil`: `a.Zalo.StartHealthProbe(gctx, …)`; trong goroutine shutdown gọi `a.Zalo.Close()` sau `srv.Shutdown`.

## `SendToPhone`
1. `phone` đã chuẩn hoá dạng `0xxxxxxxxx` (orders lưu như vậy). Đổi sang dạng wire `84xxxxxxxxx` (Zalo chỉ resolve dạng có mã nước).
2. `sessionFor` → `ErrNotLinked`/`ErrLinkExpired` nếu không có phiên.
3. Tra `uid_cache`; miss → `findUser(sess, []string{wire})`; không có hoặc `UID == ""` → cache âm, trả `ErrRecipientNotFound`.
4. `send(sess, uid, text)`; lỗi đi qua `expireIfLoggedOut`.
5. Không log SĐT hay uid; chỉ log kết quả và thời lượng.

## HTTP (sau `SellerAuth`)
| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | `/api/seller/zalo` | — | `{configured, linked, status, display_name, linked_at}` |
| POST | `/api/seller/zalo/link` | `{consent_version}` (bắt buộc) | 202 `{link_id}` |
| GET | `/api/seller/zalo/link/:id` | — | `{link_id, state, qr_png_base64?, display_name?, failure?}`; id lạ → 404 `ZALO_LINK_NOT_FOUND` |
| DELETE | `/api/seller/zalo` | — | 204, idempotent |

Khi tắt: GET trả `{configured:false}` (200, để card render được); các route khác 503 `ZALO_NOT_CONFIGURED` "Chưa cấu hình Zalo trên máy chủ". Lỗi map: `ErrLinkExpired` → 409 `ZALO_EXPIRED`, `ErrNotLinked` → 409 `ZALO_NOT_LINKED`. Không response nào chứa credentials.

## Verification
- `go test -race ./internal/features/zalo/...` — gồm: race unlink trong lúc relogin không giữ lại phiên; relogin bị từ chối → `expired`; send trả code -3 → `expired` + `ErrLinkExpired`; SĐT không resolve → `ErrRecipientNotFound` và lần thứ hai không gọi `findUser`; credentials không đọc được (đổi key) → `expired`.
- `make test-integration` — repository upsert/delete/status.
- Thủ công (dev, có key): `curl` GET status → POST link → poll đến `qr_ready`, quét QR → `linked`.
