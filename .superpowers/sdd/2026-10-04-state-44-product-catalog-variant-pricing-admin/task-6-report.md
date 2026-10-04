# Task 6 — Admin Product Catalog routes and UX

## Delivered

Authenticated `/admin/products` list and `/admin/products/[id]` detail use existing Admin shell and installed Base UI/shadcn primitives. Editor sees permitted catalog/draft data read-only. Every mutation reaches an Admin-only server action before Supabase access, returns a structured result with safe Vietnamese copy, and revalidates list/detail/customer catalog paths.

List supports Đang bán / Bản nháp / Đã lưu trữ / Tất cả, active variant count, published tier-derived starting price and full-payment/fixed-deposit summary. Detail provides Tổng quan, Variants, Giá & số lượng, Thanh toán, Hiển thị sections. Name, description, thumbnail and sort order are revision-checked; structural identifiers and physical summaries stay read-only. Supported unconfigured definitions are enabled as draft variants, then existing lifecycle services handle activation/archive.

Commercial editor opens one shared draft, edits quantity minimum/step/maximum and all ordered tier thresholds/prices per variant, adds/removes tiers and rules, previews through `calculatePrice`, saves revision-checked drafts, and explicitly publishes only saved valid drafts. Draft-unsaved, draft-saved and published states differ visibly. Publish/archive confirmation dialogs explain new Checkout quote/order effects and preserved historical Orders/designs. Loading, failure, empty, pending and read-only states are included.

## Files

Modified:
- `src/app/admin/layout.tsx` — Products navigation, wrapping shell layout for added navigation.
- `src/lib/repositories/admin-catalog-repository.ts` — remote all-lifecycle reads, hydration of rules/tiers/drafts, currentConfig, registry definitions, controlled metadata/enablement RPCs, draft-open RPC adapter.
- `src/lib/services/admin-product-catalog.ts` — Admin metadata/enablement boundaries and display-only validation.
- `src/lib/services/commercial-config-service.ts` — first-draft version normalization, authoritative identity, malformed payload validation, configured variant validation, stale revision guards.
- `src/test/commercial-config-service.test.ts` — two existing fixtures now seed their configured variant explicitly.

Created:
- `src/app/admin/products/page.tsx`
- `src/app/admin/products/[id]/page.tsx`
- `src/app/admin/products/loading.tsx`
- `src/app/admin/products/actions.ts`
- `src/components/admin/product-catalog.tsx`
- `src/components/admin/product-detail.tsx`
- `src/components/admin/commercial-config-editor.tsx`
- `src/components/admin/commercial-preview.tsx`
- `src/components/admin/product-lifecycle-dialogs.tsx`
- `src/lib/admin/product-catalog-ui.ts`
- `src/test/admin-product-catalog.test.ts`
- `src/test/admin-commercial-editor.test.ts`
- `supabase/migrations/0016_state44_admin_catalog_ui.sql`
- `supabase/tests/state44_admin_catalog_ui.sql`
- This report.

## Contract completion approved by coordinator

Task 5 lacked admin list/detail hydration, display metadata mutation, supported variant enablement and a usable remote draft-open path. Coordinator approved minimum repository/service/RPC completion. Migration 0016 adds three narrow Admin RPCs; SECURITY DEFINER is needed because authenticated table writes are revoked. Every new RPC checks authenticated identity and a null-safe Admin role. Migration also repairs nullable role guards in existing draft-save/publish RPCs, preserving signatures. Draft creation locks product, reuses existing draft and clones current published rules/payment policy atomically.

## TDD RED/GREEN evidence

Initial UI wiring and first five assertions were written before a recorded RED; no claim of strict test-first coverage for that portion.

Recorded RED 1: focused run had 7 tests, 5 pass, 2 fail:
- Invalid metadata/structural keys returned success instead of INVALID_INPUT.
- Admin detail lacked current published config hydration (`undefined !== 100`).

Added boundary validation and real remote/current-version hydration.

Recorded RED 2: focused run had 10 tests, 9 pass, 1 fail:
- First newly created draft could not save because versionNumber 0 reached validation (`COMMERCIAL_CONFIG_INVALID: Version number must be a safe integer >= 1.`).

Fixed service normalization to positive draft version and server-owned identity. Final focused GREEN: 12 tests, 12 pass. Includes actual Editor invocation of all nine server actions returning structured 403 before Supabase, error redaction, metadata/enablement validation, stale-tab conflicts, remote hydration, draft save/publish/open flow, quote preview and migration-source guards.

Full-suite first run exposed two existing commercial-service fixtures without configured variant rows; updated those fixtures to mirror real schema relationships. Final full suite passed.

## Verification exercised

Final command:

```text
node --test --experimental-strip-types src/test/admin-product-catalog.test.ts src/test/admin-commercial-editor.test.ts && pnpm typecheck && pnpm test
```

- Focused tests: 12 passed, 0 failed.
- `pnpm typecheck`: exit 0, zero TypeScript errors.
- `pnpm test`: 1089 passed, 0 failed, 61 suites.
- UI mechanical detector: `impeccable.cmd detect --json` on changed routes/components returned `[]`.
- Full suite emits existing fixture diagnostics (Supabase test key warning and intentionally logged template-route DB exception) while all tests pass.

## Self-review

- Removed initial legacy-price fallback; summary derives from current published commercial rules, not variant.price or metadata.
- Connected editor/preview/dialog components end-to-end rather than leaving unused surfaces.
- Hydrates real Supabase state before synchronous Task 5 services inspect product, variant, draft or version.
- Replaced raw exception presentation with allowlisted Vietnamese error mapping and structured 401/403/409 statuses.
- Fixed nullable SQL role checks so authenticated nonstaff cannot exploit NULL role comparison.
- Draft creation uses privileged guarded RPC instead of forbidden direct inserts, copies published baseline and serializes concurrent opens.
- Existing history snapshots and order rows are untouched; no geometry/renderer/cut/fold/safe-area editing.
- No new dependencies, GSAP, generic CRUD layer, or test-only production API added.
- No unrelated untracked implementation-plan file staged.

## Concerns / verification limits

- Apply migrations through 0016 before runtime use.
- SQL direct-RPC executable assertions are supplied but not run here: `psql` absent; Docker client exists but Docker Desktop Linux engine is not running. Source guard tests passed, but those are not proof of live PostgreSQL behavior.
- Manual desktop/mobile browser verification remains Task 14 per brief; no browser visual claim made.
- Admin reads hydrate all catalog versions/rules/drafts to reuse current synchronous service contracts. Appropriate for fixed registry catalog; no pagination/cache abstraction added.
- Existing catalog lifecycle RPC policy and commercial publication validation remain Task 5 responsibilities beyond the null-role guard repaired here; this task's action layer validates submitted commercial configuration.
