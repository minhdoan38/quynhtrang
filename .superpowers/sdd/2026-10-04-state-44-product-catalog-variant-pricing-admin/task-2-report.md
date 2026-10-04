# Task 2 Report: Commercial domain types and pure validators

## What implemented

- Added `CatalogStatus`, `PaymentPolicy`, `VolumeTier`, `CommercialVariantRule`, `CommercialConfigVersion`, and `PriceCalculation` in `src/lib/domain/commercial-config.ts`.
- Added pure validation and calculation functions:
  - `validateCommercialConfig`
  - `validateQuantity`
  - `calculatePrice`
  - `formatCurrencyVND`
- Enforced State 44 rules for safe integer quantities/version values, quantity lattice, maximum bounds, positive integer VND prices, tier ordering/uniqueness, first-tier minimum, reachable thresholds, active variant coverage, VND currency, fixed-deposit reachability, and safe price arithmetic.
- Added actionable Vietnamese quantity error from `calculatePrice`.
- Added `PaymentPurpose`, `PaymentRequirementStatus`, and `PaymentRequirement` in `src/lib/domain/payment-requirement.ts`.
- Re-exported commercial calculation/validation methods and shared `formatCurrencyVND` from `src/lib/pricing.ts`; retained legacy `calculatePriceQuote` static pricing behavior and signatures.
- Added optional readonly commercial/payment snapshot fields to `PendingOrder` while preserving existing fields.

## Tests and results

Focused command:

```text
node --test --experimental-strip-types src/test/commercial-config.test.ts src/test/pricing.test.ts
```

Result: PASS, 13 tests passed, 0 failed.

Full suite:

```text
pnpm test
```

Result: PASS, 1036 tests passed, 0 failed.

Typecheck:

```text
pnpm typecheck
```

Result: PASS.

## TDD evidence

- RED: focused command initially failed because new commercial domain modules did not exist (`ERR_MODULE_NOT_FOUND` for `commercial-config.ts`); existing pricing tests passed.
- GREEN: after domain/payment modules, pricing exports, order snapshot types, and tests were added, focused command passed all 13 tests.

## Files changed

- `src/lib/domain/commercial-config.ts`
- `src/lib/domain/payment-requirement.ts`
- `src/lib/pricing.ts`
- `src/lib/order-types.ts`
- `src/test/commercial-config.test.ts`
- `.superpowers/sdd/2026-10-04-state-44-product-catalog-variant-pricing-admin/task-2-report.md`

## Self-review findings

- Legacy pricing callers still import `formatCurrencyVND` and `calculatePriceQuote` from `src/lib/pricing.ts`; existing behavior remains covered by `src/test/pricing.test.ts`.
- New `calculatePrice` requires a configured commercial variant and has no static fallback.
- Grepped formatter call sites; all existing imports continue resolving through `src/lib/pricing.ts`.
- Full test module and full repository suite passed.
- No unrelated source changes included.

## Issues or concerns

- Commercial snapshot fields are optional during migration, matching staged cutover requirements. Later quote/order tasks must populate and persist them as required fields at order creation.
- Existing legacy order/payment paths remain static until later State 44 tasks cut over to server commercial quotes.
