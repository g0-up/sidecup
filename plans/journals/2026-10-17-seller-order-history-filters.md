---
title: Seller order history filters
date: 2026-10-17
summary: "Added the Tất cả đơn tab with day/week/month/range, status and partner filters, backed by keyset-paginated GET /api/seller/orders?from&to"
---

# Seller order history filters

# Seller order history filters

## What happened
- Implemented plan 261017-1343: the API serves `GET /api/seller/orders?from&to[&status&partner_id&cursor]` with keyset pagination on `(created_at DESC, id DESC)`, 100 per page. Migration 000006 adds the matching index. Old `scope`/`updated_after` calls are unchanged; mixing the two modes returns 422.
- The date-range parser moved from reports to `clock.ParseDateRange`, so reports and orders share the same validation and messages.
- The web `/seller` board got a third tab "Tất cả đơn" with Ngày/Tuần/Tháng stepping, Khoảng ngày, status and partner filters, "Tải thêm", and a live status overlay from board state.

## Decisions
- The plan's sample week label "13/10 – 19/10/2026" was wrong: 17/10/2026 is a Saturday, so its Monday–Sunday week is 12/10–18/10. Tests use the correct dates.
- An order whose status moves outside the active status filter stays visible until the next refetch, so the list does not jump while the seller works.
- `order.created` and fallback resync only refetch history queries whose range reaches today. Past periods cannot gain new orders, and refetching an infinite query reloads every loaded page.
- Switching away from Ngày with an empty day input resets the anchor to today. Without this, week/month math threw during render and took the whole board down (found in review).

## Verification
- API: `go test -race -tags integration ./...`, go vet, golangci-lint (0 issues) against a throwaway postgres on port 55432.
- Web: typecheck, eslint, vitest 179/179, build and size budget (menu 109.9 KB, order status 104.0 KB, budget 120 KB).
- E2E on an isolated compose project (no host 5432 port, separate volume): Chromium 12/12 on the first run. On a later run realtime-fallback failed once before the new code paths were reached and then passed 3/3 on repeat. WebKit could not launch: the host lacks libevent, gstreamer-plugins-bad and libavif.

## Side fixes
- `src/test/setup.ts` now strips `signal` from Node's `Request` in tests, because jsdom's AbortSignal is rejected by Node. This fixes the pre-existing AbortSignal test failures noted in the 2026-10-06 journal.

## Next steps
- Install WebKit deps (`sudo pnpm exec playwright install-deps webkit`) and run `make e2e` on a host where port 5432 is free.
- Back up the prod and tiendouong databases before deploying migration 000006 (plain CREATE INDEX locks writes on orders briefly).

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
