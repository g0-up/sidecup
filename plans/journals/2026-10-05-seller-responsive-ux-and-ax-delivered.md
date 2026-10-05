---
title: Seller responsive UX and AX delivered
date: 2026-10-05
summary: Seller screens shipped uncommitted; review caught dialogs from state dropping focus to body and a pause switch whose name flipped with its state
---

# Seller responsive UX and AX delivered

# Seller responsive UX and AX delivered

## What happened

Plan `plans/261005-1151-seller-responsive-ux-ax` is implemented across `/seller/*`.
Danger colors appear only in the confirm step. Management tables use `<Table stacked>`
below `sm`. Below `lg` the board shows one column, picked in a "Chọn cột" group that
defaults to the column with the oldest late order. The header is one row with a
`Sheet` menu and a logout confirm. Service targets are 44 px and management targets
24 px. Each route has its own title and an `h1`. One "Nhận đơn" pause switch remains.
`apps/web/scripts/capture-seller-audit.mjs` captures the audit; round 2 had 67 pages
and 0 errors. Report: `plans/reports/implementation-261005-seller-responsive-ux-ax.md`.

The review found no critical issues, but four lessons stuck:

- Radix Dialog returns focus only to its own `Trigger`. Admin dialogs opened from
  state dropped focus to `<body>`. I had already patched order-actions and vietqr
  one by one, which was the wrong layer. It is now fixed once in the shared
  `DialogContent` and `AlertDialogContent` through `shared/hooks/use-return-focus.ts`,
  and the per-component code is gone.
- The stacked-table descendant selectors (specificity 0,1,1) beat utility padding,
  so the funnel day indent vanished below `sm`. Use margin (`max-sm:ml-4`).
- The 1-second `useNow` tick re-rendered the whole board. `ColumnPicker` now owns it.
- The pause switch's accessible name flipped with its state, so a screen reader
  user heard a different control after each toggle. The name is now fixed at
  "Nhận đơn" and the status text is `aria-hidden`.

## Decision

- Fix focus return in the shared primitive, not per caller, and check it in the
  browser: focus now returns to "Thêm món", "Sửa …", "Sửa quán", "Xem thẻ" and "Thu hồi".
- Kept the user's default-column rule even though it always lands on "Đã gửi",
  because only sent orders can be late.
- Port 5432 belongs to another project's container again. E2E ran in an isolated
  compose project on 55432 instead of stopping it.

## Verification

Lint and `tsc -b` pass. Web tests: 136 pass. 8 fail with `RequestInit: Expected
signal … AbortSignal` under local Node 24, and the same 8 fail on HEAD. `vite build`
only works into a scratch outDir because `apps/web/dist` is root-owned (EACCES).
Chromium e2e passes 11/11. WebKit was not run because host libraries are missing,
so Safari behaviour is unverified this round.

## Next steps

- Commit. Nothing is committed because no commit was requested.
- Confirm the 8 test failures on CI with Node 22. If they also fail there, they are
  real failures, not environment noise.
- `chown` `apps/web/dist` so the normal build works again.
- Open: stacked tables lose header semantics for screen readers (visible labels
  mitigate it); the brand truncates at 320 px.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
