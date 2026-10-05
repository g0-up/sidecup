# Implementation report: seller responsive UX and AX

- **Date:** 2026-10-05
- **Plan:** [`plans/261005-1151-seller-responsive-ux-ax/plan.md`](../261005-1151-seller-responsive-ux-ax/plan.md)
- **Review:** [`enhance-ux-ax-261005-1017-seller-responsive.md`](./enhance-ux-ax-261005-1017-seller-responsive.md)
- **Evidence:** [`enhance-ux-ax-261005-1017-seller-responsive/round-2/`](./enhance-ux-ax-261005-1017-seller-responsive/round-2/) (67 PNGs and `audit.json`)
- **Code review:** [`code-review-261005-seller-responsive.md`](./code-review-261005-seller-responsive.md)

## What changed

| Proposal | Change |
|---|---|
| P1 danger colors | Danger triggers ("Từ chối", "Không gặp khách", "Thu hồi") are outline or ghost with `text-destructive`. The confirm action uses `variant="destructive"`; the `alert-dialog` class merge was fixed so the variant applies. |
| P2 management tables | `<Table stacked>`: below `sm`, rows become grid blocks with placed cells (products, partners, tables). |
| P3 board on phones | One column below `lg`, chosen in a "Chọn cột" group with red dots for new or late orders. The default is the column with the oldest late order, decided on first load. Column headings no longer stick under the header. |
| P4 reports | Commission, funnel and adjustment tables stack below `sm`, with visible labels. Headers wrap from `sm` to `lg`. |
| P5 VietQR and dialogs | The QR scales at 320 px. Close buttons are labeled "Đóng". |
| P6 targets | Service controls are ≥ 44 px below `lg`, including the dialog and sheet close button (`size-11`, `lg:size-9`) and the sound toggle. Management controls are ≥ 24 px; checkbox and switch labels get `min-h-6`. |
| P7 header | One row below `lg` (56 px). Nav and logout move into a `Sheet` menu. Logout asks for confirmation at every width. |
| P8 fluid widths | Filters and inputs are `w-full` below `sm` (reports, settings ETA, add table). |
| P9 titles and `h1` | Every route has a "<Page> — Gọi nước" title; the board title includes the open count. Each route has an `h1`, and the board's is `sr-only`. |
| P10 capture | [`apps/web/scripts/capture-seller-audit.mjs`](../../apps/web/scripts/capture-seller-audit.mjs) covers 17 scenes at 4 viewports. |
| P11 polish | Active "Đơn" on order detail. The title blink no longer clobbers titles. The sound pulse is `motion-safe`. Order cards are marked seen on `focusin`. There is a single pause switch in the header, with the fixed name "Nhận đơn"; Settings shows read-only status. All `Dialog` and `AlertDialog` content returns focus to its opener (`useReturnFocus`). |

## DONE contract

| # | Item | Result |
|---|---|---|
| 1 | P1–P9 acceptance | Met. The audit summary is clean (below), and the screens were checked by eye at 320, 375, 768 and 1440 px. |
| 2 | Seller routes private | `nginx.conf` (the `X-Robots-Tag` rule for `/seller`, and a sitemap with only `/`) is unchanged since HEAD. No public surface changed, so the header was not curled against prod and the discovery-surface scan was not re-run. |
| 3 | Screenshots | Round 2 has 67 pages and 0 errors. `overflowX`, `tablesScrolling`, `under24`, `serviceUnder44`, `missingH1` and `stickyHeadings` are empty, and `smallInputs` is 0. |
| 4 | Rubric | See the scores below; no area regressed. |
| 5 | Keyboard and reduced motion | Pass. The menu opens with Enter (`aria-expanded` false→true), traps focus, closes with Esc, and returns focus to "Mở menu". Reject confirm starts on "Quay lại", traps focus, and returns it to "Từ chối". VietQR returns focus to "Chuyển khoản". Logout starts on "Ở lại". The sound toggle's `animation-name` is `none` with reduced motion and `pulse` without it. |
| 6 | Checks | `make lint` passes. `make test`: the API passes. Web has 136 passed and 8 failed; all 8 are pre-existing (`RequestInit: Expected signal … AbortSignal` under local Node 24, the same tests fail on HEAD). For `pnpm build`, `tsc -b` passes; `vite build` passes into a scratch out dir because `apps/web/dist/.vite` is not writable (EACCES). E2E: Chromium 11/11 passed on the final code, including reject, happy path and paused; WebKit was not run because of missing host libraries. |
| 7 | Docs | A "Màn người bán" section was added to `docs/design.md`, and a seller checklist to `docs/review.md`. The existing content is unchanged. |
| 8 | Processes | The dev server (5173) is stopped. The isolated e2e compose project is down with its volume removed. `public/mockServiceWorker.js` is removed. The user's containers were not touched. |

## Code review

Report: [`code-review-261005-seller-responsive.md`](./code-review-261005-seller-responsive.md). It found no critical or high issues.

| Finding | Outcome |
|---|---|
| M1: admin dialogs opened from state drop focus to `<body>` | Fixed once in the shared `DialogContent` and `AlertDialogContent` (new `shared/hooks/use-return-focus.ts`). The per-component code in order-actions and vietqr was removed. In the browser, focus returns to "Thêm món", "Sửa …", "Sửa quán", "Xem thẻ" and "Thu hồi". |
| M2: the pause switch's name flipped with its state | Fixed. `aria-label="Nhận đơn"` is fixed, and the status text is `aria-hidden`. |
| M3: the new board logic had no tests | Fixed. Added `isLate` tests (the 60 s edge, no clock, other statuses) and board tests (picker `aria-pressed`, late dot, column visibility, focus return after "Quay lại"). |
| L1: `defaultColumn` always picks "Đã gửi" | Kept. It follows the user's decision; see the open questions. |
| L2: empty action cell on revoked rows | Fixed. The wrapper renders only for active rows. |
| L3: funnel day indent lost below `sm` | Fixed with `max-sm:ml-4`. |
| L4: the whole board re-rendered every second | Fixed. `ColumnPicker` owns `useNow`. |
| L5: the sound toggle's visible text was missing from its name | Fixed. The name is "Âm báo bật, chạm để tắt". |
| L6: two writers of `document.title` | Not changed. Informational only; navigation transitions prevent the race today. |

## Scores after

| Area | Before | After | Evidence |
|---|---|---|---|
| First impression | 2 | 3 | At 320 px, the header is 56 px, and the late order with its two actions is above the fold (`narrow320-seller-board-open.png`). |
| Content punch | 2 | 2 | Unchanged copy. Settings now says where to toggle orders. |
| Clarity and hierarchy | 1 | 2 | Each route has an `h1`. The danger colors are correct. Every column is one tap away on phones. |
| Storytelling | 2 | 2 | Column order is kept on desktop. On phones, the switcher shows counts in lifecycle order. |
| Knowledge and trust | 2 | 3 | The confirm steps look destructive, focus starts on the safe option, and logout warns that order alerts stop. |
| Motion | 2 | 3 | The sound pulse is `motion-safe`. The global reduced-motion rule is intact. |
| Responsive | 1 | 3 | No table scrolls on phones, no overflow, fluid filters, and VietQR fits at 320 px. |
| Accessibility | 1 | 2 | All targets ≥ 24 px, service targets ≥ 44 px, distinct titles, `aria-expanded`, "Đóng" labels, and focus returns to the trigger. In stacked mode, table semantics rely on visible labels. |
| Performance feel | 2 (prov.) | 2 (prov.) | Not measured. |

## Limitations and open questions

- **Default column (review L1):** the user chose "oldest late order". Only "sent" orders can be late under the current rule (`isLate`), so the default is always "Đã gửi" today. Decide whether "late" should include accepted orders older than N minutes.
- **Stacked tables:** below `sm`, the CSS grid layout keeps the `<table>` element, but the header row is hidden. Screen readers may announce cells without column headers; the visible `sm:hidden` labels mitigate this for numeric cells.
- **Unit tests:** 8 pre-existing failures under Node 24 locally. Confirm on CI (Node 22).
- **`apps/web/dist` permissions:** the directory looks root-owned from a Docker build. Run `sudo chown -R $USER apps/web/dist` (or delete it) so `pnpm build` works locally.
- **WebKit e2e:** needs `sudo pnpm exec playwright install-deps` on this host.
- **Brand at 320 px:** the header brand truncates to "Gọi n…" next to the switch. The seller brand is exempt (design.md), but a shorter mark could replace it.
