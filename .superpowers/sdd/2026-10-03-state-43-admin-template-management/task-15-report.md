# Task 15 Report: Available-Only Catalog and Current-Version Preview

## Summary
Completed Task 15 implementation for State 43: Admin Template Management & Publishing.
Connected customer-facing template browser, chooser, and product detail catalog views to dynamic database-backed catalog. Archived dependencies (font families, font faces, stickers) hide templates immediately in SQL before cursor pagination. Removed static `TEMPLATES` fallback when database client is configured.

## Changes

1. **SQL Availability Query & RPC** (`supabase/migrations/0008_state43_template_management.sql`):
   - Added `browse_available_templates` set-based SQL function with server-side exact target matching, published status check, current version pointer verification, and dependency eligibility (font-face, font family, sticker) before keyset cursor pagination (`sort_order`, `id`).
   - Does NOT return full `design_document` JSONB in card listings.

2. **Template Repository** (`src/lib/repositories/template-repository.ts`):
   - Added `browseAvailableTemplates(options?: BrowseAvailableTemplatesOptions): Promise<TemplatePage>`:
     - Exact target filtering: `productId`, `variantId`, `mode`, `shape`.
     - Category and search query filtering.
     - Keyset cursor pagination encoding and decoding with stable `(sort_order, id)` sorting.
     - Fallback verification via `getTemplateAvailability` ensuring parity in mock/offline test environments.
     - Maps to safe `TemplateCard` without `document` or `design_document`.
   - Added `resolveTemplateVersionById(versionId, access)`:
     - Allows public resolution if current published version of an available template.
     - Restricts historical versions: requires staff (`role: 'admin' | 'editor'`) or authenticated project provenance owner (`projects.source_template_version_id`).

3. **Catalog Repository & Product Catalog** (`src/lib/repositories/catalog-repository.ts`, `src/lib/product-catalog.ts`):
   - `CatalogRepository` delegates `browseAvailableTemplates` and `resolveTemplateVersionById` to `TemplateRepository`.
   - Removed fallback to static `TEMPLATES` when database client is provided; throws error on database failure.
   - `getPublishedTemplates` in `product-catalog.ts` propagates database errors when configured repository is used.

4. **Public Template API Routes**:
   - `GET /api/templates` (`src/app/api/templates/route.ts`):
     - Public GET route returning `{ items: TemplateCard[], nextCursor: string | null }`.
     - Supports query params: `productId`, `variantId`, `mode`, `shape`, `categoryId`, `query`, `cursor`, `limit`.
     - Enforces `Cache-Control: no-store, max-age=0`.
   - `GET /api/templates/[id]` (`src/app/api/templates/[id]/route.ts`):
     - Public GET route for template metadata and current published version.
     - Returns 404 for missing/unpublished templates and 403 for archived/blocked dependencies.
   - `GET /api/templates/versions/[versionId]` (`src/app/api/templates/versions/[versionId]/route.ts`):
     - Public GET route resolving full `TemplateVersionPayload`.
     - Enforces authentication and provenance access control on historical versions.

5. **Customer Catalog Hook** (`src/lib/use-template-catalog.ts`):
   - React hook `useTemplateCatalog` with `AbortController` cancellation for stale in-flight requests on parameter changes.
   - Distinct loading, error, and empty states.
   - Keyset cursor pagination via `loadMore()`.

6. **Customer Components**:
   - `src/components/customizer/template-browser.tsx`:
     - Uses `useTemplateCatalog` for dynamic database items.
     - Thumbnails lazy-loaded from `thumbnailUrl` without executing canvas elements on the card grid.
     - Lazy-loads full version payload on preview intent via `/api/templates/versions/[versionId]`.
     - Preserves blank creation outside template list.
   - `src/components/customizer/template-chooser.tsx`:
     - Preserves blank template creation ("Mẫu trống") as local editor action without static `TEMPLATES` dependency.
   - `src/components/products/product-detail-catalog-view.tsx`:
     - Uses `useTemplateCatalog` with exact product and variant filtering.
     - Retains blank template starting card first.
   - `src/components/products/responsive-template-preview.tsx`:
     - Updated to accept `TemplateCard` and lazy-load full version JSON when opened.

7. **Test Suites**:
   - `src/test/template-catalog.test.ts`:
     - Exact case test verified:
       ```ts
       const first = await catalog.browseAvailableTemplates({target:circleTarget,limit:1});
       assert.equal(first.items[0].target.shape,'circle');
       assert.ok(first.items.every(x => !('document' in x)));
       await archiveReferencedSticker();
       assert.equal((await catalog.browseAvailableTemplates({target:circleTarget})).items.some(x => x.id===templateId),false);
       ```
     - Font family archival hiding verified.
     - Multi-page keyset pagination with cursor and limit verified.
     - Public current version vs restricted historical version resolution verified.
     - Route handlers `/api/templates`, `/api/templates/[id]`, `/api/templates/versions/[versionId]` verified.
   - `src/test/catalog-repository.test.ts` & `src/test/product-catalog.test.ts`:
     - Verified configured database failure throws error instead of falling back to static templates.

## Verification Evidence
- `node --test --experimental-strip-types src/test/template-catalog.test.ts src/test/catalog-repository.test.ts src/test/product-catalog.test.ts`: 24 tests passed (0 failures).
- `npm run typecheck`: Passed (0 errors).

## Fix Round 1: Exact Null Target Filtering, DB Failure Propagation, and Keyset Pagination Stability

### Addressed Findings
1. **Exact target matching ignores explicit null filters for shape and mode**:
   - `0008_state43_template_management.sql`: Updated `browse_available_templates` RPC to distinguish `'none'` (requires `t.product_mode IS NULL` or `t.fixed_sticker_shape IS NULL`) from wildcard (`p_mode IS NULL` / `p_shape IS NULL`).
   - `/api/templates`: Supported query parameters `shape=none` and `mode=none`, translating to `target.shape = null` and `target.mode = null`. Also auto-resolved die-cut sticker target to `shape = null`.
   - `useTemplateCatalog`: Serialized explicit null shape and mode as `shape=none` and `mode=none`.
   - `TemplateRepository`: In `browseAvailableTemplates`, passed `p_shape: 'none'` / `p_mode: 'none'` to SQL RPC when `target.shape === null` / `target.mode === null`, and applied `is('fixed_sticker_shape', null)` / `is('product_mode', null)` in fallback queries.

2. **Silent catch in availability check bypasses DB failure constraint**:
   - `TemplateRepository.getTemplateAvailability`: Throws error on database RPC error or missing data instead of returning `{ available: false }`.
   - `api/templates/[id]/route.ts`: Removed `try { ... } catch { isAvailable = ... }` wrapper around `getTemplateAvailability`. Database failures propagate to HTTP 500 `INTERNAL_ERROR`.
   - `TemplateRepository.resolveTemplateVersionById`: Removed fallback catch block; database failure propagates as thrown error.
   - `TemplateRepository.browseAvailableTemplates`: Propagates DB errors in both RPC and fallback availability checks.

3. **Infinite pagination loop for templates with null sort_order**:
   - `0008_state43_template_management.sql`: Used `COALESCE(t.sort_order, 0)` consistently for `ORDER BY COALESCE(t.sort_order, 0) ASC, t.id ASC` and keyset pagination filter `(COALESCE(t.sort_order, 0) > p_cursor_sort_order) OR (COALESCE(t.sort_order, 0) = p_cursor_sort_order AND t.id > p_cursor_id)`.
   - `TemplateRepository`:
     - Cleanly encoded and decoded `sortOrder` as integer in `encodeTemplateCursor` and `decodeTemplateCursor`.
     - Added `sortOrder: Number(row.sort_order ?? 0)` to `TemplateCard` and in-memory sort `(COALESCE(sort_order, 0) ASC, id ASC)` in fallback path.

4. **Test Additions** (`src/test/template-catalog.test.ts`):
   - Verified exact target query with `shape: null` (die-cut) returns only die-cut templates and excludes fixed-shape stickers (both via repo and `/api/templates?shape=none`).
   - Verified DB failure during availability check throws error and returns 500 `INTERNAL_ERROR`, never false available pass.
   - Verified keyset pagination across items with null/0 `sort_order` progresses cleanly without infinite loop.

### Verification Evidence
- `node --test --experimental-strip-types src/test/template-catalog.test.ts src/test/catalog-repository.test.ts src/test/product-catalog.test.ts`: 27 tests passed (0 failures).
- `npm run typecheck`: Passed (0 errors).
