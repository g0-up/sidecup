---
title: Plan customer mobile UX and AX improvements
date: 2026-10-02
summary: Seven-phase plan for proposals P1-P16 from the customer mobile UX/AX review
---

# Plan customer mobile UX and AX improvements

## What happened

The customer mobile UX/AX review
(`plans/reports/enhance-ux-ax-261002-1512-customer-mobile.md`) became a seven-phase
plan of about 26 hours: `plans/261002-0844-customer-mobile-ux-ax/plan.md`.
All proposals P1–P16 are in scope, including the Could items P14 and P15.

## Decisions

- **Reorder link:** the public order view returns `menu_path`, `eta_minutes` and
  `notify_zalo`. localStorage was rejected because the Zalo in-app browser keeps
  storage apart from Safari and Chrome, so a stored table token would be missing
  there. The phone number stays private.
- **Discovery surfaces:** nginx serves `robots.txt`, `sitemap.xml` and
  `X-Robots-Tag: noindex, nofollow` using `$host`, because the VPS and homelab
  domains differ. Token routes are not disallowed, so crawlers can see the noindex.
- **Absolute URLs:** the OG and canonical URLs come from a new `VITE_PUBLIC_ORIGIN`
  build argument, injected by a `transformIndexHtml` plugin. They are omitted when
  the argument is empty.
- **Bottom sheet:** the native `<dialog>` sheet gets `@starting-style` transitions
  and a closing state, keeping customer routes free of Radix and within the 120 KB
  budget.

## Open questions

- Root `AGENTS.md` versus a section in `docs/README.md`.
- Permission to fetch the production site.
- Port 5432 is held by another project's Postgres. This blocks `make e2e` and the
  production-build checks in phase 7.

## Next steps

Run `/ak:cook plans/261002-0844-customer-mobile-ux-ax/plan.md`.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
