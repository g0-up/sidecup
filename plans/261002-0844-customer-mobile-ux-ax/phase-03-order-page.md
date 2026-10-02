---
phase: 3
title: "Order page"
status: pending
priority: P1
effort: "5h"
dependencies: [1, 2]
---

# Phase 3: Order page

## Goal

`/o/:id` becomes a finished journey:
- the status is the hero, with an expected time;
- the page says whether Zalo updates will arrive;
- "Gọi thêm nước" links back to the table menu and becomes the primary action
  once the order is paid or closed;
- loading shows a skeleton that matches the final layout;
- errors offer a next step;
- cancelling takes two deliberate taps.

This covers P1, P5, P9 (order header), P10 (order title), P11 (order errors),
P13 (order skeleton) and P15 (cancel).

## Context

- `src/features/customer-order/page.tsx:73-76`: the H1 is the order code, and the
  status is `text-sm`.
  - `:37` shows the loading state as plain text.
  - `:40-45` is the error state, where a 404 has no action.
- `components/unconfirmed-prompt.tsx`: "Chờ thêm" is outline `lg` (40 px) and
  "Huỷ đơn" is solid destructive `lg`. `e2e/customer-cancel.spec.ts:13` clicks
  "Huỷ đơn".
- `components/status-steps.tsx:25`: `animate-pulse` on the active step.
- Phase 1 provides `order.menu_path`, `order.eta_minutes` and `order.notify_zalo`.
- Phase 2 provides `useDocumentHead`, `CustomerBrand` and the reduced-motion rule.

## Requirements

- **Header:**
  - First line: `CustomerBrand` with place `"<partner_name> · <table_label>"`.
  - Then the hero sentence as the H1, which is the largest text above the fold at
    375×812.
  - Then a secondary line: "Đơn #CODE" in mono.
  - The `aria-live="polite"` region stays on the hero sentence.
- **Hero copy** lives in `src/features/customer-order/status-copy.ts`, a pure
  function of `(order, clock)`. It returns `{ headline, detail? }`:
  - `sent`: "Đã gửi đơn, chờ quán xác nhận".
  - `accepted`: "Quán đang pha, nước tới khoảng HH:MM", where HH:MM is
    `accepted_at + eta_minutes`, formatted in Asia/Saigon with the existing time
    helpers. If `accepted_at` is null, drop the time.
  - `delivering`: "Nước đang được mang ra bàn".
  - `paid`: "Cảm ơn bạn! Chúc ngon miệng".
  - `rejected`, `cancelled` and `failed` keep the `ClosedNotice` copy; the headline
    uses `CUSTOMER_STATUS_LABEL`.
- **Reassurance** (open orders only):
  - When `notify_zalo` is true: "Bạn sẽ nhận tin Zalo khi trạng thái đổi, có thể
    đóng trang này."
  - Otherwise: "Giữ trang này mở để theo dõi đơn."
- **Reorder:**
  - A `Link` to `order.menu_path` labelled "Gọi thêm nước", at least 44 px tall.
  - While the order is open, it is secondary (outline).
  - When the order is `paid`, `rejected`, `cancelled` or `failed`, it is the single
    `cta` button directly under the hero or the notice.
- **Title:** `useDocumentHead({ title: "Đơn #CODE · <status label>", noindex: true })`.
  It updates on every status change. The loading and error states use their own
  titles ("Đang tải đơn…", "Không tìm thấy đơn").
- **Skeleton:** placeholder blocks for the brand line, hero, steps row and items
  card, with `aria-busy`. The pulse comes from the existing utility, so the global
  rule from phase 2 removes it under reduced motion.
- **Errors:**
  - 404: "Không tìm thấy đơn", plus a camera icon and the instruction "Quét mã QR
    trên bàn để đặt lại".
  - Other errors: a "Thử lại" button, `size="lg"` with `min-h-11`, that calls
    `reload()` without a full page reload.
- **Unconfirmed prompt** (P15):
  - "Chờ thêm" is the primary (`default`) button.
  - "Huỷ đơn" is an outline button with destructive text.
  - The first tap reveals "Xác nhận huỷ" (destructive) and "Không huỷ" in place.
  - Only "Xác nhận huỷ" calls `onCancel`.
  - All buttons are `min-h-11`.
- **Status steps:** active-step circles keep the pulse, but it is reduced-motion
  safe through the global rule. Add `motion-safe:` to be explicit.

## Files

- Modify: `apps/web/src/features/customer-order/page.tsx`
- Create: `apps/web/src/features/customer-order/status-copy.ts` and `status-copy.test.ts`
- Create: `apps/web/src/features/customer-order/components/order-skeleton.tsx`
- Modify: `apps/web/src/features/customer-order/components/unconfirmed-prompt.tsx`
- Modify: `apps/web/src/features/customer-order/components/status-steps.tsx`
- Create: `apps/web/src/features/customer-order/page.test.tsx`
- Modify: `apps/web/e2e/customer-cancel.spec.ts` (add the confirm tap)
- Check: `apps/web/e2e/unconfirmed-prompt.spec.ts`, `happy-path.spec.ts` (selectors for header and status text)

## Steps

1. Write `status-copy.ts` with unit tests covering every status, a null
   `accepted_at`, and a time that crosses midnight.
2. Build `OrderSkeleton`, and replace the plain loading text with it.
3. Restructure the header. Add the reassurance line and the reorder link, placed by
   status.
4. Add `useDocumentHead` calls for the ready, loading and error states.
5. Update the error state with the 404 instruction and a 44 px retry.
6. Rework `UnconfirmedPrompt` with a local `confirming` state, resetting
   `confirming` when the prompt closes.
7. Add `page.test.tsx` (MSW):
   - the reorder `href` equals `/t/DEVTEST001`;
   - on paid, the reorder action is the `cta` button;
   - the Zalo line follows `notify_zalo`;
   - `document.title` changes with the status;
   - cancel needs two taps;
   - a 404 shows the instruction.
8. Update `customer-cancel.spec.ts` to click "Huỷ đơn" then "Xác nhận huỷ". Grep
   the e2e specs for the old H1 or status text and update their selectors.

## Todo

- [x] Add the status copy map with tests
- [x] Add the order skeleton
- [x] Add the hero header, brand line, reassurance line and reorder action
- [x] Add per-status document titles and `noindex`
- [x] Give the error states a next step
- [x] Add the two-step cancel and make "Chờ thêm" primary
- [x] Add page tests and update the e2e cancel spec

## Verification

- `cd apps/web && pnpm test` passes, including the new page and copy tests.
- `pnpm lint && pnpm typecheck` pass.
- `pnpm exec vite build && pnpm size` keeps `/o/:id` within 120 KB.
- E2E `customer-cancel`, `unconfirmed-prompt` and `happy-path` pass (run in phase 7
  if Docker is blocked here).

## Risks

- **E2E selectors depend on the old header text.** Grep before changing copy, and
  use role and name selectors.
- **The two-tap cancel slows the e2e timing for the 60-second prompt.** It is
  covered by the spec update.
- **Time formatting must use server-corrected time and the Saigon zone.** Reuse
  `serverClock` and the helpers in `shared/lib/time.ts`, and add no new date
  library.
