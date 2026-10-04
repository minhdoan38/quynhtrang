# State 43: Admin Template Management & Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff author exact-target Templates, publish immutable versions, and customers clone available versions into independent local/cloud Projects without affecting historical work.

**Architecture:** Extend State 37 Template tables and existing catalog boundary; reuse State 39 lease/CAS mechanics, State 42 asset lifecycle/audit and current Editor/Preflight/render pipeline. One mutable Draft per Template, immutable Versions, atomic publication pointer and authoritative clone transaction. Catalog eligibility never governs already-created Projects.

**Tech Stack:** Next.js 16.3.6 App Router, React 19.3, TypeScript, Supabase PostgreSQL/RLS/Storage, existing Playwright/Chromium, sharp, node:test and node:assert. No new dependency/framework.

**Spec:** `docs/superpowers/specs/2026-10-03-state-43-admin-template-management-design.md` — final contracts override earlier chat sketches.

## Global Constraints

- Planning only in this delivery. Execute implementation only on a subsequent user request.
- A Template is a versioned starting point. Publishing changes what future customers start from, never what existing customer Projects have already become.
- DB is sole runtime template catalog. Blank design is a local editor action, not a dependency on a published `blank` record.
- Exact immutable target includes product, variant, wrapping mode, fixed sticker shape, and surface geometry signature. No nullable wildcard for new Templates.
- Editor and Admin may publish/archive; only Admin deletes never-published drafts and takes over stale leases. No live lease force takeover, no two-person approval.
- Optional placeholders only in State 43; no required flag/form schemas.
- Lease duration 120 seconds, heartbeat 30 seconds, session+epoch fencing; semantic debounce 800 ms, max wait 5000 ms.
- New private buckets `template-drafts` and `template-versions`. Customer artwork/order artifacts stay private; only committed catalog assets are delivered publicly.
- Server-only SECURITY INVOKER mutations, service_role-only EXECUTE, explicit verified actor; never trust browser receipt/snapshot/version number/owner.
- Published Version JSON, target, dependencies, images, thumbnails and provenance never change; no cascading historical deletes.
- Use `asset_events`, not a new template event log and never `order_events`. No autosave audit spam.
- No new realtime catalog, analytics platform, collaborative editor, conversion engine or generalized lock/form framework.
- Read relevant installed Next guides before coding: `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` and `page.md`; dynamic params are Promises.
- For exported-symbol changes use language-server references before editing. Existing relevant sources are listed below, but all callers must migrate.
- Nontrivial behavior needs real-path smoke evidence. Unit mocks do not establish SQL transactions/RLS, Chromium font rendering or UI behavior.
- Run tests/checks after integrated task edits, not in competing subagents. Tests below are specified future commands, not claims of execution.
- Migration staging is explicit: 0008 secures all NEW Draft/receipt/asset/mutation surfaces immediately; legacy public catalog reads remain only for inventoried pre-State43 rows until preparation completes. 0009 performs final removal of legacy public SELECT/published-boolean policies. T04 tests new-surface secrecy before cutover and final raw-table denial after 0009; do not break the old catalog before migration gate.

---

## 1. Execution map and file responsibilities

Read spec first. Repository inspection already completed; do not repeat three broad scouts. Task 1 is a focused consumer/migration inventory against the execution checkout.

| Boundary | Files |
| --- | --- |
| Existing canonical document/geometry | `src/lib/product-state.ts`, `src/lib/pattern-renderer.ts`, `src/lib/storage.ts` |
| New Template types / exact target / availability | `src/lib/domain/template.ts`, `src/lib/template-target.ts` |
| Shared schema reader | `src/lib/design-document.ts` |
| SQL / legacy migration | `supabase/migrations/0008_state43_template_management.sql`, `0009_state43_template_catalog_cutover.sql`, `scripts/state43-template-migrate.ts` |
| DB access / services | `src/lib/repositories/template-repository.ts`, `src/lib/services/template-management.ts`, `template-assets.ts`, `template-validation.ts`, `template-clone.ts` |
| Customer catalog integration | `src/lib/domain/catalog.ts`, `src/lib/repositories/catalog-repository.ts`, `src/lib/product-catalog.ts`, `src/lib/use-template-catalog.ts` |
| Shared autosave mechanics | `src/lib/draft-autosave.ts`, existing `staff-draft-autosave.ts`, new `use-template-draft-session.ts` |
| Existing editor integration | `src/lib/editor-context.ts`, `product-state.ts`, `use-design-history.ts`, `domain/design-revision.ts`, existing customizer components |
| New focused template editor controls | `src/components/customizer/template-author-controls.tsx`, `template-customer-preview.tsx` |
| Admin pages | `src/app/admin/content/templates/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx`; `src/components/admin/template-library.tsx`, `template-detail.tsx`, `template-author-client.tsx` |
| Existing rendering | `src/lib/services/document-renderer.ts`, `src/components/customizer/document-render-surface.ts`, product previews |
| Verification and operations | `src/test/template-*.test.ts`, `supabase/tests/state43_template_management.sql`, `scripts/state43-template-smoke.ts`, `state43-template-cleanup.ts` |

Route files are enumerated under tasks, not a generic action router. Thin handlers parse, authenticate, call service and project DTOs; no component direct lifecycle writes.

### Commit/dependency order

T01 inventory → T02 domain → T03 schema → T04 security → T05 persistence → T06 draft/queue.

After T02, T07 locks and T08 placeholders can progress separately from DB work. T09 author adapter depends on T06–08. T10 asset pipeline depends on T04–05. T11 validation depends on T08–10; T12 publish depends on T11. T13 lifecycle, T14 admin UI, T15 catalog, T16 guest clone, T17 cloud clone, T18 migration/cutover, T19 production regression, T20 release/docs follow dependency labels below. Same-file edits have one integration owner. Every task is reviewable/committable; no push or deployment implied.

## 2. Contracts to freeze before parallel execution

New types live in `src/lib/domain/template.ts`; implementation fills all named fields, not exported stub methods. Use camelCase in TS, snake_case in SQL.

```ts
import type { DesignState, ProductId, FixedStickerShape } from '../product-state.ts';
import type { LibraryRef } from './asset-library.ts';

export type TemplateStatus = 'draft' | 'published' | 'archived';
export interface TemplateTargetInput {
  productId: ProductId;
  variantId: string;
  mode: 'pattern' | 'full-sheet' | null;
  shape: FixedStickerShape | null;
}
export interface TemplateTarget extends TemplateTargetInput {
  surfaces: { id: 'front' | 'inside' | 'back' | 'sheet'; widthMm: number; heightMm: number }[];
  geometryKey: string;
}
export interface TemplateMutation {
  templateId: string;
  expectedCatalogRevision: number;
  requestId: string;
}
export interface TemplateDraftGuard {
  templateId: string;
  draftId: string;
  expectedRevision: number;
  sessionId: string;
  leaseEpoch: number;
}
export interface SaveTemplateDraftInput extends TemplateDraftGuard {
  requestId: string;
  document: DesignState;
}
export interface PublishTemplateInput extends TemplateDraftGuard, TemplateMutation {
  validationId: string;
  acknowledgedWarningIds: string[];
  revisionNote?: string;
}
export interface UseTemplateInput {
  templateId: string;
  expectedVersionId: string;
  target: TemplateTargetInput;
  requestId: string;
}
export interface TemplateProvenance {
  templateId: string;
  templateVersionId: string;
}
export interface TemplateVersionPayload {
  versionId: string;
  templateId: string;
  version: number;
  documentSchemaVersion: number;
  document: DesignState;
  target: TemplateTarget;
  dependencies: LibraryRef[];
}
export interface TemplateAvailability {
  available: boolean;
  blockers: { code: string; kind?: string; id?: string; message: string }[];
}
```

Also define concrete `TemplateRecord`, `TemplateDraftRecord`, `TemplateCard`, `TemplateValidationReceipt`, `TemplateAssetRecord`, `TemplatePage` from spec table/DTO fields in T02. Do not expose receipt/actor/storage internals through `TemplateVersionPayload`.

`TemplateValidationReceipt` fields used below are `id`, `templateId`, `draftId`, `sourceRevision`, `sourceDocumentHash`, `candidateDocumentHash`, `targetHash`, `leaseEpoch`, `sessionId`, `findings`, `warningIds`, `customerPreviewPassed`, `engineFingerprint`, `thumbnail: {assetId,sha256}`, `expiresAt`. `TemplatePage` contains `items: TemplateCard[]` and `nextCursor: string | null`. These are server/domain types; public DTO excludes private receipt fields.

Hash convention: source and candidate document hashes are database SHA-256 of canonical `jsonb::text` returned by repository; binary hashes are SHA-256 of exact bytes. Never compare JavaScript JSON.stringify hashes to PostgreSQL JSONB text hashes. Receipt records both source and rewritten candidate hashes; publish compares within this convention.

`TemplateRepository(client)` is concrete DB adapter. Staff/public services obtain proper Supabase client; constructor is not an auth decision. `TemplateServiceError(code,message)` maps `INVALID_INPUT` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `REVISION_CONFLICT|LEASE_CONFLICT|LEASE_LOST|TEMPLATE_CHANGED|TEMPLATE_UNAVAILABLE|IDEMPOTENCY_CONFLICT` 409, `VALIDATION_FAILED|PREFLIGHT_STALE|SOURCE_INELIGIBLE` 422, storage/engine failures 503. Logs redact documents/tokens.

### Mutation security and RPC signature convention

All privileged mutation SQL functions receive `p_actor_user_id uuid, p_request_id uuid` plus named typed fields. Only service_role may execute; DB validates staff role, or customer owner for clone. GET routes do not create drafts or acquire leases. CSRF: same-origin POST/PATCH/DELETE with JSON or multipart, reject mismatched Origin; route identity comes from verified server auth, never payload actor.

| RPC | Additional inputs / atomic output |
| --- | --- |
| `create_template` | name, exact canonical target, category ID/tags, validated initial document + schema version; Template + Draft |
| `create_template_draft` | template ID, expected catalog revision, expected base version ID; existing/new single Draft |
| `acquire_template_draft_lease` | draft ID, session ID; owner/epoch/120s expiry or read-only lease conflict |
| `heartbeat_template_draft_lease` | draft ID, session ID, epoch; expiry |
| `takeover_template_draft` | draft ID, expected revision/epoch, new session ID, reason; Admin + expired lease only |
| `save_template_draft` | full draft guard, document/schema; new revision and invalidated receipts |
| `discard_template_draft` | full guard; delete active draft only, append event |
| `patch_template_metadata` | catalog guard, name/category/tags/sort patch; increment catalog revision |
| `publish_template_draft` | PublishTemplateInput, verified actor; receipt-derived Version/pointer/event/result |
| `archive_template` / `republish_template` | catalog guard; state/event/result; republish checks dependencies |
| `duplicate_template` | source template/version or guarded draft ID, source expected revision, new generated identity; new Template/Draft |
| `delete_draft_template` | catalog guard; eligibility/operation cleanup intent/event, no historical cascade |
| `clone_template_into_project` | UseTemplateInput, verified account; new/existing owned Project + provenance |
| `resolve_template_for_use` | UseTemplateInput, nullable verified actor; validated safe current payload, no guest cloud Project |

Supporting server-only functions for receipts/asset intents/operation results are local to repository/service; no public generic SQL execution endpoint. Dependency row locks are shared with State 42 archive updates so archive cannot pass between final eligibility check and clone/publish commit. Use Template→Draft→product/variant→family→face→sticker→owned assets sorted by ID across all State 43 functions.

## 3. Task test conventions

Pure tests use existing `node:test` and `node:assert/strict`; executable TS imports use explicit `.ts` where supported. Prefer tests of transitions/authorization/errors, not source-text assertions or fixed copy assertions. Remove touched source-string/wiring tests instead of repinning them.

Create `src/test/fixtures/templates.ts` in T02 with exported `makeCardDocument()` returning this concrete minimal document; tests mutate clones, never shared globals:

```ts
import type { DesignState } from '../../lib/product-state.ts';
export function makeCardDocument(): DesignState {
  return {
    productId: 'card', variantId: 'vertical', templateId: null,
    text: '', color: '#2E3338', backgroundColor: '#FFFDF8', image: null,
    quantity: 1, productOptions: { surface: 'front' },
    elements: [{
      id: 'name', type: 'text', x: 20, y: 20, width: 60, height: 12,
      rotation: 0, locked: false, zIndex: 1, surface: 'front',
      data: { text: 'Tên của bạn', color: '#2E3338', fontFamily: 'sans-serif',
        fontSize: 20, fontWeight: 'regular', fontStyle: 'normal',
        textAlign: 'center', lineHeight: 1.4, letterSpacing: 0, placeholder: false },
    }],
  };
}
```

This pure fixture is not a font-publication receipt. Live tests replace generic face with real licensed published State 42 fixture and real ID/checksum. No mock receipt may pass live publish.

Real DB checks use disposable local Supabase only. `STATE43_ALLOW_DESTRUCTIVE_LOCAL=1` plus localhost URL required by setup/cleanup scripts; missing DB/auth/browser exits nonzero, never prints success/skip. Never reset remote production. SQL assertions run in rollback transaction; live browser/publication tests use dedicated disposable local DB with fixture IDs and normal lifecycle APIs. For concurrent independent clients use Promise.all, assert rejected result codes and persisted row/event counts.

---

## Task 1: Freeze actual consumer and legacy migration inventory

**Goal:** Account for every static/DB Template identity and affected entry point before removing runtime fallback.

**Files:** Create `scripts/fixtures/state43-legacy-templates.json`; modify this plan's inventory appendix if execution checkout differs. Read `supabase/seed.sql`, `src/lib/product-state.ts`, `src/lib/product-catalog.ts`, `src/lib/navigation.ts`, `src/lib/repositories/catalog-repository.ts`, `src/components/customizer/{template-browser,template-chooser,customizer-shell}.tsx`, `src/components/products/{product-detail-catalog-view,responsive-template-preview}.tsx`.

**Interfaces:** Produces deterministic migration manifest keyed by legacy ID and canonical target, with original slug/config/JSON and known old aliases. No runtime import of manifest.

**Schema/domain/server:** No schema change; enumerate seed UUIDs where present, actual DB IDs during migration separately. Document editor variant ID = current seeded DB ID for all eight variants; verify product pairing, not label dimensions.
**Storage / RBAC:** No access changes or production reads required; manifest contains catalog fixtures only.
**Editor / UI / validation:** Record URL `?template=`, `SET_TEMPLATE`, static title, blank-start and in-editor replacement callers. Mark generated cutlines excluded.
**Dependencies:** None; inspection already in spec.

- [ ] Use references for exported TEMPLATES/getCompatibleTemplates/TemplateConfig and list callsites in manifest notes. Include runtime-only aliases, not just 17 SQL rows.
- [ ] Serialize source fixtures deterministically without importing app UI/server secrets. Preserve original text/IDs/artwork exactly.
- [ ] Run focused throwaway integrity check; no permanent test of copied text:

```js
const assert = await import('node:assert/strict');
const fs = await import('node:fs/promises');
const manifest = JSON.parse(await fs.readFile('scripts/fixtures/state43-legacy-templates.json', 'utf8'));
assert.equal(new Set(manifest.entries.map(x => x.legacyId)).size, manifest.entries.length);
assert.ok(manifest.entries.some(x => x.legacyId === 'card-h-birthday'));
assert.ok(manifest.entries.some(x => x.legacyId === 'blank'));
assert.ok(manifest.entries.every(x => Array.isArray(x.targets) && x.targets.length > 0));
```

**Verification:** Execute snippet with `node --input-type=module` via temporary file/eval; compare manifest IDs against SQL/static inventory, report exact union count. Commit fixture/inventory only: `docs(state43): freeze template migration inventory`.

## Task 2: Domain, exact compatibility and document schema reader

**Goal:** One exact-target/domain contract; no generic geometry converter.

**Files:** Create `src/lib/domain/template.ts`, `src/lib/template-target.ts`, `src/lib/design-document.ts`, `src/test/fixtures/templates.ts`, `src/test/template-domain.test.ts`; modify `src/lib/product-state.ts` only additive document/provenance fields.

**Interfaces:** `createTemplateTarget(input:TemplateTargetInput):TemplateTarget`; `templateTargetsEqual(a,b):boolean`; `validateTemplateDocument(document,target):{code:string;elementId?:string}[]`; `readDesignDocument(raw:unknown,schemaVersion:number,target?:TemplateTarget):DesignState`; `getTemplateAvailability(template,version,dependencies):TemplateAvailability` with typed DB metadata dependency inputs. `DesignState.sourceTemplate?:TemplateProvenance`, `documentSchemaVersion?:number` optional for legacy compatibility.

**Schema/domain:** Schema 0 legacy → current schema 1 deterministic in memory; verify finite values, valid element IDs/types, group parents/cycles, product options, allowed surfaces and geometry. Unknown future schema rejected. Do not require persisted width fields that DesignState does not have.
**Server / Storage / RBAC:** Parsers at trust boundaries; no DB/storage writes this task.
**Editor / UI:** Same DesignState; no component additions.
**Dependencies:** T01.

- [ ] Add failing behavioral cases: horizontal vs vertical, pattern vs full-sheet, A1 vs A2, circle vs rectangle, multi-surface card and front-only notebook, unknown schema, nonfinite/negative frame, cross-product variant.
- [ ] Implement helper from actual geometry exports. Dimensions from product helpers are canonical; display strings in seed are not physical truth.
- [ ] Add concrete equality regression:

```ts
const circle = createTemplateTarget({productId:'sticker',variantId:'fixed-shape',mode:null,shape:'circle'});
const rectangle = createTemplateTarget({productId:'sticker',variantId:'fixed-shape',mode:null,shape:'rectangle'});
assert.equal(templateTargetsEqual(circle, rectangle), false);
const card = createTemplateTarget({productId:'card',variantId:'vertical',mode:null,shape:null});
assert.deepEqual(card.surfaces.map(s => s.id), ['front','inside','back']);
assert.throws(() => createTemplateTarget({productId:'card',variantId:'a1',mode:null,shape:null}));
```

- [ ] Availability treats missing version/invalid target/archived family separately, archived historical resolution outside this function. Document reader preserves original raw object.

**Verification:** `node --test --experimental-strip-types src/test/template-domain.test.ts`; smoke import target helper and print all supported target keys. Commit `feat(templates): define exact targets and version contracts`.

## Task 3: Additive schema, immutable history and retained events

**Goal:** Valid relational model without wiping old catalog during preparation.

**Files:** Create `supabase/migrations/0008_state43_template_management.sql`, `supabase/tests/state43_template_management.sql`; extend `src/test/template-domain.test.ts` only if SQL/TS contract requires it.

**Interfaces:** Tables in spec §4; `(template_id,id)` unique on versions supports same-template pointer/base FKs. SQL physical `version` retains existing name. Asset/events kind `template` additive, no widening LibraryKind (`sticker|font-face`).

**Schema:** Add draft/version/asset/receipt/operation/category/provenance fields, indexes and CHECKs. New templates exact by creation RPC; temporarily allow only inventoried legacy identities to retain missing target until migration. `ever_published_at` write-once. Add normalized `template_version_dependencies(version_id,kind,asset_id,checksum,family_id)` for indexed availability; snapshot remains immutable debugging record. FKs for owned asset/version joins restrictive. Categories flat, metadata edits only.
**Server:** Add trigger rejecting immutable Version/manifest mutations after backfill freeze; old published JSON untouched by default. Durable migration manifest table `template_legacy_targets(legacy_id,target_key,template_id,version_id,verified_at)` is alias mapping, not live alternate catalog.
**Storage:** Bucket creation belongs T10; schema locators constrained to owned namespaces.
**RBAC/RLS:** Enable RLS on all new tables immediately, default deny; T04 supplies grants.
**Editor/UI:** None.
**Dependencies:** T02.

- [ ] Add transactional SQL assertions that target mismatch pointer and duplicate active drafts fail.
- [ ] Alter existing tables rather than recreate; keep `slug`, old `published`/thumbnail until T18 coordinated drop; copy lifecycle before dropping anything.
- [ ] Create append-only receipt/operation-result constraints and use existing asset_events append-only semantics. No target cascade into events.
- [ ] Exercise with explicit expected SQLSTATE, not catch-all masking:

```sql
DO $$
BEGIN
  BEGIN
    UPDATE public.template_versions SET design_document = '{}'::jsonb
      WHERE id = '43000000-0000-0000-0000-000000000101';
    RAISE EXCEPTION 'immutable version write unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM <> 'IMMUTABLE_TEMPLATE_VERSION' THEN RAISE; END IF;
  END;
END $$;
```

Fixture setup inserts two Templates/Versions using migration-owner setup before switching to runtime role; ensure tested row exists first. Runtime mutation denial must not be mistaken for nonexistent row success.

**Verification:** Local only: `psql "$STATE43_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0008_state43_template_management.sql` then `psql "$STATE43_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state43_template_management.sql`. Commit `feat(templates): add draft and immutable version schema`.

## Task 4: Close direct write/read bypasses and reuse content audit

**Goal:** RLS/grants and service-only authority boundaries are proven before exposing APIs.

**Files:** Modify `supabase/migrations/0008_state43_template_management.sql`, `supabase/tests/state43_template_management.sql`, `src/lib/admin/authorization.ts` only if factoring reusable verified-identity helper is needed. Create `src/app/api/admin/content/templates/_shared.ts`, `src/test/template-authorization.test.ts`.

**Interfaces:** Shared template route helper returns verified staff + TemplateRepository; template error mapping is separate from library-specific parser. `assertTemplateOrigin(request)` handles same-origin cookie mutations. Reuse existing authorization functions, no alternate staff table.

**Schema/domain/server:** Revoke old permissive template/version management immediately; restrict temporary legacy SELECT to inventoried pre-State43 rows only, never new identities/receipts/drafts. New rows cannot inherit the old `published=true` default. Final raw public SELECT revocation occurs in 0009 after verified catalog preparation. All new mutation RPCs are service_role-only EXECUTE with fixed search_path and explicit actor lookup. Staff SELECT operational rows through RLS. Prevent direct request-scoped flag spoofing from becoming authority. Customer clone ownership uses verified actor without staff requirement.
**Storage:** Deny draft/version object access by default; T10 adds precise delivery.
**RBAC:** Editor normal management, Admin-only stale takeover/delete. Receipt/operation writes never authenticated direct.
**Editor/UI:** Return actual 401/403 rather than empty catalog.
**Dependencies:** T03; repository initialization wired in T05, helper may initially take concrete injected existing Supabase client rather than ship broken imports.

- [ ] SQL test role matrix: anon/customer raw Draft read denied; staff Draft SELECT succeeds; every direct write/receipt forgery and privileged RPC attempt denied as anon/authenticated; service with nonstaff actor rejected for management.
- [ ] Verify event survives allowed draft deletion, cannot UPDATE/DELETE audit even for normal service path.
- [ ] API test assertions after helper exists:

```ts
assert.equal(await responseStatusFor('customer', 'publish'), 403);
assert.equal(await responseStatusFor('editor', 'delete'), 403);
assert.equal(await responseStatusFor('editor', 'validate'), 200);
```

`responseStatusFor` is a local test helper invoking actual shared authorization/parser with fixture verified identities; full route/browser role smoke in T14. Do not mock success handler and count that as RBAC proof.

**Verification:** `node --test --experimental-strip-types src/test/template-authorization.test.ts` plus local SQL test command T03. Commit `fix(templates): enforce staff and immutable access boundaries`.

## Task 5: Repository, creation and safe metadata operations

**Goal:** Create Template/Draft and edit lean metadata through one service/repository path.

**Files:** Create `src/lib/repositories/template-repository.ts`, `src/lib/services/template-management.ts`, `src/app/api/admin/content/templates/route.ts`, `src/app/api/admin/content/templates/[id]/route.ts`, `src/test/template-management.test.ts`; modify `_shared.ts`, `0008_state43_template_management.sql`, `state43_template_management.sql`.

**Interfaces:** `createTemplate(actor,input)`, `createTemplateDraft(actor,mutation,expectedBaseVersionId)`, `patchTemplateMetadata(actor,mutation,patch)`; repo `getTemplate(id)`, `getDraft(templateId)`, `getVersion(id)`, `listAdminTemplates(query)`; typed DTO mappers. Metadata: trimmed name 1–120, tags max 20 × 40 chars, category known server ID, note ≤500, sort integer; document max 2 MiB/500 elements, all validation errors explicit.

**Schema/server:** Implement create/metadata/open-draft SQL with request replay/payload checks. Blank author document from target has valid structural state, no fake image. Published edit copies current immutable JSON into new mutable Draft; unique template_id catches racing open. Existing Draft returned unchanged. No side effects from GET.
**Storage:** No upload yet; accept asset-free document only until T10 owns references.
**RBAC/RLS:** Editor/Admin; creator from verified identity.
**Editor/UI:** HTTP GET detail includes safe staff metadata/current draft/versions summary, not every historical full JSON.
**Dependencies:** T04.

- [ ] Tests: incomplete Draft allowed, invalid exact target rejected; two create requests same key same identity; changed payload conflicts; metadata edit leaves published JSON/hash unchanged.
- [ ] Implement only methods needed here, add later methods in their owning tasks.
- [ ] DB transaction assertions:

```sql
-- With fixture template locked for metadata edit:
IF v_before_document IS DISTINCT FROM v_after_document THEN
  RAISE EXCEPTION 'metadata edit changed published artwork';
END IF;
IF v_new_revision <> v_old_revision + 1 THEN
  RAISE EXCEPTION 'metadata CAS did not advance once';
END IF;
```

- [ ] Smoke real POST create, GET detail, PATCH metadata as Editor; inspect new Draft revision and untouched source version.

**Verification:** `node --test --experimental-strip-types src/test/template-management.test.ts`; local SQL suite. Commit `feat(templates): create catalog identities and authoring drafts`.

## Task 6: Shared semantic save queue, lease and conflict recovery

**Goal:** Reuse State 39 concurrency, including same-user multi-tab fencing, without duplicating queue implementation.

**Files:** Create `src/lib/draft-autosave.ts`, `src/lib/use-template-draft-session.ts`, `src/test/template-draft-concurrency.test.ts`; modify `src/lib/staff-draft-autosave.ts`, `src/lib/use-staff-draft-session.ts`, `src/lib/repositories/template-repository.ts`, `src/lib/services/template-management.ts`, `0008_state43_template_management.sql`; create `src/app/api/admin/content/templates/[id]/draft/route.ts`, `draft/lease/route.ts`, `draft/heartbeat/route.ts`, `draft/takeover/route.ts`; retain `src/test/staff-draft-autosave.test.ts` behavioral checks.

**Interfaces:** Shared queue `enqueue(document)`, `flush():Promise<{revision:number}>`, `stop(message)`, `dispose()` with transport `(document,expectedRevision,requestId)` and normalized saved/conflict/error result. Staff adapter still supplies production version/session/epoch; Template adapter uses TemplateDraftGuard. `flush` rejects conflict/pending failure, not false publish-ready success.

**Schema/server:** Acquire/heartbeat/save/discard/takeover SQL from contract table; each checks current actor+session+epoch+expiry. Save source-document hash updated server-side, receipt invalidated; increment only semantic save. Idempotent retry same save request returns original revision. Stale takeover increments epoch, no active lease theft.
**Storage:** No browser cache as authority; local recovery file on conflict optional user action, not automatic Supabase merge.
**RBAC/UI:** Read-only second tab with lease holder; stale takeover Admin-only with reason. Activity status live region; dirty navigation guard.
**Editor:** Reuse history semantic commits, not drag frames. Flush on explicit validate/publish.
**Dependencies:** T05.

- [ ] Fake-timer queue tests preserve latest semantic change during in-flight save; conflict halts queue; heartbeat missed but unexpired save allowed; expired rejected.
- [ ] SQL test same user/different session denied, stale revision denied, old epoch denied after takeover.
- [ ] Run concurrent saves against real DB:

```ts
const [a,b] = await Promise.all([
  repo.saveDraft(actor,{...guard,requestId:crypto.randomUUID(),document:docA}),
  repo.saveDraft(actor,{...guard,requestId:crypto.randomUUID(),document:docB}),
]);
assert.equal([a,b].filter(x => x.ok).length, 1);
assert.equal([a,b].find(x => !x.ok)?.code, 'REVISION_CONFLICT');
```

Repository mutation methods here return `{ok,value}|{ok:false,code,message}`; services turn errors into TemplateServiceError for HTTP. Pin this result convention across remaining repo mutations.

**Verification:** `node --test --experimental-strip-types src/test/staff-draft-autosave.test.ts src/test/template-draft-concurrency.test.ts`; local two-client SQL/service smoke. Commit `feat(templates): reuse draft queue with fenced template leases`.

## Task 7: Customer lock semantics across all mutation paths

**Goal:** Locked means customer-locked, not only unclickable; staff editing and read-only rules stay intact.

**Files:** Modify `src/lib/product-state.ts`, `src/lib/domain/design-revision.ts`, `src/lib/editor-context.ts`, `src/lib/use-design-history.ts`, `src/lib/grouping.ts`, `src/lib/multi-selection.ts`, `src/lib/layers.ts`, `src/lib/use-editor-shortcuts.ts`, `src/components/customizer/design-canvas.tsx`, `selection-overlay.tsx`, `layers-sheet-content.tsx`, `customizer-shell.tsx`; create `src/test/template-locks.test.ts`.

**Interfaces:** `CanvasElement.customerLocked?:boolean`; shared `EditorMutationMode` extends existing review modes with guest/customer/template-author/template-preview; extend existing `canMutateElement`, no second permission engine. Add action `{type:'SET_CUSTOMER_LOCK',id,customerLocked}` staff-author/edit only.

**Schema/server/storage:** Additive JSON field survives sanitization/clone; no server privilege granted by mode string.
**Editor/domain:** Guard target sets before all transforms/style/text/image operations, group and bulk, reorder, SET_ELEMENTS, metadata update and undo/redo/reset entry points. Group mutation containing protected descendants rejected atomically. No hierarchy metadata needed; walk existing parentGroupId relation. Customer cannot unset customerLocked. Existing editor lock retains customer unlock action.
**UI:** Lock icon plus accessible label, no handles/selection for locked customer artwork; staff sees/selects it. Staff review/read-only remains immutable.
**Dependencies:** T02; integrate author context fully in T09.

- [ ] Add test now demonstrating bypass via UPDATE_ELEMENT/bulk delete, not only movement.
- [ ] Minimal test pattern:

```ts
const doc = makeCardDocument();
doc.elements![0].customerLocked = true;
assert.deepEqual(transitionState(doc,{type:'UPDATE_ELEMENT',id:'name',patch:{x:90}},'guest'),doc);
assert.deepEqual(transitionState(doc,{type:'DELETE_ELEMENTS',ids:['name']},'template-preview'),doc);
assert.equal(transitionState(doc,{type:'MOVE_ELEMENT',id:'name',x:25,y:20},'template-author').elements![0].x,25);
assert.deepEqual(transitionState(doc,{type:'MOVE_ELEMENT',id:'name',x:25,y:20},'review'),doc);
```

- [ ] Cover locked child in selected group, reorder, ordinary locked vs customerLocked, history reset from preview, multi-surface lock and staff-edit bypass.

**Verification:** `node --test --experimental-strip-types src/test/template-locks.test.ts src/test/design-revision-domain.test.ts src/test/grouping.test.ts src/test/use-design-history.test.ts`; actual keyboard/pointer smoke in T09. Commit `feat(editor): enforce customer locks across mutation paths`.

## Task 8: Minimal placeholders and print-safe resolution

**Goal:** Text/Image guidance uses existing canvas editing and never leaks UI into physical output.

**Files:** Modify `src/lib/product-state.ts`, `src/lib/image-replacement.ts`, `src/components/customizer/design-canvas.tsx`, `document-render-surface.ts`, `text-edit-overlay.tsx`, `editor-sheets.tsx`, `preview/card-preview.tsx`, `preview/wrapping-preview.tsx`, `preview/sticker-preview.tsx`, `preview/notebook-preview.tsx`; create `src/test/template-placeholders.test.ts`.

**Interfaces:** Typed additive placeholderType/hint in TextElementData/ImageObjectData; existing placeholder:boolean unresolved. Add staff action to set type/hint with type compatibility check; no required flag.

**Schema/server/storage:** Valid empty frame has no bogus asset. Uploaded decorative fallback has normal owned asset, placeholder false. Image with source that cannot resolve is never treated as optional empty.
**Domain/editor:** Successful COMMIT_TEXT_EDIT clears guidance/type/unresolved; Replace clears guidance/unresolved and reuses existing calculateCoverCrop; frame/mask/rotation/opacity remain. Undo restores state. Empty optional placeholder warning in getPreflight; type/frame errors and locked conflict in template validator T11.
**UI:** Inline text hint, image `Thay ảnh`; no external form. Editor chrome outside rendered artwork; all product preview surfaces use same unresolved policy.
**RBAC:** Author metadata controls staff only, customer content edit follows lock guard.
**Dependencies:** T07.

- [ ] Test exact geometry preservation and successful/failed replacement transition, text guidance cleared, unresolved print omission.

```ts
const doc = makeCardDocument();
Object.assign(doc.elements![0].data!,{placeholder:true,placeholderType:'text',placeholderHint:'Nhập tên'});
const changed = transitionState(doc,{type:'COMMIT_TEXT_EDIT',id:'name',text:'Lan'},'guest');
assert.equal(changed.elements![0].data!.text,'Lan');
assert.equal(changed.elements![0].data!.placeholder,false);
assert.ok(!changed.elements![0].data!.placeholderType || changed.elements![0].data!.placeholderType === 'none');
```

- [ ] Render actual PNG before/after placeholder edit and inspect pixels/canvas for real text vs guidance; HTML substring absence alone is insufficient output proof.

**Verification:** `node --test --experimental-strip-types src/test/template-placeholders.test.ts src/test/image-replacement.test.ts src/test/preflight-model.test.ts`; Chromium render smoke using document-renderer. Commit `feat(editor): add print-safe template placeholders`.

## Task 9: Template Author adapter and isolated Customer Preview

**Goal:** One existing editor surface for authoring and true customer-mode sandbox.

**Files:** Modify `src/lib/editor-context.ts`, `src/components/customizer/customizer-shell.tsx`, `editor-sheets.tsx`, `layers-sheet-content.tsx`; create `src/components/customizer/template-author-controls.tsx`, `template-customer-preview.tsx`, `src/components/admin/template-author-client.tsx`, `src/app/admin/content/templates/[id]/edit/page.tsx`, `src/test/template-preview-isolation.test.ts`.

**Interfaces:** `TemplateEditorContext` carries initialDocument/readOnly/draft guard, onSave, onUploadAsset, onExit, onValidate/onPublish. `TemplatePreviewContext {type:'template-preview'; initialDocument; onExit}` never implies guest persistence. Context capability derivation is one function used by shell effects/toolbars.

**Schema/server:** Draft page staff auth; fetch existing, POST open/acquire instead of GET mutation. T10 supplies owned upload callback; unsupported upload must not silently go through guest route.
**Storage:** Preview permits disposable in-memory image blobs only; revokes on unmount. No sessionStorage/localStorage/Project autosave/analytics order writes. Author stores only server Draft.
**Editor/UI:** Fixed target, author lock/placeholder controls, multi-surface card, save/read-only status; no checkout/price/quantity. Preview full-screen with clear exit, own history, author shell inert to shortcuts while open.
**Validation:** Automatic customer initialization uses this same adapter later, not another simplified mock canvas.
**RBAC:** Mode comes from trusted route/session, never query flag bypassing staff auth.
**Dependencies:** T06,T07,T08.

- [ ] Add isolation regression using browser storage/network observation around preview session; fixture draft hash before and after equal.
- [ ] Browser scenario: snapshot guest storage, open preview, edit text/replace image/undo/preview, close; assert Draft hash unchanged and no persistence requests. Locked element unchanged, editable text changed inside sandbox.

```ts
const before = await page.evaluate(() => ({local:{...localStorage},session:{...sessionStorage}}));
await page.getByRole('button',{name:'Xem như khách'}).click();
await page.getByRole('button',{name:'Đóng chế độ xem như khách'}).click();
assert.deepEqual(await page.evaluate(() => ({local:{...localStorage},session:{...sessionStorage}})),before);
```

Full text/image interactions belong smoke scenarios, not just open/close assertion. Use real existing canvas helpers for selection.

**Verification:** `node --test --experimental-strip-types src/test/template-preview-isolation.test.ts`; launch `pnpm dev`, browser desktop/mobile inspection of author + preview. Commit `feat(templates): reuse editor for authoring and customer sandbox`.

## Task 10: Template-owned images, source design cloning and safe delivery

**Goal:** Persistent staff-uploaded imagery without exposing customer private assets or requiring every image to become a Sticker.

**Files:** Create `src/lib/services/template-assets.ts`, `src/app/api/admin/content/templates/[id]/assets/route.ts`, `src/app/api/admin/content/templates/[id]/assets/[assetId]/route.ts`, `src/app/api/templates/assets/[assetId]/route.ts`, `src/app/api/admin/content/templates/sources/route.ts`, `src/app/api/admin/content/templates/from-project/route.ts`, `scripts/state43-template-cleanup.ts`, `src/test/template-assets.test.ts`; modify `template-management.ts`, `template-repository.ts`, `0008_state43_template_management.sql`, `src/lib/asset-store.ts`.

**Interfaces:** `uploadTemplateAsset(actor,guard,file)`, `prepareTemplateVersionAssets(actor,guard,operationId)`, `resolveTemplateAsset(assetId,access)`, `createTemplateFromProject(actor,{sourceProjectId,expectedSourceRevision,target,name,rightsAcknowledged,requestId})`; returns canonical locators and hydrated view URLs separately.

**Schema/storage:** Private buckets/strict MIME limits from spec. Asset/upload operation states pending/uploaded/attached/cleanup_pending/cleaned; version associations restrictive. Public endpoint serves only committed immutable version assets; private draft endpoint verified staff and template match, `Cache-Control: private,no-store`. Public response `nosniff`, immutable ETag; no upload public keys/overwrite. Real object existence/checksum verified before attach.
**Server/domain:** Snapshot source Project at expected revision under ownership check; only staff-owned no-linked-order source. Copy verified originals/current derivatives to new draft ownership, not browser URLs. New Template ID server-generated, source document untouched. Crop/remove background derivatives traverse upload callback.
**RBAC:** Editor upload/create-source; Admin cleanup apply/delete. Service-secret kept server-only.
**Editor/UI:** Source picker queries own eligible Projects and explicit rights checkbox; actionable blocked reason. Raw customer asset references rejected at publish even if staff can inspect them.
**Validation/tests:** Cross-template/private-customer asset substitution, forged path traversal/MIME, over-limit image, failed Storage copy, asset reference deletion race, immutable historical access after archive.
**Dependencies:** T05,T09.

- [ ] Add owned-asset manifest extractor covering top-level image and element original/current/derived/mask slots; no arbitrary network fetch.
- [ ] Use existing sharp and hash checks, rewrite only canonical references after successful upload.
- [ ] Test cleanup reference logic:

```ts
assert.equal(canCollectTemplateAsset({everPublished:true,referenced:false,pendingOperation:false,ageHours:48}),false);
assert.equal(canCollectTemplateAsset({everPublished:false,referenced:true,pendingOperation:false,ageHours:48}),false);
assert.equal(canCollectTemplateAsset({everPublished:false,referenced:false,pendingOperation:false,ageHours:25}),true);
```

Define `canCollectTemplateAsset` in template-assets.ts and repeat authoritative reference check inside cleanup transaction; pure predicate alone is not race protection.

- [ ] Live smoke: unauthenticated fetch draft returns 404/403, published manifest asset decodes, source Project unchanged, cleanup dry-run deletes nothing.

**Verification:** `node --test --experimental-strip-types src/test/template-assets.test.ts`; `node --experimental-strip-types scripts/state43-template-cleanup.ts --dry-run`. Commit `feat(templates): persist owned draft images and safe version assets`.

## Task 11: Dependency availability, real validation receipts and thumbnails

**Goal:** Publish evidence proves exact saved Draft works with real customer renderer/resources.

**Files:** Create `src/lib/services/template-validation.ts`, `src/app/api/admin/content/templates/[id]/validate/route.ts`, `src/app/internal/template-preview/[validationId]/page.tsx`, `src/test/template-validation.test.ts`; modify `src/lib/services/library-dependencies.ts`, `library-render-probe.ts` (extract only reusable CDP face check), `document-renderer.ts`, `src/components/customizer/document-render-surface.ts`, `template-repository.ts`, `0008_state43_template_management.sql`; extend `src/test/document-renderer.test.ts`.

**Interfaces:** `validateTemplateDraft(actor,guard):Promise<TemplateValidationReceipt>`; `resolveTemplateDependencies(document,{purpose:'new-use'|'historical'})`; central `getTemplateAvailability`. Repository batch dependency lookup includes font families, faces, stickers and owned manifest, not binaries per card. SQL `get_template_availability(template_id)` returns same blocker semantics.

**Schema/server:** Receipt stored server-only keyed by source revision/hash, schema/target/hash, lease epoch/session, candidate hash, dependencies, warnings, thumbnail and successful customer proof; TTL 10m. Separate `getPreflight` findings from template-specific checks, combine for publish. Never call no-lookup validateNoDraftDependencies as validation proof.
**Storage/render:** Freeze candidate images first; build real @font-face rules from immutable self-hosted faces, await loaded faces and CDP match, validate image decode/naturalWidth; deny external render network. Render all card surfaces, actual wrapping pattern sheet, physical sticker silhouette, notebook front. Use sharp 640px WebP primary; store private candidate thumbnail before receipt. Source/candidate transformations deterministic and recorded.
**Editor/UI:** Automated browser initialization opens signed short-lived internal preview receipt route loading server-saved document, not JSON/token secret in URL; same TemplatePreviewContext. No default hardcoded render secret fallback in new route. Initialization proof includes successful actual editor mount/resources; fixture smoke additionally exercises text/replace/lock/product preview.
**RBAC:** Editor can validate catalog artwork; no grant for order production artifact generation.
**Dependencies:** T09,T10.

- [ ] Test missing/draft/archived face + archived family, unknown alias/checksum mismatch, private asset leakage, missing thumbnail, invalid target/frame/lock conflict, no-editable warning.
- [ ] Tests run standard Preflight blockers/warnings on all surfaces; revision change makes receipt stale. Same warning code on multiple elements gets stable distinct warning IDs.
- [ ] Chromium check must fail unavailable real face or broken image rather than fallback PNG success:

```ts
await assert.rejects(() => validateTemplateDraft(actor,guardWithMissingFace),
  (e: unknown) => e instanceof Error && e.message.includes('MISSING_DEPENDENCY'));
const receipt = await validateTemplateDraft(actor,validGuard);
assert.equal(receipt.sourceRevision,validGuard.expectedRevision);
assert.equal(receipt.customerPreviewPassed,true);
assert.match(receipt.engineFingerprint,/chromium-/);
assert.match(receipt.thumbnail.sha256,/^[a-f0-9]{64}$/);
```

- [ ] Archive current dependency after receipt, show availability blocked without mutating Version. SQL/TS parity fixtures cover every blocker, including invalid Version manifest.

**Verification:** `node --test --experimental-strip-types src/test/template-validation.test.ts src/test/document-renderer.test.ts`; real validation POST + inspect generated customer/thumbnail output. Commit `feat(templates): validate exact drafts with real render receipts`.

## Task 12: Atomic publish with idempotency and immutable history

**Goal:** One authoritative transaction publishes one frozen Version and pointer/event transition.

**Files:** Modify `0008_state43_template_management.sql`, `state43_template_management.sql`, `template-management.ts`, `template-repository.ts`; create `src/app/api/admin/content/templates/[id]/publish/route.ts`, `src/test/template-publish.test.ts`.

**Interfaces:** `publishTemplate(actor,input:PublishTemplateInput):Promise<TemplateVersionPayload>`; service orchestrates prepared candidate/receipt, repository RPC commits only immutable receipt-bound values. Accept no browser preflight/thumbnail/document snapshot.

**Schema/domain/server:** Lock ordering per contract; verify receipt source hash equals exact saved source, candidate hash/manifest verified, actor session/epoch, catalog revision, ack set, source target active, every managed family/face/sticker still published under row locks. Allocate version number under Template lock + unique constraint. Insert Version/dependency/asset rows, pointer/status/everPublished, remove active Draft, audit/result atomic. Same operation replay returns original Version even if Draft gone. A different request racing stale Draft must fail.
**Storage:** Private candidates prepared outside transaction, only committed manifest makes them resolvable. Failure does not leave public Draft bytes or incorrect pointer; cleanup intent survives.
**RBAC/UI/editor:** Editor/Admin explicit publish; queue flush then validation, confirmation with warnings; error preserves Draft. Customer continues seeing old pointer until commit.
**Dependencies:** T11.

- [ ] Add stale revision/hash/receipt/ack/epoch and tampered input rejection tests.
- [ ] Live race and history assertion:

```ts
const before = await repo.getVersion(v1.versionId);
const results = await Promise.allSettled([
  publishTemplate(actor,{...input,requestId:crypto.randomUUID()}),
  publishTemplate(actor,{...input,requestId:crypto.randomUUID()}),
]);
assert.equal(results.filter(r => r.status === 'fulfilled').length,1);
assert.deepEqual(await repo.getVersion(v1.versionId),before);
assert.equal(await countPublishEventsForDraft(input.draftId),1);
```

`countPublishEventsForDraft` is live fixture query on asset_events metadata draft ID. Verify bytes/hashes for v1 thumbnail too, not just row equality.

- [ ] Lost HTTP response retry same request yields identical Version ID, no second event. Archive dependency racing commit serializes; result is either publish before archive then blocked, or publish denied, never new-use after archived linearization point.

**Verification:** `node --test --experimental-strip-types src/test/template-publish.test.ts`; real DB concurrency and public-thumbnail smoke. Commit `feat(templates): publish immutable versions atomically`.

## Task 13: Archive, reactivate, duplicate, discard and eligible deletion

**Goal:** Complete lifecycle without modifying historical content or leaking mutable shared assets.

**Files:** Create `src/app/api/admin/content/templates/[id]/archive/route.ts`, `republish/route.ts`, `duplicate/route.ts`, `draft/discard/route.ts`, `src/test/template-lifecycle.test.ts`; modify `[id]/route.ts` DELETE, `template-management.ts`, `template-repository.ts`, `0008_state43_template_management.sql`, `src/lib/repositories/asset-library-repository.ts`.

**Interfaces:** `archiveTemplate`, `republishTemplate`, `duplicateTemplate`, `discardTemplateDraft`, `deleteDraftTemplate` per RPC table, same catalog/draft/request guards.

**Schema/domain/server:** Archive only hides future browse/use. Republish existing pointer only if dependencies/target currently valid; no new version. Duplicate selected immutable version or guarded never-published draft, fixed target/name suffix/new identity, copy private assets, share only immutable owned bytes. Discard removes active Draft and records event. Admin delete only never published/no versions/no retention/pending publish, audit retained.
**Storage:** Delayed reference-aware private cleanup; immutable published assets preserved. Extend State 42 library_prepare_delete + repository usage check to template_drafts/design JSON and normalized version dependencies, locking references for delete race.
**RBAC/editor/UI:** Editor lifecycle except delete/takeover; confirm deletion and archive consequences. No Create Template from Order action.
**Validation/tests:** Restore with archived font family rejected, duplicate edits leave original unchanged, published Template deletion rejected even after archive/current pointer corruption attempt; draft deletion cannot remove referenced Sticker/font/owned image.
**Dependencies:** T12.

- [ ] Assert archive does not change historical document/hash or cloned Project. Repair dependency via new Draft/new publish makes browse available again.
- [ ] Assert exact duplicate target equality and new independent Draft:

```ts
assert.notEqual(copy.id,original.id);
assert.deepEqual(copy.target,original.target);
assert.equal(copy.status,'draft');
assert.equal(copy.currentPublishedVersionId,null);
assert.deepEqual(await repo.getVersion(originalVersion.versionId),originalVersion);
```

**Verification:** `node --test --experimental-strip-types src/test/template-lifecycle.test.ts src/test/asset-library-repository.test.ts`; SQL role/lifecycle tests; real lifecycle smoke. Commit `feat(templates): complete historical-safe lifecycle actions`.

## Task 14: Admin visual library, detail and publish UX

**Goal:** Staff complete create→author→validate→publish→revise without raw database tooling.

**Files:** Create `src/app/admin/content/templates/page.tsx`, `[id]/page.tsx`, `src/components/admin/template-library.tsx`, `template-detail.tsx`; modify `src/components/admin/template-author-client.tsx`, `src/components/customizer/template-author-controls.tsx`, `src/app/admin/content/layout.tsx`; add UI scenarios to `scripts/state43-template-smoke.ts` (created here, extended later).

**Interfaces:** listAdminTemplates cursor query/filter; detail current Version/draft/read-only owner/receipt summaries; mutations call API contracts, revalidate/refetch after success. Optional usage indicator only from existing provenance query, no exact live counter requirement.

**Schema/server:** Query server-backed categories, search name/tags parameterized, lifecycle + derived Needs Update before LIMIT. No JSONB documents in grid select. Routes verify staff independently of layout/proxy.
**Storage:** Draft thumbnail private staff URL; published thumbnail immutable public endpoint; no raw uploads outside T10.
**Editor/UI:** Spec §11 layout/copy/empty/loading/error/long-name/mobile/a11y. Create methods both present, exact target fixed after create. Detail metadata separate from versioned design; versions visible read-only; issue focus navigates correct card surface. Warning acknowledgement resets after edit/revalidation. Publish disabled while dirty/saving/conflicted/blocked, never hidden reason.
**RBAC:** Read-only second editor cannot type/submit; Admin stale takeover clear consequence/reason. Editor publish intentional.
**Validation/tests:** Do not add source-markup/copy tests. Browser real scenario for create both methods, source private list denial, locks/placeholders, long text, preview, validate and publish.
**Dependencies:** T09–13.

- [ ] Read installed Impeccable craft-floor before UI edits, preserve current tokens/Operate identity and existing components; do not create brand redesign docs.
- [ ] Build all states in one pass; keyboard/focus/aria status and busy errors included.
- [ ] Browser assertions:

```ts
await page.getByRole('button',{name:'+ Tạo mẫu'}).click();
await page.getByRole('button',{name:'Tạo mới',exact:true}).click();
await page.getByLabel('Tên mẫu').fill('Thiệp lớp học');
await page.getByLabel('Sản phẩm').selectOption('card');
await page.getByLabel('Biến thể').selectOption('vertical');
await page.getByRole('button',{name:'Tạo bản nháp'}).click();
await page.getByRole('button',{name:'Xem như khách'}).waitFor();
```

If existing component is non-native select, use actual accessible listbox helpers rather than inventing test-only controls.

- [ ] Inspect screenshots at 390×844 and 1440×1000, keyboard-only, 200% zoom; batch fixes then one confirmation pass. Smoke script exits nonzero on missing actor/DB.

**Verification:** `pnpm dev`; `node --experimental-strip-types scripts/state43-template-smoke.ts --scenario admin`; save screenshots outside committed source artifacts, record paths. Commit `feat(admin): add visual template management workflow`.

## Task 15: Available-only catalog and current-version preview

**Goal:** Customer list uses DB metadata and exact context; archived dependency cannot reappear via static fallback.

**Files:** Modify `src/lib/domain/catalog.ts`, `src/lib/repositories/catalog-repository.ts`, `src/lib/product-catalog.ts`, `src/components/customizer/template-browser.tsx`, `template-chooser.tsx`, `src/components/products/product-detail-catalog-view.tsx`, `responsive-template-preview.tsx`; create `src/lib/use-template-catalog.ts`, `src/app/api/templates/route.ts`, `src/app/api/templates/[id]/route.ts`, `src/app/api/templates/versions/[versionId]/route.ts`, `src/test/template-catalog.test.ts`; modify `src/test/catalog-repository.test.ts`, `product-catalog.test.ts` and SQL availability query.

**Interfaces:** `browseAvailableTemplates({target,categoryId?,query?,cursor?,limit?}):Promise<TemplatePage>`; `resolveTemplateVersionById(versionId,access):Promise<TemplateVersionPayload>`; static TemplateConfig never crosses browser boundary. CatalogRepository delegates to concrete TemplateRepository rather than independent query/filter logic. Hook cancels stale requests.

**Schema/server:** SQL exact target + status + current Version + dependency/target eligibility BEFORE cursor LIMIT; stable sort_order/id. All-target product browsing may show separate exact cards with visible target, but Use always submits selected card exact target. Preview full JSON only on intent; historical version endpoint owner/staff provenance check.
**Storage:** Card thumbnail only, no font/sticker binary fetch until preview/use. No-store catalog and re-fetch after publish/archive/filter; immutable images cache forever by ID/hash.
**RBAC:** Public safe DTO via API, no raw staff tables; no guest sign-in.
**Editor/UI:** Existing search/category/product listing foundation, error distinct from empty, blank creation retained outside template list.
**Validation/tests:** Configured DB failure yields error, not fallback; no browser wildcard geometry match; archival family status gates faces; server filtering before pagination prevents short inaccurate pages.
**Dependencies:** T12,T13.

- [ ] SQL/TS parity check and multi-page metadata query asserts no full document fetched.
- [ ] Case test:

```ts
const first = await catalog.browseAvailableTemplates({target:circleTarget,limit:1});
assert.equal(first.items[0].target.shape,'circle');
assert.ok(first.items.every(x => !('document' in x)));
await archiveReferencedSticker();
assert.equal((await catalog.browseAvailableTemplates({target:circleTarget})).items.some(x => x.id===templateId),false);
```

Helpers here belong real local fixture harness; unit query mocks may test paging errors but cannot prove SQL filtering.

**Verification:** `node --test --experimental-strip-types src/test/template-catalog.test.ts src/test/catalog-repository.test.ts src/test/product-catalog.test.ts`; browser inspect network grid contains no documents/resource binaries. Commit `feat(catalog): browse exact available published templates`.

## Task 16: Guest clone and legacy URL entry without project overwrite

**Goal:** `Dùng mẫu này` creates a new independent local Project with locks/provenance and existing retention.

**Files:** Create `src/lib/services/template-clone.ts`, `src/app/api/templates/[id]/use/route.ts`, `src/test/template-guest-clone.test.ts`; modify `src/components/customizer/customizer-shell.tsx`, `template-browser.tsx`, `template-chooser.tsx`, `src/lib/product-state.ts`, `src/lib/storage.ts`, `src/lib/navigation.ts`, `src/app/page.tsx`, `src/test/guest-storage-lifecycle.test.ts`, `storage-retention.test.ts`.

**Interfaces:** `cloneTemplateIntoProject(actor|null,input:UseTemplateInput)` returns guest `{kind:'guest',payload,useReceipt}` or cloud result T17. Client `createGuestProjectFromTemplate(payload,requestId)` allocates local ID once, structuredClone document, sets templateId/sourceTemplate; existing RecentProject carries sourceTemplate/documentSchemaVersion.

**Schema/server:** Use RPC locks/checks current pointer and dependencies. Stale expected version returns TEMPLATE_CHANGED; archive returns TEMPLATE_UNAVAILABLE. Signed use receipt contains only version/request/expiry, not staff metadata/content; metadata usage report dedup/best-effort.
**Storage:** Existing max3/30-day retention. Persist fresh clone before navigating, no silent old-project overwrite; storage failure surfaces error and leaves original work. Existing recent Project reopen never resolves Template again.
**RBAC:** No auth sign-in/cloud row for guest; cannot supply arbitrary JSON as trusted template source.
**Editor/UI:** In-editor Choose Template starts new Project after saving current; no SET_TEMPLATE static apply. Old URL template IDs resolve legacy target mapping; `blank` direct blank start. Missing/unavailable returns browser with given Vietnamese copy.
**Validation/tests:** Deep independence, metadata preserved, double tap one local ID, guest quota/retention boundary, snapshot old project unchanged, cloud network absence.
**Dependencies:** T15,T07,T08.

- [ ] Regression using actual payload clone:

```ts
const source = structuredClone(payload.document);
const project = createGuestProjectFromTemplate(payload,crypto.randomUUID());
project.document.elements![0].data!.text = 'Khách sửa';
assert.deepEqual(payload.document,source);
assert.equal(project.document.sourceTemplate?.templateVersionId,payload.versionId);
assert.equal(project.document.elements![0].customerLocked,source.elements![0].customerLocked);
```

- [ ] Open guest in real browser, use once, edit, reload local Project after publish v2 and Template archive; unchanged customer edit, no background template fetch.

**Verification:** `node --test --experimental-strip-types src/test/template-guest-clone.test.ts src/test/guest-storage-lifecycle.test.ts src/test/storage-retention.test.ts`; extend smoke `--scenario guest`. Commit `feat(templates): clone published versions into guest projects`.

## Task 17: Authenticated clone, migration and authoritative account autosave

**Goal:** Account receives one cloud Project from trusted current Version, preserved on reopen and later template changes.

**Files:** Modify `src/lib/services/template-clone.ts`, `template-repository.ts`, `src/lib/repositories/project-repository.ts`, `src/lib/services/local-project-migration.ts`, `cloud-project-autosave.ts`, `src/app/my-designs/page.tsx`, `src/components/customer/my-designs-list.tsx`, `src/app/api/templates/[id]/use/route.ts`, `0008_state43_template_management.sql`; create `src/test/template-cloud-clone.test.ts`; update existing local-project/cloud-autosave tests by behavior, not forwarding assertions.

**Interfaces:** `clone_template_into_project` transaction creates working_document revision1, trusted owner/provenance, unique owner/request. Returns `{kind:'cloud',projectId,revision,document}`; existing CustomerEditorContext receives it. New document reader replaces lossy manual projections.

**Schema/domain/server:** Provenance immutable as initial source, no automatic template sync. Project mutation RPC protects owner/source metadata. Local-to-cloud migration preserves source IDs only after server verifies referenced published provenance; legacy unknown templateId remains optional string provenance without forced FK guess. Autosave accepts inherited archived published dependencies, rejects newly introduced draft/private IDs using actual DB metadata; unrelated account persistence redesign excluded.
**Storage:** Template immutable public catalog assets need no customer-public copy; new customer uploads remain private. Canonical server Project, local cache/recovery only.
**RBAC/UI:** Verified current user owner; cannot create for another account or forge source version with arbitrary document. Existing My Designs open/login navigation reused.
**Validation/tests:** Double-request one row, stale account revision rejected, v1 cloned content/edited working_document unchanged after v2/archive, local migration retains locks and provenance, guessed other account Project denied.
**Dependencies:** T16,T06.

- [ ] Mandatory isolation regression live DB:

```ts
const project = await cloneTemplateIntoProject(customer,useV1);
await saveCustomerProjectRevision(project.projectId,1,editedDocument,customerClient);
const saved = await readOwnedProject(customerClient,project.projectId);
await publishTemplate(editor,publishV2);
assert.deepEqual(await readOwnedProject(customerClient,project.projectId),saved);
```

`readOwnedProject` local fixture helper selects exact persisted row; exclude nothing unless trigger legitimately changes unrelated field (publish must not touch Project at all).

- [ ] Replay authenticated use request after template current version changes returns original Project for same completed request; new request with old expectedVersionId conflicts.

**Verification:** `node --test --experimental-strip-types src/test/template-cloud-clone.test.ts src/test/cloud-project-autosave.test.ts src/test/local-project-migration.test.ts`; smoke `--scenario account`. Commit `feat(templates): clone immutable versions into account projects`.

## Task 18: Reproducible legacy migration and clean runtime cutover

**Goal:** Preserve old IDs/links/projects while every discoverable Template becomes exact, validated and thumbnail-backed.

**Files:** Create `scripts/state43-template-migrate.ts`, `supabase/migrations/0009_state43_template_catalog_cutover.sql`, `src/test/template-migration.test.ts`; modify `scripts/fixtures/state43-legacy-templates.json`, `supabase/seed.sql`, `src/lib/product-state.ts`, `src/lib/product-catalog.ts`, `src/lib/repositories/catalog-repository.ts`, `src/lib/domain/catalog.ts`, `src/test/card-templates-order.test.ts`, `src/test/product-state.test.ts`, `src/test/catalog-repository.test.ts`.

**Interfaces:** CLI `--inventory`, `--prepare`, `--verify`, `--seed`; `--prepare` explicitly creates validated successors using normal services, never editing historical v1 JSON. Manifest maps legacy identity + exact target to real immutable version. `--verify` checks full legacy context coverage and real bytes/render evidence.

**Schema/server:** 0008 additive stage retains legacy access while preparing; 0009 gate refuses if preexisting legacy catalog has unmapped/unverified target combinations. Fresh empty catalog may pass schema cutover, then developer seed CLI publishes checked fixture catalog. Seed SQL after cutover no longer inserts published partial JSON; seed base products/categories/library metadata and CLI imports real templates. IDs/slugs preserved; wildcard originals retain canonical target, deterministic expanded IDs serve additional targets. Existing complete versions untouched; incomplete legacy v1 retained schema0 historical, current validated successor gets next number.
**Storage:** Actual thumbnails/fonts/resources required, no fabricated hashes or renaming null thumbnail to valid. Fail migration if real library bytes/licenses unavailable; keep old catalog and report exact prerequisite. Rerun same input reuses existing completed operation/version, never overwrites immutable assets.
**RBAC:** CLI explicit service credentials server environment, no frontend fixture import; production backup/maintenance approval before migration application.
**Editor/UI:** Remove runtime TEMPLATES/TemplateConfig/getCompatibleTemplates static consumers and obsolete SET_TEMPLATE action once references migrated. Preserve templateId provenance reading and legacy link alias resolver; not a fallback catalog. Blank remains native action.
**Validation/tests:** Seed/static union coverage (not fixed guessed 17), wildcard exact mapping, UUID/version identity preservation, original Project hashes unchanged, alias URL opens exact successor, rerun no duplicate events/versions.
**Dependencies:** T12–17.

- [ ] Define canonical mapping order: products in PRODUCTS declaration order, variant order within product; configured template mode first, otherwise product default; configured fixed shape or existing default. Preserve valid explicitly authored exact targets. Enumerate only legacy-compatible combinations, not all theoretical conversions.
- [ ] Migration test:

```ts
await migrateTemplates({mode:'prepare',manifest,client});
const first = await snapshotTemplateMigration(client);
await migrateTemplates({mode:'prepare',manifest,client});
assert.deepEqual(await snapshotTemplateMigration(client),first);
assert.deepEqual(await snapshotExistingProjects(client),projectsBefore);
assert.deepEqual(await snapshotLegacyVersionJson(client),legacyVersionsBefore);
```

These helper functions are defined in migration test fixture and read deterministic sorted rows/checksums; do not ignore duplicate audit rows.

- [ ] Add 0009 SQL assertion validating mapping completion before constraints/grants/drop boolean; deploy new DB-only application only after verify. Do not run automatic `supabase db push` across gate before preparation.

**Verification:** `node --test --experimental-strip-types src/test/template-migration.test.ts`; local `node --experimental-strip-types scripts/state43-template-migrate.ts --inventory`, `--prepare`, `--verify`, then apply 0009 locally; fresh-db `--seed` plus `--verify`. Commit `feat(templates): migrate legacy catalog and remove runtime fixtures`.

## Task 19: Production/historical integration and full scenario proof

**Goal:** Template Project behaves as normal design through checkout/staff review/physical production, including dependency/archive history.

**Files:** Modify `src/lib/asset-store.ts`, `src/lib/services/prepare-order-from-guest-checkout.ts`, `src/lib/repositories/design-version-repository.ts`, `src/lib/repositories/asset-library-repository.ts`, `src/lib/services/library-dependencies.ts`, `src/components/customizer/document-render-surface.ts` only as needed for stable template asset manifests; create `src/test/template-production.test.ts`, `src/test/template-project-isolation.test.ts`; extend `scripts/state43-template-smoke.ts`, `supabase/tests/state43_template_management.sql`.

**Interfaces:** Existing checkout/immutable DesignVersion/State39 staff review/State40 artifact APIs unchanged externally. Asset promotion recognizes only server-verified committed Template Version assets; cannot accept arbitrary path because URL starts with template namespace. Historical resolver independent of new-use eligibility.

**Schema/server/storage:** New source provenance snapshots carried to DesignVersion; do not cascade customer Project deletion into Template history or historical production versions. Fonts/stickers archived still resolve. New clone denied after dependency archive, inherited Project save/render accepted. Version asset binaries remain frozen.
**RBAC:** Editor may review; Admin only generates production artifacts/starts/completes production. Do not broaden permissions to make test easy.
**Editor/UI:** Unresolved optional placeholders omitted, guidance never in preview/artifact, no stored generated cutline. Mask/crop/text fonts match actual output.
**Validation/tests:** All user tests §164–180, manual §181–185; real Node/Postgres/Chromium not mocks echoing a service result.
**Dependencies:** T18.

- [ ] Make smoke script create isolated fixtures and fail hard on prerequisites; flags `--scenario all|admin|guest|account|concurrency|production`, `--base-url`, `--artifacts-dir`. Use Supabase JS and existing Playwright; no new test runner.
- [ ] Core isolation test saves v1 JSON/thumbnail bytes/dependencies and edited Project, publishes v2, compares all originals; archive Template then Sticker/family, show unavailable new clone and successful historical pixel render; repair Draft publish v3, show availability restored.
- [ ] Exercise card Front/Inside/Back and exact target negative cases, guest 3/30 rule, RLS/private guessed assets, expired leases, two publishes, idempotent replay, no admin controls in customer mode.
- [ ] Checkout cloned Project, freeze DesignVersion, staff-edit locked art allowed only in writable context, approve and generate real production artifact as Admin. Assert recorded content checksum and expected resource pixels, not only nonempty file.

```ts
assert.equal(before.versionDocumentHash,after.versionDocumentHash);
assert.equal(before.versionThumbnailHash,after.versionThumbnailHash);
assert.deepEqual(after.editedCustomerProject,before.editedCustomerProject);
assert.equal(newUseAfterArchive.status,409);
assert.equal(historicalRender.missingResources.length,0);
assert.equal(editorProductionAttempt.status,403);
```

**Verification:** `node --test --experimental-strip-types src/test/template-production.test.ts src/test/template-project-isolation.test.ts`; `node --experimental-strip-types scripts/state43-template-smoke.ts --scenario all --base-url http://localhost:3000 --artifacts-dir .superpowers/state43-evidence`; SQL test file with ON_ERROR_STOP. Commit `test(templates): prove historical isolation and production compatibility`.

## Task 20: Runbook, acceptance matrix and release gate

**Goal:** Implemented system is operable/recoverable, old/new behavior verified and no deferred acceptance item hidden.

**Files:** Create `docs/superpowers/state43-template-management-runbook.md`; modify `README.md`, this plan progress checkboxes only during execution, relevant existing State42 runbook reference if templates now block library deletion. No application refactor in this task.

**Interfaces:** Consumes implemented T01–19 APIs/CLI and real verification artifacts; produces operator runbook plus completed 30-row acceptance evidence. No new runtime interface.

**Domain/schema/server/storage/RBAC:** Document Template/Draft/Version, 120s lease/30s heartbeat/epoch, exact target, receipt + private candidate boundary, service-only RPC, archive vs historical resolution, cleanup dry-run/apply, source rights and privacy, migration gate/backup/forward recovery. Safe catalog image publicity is not customer artwork publicity.
**Editor/UI:** Staff create/from-source/locks/placeholders/customer-preview/publish/update/duplicate/archive examples with exact Vietnamese controls. Optional unresolved placeholders print nothing; NO_EDITABLE_ELEMENTS warning acknowledgement. Customer Project no-update propagation explicit.
**Tests/validation:** Link actual saved receipts/logs/screenshots and commands; include failure recovery (storage copy failure, stale receipt, expired lease, archive during Use, migration missing licensed bytes). No unexecuted test claimed passed.
**Dependencies:** T19.

**Verification:** Commands listed below must succeed against integrated checkout and disposable DB. Inspect actual browser/production output; document any external deployment prerequisite without claiming deployment happened.

- [x] Verify every Definition-of-Done row below against implementation and evidence, fix reachable gaps before completion.
- [ ] Run once after integrated changes:

```bash
pnpm run typecheck
pnpm test
pnpm run build
psql "$STATE43_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state43_template_management.sql
node --experimental-strip-types scripts/state43-template-smoke.ts --scenario all --base-url http://localhost:3000 --artifacts-dir .superpowers/state43-evidence
node --experimental-strip-types scripts/state43-template-migrate.ts --verify
node --experimental-strip-types scripts/state43-template-cleanup.ts --dry-run
```

- [x] Smoke production `pnpm start` build separately from dev UI; observe current Template browse/use, authenticated Draft save and archived historical asset render.
- [x] Remove only implementation throwaway scripts/fixtures not needed for reproducibility; keep operational CLI/regression checks. Never delete review ledger or evidence before handoff.
- [x] Commit `docs(templates): document publication and recovery workflow`; report actual test counts/build results, remaining external deployment prerequisites and no automatic push/deploy.

---

## 4. Requirement traceability

Every original numbered requirement belongs to a task or explicit design constraint; ranges group coherent paragraphs, not omitted scope.

| Original sections | Implementing tasks / decision |
| --- | --- |
| 1–3 | All tasks; T01 evidence; explicit exclusion list |
| 4–9 | T02–05,T12 immutable model/pointer |
| 10–12 | T16,T17,T19 independent clone mandatory regression |
| 13–18 | T02,T13–15 derived Needs Update |
| 19–24 | T02,T15 exact geometry/shape/mode/multi-surface |
| 25–29 | T05,T10,T14 eligible source + rights, no Orders |
| 30–33 | T09,T10,T11 existing editor/library authoring |
| 34–39 | T07,T09 actual reducer/history lock guards |
| 40–48 | T08,T09 optional placeholders + isolated preview |
| 49 | T11 automatic real customer initialization receipt |
| 50–56 | T03,T05,T14,T15 categories/tags/cards/search/browse vs resolve |
| 57–61 | T11,T13,T15,T19 dependencies including historical |
| 62–71 | T08,T11,T12 standard Preflight + real version thumbnails |
| 72–79 | T06,T12,T19 atomic publishing/no propagation |
| 80–87 | T10,T13,T16,T17 duplication/retention/provenance; cheap usage only |
| 88–95 | T04,T06,T07 roles/lease/CAS/no collaboration |
| 96–110 | T08,T09,T16 sandbox/direct editing/print-safe optional empty |
| 111–120 | T11,T15,T19 set-based availability/cache/historical |
| 121–132 | T03–06,T12,T16,T17 event/RLS/clone/idempotency |
| 133–142 | T10,T13–15 private draft/immutable public delivery/error/delete UX |
| 143–150 | T05,T10,T14 metadata, privacy, no costly analytics |
| 151–158 | T02,T10,T19 owned images/schema/production |
| 159–163 | T01,T18 seed/backfill/link preservation |
| 164–180 | T02,T04,T06–13,T16–19 behavioral automated checks |
| 181–185 | T14,T19 real browser manual scenarios |
| 186–189 | T15 thumbnails/metadata/paging/lazy resources/no realtime |
| 190 | T20 runbook + this spec |
| 191–192 | T01–20 executable task format/order |
| 193 | Exclusions below |
| 194 | All 30 acceptance rows below |

### Definition of Done owner/evidence table

| # | Acceptance | Owner | Required evidence |
| --- | --- | --- | --- |
| 1 | Secure staff management | T04,T14 | real role/API/DB denial matrix |
| 2 | Exact-target blank Draft | T02,T05 | valid target create + incompatible rejection |
| 3 | Eligible source design | T10,T14 | own-project copy, customer/Order denial |
| 4 | Existing Editor reuse | T09 | author interaction in same CustomizerShell |
| 5 | Customer locks | T07 | direct/bulk/keyboard/history cases |
| 6 | Text/Image placeholders | T08 | text commit/Replace geometry/state |
| 7 | Accurate customer preview | T09,T11 | lock/tool permissions, no persistence |
| 8 | Supabase autosave | T06 | semantic save/reload |
| 9 | No silent overwrite | T06 | two sessions, stale CAS, epoch takeover |
| 10 | Standard Preflight | T11 | actual blocking/warning findings |
| 11 | Managed dependency validation | T11,T12 | face/family/sticker states/checksums |
| 12 | Exact product validation | T02,T11 | incompatible mode/shape/surface denied |
| 13 | Immutable TemplateVersion | T03,T12 | row/JSON/binary mutation rejection |
| 14 | Atomic pointer | T12 | races + rollback partial failures |
| 15 | Published edit makes Draft | T05,T12 | old current version visible during edit |
| 16 | v2 leaves v1 Project unchanged | T17,T19 | exact persisted Project snapshot comparison |
| 17 | Available compatible browse | T15 | SQL filtered pagination + network payload |
| 18 | Guest independent clone | T16 | local create/reopen + 3/30 policy |
| 19 | Account cloud clone | T17 | owner/revision/idempotency |
| 20 | Safe provenance/no sync | T16–19 | serialization/migration/checkout preservation |
| 21 | Archive protects historical work | T13,T19 | hide new-use, render old |
| 22 | Archived asset blocks new use only | T11,T19 | new-use 409, historical success |
| 23 | Dependency fix restores | T13,T19 | next version available |
| 24 | Immutable version thumbnails | T10,T12,T19 | old bytes/hash after v2 |
| 25 | Customer asset privacy | T10,T11 | private/foreign reference negative cases |
| 26 | RBAC/RLS operations protected | T04,T19 | actual API/DB/Storage clients |
| 27 | Historical Version resolution | T15,T19 | owner/staff allowed, guessed ID denied |
| 28 | Legacy IDs/references migrated | T01,T18 | complete mapping/rerun/old URL tests |
| 29 | Full tests pass | T20 | real executed Node + DB results |
| 30 | Production build passes | T20 | real build + start smoke |

## 5. Explicit deferrals / release prerequisites

Deferred by user scope: AI/template/layout generation, customer publishing, marketplace, likes/ratings/comments, collaborative cursors/CRDT, approval portal, update notifications/propagation/merge/rebase, product/variant geometry conversion, nested folders, brand kit, complex approval, exact usage analytics and required-field schema. No disabled UI pretending these exist.

Execution prerequisites: disposable Supabase/Postgres with migrations/Storage/auth, licensed real State42 font/sticker fixtures, Chromium installed for existing Playwright, service credentials only in server environment, local test Editor/Admin/customer identities. Migration to production additionally requires backup, deployment window and operator approval. If existing legacy artwork lacks licensed stable bytes, gate migration and name exact missing references; never fabricate availability, silently hide catalog or replace customer designs.

Plan delivery itself changes documentation only. No feature implementation, DB migration, upload, deployment or GitHub push is authorized by writing this plan.
