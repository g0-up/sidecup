# UX/AX review: sidecup seller pages (mobile and desktop) — 2026-10-05

## Verdict

The seller pages work well on a desktop, and no page scrolls sideways at any of the
four widths. On desktop the order board reads at a glance: three status columns, a
yellow border on late orders, and verb-first action buttons.

On a phone, however, the pages are the desktop layout squeezed down, not recomposed:

- Every management table hides its right-hand columns behind a horizontal scroll,
  which hides 122–477 px. Those columns hold the controls the seller came for: the
  "sold out" switch and "Sửa" on Món, and "Xem thẻ"/"Thu hồi" on a partner's tables.
  On Báo cáo they hold the money columns, "Phải trả" included.
- The board stacks all three status columns into a single long page. Each column
  heading pins itself under the sticky header, where it cannot be seen.
- At 320 px the sticky header grows to 136 px (21 % of the screen), and the VietQR
  payment dialog overflows its own padding.

Two problems hurt trust at every width:

- The destructive buttons are colored backwards. "Không gặp khách" is solid red on
  the board, but every confirm step renders navy, because the `bg-destructive` class
  loses to the button's own `bg-primary`.
- Five kinds of control fall below the 24 px WCAG 2.2 minimum.

Report DONE status: **met**. This is a default-mode review, so nothing has been
implemented. The project DONE contract below is the target and is not claimed.

## Scope and environment

- **Mode:** default (review → analyze → propose → define DONE; no implementation).
- **Focus:** every seller route:
  - `/seller/login`;
  - `/seller`: the open and closed tabs, the reject confirm, the VietQR dialog;
  - `/seller/orders/:id`;
  - `/seller/products` and its product form;
  - `/seller/partners` and its partner form;
  - `/seller/partners/:id`, with its QR card dialog;
  - `/seller/partners/:id/print`;
  - `/seller/settings`;
  - `/seller/reports`, both the commission and funnel tabs.

  That is 17 scenes per viewport. The menu-open scene runs only below 768 px.
- **Viewports:** 1440 × 900, 768 × 1024, 375 × 812 and 320 × 640, per
  [docs/review.md](../../docs/review.md#khung-nhìn). Touch emulation is on below
  1024 px.
- **Run:** `cd apps/web && VITE_USE_MOCK=1 npx vite --port 5173 --strictPort` on MSW
  mock data, at commit `8746137` (master). I signed in with the mock password
  `password`. No real credentials were used and no real form was submitted.
- **Seeded data:** five orders, injected into the mock DB before sign-in:
  - two in "Đã gửi": one 10 s old with a note, one 95 s old and late;
  - one each in "Đang pha", "Đang mang ra" and "Đã thu tiền".
- **Capture:** a scratch Playwright script, modelled on
  [`capture-customer-audit.mjs`](../../apps/web/scripts/capture-customer-audit.mjs).
  For each scene it saves a full-page PNG and a `-fold` PNG. It writes
  [`audit.json`](./enhance-ux-ax-261005-1017-seller-responsive/round-1/audit.json),
  which records for each scene:
  - document title and `h1`;
  - page overflow;
  - sticky header height;
  - pixels hidden inside table scroll containers;
  - targets under 24 px and under 44 px;
  - inputs under 16 px.

  A second scratch script scrolled the mobile board to measure the sticky column
  heading.
- **Mock artefact, not a finding:** the yellow banner "Kết nối chậm, đang tự thử
  lại" shows on every screen. The mock has no WebSocket, so the board always runs on
  its polling fallback.
- **Checks that could not run, or were not run:**
  - **Discovery scan:** not run for this focus. Seller routes are private:
    [nginx.conf](../../apps/web/nginx.conf) sends `X-Robots-Tag: noindex, nofollow`
    for `/seller`, as [review.md](../../docs/review.md#không-lập-chỉ-mục-route-theo-token)
    records. The public discovery surfaces are unchanged since the customer round.
    No discovery result is claimed here.
  - **Lighthouse and Web Vitals:** not run, so performance feel is scored from
    observation only.
  - **Real WebSocket and Zalo notifier:** not exercised on the mock.
  - **Production build and nginx headers:** not exercised.
  - **Screen readers:** not tested.

## Baseline evidence

Evidence folder: `enhance-ux-ax-261005-1017-seller-responsive/round-1/`. That is
135 files: two PNGs per scene and viewport, `audit.json`, and one extra scrolled
board shot. All 66 scenes captured with no errors. The partner-detail scene was
captured a second time, after React kept the list page on screen while the lazy
route loaded, and its rows are merged into `audit.json`.

| Measure | 1440 | 768 | 375 | 320 |
|---|---|---|---|---|
| Page horizontal overflow | none | none | none | none |
| Sticky header height | 52 px | 92 px (two rows) | 96 px | **136 px (three rows, 21 %)** |
| Scenes with a scrolling table | 0 | 1 (reports, 29 px) | 8 (122–422 px) | 8 (177–477 px) |
| Inputs under 16 px | 0 | 0 | 0 | 0 |
| Interactive targets under 44 px, summed over scenes | — | — | 182 | — |
| Distinct `document.title` values across 16 desktop seller scenes | 1 ("Màn người bán") | | | |
| Scenes with no `h1` | board, order detail, print | | | |

Key screenshots (`-fold` is the first screen; the name without it is the full
page):

| Scene | Desktop | Tablet | Mobile | 320 |
|---|---|---|---|---|
| Board | `desktop-seller-board-fold.png` | `tablet-seller-board.png` | `mobile-seller-board.png` | `narrow320-seller-board-fold.png` |
| Board scrolled | | | `mobile-seller-board-scrolled-fold.png` | |
| Menu open | | | `mobile-seller-nav-open-fold.png` | `narrow320-seller-nav-open-fold.png` |
| Reject confirm | `desktop-seller-reject-confirm.png` | | `mobile-seller-reject-confirm-fold.png` | |
| VietQR | `desktop-seller-vietqr.png` | | `mobile-seller-vietqr-fold.png` | `narrow320-seller-vietqr-fold.png` |
| Products | `desktop-seller-products.png` | | `mobile-seller-products.png` | `narrow320-seller-products.png` |
| Partner detail | `desktop-seller-partner-detail.png` | | `mobile-seller-partner-detail.png` | `narrow320-seller-partner-detail.png` |
| Reports | `desktop-seller-reports.png` | `tablet-seller-reports.png` | `mobile-seller-reports.png` | `narrow320-seller-reports.png` |
| Settings | `desktop-seller-settings.png` | | `mobile-seller-settings.png` | `narrow320-seller-settings-fold.png` |

**Discovery scan:** not run (see above). This is not a pass.

## Scores

Seller screens are a working tool, not a marketing page. I read "storytelling" as
how well the screens follow the order lifecycle. The "Brand" section of
[design.md](../../docs/design.md) does not apply to them (line 3).

| Area | Score 0–3 | Evidence |
|---|---|---|
| First impression | 2 | On desktop, all open orders and their next action are visible in one screen (`desktop-seller-board-fold.png`). At 320 the header and banner take 168 px, and only one order card fits above the fold (`narrow320-seller-board-fold.png`). |
| Brand recall | 1 (accepted) | The header carries only the text "Gọi nước" on navy. design.md:3 exempts seller screens from the brand rules, so this is recorded and gets no proposal. |
| Content punch | 2 | Actions are verbs ("Nhận đơn", "Mang ra bàn", "Thu tiền mặt"). Each page has a one-line helper, such as "Tắt công tắc khi hết món; menu khách cập nhật ngay." |
| Clarity and hierarchy | 1 | The board has no `h1` (audit.json). On mobile, "Đang mang ra" starts 1,240 px down (`mobile-seller-board.png`). Column headings hide under the header once you scroll (P3). The danger colors are inverted (P1). |
| Storytelling (lifecycle flow) | 2 | On desktop the columns run left to right in lifecycle order: sent, then accepted, then delivering. Closed orders sit in their own tab. The mobile stack keeps the order but loses the overview. |
| Knowledge and trust | 2 | Rejecting an order or recording a customer no-show needs a confirm step. The VietQR dialog shows the amount, the transfer note, the recipient and the account. Trust is weakened when the confirm button shows no danger color (P1), and when logout is one tap from the sound toggle on mobile (P6). |
| Motion | 2 | The global reduced-motion rule covers everything. `sound-toggle.tsx:21` uses `animate-pulse` instead of `motion-safe:animate-pulse` (design.md:36). |
| Responsive | 1 | No page overflows, but on phones 8 of 17 scenes hide their key columns inside a table scroll (P2, P4). The header is 136 px at 320. The VietQR dialog overflows at 320 (P5). Fixed-width filters are used (P8). At 768 the three columns squeeze each card to 235 px, so even "1 phút 35 giây" wraps (`tablet-seller-board.png`). |
| Accessibility | 1 | Targets below 24 px (P6): the phone link is 20 px, "← Bảng đơn" is 17 px, the dialog close button is 16 px, the product switch is 18 px and the partner name link is 17 px. All 16 desktop scenes share one title. Three scenes have no `h1`. The menu button has no `aria-expanded`. The dialog close label is "Close" in English. |
| Performance feel | 2 (provisional) | Routes are lazy and feel immediate on the mock. Nothing was measured, so this score is provisional and is not a pass. |

## Proposals

### P1: Make destructive steps look destructive (Must)

- **Evidence:**
  - `mobile-seller-reject-confirm-fold.png`: the "Xác nhận" button for "Từ chối" is
    navy.
  - [order-actions.tsx:75](../../apps/web/src/features/seller-orders/components/order-actions.tsx)
    passes `className="bg-destructive …"`.
  - [alert-dialog.tsx:154-157](../../apps/web/src/shared/ui/alert-dialog.tsx)
    renders `<Button variant="default" asChild>`. Slot joins the two class lists
    without tailwind-merge, so `bg-primary` wins.
  - On the board, "Không gặp khách" is solid red at the first step
    (`desktop-seller-board-fold.png`, `mobile-seller-board.png`). design.md:21 says
    the first step uses `outline` with `text-destructive`, and solid red appears only
    at the confirm step.
  - [table-list.tsx:169](../../apps/web/src/features/admin-partners/components/table-list.tsx)
    and [zalo-card.tsx:204](../../apps/web/src/features/admin-settings/components/zalo-card.tsx)
    already pass `variant="destructive"` correctly.
- **Change:**
  - In `order-actions.tsx`, use `variant="destructive"` on `AlertDialogAction` and
    drop the class override.
  - Give the "Không gặp khách" and "Từ chối" board buttons `outline` +
    `text-destructive`.
- **Files:**
  - `apps/web/src/features/seller-orders/components/order-actions.tsx`
  - `apps/web/src/features/seller-orders/store.ts`, if the variant lives in the
    action table.
- **Acceptance:**
  - The reject and no-show confirm buttons compute to the `--destructive`
    background in a screenshot at 375 and 1440.
  - No board card shows a solid red button before its confirm step.
  - `grep -n "bg-destructive" apps/web/src/features/seller-orders` returns nothing.

### P2: Recompose management tables as stacked rows on phones (Must)

- **Evidence:** `audit.json` `tablesScrolling`:
  - On Món, 206 px is hidden at 375 and 261 px at 320. The "Trạng thái" switch and
    "Sửa" are off-screen (`mobile-seller-products.png`).
  - On a partner's tables, 335 px is hidden at 375 and 390 px at 320, which hides
    "Xem thẻ"/"Thu hồi" (`narrow320-seller-partner-detail.png`).
  - On the partner list, 204 px is hidden at 375 and 259 px at 320.
  - Cause: [table.tsx:70,83](../../apps/web/src/shared/ui/table.tsx) sets
    `whitespace-nowrap` on every cell.
- **Change:** below `sm`, render each row as a stacked item and keep the table from
  `sm` up.
  - **Món row:** the name with its price below it on the left; on the right, the
    "Đang bán / Hết món" switch with its visible label, then "Sửa"; "Tuỳ chọn" and
    "Thứ tự" muted underneath.
  - **Partner table row:** the label and code, the link truncated to one line, then
    "Xem thẻ" and "Thu hồi" as full-width buttons.
  - **Partner list row:** the name link, the status badge, then the commission,
    period and hours.

  Keep the existing accessible names so the e2e selectors still match.
- **Files:**
  - `apps/web/src/features/admin-products/page.tsx` and `components/product-row.tsx`
  - `apps/web/src/features/admin-partners/pages/list.tsx`
  - `apps/web/src/features/admin-partners/components/table-list.tsx`
- **Acceptance:**
  - At 375 and 320, `audit.json` shows no `tablesScrolling` entry for products,
    partners or partner detail.
  - The sold-out switch and "Sửa" for every product are inside the first 375 px of
    width in `mobile-seller-products.png`.
  - The desktop screenshots are unchanged.

### P3: Board columns: a status switcher below `lg`, and visible headings (Must)

- **Evidence:**
  - `mobile-seller-board-scrolled-fold.png` was taken at `scrollY` 568. The column
    `h2` is pinned at 0–28 px, under the 96 px sticky header.
    [board.tsx:55](../../apps/web/src/features/seller-orders/pages/board.tsx) uses
    `sticky top-0 z-10` while the header uses `sticky top-0 z-30`.
  - In `mobile-seller-board.png`, the "Đang mang ra" column begins about 1,240 px
    down.
  - At 768, `md:grid-cols-3` squeezes cards to 235 px wide. Elapsed time wraps, and
    the three delivery buttons stack (`tablet-seller-board.png`).
- **Change:**
  - Below `lg`, show one column at a time behind a segmented control: "Đã gửi (n)",
    "Đang pha (n)", "Đang mang ra (n)". Show a dot when a column holds unseen or late
    orders. Default to the column with the oldest late order, else "Đã gửi".
  - Keep `lg:grid-cols-3` for desktop.
  - On desktop, offset the sticky heading by the header height, or drop the sticky.
- **Files:**
  - `apps/web/src/features/seller-orders/pages/board.tsx`
- **Acceptance:**
  - At 375 and 768, every status is reachable in at most one tap without scrolling.
  - A late order in any column is signalled in the switcher.
  - After scrolling, no column heading's bottom is above the header's bottom
    (same measurement as the scrolled shot).
  - At 1440 the three columns still sit side by side.

### P4: Make report money columns readable on phones (Must)

- **Evidence:**
  - The commission table hides 422 px at 375 and 477 px at 320, so only "Quán",
    "Kỳ" and part of "Đơn thu tiền" show; "Phải trả" is off-screen
    (`mobile-seller-reports.png`).
  - The funnel table hides 122 px at 375 and 177 px at 320.
  - At 768 the commission table still hides 29 px.
- **Change:**
  - Below `sm`, render one block per partner: the name and period as a heading;
    "Phải trả" large; revenue, commission, adjustments and the "không giao" count as
    a two-column `dl`. Give the total its own block.
  - Render the funnel the same way.
  - Keep the table from `sm` up, and let it wrap headers at `md` so 768 fits.
- **Files:**
  - `apps/web/src/features/admin-reports/components/commission-table.tsx`
  - `apps/web/src/features/admin-reports/components/funnel-table.tsx`
  - `apps/web/src/features/admin-reports/components/adjustment-list.tsx`
  - Update `commission-table.test.tsx` if its queries depend on table roles.
- **Acceptance:**
  - At 375, 320 and 768, `audit.json` has no `tablesScrolling` entry for the reports
    scenes.
  - "Phải trả" for every partner and for the total is visible without horizontal
    scrolling.
  - `pnpm test` passes.

### P5: Fit the VietQR dialog at 320 and keep titles clear of the close button (Must)

- **Evidence:**
  - In `narrow320-seller-vietqr-fold.png`, the 240 px QR plus `p-3` makes a 264 px
    block in a 240 px content box. The grid widens, so "95.000đ", "NGUYEN VAN A" and
    the account number touch the dialog edge. The title runs under the close "×".
  - Cause: [vietqr-dialog.tsx:48-49](../../apps/web/src/features/seller-orders/components/vietqr-dialog.tsx).
  - This is the screen the seller shows the customer while taking money.
- **Change:**
  - Let the QR scale: wrap it in `w-full max-w-60` and render the SVG with
    `h-auto w-full`.
  - Give the `dl` `min-w-0`.
  - Add right padding to dialog headers that sit beside the close button.
- **Files:**
  - `apps/web/src/features/seller-orders/components/vietqr-dialog.tsx`
  - `apps/web/src/shared/ui/dialog.tsx`, if the header padding is fixed there.
- **Acceptance:**
  - At 320, every `dd` in the dialog ends at least 24 px inside the dialog's right
    edge.
  - The title does not intersect the close button's box.
  - The QR is still at least 200 px wide and scans from a phone.

### P6: Meet the 24 px minimum everywhere and 44 px on service-time controls (Must for 24 px, Should for 44 px)

- **Evidence:** `audit.json` `under24`:
  - the `tel:` link is 102 × 20 ([order-card.tsx:79](../../apps/web/src/features/seller-orders/components/order-card.tsx));
  - "← Bảng đơn" is 80 × 17 ([order-detail.tsx:26](../../apps/web/src/features/seller-orders/pages/order-detail.tsx));
  - the dialog close button is 16 × 16 ([dialog.tsx:66-76](../../apps/web/src/shared/ui/dialog.tsx));
  - the product switch has no label and is 32 × 18 (`product-row.tsx`);
  - the partner name link is 66 × 17 (`list.tsx`).

  Service-time controls under 44 px:
  - order actions, 40 px;
  - the order code link, 28 px;
  - tabs, 29 px;
  - nav links, 32 px (`mobile-seller-nav-open-fold.png`);
  - the menu and logout icons, 36 px;
  - "Bật âm báo", 32 px;
  - "Sửa", 32 px.

  The dialog close label is "Close" ([dialog.tsx:75](../../apps/web/src/shared/ui/dialog.tsx),
  [sheet.tsx:77](../../apps/web/src/shared/ui/sheet.tsx)).
- **Change:**
  - **24 px fixes (Must):** pad the phone link, back link and partner name link to at
    least 24 px. Make the dialog close button `size-9` (36 px), labelled "Đóng". Wrap
    the product switch in a label with its status text so the whole row segment is
    the target.
  - **44 px service controls (Should):** add `min-h-11` to order actions, the code
    link, the phone link, board tabs and nav links on mobile. Make the header icons
    `size-11` below `md`.
- **Files:**
  - `seller-orders/components/order-card.tsx`
  - `seller-orders/components/order-actions.tsx`
  - `seller-orders/pages/order-detail.tsx`
  - `seller-orders/pages/board.tsx`
  - `app/seller-layout.tsx`
  - `admin-products/components/product-row.tsx`
  - `admin-partners/pages/list.tsx`
  - `shared/ui/dialog.tsx`
  - `shared/ui/sheet.tsx`
- **Acceptance:**
  - At all four widths, `audit.json` `under24` contains only Radix's hidden native
    `select` (1 × 1).
  - At 375, the board and dialog scenes list no action, tab or nav link under 44 px
    in `targetsUnder44`.
  - The dialog close button's accessible name is "Đóng".

### P7: Compact the mobile header and make the menu accessible (Should)

- **Evidence:**
  - The header is 96 px at 375 and 136 px at 320 (`audit.json` `headerHeights`). At
    320 its right-side cluster wraps onto two rows (`narrow320-seller-board-fold.png`).
  - With the menu open, the sticky header grows to about 280 px and pushes the page
    down (`mobile-seller-nav-open-fold.png`).
  - The menu button has no `aria-expanded`/`aria-controls`
    ([seller-layout.tsx:60](../../apps/web/src/app/seller-layout.tsx)).
  - Logout is a one-tap icon 8 px from "Bật âm báo", with no confirm
    (seller-layout.tsx:82).
- **Change:** below `md`, use one 56 px row with the menu button, "Gọi nước", the
  pause switch (icon plus state), and the sound icon.
  - Move "Đăng xuất" and the text labels into the menu panel.
  - Open the panel as an overlay that does not push content.
  - Close it on Esc and on outside tap.
  - Set `aria-expanded` and `aria-controls`.
  - Desktop stays as it is.
- **Files:**
  - `apps/web/src/app/seller-layout.tsx`
  - `seller-orders/components/pause-switch.tsx`
  - `seller-orders/components/sound-toggle.tsx`
- **Acceptance:**
  - Sticky header height is at most 64 px at 375 and 320.
  - Opening the menu does not change the `scrollY` or position of the first order
    card.
  - The button reports `aria-expanded="true"` when open.
  - Logout is not reachable from the closed mobile header.

### P8: Replace fixed-width controls with fluid widths (Should)

- **Evidence:**
  - [report-filters.tsx:30,46,61,68,72](../../apps/web/src/features/admin-reports/components/report-filters.tsx)
    uses `w-52` and `w-40`.
  - [table-list.tsx:211](../../apps/web/src/features/admin-partners/components/table-list.tsx)
    uses `w-44`. At 320 the "Thêm bàn" button ends at x = 315, past the 16 px gutter
    (`narrow320-seller-partner-detail.png`).
  - [settings-form.tsx:92](../../apps/web/src/features/admin-settings/components/settings-form.tsx)
    uses `w-32`.
- **Change:** below `sm`, use `w-full sm:w-52` and similar widths, or a
  `grid sm:flex` row. Let the add-table input be `flex-1 min-w-0`.
- **Files:** the three files above.
- **Acceptance:**
  - At 320, every control's right edge is ≤ 304 px.
  - The filters fill the row at 375.

### P9: Give every seller route a title and an `h1` (Should)

- **Evidence:**
  - `audit.json` `titles`: 16 desktop scenes share "Màn người bán", which breaks
    design.md:54 ("Mỗi route và mỗi trạng thái … có tiêu đề riêng qua
    `useDocumentHead`").
  - The board, order detail and print scenes have no `h1`.
  - A seller who keeps the board and reports open in two tabs cannot tell them
    apart, and screen readers announce the same title everywhere.
- **Change:**
  - Call `useDocumentHead` in each seller page. The board title can carry the
    open-order count, for example "(3) Đơn · Gọi nước".
  - Add a visually hidden `h1` "Bảng đơn" to the board, "Đơn #CODE" to order detail,
    and "In thẻ QR" to print.
- **Files:**
  - every page under `apps/web/src/features/seller-*/pages`, `admin-*/page.tsx` and
    `admin-*/pages`
- **Acceptance:**
  - `audit.json` shows a distinct title per scene and a non-empty `h1` per route.

### P10: Promote the seller capture to the repo and document the seller rules (Should)

- **Evidence:**
  - [review.md](../../docs/review.md) and [design.md](../../docs/design.md) cover
    customer screens only.
  - `capture-customer-audit.mjs` captures seller pages only at desktop, and only for
    login and settings. Its comment says the 44 px rule applies only to customer
    screens.
  - This review relied on a scratch script.
- **Change:**
  - Add `apps/web/scripts/capture-seller-audit.mjs`: the four viewports, the seeded
    orders, the 17 scenes, and table, header and sticky-heading measurements.
  - Add a "Màn người bán" section to design.md with:
    - the target threshold (answer to question 1);
    - stacked rows instead of tables below `sm`;
    - the danger-color rule;
    - a header height of at most 64 px on phones.
  - Add a seller checklist to review.md.
- **Files:**
  - `apps/web/scripts/capture-seller-audit.mjs` (new)
  - `docs/design.md`
  - `docs/review.md`
- **Acceptance:**
  - `node scripts/capture-seller-audit.mjs <url> <dir>` writes 66 scenes with 0
    errors.
  - Both docs link the script.

### P11: Small consistency fixes (Could)

- **Motion:** `sound-toggle.tsx:21` should use `motion-safe:animate-pulse`.
- **Board width:** [board.tsx:31](../../apps/web/src/features/seller-orders/pages/board.tsx)
  uses `max-w-7xl` while other pages use `max-w-5xl`. Either is fine; the jump
  between tabs is visible on desktop, so choose one deliberately.
- **Active nav on order detail:** on `/seller/orders/:id`, no nav item is active,
  because "Đơn" uses `end` (seller-layout.tsx:19). Mark "Đơn" active for
  `/seller/orders/*` as well.
- **Duplicate pause switch:** the pause switch appears both in the header and in
  settings' "Nhận đơn" card. Keep one, or make the card read-only with a pointer to
  the header.
- **Keyboard on order cards:** a card marks itself seen through `onClick` on
  `<article>` ([order-card.tsx:30-31](../../apps/web/src/features/seller-orders/components/order-card.tsx)).
  Keyboard users can only use "Đã xem n đơn mới". Mark a card seen on `focusin` too.
- **Acceptance:** each item is visible in the code diff, and the reduced-motion
  Playwright check reports `animation-name: none` on the sound toggle.

## DONE contract

Implementation is DONE only when every line is true and evidenced:

1. P1–P9 meet their acceptance checks. Each skipped Should item has a reason
   accepted in the report.
2. Seller routes are still private:
   - `curl -sI <prod>/seller` returns `X-Robots-Tag: noindex, nofollow`;
   - `sitemap.xml` still lists only `/`;
   - `check-discovery-surfaces.mjs` against the public site gives a result no worse
     than the customer round.
3. Screenshots of every changed seller page at 1440 × 900, 768 × 1024, 375 × 812 and
   320 × 640 show no horizontal overflow, clipped text, overlap or hidden primary
   control, and the vision review finds no High issue.
4. No rubric area regresses. Clarity, Responsive and Accessibility reach at least 2.
   Brand recall stays an accepted exemption (design.md:3).
5. Keyboard and reduced-motion checks pass on the changed controls:
   - the menu toggles with Enter and closes with Esc;
   - focus is trapped in dialogs and returns to the trigger;
   - in the confirm step, focus starts on "Quay lại";
   - the sound toggle does not animate under `reducedMotion: "reduce"`.
6. `make lint`, `make test`, `pnpm build` and the Playwright e2e suite pass, or
   failures are shown to be pre-existing. The reject and happy-path specs drive the
   board.
7. `docs/design.md` and `docs/review.md` have seller sections, and the existing
   content is preserved. The repo has no `DESIGN.md`/`REVIEW.md`/`AGENTS.md`; these
   two docs are the owning surfaces.
8. Dev servers and capture processes started for the work are stopped, and
   `apps/web/public/mockServiceWorker.js` stays untracked or is removed.

## Unresolved questions

1. **Touch-target threshold:** should seller screens follow the customer 44 px rule
   everywhere, or 44 px only for board and dialog controls used during service and
   the 24 px WCAG minimum on management pages? P6 assumes the split.
2. **Default status on mobile:** the board switcher in P3 defaults to the column
   holding the oldest late order. Would you rather it always open on "Đã gửi"?
3. **Logout on mobile:** is moving logout into the menu (P7) enough, or should it
   also ask for confirmation, since a signed-out seller stops hearing new orders?
4. **Pause switch:** should it stay in both the header and Settings (P11), or only in
   the header?
