
## Fix Round 1 Resolution

Addressed all three Important review findings and minor suggestions:

1. **ProductDetail Component & Draft Identity**:
   - Fixed `src/app/admin/products/[id]/page.tsx` React key to `String(product.id)`. Unrelated revision increments (name/description/thumbnail/sort order/variant enablement/activation) no longer unmount `CommercialConfigEditor`.
   - Local dirty draft state (radio selections, quantity/tier threshold changes) survives product revision refresh without data loss.
   - Added focused component behavioral regression test using installed Babel runner and React state harness verifying radio/pricing draft state survives router refresh.

2. **Supabase Response Cap / Large Historical Versions**:
   - In `src/lib/repositories/admin-catalog-repository.ts`, changed remote list/detail hydration: instead of querying all historical commercial versions, rules and tiers with `select('*')`, queries only `in('id', versionIds)` for the active/current commercial versions referenced by the fetched products, plus rules and tiers filtered to those version IDs.
   - Preserves complete `currentConfig` and starting price even when thousands of obsolete immutable commercial versions exist.
   - Added focused regression test simulating >1000 historical versions behind PostgREST default limit asserting current config and starting price remain fully resolved.

3. **In-Dialog Accessibility for Publish/Archive Failures**:
   - Updated `PublishProductDialog` and `ArchiveProductDialog` in `src/components/admin/product-lifecycle-dialogs.tsx` to accept an `error` prop and render an active `<p role="alert" className="text-sm text-destructive">{error}</p>` within `<DialogContent>`.
   - `CommercialConfigEditor` and `ProductDetail` set dialog-scoped errors on mutation rejection and keep dialogs open for accessible review and user recovery. Closing dialog clears the error.
   - Added focused behavioral component test validating both publish and archive failures remain inside the open modal's alert node.

4. **Minor / Verification Clarity**:
   - Executable SQL test script remains in `supabase/tests/state44_admin_catalog_ui.sql` with documented limitations (tested via file inspection/parsing; live PostgreSQL execution skipped due to local daemon absence).
   - Component contracts now directly test TSX elements and state transitions.

Verification:
- Focused tests: `node --test --experimental-strip-types src/test/admin-product-catalog.test.ts src/test/admin-commercial-editor.test.ts` (14 passed, 0 failed).
- TypeScript: `pnpm typecheck` (0 errors).
- Full suite: `pnpm test` (1091 passed, 0 failed across 61 suites).
