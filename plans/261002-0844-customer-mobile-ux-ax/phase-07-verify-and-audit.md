---
phase: 7
title: "Verify and audit"
status: pending
priority: P1
effort: "3h"
dependencies: [1, 2, 3, 4, 5, 6]
---

# Phase 7: Verify and audit

## Goal

Prove the report's DONE contract, extended to P14 and P15, using fresh evidence:
- captures at four viewports;
- keyboard and reduced-motion checks;
- the quality gates;
- the e2e specs for the touched flows;
- the discovery scan;
- a production-build Lighthouse run.

Then record the result in the review report and stop every process this run
started.

## Context

- The baseline evidence is in
  `plans/reports/enhance-ux-ax-261002-1512-customer-mobile/round-1/`. Write the new
  evidence to `round-2/` next to it.
- MSW mock mode works only in dev (`VITE_USE_MOCK=1 pnpm dev`, see
  `apps/web/src/main.tsx:10`), so it can serve the captures.
- The production build needs the real API. Lighthouse, the nginx header checks and
  `make e2e` therefore need the `full` compose profile (web on `:8081`). That
  profile binds host port 5432, which another project's Postgres currently holds.
  **Do not stop that process.** Ask the user, or record the blocked checks as
  unresolved with the bind error as evidence.
- A `vite` process running from `/app` (a container) belongs to someone else.
  Leave it alone.

## Requirements

- **Capture script:** `apps/web/scripts/capture-customer-audit.mjs` (kept so that
  `docs/review.md` can point at it). It uses `@playwright/test` Chromium against a
  base URL argument and:
  - visits `/`, an unknown route, `/t/DEVTEST001` (menu, product sheet, cart sheet
    with invalid phone, after-add), `/t/<bad>`, `/revoked` and `/o/<id>` for each
    status in the mocks;
  - runs at 1440×900, 768×1024, 375×812 and 320×640;
  - saves PNGs and an `audit.json` with, per page:
    - interactive elements under 44×44;
    - computed input `font-size` below 16 px;
    - `document.title`;
    - `scrollWidth > clientWidth`;
    - the `meta[name=robots]` content.
- **Reduced motion and keyboard:** with Playwright `reducedMotion: 'reduce'`, the
  computed `animation-name` on pulse elements is `none` and the sheet opens and
  closes without a transition. Using the keyboard only:
  - "Thêm" opens the product sheet;
  - focus stays trapped inside the sheet;
  - Esc closes it and focus returns to the trigger;
  - the cart sheet behaves the same;
  - the two-step cancel works with Enter.
- **Gates:** `make lint`, `make test`, `cd apps/web && pnpm build` and `make size`
  all pass.
- **E2E:** `make e2e` passes. It must cover at least `happy-path`,
  `customer-cancel`, `unconfirmed-prompt`, `paused`, `revoked-qr`,
  `order-without-phone` and `unavailable-product`.
- **Discovery:**
  - `node .claude/skills/ak-enhance-ux-ax/scripts/check-discovery-surfaces.mjs http://localhost:8081`
    exits 0. Only the accepted GEO warnings remain.
  - The phase 5 `curl -sI` header checks pass.
- **Lighthouse** (mobile preset, production build on `:8081`) for `/t/DEVTEST001`
  and `/o/<id>`. Record Performance, Accessibility, Best Practices, SEO, LCP and
  CLS. CLS must be 0.1 or less.
- **Seller check:** capture `/seller/login` and one seller form at 1440 px, to
  confirm the 16 px input change causes no overflow.
- **Vision review:** compare `round-2` with `round-1`. There must be no High issue:
  no overflow, clipping, overlap or broken image. Re-score the 10 rubric areas.
  Brand recall, Storytelling, Motion and Performance feel each score at least 2.

## Files

- Create: `apps/web/scripts/capture-customer-audit.mjs`
- Create: `plans/reports/enhance-ux-ax-261002-1512-customer-mobile/round-2/` (evidence)
- Modify: `plans/reports/enhance-ux-ax-261002-1512-customer-mobile.md` (round-2 scores, DONE status, remaining gaps)
- Modify: `plans/261002-0844-customer-mobile-ux-ax/plan.md` and phase files (status)

## Steps

1. Record the running processes (`ps`, `ss -ltnp`) before starting anything.
2. Start `VITE_USE_MOCK=1 pnpm dev` in the background on the default port, after
   checking that the port is free, and note its PID. Run the capture script, then
   the reduced-motion and keyboard checks.
3. Run `make lint`, `make test`, `pnpm build` and `make size`.
4. Check whether port 5432 is free.
   - If it is free, run `make e2e`. Then bring the `full` profile up again with
     `VITE_PUBLIC_ORIGIN=http://localhost:8081`, and run the header checks, the
     discovery scan and Lighthouse.
   - If it is held, ask the user before going further. Otherwise mark those checks
     as blocked, with the evidence.
5. Run the vision review, re-score the rubric and update the report.
6. Stop the dev server and the compose stack that this run started. Confirm with
   `ps` and `ss` that nothing started here is still running.

## Todo

- [x] Write the capture script and capture `round-2` at four viewports
- [x] Pass the reduced-motion and keyboard checks
- [x] Pass lint, unit tests, the build and the size budget
- [x] Pass the e2e specs for the touched flows (or record them as blocked)
- [x] Pass the discovery scan, header checks and Lighthouse (or record them as blocked)
- [x] Check the seller forms for overflow
- [x] Update the report with scores and DONE status
- [x] Stop the processes started here

## Verification

- `round-2/audit.json` shows zero customer targets under 44 px, zero inputs under
  16 px, a unique title per route, no horizontal overflow, and `noindex` on
  `/t/`, `/o/` and `/revoked`.
- Every DONE contract item is marked met, or blocked with evidence.

## Risks

- **Port 5432 blocks the production-build checks.** This is handled by asking the
  user or recording the checks as blocked. Never stop the other project's Postgres
  without consent.
- **`npx lighthouse` needs network access.** If it is unavailable, use Chrome
  DevTools' Lighthouse via Playwright CDP, or record the check as blocked.
- **The mock data lacks a status needed for a capture.** Add it to
  `src/mocks/db.ts` as dev-only data. This is not a shortcut, because the mocks are
  dev-only by design.
