# Task 5 Report

## What implemented

- Added catalog lifecycle/status, definition-key, commercial summary, historical-resolution, and commercial-draft domain models.
- Extended catalog row mappers with optional State 44 lifecycle/revision metadata while preserving legacy mapper output when columns are absent.
- Added `CatalogRepository.browseSellableProducts()`, `resolveProductById()`, and `resolveVariantById()`; sellable browse requires active product/variants, current commercial pointer, registry definition key, and pricing rule/tier.
- Added `AdminCatalogRepository` with lifecycle mutation RPC adapters, in-memory test seam, revision checks, draft/version/quote persistence, and publication audit event capture.
- Added controlled lifecycle service functions for product/variant activation/archive, admin authorization, registry validation, revision conflicts, and last-active-variant blocker.
- Added commercial draft create/load, validated save, and atomic publish service behavior.
- Added server-authoritative quote calculation/persistence with hashed checkout key, 30-minute expiry, sellable checks, quantity validation, and fixed-deposit breakdown.
- Routed canonical published browse through `browseSellableProducts()` while retaining static fallback only for unconfigured repository mode.

## Tests and results

- RED evidence:
  - `node --test --experimental-strip-types src/test/catalog-lifecycle.test.ts src/test/commercial-config-service.test.ts src/test/price-quote-service.test.ts`
  - Failed with expected `ERR_MODULE_NOT_FOUND` because new service modules did not yet exist.
- GREEN focused verification:
  - `node --test --experimental-strip-types src/test/catalog-lifecycle.test.ts src/test/commercial-config-service.test.ts src/test/price-quote-service.test.ts src/test/catalog-repository.test.ts`
  - 30 passed, 0 failed.
- Full regression:
  - `pnpm test`
  - 1075 passed, 0 failed.
- Type verification:
  - `pnpm typecheck`
  - Passed with exit code 0.

## TDD Evidence

Tests were written before service/repository production modules. Initial focused run failed because `admin-product-catalog.ts`, `commercial-config-service.ts`, and `price-quote-service.ts` were missing. Implementations were then added incrementally until focused suite passed. Existing `catalog-repository.test.ts` was run in the same focused command and passed.

## Files changed

- `src/lib/domain/catalog.ts`
- `src/lib/repositories/catalog-repository.ts`
- `src/lib/repositories/admin-catalog-repository.ts`
- `src/lib/services/admin-product-catalog.ts`
- `src/lib/services/commercial-config-service.ts`
- `src/lib/services/price-quote-service.ts`
- `src/lib/product-catalog.ts`
- `src/test/catalog-lifecycle.test.ts`
- `src/test/commercial-config-service.test.ts`
- `src/test/price-quote-service.test.ts`

## Self-review

- Consistency: searched all `listProducts`, `browseSellableProducts`, and historical resolver call sites. Canonical customer browse now uses sellable query; legacy `listProducts()` remains intact for existing callers/tests.
- Scope: changes stay inside Task 5 files and named tests. Existing mapper output remains unchanged for legacy rows without State 44 columns.
- Verification: ran every named focused test file, full `pnpm test`, and `pnpm typecheck`.

## Issues or concerns

- Production Supabase publish atomicity depends on the existing migration-controlled RPC/schema path; in-memory repository seam models atomic state transitions for tests.
- Full suite emitted existing Supabase API-key warning and template-route diagnostic output, but all 1075 tests passed.

## Review Fix Round 1

- Lifecycle activation now resolves and compares stored `definitionKey` against exact registry metadata and row identity; added mismatch regression coverage.
- Historical `CatalogProduct`/`CatalogVariant` resolvers attach optional `ProductDefinitionCapabilities` metadata while retaining archived rows and legacy shapes.
- Added `supabase/migrations/0014_state44_catalog_operations.sql` with admin-authenticated, revision-checked draft save and atomic commercial publish RPC. Publish locks Product, allocates version under lock, inserts immutable rules/tiers, updates pointer, closes draft, and appends one `asset_events` audit record.
- `AdminCatalogRepository` keeps Map fallback for offline tests and uses Supabase table/RPC branches for remote drafts, revision-checked draft saves, publication, and quote inserts.
- Removed registry/product-catalog runtime cycle by keeping registry metadata dependency-neutral; all changed source uses static imports only.

### Review fix verification

- Focused review suite: `node --test --experimental-strip-types src/test/catalog-lifecycle.test.ts src/test/commercial-config-service.test.ts src/test/price-quote-service.test.ts src/test/catalog-repository.test.ts` — 31 passed, 0 failed.
- Registry/catalog consistency suite: `node --test --experimental-strip-types src/test/product-catalog.test.ts src/test/product-definition-registry.test.ts src/test/state44-catalog-backfill.test.ts src/test/catalog-repository.test.ts` — 39 passed, 0 failed.
- Full suite: `pnpm test` — 1076 passed, 0 failed.
- Typecheck: `pnpm typecheck` — passed.
- Consistency search covered resolver, lifecycle, draft, publish, quote, and `definitionKey` call sites; no changed source contains inline or dynamic type imports.
- Scope review: changes limited to reviewer-requested lifecycle validation, historical metadata, Supabase persistence/RPC migration, registry cycle repair, tests, and report.

## Review Fix Round 2

- Resolver methods now statically import `resolveProductDefinitionKey` and attach exact registry capabilities to resolved Product and Variant models, including archived rows.
- `AdminCatalogRepository.saveDraft` now uses `save_product_commercial_draft` RPC with expected revision and maps returned draft; Map seam remains for null clients.
- `publishDraft` now uses `publish_product_commercial_config` with Product, draft ID, both expected revisions, and request ID; Map seam remains for null clients.
- `saveQuote` now inserts schema-aligned `price_quotes` fields and maps selected row when client exists.
- Migration 0014 publish RPC signature and grants now match adapter calls and validate draft ID ownership under Product lock.

Round 2 verification: focused Task 5 plus registry/catalog suites 62 passed, 0 failed; `pnpm test` 1076 passed, 0 failed; `pnpm typecheck` passed. Existing Supabase API-key and template diagnostic output remained non-failing.
