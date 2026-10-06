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

## Fix Round 1 (Post-Review Hardening)

- **Pre-migration deduplication/quarantine**:
  - Added `public.state45_integrity_quarantine` table with RLS enabled.
  - Added safe `DO $$` pre-migration block in `0022_state45_integrity_constraints.sql` partitioning by parent entity, sorting by `updated_at DESC, id DESC`:
    - Design revision drafts: marks older active drafts as discarded, logs snapshot into quarantine.
    - Template drafts: reparents dependent asset and validation run foreign keys to keeper, logs snapshot to quarantine, deletes duplicate row.
    - Commercial product drafts: logs snapshot to quarantine, deletes duplicate row.
    - Commercial pricing tiers: sets `migration.allow_commercial_mutation = '1'`, logs snapshot to quarantine, deletes duplicate tier row.
- **Index predicate cleanup**:
  - Removed redundant `WHERE id IS NOT NULL` predicates on `template_drafts(template_id)` and `product_commercial_drafts(product_id)` unique indexes.
- **Expanded integrity test assertions**:
  - `supabase/tests/state45_integrity.sql` now verifies:
    - Assigning invalid UUID to `products.current_commercial_config_version_id` is rejected by FK constraint (`foreign_key_violation`).
    - Assigning cross-project design version to `orders.production_design_version_id` is rejected by composite FK constraint (`foreign_key_violation`).
- **Contract test coverage**:
  - Updated `src/test/state45-db-invariants.test.ts` to assert pre-migration quarantine DO block, clean unique index signatures, invalid commercial version FK rejection, and cross-project FK rejection.

### Fix Round 1 Verification
- Focused test `src/test/state45-db-invariants.test.ts`: 3 passed, 0 failed.
- `pnpm typecheck`: passed (exit code 0).
- `pnpm test`: 1279 passed, 0 failed.
