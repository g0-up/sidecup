---
phase: 3
title: "E2E and docs"
status: done
priority: P2
effort: "2h"
dependencies: [1, 2]
---

# Phase 3: E2E and docs

## Goal

Prove the history tab end to end on the real stack and document the new query contract.

## Files to Create / Modify

- Create: `apps/web/e2e/order-history.spec.ts`.
- Modify: `docs/api.md` — the `GET /api/seller/orders` row.

## Tasks & Steps

1. E2E spec using `fixtures.ts` (`sellerPage`, `customerPage`, `table`, `placeOrder`), in the style of `reject.spec.ts`:
   - Place an order for the spec's own partner; seller opens `/seller` → "Tất cả đơn"; filter "Quán" = `table.partnerName`; the row with the order code is visible with status "Đã gửi".
   - Seller rejects it from the "Đang mở" tab, returns to "Tất cả đơn": row shows "Đã từ chối" without reload (overlay).
   - Status filter "Đã thu tiền" → the row disappears; "Mọi trạng thái" → it is back.
   - "Kỳ trước" → "Không có đơn trong khoảng này" (spec partner is fresh, so yesterday is empty).
2. `docs/api.md`: extend the `GET /api/seller/orders` row: history mode `from&to` (YYYY-MM-DD theo `APP_TZ`, tính theo lúc đặt `created_at`, tối đa 366 ngày) + `status`, `partner_id`, `cursor`; trang 100 đơn, mới nhất trước, `next_cursor` null ở trang cuối; không kết hợp với `scope`/`updated_after`. Vietnamese, same tone as the table.
3. No runbook change: the migration runs through the normal `migrate up` on deploy, already covered.

## Verification

- `make e2e` (Chromium and WebKit) — new spec and existing specs green.
- Re-read `docs/api.md` row against `orders/handler.go` and `dto.go`.
