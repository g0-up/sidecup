# UX/AX review: sidecup customer pages (mobile) — 2026-10-02

## Verdict

The customer ordering flow already works on a phone. A customer can scan, open the
menu, pick sweetness and ice, review the cart and place an order. Nothing overflows,
even at 320 px, and the sticky gradient CTA is always within thumb reach.

The biggest gain is after the order is placed. The order page is a dead end: it has
no route back to the menu and no "order more" action. Its status shows as small text
with no expected time. The paid state ends without a thank-you or a next step.

Second come six touch targets under 44 px in the sheets the customer uses most, and
inputs that drop to 14 px on tablets, which makes iOS zoom in on focus.

On the AX side, the private token pages (`/t/*`, `/o/*`) have no `noindex` policy.
Order links shared in Zalo get no link-preview card.

Report DONE status: **met**. This is a default-mode review, so nothing has been
implemented. The project DONE contract below is the target and is not claimed.

**Round 2 (after implementation):** see [Round 2](#round-2--after-implementation).
The project DONE contract is met, with one exception: the discovery scan exits 1, but
only on a local-origin artefact that does not occur in production.

## Scope and environment

- **Mode:** default (review → analyze → propose → define DONE; no implementation).
- **Focus:** every customer-facing route, mobile first:
  - `/t/:token`: menu, product sheet, cart sheet, paused state, "today's orders" list
  - `/o/:id`: sent, unconfirmed after 60 s, accepted, delivering and paid states
  - `/revoked`, `/` (home placeholder), unknown QR token, unknown order and the 404 route
- **Code:** commit `6d7ac5b` on `master`, `apps/web` (React 19, Vite 7, Tailwind 4, shadcn/ui).
- **Run:** `VITE_USE_MOCK=1 VITE_SELLER_NAME="Anh Tùng" corepack pnpm exec vite --port 5173`.
  - This is MSW mock mode. `make dev` could not run because port 5432 is held by
    another project's Postgres, which I left alone.
  - Mock data: token `DEVTEST001`, partner "Quán test", table "Bàn 1", four products
    with no images, one of them unavailable.
- **Capture:** Playwright Chromium with iPhone 13 touch emulation at 375×812 and
  locale `vi-VN`, plus 320×640 reflow, 768×1024 tablet and 1440×900 desktop.
  - Seller-side transitions (accept, deliver, paid, pause) went through the mock seller
    API, and all returned 200.
  - Measurements are in `round-1/audit.json`.
- **Checks that could not run, so none of these count as passes:**
  - The real API and WebSocket `/ws/customer`. Mock mode has no socket, so the
    `render-check` WebSocket errors are environmental, and status changes were
    observed by reload.
  - Real iOS Safari and the Zalo in-app browser, including on-screen keyboard
    behaviour inside the bottom sheets.
  - Core Web Vitals on a production build. Dev-mode first paint is not representative.
  - Real product images. Every mock product has `image_url: null`.
  - The production discovery surfaces at `https://sidecup.cauchuyenlaptrinh.com`. I
    did not fetch the live site.
  - Screen-reader passes (VoiceOver/TalkBack). Accessibility was judged from markup
    and screenshots only.

## Baseline evidence

All paths are relative to
`plans/reports/enhance-ux-ax-261002-1512-customer-mobile/round-1/`.

| Page / state | Mobile 375×812 | Reflow 320 | Tablet 768×1024 | Desktop 1440×900 |
|---|---|---|---|---|
| Menu loaded | `mobile-menu-loaded.png` | `narrow320-menu-loaded.png` | `tablet-menu-loaded.png`, `render-menu/` | `desktop-menu-loaded.png`, `render-menu/` |
| Menu first paint (throttled API) | `mobile-menu-first-paint.png` | — | — | — |
| Product sheet | `mobile-menu-product-sheet.png` | `narrow320-menu-product-sheet.png` | `tablet-menu-product-sheet.png` | `desktop-menu-product-sheet.png` |
| Cart bar | `mobile-menu-cart-bar.png` | — | — | — |
| Cart sheet | `mobile-cart-sheet.png`, `mobile-cart-sheet-invalid-phone.png` | `narrow320-cart-sheet.png` | `tablet-cart-sheet.png` | `desktop-cart-sheet.png` |
| Menu with "today's orders" | `mobile-menu-with-my-orders.png` | — | — | — |
| Ordering paused | `mobile-menu-paused.png`, `mobile-cart-sheet-paused.png` | — | — | — |
| Order: sent / unconfirmed / accepted / delivering / paid | `mobile-order-sent.png`, `mobile-order-unconfirmed.png`, `mobile-order-accepted.png`, `mobile-order-delivering.png`, `mobile-order-paid.png` | — | — | — |
| Home, unknown QR, revoked, unknown order, 404 | `mobile-home.png`, `mobile-qr-not-found.png`, `mobile-revoked.png`, `mobile-order-not-found.png`, `mobile-404.png` | — | — | — |

The tablet and desktop columns cover only the menu and its two sheets. That is
deliberate: customers reach these pages from a QR code on a phone, and the order page
uses the same `max-w-md` column. The order and error pages were not captured above
375 px, so they are unverified at those widths.

### Measured results (`audit.json`)

- **Horizontal overflow:** 0 px on every capture, including 320 px.
- **Touch targets under 44 px on customer pages:**

  | Target | Size (px) | Where |
  |---|---|---|
  | Sheet close "Đóng" | 32×32 | every sheet |
  | Quantity − and + | 36×36 | product sheet and cart lines |
  | "Bỏ" (remove line) | about 60×32 | cart |
  | Phone input | 36 px tall | cart |
  | "Chờ thêm" and "Huỷ đơn" | 40 px tall | unconfirmed prompt |
  | "Today's orders" links | 42 px tall | menu |

- **Input font size:** 16 px at 375 and 320 px, 14 px at 768 and 1440 px.
  - Cause: `md:text-sm` in `src/shared/ui/input.tsx:10`.
  - Effect: iOS Safari zooms on focus below 16 px, so iPad and landscape phones zoom.
- **Document title:** "Gọi nước tại bàn" on every route and state (`index.html:9`).
- **First paint:** a fully blank white screen 300 ms after navigation
  (`mobile-menu-first-paint.png`).
  - In dev mode this is mostly unbundled module loading, so it is not proof of the
    production behaviour.
  - It does show that `index.html` has no static shell, so until the JS chunk runs the
    customer sees nothing.

### Discovery scan

I ran `node scripts/check-discovery-surfaces.mjs http://127.0.0.1:5173` without
`--site-origin`, because there is no sitemap to map. The output is in
`round-1/discovery-scan.txt`, and the scan sampled one page.

- **4 errors:**
  - `robots.txt` not served as text. The SPA fallback returns `index.html` with 200.
  - `sitemap.xml` missing. Same fallback.
  - Missing meta description.
  - Missing `og:image`.
- **10 warnings:** no `llms.txt` or `llms-full.txt`; no canonical; no
  `og:title`, `og:description`, `og:url` or `twitter:card`; no JSON-LD;
  near-empty server HTML; and the markdown twin returns HTML.
- **2 info:** no markdown alternate link, and no markdown content negotiation.
- **Production behaviour:** the same SPA fallback is in production.
  `apps/web/nginx.conf` sends `location /` to `try_files $uri /index.html`, and
  `apps/web/public/` holds only `favicon.svg`. So `/robots.txt` and `/sitemap.xml`
  also return HTML with status 200 on `sidecup.cauchuyenlaptrinh.com`.
  - This is inferred from config and was not fetched live.
  - Neither nginx nor the Traefik `sidecup-headers` middleware
    (`infra/docker-compose.homelab.yml:69-77`) sets `X-Robots-Tag`.

### How AX applies to this product

This is a private, token-gated ordering tool, not a content site.

- `/t/:token` and `/o/:id` identify a physical table and a customer's order, so they
  must never be indexed.
- The useful AX work is therefore:
  - a correct robots/sitemap pair;
  - `noindex` on token routes, as a header so it is visible without JavaScript;
  - a branded link-preview card, because Zalo renders Open Graph tags when an order
    link is shared.
- I do not propose GEO work, because there is nothing public to quote:
  - `llms.txt`, markdown twins, JSON-LD and server rendering stay as accepted warnings
    with that reason.
  - `llms.txt` is not a ranking lever, per `best-practices-and-common-mistakes.md`.

## Scores

Scores run from 0 to 3. Evidence for each line is the screenshots and files listed.

| Area | Score | Evidence |
|---|---|---|
| First impression | 2 | **Strength:** the menu header is clear within seconds: "Bàn 1", ETA "Giao trong khoảng 7 phút", and "Trả tiền khi nhận…" (`mobile-menu-loaded.png`).<br>**Gaps:**<ul><li>The four grey squares where images would go look unfinished.</li><li>Nothing says who serves the drinks until the footer.</li><li>First paint is blank (`mobile-menu-first-paint.png`).</li></ul> |
| Brand recall | 1 | <ul><li>The seller name appears only in the footer line "Đồ uống do … pha và giao" (`customer-footer.tsx`).</li><li>There is no wordmark or logo, and `theme-color` is `#ffffff` (`index.html:6`).</li><li>The orange-to-crimson gradient CTA is the only signature.</li><li>A cropped screenshot would not identify the seller.</li></ul> |
| Content punch | 2 | **Strength:** the Vietnamese copy is short and plain ("Thêm vào giỏ · 25.000đ", "Đặt nước", "Kiểm tra món rồi bấm Đặt nước").<br>**Gaps:**<ul><li>The order status is a bare label ("Đã gửi") with no outcome or time.</li><li>The phone help text is long and does not say what the customer gains (`cart-sheet.tsx:127`).</li></ul> |
| Clarity and hierarchy | 2 | **Strength:** each view has one primary action: "Thêm" → "Thêm vào giỏ" → "Xem giỏ" → "Đặt nước".<br>**Gaps:**<ul><li>On the order page the H1 is the order code, and the status, which is what the customer came for, is `text-sm` (`customer-order/page.tsx:73-76`).</li><li>The paid state has no next action (`mobile-order-paid.png`).</li><li>The selected choice chip is a faint tint plus border (`mobile-menu-product-sheet.png`).</li></ul> |
| Storytelling | 1 | <ul><li>The journey has no closing beat: no confirmation moment after "Đặt nước", no "drinks are on the way" with a time, and no thank-you or reorder on paid.</li><li>Error pages (`mobile-qr-not-found.png`, `mobile-404.png`, `mobile-revoked.png`) end in text with no action.</li></ul> |
| Knowledge and trust | 2 | **Strength:** pay on delivery, the ETA, the seller disclosure in the footer and the paused banner (`mobile-menu-paused.png`) are honest.<br>**Gaps:**<ul><li>The order page never says that updates will arrive by Zalo, or that it is safe to close the page.</li><li>"Huỷ đơn" is a solid red button with the same weight as "Chờ thêm" and no confirmation (`mobile-order-unconfirmed.png`).</li></ul> |
| Motion | 0 | <ul><li>There is no motion system.</li><li>Sheets appear and disappear with no transition (`bottom-sheet.tsx`).</li><li>There is no feedback when an item is added; the sheet just closes (`page.tsx:115`).</li><li>`animate-pulse` on the skeleton (`page.tsx:143`) and on the active status step (`status-steps.tsx:25`) has no `prefers-reduced-motion` guard, and `index.css` has no reduced-motion rule.</li></ul> |
| Responsive | 2 | **Strengths:**<ul><li>No overflow from 320 to 1440 px.</li><li>The safe-area bottom padding and the sticky CTA work.</li><li>The `max-w-md` column centres sensibly on tablet and desktop (`tablet-cart-sheet.png`).</li></ul>**Gaps:**<ul><li>Six targets are under 44 px (see the table above).</li><li>Inputs drop to 14 px at 768 px or wider.</li><li>"Đá bình thường" wraps to two lines inside its chip at 320 px (`narrow320-menu-product-sheet.png`).</li></ul> |
| Accessibility | 2 | **Strengths:**<ul><li>Native `<dialog>` sheets with `aria-labelledby`.</li><li>Labelled close button.</li><li>`aria-live` on the order status.</li><li>`aria-busy` skeleton.</li><li>Labelled phone and note fields, with `inputMode` and `autoComplete`.</li></ul>**Gaps:**<ul><li>Touch targets (WCAG 2.5.8 passes at 24 px, but the project floor is 44 px).</li><li>No reduced-motion handling.</li><li>A generic title on every route, so screen readers announce no page change (WCAG 2.4.2).</li><li>Contrast was not measured. `#555` muted text on white is about 7.5:1 and the CTA white on `#f45d29` is about 3.2:1, which passes only as large or bold text.</li></ul> |
| Performance feel | 1 (unverified) | <ul><li>Blank first paint in dev; no static shell in `index.html`.</li><li>The order loading state is plain text, not a skeleton (`customer-order/page.tsx:37`), so the layout jumps when data arrives.</li><li>LCP, INP and CLS were not measured on a production build, so this score is provisional.</li><li>The customer bundle budget of 120 KB gzip (`make size`) was not rerun.</li></ul> |

## Proposals

Proposals are ranked by their impact on the customer finishing an order and
reordering, then on recall and AX. Every file path is under `apps/web/` unless it
starts with `infra/`.

### P1 — Give the order page a way back to the menu (Must)

- **Evidence:**
  - `mobile-order-sent.png`, `mobile-order-accepted.png`, `mobile-order-paid.png`.
  - `customer-order/page.tsx` has no link to `/t/:token`.
  - `PublicOrder` (`src/shared/api/orders.ts:14-31`) carries no table token.
  - A customer who opens the order from a Zalo message, or who reloads, cannot order
    a second drink without rescanning the QR.
- **Change:**
  - When the menu loads, store the last table token (`{token, tableLabel, savedAt}`)
    in `localStorage`, inside try/catch.
  - On the order page, show a secondary "Gọi thêm nước" link to `/t/<token>` when a
    stored token exists and the order's `table_label` matches.
  - In the paid and closed states, promote it to the primary action.
  - Hide the link, rather than guessing, when nothing is stored.
  - The alternative, exposing the token on `PublicOrder`, is a product and security
    decision; see the unresolved questions.
- **Files:**
  - `src/features/customer-menu/page.tsx`
  - `src/features/customer-order/page.tsx`
  - a small helper next to `src/features/customer-menu/submit.ts`
  - tests in `src/features/customer-order/*.test.tsx`
- **Acceptance:**
  - After placing an order in the browser, `/o/:id` shows a "Gọi thêm nước" link
    whose `href` is `/t/DEVTEST001`.
  - In the paid state the link is the most prominent button on the page
    (`mobile-order-paid.png` recaptured).
  - With `localStorage` cleared, the link is absent and the page has no errors.
  - A unit test covers the stored-token, missing-token and storage-throws cases.

### P2 — Raise every customer touch target to 44 px (Must)

- **Evidence:** the target table above (`audit.json`), plus
  `bottom-sheet.tsx:70` (`p-1.5`), `button.tsx:29` (`icon: "size-9"`),
  `qty-stepper.tsx:17,30`, `cart-sheet.tsx:92` ("Bỏ", size `sm`),
  `input.tsx:10` (`h-9`), `unconfirmed-prompt.tsx:18,21` (size `lg` = h-10) and
  `my-orders.tsx:15` (`py-2.5`).
- **Change:**
  - Make the sheet close button at least 44×44 (`size-11`).
  - Make the stepper buttons `size-11`, without changing the shared `icon` size the
    seller app uses.
  - Give "Bỏ" a minimum 44 px hit area.
  - Make the customer phone and note inputs `h-11`.
  - Give the unconfirmed-prompt buttons and the "today's orders" links
    `min-h-11`.
  - Keep the visual size where it matters by padding the hit area.
- **Files:**
  - `src/shared/ui/bottom-sheet.tsx`
  - `src/features/customer-menu/components/qty-stepper.tsx`
  - `src/features/customer-menu/components/cart-sheet.tsx`
  - `src/features/customer-menu/components/my-orders.tsx`
  - `src/features/customer-order/components/unconfirmed-prompt.tsx`
- **Acceptance:**
  - Rerunning the capture audit at 375×812 lists no `button`, `a[href]` or `input`
    smaller than 44 px in either dimension on `/t/*` or `/o/*`. The only exception
    is inline text links, if any.
  - The 320 px cart and product sheet still have zero horizontal overflow.

### P3 — Keep customer inputs at 16 px at every width (Must)

- **Evidence:** `audit.json` shows 14 px at 768 and 1440 px, caused by
  `input.tsx:10` (`md:text-sm`). iOS Safari zooms on focus below 16 px, and that hits
  iPad and landscape phones.
- **Change:**
  - Override to `text-base` on the customer phone input and note textarea.
  - If the seller pages agree, drop `md:text-sm` from the shared `Input`.
- **Files:** `src/features/customer-menu/components/cart-sheet.tsx`, and possibly
  `src/shared/ui/input.tsx`.
- **Acceptance:** the computed `font-size` of `#phone` and `#note` is 16 px at 375,
  768 and 1440 px (audit rerun).

### P4 — Keep token routes out of search indexes and serve real robots/sitemap files (Must)

- **Evidence:**
  - Scan errors for `robots.txt` and `sitemap.xml`. In both dev and production the SPA
    fallback returns HTML (`nginx.conf`, `location /`).
  - No `X-Robots-Tag` anywhere (`nginx.conf`, `infra/docker-compose.homelab.yml:69-77`).
  - `/t/:token` and `/o/:id` reveal a table and an order to anyone who finds the URL.
- **Change:**
  - Add `public/robots.txt` that allows crawling and has an absolute `Sitemap:` line.
    It must not `Disallow` the token routes, so crawlers can see their `noindex`.
  - Add `public/sitemap.xml` listing only `https://sidecup.cauchuyenlaptrinh.com/`.
  - Send `X-Robots-Tag: noindex, nofollow` for `/t/`, `/o/`, `/revoked` and
    `/seller` in `nginx.conf`, in new `location` blocks that keep the SPA
    fallback.
  - Add `<meta name="robots" content="noindex">` from React on those routes as a
    fallback.
  - Confirm that the homelab Traefik and the Caddy paths both pass the header through.
- **Files:**
  - `public/robots.txt` (new)
  - `public/sitemap.xml` (new)
  - `nginx.conf`
  - route components or a small head hook under `src/app/`
- **Acceptance:**
  - `curl -sI <base>/t/DEVTEST001` against the nginx image shows `X-Robots-Tag: noindex`.
  - `curl -s <base>/robots.txt` returns `text/plain` with a `Sitemap:` line.
  - The discovery scan reports no robots or sitemap errors.
  - `/` has no `noindex`.

### P5 — Make the order status the hero, with time and reassurance (Should)

- **Evidence:**
  - `mobile-order-sent.png`, `mobile-order-accepted.png`, `mobile-order-delivering.png`.
  - The H1 is "Đơn #CODE" and the status is a `text-sm` line
    (`customer-order/page.tsx:73-76`).
  - There is no expected time, even though the menu shows the ETA and the order has
    `accepted_at`.
  - Nothing tells the customer they can close the page.
  - There is a large empty area below the content.
- **Change:**
  - Lead with a large status sentence per state, for example "Quán đã nhận đơn — nước
    tới khoảng 15:42".
  - Compute the time from `accepted_at` plus the seller ETA when the API exposes it.
    Otherwise use the time-free wording.
  - Move the order code to a secondary line.
  - When the order has a phone, add "Bạn sẽ nhận tin Zalo khi trạng thái thay đổi —
    có thể đóng trang này".
  - In the paid state, show a thank-you line plus the P1 action.
- **Files:**
  - `src/features/customer-order/page.tsx`
  - `src/features/customer-order/components/status-steps.tsx`
  - a status copy map next to `ordering-message.ts`
- **Acceptance:**
  - On recaptured screenshots for each state, the status sentence is the largest text
    above the fold at 375×812.
  - The order code is still visible.
  - The paid state shows the thank-you line and a reorder action.
  - The `aria-live` region still announces each state change, and the existing tests
    pass.
- **Open input:** whether the public order or menu API returns the ETA (see
  unresolved questions).

### P6 — Confirm add-to-cart with visible feedback (Should)

- **Evidence:** `page.tsx:115`. `onAdd` closes the sheet, and the only change is
  the cart bar appearing or its count changing (`mobile-menu-cart-bar.png`).
- **Change:**
  - After adding, briefly animate the cart bar: scale or colour pulse on the count,
    150–250 ms, transform and opacity only.
  - Announce "Đã thêm <món> vào giỏ" through a polite live region.
  - Under reduced motion, keep the announcement and skip the animation.
- **Files:**
  - `src/features/customer-menu/page.tsx`
  - `src/features/customer-menu/components/cart-bar.tsx`
- **Acceptance:**
  - After "Thêm vào giỏ", a `role=status` element contains "Đã thêm".
  - The cart bar runs a transition shorter than 300 ms that is disabled under
    `prefers-reduced-motion: reduce` (checked by Playwright `reducedMotion` emulation).
  - The bundle stays within budget (`make size`).

### P7 — Add a small motion system with reduced-motion guards (Should)

- **Evidence:**
  - No `prefers-reduced-motion` rule in `src/index.css`.
  - Unguarded `animate-pulse` at `customer-menu/page.tsx:143` and
    `status-steps.tsx:25`.
  - Sheets pop in with no transition (`bottom-sheet.tsx`).
- **Change:**
  - Add duration and easing tokens to `index.css`.
  - Slide the native `<dialog>` sheet up and fade its backdrop in about 200–250 ms,
    using CSS only (`@starting-style` / `transition-behavior: allow-discrete`, with an
    instant fallback). This keeps the no-Radix bundle choice.
  - Add a global `@media (prefers-reduced-motion: reduce)` rule that removes the
    pulse and the transitions.
- **Files:**
  - `src/index.css`
  - `src/shared/ui/bottom-sheet.tsx`
  - `src/features/customer-order/components/status-steps.tsx`
- **Acceptance:**
  - With Playwright `reducedMotion: "reduce"`, the computed `animation-name` on the
    active step and the skeleton is `none`.
  - Sheet open and close transitions take 300 ms or less and use only `transform` and
    `opacity`.
  - Sheets still open, close on Esc and return focus to the trigger.

### P8 — Replace empty image squares with an intentional placeholder (Should)

- **Evidence:**
  - Four grey 56 px squares on `mobile-menu-loaded.png` and
    `tablet-menu-loaded.png`.
  - `product-list.tsx:38` renders `bg-secondary` when there is no `image_url`.
- **Change:**
  - When `image_url` is null, render a tinted tile with the drink's initial or a cup
    icon in the brand palette.
  - If no product in the menu has an image, drop the tile entirely so names align
    left.
  - When images exist, use `loading="lazy"`, fixed `width` and `height`, and
    `object-cover`.
- **Files:** `src/features/customer-menu/components/product-list.tsx`.
- **Acceptance:**
  - In the recaptured menu with mock data (all images null), no plain grey squares are
    visible.
  - With an image URL set in the mock, the image renders at 56 px with no layout shift.

### P9 — Put the seller's brand at the top and in the browser chrome (Should)

- **Evidence:**
  - The seller name appears only in the footer (`customer-footer.tsx`).
  - `theme-color` is `#ffffff` (`index.html:6`).
  - There is no logo asset in `public/`.
- **Change:**
  - Add a compact brand line above "Bàn N" on the menu and order pages, for example
    "<VITE_SELLER_NAME> · Quán test". Use a wordmark if the seller supplies one, or a
    styled text mark.
  - Set `theme-color` to the navy brand token so the Zalo or Safari toolbar carries
    the brand.
- **Files:**
  - `src/features/customer-menu/components/menu-header.tsx`
  - `src/features/customer-order/page.tsx`
  - `index.html`
- **Acceptance:**
  - On the 375×812 recapture the seller name is visible above the fold on the menu and
    order pages.
  - `theme-color` is no longer white.
  - A cropped header screenshot shows the seller name and brand colour.

### P10 — Give each route and state its own document title (Should)

- **Evidence:** the title is "Gọi nước tại bàn" on every capture (`audit.json`),
  failing WCAG 2.4.2 Page Titled for distinct states.
- **Change:**
  - Set the title per route: "Bàn 1 · Quán test — Gọi nước", "Đơn #CODE · Đang mang
    ra", "Không tìm thấy mã" and so on.
  - Update it on order status changes.
- **Files:** `src/features/customer-menu/page.tsx`, `src/features/customer-order/page.tsx`,
  the error pages, and an optional `useDocumentTitle` hook in `src/shared/`.
- **Acceptance:**
  - The `document.title` values in the audit differ for menu, order (per status),
    revoked, unknown QR and 404.
  - A unit test covers the hook.

### P11 — Give error and dead-end pages a next step (Should)

- **Evidence:** `mobile-qr-not-found.png`, `mobile-order-not-found.png`,
  `mobile-revoked.png`, `mobile-404.png` and `mobile-home.png` show centred text
  only. The order error state has no link (`customer-order/page.tsx:40-45`).
- **Change:**
  - Add one action per page:
    - "Thử lại" on load errors;
    - "Về menu bàn" when a stored token exists (P1);
    - "Quét lại mã QR trên bàn" guidance with a camera icon on unknown or revoked
      tokens.
  - Turn `/` into a short brand-and-instructions page ("Quét mã QR trên bàn để gọi
    nước").
- **Files:**
  - `src/features/customer-menu/components/load-error.tsx`
  - `src/features/customer-menu/revoked-page.tsx`
  - `src/features/customer-order/page.tsx`
  - `src/app/router.tsx`
- **Acceptance:** on the recaptured error screenshots, each page shows at least one
  44 px action or explicit instruction, and "Thử lại" refetches without a full reload.

### P12 — Add a branded link-preview card for shared links (Should)

- **Evidence:** scan errors and warnings for the meta description and `og:*` and
  `twitter:card` tags. Order links reach customers through Zalo, which renders Open
  Graph cards.
- **Change:**
  - Add a generic, non-personal `description`, `og:title`, `og:description`,
    `og:image` (an absolute 1200×630 brand image in `public/`), `og:type=website`
    and `twitter:card=summary_large_image` to `index.html`.
  - Add a canonical for `/` only.
  - Do not put the order code or table in the static tags.
- **Files:** `index.html`, `public/og-image.png` (new, from seller brand assets).
- **Acceptance:**
  - The discovery scan reports no meta-description or Open Graph errors.
  - `curl -s <base>/ | grep og:image` shows an absolute URL that returns 200 `image/png`.

### P13 — Show a static shell before JavaScript and a skeleton for the order page (Should)

- **Evidence:**
  - `mobile-menu-first-paint.png` is blank at 300 ms. That is in dev, so it is
    indicative, not proof.
  - `index.html` has an empty `#root`.
  - The order loading state is plain text (`customer-order/page.tsx:37`).
- **Change:**
  - Put a tiny inline shell in `#root` (brand mark plus a "Đang mở menu…" line,
    inline CSS, no JS). React replaces it on mount.
  - Add an order-page skeleton that matches the final layout.
- **Files:** `index.html`, `src/features/customer-order/page.tsx`.
- **Acceptance:**
  - On a production build (`pnpm build && pnpm preview`) with Playwright "Slow 3G"
    throttling, the first screenshot after navigation shows the shell.
  - Lighthouse mobile on `/t/DEVTEST001` (preview plus mock) reports CLS ≤ 0.1.
  - `make size` stays within the 120 KB budget.

### P14 — Make the selected choice chip unmistakable (Could)

- **Evidence:**
  - `mobile-menu-product-sheet.png` and `narrow320-menu-product-sheet.png`: the
    selected state is `border-primary bg-primary/10`, a faint tint.
  - "Đá bình thường" wraps to two lines at 320 px.
- **Change:**
  - Use a solid navy fill with white text and a check icon for the selected chip.
  - Shorten the label to "Đá vừa", or let the chip grow, so it stays on one line at
    320 px. The label is a copy decision for the owner.
- **Files:** `src/features/customer-menu/components/product-sheet.tsx`.
- **Acceptance:**
  - The selected chip has contrast of at least 3:1 against unselected chips.
  - On the 320 px recapture no chip label wraps.

### P15 — Tighten the phone field and the cancel action (Could)

- **Evidence:**
  - `cart-sheet.tsx:35` validates only once at least 10 characters are typed.
  - The help text at `cart-sheet.tsx:127` is long.
  - "Huỷ đơn" is a solid destructive button with no confirmation
    (`mobile-order-unconfirmed.png`).
- **Change:**
  - Validate the phone field on blur.
  - Reframe the help text around the benefit ("Nhận tin Zalo khi nước sắp tới").
  - Make "Chờ thêm" the primary button and "Huỷ đơn" an outline destructive button
    with a one-tap confirm.
- **Files:**
  - `src/features/customer-menu/components/cart-sheet.tsx`
  - `src/features/customer-order/components/unconfirmed-prompt.tsx`
- **Acceptance:**
  - Typing "123" and blurring shows the phone error.
  - Cancelling needs two deliberate taps.
  - The e2e specs `apps/web/e2e/unconfirmed-prompt.spec.ts` and `customer-cancel.spec.ts` still pass, updated for the
    confirm step.

### P16 — Record the direction in DESIGN.md, REVIEW.md and AGENTS.md (Should)

- **Evidence:** the repository root has no `DESIGN.md`, `REVIEW.md`,
  `AGENTS.md` or `CLAUDE.md`. Tokens live only in `src/index.css`.
- **Change:**
  - `DESIGN.md`: create it with the UpNext tokens, the gradient-CTA-only rule, motion
    durations and the reduced-motion rule, the 44 px target floor, the 16 px input
    rule and the customer voice (short, friendly Vietnamese).
  - `REVIEW.md`: create it with this rubric, the three viewports plus 320 px, and the
    `noindex` rule for token routes.
  - `AGENTS.md`: create a short file telling agents to read `DESIGN.md` before UI work
    and to keep `robots.txt`, the sitemap and `X-Robots-Tag` in sync when routes
    change.
- **Files:** `DESIGN.md`, `REVIEW.md`, `AGENTS.md` (all new, at the repo root).
- **Acceptance:** the three files exist and contain the rules named above, and the
  links in `docs/README.md` are updated if that is the docs index.

### Accepted AX gaps (not proposed)

- `llms.txt`, `llms-full.txt`, markdown twins and content negotiation: there is no
  public long-form content, and these are not ranking levers.
- JSON-LD: there is no public entity page to describe. If `/` becomes a real brand
  page, revisit `Organization` markup.
- Server rendering: the token pages must not be indexed, and `/` is a single short
  page.
- The per-bot crawler policy is the owner's call and was left unchanged.

## DONE contract

This is the target for an `--auto` or `--loop` run. Default mode does not claim it.

1. P1–P13 and P16 (every Must and Should) meet their acceptance checks. Any skipped
   item has a stated reason recorded in this report.
2. `check-discovery-surfaces.mjs` exits 0 against the production-like build. Each
   remaining warning is listed above as accepted with its reason: llms files,
   markdown twins, JSON-LD, server render and the markdown alternate.
3. Screenshots at 1440×900, 768×1024, 375×812 and 320 px of every changed customer
   page show no overflow, clipping, overlap or broken images, and a vision review
   finds no High issue.
4. No rubric area regresses. Brand recall, Storytelling, Motion and Performance feel
   each reach at least 2, or their gap is recorded as an unresolved question.
   Performance feel needs a measured production-build Lighthouse run.
5. Keyboard checks pass on changed elements: sheets open, trap focus, close on Esc
   and return focus. Reduced-motion emulation removes all pulse and transition
   animation.
6. `make lint`, `make test` (web unit tests), the web build and `make size` pass,
   along with the e2e specs in `apps/web/e2e/` that cover the touched flows (for example `happy-path`, `customer-cancel`, `paused` and `revoked-qr`). Pre-existing failures
   are shown with evidence.
7. `DESIGN.md`, `REVIEW.md` and `AGENTS.md` exist with the rules in P16.
8. Dev servers and capture processes started by the run are stopped.

## Unresolved questions

1. **Reorder link source (P1):** is it acceptable to keep the table token in
   `localStorage` on the customer's phone? The alternative is for
   `GET /api/orders/:id` to return the token or a menu link, which hands the table
   token to anyone who holds the order link.
2. **ETA on the order page (P5):** may the public order or menu response expose the
   seller's `eta_minutes`, so the page can show "nước tới khoảng HH:MM"?
3. **Brand assets (P9, P12):** does the seller have a logo or wordmark and a
   preferred brand colour for `theme-color` and the 1200×630 share image? Without
   them, the plan falls back to a styled text mark in the navy token.
4. **Product images (P8):** will real menus have photos, or should the design assume
   text-only rows?
5. **Production check:** may I fetch `https://sidecup.cauchuyenlaptrinh.com/robots.txt`
   and a `/t/` URL to confirm the inferred live behaviour before implementation?
6. **Copy changes (P14):** should "Đá bình thường" become "Đá vừa"?
7. **Crawler policy:** beyond `noindex` on token routes, is there any per-bot
   preference, for example blocking AI training crawlers on `/`?

## Round 2 — after implementation

Run on 2026-10-02 against the working tree on `master` (uncommitted), after plan
[`261002-0844-customer-mobile-ux-ax`](../261002-0844-customer-mobile-ux-ax/plan.md).
Evidence is in `enhance-ux-ax-261002-1512-customer-mobile/round-2/`:

- `<viewport>-<scene>.png` and `audit.json`: 70 captures from
  `apps/web/scripts/capture-customer-audit.mjs`, MSW mock mode on `:5173`.
- `motion-keyboard-checks.json`: 18 reduced-motion and keyboard checks, re-run after
  the code-review fixes below.
- `lighthouse-summary.json`: Lighthouse 12, mobile preset, production build on `:8081`.
- `discovery-scan.txt`: `check-discovery-surfaces.mjs` against `:8081`.

### Environment

- Port 5432 is still held by `goclaw-postgres-1`, which belongs to another project
  and was left running. The `full` compose stack ran under its normal project name
  `sidecup`, with a scratch override:
  - Postgres was published on `127.0.0.1:55501` instead of 5432.
  - The web image was built with `VITE_PUBLIC_ORIGIN=http://localhost:8081`.
  - The stack and its volume were removed afterwards (`down -v`); no `sidecup`
    volume existed before the run.
- E2E browsers:
  - Chromium ran on the host.
  - WebKit needs system libraries that require sudo, so it ran in
    `mcr.microsoft.com/playwright:v1.63.0-noble` (same Playwright version) with
    host networking.
  - The two specs that age an order through `docker compose exec postgres psql` got
    the host Docker CLI and socket mounted into that container.
- `VITE_SELLER_NAME` is unset in dev, so the brand line shows the fallback
  "người bán". Production sets it at build time.

### Measured results

| Check | Round 1 | Round 2 |
|---|---|---|
| Customer targets under 44 px (4 viewports) | 6 kinds (close, ±, Bỏ, phone, prompt buttons, order links) | 0 |
| Inputs under 16 px | every input at 768 and 1440 px (14 px, `md:text-sm`) | 0 (seller pages included) |
| Horizontal overflow | none | none |
| Distinct document titles | 1 for every route | One per route and state: menu "Bàn 1 · Quán test — Gọi nước", "Đơn #AB12CD · <status>", "Không tìm thấy mã", "Mã QR không còn dùng", "Không tìm thấy đơn", "Không tìm thấy trang" |
| `noindex` | none | `X-Robots-Tag: noindex, nofollow` on `/t/`, `/o/`, `/seller`, `/seller/settings`, `/revoked` (curl on `:8081`); meta fallback on the same routes and on 404. None on `/` |
| robots.txt / sitemap.xml | SPA fallback HTML | `text/plain` and `application/xml`; with `Host: goinuoc.example` both point at `https://goinuoc.example/` |
| Public order view | — | Keys checked on `:8081`: no `phone`, `customer_phone` or `client_id`; adds `menu_path`, `eta_minutes`, `notify_zalo` |
| Customer JS (`make size`) | not rerun | `/t/:token` 109.6 KB, `/o/:id` 103.9 KB gzip (budget 120 KB), after the code-review fixes |
| Lighthouse mobile `/t/DEVTEST001` | not run | Perf 89, A11y 100, BP 100, SEO 58; LCP 3.0 s, CLS 0.00006, TBT 250 ms |
| Lighthouse mobile `/o/<id>` | not run | Perf 92, A11y 100, BP 100, SEO 58; LCP 2.9 s, CLS 0, TBT 170 ms |
| Lighthouse mobile `/` | not run | Perf 97, A11y 100, BP 100, SEO 100; LCP 2.4 s, CLS 0.0006 |

SEO 58 on the token routes comes from two failing audits:

- `is-crawlable`: the intended `noindex`.
- `canonical`: the static `index.html` carries `canonical=/` on every route, a plan
  decision (phase 5). See unresolved question 3 below.

### Vision review

All 70 captures were reviewed: mobile and 320 px for every scene, and tablet and
desktop for the menu, product sheet, cart and order states.

- **Fixed during this round (was High):** "Đá bình thường" was clipped inside its
  chip at 360–414 px, even unselected, once the selected chip became solid and
  bold.
  - Chips now size to their label (`flex-wrap`, `flex-auto`, `whitespace-nowrap`).
  - An invisible bold-with-check layer reserves the width, so selecting does not
    resize the chip.
  - Result: three chips per row at 360, 375 and 414 px. At 320 px the whole
    "Đá bình thường" chip moves to its own row. No label breaks or clips at any width.
- **Cart sheet at 320 × 640:** the last hint line sits at the viewport edge. The
  sheet scrolls 31 px to show it fully (`max-h-[92dvh] overflow-y-auto`). Not an
  issue.
- No overflow, clipping, overlap or broken image remains in any capture.

### Scores

| Area | Round 1 | Round 2 | Evidence |
|---|---|---|---|
| First impression | 2 | 3 | Brand line, table, ETA and payment above the fold; no grey image squares; static shell in `index.html`, so the first paint is not blank |
| Brand recall | 1 | 2 | Brand line on every customer screen, navy `theme-color`, branded OG card with `og:image:alt`. Still no logo, which is a non-goal |
| Content punch | 2 | 3 | Status is a sentence with an outcome and time ("Quán đang pha, nước tới khoảng 21:26"); phone help says what the customer gains |
| Clarity and hierarchy | 2 | 3 | H1 is the status; one gradient CTA per screen; the selected chip is solid navy with a check |
| Storytelling | 1 | 3 | Paid state: "Cảm ơn bạn! Chúc ngon miệng" + "Gọi thêm nước"; every error page has a next step |
| Knowledge and trust | 2 | 3 | Zalo / keep-page-open notice on the order page; two-step cancel (outline → "Xác nhận huỷ") where a double tap or a second Enter lands on "Không huỷ"; no ETA promised once it has passed |
| Motion | 0 | 2 | Sheet slide, count bump and announcement; a global reduced-motion rule, checked in `motion-keyboard-checks.json`. The motion set is deliberately small |
| Responsive | 2 | 3 | 0 overflow and 0 clipping from 320 to 1440 px after the chip fix |
| Accessibility | 2 | 3 | 0 targets < 44 px, 0 inputs < 16 px, titles per route, focus trap and return, `role="status"`, Lighthouse A11y 100 on all three pages |
| Performance feel | 1 (unverified) | 2 | Measured: CLS ≤ 0.0006, static shell, order skeleton, bundle within budget. Mobile LCP is 2.9–3.0 s on the token pages, above the 2.5 s "good" line (simulated slow 4G; `unused-javascript` and `render-blocking-resources` flagged) |

No area regressed.

### DONE contract

| # | Item | Status |
|---|---|---|
| 1 | P1–P16 meet their acceptance checks | Met. P14 and P15 were added by the plan. The P16 `AGENTS.md` rules live in a "Quy tắc cho agent" section of `docs/README.md` (repository markdown rule; default chosen under `--auto`) |
| 2 | Discovery scan exits 0 with only accepted warnings | **Exception.** The scan exits 1 on one ERROR: on `http://localhost:8081`, robots.txt advertises `https://localhost/sitemap.xml`, which the scanner cannot fetch. nginx hard-codes `https://$host` because production always runs behind TLS. With a production Host header, robots and sitemap are correct. The 5 WARNs are the accepted GEO gaps. The INFO `og:image:alt` was fixed. Recorded in `docs/review.md` |
| 3 | Captures at four viewports, no High issue | Met after the chip fix (above) |
| 4 | No regression; Brand, Storytelling, Motion and Performance feel ≥ 2 | Met (2, 3, 2, 2) |
| 5 | Keyboard and reduced-motion checks | Met: 18/18 in `motion-keyboard-checks.json` |
| 6 | Lint, unit tests, build, size and e2e | Met. Details below the table |
| 7 | Design, review and agent docs | Met: `docs/design.md`, `docs/review.md`, `docs/README.md` |
| 8 | Processes started by the run are stopped | Met: the dev server, the e2e stack and volume, and the test Postgres container were removed; ports 5173, 8081, 55499 and 55501 are free |

Item 6 detail:

- Web lint, typecheck, build and size pass under Node 22.
- Web unit tests: 137/137 after the code-review fixes (132/132 on four consecutive
  runs before them). One earlier run had a single failure that did not reproduce;
  its name was not captured.
- API: vet, golangci-lint and tests pass, including integration tests on a scratch
  Postgres, re-run after the `Create` fix below.
- E2E:
  - Chromium 11/11 on two consecutive runs. The first full run had one Chromium
    failure (`order-without-phone`) that passed on every rerun.
  - WebKit 11/11.

### Code review

A code-reviewer pass over the whole change found two medium and six low issues.
Each fix has a regression test that fails without it.

| # | Finding | Outcome |
|---|---|---|
| M1 | `Create` read the ETA after commit; a failure there returned an error before `order.created` was published, and a retry with the same Idempotency-Key only got the existing order, so the seller was never told | Fixed: the ETA is read inside the transaction (`orders/service.go`) |
| M2 | The cancel prompt reused the second button slot, so a double tap or two Enters on "Huỷ đơn" hit "Xác nhận huỷ" and cancelled | Fixed: "Không huỷ" takes that slot and receives focus; confirming needs a deliberate move to "Xác nhận huỷ" |
| L1 | The sheet stayed interactive while it slid closed, so a tap could add an item or submit twice | Fixed: the sheet content is `inert` while closing |
| L2 | A dialog closed directly by the browser (Chrome ignores `preventDefault` on repeated Esc) left the parent thinking it was open | Fixed: `onClose` reports it; the sheet's own `close()` calls (unmount, StrictMode remount) are flagged and ignored. The first version used `isConnected`; the keyboard re-run caught it closing every sheet in dev under StrictMode |
| L3 | Adding the same item twice within 3 s was not announced again | Fixed: the announcement includes the new cart total ("…vào giỏ, giỏ có 2 ly") |
| L4 | Past the ETA, the headline still promised "nước tới khoảng HH:MM" | Fixed: it reads "Quán đang pha, sắp xong" once server time passes the ETA; the page re-renders each second while `accepted` |
| L5 | The static shell said "Đang mở menu…" on every route | Fixed: "Đang tải…" |
| L6 | Seller routes have no per-route titles or `noindex` meta fallback | Not fixed: the seller redesign is a non-goal; nginx already sends `X-Robots-Tag` on `/seller` |

`docs/design.md` and `docs/review.md` record the cancel-button placement, the inert
closing sheet and the overdue-ETA copy.

### Unresolved questions

1. **Production check:** the live site was not fetched. After deploy, run `curl -sI`
   on `/t/<token>` and `/robots.txt` at the production host.
2. **Port 5432:** it is still held by `goclaw-postgres-1`.
   - `make e2e` as written cannot run on this machine while that container is up.
   - This round used the alternate-port override described above, which leaves
     the Makefile untouched.
3. **Canonical on token routes:** should `useDocumentHead({ noindex: true })` also
   remove the static `canonical=/` link?
   - The `noindex` header already wins, so this is cosmetic for crawlers.
   - It would lift Lighthouse SEO on those routes.
4. **LCP on token pages (2.9–3.0 s on simulated mobile):** is it worth a follow-up?
   Candidates are deferring non-critical JS on `/t/` or preloading the font.
5. **Seller board resync (from the code review):** should the seller board refetch
   periodically while its WebSocket is connected, so a missed event cannot hide an
   order until the next reconnect? This is outside this plan's scope.
6. **Commit:** nothing is committed yet, including `public/og-image.png` and its
   script, which the plan says to commit.
