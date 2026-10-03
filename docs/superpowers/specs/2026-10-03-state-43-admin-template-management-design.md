# State 43: Admin Template Management & Publishing

**Status:** Planning only; implementation not started. User approved DB-only catalog cutover and delegated remaining design review/plan completion. This revision supersedes earlier chat sketches (nullable targets, 30-second lease expiry, caller-provided publish snapshots, ordinary guest preview, and cascading audit deletion were not safe final contracts).

**Guiding invariant:** A Template is a versioned starting point. Publishing changes what future customers start from, never what existing customer Projects have already become.

## 1. Scope and repository evidence

Extend, do not replace: Editor Core; product-specific editors; State 30 resolution; State 31 safety; State 32 Preview; State 33 Preflight; State 37 Supabase; State 39 staff lease/CAS; State 41 account projects; State 42 published/historical library assets.

| Inspected existing file | Reuse / required integration |
| --- | --- |
| `src/lib/product-state.ts` | Actual document is `DesignState`, not a separate TemplateDesignDocument. `transitionState` is reducer entry, not `designReducer`. `CanvasElement.locked`, text/image `data.placeholder`, `COMMIT_TEXT_EDIT`, `REPLACE_IMAGE_ASSET` already exist. |
| `src/lib/product-state.ts:1-165,430-911` | Geometry comes from `PRODUCTS`, `getCardSpreadDimensions`, `getFixedStickerDimensions`, `NOTEBOOK_COVER_DEFINITION` and wrapping helpers, not a discovered unified ProductDefinition class. Fixed shape lives in `productOptions.shape`, not variant ID. |
| `src/components/customizer/template-browser.tsx`, `template-chooser.tsx`, `customizer-shell.tsx` | Current runtime uses `TEMPLATES`, `SET_TEMPLATE`, URL template IDs and static titles. All must cut over together. |
| `src/components/products/product-detail-catalog-view.tsx`, `responsive-template-preview.tsx`, `src/lib/product-catalog.ts` | Product listing and preview also consume static template configurations. New grid queries return cards, not documents. |
| `src/lib/domain/catalog.ts`, `src/lib/repositories/catalog-repository.ts` | State 37 catalog maps `published` boolean and silently falls back to static templates. Remove that template fallback, preserve product behavior. |
| `supabase/migrations/0001_state37_core.sql`, `supabase/seed.sql` | Existing text Template IDs, UUID version IDs, unique `(template_id, version)`; 17 SQL catalog rows include wildcard product/variant targets and partial documents. Static dictionary also has aliases; inventory union, not presumed count. |
| `src/lib/editor-context.ts`, `src/lib/use-design-history.ts`, `src/lib/domain/design-revision.ts` | Existing guest/staff/customer modes and `canMutateElement` are extension points. Protect all reducer/history paths, not pointer events alone. |
| `src/lib/staff-draft-autosave.ts`, `src/lib/use-staff-draft-session.ts`, `0004_state39_design_revisions.sql` | Queue is order-specific today. Extract only shared queue mechanics; retain order adapter. Actual lease duration is 120 seconds, heartbeat 30 seconds; epoch and session ID are required. Defaults: 800 ms debounce, 5000 ms max wait. |
| `src/lib/image-replacement.ts`, `src/lib/storage.ts` | Replace preserves geometry/mask and clears `data.placeholder`; storage sanitizes generated contours. Guest retention is 30 days/max 3. |
| `src/lib/services/library-dependencies.ts` | `validateNoDraftDependencies(document)` silently returns without lookup; this is not publish validation. JSON references are not protected by ordinary foreign keys. |
| `src/lib/services/document-renderer.ts`, `src/components/customizer/document-render-surface.ts` | Real Chromium renderer exists, but image error currently resolves wait and managed fonts need explicit loading. Template validation must fail missing resources, not certify fallback output. |
| `src/lib/services/staff-design-preflight.ts` | Reuse `getPreflight` findings/acknowledgement shape, not order-bound assessment records or placeholder manifest hashes. |
| `0007_state42_asset_library.sql` | Reuse append-only `asset_events`; no second template audit table. Extend draft dependency deletion guards to Template Drafts/Versions. |
| `0002_state37_storage.sql`, `0007_state42_asset_library.sql` | Existing `template-assets` public; `customer-assets` and `approved-renders` private. New draft/version candidates must never be uploaded to public legacy bucket. |
| `src/app/my-designs/page.tsx`, `src/lib/services/local-project-migration.ts` | Explicit document projections currently drop newly added provenance unless updated. |
| `PRODUCT.md`, `DESIGN.md`, `src/app/admin/content/layout.tsx` | Operate-mode staff UI, calm stationery identity; extend current content navigation, not redesign app. |

No application tests/builds were run to certify this planning-only document. Prior State 42 completion claims are not substitutes for actual interfaces above.

## 2. Final decisions

1. Extend `templates` / `template_versions`; add one `template_drafts` row per template. No template-as-project, second canvas, parallel catalog or external personalization form.
2. DB is sole runtime template catalog. Blank design is a local editor action, not a dependency on a published `blank` record. Static inputs remain only in migration fixtures.
3. Exact immutable target includes product, variant, wrapping mode, fixed sticker shape, and surface geometry signature. No nullable wildcard for new Templates.
4. Editor and Admin may publish/archive; only Admin deletes never-published drafts and takes over stale leases. No live lease force takeover, no two-person approval.
5. Catalog metadata (name/category/tags/sort) edits independently under catalog revision CAS; artwork, target, locks, placeholders, assets and thumbnails are versioned.
6. Optional placeholders only in State 43; no required flag/form schemas. Empty placeholder is omitted from print and raises nonblocking customer Preflight warning. Explicit real decorative fallback prints normally.
7. Historical published binaries remain resolvable regardless of current lifecycle. New clone rechecks current eligibility transactionally. Existing Project open/autosave does not recheck catalog eligibility of its inherited historical assets.
8. No new analytics platform/count blocker. Provenance is authoritative; best-effort deduplicated `template_used` metadata event only. No customer content in audit.

## 3. Exact target and document contract

`TemplateTarget = { productId, variantId, mode: 'pattern' | 'full-sheet' | null, shape: FixedStickerShape | null, surfaces: [{ id, widthMm, heightMm }], geometryKey }`.

Use existing product configuration helpers to derive canonical surface dimensions and stable JSON geometry key; caller cannot provide trusted dimensions/hash. Validate active product + its own variant, not another product's variant ID. Database variant IDs must be explicitly mapped to editor variant IDs from seed metadata (do not assume equality).

- Wrapping: A1/A2 and pattern/full-sheet are separate exact targets; mode affects compatibility, repeat styling remains artwork.
- Card: horizontal/vertical; one document with front/inside/back. Inside uses existing spread dimensions. Active viewed surface is transient, not target identity.
- Sticker: die-cut/fixed-shape/phone are existing variants. Fixed-shape additionally requires one of five existing shape values. Die-cut contour remains derived; never persist cutline elements. Phone retains current decorative geometry, no new phone model selection.
- Notebook: `standard`, front-only, 148×210 mm with existing binding zone.

Persist `document_schema_version` on Draft/Version; existing payloads with no marker are schema 0. Add one pure document reader/migrator shared by Template and Project boundaries, retaining `DesignState` shape. For legacy full Projects normalize in memory only; never reconstruct customer artwork by reapplying a Template. Unknown future schema fails explicitly. Storage key suffixes are not document schema versions.

## 4. Database model and invariants

Forward migration: `supabase/migrations/0008_state43_template_management.sql`; final cutover `0009_state43_template_catalog_cutover.sql` after migration gate. Do not edit old applied migrations.

### Templates

Retain `id text`, `slug`, `name`, timestamps and harmless legacy metadata. Slug is a link, not a lifecycle field. Add `status` (draft/published/archived), `revision bigint`, fixed product/variant/mode/shape target + `target_snapshot jsonb`, `category_id`, `tags text[]`, `sort_order integer default 0`, `current_published_version_id uuid`, write-once `ever_published_at`, actors/archive timestamps.

Use composite FK `(id,current_published_version_id)` to `(template_id,id)` so pointer cannot target another template. Never `ON DELETE CASCADE` from Template to a published version; deletion RPC rejects any historical version. Category references are server-backed flat `template_categories(id text, name text, sort_order integer)`; seed existing real categories, `all` is UI filter only. Products own their variants via explicit composite FK or equivalent checked mapping. Target changes after creation rejected by trigger/RPC. Catalog metadata CAS does not rewrite Version JSON.

### Drafts

UUID ID, unique template ID, same-template `based_on_version_id`, `design_document`, `document_schema_version`, `draft_revision bigint`, creator/updater/timestamps, editor user ID, lease session UUID, lease epoch bigint, lease expiry and activity time. Draft may contain incomplete content; every persisted asset reference must still be owned/authorized. Normal Font/Sticker picker selects only published resources. Assets archived while editing remain inspectable, block publish.

### Versions

Keep existing IDs and unique `(template_id, version)`. Add immutable target snapshot, dependency snapshot, schema version, preflight snapshot, validation receipt ID, asset manifest, thumbnail locator/checksum, preview surface metadata, publisher/time and optional note (max 500 characters). Reject UPDATE/DELETE after legacy migration freeze, including service-role operations through ordinary SQL; migration owner is only maintenance exception. No lifecycle on Version. No mutable pointers into Draft storage.

### Asset ownership and receipts

`template_assets`: UUID, template ID, draft ID nullable, storage locator, checksum, MIME, size/dimensions, upload state and expiry, creator, immutable published marker. `template_version_assets`: version/asset join with restrictive FKs; permits shared immutable already-published assets across versions/duplicates. Draft assets are not shared mutable objects. Never delete an asset referenced by a version or live draft.

`template_validation_runs`: append-only server receipts: template/draft/revision/session/epoch, exact source document hash, frozen candidate document/hash, target hash, dependency manifest/hash, standard + template findings, warning IDs, validator version, engine fingerprint, successful customer initialization proof, thumbnail/preview hashes, expiry (10 minutes), candidate ownership. Fresh revision, asset change or lease takeover invalidates receipt. Browser cannot insert/update receipts.

`template_operations`: request ID + verified actor + operation + payload hash, reserved version UUID/candidate namespace, result and cleanup state. Unique operation identity ensures lost-response publish/clone does not duplicate versions/events/projects; changed request payload conflicts. No general job engine.

Extend `asset_events` with `kind='template'` events without target FK, preserving history after eligible draft delete; never log every autosave. Events: created, draft_created, published, archived, republished, duplicated, draft_discarded, draft_taken_over, deleted and best-effort used. Do not use `order_events`.

Projects gain nullable source Template/Version provenance, set server-side for cloud clone and carried in local document/recent-project state. Retention FKs restrict deletion of referenced history, not customer Project editing. Add clone request key unique per owner/request for authenticated creation. Do not cascade project deletion to Template history.

## 5. Access boundary / RLS

Use server-only `SECURITY INVOKER` mutation RPCs, pinned search_path, revoked PUBLIC/anon/authenticated EXECUTE, service_role EXECUTE only. Route verifies user via `getUser`, checks role from DB, supplies verified actor ID; SQL rechecks actor role. Service-role client has no meaningful `auth.uid()` customer identity: never mix these models. Transaction-local operation guard is defense in depth, not authentication.

At final cutover revoke direct customer SELECT on raw Template/Version/asset/receipt/operation rows; replace old permissive OR policies and grants. During 0008 preparation, only inventoried legacy catalog rows retain temporary public SELECT; new identities cannot inherit legacy `published=true` default. New Draft/receipt/asset surfaces are private from creation. 0009 removes legacy SELECT after coverage gate. Staff may SELECT authorized raw rows under RLS, cannot direct-write around RPC. Safe Next GET endpoints use explicit server DTO projections, no internal actors/audit/license/storage credentials. Customer browsing needs no auth session, including no Supabase anonymous sign-in.

Public full-document payload: only current published available version via resolve/use. Historical full-document endpoint: staff or authenticated owner of persisted Project/version provenance; guest historical work uses its own locally cloned document, not a guessed historical document ID. Previously published catalog asset bytes (not private customer artwork) are intentionally public through committed asset endpoint even after Template/archive. No guessed draft UUID grants byte access.

Admin-only delete: never published, no Versions, no external retention references, no pending publish; audit survives; delayed asset cleanup follows. Admin takeover: only expired 120-second lease, reason 3–500 chars, increment epoch. Same user's second tab is a different session and read-only. Existing order-production admin boundaries unchanged.

## 6. Storage and source eligibility

New private buckets `template-drafts` and `template-versions`. Existing public `template-assets` becomes read-only legacy content; do not make customer/order storage public. Draft uploads: staff server endpoint, generated UUID keys, no upsert; accept static PNG/JPEG/WebP only, max 10 MiB/40 MP/8192px side, MIME sniff/decode/re-encode via installed sharp, SHA-256 and dimensions. Reuse State 42 validation primitives; no remote URL import or arbitrary SVG upload here (use Sticker library).

Store canonical asset IDs/locators, not signed URLs, blob/data URLs, filesystem URLs or another customer's `/api/assets` link. Covers original/current/removed-background/mask variants as applicable. Runtime signs/hydrates authorized bytes without persisting expiring signatures. Template author upload/Replace/crop/background-removal outputs enter same ownership path.

Before publish, copy draft bytes to operation-owned immutable candidate namespace in private `template-versions`; rewrite candidate document asset references; render from candidate. SQL commit associates candidate assets and thumbnail with immutable Version. Storage cannot participate in PostgreSQL transaction: candidate failure leaves no pointer change, commit failure leaves private unreachable candidates for cleanup. Asset endpoint serves only manifest-attached committed ever-published bytes with checksum ETag and immutable cache headers. Thumbnail endpoint is CDN-cacheable and safe for catalog, longest edge 640 px WebP; card primary front, wrapping actual repeated sheet, die-cut transparent silhouette/border. Publish does not overwrite keys.

Template-owned images remain independent from State 42 Sticker reuse. Immutable version asset references may remain in a cloned Project: this is a frozen binary dependency, never a live Template design dependency. Checkout accepts only verified committed locators and keeps customer uploaded assets private.

Create from design: explicit staff-owned cloud Project (`owner_user_id = actor`), no linked Orders/production DesignVersions, valid compatible full document; never offer all customer projects to staff as source. Copy only verified owned image bytes into new private Template Draft, require explicit right-to-publish acknowledgement, preserve source unchanged. Customer Order designs excluded. Duplicating another Template uses selected published Version or never-published Draft; retains exact target, deep-clones JSON, copies private assets, reuses immutable published assets, new identity/name `<name> — Bản sao`, hidden until publish.

Cleanup CLI defaults dry-run, requires explicit apply, grace 24 hours; locks candidates, checks active Draft/Version/operation references before deleting only operation-owned unreachable files. Never delete ever-published assets; freeze failed/cancelled cleanup state for retry.

## 7. Draft and Editor behavior

Extract reusable autosave queue mechanics from State 39 into a narrow queue with transport callback; keep State 39 guards in its adapter and tests unchanged in meaning. Templates use same 800ms semantic debounce/5s max wait, one request in flight, 30s heartbeat/120s lease, session+epoch+expected revision. Flush before validation/publish. Conflict stops queue; banner `Mẫu này đã được cập nhật ở nơi khác.` and `Tải phiên bản mới`. Do not silently discard unsaved local edits; offer recoverable download before reload. No automatic merge or background catalog Realtime.

Add `template-author` and `template-preview` to `CustomizerContext`; preview explicitly in-memory with initial document/onExit, no Project ID, no persistence/upload side effects outside disposable blob URLs. No normal guest context pretending to be isolated. Author upload and autosave use callbacks; no checkout/price/quantity/target changes. Staff review remains read-only; only staff-edit and writable template-author may bypass customer locks.

Add `CanvasElement.customerLocked?: boolean`, independent of existing editor `locked`. Extend existing mode/`canMutateElement`, `transitionState`, history, multi-select/group helpers and layer actions. Customer cannot mutate protected elements through keyboard, bulk group/ungroup/parent transforms/delete/reorder/Replace/style/SET_ELEMENTS, nor unset metadata through UPDATE. Reject operations touching locked members atomically; no complex lock inheritance stored. Customer existing editor-lock can still be unlocked; customerLocked cannot. Author/staff-edit can work on customerLocked elements. Read-only always wins. Lock enforcement is UI/editor behavior, not a DRM promise against a user rewriting their own JSON.

Placeholder fields in typed text/image data: `placeholderType?: 'none'|'text'|'image'`, `placeholderHint?: string`; existing `placeholder:boolean` is unresolved/empty state. Setting placeholder sets unresolved; Text sample is editor guidance and omitted from print until committed. Image empty frame is explicit geometry with no fake image asset. A real decorative fallback can have placeholder type and `placeholder=false`; it renders normally. Successful text commit clears placeholder type/hint and unresolved flag; successful image Replace clears guidance/type/unresolved while preserving frame/mask/rotation/opacity, calculating new source crop with existing Replace logic. Failed Replace keeps unresolved. Undo restores metadata as part of same semantic action. No perpetual guidance.

Unresolved optional placeholder: warning, no printed sample/hint/border/empty icon. Valid geometry still required. Locked placeholder blocks template publish. Image with nonempty invalid/missing source is missing asset, not optional empty exception. QR/barcode/shapes remain normal real artwork, not image-placeholder fallback.

Customer preview: deep clone Draft on entry, customer permissions, isolated history/selection/font resolution, local ephemeral uploads only, all product previews/Preflight available, no admin metadata controls. Unmount revokes temporary URLs and leaves Draft hash, guest session/recent projects and cloud writes unchanged.

## 8. Validation, publish and lifecycle transactions

`getTemplateAvailability` is central domain contract; SQL set-based equivalent drives pagination/clone under transaction. Shared fixtures assert parity, rather than loading all documents in browser. Blockers: TEMPLATE_ARCHIVED, NO_PUBLISHED_VERSION, ARCHIVED_DEPENDENCY, UNPUBLISHED_DEPENDENCY, MISSING_DEPENDENCY, INVALID_PRODUCT_TARGET, VERSION_INVALID. Include font family AND face status, checksum and version asset manifest health. No binaries needed for list query. Metadata immutable dependency rows enable indexed EXISTS checks. Archive invalidates next browse; historical resolver ignores browse eligibility.

Validation service loads exact saved Draft, trusted target, all image references and full font/sticker dependency closure (including legacy family aliases, every surface, top-level legacy text/images). Unknown aliases block; no generic font fallback. Reuse `getPreflight` resolution/safety/fold/binding/contour checks, combine template blockers BROKEN_PLACEHOLDER, PLACEHOLDER_LOCK_CONFLICT, CUSTOMER_PREVIEW_FAILED, MISSING_THUMBNAIL plus dependency/geometry blockers. NO_EDITABLE_ELEMENTS warning. Warn acknowledgement must exactly cover current warning IDs for receipt. Stale acknowledgement/receipt rejected.

Use actual Chromium to initialize customer-preview surface with saved candidate, load exact managed fonts, verify images decoded/natural dimensions and CDP platform face match, produce all surface previews and primary thumbnail with same render core. No screenshot-only fallback font proof. Block network except approved asset origin/embedded server-validated bytes, reject external fetch/SSRF. Manual preview click is not required; automatic initialization receipt is. Receipt must contain real source/candidate hashes, engine identity and proof, not client booleans.

Publish accepts `{templateId,draftId,expectedRevision,expectedCatalogRevision,sessionId,leaseEpoch,validationId,acknowledgedWarningIds,requestId,revisionNote?}` only. SQL uses verified actor; locks Template/Draft, target rows, family/face/sticker dependency rows in deterministic order; validates lease, exact revision/hash/manifest, unexpired server receipt and target, checks dependencies still published under locks, creates next version under Template lock, associates frozen candidates, switches current pointer/status, removes active draft (operation log preserves lineage), writes one audit event/result. Same request same payload returns original result after lost response; changed payload or second different concurrent request conflicts. Editing after success explicitly creates Draft based on new current Version. Never accept client snapshot, thumbnail path, publisher, version number or version UUID.

Archive/republish/metadata mutation use catalog revision/request guards. Archive may leave active Draft; existing new-use checks reject. Republish requires current Version valid and current dependencies/target eligible under locks, does not create new Version. If blocked, create/edit Draft and publish replacement. Discard deletes active Draft after lease/revision check and records event; never-published Template remains staff-visible with no Draft until reopen. Delete only never-published Template; no cascade through versions/audit.

## 9. Customer query and clone

Safe card DTO: id, slug/name, exact target summary, category/tags, currentVersionId, thumbnail URL and relevant staff-only lifecycle/blockers in admin DTO. Limit 24/default, max 60; stable `(sort_order,id)` keyset cursor; parameterized name/tags/category search and exact target filtering in DB before LIMIT. Do not select design JSON for grid/count; no per-card dependency queries or binary loads. Admin Needs Update is published+blocked, not lifecycle column.

Browse GET is no-store initially; browser refetch on entry, filter changes, mutation completion. Immutable thumbnail caching only. No realtime catalog. Preview GET resolves full current available Version. Use POST revalidates current pointer/eligibility even if preview was cached. If expectedVersionId differs, return TEMPLATE_CHANGED and refresh preview rather than silently clone another version. If archived/blocked, `Mẫu này hiện không còn khả dụng.` and return to browser.

Guest: use endpoint returns safe deep-clone payload with only document/schema/target/provenance + opaque short-lived use receipt. No auth session/cloud Project. Client generates fresh local ID once per click/request, persists through existing max-3/30-day storage then opens editor. Keep existing projects intact under existing retention policy. `blank` remains direct blank creation. Guest receipt may authorize metadata-only template_used reporting after successful local write; telemetry failure cannot fail creation.

Authenticated: same endpoint derives account identity, locks current Template/dependencies, verifies target/pointer, creates `projects.working_document` + source IDs + clone request key atomically. One Project for retried double-tap request. Reopen uses server document/revision via existing customer context/autosave, not URL template reapplication. Existing autosave must permit archived inherited dependencies and still reject introduction of draft/private content; no no-op lookup-only guarantee.

Preserve provenance through local serialization, local-to-cloud migration, My Designs projection, checkout and immutable DesignVersion. Existing `templateId` remains backwards-compatible provenance, never a live fetch on Project reopen. In-editor Choose Template starts a NEW Project; flush/save current first and name consequence; never overwrite current customer Project silently.

## 10. Existing catalog migration / cutover

Cannot just ALTER published=true then claim availability: seeded records have wildcard targets, partial documents and null thumbnails. Do not force them to Draft or remove whole catalog while preparing.

1. Inventory union of SQL rows, static configs/aliases, runtime URL IDs and existing documents; emit deterministic manifest. Preserve all original Template IDs/slugs, existing Version UUIDs and original JSON. `blank` links become blank-start action; retain provenance identity.
2. For exact originals, retain ID. For wildcard originals, retain original ID for canonical first target (existing product/default variant and configured mode/shape); materialize additional exact targets with deterministic IDs `<legacy>--<product>--<variant>--<mode-or-none>--<shape-or-none>`. Persist read-only legacy target alias mapping, consulted only for old URL IDs plus explicit target, never as wildcard runtime browse or conversion.
3. Normalize partial legacy Version JSON deterministically in memory (schema 0) with frozen target and former template application semantics; keep original historical JSON unchanged. For current catalog, publish a complete immutable validated successor if existing v1 lacks full target/document/thumbnail; retain original v1 accessible to staff/history. New expanded identities get validated v1. Existing actual artwork has priority over static fallback. Do not overwrite already-complete production versions or customer Projects.
4. Legacy font aliases must map to verified published State 42 faces; run State 42 fixture/migration process where needed. Missing licenses/bytes are explicit migration blockers, never silent replacement fonts.
5. Prepare all documents/assets/thumbnails through real validation/publish pipeline, retain completion manifest. Development seed uses same checked input manifest and migration CLI. Re-run must not create duplicate versions/assets/events or change immutable bytes.
6. Gate cutover on every legacy runtime combination's available successor and usable thumbnail. Then final migration removes obsolete `published`/catalog thumbnail fields after all callers move, replaces broad old grants/policies, enforces exact NOT NULL targets on live identities and enables immutability protections after enrichment. Keep slugs and aliases needed for old links. No network-error static resurrection.
7. Deploy during maintenance window; if gate fails leave old catalog in place, do not partially hide it. Backup and reversible application routing before final cutover, forward-fix after new versions/customers exist; no destructive rollback of history.

## 11. UI brief (Impeccable: Operate)

Users: small Vietnamese Admin/Editor team. Primary action: find/author a Template, understand whether publish is safe, then explicit publish. Reuse incumbent stone/warm-paper shell, tokens/buttons/dialogs; artwork carries visual weight. Do not introduce bento dashboard, decorative gradients, counters or new UI library.

`/admin/content/templates`: add Mẫu thiết kế tab without marking Sticker active. Header + `+ Tạo mẫu`; views Tất cả/Bản nháp/Đã đăng/Cần cập nhật/Đã lưu trữ; name/tag search, product/variant/mode/shape/category filters; responsive artwork grid 1/2/3/4 columns as space permits, stable thumbnail ratio, name and exact target, text+icon lifecycle/blocker. Server cursor pagination. Empty state tells how to create; no-results clears filters; permission error distinct from empty; failed fetch retains existing cards with retry.

Create dialog: Tạo mới / Tạo từ thiết kế. Target selector chooses exact configuration before create; no wildcard All variant submission. Eligible Project selection shows only own eligible sources and right-to-publish acknowledgement. Draft route displays autosave status, lease holder/read-only state, product target fixed, metadata inspector and real editor. Long names/tags wrap; actions are keyboard reachable, no nested card buttons; 44px touch targets, focus-visible, accessible labels/status live regions and focus return after modal.

Layer/property panel uses lock icon plus `Khóa với khách`, text/image-specific placeholder toggle/hint. No internal field names. `Xem như khách` full-screen sandbox labeled clearly with exit, no nested active editor hotkeys. Publish review groups blockers/warnings by surface/element; `Mẫu chưa thể đăng.`; issue click focuses matching surface/element; warning acknowledgement and render/validation progress visible. Failure keeps Draft untouched. Delete modal `Xóa mẫu nháp?` explains irreversibility; published content only Archive. No forced long revision note.

Customer templates reuse listing/browser shell, cached thumbnail cards, lazy current-version preview and one `Dùng mẫu này` action. Product exact context stays visible, no automatic shape/variant swap. Mobile 390px and desktop 1440px QA; 200% zoom, keyboard, reduced motion, long Vietnamese copy and unavailable-between-browse/use state covered.

## 12. Verification and explicit exclusions

Mandatory real database scenarios: version/thumbnail immutability; v1 Project unchanged after v2; archive and dependency archive preserve history/production; dependency repair restores availability; locks through direct/bulk/history actions; placeholders resolve on edits and UI absent from output; exact compatibility; stale receipts; lease multi-tab/takeover; simultaneous publish produces one version/event; direct RLS/RPC denial; private asset access; guest retention; authenticated ownership/CAS; source privacy; migration rerun and legacy links; checkout → DesignVersion → staff review → Admin production artifacts with real rendering. Node mocks alone cannot prove SQL/RLS/concurrency.

No AI, layout generation, marketplace, customer template publication, comments/ratings, collaboration/CRDT, merge/rebase, update propagation, product conversions, nested folders, approval workflow, brand kit, customer approval portal, broad Realtime, usage dashboard or required-field schema. Documentation covers every architectural and operational boundary above. Final implementation must pass full existing/new tests and production build and provide actual browser/DB/production smoke evidence; this planning task does not claim those executions.
