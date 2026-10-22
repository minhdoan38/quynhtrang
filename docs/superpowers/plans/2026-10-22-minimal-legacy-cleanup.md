# Minimal Legacy Cleanup — Plan A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce active source clutter by archiving the unused demo checkout and State 36 backup, without changing customer checkout, persisted user data, or business rules.

**Architecture:** `src/app/checkout/page.tsx` remains the only active customer checkout entry. Historical demo components and the local State 36 backup move to a root `legacy/` archive, outside application imports, typechecking, linting, and test discovery. Remove only the unused demo-order storage API from active storage; keep all current guest recovery and checkout-draft behavior.

**Tech Stack:** Existing Next.js App Router, React, TypeScript, pnpm, Node built-in test runner, ESLint, Playwright. No dependency changes.

**Spec:** User-approved approach A in this conversation: minimum safe cleanup; preserve business behavior, migrations, CI, dependencies, and operational scripts. Product reference: `docs/PRD - Camie.dt.md`. The PRD-gap notes below are a backlog, not implementation scope.

## Global Constraints

- Baseline is local `main` at `d25e5ed`; do not merge, resume, delete, or publish State 46 branches, worktree, or stash.
- Plan delivery does not authorize executing cleanup. Get execution approval first.
- Do not reset to `origin/main`; local main was observed ahead of it by 59 commits.
- Do not touch the user deletion of `master_prompt_print_product_customizer.md`, `.serena/`, or the untracked PRD. Do not stage unrelated changes.
- Archive rather than delete historical source. `legacy/` is retained reference material, not executable code or a supported alternate flow.
- No production schema, SQL migration, seed, service authorization, pricing, artifact, payment, or production-state changes.
- No dependency removal. In particular, `cn` is actively imported and `src/lib/utils.ts` re-exports it.
- No sessionStorage/localStorage/IndexedDB cleanup. Old demo-order data can remain inert; do not clear a user's keys as part of source cleanup.
- No runtime compatibility aliases, deprecated re-exports, replacement checkout, new storage layer, or runtime archive switch.
- Read the installed Next.js guide under `node_modules/next/dist/docs/` before any Next-specific implementation change. This task does not require editing a route or Next configuration.
- Consistency check: LSP references plus repository-wide literal/import/path searches, including tests, docs, scripts, config and hidden backup files.
- Scope check: changes must be confined to the manifest below. Any additional behavior change requires a separate decision.
- Verification: run complete affected test files and full existing gate, not just a selected assertion. Do not change wording/source-string assertions merely to make a failed baseline green.

## Evidence and corrections

- `CheckoutSheet`, declared at `src/components/customizer/checkout-sheet.tsx:37`, has only its declaration in observed LSP references.
- `ConfirmationPanel` and `DemoOrder` are declared in `src/components/customizer/confirmation-panel.tsx`; the old sheet imports both. Active storage imports only the `DemoOrder` type.
- `saveOrder` (`src/lib/storage.ts:148`) and `loadOrder` (`:163`) each have only their declaration in observed LSP references.
- Actual old storage key is `print-customizer-order-v1` (`src/lib/storage.ts:12`), not `camie_demo_order` from the initial audit summary.
- Real checkout imports `OrderConfirmationPanel` from `src/components/checkout/order-confirmation-panel.tsx`. This component must remain unchanged.
- `src/test/checkout-summary-e2e.test.ts:230` mentions `saveOrder` inside a negative source assertion. That is not a runtime caller and removing the function does not require rewriting the assertion.
- `tsconfig.json` includes `**/*.ts` and `**/*.tsx`, with only `node_modules` explicitly excluded. Do not assume moving code to `legacy/` alone isolates it. Explicitly exclude the archive and inspect the resolved file list.
- `.state-36-backup/` exists locally but did not appear in `git ls-files .state-36-backup`. Treat it as local historical material: inventory and preserve its bytes before moving; do not assume it is recoverable from Git.
- Existing lint command is `eslint src scripts e2e`; tests are `node --test --experimental-strip-types src/test/*.test.ts`. These commands should stay unchanged.
- Do not claim all editor features, arbitrary material/size configuration, accessibility, or production workflows are complete merely because source modules exist. Audit coverage is source evidence, not release certification.

## File Manifest

| Source | Destination / change | Responsibility |
|---|---|---|
| `src/components/customizer/checkout-sheet.tsx` | `legacy/demo-checkout/checkout-sheet.tsx` | Preserve unused modal checkout unchanged |
| `src/components/customizer/confirmation-panel.tsx` | `legacy/demo-checkout/confirmation-panel.tsx` | Preserve demo receipt and `DemoOrder` unchanged |
| `src/lib/storage.ts` | Remove only `DemoOrder` import, `ORDER_KEY`, `saveOrder`, `loadOrder` | Active storage must no longer depend on archived UI |
| Extracted demo storage fragment | Create `legacy/demo-checkout/order-storage.ts` | Preserve original key and both retired functions; type import from `./confirmation-panel` |
| `.state-36-backup/payment-qr-panel.tsx` | `legacy/state-36-backup/payment-qr-panel.tsx` | Historical copy |
| `.state-36-backup/payment-qr-provider.ts` | `legacy/state-36-backup/payment-qr-provider.ts` | Historical copy |
| `.state-36-backup/payment-flow.test.ts` | `legacy/state-36-backup/payment-flow.test.ts` | Historical test, not part of active suite |
| `.state-36-backup/state-36-lifecycle.test.ts` | `legacy/state-36-backup/state-36-lifecycle.test.ts` | Historical test, not part of active suite |
| `.state-36-backup/2026-09-30-state-36-qr-payment-confirmation.md` | Same basename under `legacy/state-36-backup/` | Historical plan |
| `.state-36-backup/payment/route.ts` | `legacy/state-36-backup/payment/route.ts` | Historical route, never mounted |
| `.state-36-backup/payment/report/route.ts` | `legacy/state-36-backup/payment/report/route.ts` | Historical route, never mounted |
| `tsconfig.json` | Add `legacy` to `exclude` | Archive isolation |
| `eslint.config.mjs` | Add `legacy/**` to global ignores | Explicit lint boundary |
| `README.md` | Update obsolete tree entries and add short archive note | Describe actual active checkout |
| `legacy/README.md` | Create | Archive inventory and non-execution policy |

Do not rewrite archival imports to make old components runnable. Their original dependencies document history. Active code must not import them.

## Task 1: Retire the orphan demo checkout as one atomic cutover

**Interfaces:** Remove `saveOrder(order: DemoOrder | null): boolean` and `loadOrder(): DemoOrder | null` from active `src/lib/storage.ts`. No replacement API. Preserve `saveState`, `loadState`, recent-project APIs, checkout draft integration, guest cache and recovery exports exactly.

- [x] Read latest versions of the three source files and configuration. Re-run LSP references for `CheckoutSheet`, `ConfirmationPanel`, `DemoOrder`, `saveOrder`, `loadOrder`; stop this cutover if an active consumer appeared.
- [x] Search repository-wide for `checkout-sheet`, `confirmation-panel`, `DemoOrder`, `saveOrder`, `loadOrder`, `print-customizer-order-v1`, and `.state-36-backup`. Classify each hit as active caller, type import, test assertion, historical copy, or documentation; never remove the real `OrderConfirmationPanel` because of a substring match.
- [x] Run complete existing regression modules before the cutover:

```sh
node --test --experimental-strip-types src/test/checkout-summary-e2e.test.ts src/test/checkout-summary-integration.test.ts src/test/checkout-draft.test.ts src/test/guest-storage-lifecycle.test.ts src/test/storage-retention.test.ts src/test/local-project-migration.test.ts
```

Record failures as baseline failures with full module names. Do not suppress them or repin source-text tests. No synthetic failing permanent test for a file move or deleted export is needed.

- [x] Before any move, record SHA-256 for the two demo component source files in a temporary manifest, with their source and destination paths. Use the same manifest in Task 2; do not try to hash the old paths after they have moved.

- [x] Extract the original demo storage fragment into `legacy/demo-checkout/order-storage.ts`, preserving function bodies and errors. Use exactly this header and the original functions from storage:

```ts
import type { DemoOrder } from './confirmation-panel';

const ORDER_KEY = 'print-customizer-order-v1';
```

- [x] Move the two demo UI files to the destinations in the manifest, preserving their bytes. Remove only the type import, key constant and two exported demo functions from `src/lib/storage.ts`; do not edit current storage algorithms.
- [x] Add archive isolation to existing configuration without narrowing any existing active source glob:

```json
"exclude": [
  "node_modules",
  "legacy"
]
```

Add `'legacy/**'` to `eslint.config.mjs` global `ignores`. Do not add broad excludes for tests/scripts, and do not change `.worktrees/` handling as a side effect.

- [x] Run the same complete six regression files after the cutover. Run typecheck and lint once the archive moves in Task 2 are finished, rather than checking a half-moved tree.

## Task 2: Preserve the State 36 backup and document the boundary

**Interfaces:** Archive is unavailable to application/runtime/test discovery. No runtime routes or exports are added.

- [x] Enumerate `.state-36-backup/` with hidden and ignored files included. Compare against the seven-file manifest above. If extra files exist, preserve and explicitly inventory them; never silently delete them or use a recursive force removal.
- [x] Add pre-move SHA-256 entries for every backup file to Task 1's temporary manifest. Retain the demo components' original checksums already recorded before their move. Use native Node filesystem/crypto APIs in a throwaway script or evaluation cell; keep the manifest outside tracked source.
- [x] Move all backup entries preserving their relative paths and bytes into `legacy/state-36-backup/`. Remove only the now-empty source directories. Do not modify backup TS/TSX imports or SQL/routes to satisfy typecheck.
- [x] Compare destination file checksums to the pre-move manifest and confirm every source entry has exactly one destination. Historical source must not disappear merely because it was untracked.
- [x] Create `legacy/README.md` with these facts: reference-only archive; demo checkout superseded by `/checkout`; original storage key retained solely for historical reading; State 36 copies are not deployable routes; no active imports; no CI/test entrypoint; restoring anything requires migration into active source and current security/contract checks.
- [x] Update `README.md` project-tree entries that still present `customizer/checkout-sheet.tsx` and `confirmation-panel.tsx` as active. Point to `src/app/checkout/page.tsx` and `src/components/checkout/`. Add one archive link; do not restructure the whole README or move operational runbooks.
- [x] Keep all State 37–45 migrations/seeds, cleanup/render/backfill tools, CI jobs and dependencies. In particular, do not remove `cn`, add packages, or touch the lockfile.

## Task 3: Verify consistency, minimal scope and actual checkout

**Expected outcome:** Same application behavior, fewer active obsolete files, preserved archive. No bundle/disk saving claim without measurement; moving files inside the same repository does not itself reduce total repository size.

- [x] Use LSP and literal/path search again for every retired symbol/path. Allowed matches: archive, cleanup plan/docs, historical test strings. No active imports from `legacy/`, no active `DemoOrder` type dependency, no re-export shims. Keep `OrderConfirmationPanel` and its real caller intact.
- [x] Inspect compiler inputs with `pnpm exec tsc --listFilesOnly`. Confirm no `legacy/` file is in the resolved list. If an active import drags the archive back in, fix that import boundary instead of adding a wider exclusion.
- [x] Run the full existing gate, not only the expected-to-change test:

```sh
pnpm run gate
```

This runs lint, typecheck, every current Node test module, and production build. Record real exit status for each phase. Do not claim the later phases ran if an earlier `&&` phase stopped the command. Investigate any failing sibling module; no green claim while a failure remains.

- [x] Smoke the actual built app with `pnpm start -p 3120` in a named temporary service and a fresh browser tab. No existing user session/storage. Open `/`, choose a blank product design, add text, reload, confirm design is retained, enter preflight and continue to `/checkout` where allowed. At summary change quantity, enter customer information, go Back, and confirm quantity/design persist. Do not submit a real order or payment and do not introduce fake success data.
- [x] Observe browser screenshot and actual route/heading/control state. Confirm no old demo modal and no archive route appears. Close tab and stop only the smoke service created for this task.
- [x] Run complete existing Playwright checkout modules against an isolated test backend when credentials are available:

```sh
pnpm exec playwright test e2e/golden/guest-checkout.spec.ts e2e/failure/checkout-unknown-outcome.spec.ts --config=e2e/playwright.config.ts --project=chromium
```

Never use production staff bypass or real customer/order data. Missing isolated backend/auth is a named E2E prerequisite, not a passing test; record exactly which journey was not exercised. Perform all reachable non-transactional browser smoke and gate checks regardless.

- [x] Scope review: permitted changes are the manifest only. Confirm no changes to active checkout components/routes, pricing, status transitions, production, storage retention, unrelated tests, credentials or user's pre-existing edits. Do not silently repair unrelated baseline failures as part of cleanup.
- [x] Update this plan's execution checkboxes and README archive note with facts only. Remove throwaway verification scripts; retain normal check outputs/evidence outside tracked source. Commit only when explicitly requested, staging explicit cleanup paths rather than all files.

## Acceptance Criteria

1. Real checkout remains `src/app/checkout/page.tsx`, unchanged by this cleanup.
2. No active caller or storage type dependency points to demo components or `legacy/`.
3. Active storage no longer exports demo order APIs and does not delete persisted user data.
4. Both demo components and all seven local backup files are preserved in `legacy/`; backup byte identity verified.
5. Archive is excluded from compiler inputs and lint; active test/CI scope remains intact.
6. Full affected module run, full existing gate, and actual browser smoke have recorded outcomes; missing isolated E2E prerequisites are explicitly disclosed.
7. No State 46 merge/reset, dependency change, schema change, or unrelated refactor.
8. Consistency, scope and full-module verification required by the user are all satisfied before claiming implementation complete.

## PRD Gap Notes — Backlog Only

This cleanup does not implement or silently drop these requirements.

| PRD | Source evidence / gap | Handling |
|---|---|---|
| 7.2 Auth | `src/app/login/page.tsx` and `src/lib/services/customer-auth.ts` use customer Email OTP; admin login uses password | Resolve against password wording in PRD before an auth change; OTP is not inherently more secure merely because it is current |
| 7.5 Personal designs | `src/components/customer/my-designs-list.tsx` exposes reopen; duplicate/delete/share management is not present in the audited UI | Separate feature scope; preserve historical order design versions on deletion |
| 8.1 Share | No customer share-token public-view/clone flow found in audited routes/services | Separate permissions design; never expose editable original or private production artifacts |
| 8.2 Export | No complete customer PNG/JPG/PDF download UI found; internal production renderer is separate | Separate export feature, not justification to archive renderer |
| 9.5 Re-order | No complete snapshot-to-new-draft action found in customer order detail | New order must revalidate current products/options/prices |
| 9.4 Statuses | No shipping phase in current production flow; cancel service exists despite decision excluding cancellation from production workflow | Reconcile decisions; production completed is not delivery completed; no cancellation change here |
| 10.1 Admin | No audited dashboard/customer-management/product-category/settings UI matching PRD; fonts/stickers/templates/orders/catalog already exist | Clarify minimum operations needs before adding new subsystems; absence of a particular table name alone proves nothing |
| 3.1/10.1 Options | Existing registry owns supported geometry; commercial editor owns prices/quantity/deposit rules | Do not label arbitrary dimensions/material configurability complete without a separate capability audit |
| 10.1/10.2 Images | Upload/customer assets exist; standalone managed image-library coverage is not established by font/sticker libraries | Verify actual resource-management need before planning a new library |
| 14 Analytics | `src/app/api/templates/[id]/route.ts:125` explicitly defers analytics; no complete product/editor/checkout funnel found | Separate feature scope; do not confuse diagnostic logs with product analytics |
| 5/12/15 Editor quality | Source modules for authoring exist, but audit did not prove every shortcut, clipboard action, multi-surface behavior or device path | Keep as verification gap, not blanket implemented/complete claim |

## Plan Self-Review

- Approved A covered by Task 1 (orphan checkout/storage), Task 2 (backup/archive/docs), Task 3 (consistency/scope/full verification).
- Broader docs/script reorganization, dependency replacement, product redesign and PRD feature implementation are excluded.
- Removed APIs have exact signatures, storage key and archive paths; no new runtime interface.
- No structural-file tests or new framework needed for archival moves. Existing consumer-visible regression modules and actual runtime smoke carry verification.
- Plan is ready for execution review; no implementation step has been run as part of writing it.
