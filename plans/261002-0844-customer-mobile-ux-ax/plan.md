---
title: "Customer mobile UX and AX improvements"
description: "Turn the order page into a journey with a next step, raise every customer touch target to 44 px, add motion with reduced-motion guards, and keep token routes out of search indexes."
status: completed
priority: P1
effort: 26h
branch: master
tags: [feature, frontend, api, ux, accessibility]
blockedBy: []
blocks: []
created: 2026-10-02
---

# Customer mobile UX and AX improvements

## Overview

This plan implements every proposal (P1–P16) from the review
[`enhance-ux-ax-261002-1512-customer-mobile.md`](../reports/enhance-ux-ax-261002-1512-customer-mobile.md).
The customer can already order from a phone. This work fixes what happens after
the order is placed, and closes the touch-target, motion, title and indexing gaps.

## Contract

- **Outcome:**
  - The order page links back to the table menu and shows the status as a large
    sentence with an expected time.
  - Every customer control is at least 44 px.
  - Inputs stay at 16 px at every width.
  - Sheets and add-to-cart have motion that respects reduced motion.
  - Every route has its own title.
  - Token routes send `noindex`, and shared links get a branded preview card.
- **Constraints:**
  - The customer JS budget stays at 120 KB gzip or less (`make size`).
  - No Radix on customer routes; the native `<dialog>` sheet stays.
  - CSP is `script-src 'self'`, so no inline scripts.
  - The public order view never exposes the phone number or `client_id`.
- **Non-goals:**
  - GEO work: `llms.txt`, markdown twins, JSON-LD and SSR (accepted gaps in the report).
  - Per-bot crawler blocking.
  - A real logo or photography.
  - Seller-page redesign. Seller pages change only through the shared `Input`
    and `Textarea` font fix.
- **Acceptance:** the report's DONE contract, extended to P14 and P15, is checked
  in [Phase 7](./phase-07-verify-and-audit.md).

## User decisions (2026-10-02)

| Question | Decision |
|---|---|
| Reorder link source (P1) | The API returns `menu_path` on the public order view. localStorage is not used, because the Zalo in-app browser has its own storage. |
| ETA and Zalo notice (P5) | The public order view adds `eta_minutes` and `notify_zalo` (a boolean); the phone number stays private. |
| Brand assets (P9, P12) | A styled text mark from `VITE_SELLER_NAME`, theme-color navy `#233c65`, and an `og-image.png` rendered by Playwright from an HTML template. |
| Could items | P14 (a solid selected chip) and P15 (phone check on blur, cancel confirm) are in scope. |

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Public order contract](./phase-01-public-order-contract.md) | Pending |
| 2 | [Shared foundations](./phase-02-shared-foundations.md) | Pending |
| 3 | [Order page](./phase-03-order-page.md) | Pending |
| 4 | [Menu page and error pages](./phase-04-menu-page.md) | Pending |
| 5 | [Discovery surfaces and document head](./phase-05-discovery-and-head.md) | Pending |
| 6 | [Design and review docs](./phase-06-design-docs.md) | Pending |
| 7 | [Verify and audit](./phase-07-verify-and-audit.md) | Pending |

The phases run in order: 1 → 2 → 3 → 4 → 5 → 6 → 7. Phases 3 and 4 need the
types from phase 1 and the shared pieces from phase 2.

## Proposal coverage

| Proposal | Phase |
|---|---|
| P1 reorder link, P5 status hero, P13 order skeleton, P15 cancel confirm | 1 (API), 3 |
| P2 touch targets, P3 16 px inputs, P7 motion system | 2, 3, 4 |
| P6 add-to-cart feedback, P8 image placeholder, P14 chip, P15 phone blur | 4 |
| P9 brand line | 2 (component), 3, 4, 5 (theme-color) |
| P10 document titles | 2 (hook), 3, 4 |
| P11 next steps on error pages | 3 (order), 4 (menu, revoked, home, 404) |
| P4 robots, sitemap and `noindex`; P12 OG card; P13 static shell | 5 |
| P16 DESIGN, REVIEW and AGENTS docs | 6 |

## Dependencies

- Evidence baseline: `plans/reports/enhance-ux-ax-261002-1512-customer-mobile/round-1/`.
- `make e2e` needs Docker and host port 5432. Another project's Postgres currently
  holds that port. Do not stop it without asking the user.

## Unresolved questions

1. **`AGENTS.md` location (P16):** the repository rule keeps markdown in `plans/` and
   `docs/` unless the user asks otherwise. Should `AGENTS.md` be created at the
   repository root, or should its rules go into `docs/README.md`? `DESIGN.md` and
   `REVIEW.md` become `docs/design.md` and `docs/review.md` either way.
2. **Production check:** may the run fetch
   `https://sidecup.cauchuyenlaptrinh.com/robots.txt` and a `/t/` URL, to confirm
   the live headers after deploy?
3. **Port 5432:** when phase 7 needs the `full` compose stack, may the run pause the
   other project's Postgres, or should it record the production-build checks as
   blocked?
