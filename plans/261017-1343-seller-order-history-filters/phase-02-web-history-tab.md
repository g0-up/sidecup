---
phase: 2
title: "Web \"Tất cả đơn\" tab with filters"
status: done
priority: P2
effort: "6h"
dependencies: [1]
---

# Phase 2: Web "Tất cả đơn" tab with filters

## Goal

Add a third tab "Tất cả đơn" to the seller board with period (Ngày/Tuần/Tháng with ‹ ›, Khoảng ngày), status and partner filters, a paged list, and live updates from the board's WebSocket.

## Files to Create / Modify

- Create: `apps/web/src/features/seller-orders/history-filter.ts` — pure filter model and date math.
- Create: `apps/web/src/features/seller-orders/history-filter.test.ts`.
- Create: `apps/web/src/features/seller-orders/components/history-filters.tsx` — filter bar.
- Create: `apps/web/src/features/seller-orders/components/order-history.tsx` — query, list, "Tải thêm", empty/error states.
- Modify: `apps/web/src/features/seller-orders/api.ts` — `listOrderHistory(params, cursor, signal)`, `historyKey(params)` under `["seller", "orders", "history", …]`, `OrderHistoryPage` type.
- Modify: `apps/web/src/features/seller-orders/board-context.tsx` — on `order.created` invalidate `["seller", "orders", "history"]`.
- Modify: `apps/web/src/features/seller-orders/pages/board.tsx` — third `TabsTrigger value="all"` "Tất cả đơn" and `TabsContent` rendering `<OrderHistory />`.
- Modify: `apps/web/src/features/seller-orders/pages/board.test.tsx` — tab switch renders history.
- Modify: `apps/web/src/mocks/seller-handlers.ts` — history mode on `GET /api/seller/orders` (filter by `created_at` VN date, `status`, `partner_id`, page via `cursor`).

## Filter model (`history-filter.ts`)

```ts
export type HistoryMode = "day" | "week" | "month" | "range";
export const HISTORY_MODE_LABEL: Record<HistoryMode, string> = { day: "Ngày", week: "Tuần", month: "Tháng", range: "Khoảng ngày" };
export interface HistoryFilter {
  mode: HistoryMode;
  anchor: string;          // YYYY-MM-DD (VN) inside the shown day/week/month
  from: string; to: string; // used when mode = range
  status: OrderStatus | null;  // null = mọi trạng thái
  partnerId: string | null;    // null = tất cả quán
}
defaultHistoryFilter(now) → { mode: "day", anchor: todayISO(now), from: addDays(today, -6), to: today, status: null, partnerId: null }
historyRange(f) → { from, to }     // day: anchor..anchor; week: Monday..Sunday containing anchor; month: 1..last day
step(f, ±1) → HistoryFilter         // moves anchor by 1 day / 7 days / 1 month (clamp day-of-month: 31/03 −1 month → 28 or 29/02)
canStepForward(f, now) → boolean    // false when the next period's first day > todayISO(now)
periodLabel(f) → "17/10/2026" | "13/10 – 19/10/2026" | "29/12/2025 – 04/01/2026" | "Tháng 10/2026"
historyError(f) → string | null     // range → validateRange(from, to); else null
historyParams(f) → { from, to, status?, partner_id? }
```

- Import `todayISO`, `addDays`, `validateRange` from `@/features/admin-reports/period` (pure module; do not import its components).
- Weekday from an ISO date: `new Date(\`${iso}T00:00:00Z\`).getUTCDay()`; never local `Date` getters.

## UI

- Filter bar (`history-filters.tsx`), wraps like `ReportFilters` (`grid gap-3 sm:flex sm:flex-wrap sm:items-end`):
  - Select "Thời gian": Ngày / Tuần / Tháng / Khoảng ngày.
  - Day/week/month: `‹` button (aria-label "Kỳ trước"), period control, `›` button (aria-label "Kỳ sau", disabled when `!canStepForward`). Ngày mode shows a date `Input` (that is "chọn ngày cụ thể", `max = today`); Tuần/Tháng show the `periodLabel` text with `aria-live="polite"`.
  - Khoảng ngày: "Từ ngày" / "Đến ngày" date inputs; `FieldError` with `historyError`.
  - Select "Trạng thái": "Mọi trạng thái" + 7 entries from `SELLER_STATUS_LABEL`.
  - Select "Quán": "Tất cả quán" + `useQuery({ queryKey: partnersKey, queryFn: listPartners })`.
  - All buttons/triggers `h-11` (44 px); labels via `Label htmlFor`.
- List (`order-history.tsx`):
  - `useInfiniteQuery({ queryKey: historyKey(params), queryFn: ({ pageParam, signal }) => listOrderHistory(params, pageParam, signal), initialPageParam: undefined, getNextPageParam: (p) => p.next_cursor ?? undefined, enabled: !historyError(f) })`.
  - Overlay: for each row use `state.orders[id]` from `useSellerBoard()` when its `updated_at` is newer (live status from WS / board actions) — reuse the same "newer wins" rule as `upsert` in `store.ts`.
  - Stacked `Table`: columns Thời gian (`formatDate` + `formatTime` of `created_at`), Mã (`Link` to `/seller/orders/:id`, `min-h-11`), Quán · Bàn, Trạng thái (`Badge`, `SELLER_STATUS_LABEL`; `secondary` for paid, `outline` for closed non-paid, default for open), Tổng (`formatVND`, right-aligned, tabular-nums). Phone grid via `max-sm:grid-cols-…` like the seller report tables.
  - Footer: "Đã hiện N đơn" and "Tải thêm" (`h-11`, `disabled` while fetching) when `hasNextPage`.
  - States: loading "Đang tải đơn…"; empty "Không có đơn trong khoảng này"; error `role="alert"` + "Thử lại" (`refetch`).
- Board: `TabsTrigger value="all"` "Tất cả đơn"; the history component mounts only when the tab is active (Radix `TabsContent` unmounts inactive content by default; keep that so the query does not run on the operational tab). Filter state lives in `board.tsx` (`useState(() => defaultHistoryFilter())`) and is passed down, so switching to "Đang mở" and back keeps the chosen filter. No URL state (non-goal).

## Tasks & Steps

1. `history-filter.ts` + tests first (pure): week containing Sunday 19/10/2026 → 13/10–19/10; week across year 01/01/2026 (Thursday) → 29/12/2025–04/01/2026; month step from 31/03 back → February with clamped anchor; `canStepForward` false on today/this week/this month and true one period back; `periodLabel` formats; `historyParams` omits nulls.
2. `api.ts` additions and MSW handler history mode.
3. `history-filters.tsx`, `order-history.tsx`, board tab wiring, `board-context.tsx` invalidation.
4. `board.test.tsx`: clicking "Tất cả đơn" shows today's orders from MSW; "Kỳ trước" changes the query to yesterday; status select narrows; empty state text; "Tải thêm" appends the next page.
5. Check at 360 px and 1280 px with the existing seller capture script (`apps/web` audit script from the seller responsive work) or manually in dev: no horizontal scroll, 44 px targets.

## Verification

- `cd apps/web && pnpm typecheck && pnpm test && pnpm lint && pnpm build`.
- `VITE_USE_MOCK=1 pnpm dev` → `/seller` → "Tất cả đơn": step days/weeks/months, pick a date, pick a range, filter status and partner, load more.

## Risks

- Overlay plus invalidation can briefly show an order whose new status no longer matches the status filter; it disappears on the next refetch triggered by `order.created`, or stays until the filter changes. Acceptable; documented in the component comment. If it confuses in review, hide overlaid rows whose status no longer matches the filter.
