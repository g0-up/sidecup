## Code Review Summary — Zalo customer order status

### Scope
- Plan: plans/261002-1011-zalo-customer-order-status/plan.md (+ phase files)
- API: internal/features/zalo/{service,link_manager,handler,repository,dto,model,errors,message}.go (+tests), zalo/protocol/* (light pass), platform/secrets, notifications/{dispatcher,message,service}.go (ClaimKind, AckPermanent), app/router.go (newZalo), cmd/api/main.go, orders/{dto,service}.go (optional phone), platform/config (ZALO_CREDENTIAL_KEY), migration 000003, .golangci.yml
- Web: shared/api/zalo.ts, admin-settings/components/zalo-card(+test), admin-settings/page.tsx, notifier-banner(+test), customer-menu phone-optional parts, mocks, e2e/order-without-phone.spec.ts
- Docs: prd.md, docs/api.md, docs/runbook.md, docs/acceptance-p0.md
- LOC: ~3.8k feature/test lines + ~3.2k vendored protocol lines; +263/-50 in modified tracked files
- Ignored per instruction: shared/ui/*, index.css, main.tsx, seller-layout, cart-bar, product-sheet, pause-switch, sound-toggle, package.json, lockfile, cart-sheet Button variant line
- Scout findings: probe-driven relogin cadence (every 15-20m) amplifies any relogin misclassification; persistLink/sessionFor share the session cache without a common generation fence; web cancel is client-only while the server link attempt continues.

### Overall Assessment
Solid, well-tested implementation. No Critical issues. Typed-nil, configured/not-configured gating, outbox semantics for not-linked/expired/not-found, credential sealing, PII hygiene in logs, shutdown ordering and Unlink-vs-persist races are all handled and tested. The main defect is error classification: every relogin failure (including transient network errors) is treated as dead credentials, which produces false "Phiên Zalo đã hết hạn" red banners and pauses delivery for up to ~20 minutes — this undermines AC2/AC4. A relink cache race and a client-only "Huỷ" round out the material concerns.

### Critical Issues
None.

### High Priority

**H1. Transient relogin failure is recorded as session expired** — apps/api/internal/features/zalo/service.go:309-312 (sessionFor), :270-274 (VerifyAccount), :278-289 (probeOnce); root cause protocol/auth.go:58 (LoginWithCredentials) and :224 (fetchLoginInfo ignores base.ErrorCode).
- Failure scenario: the health probe evicts the cache and relogs in every 15m+jitter (~72-96 logins/day). One DNS blip, Zalo 5xx, 60s client timeout, or shutdown-cancelled ctx -> relogin returns a generic error -> `s.expire(ctx)` -> account status=expired -> notifier banner turns red with the exact "Phiên Zalo đã hết hạn..." text, and Dispatcher.SessionHealthy=false pauses the send loop. Recovery only happens at the next probe (15-20 min later; the probeOnce comment acknowledges this path). Customer-status items older than MessageTTL (30m) can expire unsent; sellers are told to rescan a QR that is actually fine. Breaks AC4 ("banner red only for this reason") and the ≤10s delivery target of AC2.
- Also: VerifyAccount evicts the working session *before* knowing the replacement works, so a transient probe failure also destroys a healthy cached session.
- Fix:
  1. In protocol, distinguish explicit rejection (non-zero envelope/inner error_code, missing/undecryptable payload after a 200) from transport failure (net.Error, *url.Error, context errors, HTTP 5xx). Return `*APIError` / a sentinel `ErrCredentialsRejected` for the former.
  2. In sessionFor: `if ctx.Err() != nil || !isRejection(err) { return nil, ErrTransient }` — no expire. Dispatcher treats ErrTransient like a pause (no ack, no attempt burned) but keeps status unchanged.
  3. VerifyAccount: login into a fresh session first, swap into the cache only on success (bumping the eviction counter), keep the old session on transient failure.
  4. Tests: relogin returns `&url.Error{Err: context.DeadlineExceeded}` -> status stays linked, banner not red; relogin returns rejection -> expired.

### Medium Priority

**M1. persistLink cache.put does not fence in-flight sessionFor (relink race)** — service.go:414 vs service.go:296/321.
- Scenario: seller rescans while a sessionFor (probe, or first send after restart) is mid-relogin with the OLD credentials. persistLink upserts the new row and `cache.put(live)` without bumping the eviction counter. The in-flight sessionFor then:
  - old creds dead -> `expire()` evicts the NEW live session and marks the NEW row expired -> red banner immediately after a successful rescan;
  - old creds alive -> `putUnlessEvicted(old, since)` succeeds and overwrites the new session; messages go out from the old account and uids resolved under it are cached for 24h; recordHealthy writes against the new row.
- Fix: make persistLink use a `replace()` that increments the eviction/generation counter before installing `live`; make expire/recordHealthy conditional on the row identity read at the start (e.g. `UPDATE ... WHERE id=1 AND linked_at = ?` or a version column). Add a test with a blocking fake relogin that interleaves persistLink.

**M2. Web "Huỷ" only clears local state; polling gives up on first error** — apps/web/src/features/admin-settings/components/zalo-card.tsx:121 (onCancel={() => setLinkId(null)}), :230/:254 (cancel buttons), :55-56 (retry:false, refetchInterval stops on any error).
- Scenario A: seller shows QR, clicks Huỷ, but the phone already scanned/confirms a few seconds later. Server linkManager attempt still runs, persists, account becomes linked and customer messages start going out from an account the seller believes they cancelled. Card keeps showing "chưa kết nối" until some unrelated refetch (zaloKey not invalidated, not pushed over WS).
- Scenario B: one transient poll failure (Wi-Fi hiccup on the seller tablet) stops polling permanently and shows "Không tạo được mã QR", while the server attempt can still succeed silently.
- Fix: add `DELETE /api/seller/zalo/link/:id` (or POST .../cancel) calling links.cancel for that attempt and call it from onCancel; invalidate zaloKey on cancel and on error; set `retry: 2` (or tolerate N consecutive errors in refetchInterval) before declaring failure. Add tests: cancel calls the endpoint; one 500 followed by a 200 keeps polling.

### Low Priority
- **L1. Acks use the cancellable loop ctx** — notifications/dispatcher.go:175, :186, :195. A send that succeeded right before shutdown (or during a DB blip) is not acked, stays leased, and is re-sent after the lease (customer gets a duplicate). Fix: `ackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)`.
- **L2. Shutdown-cancelled relogin calls expire()** — service.go:309-312. expire runs with a cancelled ctx, logs an Error ("không đánh dấu được") and evicts the cache. Subsumed by H1's `ctx.Err()` guard.
- **L3. Probe and dispatcher relogin concurrently** — VerifyAccount's evict makes a concurrent dispatcher sessionFor fail putUnlessEvicted -> ErrNotLinked -> 30s pause, while claimed items wait out the 60s lease. Also two logins per probe tick. Fix: single-flight relogin (golang.org/x/sync/singleflight or a mutex around the miss path).
- **L4. Inner-envelope error codes are not *APIError** — protocol/client.go:361. `decryptDataField` returns `fmt.Errorf("inner error code %d: %s")`, so an inner -3 (the case errors.go:5 describes) is not detected by expireIfLoggedOut, and Zalo's inner ErrorMessage — which errors.go:14 says can quote the request — lands in outbox last_error (DB only, not API responses). Fix: return `&APIError{Op: "inner", Code: inner.ErrorCode}` without the message.
- **L5. claim() expiry vs in-flight send** — expiry (MessageTTL) applies to all kinds at claim time; an item mid-send in one batch can be marked failed by a later claim if it crosses TTL, recording a delivered message as failed. Edge case; acceptable for single replica, note in runbook or exclude leased rows from expiry.
- **L6. No key -> no claim() ever runs** — without ZALO_CREDENTIAL_KEY the send loop is not started, so expiry of pending customer_status rows never happens; rows stay pending indefinitely. Informational (enqueue already guarded on phone; consider not enqueuing customer_status when Zalo is disabled).
- **L7. SessionHealthy Warn log every 2s while DB is down** — dispatcher.go:109/127 path. Rate-limit or log on state change.
- **L8. Probe keeps logging in with dead credentials** every 15-20m forever while expired (probeOnce verifies expired accounts by design). Risk of the account looking automated. Consider backoff (e.g. stop after N rejections, or only probe expired accounts hourly).
- **L9. zaloKey card status not refreshed over WS** — banner updates via notifier.status, but the settings card shows stale "đã kết nối" after expiry until refetch. Invalidate zaloKey when notifier.status reports zalo_expired.
- **L10. Banner fallback text** "Zalo không gửi được tin — chỉ còn chuông báo trên màn này" for a stale heartbeat is now semantically off (it is about seller notifications, not customer Zalo). Plan keeps it intentionally — informational.
- **L11. protocol/ comments are English** against the repo Vietnamese-comment convention; plan explicitly said copy verbatim (with zcago/goclaw attribution). Informational.
- **L12. At-least-once delivery** — a send that times out at 60s but was actually delivered is retried (duplicate message). Inherent to the outbox; document in runbook.

### Edge Cases Found by Scout
- Probe cadence x unclassified relogin errors -> periodic false expiry (H1).
- Relink during in-flight relogin -> old session/expiry leaks onto new row (M1).
- Client-side cancel vs live server attempt -> silent link (M2).
- Shutdown during relogin -> spurious expire + error log (L2); during ack -> duplicate send (L1).
- Concurrent probe/dispatcher relogin -> spurious 30s pause (L3).
- Inner -3 not recognized (L4).

### Verified OK (risk calibration)
- No typed-nil: newZalo returns untyped nil sender when unconfigured; dispatcher var assigned before Run; OnStatusChange closure safe.
- requireConfigured uses httpx.Fail (AbortWithStatusJSON) -> 503 ZALO_NOT_CONFIGURED; GET with nil svc -> configured:false (AC6).
- Not-configured / not-linked never turn the banner red; expired message text matches AC4 exactly, link to /seller/settings present.
- ErrRecipientNotFound -> AckPermanent (status=failed, no retry, no banner since Ack failedNow publishes only for seller_new_order) (AC3).
- ErrNotLinked/ErrLinkExpired leave items unacked -> attempts not consumed (AC4).
- Credentials sealed with AES-256-GCM; status/link DTOs carry no credentials; dispatcher test asserts phone and secret absent from ack messages; SafeError strips url.Error URL (AC5).
- Unlink cancels and waits for in-flight persist; persist uses WithoutCancel+10s; tests cover the races.
- Shutdown: srv.Shutdown -> Zalo.Close (probe + link goroutines); Dispatcher.Run exits on gctx. No goroutine leak found.
- Optional phone end to end (DTO omitempty, blank -> nil, enqueue guarded, web label, MSW, e2e).
- message.go labels match web CUSTOMER_STATUS_LABEL.
- No plan IDs/phase numbers in new code or test names.

### Recommended Actions
1. Fix H1 (classify relogin errors; no expire on transient/ctx errors; VerifyAccount swap-on-success) with tests.
2. Fix M1 (generation bump on persistLink, row-identity-conditional expire/recordHealthy) with an interleaving test.
3. Fix M2 (server cancel endpoint + invalidate on cancel/error + poll retry tolerance) with web tests.
4. L1 ack context, L4 inner APIError, L3 single-flight — cheap and reduce duplicates/false pauses.
5. Remaining Lows as backlog.

### Metrics
- go vet ./...: clean
- go test -race ./...: pass
- go test -tags integration -race (app, zalo, notifications, orders): pass
- golangci-lint run ./...: 0 issues
- web: vitest (admin-settings, notifier-banner, customer-menu) 6 files / 29 tests pass; tsc --noEmit clean; pnpm lint clean
- Type coverage / test coverage %: not measured
- e2e not executed (no dev servers per constraint)

### Plan Follow-ups
- All plan phases appear implemented. AC1, AC3, AC5, AC6, AC7 satisfied. AC2 and AC4 are at risk from H1 (false expiry pauses delivery and turns the banner red for a non-expiry reason). Recommend the lead keep the plan open until H1 (and ideally M1/M2) are fixed. No plan files edited.

### Unresolved Questions
- Does Zalo report "not logged in" (-3) in the outer envelope or the inner encrypted envelope for send/lookup? Determines whether L4 is actually Medium.
- Is a silent link after "Huỷ" acceptable product-wise, or must cancel be authoritative (M2)?
- Should customer_status rows be enqueued at all when Zalo is not configured (L6)?

Status: DONE_WITH_CONCERNS
Summary: No Critical issues and all lint/type/unit/integration checks are green, but every relogin failure (including transient network errors) is recorded as an expired session, causing false red banners and up to ~20 min paused delivery; plus a relink cache race and client-only link cancel.
Concerns/Blockers: H1 (service.go:309-312 + protocol/auth.go error classification), M1 (service.go:414 vs :321), M2 (zalo-card.tsx:121, :55-56).
