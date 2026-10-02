# State 42: Admin Asset Library — Fonts + Stickers

**Status:** Planning only. This document replaces the earlier incomplete draft in this file. No application, database, or storage changes have been applied.

## 1. Goal and scope

Extend the existing Supabase-backed catalog into an operational asset library at `/admin/content/stickers` and `/admin/content/fonts`. Staff upload to private Draft storage, validate and preview, edit metadata, explicitly publish, and archive without breaking designs. Reuse existing admin auth, catalog tables/repository, customer editor, and preview components. Template management remains State 43; do not create a template CMS or disabled template route.

Included: sticker single/bulk upload, categories/tags, bulk metadata/publish, safe SVG/raster validation and thumbnails, font families/faces, font metadata extraction, Vietnamese glyph validation, license acknowledgement, real browser/production-engine validation, append-only audit, eligible Draft deletion, stable design dependencies, existing-data migration, customer browsing and historical resolution.

Not included: order cancellation, fulfillment redesign, shipping, new auth system, public URL imports, overwriting ever-published binaries, or hard deletion of ever-published content. No real-production claim may be based on a successful HTTP download, font magic bytes, or a placeholder image.

## 2. Repository evidence and integration constraints

| Observed source | Consequence |
| --- | --- |
| `supabase/migrations/0001_state37_core.sql` defines `fonts` and `sticker_assets` with `published boolean` | Extend those tables; migrate callers/seed to canonical `status`; remove obsolete boolean for these two tables in coordinated cutover. Products/templates are unchanged. |
| `0002_state37_storage.sql` makes `fonts` and `sticker-library` public and grants broad staff Storage mutations | Drafts must use a new private bucket. Narrow old Storage policies so broad OR policies cannot bypass immutable library paths. |
| `src/lib/admin/authorization.ts` provides staff role checks | Reuse identity verification. Editor is allowed to manage BOTH fonts and stickers in State 42. |
| `src/lib/repositories/catalog-repository.ts` uses published queries and static fallbacks | Keep one catalog boundary. When configured, network errors must not resurrect archived static entries. |
| `src/components/customizer/font-browser-sheet.tsx` currently reads the static registry | Change the actual browser to fetch published cloud families/faces, not only the repository method. |
| `src/lib/fonts.ts` loads Google Fonts and validates recents against a static registry | Add immutable self-hosted faces; validate recents against the fetched catalog; preserve existing family aliases for old documents. |
| `src/lib/product-state.ts` has `fontFamily` text data and generic `CanvasElement.data` | Add stable face/sticker IDs and checksums; do not mistake URLs or display names for identity. |
| `add-content-sheet.tsx` has an unavailable sticker panel; `design-canvas.tsx` lacks decorative sticker rendering | Complete insertion, rendering, transforms, history, reopen and preview, not just a grid of thumbnails. |
| `scripts/state39-render-jobs.ts` writes a hardcoded 1×1 PNG to `customer-assets`; thumbnail delivery reads `approved-renders` | Real production renderer is NOT an available prerequisite. Add a blocking engine-probe milestone; never mark fonts production-validated from this worker. Full order artifact-set/fulfillment redesign is outside this plan. |
| `src/lib/services/serve-asset.ts` contains a regex sanitizer | Do not reuse regex as a parser/security guarantee for newly uploaded library SVGs. Do not broaden customer-artwork access while adding library delivery. |

Notebook currently has one cover definition, not a proven two-surface model. Card surfaces are front/inside/back. Preserve actual product surfaces; do not invent new surfaces from scout suggestions.

## 3. Lifecycle and permissions

Canonical status: `draft | published | archived`. `ever_published_at` is write-once. A monotonically increasing `revision` protects all metadata and transition writes, including changes that leave status unchanged.

- Draft: private, editable, can fail validation, binary replacement allowed only before first publish. Replacement increments revision, generates a new immutable object key, and invalidates previous validation.
- Publish: explicit staff command. Checks current revision, immutable content hash, server validation, license acknowledgement, preview proof and renderer-engine proof. Writes publication receipt/audit atomically. Same request ID with same payload returns prior result; changed payload conflicts.
- Archive: removes new selection, preserves ever-published bytes, stable IDs, previews, and historical resolution. Require trimmed 3–500 character reason.
- Restore: explicit archived-to-published command, subject to current publication checks; never convert back to Draft.
- Delete: Admin only; current Draft, never published, no design/template/version/reference or pending publication/validation use. Delete via recorded cleanup intent, then Storage removal, then atomic row deletion/event. Failure remains staff-visible and retryable; never cascade into immutable design versions.

| Operation | Guest/customer | Editor | Admin |
| --- | --- | --- | --- |
| Published browsing | yes | yes | yes |
| Exact-ID resolution of previously published/archived bytes | yes, public library content only | yes | yes |
| Read Drafts; upload/validate/edit/publish/archive either kind | no | yes | yes |
| Delete eligible Draft / sensitive cleanup | no | no | yes |
| Generate order production artifacts / start or complete production | no | no | yes, existing separate workflow |

Library specimen validation is not order-artifact generation. An Editor can request a font specimen validation without receiving production-order authority.

Safe post-publication metadata: display name, category, tags, search keywords, description, browser sample text. Immutable: asset/face ID, font internal family/weight/style mapping, CSS alias, object bucket/key/checksum, sticker viewBox/dimensions/orientation, binary bytes, color interpretation, validated thumbnail bytes. New visual means new ID/face. Family display renaming must not affect CSS font-family identity.

## 4. Data and storage model

Forward migration: `supabase/migrations/0007_state42_asset_library.sql`.

- `fonts`: retain legacy text ID as family ID; add display/category/tags/keywords, status, revision, audit actors/timestamps. Family status gates selection of its faces; archiving a family hides the family without mutating face binaries.
- `font_faces`: new child table, UUID ID, family FK, weight range, normal/italic, immutable CSS alias `qt-face-<id>`, source format, private/public object locators, checksum/byte size, extracted metadata, glyph coverage, status/revision/ever-published timestamp, license fields and current validation receipt. Reject overlapping selectable weight/style ranges within one family. No browser-synthesized bold/italic for managed faces.
- `sticker_assets`: retain existing text IDs/category/tags; add display metadata, status/revision/ever-published, immutable locators/checksums, format/dimensions, thumbnail locator, license and validation receipt. Reuse category text plus validated tags; no category hierarchy engine.
- `library_validation_runs`: server-only append-only receipts keyed by kind, ID, revision, binary hash, validator version, rendering-engine fingerprint, and result JSON. Client cannot set `passed`.
- `asset_events`: append-only server-authored events with actor, kind, target ID, request ID, before/after revision, event, safe metadata diff and reason. Preserve event even after Draft deletion; no cascading FK to deleted draft.
- `library_uploads`: private upload/cleanup intent, actor, generated UUID key, item request ID, size limits, progress and expiry. Necessary for failed commits and resumable bulk items; not a general job framework.
- Legacy reference mapping: deterministic read-only aliases from known font-family strings / exact existing Storage bucket+key to stable IDs. Unknown or ambiguous mapping blocks publication of affected content rather than guessing.

Storage:

1. `library-drafts` private: raw originals, sanitized candidates, private previews. Staff/server read only; raw SVG never served inline.
2. Existing public `fonts` and `sticker-library`: only previously validated, explicitly published objects. Keys include application ID and SHA-256; `upsert: false`. Never update/delete ever-published keys, including thumbnails.
3. Existing `customer-assets` and `approved-renders` remain private. Never mix artwork or order artifacts into library buckets.

Users have no direct table mutation for library tables or direct Storage mutation in library buckets. Cookie identity is verified at API; controlled server-only `SECURITY INVOKER` RPCs accept a verified actor ID, verify staff role from DB, lock rows, compare revision, enforce invariants and append audit in one transaction. Revoke execute from PUBLIC/anon/authenticated; grant service_role only. Service secrets remain server-only. Existing `is_staff` is reused, not re-created.

Object storage is not transactional with Postgres. Prepare private candidates and publication bytes first, then commit a validated receipt and row. Uncommitted public candidates must contain only approved-to-publish safe bytes and must not be linked from catalog; only published rows authorize durable ownership. Prefer keeping candidates private until explicit publish; a failed publish copy is a cleanup intent, never a false published record. Cleanup only touches UUID-owned unreferenced candidates, never checksum-shared objects or ever-published keys. Restore/archive never delete files.

## 5. Validation policy

Defaults are implementation choices for this plan, not claims from the archived brief. Limits must be centralized and shown in forms.

### Stickers

Accept SVG, PNG, JPEG, WebP. Max raw file 10 MiB; SVG 2 MiB; raster decoded 40 megapixels, max side 8192; thumbnail 320 px longest side, retain transparency. Reject animation, malformed/zero dimensions, truncated data, unsupported MIME/signature mismatch and decompression bombs. Decode/re-encode rasters; apply orientation once and freeze canonical dimensions/checksum.

Use a maintained XML DOM parser, not regex. Reject DOCTYPE/entities/processing instructions other than XML declaration, script, foreignObject, animation, event handlers, external references, CSS imports/URLs, executable schemes, non-SVG namespaces and unknown elements/attributes. Allow only geometry/groups, defs, local gradients/clips/masks and local `#id` references. Reject unresolved IDs and cycles. SVG text must be outlined; reject `<text>` and embedded fonts to avoid undeclared dependencies. Re-serialize a strict allowlisted DOM, hash canonical bytes, render thumbnail with external resources disabled. Show original filename only as text. Warn for low raster resolution; require positive viewBox for SVG.

### Fonts

Accept single-face TTF, OTF, WOFF and WOFF2 up to 10 MiB; reject collections, malformed tables and unsupported color-font tables with a precise error. Parse real bytes using a maintained font parser; header signature alone is insufficient. Extract internal family/subfamily/PostScript names, weight/style, variable weight range, units/em, glyph count, Unicode cmap and embedding restrictions. Bound parser time/memory in a worker. Do not mutate the visual font to change identity.

Use a checked-in Vietnamese specimen built from all NFC Vietnamese letters (including Đ/đ), decomposed NFD equivalents, digits and punctuation. Require no `.notdef` mappings for required glyphs and compare browser/engine shaping samples; report missing codepoints explicitly. `document.fonts.ready` and width changes alone cannot prove font usage. Wait for `FontFace.load()`, use unique CSS alias with `font-synthesis: none`, inspect Chromium platform-font usage and retain raster/metric proof. Check each advertised face/weight, not only regular.

License acknowledgement records staff user/time, source, license text/name and confirmation of web embedding + commercial print permission. Parsed embedding restrictions that prohibit intended use block publication even when checkbox is checked.

### Dependencies

Node has no secure XML DOM parser, font parser or image decoder. Existing dependencies do not provide these. Plan permits narrowly scoped `@xmldom/xmldom`, `fontkit`, `sharp`, and `playwright` (Chromium) plus needed type packages, pinned by pnpm lockfile. Before install verify current package support on Node/Windows/deployment host. Reuse browser Chromium for font/production-engine probes; do not add a second raster engine. No new CMS, table, state, animation or test framework.

## 6. Production-engine prerequisite — mandatory release gate

Do not expand this into general fulfillment/artifact-set work. Create a deterministic shared document-render surface based on `DesignCanvas` and existing preview/pattern renderers; use the same font resolver in Editor, Preview and that surface. Worker must render actual content, reject absent fonts/assets, deny external network, and return engine fingerprint/hash/real pixels. Use this engine for library specimen validation and wire it into the existing State 39 PNG job path, removing the 1×1 mock and using private `approved-renders` consistently. Preserve existing artifact contract; do not invent PDF, new order statuses or artifact sets.

Before State 42 publication is enabled, prove per-supported-product document output, card surfaces, wrapping repeats, notebook cover and sticker content match existing preview semantics. Output dimensions derive from existing product geometry, not responsive mockup sizing; no UI guides or shadows in print artwork. This milestone is a real prerequisite in the implementation plan, not a deferred promise. If product output geometry cannot be established from repository/operational contract, mark production proof failed and report exact missing contract; never allow publish by bypassing it.

## 7. Customer integration and compatibility

- `CatalogRepository` remains the single customer query boundary. Selection returns only published family+face/sticker records, with bounded pagination and filters.
- No configured-backend fallback to static fonts after request failure; report retryable catalog error. Explicit no-backend development uses existing static registry only, never fake stickers.
- `TextElementData` adds `fontFamilyId`, `fontFaceId`, `fontChecksum` while preserving typography metrics. Sticker data adds `libraryAssetId`, `assetChecksum`; delivery URLs are derived, not persisted as canonical identity.
- Hydration, editor reopen, browser samples, preview, autosave, checkout asset promotion, admin drafts and render worker resolve stable IDs independently of selection status. Archived published content remains visible and labeled as unavailable for new selection; never silently swap a font.
- Immutable `design_versions` are never rewritten. Exact legacy references use compatibility resolution at read time. Mutable documents acquire stable IDs only on normal save after successful resolution. Keep historical binary aliases/paths unchanged.
- Sticker insertion must support transforms, z-order, groups, locks, undo/redo, card surfaces, pattern repeats, local/cloud save and reopen. Resolve original image plus stickers without duplicating the existing legacy image layer.
- Font browser fetches async catalog on open, loads only visible samples, retains failure/retry states, and refreshes recents against fetched IDs. Archive/publish appears on next browser open/refetch without redeploy; current documents retain loaded dependencies.

## 8. Admin UX

Operate mode, inherited stationery tokens. Existing shell gets `Đơn hàng` and `Nội dung`; content navigation has `Sticker` and `Phông chữ`. No dashboard rebuild or ornamental animation.

List: search, status/category filters, 40-item pages, totals, checkbox selection, accessible preview and empty/error states. Sticker bulk upload at most 50 files, concurrency 3; each has independent upload/validation/result and retry. Bulk category/tag patch and explicit publish show success/failure per selected item, never a fake all-success toast. Server limit 50 IDs/request; each operation checks expected revision.

Detail: private draft preview, immutable ID/hash, metadata, validation report, license fields, explicit `Xuất bản`, `Lưu trữ`, and Admin-only eligible `Xóa bản nháp`. Font family detail lists actual faces, weight/style, Vietnamese sample/glyph report and engine validation. Family publish requires at least one valid published face; publishing a face never silently publishes family.

Use existing Button/Input/Label/Dialog/AlertDialog/Badge/DropdownMenu primitives and native labeled controls where no primitive is installed. Desktop split preview/form; mobile stacked form, reachable actions, no nested interactive elements, proper focus return, 44 px primary touch targets, live announcements for async outcomes. Progress and status need text, not color alone. Keep existing `useGSAP` add-sheet scoped transition; honor reduced motion and clean matchMedia on unmount. No animation on bulk rows or repeated validation progress.

## 9. Acceptance and delivery

Complete only when real Supabase tests prove role/lifecycle/Storage boundaries, real browser proves Editor/Preview/specimen output and customer integration, and existing suites/build remain passing. Commit/licensed fixture files must be real decodable inputs, including malicious SVG fixtures and a Vietnamese font with its license; synthetic magic-byte buffers are negative tests only.

Coverage requirements: explicit publish; draft secrecy; immutable bytes after archive; safe metadata; eligible Draft delete; bulk per-item outcomes; font family/face modeling; extracted metadata; Vietnamese glyphs; licensing; stable references; old immutable designs; configured-backend errors; customer browser refresh; admin/editor RBAC; audit; server production-engine proof. Full numbered 1–174 source text is not present in the supplied archive, so do not invent a claimed 174/174 traceability result. Implementation plan maps every recoverable requirement here to tasks and concrete checks.
