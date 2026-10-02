---
title: Customer mobile UX and AX plan delivered
date: 2026-10-02
summary: All 7 phases shipped uncommitted; review caught a lost order.created and a double-tap cancel; a sheet safety net broke dev under StrictMode until a browser re-run caught it
---

# Customer mobile UX and AX plan delivered

## What happened

Plan `plans/261002-0844-customer-mobile-ux-ax` (P1–P16) is implemented across the API
public order view and the customer web routes. Gates pass: web lint, typecheck,
137/137 unit tests, build, size (`/t/` 109.6 KB, `/o/` 103.9 KB gzip); API vet,
golangci-lint and integration tests; e2e on Chromium and WebKit; 18/18 keyboard and
reduced-motion checks. Report: `plans/reports/enhance-ux-ax-261002-1512-customer-mobile.md`.

The code review found two real bugs:

- `orders/service.go` `Create` read the ETA after commit. A failure there returned an
  error before `order.created` was published, and a retry with the same
  Idempotency-Key only returned the stored order, so the seller was never told.
  The ETA is now read inside the transaction.
- `unconfirmed-prompt.tsx` put "Xác nhận huỷ" where "Huỷ đơn" had been, so a double
  tap or two Enters cancelled the order. "Không huỷ" now takes that spot and focus.

The first fix for the dialog `onClose` safety net guarded on `isConnected`. Unit tests
passed, but the browser keyboard re-run showed every sheet closing on open in dev:
StrictMode's simulated unmount calls `close()` while the dialog is still attached,
and the browser's async `close` event arrives after the remount. It now uses a
self-close flag, with a StrictMode unit test that fails on the old guard.

## Decision

- Verify each review fix with a test that fails on the old code, and re-run the
  browser checks after jsdom-green changes to native `<dialog>` behaviour: jsdom's
  polyfill dispatches `close` synchronously and hides ordering bugs.
- Port 5432 belongs to another project; the e2e stack ran on an alternate-port
  compose override (documented in `docs/review.md`) instead of stopping it.

## Next steps

- Commit (nothing committed yet, including `public/og-image.png`).
- After deploy, `curl -sI` a token route and `/robots.txt` on production.
- Open questions: drop `canonical` on noindex routes; LCP 2.9–3.0 s on token pages;
  seller board periodic resync.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
