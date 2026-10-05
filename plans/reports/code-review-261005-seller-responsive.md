# Code review: seller responsive UX/AX (uncommitted, master)

## Scope
- Files: apps/web/src/app/seller-layout.tsx, admin-partners/*, admin-products/*, admin-reports/*, admin-settings/*, seller-auth/page.tsx, seller-orders/*, shared/ui/{alert-dialog,dialog,sheet,switch,table}.tsx, scripts/capture-seller-audit.mjs, hooks/use-new-order-alert.test.ts
- About 550 added / 200 removed lines
- Checks I ran: vitest on admin-reports, seller-orders, admin-partners, admin-settings: 71/72 pass. The one failure is the known notifier-banner undici AbortSignal issue. The new use-new-order-alert test and board.test pass.

## Overall
No critical or high defects. No backend or auth surface is touched. The shared UI changes are correct:
- Moving `className` onto `Button` in AlertDialogAction/Cancel means overrides now go through tailwind-merge instead of plain string concatenation.
- The close-button sizing in dialog.tsx and sheet.tsx is correct.

The remaining issues are a11y gaps against the project's own documented rules, plus some dead or ineffective code.

## Medium

### M1. Dialogs opened from state in touched admin files still lose focus on close
- Files:
  - apps/web/src/features/admin-partners/components/table-list.tsx:156 ("Xem thẻ" dialog) and :173 ("Thu hồi" alert)
  - apps/web/src/features/admin-products/components/product-form.tsx:49 (opened from page.tsx `setTarget` via "Sửa" or "Thêm món")
  - apps/web/src/features/admin-partners/components/partner-form.tsx:69 (opened from list.tsx `setCreating` and detail.tsx `setEditing`)
- Why it fails: Radix DialogContent's default `onCloseAutoFocus` calls preventDefault and then focuses `triggerRef`. These dialogs have no Trigger, so focus falls to `<body>`. order-actions.tsx documents the same limitation.
- Scenario: a keyboard user on /seller/products presses "Sửa Cà phê", then Esc. Focus jumps to the top of the document and the next Tab starts from the header.
- docs/design.md:84 now states this as a rule for all dialogs, so these files violate the documented contract.
- Revoke edge case: after a successful revoke the row becomes inactive and its buttons unmount, so the opener no longer exists. That case needs a fallback target.
- Fix: reuse the order-actions pattern. Store `e.currentTarget` in a ref on the opening button, and pass `onCloseAutoFocus={(e) => { e.preventDefault(); (opener.current?.isConnected ? opener.current : fallback.current)?.focus(); }}`. Use the "Tên bàn mới" input as the fallback for revoke. If the pattern is repeated, a small shared `useReturnFocus()` hook would avoid copying it. Otherwise narrow the docs rule to the seller service screens.

### M2. PauseSwitch accessible name flips with state, which inverts its meaning for screen readers
- File: apps/web/src/features/seller-orders/components/pause-switch.tsx:26-28
- The wrapping `<label>` names the switch "Tạm ngưng" below lg (or "Tạm ngưng nhận đơn" at lg) while `aria-checked=false`.
- Scenario: a screen reader announces "Tạm ngưng, công tắc, tắt" ("Pause, switch, off"). That reads as "pause is off", meaning accepting, which is the opposite of the real state. This switch affects every partner shop.
- The state-dependent label existed before at desktop. This diff adds a second state-dependent short label and makes this the only toggle in the app.
- Fix: give the switch a stable name and keep the status text purely visual. For example `<Switch aria-label="Nhận đơn" …/>` with the status spans marked `aria-hidden`. e2e paused.spec uses `getByRole("switch")` plus `getByText`, so it keeps working.

### M3. New board logic has no tests
- Files: apps/web/src/features/seller-orders/pages/board.tsx:21-38, :592-615 and store.ts `isLate`
- Not covered:
  - the "Chọn cột" switcher (`aria-pressed`, hiding the other sections)
  - the default column chosen once on load
  - the alert dot
  - `isLate` boundaries: exactly 60 s, `clock === null`, non-`sent` status
- board.test.tsx and store.test.ts are unchanged apart from existing assertions. e2e only runs at desktop width, so none of this behaviour is exercised.
- Fix: add store tests for `isLate`. Add a board test that seeds a late `sent` order and an `accepted` order and asserts `aria-pressed` on "Đã gửi", then clicks "Đã nhận" and asserts the pressed state moves. Class-based hiding is not visible to jsdom, so assert on `aria-pressed` and the class rather than visibility.

## Low

### L1. `defaultColumn` is dead logic: it always returns "sent"
- File: board.tsx:21-25
- `isLate` only returns true for `status === "sent"` (store.ts), and every `sent` order is in `cols.sent`. So "column with the oldest late order" can only ever be "Đã gửi", the same result as the fallback.
- The flatMap and sort do nothing, and docs/design.md claims behaviour that cannot differ.
- Fix: `useState<ColumnKey>("sent")` and drop the render-phase `setColumn`. Alternatively, if the intent was "column with the oldest overdue work", define lateness for accepted/delivering orders. That is a product decision (see the questions below).

### L2. `max-sm:empty:hidden` never matches
- File: table-list.tsx:129-131
- The actions cell always contains `<div className="flex …">`, even for revoked rows, so `:empty` is never true.
- Result: revoked rows on mobile get an extra empty grid row plus one `gap-y-1`.
- Fix: move the condition outside the div, i.e. `{q.active && (<div …>…</div>)}`, so the td really is empty.

### L3. Funnel day-row indent is lost below sm
- File: funnel-table.tsx:83
- Stacked mode applies `max-sm:[&_td]:p-0` with selector `.x td` (specificity 0,1,1). That beats the cell's `.pl-6` (0,1,0) inside the same `@layer utilities`.
- Result: on phones, day rows lose their indent under the partner total row and are told apart only by the muted background.
- Fix: use an indent the stacked rule does not reset, such as `max-sm:ml-4` or `max-sm:!pl-4`, or accept and remove `pl-6` for mobile.

### L4. Board re-renders the whole board every second at every width
- File: board.tsx:31
- `useNow(1000)` re-renders the page and all OrderCards (not memoized), and recomputes `openColumns` and `closedSince` every second.
- It is only needed for the alert dot in the switcher, which is hidden at lg and up.
- The cost is small at current order volumes. If it matters, move the switcher into a child component that owns `useNow`.

### L5. SoundToggle "on" state: visible text is not part of the accessible name
- File: sound-toggle.tsx:21
- At lg the visible text is "Âm báo bật" but `aria-label` is "Tắt âm báo" (WCAG 2.5.3 Label in Name). Voice-control users who say the visible text cannot activate it.
- This existed before; the component was touched in this diff.
- Fix: for example `aria-label="Âm báo bật, chạm để tắt"`.

### L6. Two writers own `document.title`
- `useDocumentHead` restores a captured `prev` on cleanup (use-document-head.ts:33-38), while `useNewOrderAlert` writes the title directly.
- If a route's head effect mounts while "(n) Đơn mới" is showing and no cleanup runs in the same commit (for example a Suspense fallback window), it captures the alert text as `prev` and restores it later.
- React Router's transition-wrapped navigation largely prevents that window today, so this is informational. A single title owner would remove the class of bug: pages register their base title in context and the alert hook composes it.

## Edge cases checked, no defect found
- Effect ordering on a new order: Board's openCount and the alert's unseen count change in the same commit. Child cleanup runs before parent, and the alert's guard `document.title === alert` prevents overwriting the page title. The tab ends showing the correct page title.
- order-actions `restoreFocus` when the order closes while a dialog is open: OrderActions returns null and the dialog unmounts. Focus falls to body, same as Radix's default. Acceptable.
- Stacked-table specificity: `max-sm:empty:hidden` (0,2,0) would correctly beat `[&_td]:block` (0,1,1) if it ever matched. Grid auto-placement in commission-table: auto-placed cells flow after the explicitly placed rows 1-3 (body) and rows 1-2 (footer), as intended.
- `commission-total-net` now includes the hidden "Phải trả" label in its textContent. The test uses `toHaveTextContent` (substring match), so it still passes.
- Removing `variant: "destructive"` from `ActionSpec` has no other consumers.
- The capture script is dev-only: mock-mode `/src/mocks/db.ts` import, closes the browser in `finally`, exits non-zero on errors. No issues.

## Unresolved questions
1. L1: was the board meant to open the column with the oldest overdue *work* (for example accepted for more than N minutes)? As written the rule cannot pick anything except "Đã gửi".
2. Many untracked PNGs under plans/reports/enhance-ux-ax-261002-1512-customer-mobile/ are in the worktree. Confirm they are intentionally excluded from this change set.
