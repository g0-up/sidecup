---
title: Remove order recipient address
date: 2026-10-06
summary: Reverted the recipient address feature and dropped the column via migration 000005 on prod and tiendouong
---

# Remove order recipient address

## What happened
- The recipient address feature (f986e92 api, f143e97 web) was rolled back in commit 5a575da (not pushed yet).
- The prod and tiendouong databases were both at migration version 4. A plain git revert would have deleted 000004, and with MIGRATE_ON_START=true the API would fail at startup with "no migration found for version 4".
- Docs commit 50ce0bf was mixed with R2 image upload docs, so only the address lines were removed by hand from prd.md, docs/api.md, docs/runbook.md and docs/acceptance-p0.md.

## Decision
- Kept 000004 and added 000005_drop_order_recipient_address, which drops orders.recipient_address. Stored addresses are deleted. New databases run 4 then 5.
- `make migrate-down` is not a one-step rollback: db.Migrate(Down) calls m.Down(), which rolls back every migration.

## Verification
- API unit and integration tests pass against a throwaway postgres:16 container; TestMigrateRoundTrip now expects version 5.
- Web lint and typecheck pass. 9 web tests fail, but they fail the same way on the old HEAD (Node 24 AbortSignal vs jsdom in customer-menu, customer-order, admin-products and notifier-banner), so the revert did not cause them.
- Backups: ~/sidecup-backups/sidecup-{prod,tiendouong}-2026-10-06-1558-before-v5.dump.
- Deployed tiendouong, then prod, with make homelab-up. Both are at schema version 5 with dirty=false, the column is gone, the containers are healthy, no 5xx since deploy, and the web bundles no longer contain recipient_address.

## Next steps
- Push 5a575da to origin/master.
- Fix the pre-existing Node 24 AbortSignal test failures.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.
