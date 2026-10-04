# Task 4 Report: Backfill stable catalog identities and initial commercial versions

## What was implemented

1. **`supabase/migrations/0011_state44_catalog_backfill.sql`**:
   - Fail-closed verification gate asserting presence of canonical products (`wrapping`, `card`, `sticker`, `notebook`) and variants (`a1`, `a2`, `horizontal`, `vertical`, `die-cut`, `fixed-shape`, `phone`, `standard`).
   - Mapped all 8 variants to their exact Task 1 `definition_key` (`wrapping:a1`, `wrapping:a2`, `card:horizontal`, `card:vertical`, `sticker:die-cut`, `sticker:fixed-shape`, `sticker:phone`, `notebook:standard`).
   - Created immutable Commercial Config v1 for each canonical product with `version_number = 1`, `currency = 'VND'`, `payment_policy = '{"kind":"full_payment"}'`, and quantity lattice rule (`minimum_quantity = 1`, `quantity_step = 1`, `maximum_quantity = null`), with a pricing tier at threshold 1 matching legacy `product_variants.price`.
   - Updated `products.current_commercial_config_version_id` to point to version 1 only after child rules and pricing tiers validated.
   - Transitioned `status` from legacy `active = true` to `status = 'active'` only where a validated commercial rule and definition_key exist; otherwise marked `status = 'draft'` with explicit actionable `state44Blockers` in `metadata`.
   - Preserved legacy Orders: populated `commercial_config_version_id`, `payment_policy = '{"kind":"full_payment"}'`, `amount_due_now = total`, `remaining_amount = 0`, and `applied_tier_minimum_quantity = 1` without altering or recomputing historical `total`, `unit_price`, `subtotal`, `currency`, or snapshots.
   - Updated all `order_payments` rows to `purpose = 'full_order_payment'`.

2. **`supabase/seed_state44.sql`**:
   - Added development and test fixtures under `migration.allow_commercial_mutation = '1'`:
     * Draft Product with incomplete Variant config (`fixture-draft-product`, `fixture-draft-var`, `status = 'draft'`, `state44Blockers` recorded).
     * Active full-payment Product with two commercial versions (`fixture-active-full`, `fixture-full-var-1`, `fixture-full-var-2`, v1 and v2, with current pointer linked to v2).
     * Active fixed-deposit Product with validated tiers (`fixture-active-deposit`, `fixture-deposit-var`, `depositAmount = 50000`, min qty 10 * 15,000 = 150,000 >= 50,000, qty 50 * 12,000 = 600,000 >= 50,000).
     * Archived Product and archived Variant with historical Project, Design Version, Template, and Order references (`fixture-archived-product`, `fixture-archived-var`, `status = 'archived'`).
   - Left all existing stable State 43 template target rows untouched.

3. **`supabase/tests/state44_catalog_backfill.sql`**:
   - Transactional verification suite wrapped in `begin; ... rollback;`.
   - Asserts 4 active canonical products with valid current commercial config pointers.
   - Asserts 8 active canonical variants with valid Task 1 definition keys.
   - Asserts commercial config v1 exists with full payment policy and matching prices.
   - Asserts legacy orders have normalized commercial payment fields without recomputed totals.
   - Asserts fail-closed blocker behavior on an incomplete variant.

4. **`src/test/state44-catalog-backfill.test.ts`**:
   - Automated TypeScript test suite with 17 test cases across 5 suites:
     * Static catalog alignment and definition keys verification.
     * Commercial config v1 structure and domain invariants verification using `validateCommercialConfig` and `calculatePrice`.
     * SQL Migration 0011 inspection for fail-closed checks, definition keys, full_payment, current version pointer assignment order, and legacy order preservation.
     * SQL Seed State 44 fixture inspection verifying draft, 2-version full-payment, fixed-deposit, and archived references.
     * In-memory backfill execution simulation proving accurate state transitions and historical data preservation.

## What was tested and test results

- Focused test suite: `node --test --experimental-strip-types src/test/state44-catalog-backfill.test.ts src/test/commercial-config.test.ts src/test/product-catalog.test.ts src/test/product-state.test.ts src/test/product-definition-registry.test.ts src/test/pricing.test.ts` (70/70 passed).
- State 43 template & migration suite: `node --test --experimental-strip-types src/test/template-migration.test.ts src/test/template-catalog.test.ts src/test/template-management.test.ts src/test/template-validation.test.ts` (57/57 passed).
- Full repository test suite: `pnpm test` (1053/1053 tests passed across 56 test suites).
- TypeScript compilation: `pnpm typecheck` passed cleanly (0 errors).

## Files changed

- `supabase/migrations/0011_state44_catalog_backfill.sql` (created)
- `supabase/seed_state44.sql` (created)
- `supabase/tests/state44_catalog_backfill.sql` (created)
- `src/test/state44-catalog-backfill.test.ts` (created)
- `.superpowers/sdd/2026-10-04-state-44-product-catalog-variant-pricing-admin/task-4-report.md` (created)

## Self-review findings

- **Consistency**: All 8 definition keys match the exact strings from Task 1 (`wrapping:a1`, `wrapping:a2`, `card:horizontal`, `card:vertical`, `sticker:die-cut`, `sticker:fixed-shape`, `sticker:phone`, `notebook:standard`). Product slugs match canonical slugs from `src/lib/product-catalog.ts`.
- **Scope**: Migration and seed strictly follow Task 4 specification without preempting Task 5 admin services or customer browse cutover.
- **Data Integrity**: Legacy orders retain all historical total, unit price, and snapshot columns; only additive columns (`commercial_config_version_id`, `payment_policy`, `amount_due_now`, `remaining_amount`, `applied_tier_minimum_quantity`) are populated.
- **Fail-closed Blocker Handling**: Rows lacking valid commercial rules or definition keys become `draft` with `state44Blockers` metadata instead of silently activating.

## Issues or concerns

- None. Both migration and seed scripts are idempotent (`if not exists`, `on conflict do nothing`), and pure TypeScript tests verify both the SQL file syntax and behavioral invariants.

## Fix Round 1: Review Findings Resolution

1. **`coalesce(metadata, '{}'::jsonb)` in `supabase/migrations/0011_state44_catalog_backfill.sql`**:
   - Updated `metadata` case statements for both `product_variants` and `products` to wrap the target column in `coalesce(..., '{}'::jsonb)` before applying `- 'state44Blockers'` or `jsonb_set(...)`, preventing null pointer overwrites when metadata was originally `NULL`.

2. **Variant metadata `state44Blockers` verification**:
   - Added an explicit `exists(...)` subquery condition matching the `status = 'active'` gate in the variant `metadata` case statement. Variants that have `active = true` and `definition_key is not null` but lack a valid commercial rule in `commercial_variant_rules` / `commercial_pricing_tiers` now properly receive `state44Blockers` with code `COMMERCIAL_CONFIG_INCOMPLETE` instead of having blockers prematurely stripped.

3. **Fixed deposit fixture number format in `supabase/seed_state44.sql`**:
   - Fixed `"depositAmount": "50000"` (string) to `"depositAmount": 50000` (safe non-negative integer number), conforming to TypeScript domain validator `isSafeNonNegativeInteger()` in `src/lib/domain/commercial-config.ts` while satisfying PostgreSQL JSON regex check `^[0-9]+$`.

4. **Verification**:
   - `node --test --experimental-strip-types src/test/state44-catalog-backfill.test.ts`: 17/17 passed.
   - `pnpm typecheck`: 0 errors.
   - `pnpm test`: 1053/1053 passed.
