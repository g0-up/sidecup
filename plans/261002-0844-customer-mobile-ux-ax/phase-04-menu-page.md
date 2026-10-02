---
phase: 4
title: "Menu page and error pages"
status: pending
priority: P1
effort: "5h"
dependencies: [2]
---

# Phase 4: Menu page and error pages

## Goal

The menu confirms every add-to-cart and shows intentional product tiles. The seller
brand sits at the top, every control reaches 44 px, and the selected chip is
unmistakable. The phone field validates on blur, and the error, revoked, home and
404 pages each offer a next step.

This covers P2 (menu side), P6, P8, P9 (menu header), P10 (menu and error titles),
P11, P14 and P15 (phone).

## Context

- `src/features/customer-menu/page.tsx:115`: `onAdd` closes the sheet with no
  feedback.
  - `:143`: the `MenuSkeleton` pulse is guarded by the global rule from phase 2.
- `components/cart-bar.tsx`: the count text sits inside the `cta` button.
- `components/product-list.tsx:38`: a grey square is shown when there is no image.
- `components/menu-header.tsx`: the partner name sits above "Bàn N", and there is
  no seller brand.
- `components/product-sheet.tsx` `Choice`: the selected state is
  `border-primary bg-primary/10`. "Đá bình thường" wraps at 320 px in the 3-column
  grid.
- `components/cart-sheet.tsx`:
  - `:35` sets `phoneTouched` only once the value has 10 or more characters.
  - `:92` "Bỏ" is `size="sm"` (32 px).
  - `:127` the help text is long.
- `components/my-orders.tsx:15`: the links are `py-2.5` (42 px).
- `components/load-error.tsx`: 404 has no action. `revoked-page.tsx`, and `Home` and
  `NotFound` in `src/app/router.tsx`, are text only.
- The copy for "Đá bình thường" is kept. The chip grows instead of the label being
  shortened, so no copy decision is needed.

## Requirements

- **Add feedback (P6):**
  - After `add`, a polite `role="status"` live region in `page.tsx` announces
    "Đã thêm <món> vào giỏ". Clear it after 3 s so repeated adds re-announce.
  - The `CartBar` count pulses once (scale 1 → 1.08 → 1, about 200 ms, transform
    only), keyed on the count changing upward.
  - Under reduced motion there is no animation, but the announcement stays.
- **Product tile (P8):**
  - When `image_url` is null, render a `bg-secondary` tile with the product's
    first letter in navy semibold. It is decorative, `aria-hidden`.
  - If **no** product in the menu has an image, omit the tile entirely.
  - The existing `<img>` path keeps `loading="lazy"`, the fixed 56×56 size and
    `object-cover`.
- **Brand (P9):** `MenuHeader` starts with `CustomerBrand` and place
  `menu.partner.name`, followed by "Bàn N" as the H1. The seller name is above the
  fold at 375×812.
- **Title (P10):** `useDocumentHead`:
  - menu: `"<table_label> · <partner> — Gọi nước"`, `noindex`;
  - loading: "Đang mở menu…";
  - load error: "Không tìm thấy mã" or "Không tải được menu";
  - revoked: "Mã QR không còn dùng", `noindex`;
  - home: "Gọi nước tại bàn", indexable;
  - 404: "Không tìm thấy trang", `noindex`.
- **Touch targets (P2):**
  - "Bỏ": `min-h-11 min-w-11`, ghost.
  - Phone input: `h-11`.
  - "Today's orders" links: `min-h-11 py-3`.
  - The "Thử lại" button: `min-h-11`.
- **Chip (P14):**
  - Selected: solid `bg-primary text-primary-foreground` with a `Check` icon.
    Unselected: outline.
  - The contrast between selected and unselected is at least 3:1.
  - At 320 px no label wraps. Allow the grid to auto-fit, for example
    `grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))]`, or let the text size step
    down. Verify at 320 px.
- **Phone (P15):**
  - Validate on blur: a `phoneBlurred` state or the `onBlur` of the input. Keep the
    existing rule that an error shows once 10 or more characters are typed.
  - Help text: "Nhận tin Zalo khi nước sắp tới. Bỏ trống nếu không cần."
- **Error and empty pages (P11):**
  - `LoadError` 404: a camera icon plus "Quét lại mã QR trên bàn". Non-404 keeps
    "Thử lại", which calls `reload()`.
  - Revoked: a camera icon plus "Quét mã QR mới trên bàn".
  - Home: `CustomerBrand`, a one-line value statement and "Quét mã QR trên bàn để
    gọi nước".
  - 404: the same instruction.
  - Each page shows at least one 44 px action or an explicit instruction.

## Files

- Modify: `apps/web/src/features/customer-menu/page.tsx`
- Modify: `apps/web/src/features/customer-menu/components/cart-bar.tsx`
- Modify: `apps/web/src/features/customer-menu/components/product-list.tsx`
- Modify: `apps/web/src/features/customer-menu/components/menu-header.tsx`
- Modify: `apps/web/src/features/customer-menu/components/product-sheet.tsx`
- Modify: `apps/web/src/features/customer-menu/components/cart-sheet.tsx`
- Modify: `apps/web/src/features/customer-menu/components/my-orders.tsx`
- Modify: `apps/web/src/features/customer-menu/components/load-error.tsx`
- Modify: `apps/web/src/features/customer-menu/revoked-page.tsx`
- Modify: `apps/web/src/app/router.tsx` (`Home`, `NotFound`)
- Modify: `apps/web/src/features/customer-menu/page.test.tsx`
- Check: `apps/web/e2e/happy-path.spec.ts`, `paused.spec.ts`, `revoked-qr.spec.ts`, `order-without-phone.spec.ts`, `unavailable-product.spec.ts`

## Steps

1. Add the live region and the `lastAdded` state in `page.tsx`, and set them in
   `onAdd`.
2. In `CartBar`, track the previous count with a ref. On an increase, toggle a
   `data-bump` attribute that runs a CSS keyframe built from the phase 2 tokens,
   and clear it on `animationend`.
3. Add the product tile fallback and the "no images at all" branch.
4. Add `CustomerBrand` to `MenuHeader`.
5. Add the chip styles and layout, and check at 320 px in the browser.
6. Add the cart-sheet target sizes, the blur validation and the new help copy.
7. Raise `MyOrders` link heights.
8. Add the titles and `noindex` on the menu, loading, error, revoked, home and 404
   pages.
9. Add the next steps to the error pages.
10. Extend `page.test.tsx`:
    - after adding, `role=status` contains "Đã thêm";
    - typing "123" and blurring shows the phone error;
    - `document.title` on the menu;
    - the 404 load error shows the instruction.
11. Grep the e2e specs for changed text ("Mã này không còn dùng", the help text and
    the header) and update their selectors.

## Todo

- [x] Add the add-to-cart announcement and cart bar bump
- [x] Add the product tile fallback, or drop the tile when no product has an image
- [x] Add the brand line in the menu header
- [x] Make the selected chip solid and stop labels wrapping at 320 px
- [x] Raise the cart and order-list targets to 44 px
- [x] Add phone validation on blur and the benefit-led help text
- [x] Add titles and `noindex` on the menu and error routes
- [x] Give the load-error, revoked, home and 404 pages a next step
- [x] Update the unit tests and e2e selectors

## Verification

- `cd apps/web && pnpm test`, `pnpm lint` and `pnpm typecheck` pass.
- `pnpm exec vite build && pnpm size` keeps `/t/:token` within 120 KB (the `Check`
  and camera icons come from lucide, which is already in the chunk).
- E2E `happy-path`, `paused`, `revoked-qr`, `order-without-phone` and
  `unavailable-product` pass (phase 7 if Docker is blocked).

## Risks

- **The live region double-announces alongside the stepper's `aria-live`.** Keep
  one page-level region and announce only on add.
- **The auto-fit chip grid changes the layout at 375 px.** Verify that it stays as
  three columns at 375 px and wraps rows, not labels, at 320 px.
- **Revoked copy changes break `revoked-qr.spec.ts`.** Update it in the same commit.
