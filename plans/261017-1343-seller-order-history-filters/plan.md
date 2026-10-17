---
title: "Seller order history with time, status and partner filters"
description: "Add a third tab \"Tất cả đơn\" to the seller \"Đơn\" screen that lists every order with day/week/month stepping, a specific day, a date range, and status and partner filters."
status: completed
priority: P2
effort: 1.5d
branch: master
tags: [frontend, backend, api]
blockedBy: []
blocks: []
created: 2026-10-17
---

# Seller order history with filters

Status: pending · Branch: master · Mode: auto (fast)

## Contract

- **Outcome:** On `/seller` ("Đơn"), the seller opens a third tab "Tất cả đơn" and sees every order (open and closed, any status) for a chosen period, newest first, with "Tải thêm" for long lists. The period is chosen as Ngày, Tuần or Tháng with ‹ › to step back and forward (a specific day is picked from a date input in Ngày mode), or as a Khoảng ngày (from–to). The list can also be narrowed to one status and to one partner (quán).
- **User decisions (2026-10-17):**
  - Add a **third tab**; keep "Đang mở" and "Đã đóng hôm nay" unchanged.
  - Day/week/month have **‹ › stepping**. Week is Monday–Sunday, month is day 1 – last day, all in Asia/Ho_Chi_Minh (`APP_TZ`).
  - An order belongs to the day it was **placed** (`created_at`), whatever its later status.
  - Also filter by **status** and by **partner**. No summary totals row.
- **Constraints:**
  - Extend the existing `GET /api/seller/orders` route with a history mode instead of adding a new route. The `scope` and `updated_after` behaviour the board and resync depend on stays byte-for-byte the same.
  - The server receives only `from`/`to` dates (YYYY-MM-DD, inclusive, ≤ 366 days, same rule and messages as reports); the web computes week/month bounds. Day boundaries come from `APP_TZ` on the server.
  - Keyset pagination on `(created_at DESC, id DESC)`, page size 100, so a busy month never hits the 300-row cap silently.
  - Reuse existing pieces: `reports.ParseRange` logic (moved to `platform/clock` so `orders` does not import `reports`), `todayISO`/`addDays`/`validateRange` from `admin-reports/period.ts`, `listPartners`/`partnersKey`, `SELLER_STATUS_LABEL`, the stacked `Table`, `formatVND`.
  - Seller UI rules from the seller responsive work apply: 44 px touch targets, stacked table under `sm`, Vietnamese copy.
- **Non-goals:** Totals or revenue summary; CSV export; status multi-select; keeping the filter in the URL; changing the "Đã đóng hôm nay" tab; search by order code or phone.
- **Acceptance:**
  1. `GET /api/seller/orders?from=2026-10-01&to=2026-10-31` returns orders whose `created_at` falls in `[2026-10-01 00:00, 2026-11-01 00:00)` Asia/Ho_Chi_Minh, all statuses, newest first, at most 100, plus `next_cursor` (null on the last page). Passing `cursor` returns the next page with no gap or duplicate, even when two orders share a `created_at`.
  2. `status=<one of 7>` and `partner_id=<uuid>` narrow the result. Bad input returns `422 VALIDATION` with `fields.from|to|status|partner_id|cursor`; mixing `from/to` with `scope` or `updated_after` returns `422` on `scope`.
  3. Existing calls (`scope=open`, `scope=closed`, `updated_after=`) return exactly what they return today; existing integration tests pass unchanged.
  4. The "Tất cả đơn" tab defaults to Ngày = hôm nay. ‹ › move one day/week/month; › is disabled when the next period starts after today. The label reads e.g. "17/10/2026", "13/10 – 19/10/2026", "Tháng 10/2026". Khoảng ngày shows from/to inputs and the same validation messages as Báo cáo.
  5. Each row shows date + time placed, `#code` linking to `/seller/orders/:id`, quán · bàn, status label, total. Under `sm` rows stack; every control is ≥ 44 px.
  6. A status change made on the board (or arriving over WebSocket) shows in the history list without a reload; a new order placed while the tab shows a period containing today appears without a reload.
  7. Empty result shows "Không có đơn trong khoảng này"; load errors show a retry button.
  8. `make test`, `make lint`, and web `typecheck`, `test`, `build` pass; the new Playwright spec passes in `make e2e`.

## Phases

| # | Phase | Status | Depends on |
|---|-------|--------|-----------|
| 1 | [API history query on the seller order list](phase-01-api-history-query.md) | pending | — |
| 2 | [Web "Tất cả đơn" tab with filters](phase-02-web-history-tab.md) | pending | 1 (contract only; builds against MSW) |
| 3 | [E2E and docs](phase-03-e2e-and-docs.md) | pending | 1, 2 |

## Flow

```text
Tab "Tất cả đơn" ─▶ HistoryFilter {mode: day|week|month|range, anchor, from, to, status, partnerId}
   ─▶ historyRange(filter) → {from, to} (VN dates; week Mon–Sun, month 1–end)
   ─▶ useInfiniteQuery GET /api/seller/orders?from&to&status&partner_id[&cursor]
        API: ParseDateRange(APP_TZ) → WHERE created_at >= from AND created_at < to+1d
             [AND status = ?] [AND partner_id = ?] [AND (created_at, id) < (cursor)]
             ORDER BY created_at DESC, id DESC LIMIT 101
   ◀─ {orders[≤100], next_cursor, server_time}
rows overlay newer copies from board state (WS order.updated); order.created → invalidate history query
```

## Touchpoints

- API: `internal/platform/clock/date_range.go` (new, moved from `reports/period.go`), `internal/features/reports/{period.go, period_test.go, service.go}`, `internal/features/orders/{handler.go, service.go, repository.go, dto.go}`, `migrations/000006_orders_created_at_index.{up,down}.sql`, `internal/app/orders_integration_test.go`.
- Web: `src/features/seller-orders/{api.ts, history-filter.ts, history-filter.test.ts, board-context.tsx, pages/board.tsx, pages/board.test.tsx, components/order-history.tsx, components/history-filters.tsx}`, `src/mocks/seller-handlers.ts`.
- E2E/docs: `apps/web/e2e/order-history.spec.ts`, `docs/api.md`.

## Risks

- **Index migration on a live DB:** `CREATE INDEX` locks writes on `orders` for its duration. Tables are small (one stack per customer), so the lock is milliseconds; the runbook's backup-before-migrate step still applies. Do not use `CONCURRENTLY` (golang-migrate runs each file in a transaction).
- **Cursor precision:** Postgres stores microseconds. The cursor must carry `created_at` in RFC 3339 with full fractional seconds plus `id`, or rows sharing a millisecond get skipped. Covered by a test with equal `created_at`.
- **Board chunk size:** `/seller` is not a customer route, so the 120 KB customer budget does not apply, but importing `admin-reports/period.ts` must not pull report components. It is a pure module; keep it that way.
- **Week/month off-by-one around midnight:** all date math uses `todayISO()` (VN time) and `addDays` on ISO strings, never local `Date` getters. Unit tests pin dates across month/year boundaries and a Sunday.

## Rollback

Revert the commits. Run `migrate down 1` to drop the index (or leave it; it is harmless). No data changes.

## Validation Log

### Decisions confirmed with the user (2026-10-17)

- Placement: third tab, existing tabs unchanged.
- Day/week/month: ‹ › stepping, plus specific day and date range.
- Time basis: `created_at`.
- Extras: status filter and partner filter; no totals row.

### Verification Results

- Claims checked: 12 · Verified: 12 · Failed: 0 · Unverified: 0 · Tier: Standard
- `GET /api/seller/orders` handler and `scope`/`updated_after` parsing: `apps/api/internal/features/orders/handler.go:88`.
- `ListFilter`, `listLimit = 300`: `apps/api/internal/features/orders/repository.go:34-40`.
- `ParseRange`, `Range.Bounds`, 366-day cap and Vietnamese messages: `apps/api/internal/features/reports/period.go`.
- `reports` imports only `partners`; `orders` imports `menu`, `notifications`, `settings` (moving the range parser to `platform/clock` avoids a feature-to-feature dependency).
- Existing indexes on `orders`: `(status, created_at)`, `(updated_at)`, partial `(partner_id, paid_at)`, `(client_id, created_at DESC)` in `000001_init.up.sql:135-138`; none serves a `created_at` range across statuses. Last migration is `000005`.
- Web board tabs and `loadClosed`: `apps/web/src/features/seller-orders/pages/board.tsx`, `board-context.tsx`.
- `todayISO`, `addDays`, `validateRange`: `apps/web/src/features/admin-reports/period.ts`.
- `listPartners`, `partnersKey`: `apps/web/src/features/admin-partners/api.ts:37-43`.
- `SELLER_STATUS_LABEL`: `apps/web/src/shared/lib/order-status.ts`; `formatDate`, `formatTime`: `apps/web/src/shared/lib/time.ts:39-43`.
- Stacked `Table`: `apps/web/src/shared/ui/table.tsx`.
- MSW seller order list handler: `apps/web/src/mocks/seller-handlers.ts:43`.
- Playwright fixtures (`sellerPage`, `customerPage`, `placeOrder`, `table`): `apps/web/e2e/fixtures.ts`, used by `reject.spec.ts`.
