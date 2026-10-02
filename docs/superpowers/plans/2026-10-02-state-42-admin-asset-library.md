# State 42: Admin Asset Library — Fonts + Stickers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to execute task-by-task. Checkboxes track implementation, not this planning session. Do not mark a task complete from source inspection alone.

**Goal:** Deliver a real Supabase-backed library where Editor/Admin upload private Drafts, validate, preview, explicitly publish and archive fonts/stickers; existing designs retain immutable dependencies.

**Architecture:** Extend `fonts` as families and `sticker_assets` in place; add faces, server validation receipts and audit/intent records. Separate published selection from exact-ID historical resolution. Reuse catalog, auth, editor and preview infrastructure. First close the observed real-rendering prerequisite; publish stays blocked until the actual shared rendering engine has validated a binary.

**Tech stack:** Existing Next.js 16.3.6, React 19, TypeScript, Supabase, shadcn primitives, GSAP and Node test runner. Add only maintained XML/font/image parsers and Chromium execution required by the security/validation contract.

**Spec:** `docs/superpowers/specs/2026-10-02-state-42-admin-asset-library-design.md`. Read both files. This plan replaces the earlier narrowed draft; do not combine its obsolete constraints with this version.

## Global constraints

- Planning deliverable only until implementation is explicitly requested.
- Editor and Admin manage BOTH kinds. Admin alone deletes eligible never-published Drafts; order production permissions remain Admin-only.
- Canonical `draft | published | archived`; monotonic `revision`; write-once `ever_published_at`. No return to Draft after first publication.
- Draft binaries/previews are private. Published/archived public library bytes remain immutable. Customer artwork and order artifacts remain private.
- Remove `published` from fonts/stickers after coordinated migration of all callers/seeds/tests. No trigger-synced second lifecycle field. Do not change template/product schema.
- Publish is explicit and checks current revision/hash, validation receipt, licensing and real renderer fingerprint. No boolean supplied by a client can satisfy validation.
- No placeholder assets, signature-only font acceptance, regex XML parser, arbitrary remote URL imports, or fallback fonts masquerading as successful render.
- Preserve immutable design versions and exact legacy binary paths. Stable asset/face IDs are canonical; URLs are delivery details.
- No templates CMS, new fulfillment states, PDF export, order artifact-set redesign, or automatic production starts.
- Use existing UI tokens/primitives. No generic CMS/table/state framework. CSS for basic state transitions; preserve scoped existing GSAP only where already needed.
- Before changing exported symbols, obtain LSP references and migrate every caller. Before Next code, read installed framework guides, not remembered APIs.
- Keep permanent behavior/security regression tests. Do not assert source strings, component wiring or copied labels. Delete obsolete wording-only tests rather than pinning new copy.
- Parallel workers skip mid-flight builds/tests/formatting. One integration owner runs verification after integration. Sequential RED/GREEN checkpoints below apply when working inline; parallel batches collect tests and verify after all contributors finish.

## 1. Observed integration map

These existing paths were inspected or discovered. `Create` paths below are proposed, not claims of existing implementation.

| Existing path | Required change |
| --- | --- |
| `supabase/migrations/0001_state37_core.sql`, `0002_state37_storage.sql` | Reference only; extend through new migration, not retroactive edits. |
| `supabase/seed.sql` | Replace font published-boolean seeding; seed licensed migrated faces and safe fixtures without rewriting ever-published bytes. |
| `src/lib/admin/authorization.ts`, `src/lib/supabase/{server,admin}.ts` | Reuse verified staff identity and server-only privileged client. |
| `src/lib/domain/catalog.ts`, `src/lib/repositories/catalog-repository.ts` | Family/face/sticker projections, published-only selection, separate exact-ID resolution. |
| `src/lib/fonts.ts`, `src/components/customizer/font-browser-sheet.tsx` | Async catalog, self-hosted face loader, recents, selected archived face, failure states. |
| `src/lib/product-state.ts`, `src/lib/add-content.ts` | Typed stable dependency fields and sticker creation. |
| `src/components/customizer/{add-content-sheet,editor-sheets,customizer-shell,design-canvas}.tsx` | Full insertion/callback/history/rendering paths. |
| `src/components/customizer/editor-preview-mode.tsx`, `src/components/customizer/preview/{card,wrapping,notebook,sticker}-preview.tsx` | Same immutable dependencies and visual content as editor. |
| `src/lib/{asset-store,storage}.ts` | Preserve library identity through guest persistence and checkout asset rewriting. |
| `src/lib/services/{prepare-order-from-guest-checkout,local-project-migration,cloud-project-autosave,staff-design-preflight,admin-design-revisions}.ts` | Preserve and validate dependencies in guest/account/staff flows. |
| `scripts/state39-render-jobs.ts`, `src/lib/admin/thumbnail-delivery.ts` | Replace mock renderer with real shared engine for existing PNG contract; consistent approved-renders bucket. |
| `src/app/admin/layout.tsx` | Add Content navigation without rebuilding admin shell. |
| `src/test/{catalog-repository,font-browser,add-content,serve-asset-security}.test.ts` | Update actual behavioral contracts; avoid unrelated asset-delivery rewrite. |

### Proposed files grouped by ownership

**Domain/security:** `src/lib/domain/asset-library.ts`, `src/lib/services/library-validation.ts`, `src/lib/services/library-render-probe.ts`, `src/lib/services/library-dependencies.ts`.

**Persistence:** `supabase/migrations/0007_state42_asset_library.sql`, `supabase/tests/state42_asset_library.sql`, `src/lib/repositories/asset-library-repository.ts`, `src/lib/services/asset-library.ts`, `scripts/state42-library-migrate.ts`, `scripts/state42-library-cleanup.ts`.

**Rendering prerequisite:** `src/components/customizer/document-render-surface.tsx`, `src/lib/services/document-renderer.ts`, `src/app/internal/render/page.tsx`. Existing worker is migrated, not duplicated.

**Admin:** `src/app/admin/content/layout.tsx`, `src/app/admin/content/stickers/page.tsx`, `src/app/admin/content/fonts/page.tsx`, `src/app/admin/content/fonts/[id]/page.tsx`, `src/components/admin/library-stickers.tsx`, `src/components/admin/library-fonts.tsx`, `src/components/admin/library-detail.tsx`.

**APIs:** concrete routes in Task 8. No generic dynamic table-name endpoint.

**Tests/fixtures:** `src/test/asset-library-domain.test.ts`, `src/test/library-validation.test.ts`, `src/test/library-dependencies.test.ts`, `src/test/fixtures/library/`, `scripts/state42-library-smoke.ts`.

**Docs:** `docs/superpowers/state42-asset-library-runbook.md`, existing `README.md`. No change to global design identity.

## 2. Shared contracts

Define these in `src/lib/domain/asset-library.ts`; import existing `StaffIdentity` from `src/lib/domain/order.ts` instead of defining another staff model.

```ts
export type LibraryStatus = 'draft' | 'published' | 'archived';
export type LibraryKind = 'sticker' | 'font-face';
export type FontCategory = 'sans' | 'serif' | 'handwriting' | 'display';
export type FontFormat = 'ttf' | 'otf' | 'woff' | 'woff2';
export type StickerFormat = 'svg' | 'png' | 'jpeg' | 'webp';
export type LibraryErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'NOT_FOUND'
  | 'REVISION_CONFLICT' | 'VALIDATION_FAILED' | 'LICENSE_REQUIRED'
  | 'DUPLICATE_BINARY' | 'IMMUTABLE_BINARY' | 'REFERENCED_DRAFT'
  | 'DEPENDENCY_UNRESOLVED' | 'RENDERER_UNAVAILABLE' | 'STORAGE_FAILURE';

export interface LibraryRef {
  kind: LibraryKind;
  id: string;
  checksum: string;
}
export interface StoredBinary {
  bucket: 'library-drafts' | 'fonts' | 'sticker-library';
  key: string;
  checksum: string;
  byteSize: number;
  mimeType: string;
}
export interface LicenseAcknowledgement {
  source: string;
  name: string;
  text: string;
  webEmbedding: boolean;
  commercialPrint: boolean;
}
export interface LibraryMetadataPatch {
  displayName?: string;
  category?: string;
  tags?: string[];
  searchKeywords?: string[];
  description?: string;
  sampleText?: string;
}
export interface LibraryRecord {
  ref: LibraryRef;
  status: LibraryStatus;
  revision: number;
  everPublishedAt: string | null;
  binary: StoredBinary;
  thumbnail: StoredBinary | null;
  displayName: string;
  category: string;
  tags: string[];
  searchKeywords: string[];
  description: string;
  sampleText: string | null;
  license: LicenseAcknowledgement | null;
  validationId: string | null;
}
export interface FontFaceRecord extends LibraryRecord {
  familyId: string;
  cssFamily: string;
  format: FontFormat;
  weightMin: number;
  weightMax: number;
  style: 'normal' | 'italic';
  internalFamily: string;
  postscriptName: string;
}
export interface ValidationReceipt {
  id: string;
  ref: LibraryRef;
  revision: number;
  validatorVersion: string;
  engineFingerprint: string;
  passed: boolean;
  failures: { code: string; detail: string }[];
  missingCodepoints: number[];
  browserProofHash: string | null;
  productionProofHash: string | null;
}
export interface MutationKey {
  expectedRevision: number;
  requestId: string;
}
export interface BulkItemResult {
  ref: LibraryRef;
  ok: boolean;
  revision?: number;
  error?: LibraryErrorCode;
  message?: string;
}
```

Treat JSON/form inputs as `unknown` until parsed; these TypeScript types are not validation. IDs generated server-side (`crypto.randomUUID`) for new records; old text IDs remain unchanged. No lossy name-to-ID slug normalization.

Repository is one concrete `AssetLibraryRepository` class taking `SupabaseClient`; no one-implementation interface/factory. Service functions take a verified actor and repository. Public operation signatures:

```ts
listLibrary(kind: LibraryKind, query: {
  status?: LibraryStatus; search?: string; category?: string;
  page: number; pageSize: number;
}): Promise<{ items: LibraryRecord[]; total: number }>;
createDraft(kind: LibraryKind, input: {
  bytes: Uint8Array; filename: string; metadata: LibraryMetadataPatch;
  familyId?: string; requestId: string;
}): Promise<LibraryRecord>;
replaceDraft(ref: LibraryRef, key: MutationKey, bytes: Uint8Array): Promise<LibraryRecord>;
updateMetadata(ref: LibraryRef, key: MutationKey, patch: LibraryMetadataPatch): Promise<LibraryRecord>;
validateDraft(ref: LibraryRef, key: MutationKey): Promise<ValidationReceipt>;
publishAsset(ref: LibraryRef, key: MutationKey, validationId: string): Promise<LibraryRecord>;
archiveAsset(ref: LibraryRef, key: MutationKey, reason: string): Promise<LibraryRecord>;
deleteDraft(ref: LibraryRef, key: MutationKey): Promise<void>;
resolveLibraryRefs(refs: readonly LibraryRef[]): Promise<ReadonlyMap<string, LibraryRecord>>;
```

Signatures describe service operations with actor/repository bound at call site, not a requirement to create a service interface. `resolveLibraryRefs` uses key `${kind}:${id}`; only published or ever-published archived records, exact checksum required. Draft preview is a separate staff-only operation. Family CRUD is explicit in Task 3/8, not passed as an invented binary kind.

## 3. Execution order and gates

1. Tasks 1–3 establish contracts, fixtures and DB/storage security.
2. Tasks 4–5 implement renderer prerequisite and real validation.
3. Tasks 6–8 deliver lifecycle, safe deletion/bulk and APIs.
4. Tasks 9–11 deliver customer compatibility and admin UI.
5. Tasks 12–14 handle existing data cutover, real verification and documentation.

Potential parallel slices after Task 3: renderer (4), binary validation (5 excluding final engine probe), and server lifecycle (6). Shared contract is Section 2; integration owner owns DB/contract changes. Customer integration (9–10) and admin UI (11) can overlap only after APIs stabilize. Do not dispatch an agent merely to trim docs.

For each task: write meaningful failing boundary test first when adding non-trivial logic, implement, run named checks, observe actual surface, then optionally commit the completed slice. Git commands below are proposed checkpoints, not authorization to commit while planning.

## Task 1: Finalize invariant code and consumer migration inventory

**Files:** Create `src/lib/domain/asset-library.ts`, `src/test/asset-library-domain.test.ts`. Inspect references to exported `FontItem`, `PublishedFont`, `PublishedSticker`, `TextElementData`, `loadFont`, catalog methods and canvas selection types using LSP.

**Consumes:** spec Sections 3–4. **Produces:** Section 2 contracts plus runtime parsers and `assertLibraryTransition`.

- [x] Record exact LSP caller list before implementation; include tests, static font fallback, recents and seed consumers, not only admin pages.
- [x] Implement unknown-input parsing with bounds: names 1–120 chars, descriptions 0–2000, tags/keywords <=20 each of 1–40 chars, page >=1, pageSize 1–100, reason 3–500. Reject unknown metadata keys; never accept storage/actor/receipt fields from clients.
- [x] Implement transition rules: draft-to-published, published-to-archived, archived-to-published; no transition back to Draft; same request ID replays previous operation through DB receipt. Family/face status are distinct gates.
- [x] Keep this runnable regression example in the Node test file, with imports from the new domain module:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { assertLibraryTransition, parseLibraryMetadata } from '../lib/domain/asset-library.ts';
test('published binary cannot become draft or accept storage mutation', () => {
  assert.throws(() => assertLibraryTransition('published', 'draft'));
  assert.throws(() => parseLibraryMetadata({ storagePath: 'other.svg' }));
  assert.deepEqual(parseLibraryMetadata({ displayName: 'Hoa' }), { displayName: 'Hoa' });
});
```

Run: `node --test --experimental-strip-types src/test/asset-library-domain.test.ts`.
Expected: failure before module exists, then all assertions pass. Commit message: `feat(library): define immutable asset lifecycle contracts`.

## Task 2: Add real licensed fixtures and narrow parsing dependencies

**Files:** Modify `package.json`, `pnpm-lock.yaml`; create `src/test/fixtures/library/` containing licensed Vietnamese font + license, valid TTF/OTF/WOFF/WOFF2 fixtures, a valid alpha PNG/WebP/JPEG, a safe SVG with gradients/local references and negative malformed samples. Store fixture provenance in `src/test/fixtures/library/README.md`.

**Consumes:** spec validation limits. **Produces:** real decoding/shape inputs for Tasks 4–5; no pretend 32-byte font.

- [x] Check installed Node version and deployment requirements; inspect package engines. Add `@xmldom/xmldom`, `fontkit`, `sharp`, `playwright`, and only missing type declarations; pin resolved versions with lockfile. Use `pnpm exec playwright install chromium` for engine runtime; document Linux OS dependencies separately.
- [x] Acquire redistributable font from its authoritative licensed source and save license. Reject network-unavailable acquisition as a missing prerequisite, never synthesize a fake valid font.
- [x] Check fixture hashes and parse each positive file using actual decoder. Test all four font formats; conversion of a fixture is acceptable only with tooling that preserves glyphs and has a documented command/source.
- [x] Add malicious SVG fixture cases: DOCTYPE/entity, escaped external href, namespaced script/event, CSS `url`/import, local reference cycle, unclosed tag, external image, foreignObject, animation. Invalid inputs must not open external sockets during validation.

Smoke command after parser implementation: `node --test --experimental-strip-types src/test/library-validation.test.ts`. Commit: `test(library): add licensed binary and hostile input fixtures`.

## Task 3: Implement database lifecycle and private storage boundary

**Files:** Create migration/test SQL, modify DB caller fixtures in `src/test/catalog-repository.test.ts`; create `src/lib/repositories/asset-library-repository.ts` as operations become real. Existing migrations are read-only references.

**Produces:** canonical tables from spec Section 4, protected RPCs and exact Storage boundaries.

- [x] Add status/revision/ever-published columns to `fonts` and `sticker_assets`; backfill published flag and valid seed metadata with explicit precedence: published=true means published; otherwise valid archived means archived; otherwise draft. Drop redundant `metadata.status` after mapping. Add face child table and stable CSS aliases.
- [x] Create validation receipts, append-only events, upload/cleanup intents. Audit events survive Draft deletion. Unique operation key is `(actor_user_id, request_id)` plus stored canonical input hash. Face constraint disallows overlapping published weight intervals for same family/style.
- [x] Revoke library direct mutation and PUBLIC RPC execution. Existing font/sticker `FOR ALL` policies are removed, not left OR-combined. Public selection requires published; staff can inspect all. Validation/audit mutations are server-only; clients cannot forge successful receipts.
- [x] Implement `SECURITY INVOKER` server-only RPCs below. They re-check actor role from `staff_roles`; expected revision is checked under row lock; audit and receipt commit together. Require Admin for draft delete; require Editor-or-Admin for other content operations. Never use user-provided actor IDs before server identity verification.

```sql
-- Signatures; each function returns jsonb except delete finalization.
-- p_payload is schema-validated server-side AND allowlisted inside the RPC.
library_create_draft(p_actor uuid, p_request uuid, p_kind text, p_id text, p_payload jsonb)
library_patch_metadata(p_actor uuid, p_request uuid, p_kind text, p_id text,
  p_revision bigint, p_patch jsonb)
library_publish(p_actor uuid, p_request uuid, p_kind text, p_id text,
  p_revision bigint, p_validation uuid, p_public_objects jsonb)
library_archive(p_actor uuid, p_request uuid, p_kind text, p_id text,
  p_revision bigint, p_reason text)
library_prepare_delete(p_actor uuid, p_request uuid, p_kind text, p_id text, p_revision bigint)
library_finish_delete(p_actor uuid, p_intent uuid)
```

- [x] Family operations use separate `library_create_family`, `library_patch_family`, `library_set_family_status` with actor/request/revision and validated payload. Family publication requires at least one published valid face; archive never cascades binary updates. Freeze internal naming fields once referenced/published.
- [x] Create private `library-drafts`; remove library buckets from broad staff insert/update/delete policies. Public fonts/sticker-library remain read-only to browser identities. No database row may point a Draft preview at a public raw candidate. Service code alone copies validated publication bytes.
- [x] SQL tests run in transaction/rollback and assert anon/customer/Editor/Admin matrix, direct REST-equivalent table bypass denial, forged validation denial, revision race, event atomicity, immutable locator after archive, draft-delete references and bucket policies. Use real existing `staff_roles`/`auth.users` fixture pattern; do not invent a separate auth schema.

Run on disposable Supabase only:

```sh
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0007_state42_asset_library.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state42_asset_library.sql
```

Final removal of fonts/stickers `published` and update of seed queries is coordinated with Task 12 before traffic resumes. Template `published` remains untouched. Commit: `feat(db): enforce library lifecycle and draft secrecy`.

## Task 4: Close real rendering prerequisite, without artifact-set redesign

**Files:** Create document-render surface/service/internal route; modify existing `DesignCanvas`, preview render helpers only where shared paint is required; modify `scripts/state39-render-jobs.ts` and existing thumbnail delivery bucket use. No order status/UI changes.

**Produces:** `renderDocument(document: DesignState, options: { surface: string; widthPx: number; heightPx: number }): Promise<{ png: Uint8Array; sha256: string; engineFingerprint: string }>` in server-only document renderer. Options are derived by trusted geometry code, not browser request payloads. Renderer consumes dependency resolver from Task 9; bootstrap with explicit fixture references until integrated.

- [x] Extract/reuse paint code, not a second handwritten renderer. Preserve front/inside/back card filtering; one notebook cover; wrapping full-sheet/pattern repeats; fixed/die-cut sticker. Explicit output box uses physical geometry and existing coordinate system, not responsive `min(vw, px)` mockup size. Disable guides, selection, mockup shadows and animations.
- [x] Internal render route is excluded from ordinary admin navigation. Require short-lived HMAC-bound request (document hash, dimensions, expiry) with server-held secret; do not place service-role credentials in Chromium. Bind rendering URL to configured same-origin; deny all remote requests except approved in-memory intercepted asset/font URLs.
- [x] Chromium uses deterministic viewport/device scale, pinned version, bounded time/area. Wait for actual images and selected font faces; inspect platform font usage, reject unresolved assets/missing glyphs. Screenshot content bounds, assert decoded dimensions and meaningful fixture-specific pixels (not merely non-empty bytes).
- [x] Replace worker hardcoded PNG with real renderer for existing version PNG contract. Upload to private `approved-renders`, update corresponding path/checksum after successful upload only. Missing dependency keeps job failed; never successful placeholder. Do not add PDF or artifact-set schemas.
- [x] Use reference fixtures to compare editor-preview and renderer for every supported product/variant, including wrapping repeats and card surfaces. Capture a second generation with identical input and compare decoded pixels. Existing `isMockup` is not by itself a print mode; validate/remove responsive sizing and ornamental CSS.

Smoke through actual worker and disposable approved version, not a mocked render return. If existing worker's single-PNG contract cannot represent a required surface, fail its preflight for that version and report the missing output contract; do not omit content and label it complete. State 42 publication release remains blocked until specimen production-engine proof is real. Commit: `fix(render): replace placeholder PNG with shared document engine`.

## Task 5: Validate sticker and font binaries with real engine receipts

**Files:** Create `src/lib/services/library-validation.ts`, `src/lib/services/library-render-probe.ts`, `src/test/library-validation.test.ts`; use fixtures from Task 2. Do not rewrite unrelated private-artwork `serveAsset` behavior.

**Produces:** `validateSticker(bytes)` canonical safe binary + dimensions + PNG thumbnail; `validateFont(bytes)` parsed face metadata/glyph report; `probeLibraryBinary(record)` real browser/production hash results. Only server inserts `ValidationReceipt`.

- [x] Enforce raw-size limits before buffering full multipart where host permits; reject Content-Length/stream excess. Decode bounded raster with `sharp`, normalize EXIF orientation, reject animated inputs, produce canonical bytes and 320px thumbnail. Preserve transparency, define decoded-pixel limits.
- [x] XML parser with fatal error handler and no external resolution. Traverse strict SVG namespace/element/attribute allowlist; no regex acceptance. Reject unsafe features rather than silently changing appearance. Resolve `#id` references, reject cycles and unknown IDs; serialize canonical DOM. Rasterize in isolated Chromium with network deny, not browser inline injection into admin app.
- [x] Parse all supported fonts using `fontkit`; validate tables, glyph mapping, extracted names/weights/styles, variation ranges and embedding flags. Run expensive decoding in bounded isolated worker with timeout. Header signature checks are preliminary only.
- [x] Generate Vietnamese coverage from a checked-in NFC specimen and NFD normalization. Validate cmap plus real shaped/rendered results; record missing codepoints. For each managed weight/style load unique CSS face with `font-synthesis: none`. Assert actual used platform fonts, not `document.fonts.ready` alone.
- [x] Bind validation to ID + binary hash + revision + validator version + engine fingerprint. Replacing Draft bytes or relevant licensing fields invalidates current receipt. Metadata-only display changes do not need re-rasterization but receipt's content/identity checks remain authoritative.
- [x] Keep concrete negative tests; example uses real fixtures and actual parser (not mock echo):

```ts
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFont, validateSticker } from '../lib/services/library-validation.ts';
test('magic bytes do not make a valid font', async () => {
  await assert.rejects(() => validateFont(Buffer.from('wOF2invalid')));
});
test('external SVG content never passes validation', async () => {
  const bytes = await readFile(new URL('./fixtures/library/external-image.svg', import.meta.url));
  await assert.rejects(() => validateSticker(bytes));
});
```

Run `node --test --experimental-strip-types src/test/library-validation.test.ts`; browser probe additionally runs via smoke script against actual engine. Commit: `feat(library): validate real fonts and safe sticker binaries`.

## Task 6: Implement upload, metadata, publish and archive transactions

**Files:** Create `src/lib/services/asset-library.ts`; complete concrete repository from Task 3. No service interface/factory duplication.

**Consumes:** Section 2, validation receipts, DB RPCs. **Produces:** actual staff operations used by APIs.

- [x] Create Draft with server UUID. Allocate upload intent with unique key `drafts/<actor>/<uuid>/<checksum>.<ext>`. Raw originals never inline-previewed. Sanitized candidates have separate keys. Commit record after successful private writes; failed writes leave discoverable cleanup intent, never published state.
- [x] Duplicate detection uses binary hash AND format/canonical version; offer existing same-kind asset rather than overwrite. Concurrent same-item requests reuse actor/request result. Cleanup may remove only its own generated key after reference check, never a winner's object.
- [x] Metadata patch runs allowlist and revision CAS. Read-only binary identity fields rejected even if extra JSON properties survive TypeScript. Preserve stable font CSS alias separately from display name.
- [x] Publish checks license and current server receipt, copies safe bytes/thumbnail to unique immutable public keys with no overwrite, then invokes locked RPC with exact returned object hashes. Failed copy/commit records cleanup; no published DB row without all required objects. Ever-published keys are never eligible for cleanup. Track lost responses using request ID rather than repeat publication blindly.
- [x] Archive + reason is one audit transaction. Existing document reads and currently loaded fonts do not switch. Re-publish archived content reuses immutable objects and must satisfy current server gate; never upload replacement bytes under old face ID.
- [x] Test against disposable Supabase: concurrent metadata edit vs publish returns conflict; failed validation writes no public object; API failure after upload is recoverable; DB commit with lost response replays same result; published hash cannot mutate through raw table/RPC access.

Smoke scenario belongs in `scripts/state42-library-smoke.ts` (Task 13); avoid elaborate fake repository framework. Commit: `feat(library): publish validated immutable assets atomically`.

## Task 7: Safe Draft deletion and per-item bulk sticker operations

**Files:** Same service/repository; create `scripts/state42-library-cleanup.ts`.

**Produces:** safe delete and bulk results, no global bulk transaction illusion.

- [x] Delete requires verified Admin, Draft, never published, current revision. Under lock reject usage from current/immutable design documents, template documents, live validation runs and pending publish operations. All new reference creation must reject Drafts, so no race can create a public reference after delete gate. Existing dirty references block cleanup until explicitly resolved.
- [x] Record delete intent, remove only private owned keys, finalize row deletion and append audit. A storage error leaves `cleanup_pending` intent; this is operational intent state, not a new asset lifecycle status. Script default is `--dry-run`; actual cleanup requires explicit `--apply` on expired unreferenced intents. Never bucket-wide delete.
- [x] Bulk upload max 50 files, concurrency 3, independent per-file request ID/progress. Bulk metadata/publish max 50 IDs, unique IDs and expected revisions validated. Each item commits independently and returns `BulkItemResult`; success items are not retried when failed items retry.
- [x] UI must retain failed-item reason and file handle within current page; successful rows persist after refresh. Browser cannot truthfully resume a lost local file without reselecting it; show that state rather than pretend persistent transfer.
- [x] Exercise partial batch: valid, unsafe SVG, duplicate, revision-conflicted item. Assert exactly which DB rows/objects/events exist; delete rejects Editor, referenced Draft and previously published asset. Cleanup dry-run changes no objects.

Commit: `feat(library): support safe draft cleanup and sticker batches`.

## Task 8: Expose authenticated APIs and library delivery

**Files to create:**

```text
src/app/api/admin/content/stickers/route.ts
src/app/api/admin/content/stickers/[id]/route.ts
src/app/api/admin/content/stickers/[id]/validate/route.ts
src/app/api/admin/content/stickers/[id]/publish/route.ts
src/app/api/admin/content/stickers/[id]/archive/route.ts
src/app/api/admin/content/stickers/bulk/route.ts
src/app/api/admin/content/fonts/route.ts
src/app/api/admin/content/fonts/[id]/route.ts
src/app/api/admin/content/fonts/[id]/faces/route.ts
src/app/api/admin/content/font-faces/[id]/route.ts
src/app/api/admin/content/font-faces/[id]/validate/route.ts
src/app/api/admin/content/font-faces/[id]/publish/route.ts
src/app/api/admin/content/font-faces/[id]/archive/route.ts
src/app/api/admin/content/preview/[kind]/[id]/route.ts
src/app/api/library/[kind]/[id]/route.ts
```

Read installed Next route-handler guide and cookie/server APIs first. Dynamic params must follow installed version.

- [x] List GET endpoints validate bounded filters; collection POST creates Drafts/families; face collection POST accepts binary upload. Item PATCH is safe metadata + `MutationKey`; DELETE is eligible Draft delete. Item PUT replaces never-published Draft binary. validate/publish/archive POST actions use named service operations. Family PATCH accepts a discriminated metadata/status action with expected revision and license checks where applicable, not arbitrary columns.
- [x] Call `requireCurrentStaff()` for all admin operations; verify actor from session, never spoofable headers. Editor permitted on both kinds; require `admin` on DELETE. Deny cross-origin cookie mutation via Origin check; retain CSRF protections of existing app.
- [x] Use Node runtime for parsers/Chromium. Enforce file/request/item limits and route timeouts consistent with bounded validation. Return 202 + validation run ID when probe exceeds request window; staff polls that run, not a fabricated success. Poll endpoint may be GET of the same validate route.
- [x] Staff preview resolves record, checks role, streams only safe private candidate with `Cache-Control: private, no-store`, `nosniff`, restrictive CSP. Font binaries get correct MIME/CORS; raw SVG originals download-only.
- [x] Public exact-ID delivery permits published and ever-published archived library binaries only; no Draft or private artwork. Route validates known kind/ID and derives Storage key server-side. Immutable public responses use ETag/checksum; metadata cache must not outlive publication status for selection queries.
- [x] Stable errors: 400 invalid, 401 unauthenticated, 403 forbidden, 404 inaccessible/missing, 409 revision/duplicate/immutability conflict, 413 too large, 422 validation/license, 503 renderer unavailable. Do not expose storage credentials or stack traces.
- [x] Exercise endpoints with real guest/customer/Editor/Admin cookies, forged headers, cross-origin POST, oversize multipart and direct Storage requests. This is runtime smoke, not source-text route tests.

Commit: `feat(api): expose staff library and safe binary delivery`.

## Task 9: Stable references, legacy resolution and persistence

**Files:** Create `src/lib/services/library-dependencies.ts`, `src/test/library-dependencies.test.ts`; modify `src/lib/product-state.ts`, catalog domain/repository, asset-store, storage and services listed in integration map.

**Produces:** stable references in mutable documents, exact resolution of old immutable designs, no rewrite of committed history.

- [x] Add typed fields to text/sticker element data. Keep text metrics unchanged; selected font face/weight/style explicit. Store ID/checksum, not signed URL. Resolve URL at hydration; do not serialize browser `FontFace`, Blob URL or server secret.
- [x] For legacy fontFamily-only text, exact registered alias and recorded weight/style map to migrated faces. If multiple matches or unknown binary, preserve original document and report unresolved dependency. Exact existing Storage URL mapping accepts configured origin/bucket/path only; never fetch arbitrary supplied URL.
- [x] Integrate resolver into editor load, preview, cloud/local save, guest checkout promotion, admin draft/preflight and renderer. New save validates selectable references; previously retained archived references remain allowed. Library references do not become customer-upload assets; original customer artwork remains private.
- [x] Preserve immutable `design_versions` bytes. Add non-mutating hydration adapter for old documents and inventory path aliases. User's current design never silently changes to first family face or fallback system font.
- [x] Keep regression for `resolveLegacyReferences(document, aliases)` with exact font/path fixtures: assert input deep equality unchanged, resolved IDs deterministic, ambiguous alias throws, archived retained ID resolves, unknown fails. Named function is exported from library-dependencies module.
- [x] Run `node --test --experimental-strip-types src/test/library-dependencies.test.ts`; exercise authenticated autosave and guest checkout with a real archived referenced sticker and face.

Commit: `feat(designs): retain immutable library dependencies across workflows`.

## Task 10: Finish customer font/sticker browsers and canvas behavior

**Files:** Modify fonts.ts, font-browser-sheet, add-content.ts, add-content-sheet, editor-sheets, customizer-shell, design-canvas, actual preview components and existing font/add-content tests.

**Consumes:** Tasks 8–9. **Produces:** new content visible automatically and retained content renders after archive.

- [x] Replace synchronous static font browser source with async published family/face query. Catalog unavailable with configured backend shows retry, not static resurrection. In explicit unconfigured dev only, use old static registry. Recents validate against fetched family IDs; keep archived current face visible in document inspector without offering it for new insertion.
- [x] Load actual faces with unique CSS aliases and `FontFace` descriptors; promise cache key includes checksum/weight/style. Evict rejected promise to permit retry. Avoid eager loading entire library; visible sample rows only, bounded concurrency. No nested retry button inside row button.
- [x] Wire `onSelectFont` with family/face ID, checksum and CSS alias through sheet/shell to text element. Unsupported weight/style is visibly unavailable; no synthetic substitute.
- [x] Implement published sticker search/category/tags/pagination in existing add subflow. Selection callback passes catalog ref and dimensions, not raw SVG HTML. Insert `type: 'sticker'` using existing centered placement/history transaction; preserve card surface.
- [x] Add sticker paint branch and selection/transform support without overwriting legacy uploaded-image behavior. Use exact IDs for selection, group membership and lock; render all stickers with correct z-order. Update empty-canvas detection and wrapping pattern paint to count sticker content. Preview and renderer share same branch.
- [x] Keep permanent behavioral tests for stable insertion, archive retention, undo/redo and surface filtering. Remove old tests that only pinned 'unavailable' UI copy.
- [x] Browser smoke: mobile insert two stickers + one uploaded image, move/resize/rotate/group/undo/redo, switch card surfaces, pattern repeat, save/reopen, preview, then archive one asset from admin and reopen again. Compare retained pixels/reference IDs.

Commit: `feat(editor): use published fonts and stickers end to end`.

## Task 11: Build operational admin content UI

**Files:** Proposed admin paths from file map, existing admin/layout.tsx. Reuse installed shadcn primitives and existing auth guard.

**Consumes:** actual APIs. **Produces:** usable staff workflow, no mock CMS.

- [x] Add Content navigation with Sticker/Phông chữ; preserve order pages/login. Use semantic nav links, active-page indication and inherited shell tokens. Do not install/rebuild a sidebar merely for two links.
- [x] Sticker page: 40-item paginated list, status/search/category filters, thumbnail grid/list, selected count, per-file upload progress/errors, bulk tags/category and explicit publish. Detail has private safe preview, metadata, license, warnings, validation proofs, audit and immutable identity readout.
- [x] Font page groups families and real faces; detail shows parsed internal names, weight/style, supported Vietnamese glyph report, custom sample, preview vs production probe images, licensing and per-face lifecycle. Display family status independently; prevent empty family publication.
- [x] Publish disabled with exact reasons until server gates pass; explicit confirmation summarizes chosen items and failed prechecks. Archive warns existing designs retain asset, asks reason. Delete appears Admin-only for eligible Draft, confirmation names file and irreversible action; API still rechecks.
- [x] Accessible Dialog/AlertDialog with titles, focus return, keyboard close and no nested buttons. Inputs have labels/inline error association; `aria-live` communicates per-item results; statuses carry text. Mobile 390px stacked preview/form; desktop 1440px split view; 44px primary touch targets; no horizontal overflow.
- [x] Use `bg-background`, `text-foreground`, border and semantic status tokens aligned with DESIGN.md. Do not scatter new hex tokens or decorative cards. GSAP only existing scoped add-sheet transition, reduced-motion branch and cleanup. Native progress for upload; no stagger animation on mass updates.
- [x] Actual browser verification at both sizes and keyboard/reduced-motion mode. Capture font/sticker list, invalid upload, mixed bulk results and publish/archive dialogs. Fix observed defects in one batch; one confirmation pass.

Commit: `feat(admin): add operational fonts and stickers library`.

## Task 12: Migrate existing library and perform clean cutover

**Files:** Create `scripts/state42-library-migrate.ts`; modify `supabase/seed.sql`, old fonts/stickers repository queries and related test fixtures, static registry integration. Never change immutable design-version rows.

**Produces:** inventory manifest and verified exact legacy aliases; production no longer depends on mutable external font CSS.

- [x] Script defaults `--dry-run`, reports existing families/stickers, distinct design references, exact storage paths and unsupported/ambiguous cases. Read projects working docs, template_versions, design_versions, draft documents and relevant legacy fields through privileged server context. Do not assume seed equals production content.
- [x] Download only known existing font source definitions through a tightly allowlisted migration path, not user URL import. Pin actual binary bytes/license for every used weight/style and Vietnamese subset. Preserve old family ID and alias; introduce faces with hashes. `old-typewriter` system alias needs explicit fidelity proof on deployment host; absence is a blocker, not a remap to unrelated font.
- [x] Existing public raw objects cannot become private retroactively by metadata change. Inventory already-public Drafts, copy to private paths, remove unreferenced public originals only with explicit operator cleanup approval, and document CDN exposure/expiry; never claim secrecy for previously disclosed bytes.
- [x] Backfill metadata/thumbnail/validation for existing published content without changing visual bytes. Validation failures stay resolvable for retained designs but block new selection/publication until resolved through a new asset ID or proven migration. Do not mark grandfathered bytes 'passed' without proof.
- [x] Coordinated maintenance window: backup DB/object manifest; pause library writes; apply schema; migrate and verify aliases/fixtures; update seed/query callers; drop fonts/stickers published boolean; deploy consumers; reopen writes. Never run old application against post-cutover schema. Roll forward on failure; binary object rollback cannot delete historical dependencies.
- [x] Re-run seed on disposable DB and ensure no published binary overwritten. Compare hashes/visual fixtures of old guest/account/order/template designs before and after. Run migration dry-run again to prove idempotent inventory, not destructive rewrites.

Commands:

```sh
node --experimental-strip-types scripts/state42-library-migrate.ts --dry-run
node --experimental-strip-types scripts/state42-library-migrate.ts --apply
```

`--apply` is for approved staging/maintenance execution only, never implicit production deployment. Commit: `feat(migration): preserve existing library identities at cutover`.

## Task 13: Prove real end-to-end behavior and security

**Files:** Create `scripts/state42-library-smoke.ts` using Node assert, existing Supabase client and installed Playwright; reusable runbook command, not framework boilerplate. Fixtures from Task 2.

**Prerequisites:** disposable Supabase URL, DB URL/service secret, separate customer/Editor/Admin test identities, app origin and Chromium installed. Script must refuse production target unless explicit test-project allowlist matches. Never print secrets.

- [x] Upload valid raster/SVG and font faces as Editor; verify private draft DB/object/preview denial with anonymous and customer clients. Publish after real receipts; verify catalog/binary responses; archive then reopen guest/account documents and immutable approved version.
- [x] Assert unsafe SVG, invalid font, missing Vietnamese glyph, forbidden license, stale revision, forged validation ID, client-supplied actor and direct Storage overwrite all fail with no publication.
- [x] Assert Editor can manage fonts/stickers but cannot delete Draft or generate order artifacts. Admin delete only eligible never-published unused Draft. Audit survives deletion. Public ever-published hashes identical before/after metadata/archive.
- [x] Assert mixed bulk returns per-item results, retry doesn't duplicate successes, upload/DB failure cleanup does not delete another transaction's object, same request replay does not duplicate audit.
- [x] Exercise actual UI/canvas scenarios from Tasks 10–11 and real production-engine output. Await font usage, not arbitrary sleep; compare dimensions and fixture-specific pixels. No 1×1 success accepted.
- [x] Run SQL role tests and existing whole application suite once after integration:

```sh
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state42_asset_library.sql
node --test --experimental-strip-types src/test/asset-library-domain.test.ts src/test/library-validation.test.ts src/test/library-dependencies.test.ts
pnpm run typecheck
pnpm test
pnpm build
node --experimental-strip-types scripts/state42-library-smoke.ts
```

- [x] Record exact command exit codes, test counts, screenshots and fixture/proof hashes. Missing external infrastructure is explicitly `NOT RUN`, not PASS; State 42 is not accepted until required runtime gates are exercised. Do not run application feature tests during this planning-only session.

Commit: `test(library): prove State 42 security and browser workflows`.

## Task 14: Document deployment, recovery and staff operation

**Files:** Create `docs/superpowers/state42-asset-library-runbook.md`; modify `README.md` with migration/smoke commands and runbook link.

- [x] Document permission matrix, private/public bucket split, supported formats/limits, binary immutability, lifecycle, family/face behavior, license/glyph checks and explicit publication.
- [x] Document Chromium/runtime dependencies, real engine fingerprint, validation invalidation on engine upgrade, startup health requirements and why HTTP/font signature success is insufficient.
- [x] Document migration order/backups/maintenance window, object-store nontransactionality, intent cleanup (`--dry-run` then approved `--apply`), error recovery and partial bulk retry. Never instruct deleting archived/public files.
- [x] Include operator walkthrough upload → review failures → preview → license → validate → publish → customer select → archive → retained design reopen; separate eligible Draft deletion and immutable-history limitations.
- [x] Update planned checkboxes only for work actually verified. Preserve production-state decision memory: readiness derived, starts explicit/Admin-only, design frozen, no cancellation feature.

Commit: `docs(state42): document validated asset library operation`.

## 4. Recoverable requirement traceability

The archive does not contain the complete original numbered 1–174 brief. Do not fabricate a numeric 174/174 claim. All recoverable requirements below have explicit owners:

| Requirement | Tasks | Observable acceptance |
| --- | --- | --- |
| Existing tables/repository/auth reused | 1,3,6,8 | One catalog, existing staff identities, no CMS duplicate |
| Draft-first / explicit publish | 3,5,6 | Draft inaccessible; publish requires matching receipt |
| Immutable ever-published binaries | 3,6,7 | Direct DB/Storage overwrite/delete denied; hashes unchanged |
| Archive retains old designs | 6,9,10,12 | Reopen guest/account/order/template after archive |
| Editor + Admin content management | 3,8,11,13 | Both can manage fonts/stickers; no production privilege escalation |
| Admin eligible Draft deletion | 3,7,13 | Used/published/Editor deletes fail; audit retained |
| Categories/tags/metadata | 1,6,11 | Safe patch accepted; visual identity keys rejected |
| Bulk sticker upload/edit/publish | 7,8,11,13 | Mixed outcomes, per-item retry and no duplicate successes |
| Safe sticker files/thumbnails | 2,5 | Hostile SVG rejected, raster bounds, actual PNG thumbnails |
| Font family/face model | 1,3,5,11 | Parsed weights/styles, no synthetic missing face |
| Metadata + Vietnamese glyph validation | 2,5 | Explicit missing codepoints and actual shaped glyphs |
| License acknowledgement | 3,5,6,11 | Forbidden/missing embedding permission blocks publish |
| Editor/Preview/Production consistency | 4,5,9,10,13 | Same IDs/fonts/pixels; real worker, not placeholder |
| Stable IDs/legacy compatibility | 9,12 | Immutable docs unchanged; exact aliases/hash retained |
| Customer published-only browsers | 8,10 | Refetch shows new content; archived hidden from selection |
| Draft Storage/RLS security | 3,8,13 | Anonymous/customer direct URL/table reads denied |
| Audit/concurrency | 3,6,7 | Revision conflict, append-only events, request replay |
| Operational UI/shadcn | 11 | Real staff browser workflow and keyboard/mobile proof |
| GSAP safety | 10,11 | Scoped cleanup and reduced-motion, no needless animation |
| Impeccable inherited Operate design | 11 | Tokens, hierarchy, readable previews/status, responsive surfaces |
| Migration/seed/runbook | 12,14 | Idempotent dry-run and non-destructive cutover |
| Template management excluded | All | Read compatibility only; no template CRUD UI |

## 5. Final implementation acceptance

- [x] Real Supabase lifecycle/Storage/role tests pass, including adversarial direct access.
- [x] Real font and sticker files pass parser/renderer checks; negative fixtures fail for intended reasons.
- [x] Customer editor, previews, persistence and old designs preserve exact dependencies through archive.
- [x] Admin bulk and face/family workflows function with mixed errors and correct permissions.
- [x] Actual renderer prerequisite is closed; no fake proof, no silent missing surface.
- [x] Typecheck, existing suite, build and browser smoke pass with recorded evidence.
- [x] Caller migration/seed/docs complete; no obsolete fonts/stickers published flag or parallel source of truth.

This planning session creates only this plan and its companion spec. Implementation, dependency installation, migration, database writes, test runs, deployment and commits require the execution phase; nothing here claims they already happened.
