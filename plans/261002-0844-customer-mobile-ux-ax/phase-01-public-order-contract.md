---
phase: 1
title: "Public order contract"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Public order contract

## Goal

The public order view (`GET /api/orders/{id}`, the cancel response, the create
response and the `order.updated` WebSocket message) gains `menu_path`,
`eta_minutes` and `notify_zalo`. With these, the order page can link back to the
menu (P1), show the expected time (P5) and promise Zalo updates only when they will
arrive.

## Context

- User decision: the menu link comes from the API, not from localStorage, because
  the Zalo in-app browser has its own storage. The phone number stays private.
- `Order.QRToken` already exists (`apps/api/internal/features/orders/model.go:99`).
  `ToPublic` is pure (`dto.go:39`) and is called from create (`service.go:156,158`),
  `GetPublic` (`service.go:176`) and the transition publish (`service.go:301`).
- `eta_minutes` lives in seller settings (`internal/features/settings/model.go:9`),
  and the menu already returns it publicly (`internal/features/menu/service.go:83`).
- `CustomerPhone` is cleared by the recipient purge (`writer_integration_test.go:115`),
  so `notify_zalo` naturally becomes false after the purge.
- The Zalo connection lives in `internal/features/zalo`. A phone number with no
  connected Zalo account sends nothing.

## Requirements

- `menu_path`: the string `"/t/" + url.PathEscape(qr_token)`. It is relative, so the
  web origin resolves it; this works with the split web/API hosts on the homelab.
  It is always present.
- `eta_minutes`: an integer, the seller's current setting at read or publish time.
- `notify_zalo`: a boolean, true only when `customer_phone` is not null **and** a
  Zalo account is connected. If the connection state cannot be read cheaply, fall
  back to `customer_phone != null`, and record that choice in `docs/api.md`.
- The `SellerView` embedding keeps working. The seller already has `qr_token`, so
  the duplicated path is harmless.
- The view never contains `customer_phone`, `client_id` or the raw token as its own
  field.

## Files

- Modify: `apps/api/internal/features/orders/dto.go` (fields and `ToPublic` signature or a builder)
- Modify: `apps/api/internal/features/orders/service.go` (fill `eta_minutes` and `notify_zalo` at all four call sites through one helper)
- Modify: `apps/api/internal/app/router.go` only if the orders service needs a new dependency (a settings or Zalo reader)
- Add tests: `apps/api/internal/features/orders/dto_test.go` (new) and the existing app integration tests that assert the public JSON
- Modify: `docs/api.md` (public view example and field notes)
- Modify: `apps/web/src/shared/api/orders.ts` (`PublicOrder` type)
- Modify: `apps/web/src/mocks/db.ts` and `apps/web/src/mocks/customer-handlers.ts` (mock orders return the new fields)

## Steps

1. Add `MenuPath string`, `EtaMinutes int` and `NotifyZalo bool` to `PublicView`,
   with JSON tags `menu_path`, `eta_minutes` and `notify_zalo`.
2. Keep `ToPublic(o)` pure for `menu_path`. Add a service helper
   `s.publicView(ctx, o)` that sets `EtaMinutes` and `NotifyZalo`. Use it at every
   place that currently calls `ToPublic` for customers, including both
   `hub.Publish` calls.
3. Read the ETA and the Zalo connection through existing packages: the settings
   repository and the Zalo service or repository. Do not add raw SQL in `orders`,
   because the writer rule covers only the `orders` table. Inject a small interface
   into `NewService` if needed, and wire it in `internal/app/router.go`.
4. Unit test `ToPublic` for `menu_path` escaping. Unit test the helper with fake
   readers for the cases phone + connected, phone + disconnected, and no phone.
5. Update `docs/api.md` §`GET /api/orders/{id}` with the three fields and a
   one-line privacy note.
6. Update `PublicOrder` in the web types and the MSW mock (token `DEVTEST001`,
   ETA 7, `notify_zalo` true when the mock order has a phone).

## Todo

- [x] Add the fields to `PublicView` and fill them through one helper
- [x] Wire the readers and pass all existing orders tests
- [x] Add unit tests for the menu path, ETA and the three Zalo cases
- [x] Update `docs/api.md`
- [x] Update the web `PublicOrder` type and the MSW mocks

## Verification

- `cd apps/api && make test` passes (unit; integration too when `TEST_DATABASE_URL` is set).
- `cd apps/api && go vet ./...` and `make lint` (Go part) pass.
- `cd apps/web && pnpm typecheck` passes.
- `curl -s localhost:8080/api/orders/<id> -H 'X-Client-Id: …'` in dev shows the
  three fields and no `customer_phone`.

## Risks

- **A settings read on every publish adds a query per transition.** This is
  acceptable at single-seller scale. Read the ETA inside the existing transaction
  where one is open.
- **Exposing `menu_path`.** Anyone holding the order link can reach the table menu.
  This was accepted because the token is printed on the table. A revoked token
  still lands on `/revoked`, which phase 4 gives a next step.
- **Rollback:** the fields are additive. Older web bundles ignore them, so reverting
  the commit is safe.
