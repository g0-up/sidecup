---
phase: 1
title: "API history query on the seller order list"
status: done
priority: P2
effort: "4h"
dependencies: []
---

# Phase 1: API history query on the seller order list

## Goal

`GET /api/seller/orders` accepts `from`, `to`, `status`, `partner_id`, `cursor` and returns one page of orders placed in that VN-date range, newest first, with `next_cursor`, without changing the existing `scope`/`updated_after` behaviour.

## Contract

```text
GET /api/seller/orders?from=YYYY-MM-DD&to=YYYY-MM-DD[&status=<status>][&partner_id=<uuid>][&cursor=<opaque>]
200 {orders: SellerView[≤100], next_cursor: string|null, server_time}
```

- History mode starts when `from` or `to` is present. Both are then required (`fields.from` / `fields.to`, same messages as reports: "Ngày phải có dạng YYYY-MM-DD", "Ngày kết thúc phải sau ngày bắt đầu", "Khoảng ngày tối đa 366 ngày").
- `scope` or `updated_after` together with `from`/`to` → `422 fields.scope` "Không dùng scope hoặc updated_after khi lọc theo ngày".
- `status` must be one of the 7 statuses (`Status.Valid()`), else `fields.status` "Trạng thái không hợp lệ". `partner_id` must be a UUID, else `fields.partner_id` "Mã quán không hợp lệ" (same text as reports). An unknown but well-formed partner id returns an empty list.
- `cursor` is opaque to the client: `<created_at RFC3339Nano UTC>,<order uuid>`. Malformed → `fields.cursor` "Trang tiếp không hợp lệ, tải lại danh sách".
- History mode responds with a separate `historyResp`; `listResp` (no `next_cursor`) stays unchanged for `scope`/`updated_after` calls.
- `Cache-Control: no-store`, `server_time` read before the query (same as today).

## Files to Create / Modify

- Create: `apps/api/internal/platform/clock/date_range.go` — move `Range` (rename `DateRange`), `Bounds`, `Days`, `ParseRange` (rename `ParseDateRange`), `maxRangeDays` from `reports/period.go`. Keep the `apperr.Field` messages identical.
- Create: `apps/api/internal/platform/clock/date_range_test.go` — move the `ParseRange` cases from `reports/period_test.go`.
- Modify: `apps/api/internal/features/reports/period.go` — `type Range = clock.DateRange`; `Resolve` returns it; delete the moved code. `reports/service.go:44` calls `clock.ParseDateRange`.
- Modify: `apps/api/internal/features/reports/period_test.go` — keep only `Resolve` tests.
- Modify: `apps/api/internal/features/orders/repository.go` — add `HistoryFilter{From, To time.Time; Status *Status; PartnerID *uuid.UUID; Before *Cursor}` and `History(ctx, tx, f, limit)`; `historyPageSize = 100`.
- Modify: `apps/api/internal/features/orders/service.go` — `History(ctx, q HistoryQuery) ([]SellerView, *string, error)`: parse range with `s.clock.Location()`, query `limit+1`, trim, build `next_cursor` from the last row kept.
- Modify: `apps/api/internal/features/orders/handler.go` — `list` branches to history mode when `from` or `to` is set; validation above.
- Modify: `apps/api/internal/features/orders/dto.go` — `historyResp{Orders, NextCursor *string \`json:"next_cursor"\`, ServerTime}`; cursor encode/decode helpers.
- Create: `apps/api/migrations/000006_orders_created_at_index.up.sql` — `CREATE INDEX orders_created_at_id_idx ON orders (created_at DESC, id DESC);` with a one-line Vietnamese comment (style of `000005`).
- Create: `apps/api/migrations/000006_orders_created_at_index.down.sql` — `DROP INDEX IF EXISTS orders_created_at_id_idx;`.
- Modify: `apps/api/internal/app/orders_integration_test.go` — new `TestSellerOrderHistory`.
- Modify (if present): unit tests for cursor encode/decode in `orders/dto_test.go`.

## Tasks & Steps

1. Move the date-range parser to `platform/clock`; alias in `reports`; run `go test ./internal/features/reports/... ./internal/platform/clock/...` — must stay green before touching orders.
2. Add the migration pair; `make migrate-up` on the dev DB (backup first per repo rule: `pg_dump` of the dev DB, or note that dev DB is disposable), then `migrate down 1` and `up` again to prove both directions.
3. Repository `History`:
   ```go
   q := tx.WithContext(ctx).Where("created_at >= ? AND created_at < ?", from, toExclusive)
   if f.Status != nil { q = q.Where("status = ?", *f.Status) }
   if f.PartnerID != nil { q = q.Where("partner_id = ?", *f.PartnerID) }
   if f.Before != nil { q = q.Where("(created_at, id) < (?, ?)", f.Before.CreatedAt, f.Before.ID) }
   q.Order("created_at DESC, id DESC").Limit(limit).Find(&out)
   ```
4. Cursor: encode `o.CreatedAt.UTC().Format(time.RFC3339Nano) + "," + o.ID.String()`; decode splits on the last comma, parses both, rejects anything else.
5. Handler branch and validation messages exactly as in the Contract. Keep the existing `scope`/`updated_after` code path untouched (no reordering of its checks).
6. Integration test `TestSellerOrderHistory` (uses the existing fake clock and helpers in `orders_integration_test.go`):
   - Orders on 30/09 23:59 VN, 01/10 00:00 VN, 31/10 23:59 VN, 01/11 00:00 VN → range 01/10–31/10 returns exactly the middle two.
   - Mixed statuses → all returned without `status`; `status=paid` returns only paid; `partner_id` narrows.
   - 205 orders in range, several sharing one `created_at` → pages of 100/100/5, union equals the set, no duplicates, last `next_cursor` is null.
   - Validation: missing `to`, `to < from`, 367-day range, `scope=open&from=…`, bad `status`, bad `partner_id`, bad `cursor` → `422` with the right field.
   - Regression: existing `scope=open|closed` tests unchanged and green.

## Verification

- `cd apps/api && go test ./...` with `TEST_DATABASE_URL` set (integration) — all green.
- `make lint` — `go vet` and golangci-lint clean.
- Manual: `curl -b cookie 'http://localhost:8080/api/seller/orders?from=2026-10-01&to=2026-10-31'` after `make seed` and a few orders.

## Risks

- Changing `reports` while moving the parser: only an alias and call-site change; `reports` tests guard it.
- `(created_at, id) < (?, ?)` row comparison needs both columns in the same order as the index; it is.
