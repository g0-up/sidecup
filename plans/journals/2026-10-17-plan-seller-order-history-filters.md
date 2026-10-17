---
title: Plan seller order history filters
date: 2026-10-17
summary: "Planned a third 'Tất cả đơn' tab on the seller board with period, status and partner filters"
---

# Plan seller order history filters

## What happened
Planned `plans/261017-1343-seller-order-history-filters/`. Today the seller "Đơn" screen shows only open orders and orders closed today; `GET /api/seller/orders` supports only `scope=open|closed` and `updated_after`, capped at 300 rows.

## Decision
- Add a third tab "Tất cả đơn"; the existing tabs stay unchanged.
- Filter periods: Ngày/Tuần/Tháng with ‹ › stepping (week Mon–Sun, VN time), a specific day via date input, and a from–to range (≤ 366 days, same rule as reports).
- Orders belong to the day they were placed (`created_at`).
- Also filter by status and by partner; no totals row.
- API: history mode on the existing list route (`from`, `to`, `status`, `partner_id`, `cursor`), keyset pagination of 100 on `(created_at DESC, id DESC)`, new index migration `000006`. The legacy `scope`/`updated_after` contract stays unchanged.
- Move the date-range parser from `reports` to `platform/clock` so `orders` does not import `reports`.

## Next steps
Run `/ak:cook plans/261017-1343-seller-order-history-filters/plan.md`: API phase first, then the web tab (against MSW), then e2e and `docs/api.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
