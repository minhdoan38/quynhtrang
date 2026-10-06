# Task 10 Report — Invariant Constraints and Storage-Integrity Checks

## Changes

- Added `supabase/migrations/0022_state45_integrity_constraints.sql`.
  - Idempotent active-draft indexes for design revisions, templates, and commercial product drafts.
  - Idempotent `(rule_id, minimum_quantity)` pricing-tier uniqueness index.
  - Same-product current-commercial-version foreign key guard.
  - Same-project immutable order design-version foreign keys, `NOT VALID` for legacy-safe deployment.
  - Duplicate-object guards around foreign-key installation.
- Added `supabase/tests/state45_integrity.sql`.
  - Rejects duplicate active drafts and duplicate tier starts.
  - Rejects nonexistent order design-version pointers.
  - Uses transaction rollback.
- Added `supabase/tests/state45_security.sql`.
  - Checks anonymous private-table visibility, customer tenant isolation, and editor production RPC denial.
  - Uses transaction rollback.
- Added `src/test/state45-db-invariants.test.ts` contract coverage for SQL files, required predicates, pointer constraints, rejection cases, and rollback markers.

## Verification

- Focused TypeScript contract suite: 3 passed, 0 failed.
- `pnpm typecheck`: passed.
- `pnpm test`: 1279 passed, 0 failed.
- SQL scripts not executed locally: workstation lacks `psql`/Docker per project runbook; CI/staging must run them against isolated Supabase.

## Scope review

- Only four Task 10 files added plus report.
- Grep confirmed no duplicate State 45 constraint names outside migration; existing State 39 design index remains intentionally reused through `IF NOT EXISTS`.
