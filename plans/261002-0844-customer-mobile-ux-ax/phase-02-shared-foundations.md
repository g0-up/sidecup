---
phase: 2
title: "Shared foundations"
status: pending
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 2: Shared foundations

## Goal

Build the shared pieces the page phases use: motion tokens and a global
reduced-motion rule (P7), an animated and 44 px-safe bottom sheet (P2, P7),
16 px inputs (P3), a 44 px quantity stepper (P2), a document-head hook for titles
and `noindex` (P10, P4 fallback) and a brand line component (P9).

## Context

- `src/index.css` has no motion tokens and no `prefers-reduced-motion` rule.
- `src/shared/ui/bottom-sheet.tsx:70`: the close button is `p-1.5` (32×32). The
  sheet unmounts as soon as `open` turns false, so a close transition needs a
  short closing state before unmount.
- `src/shared/ui/input.tsx:10` and `textarea.tsx:9` use `md:text-sm`, which gives
  14 px at 768 px and wider. iPad and landscape phones then zoom on focus.
  - Decision: drop `md:text-sm` from both shared components. Sellers also use
    phones and iPads, so they benefit too.
- `src/features/customer-menu/components/qty-stepper.tsx` uses `size="icon"`
  (36 px). Change it locally and do not change the shared `icon` size.
- `src/shared/layout/customer-footer.tsx` holds `SELLER_NAME`. Reuse it for the
  brand line.

## Requirements

- Tokens in `:root`:
  - `--duration-fast: 150ms`
  - `--duration-base: 220ms`
  - `--ease-out: cubic-bezier(0.2, 0, 0, 1)`
- Under `@media (prefers-reduced-motion: reduce)`, set `animation: none` and
  `transition: none` on all elements. The computed `animation-name` on pulse
  elements must be `none`.
- Bottom sheet:
  - Opening slides up from `translateY(100%)` and fades the backdrop in, within
    220 ms, using CSS `@starting-style` and `transition-behavior: allow-discrete`.
    Browsers without `@starting-style` open instantly.
  - Closing plays the reverse within 220 ms. It then calls `onOpenChange(false)`
    on `transitionend`, with a 300 ms timeout as a fallback. When reduced motion is
    on, it closes immediately.
  - It animates only `transform` and `opacity`.
  - Esc, backdrop click, the focus trap and focus return to the trigger keep
    working.
  - The close button is at least 44×44 (`size-11`, icon still `size-5`).
- `QtyStepper` buttons are `size-11`.
- `useDocumentHead({ title, noindex })` in `src/shared/hooks/use-document-head.ts`:
  - It sets `document.title`.
  - When `noindex` is set, it adds `<meta name="robots" content="noindex, nofollow">`
    once.
  - On unmount it restores the previous title and removes only the meta tag it added.
  - It adds no dependency.
- `CustomerBrand` in `src/shared/layout/customer-brand.tsx` renders a compact
  text mark: the seller name in navy, semibold, with a small gradient dot. An
  optional `place` prop renders "<seller> · <place>".
- `SELLER_NAME` moves to `src/shared/lib/seller.ts` so the footer and the brand line
  share it.

## Files

- Modify: `apps/web/src/index.css`
- Modify: `apps/web/src/shared/ui/bottom-sheet.tsx`
- Modify: `apps/web/src/shared/ui/input.tsx`, `apps/web/src/shared/ui/textarea.tsx`
- Modify: `apps/web/src/features/customer-menu/components/qty-stepper.tsx`
- Modify: `apps/web/src/shared/layout/customer-footer.tsx`
- Create: `apps/web/src/shared/lib/seller.ts`
- Create: `apps/web/src/shared/hooks/use-document-head.ts` and `use-document-head.test.ts`
- Create: `apps/web/src/shared/layout/customer-brand.tsx`

## Steps

1. Add the motion tokens and the reduced-motion block to `index.css` in
   `@layer base`.
2. Rewrite `SheetDialog`:
   - Add a `closing` state. `requestClose()` sets it, then waits for
     `transitionend` or a 300 ms timeout, then calls `onOpenChange(false)`. If
     `matchMedia('(prefers-reduced-motion: reduce)')` matches, it calls
     `onOpenChange(false)` at once.
   - Route `onCancel`, the backdrop click and the close button through
     `requestClose`.
   - Add classes for the open, `@starting-style` and `data-closing` states using
     the tokens.
3. Change the close button to `size-11 inline-flex items-center justify-center`.
4. Remove `md:text-sm` from `Input` and `Textarea`.
5. Set the `QtyStepper` buttons to `className="size-11"`.
6. Add `seller.ts`, `customer-brand.tsx` and `use-document-head.ts`, with tests for
   title set and restore, adding and removing the meta tag, and two hooks mounted
   at once.
7. Update `customer-footer.tsx` to import `SELLER_NAME`.

## Todo

- [x] Add motion tokens and the reduced-motion rule
- [x] Add sheet open and close transitions with a closing state and a 44 px close button
- [x] Make shared inputs 16 px at every width
- [x] Make the stepper 44 px
- [x] Add `useDocumentHead` and its tests
- [x] Add `CustomerBrand` and `SELLER_NAME` in `seller.ts`

## Verification

- `cd apps/web && pnpm test` passes. The existing menu page tests wait for the
  dialog to disappear (`page.test.tsx:27`), so they must still pass with the
  closing delay. jsdom has no `transitionend`, so the 300 ms fallback or a
  reduced-motion stub covers them; confirm which.
- `pnpm lint && pnpm typecheck` pass.
- `pnpm exec vite build && pnpm size` stays within 120 KB.
- A manual or Playwright check in Chromium: the sheet slides in and out, Esc closes
  it, and focus returns to "Thêm" or "Xem giỏ".

## Risks

- **The closing delay breaks tests or the double-submit guard.** Keep the closing
  window at 300 ms or less. Make sure `CartSheet` submit-then-navigate does not wait
  on the close animation, because navigation unmounts it.
- **`@starting-style` support varies.** Safari 17.5+ and Chrome 117+ have it. Older
  browsers open instantly, which is acceptable.
- **The seller input size changes from 14 px to 16 px on desktop.** Check the
  admin forms for overflow in the phase 7 recapture.
