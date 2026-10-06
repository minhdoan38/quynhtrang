# Task 16 Report: Recovery documentation and final manual QA

## 1. Scope & Changes
- Created `docs/operations/state45-recovery-runbook.md` detailing:
  - **Guest Project Recovery:** local key/schema, IndexedDB blob ID (`assetId`), quota/corruption quarantine (`quynhtrang-quarantined-projects-v1`), safe export/retry, 3-project/30-day retention rules and retention protection.
  - **Cloud Autosave Recovery:** monotonic server revision, base revision, pending local snapshot, reconnect, conflict dialog, canonical refetch.
  - **Draft Lease Recovery:** lease owner/session, lease epoch (`lease_epoch`), 120s expiry and 30s heartbeat, explicit Admin takeover with audit logging, stale-writer fencing.
  - **Order Submit Recovery:** Order ID, public Order code, idempotency key lookup, operation reference lookup, lost response triage, same-intent replay, never recreate blindly.
  - **Payment Report & Confirmation:** refetch payment and audit log, distinguish `reported` / `already_reported` / `already_paid` outcomes, atomic RPC `report_checkout_payment`, concurrent Admin confirmation row-locking.
  - **Production Artifact Generation:** job attempts, atomic RPC `claim_next_render_job`, expired lease reclaim, failed attempt retry, output verification, immutable DesignVersion preservation.
  - **Production Lifecycle Transitions:** start/complete transitions, Admin-only role, in-production precondition, frozen snapshot, request/event reconciliation, no repeat under new request.
  - **Publish Recovery:** commercial versioning, template atomic publish, request-to-version result replay, historical Order economics and dependency preservation.
  - **Migration & Upload Recovery:** safe upload retry, source retention, deterministic storage object reconciliation before cleanup, proof-bound account claim via HttpOnly cookie, partial migration recovery.
  - **Support-safe Diagnostics:** allowlisted identifiers (public Order code, short support code e.g. `A7KF2`, operation ID), strictly prohibited items (UUIDs, auth tokens, signed URLs, secrets, PII, artwork/DesignDocument dumps).
  - **Manual QA Verification Checklist:** exactly 18 numbered manual QA scenarios with Preconditions, Steps, Expected UI, Expected authoritative observable, and Recovery/diagnostic check.
- Updated `README.md` to link `docs/operations/state45-recovery-runbook.md` in the operations and runbook section.
- Created `src/test/state45-recovery-runbook.test.ts` verifying all 11 required recovery headings, recovery keywords, and all 18 numbered QA scenarios with complete block structures.

## 2. Verification Evidence
- `node --test --experimental-strip-types src/test/state45-recovery-runbook.test.ts`:
  - 2/2 tests passed (0 failures).
  - Verified RED (failure before file creation) and GREEN (pass after complete implementation).
- `pnpm run lint`:
  - Exit code 0, 0 errors, 0 warnings across `src`, `scripts`, and `e2e`.
- `pnpm run typecheck`:
  - Exit code 0, clean TypeScript diagnostics (`tsc --noEmit`).
- `pnpm test`:
  - Exit code 0, 1309/1309 tests passed across 104 test suites (0 failures).

## 3. Commit
- Commit: `docs(operations): add State45 recovery runbook`
