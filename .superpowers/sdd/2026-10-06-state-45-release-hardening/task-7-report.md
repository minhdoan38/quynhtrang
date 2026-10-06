# Task 7 Report — Replay-safe high-impact mutations

## Changed
- Added `0021_state45_publish_replay.sql`: commercial, payment, hold/release, design approval, and library Publish request/result replay; input binding; concurrency fences; one-result uniqueness.
- Commercial Publish now resolves committed request before requiring deleted draft, preserving original immutable version.
- Admin payment/hold/release call chain now carries stable browser request IDs; SQL replays original confirmer/holder/releaser timestamps and prevents duplicate events.
- Design approvals reuse stable assessment-bound request IDs; SQL checks input hashes before closed-draft/current-state checks.
- Sticker/font/template Publish uses validation-bound stable request IDs; library Publish replays recorded item and verifies destination bytes; template version insertion verifies asset/dependency bytes.

## Verification
- Required module command: 80 passed, 0 failed.
- `pnpm typecheck`: exit 0.
- `pnpm test`: 1260 passed, 0 failed.
- SQL execution unavailable: `psql` absent; Docker/Supabase daemon stopped (`dockerDesktopLinuxEngine` pipe missing). Migration reviewed statically; staging/CI must apply it and run Supabase SQL suites.

## Self-review
- Same request plus same input returns stored result before mutable-state checks.
- Same request plus changed target/input returns conflict.
- Different requests retain row-lock/revision/status conflicts.
- Payment confirmation result preserves original `confirmed_by`/`confirmed_at`; hold/release preserve original actor/time.
- Commercial event stores full result and request mapping before draft deletion transaction commits.
- Existing Template operation log already provided result replay; change only stabilizes client intent and verifies required bytes.

## Round 1 Fixes (Addressing Task7Reviewer Findings)
1. **Retire hold request IDs on hold lifecycle completion**:
   - In `src/app/admin/orders/[id]/order-detail-client.tsx`, added `retireHoldMutationIds()`.
   - Cleared cached hold and release mutation IDs whenever an active hold is confirmed present in authoritative server detail, on hold completion, on hold conflict, in `handleReleaseHold` completion/finally block, and when opening a new hold intent.
   - Ensures subsequent holds generate a fresh request ID rather than replaying the previously released hold.
2. **Clear customer approval intent after definitive rejection**:
   - In `src/app/admin/orders/[id]/design/design-review-client.tsx`, defined `DEFINITIVE_CUSTOMER_APPROVAL_ERRORS` (`PREFLIGHT_STALE`, `ACTIVE_DRAFT_EXISTS`, `ORDER_LOCKED`, `PRODUCTION_CHANGED`, `PREFLIGHT_BLOCKED`, `WARNINGS_UNACKNOWLEDGED`, `INVALID_DOCUMENT`, `REVISION_CONFLICT`).
   - Cleared `customerApproval.current = null` upon receiving a definitive error on either initial approval or replay, allowing the user to rerun preflight and obtain a fresh assessment rather than being permanently locked into the expired assessment.
3. **`confirm_order_payment` signature backwards-compatibility**:
   - In `supabase/migrations/0021_state45_publish_replay.sql`, added the 4-argument overload for `public.confirm_order_payment(p_order_id uuid, p_expected_state text, p_purpose text, p_payment_id uuid)`. It forwards directly to the 5-argument version with `p_request_id := concat('legacy-', p_order_id::text, '-', clock_timestamp()::text)`.
   - Preserves complete compatibility for existing 4-argument callers (including `supabase/tests/state44_payment_purposes.sql` lines 168, 175, 186, 220, 234) without `function does not exist` errors, while 5-argument callers receive exact request replay.
   - In `supabase/tests/state44_payment_purposes.sql`, added section 9 testing the 5-argument signature with explicit `p_request_id` (`'test-replay-req-1'`), verifying exact replay return and zero duplicate audit events.
4. **Verification**:
   - Added regression tests in `src/test/admin-order-operations.test.ts` and `src/test/design-review-transitions.test.ts`. Verified RED before implementation and GREEN after implementation.
   - Ran required modules: `node --test --experimental-strip-types src/test/payment-flow.test.ts src/test/admin-order-operations.test.ts src/test/design-revision-integration.test.ts src/test/design-review-transitions.test.ts src/test/template-publish.test.ts src/test/template-management.test.ts src/test/state44-concurrency.test.ts src/test/commercial-config-service.test.ts src/test/state44-commercial-version.test.ts` -> 84 passed, 0 failed.
   - Ran `pnpm typecheck` -> exit 0, no errors.
   - Ran `pnpm test` -> 1264 passed, 0 failed.
