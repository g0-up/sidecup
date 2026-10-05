---
title: "Seller responsive UX and AX improvements"
description: "Recompose the seller pages for phones and tablets, fix inverted danger colors, meet 24/44 px targets, compact the mobile header, and give every seller route its own title."
status: completed
priority: P1
effort: 14h
branch: master
tags: [frontend, ux, accessibility, responsive]
blockedBy: []
blocks: []
created: 2026-10-05
---

# Seller responsive UX and AX improvements

## Overview

This plan implements P1–P11 of the review
[`enhance-ux-ax-261005-1017-seller-responsive.md`](../reports/enhance-ux-ax-261005-1017-seller-responsive.md).

## Contract

- **Outcome:** the seller pages work on a 320–768 px screen without hiding controls
  inside table scrolls. Destructive steps look destructive. Service controls are at least
  44 px below `lg`, and management controls are at least 24 px. The mobile header is one
  row. Every seller route has its own title and `h1`.
- **Constraints:**
  - Keep the accessible names that unit and e2e tests use, such as the regions
    "Đã gửi", "Đang pha" and "Đang mang ra", "Đơn CODE", "Nhận đơn", "Từ chối" and
    "Xác nhận", and the single header switch.
  - Seller routes stay private (nginx `noindex`, sitemap only `/`).
  - Desktop (≥ `lg`) layouts stay as they are, except for the fixes listed here.
- **Non-goals:** a brand on seller screens (design.md exempts them), real WebSocket or
  Zalo checks, and API changes.
- **Acceptance:** the report's DONE contract, items 1–8.

## User decisions (2026-10-05)

| Question | Decision |
|---|---|
| Touch-target threshold (P6) | Split: 44 px for board, order and dialog service controls; 24 px on management pages. |
| Board switcher default (P3) | The column with the oldest late order, else "Đã gửi". Decided once, on first load. |
| Logout (P7) | Move it into the menu and ask for confirmation, warning that new orders stop sounding. |
| Pause switch (P11) | Header only. The Settings "Nhận đơn" card becomes read-only and points to the header. |

## Deviations from the report

- The compact header and the drawer apply below `lg`, not below `md`. At 768 px the full
  nav and the right-hand cluster still wrap onto two rows (92 px).
- The logout confirm applies at every width, so desktop and mobile behave the same.
- The dialog and sheet close button is 44 px below `lg` (36 px from `lg`), not 36 px at every
  width, because the VietQR dialog is a service control and must meet 44 px on phones.

## Phases

| # | Phase | Proposals | Status |
|---|-------|-----------|--------|
| 1 | Shared UI: alert-dialog class merge, dialog and sheet close button ("Đóng", 44 px below `lg`, 36 px from `lg`), header padding | P1, P5, P6 | Done |
| 2 | Board and order: danger variants, status switcher, sticky headings, 44 px service controls, VietQR scaling, focusin seen, titles | P1, P3, P5, P6, P9, P11 | Done |
| 3 | Seller shell: compact header below `lg`, Sheet menu, logout confirm, active "Đơn" on order detail, title blink without clobbering, motion-safe pulse | P7, P9, P11 | Done |
| 4 | Management pages: stacked rows below `sm`, fluid widths, titles and `h1`, read-only pause card | P2, P6, P8, P9, P11 | Done |
| 5 | Reports: stacked blocks below `sm`, wrapping headers at `md`, fluid filters | P4, P8, P9 | Done |
| 6 | Capture script, docs, verification, review | P10 and DONE | Done |

## Validation

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` in `apps/web`, then
  `make lint` and `make test`.
- `node scripts/capture-seller-audit.mjs http://localhost:5173 <round-2>` on mock data at
  the four viewports: no overflow, no table scrolling on phones, `under24` empty, a
  distinct title and an `h1` per scene.
- Playwright e2e, if the Docker stack is available; otherwise report it as not run.

## Risks

- Duplicated responsive markup doubles accessible names in jsdom, which has no CSS.
  Tests that need one element must scope their queries.
- `paused.spec` expects exactly one switch on the board, so the header must render one
  pause switch at every width.

## Results (2026-10-05)

- Capture round 2 (`plans/reports/enhance-ux-ax-261005-1017-seller-responsive/round-2/`):
  67 pages, 0 errors. `overflowX`, `tablesScrolling`, `under24`, `serviceUnder44`,
  `missingH1` and `stickyHeadings` are empty, and `smallInputs` is 0. Header height is
  56 px on phones (52 px desktop). All nine routes have distinct titles.
- Keyboard and reduced-motion checks pass. Focus returns to the trigger after the menu,
  the reject confirm, VietQR and logout close.
- `make lint` passes. `make test`: the API tests pass; the web tests have 136 passed and
  8 failed. All 8 failures are pre-existing: the same tests fail on HEAD with
  `RequestInit: Expected signal … AbortSignal` under local Node 24 (CI uses Node 22).
- `pnpm build`: `tsc -b` passes. `vite build` passes into a scratch `--outDir`, because
  `apps/web/dist/.vite` is not writable locally (it looks like a Docker build left it root-owned).
- Playwright e2e on an isolated compose project (`-p sidecup-e2e`, Postgres on host port 55432,
  with a `psql` shim into the container): Chromium 11/11 passed, re-run after the review fixes. WebKit was not run, because
  the host lacks Playwright's WebKit system libraries (`playwright install-deps` needs sudo).
- Docs: seller sections were added to `docs/design.md` and `docs/review.md`.
- Code review: no critical or high issues. The medium issues (dialog focus return, the pause
  switch name, board tests) and lows L2–L5 are fixed; see the implementation report.
