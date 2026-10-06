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
