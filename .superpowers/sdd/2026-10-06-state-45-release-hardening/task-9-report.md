# Task 9 Report — Harden partial uploads and guest/account migration

## Summary
- **Local project migration isolation**: In `src/lib/services/local-project-migration.ts`, each project is migrated and marked individually in `localStorage`. Success on project 1 is durably committed even if project 2 fails. Returns `{ migratedCount, failedCount, failedProjectIds, errors }` (with backward-compatible properties). Retry skips already-synced projects without duplicating cloud records.
- **Account save dialog claim-first ordering**: In `src/components/checkout/account-save-dialog.tsx`, auth and guest order claim are strictly completed before local project migration begins. If project migration fails or partially fails, the user remains authenticated and order claim remains intact. A partial-success UI state displays migrated/failed counts with a targeted retry button for unmigrated projects.
- **Bulk asset upload per-item status & idempotent retry**: In `src/lib/services/asset-library.ts` and `src/lib/services/template-assets.ts`, bulk uploads track per-item status (`pending`, `uploading`, `uploaded`, `failed`). Stable IDs derived from request IDs ensure retrying failed files reconciles or skips already committed files without generating duplicate records.
- **Route handlers updated**: Multi-file template upload support added in `src/app/api/admin/content/templates/[id]/assets/route.ts` alongside sticker bulk upload status forwarding in `src/app/api/admin/content/stickers/bulk/route.ts`.

## Verification Evidence
- Exact test modules command:
  `node --test --experimental-strip-types src/test/template-assets.test.ts src/test/asset-library-service.test.ts src/test/asset-library-api.test.ts src/test/local-project-migration.test.ts src/test/state41-e2e-integration.test.ts src/test/guest-order-access.test.ts`
  Output: **67 tests passed, 0 failed, 0 errors**.
- Typecheck:
  `pnpm typecheck`
  Output: **tsc --noEmit passed, 0 errors**.
- Full test suite:
  `pnpm test`
  Output: **1272 tests passed across 98 suites, 0 failed**.

## Git Commit
- Commit message: `fix(assets): recover partial uploads and migrations safely`

## Fix Round 1 — Address Review Findings

### Changes Made
1. **Canonical `uploaded` status verification**:
   - In `bulkUploadStickers` (`src/lib/services/asset-library.ts`), items with `status === 'uploaded'` are checked against `repo.getSticker(id)`. If the record exists, its canonical metadata is returned; otherwise, it is processed normally through `createStickerDraft` rather than returning a fabricated record.
   - In `bulkUploadTemplateAssets` (`src/lib/services/template-assets.ts`), items with `status === 'uploaded'` are checked against canonical storage/repository records via `getAssetByStoragePath` / `getAsset`. If verified, the real persisted asset record is returned; otherwise, the asset falls through to upload.
2. **Persisted asset identity / storage path reconciliation**:
   - Added `TemplateRepository.getAssetByStoragePath(bucket, storagePath)` in `src/lib/repositories/template-repository.ts`.
   - In `uploadTemplateAsset` (`src/lib/services/template-assets.ts`), retries check for existing records by storage path / key before performing uploads. Upon attachment, the canonical asset ID returned by the RPC/repository is preserved across locators and URLs.
3. **Reference-aware sticker storage rollback**:
   - Added `AssetLibraryRepository.getStickersByStoragePath(_bucket, storagePath)` in `src/lib/repositories/asset-library-repository.ts`.
   - In `createStickerDraft` (`src/lib/services/asset-library.ts`), the failure catch block inspects whether any draft or record references the storage path before invoking `removeObjects`. If referenced or on check failure, deletion is skipped.
4. **Stable multipart per-file request IDs**:
   - In `src/app/api/admin/content/templates/[id]/assets/route.ts`, multipart upload parsing accepts optional `requestId_${index}`, `requestIds` array, or single `requestId`, mapping stable request IDs to each file to preserve idempotency across retried multipart requests.

### Verification Evidence
- Exact test modules command:
  `node --test --experimental-strip-types src/test/template-assets.test.ts src/test/asset-library-service.test.ts src/test/asset-library-api.test.ts src/test/local-project-migration.test.ts src/test/state41-e2e-integration.test.ts src/test/guest-order-access.test.ts`
  Output: **71 tests passed across 11 suites, 0 failed, 0 errors**.
- Typecheck:
  `pnpm typecheck`
  Output: **tsc --noEmit passed, 0 errors**.
- Full test suite:
  `pnpm test`
  Output: **1276 tests passed across 98 suites, 0 failed**.
- Git Commit:
  `fix(assets): verify canonical asset state and stabilize multipart retries`
