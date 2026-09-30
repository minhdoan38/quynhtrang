# State 39: Admin Design Review & Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This document is a plan, not an implementation or evidence of deployed functionality.

**Goal:** Staff review customer-approved artwork, approve unchanged artwork or edit one server-backed draft, then explicitly commit a new immutable production version without altering customer approval history.

**Architecture:** Extend the existing Supabase repositories and State 38 authenticated operation boundary. Add one mutable draft per Order, optimistic document revisions, a fenced editing lease, and atomic audited revision operations. Introduce an explicit staff context in the existing CustomizerShell/history/reducer/renderers rather than a second editor. Production reads a separate immutable version pointer.

**Tech Stack:** Installed Next.js 16.3.6, React 19, TypeScript, Supabase JS 2.117.2 + SSR 0.12.7, Postgres/Auth/RLS/private Storage, shadcn Base Nova, GSAP + useGSAP, existing Node test runner. No CRDT, merge engine, second canvas framework, or new test framework.

**Spec:** User's State 39 brief, requirements 1–163 and 23 Definition-of-Done criteria; authoritative design decisions and coverage are preserved in this document. Prerequisites: `docs/superpowers/plans/2026-09-30-state-37-supabase-admin-inbox.md` and `docs/superpowers/plans/2026-09-30-state-38-admin-order-detail-payment-confirmation.md`.

## Global constraints and execution gate

- Never mutate customer-approved document JSON, product snapshot, Preflight snapshot, asset bytes, thumbnail, or customer pointer. This includes direct SQL/API/Storage paths, not just UI actions.
- Staff draft is mutable; DesignVersion is append-only. Autosave never creates DesignVersions or Order events.
- Admin and Editor can review/create/edit/Preflight/compare/approve. Only Admin can take over another editor's expired lease. State 38 financial/lifecycle/Hold permissions remain unchanged.
- Fulfillment `in_production`, `completed`, `cancelled`, and cancelled Orders are mutation-ineligible. `unprocessed`/`ready_for_production` are eligible even with an active Hold. Payment is not a review/edit prerequisite.
- Approval changes design state/pointer only: never payment, quantity, price, shipping, fulfillment, or Hold. State 40 must independently require paid + design approved + no active Hold + eligible fulfillment + usable production version.
- Only the current checkout/project is related to a staff draft. Customer local projects, three-project retention, session history, and local autosave remain untouched.
- Realtime invalidates/refetches state; never grants rights, resolves conflicts, or overwrites dirty editor state.
- User deploys SQL to their VPS Supabase. Deliver ordered SQL first; do not apply migrations, reset databases, run live integration/security tests, or modify VPS data until the user confirms deployment and authorizes tests on a disposable environment. Credentials go into uncommitted environment only.
- Do not automatically commit this planning artifact. During execution each task below is a commit boundary after its stated checks; do not include unrelated working-tree changes.

## 1. Repository evidence, not assumptions

Observed during this planning pass:

| Surface | Actual file / finding | Consequence |
|---|---|---|
| Schema | `supabase/migrations/0001_state37_core.sql:98–196`: projects, assets, versions, orders, payments, events, guest access | Reuse these tables; no parallel business schema |
| Version pointers | Orders currently has only `approved_design_version_id`; version has no parent/draft lineage | Add production pointer and rename customer pointer with complete caller migration |
| Immutability | `0001_state37_core.sql:337–352,468–471` grants staff version writes; project FK cascades versions | Existing naming does not enforce immutability; remove these mutation/cascade paths |
| Storage | `0002_state37_storage.sql`: private customer-assets/approved-renders, broad staff object update/delete | Tighten immutable-asset writes without breaking published catalog buckets |
| Version repository | `src/lib/repositories/design-version-repository.ts`: `DesignVersionRecord`, `createVersion`, `getById`, `getLatestForProject`; full-row reads | Add summary reads and lineage; approval cannot use client-calculated latest+1 |
| Asset repository | `src/lib/repositories/asset-repository.ts`: `promoteAsset` uploads unique bytes; metadata in Postgres | Reuse with draft/uploader association; never overwrite source objects |
| Asset serving | `src/lib/services/serve-asset.ts`: privileged download, public immutable cache headers, no request authorization argument | State 37 security prerequisite: authorize delivery and private/no-store responses before staff assets depend on it |
| Order domain | `src/lib/domain/order.ts`: real `StaffIdentity {userId, role}`, `DesignStatus`, `FulfillmentStatus`, `ActiveOrderHold`, `OrderOperationalState`, `deriveAttentionReasons`, `mapOrderInboxRow` | Extend these actual types; no duplicate status model |
| State 38 resolver | `src/lib/admin/order-next-action.ts`: `resolveOrderNextAction`; payment precedence, Hold priority, editing currently maps to resolve_design_changes | Add resume action without bypassing financial/Hold priority |
| Missing prerequisites | No `src/app/admin`, `src/components/admin`, `src/lib/admin/authorization.ts`, `src/lib/admin/realtime.ts`, `0003_state38_order_operations.sql`, or `order_holds` migration in current tree | State 37/38 are NOT verified complete. Referenced future paths below are prerequisite outputs, not existing files |
| Editor | `src/components/customizer/customizer-shell.tsx`: no props; creates wrapping state, hydrates local storage; autosaves after 400ms and pauses while active transaction | Add context prop/injected save boundary; guest defaults must remain identical |
| History | `src/lib/use-design-history.ts`: `useDesignHistory`, `createDesignHistoryManager`, resetHistory/transactions/undo/redo | Reuse; no server history persistence |
| Read-only renderer | `design-canvas.tsx`: `isLocked`, callbacks, surface/pattern controls; not a complete authorization boundary | Guard mutation dispatch + callbacks + keyboard actions, not CSS-only disabling |
| Template locks | `.locked` checks in shell, canvas, `grouping.ts`, `multi-selection.ts`, reducer | Add explicit editing policy; do not clear stored lock flags |
| Document | `src/lib/product-state.ts:285–296`: `DesignState`, no separate Staff document/schema version | Use DesignState, existing legacy migration, no new wire document format |
| Preflight | `getPreflight(DesignState)` in product-state.ts; image-quality/safe-area/sticker engines; existing PreflightResult | Run same engine server-side on saved revision, not a trusted client boolean |
| Preview | `editor-preview-mode.tsx` and preview/{wrapping,card,sticker,notebook}-preview.tsx | Reuse product renderers for review/compare |
| Tests | `src/test/order-next-action.test.ts`, order-repository/order-preparation, history, product/preflight tests | Preserve behavioral regression coverage; no source-text tests for new UI |

The earlier 496-test baseline belongs to State 37 planning, not this current tree. No fresh application tests/build or database verification are claimed here. This request changes documentation only. Task 0 records a fresh baseline when implementation starts.

### Gate 0: required before State 39 code

Complete/review State 37 and State 38 plans, including:

- Staff login, protected admin routes, request-scoped authenticated client, `requireCurrentStaff`, `requireStaff` and private asset delivery.
- State 38 `0003_state38_order_operations.sql`, order_holds, server-audited operations, display names, approved thumbnail identity, detail UI and timeline.
- Real Inbox/query/realtime/refetch boundary and State 36 customer access regressions.
- All unit/type/build checks and user-authorized deployed security checks. No mock backend can satisfy this gate.

Do not build missing State 38 workflows inside State 39. Refresh the evidence table if another worker lands those prerequisites. Existing State 38 planned paths are used explicitly below; if implementation chooses another path, map the equivalent once in this plan before editing.

## 2. Locked design decisions

### A. Alternatives and chosen boundary

1. **Chosen:** one shared editor with guest/staff-review/staff-edit contexts; mutable draft table; narrow RPC transitions. Keeps history/rendering semantics and gives transactional control.
2. Rejected: separate staff editor copied from CustomizerShell. Duplicates every image/text/product fix.
3. Rejected: mutate project JSON or save a DesignVersion on each change. Either destroys history or confuses temporary state with production approval.

### B. Version identity and lineage

- Rename existing `orders.approved_design_version_id` to `customer_approved_design_version_id`; add `production_design_version_id`; backfill production from customer only, never from project latest version.
- Both pointer targets must belong to the Order's project. Missing legacy references are reported for repair, never filled by arbitrary latest-version selection.
- Customer pointer is frozen after Order creation. Production pointer moves only through approved operations.
- New checkout writes BOTH pointers in the same creation transaction. Guest confirmation always reads customer version. Staff Inbox/detail reads production thumbnail and also labels customer version.
- Versions gain `parent_design_version_id`, `revision_reason`, `revision_draft_id` (unique, nullable). Existing customer sources are not rewritten. Staff source is `editor_revision` or `admin_revision` from actual actor role.
- Normal draft base = current production pointer. Older-version selection is read-only. Explicit “Tạo bản chỉnh sửa từ phiên bản này” sets base to that historical version AND captures current production pointer separately for CAS approval.
- `base_design_version_id` is lineage; `expected_production_design_version_id` is the pointer being replaced. They are not interchangeable when restoring old artwork.
- Approve-as-is only when current production still equals customer and no active draft exists. Never silently switch v2 back to v1; use a new draft from v1 and approve v3.

### C. Draft/lease semantics

- States: `editing`, `ready_for_review`, `approved`, `discarded`. Active = first two; partial unique index on order_id for active rows.
- Mutable draft stores DesignState, reason (trimmed 3–500 Unicode characters), creator/editor, revision, base pointer, expected production pointer, prior design status, timestamps, lease epoch and session UUID, activity/expiry, approved version result.
- Document revision starts at 1; accepted semantic save increments by 1. Heartbeat never increments document revision.
- Lease duration 120 seconds, heartbeat every 30 seconds while tab visible, server time only. Constants belong in DB configuration/function defaults, exposed read-only to the client. No browser-selected expiry.
- Lease identified by authenticated editor + session UUID + monotonically increasing epoch. Tab/session IDs are not authorization credentials.
- Another staff sees read-only ownership banner. Same owner may resume/reacquire expired lease if epoch unchanged; Admin may explicitly take over a stale lease. No active-lease override in MVP.
- A second tab has a different session UUID and defaults to read-only while lease active. Even forged/reused session IDs cannot bypass revision CAS. Takeover increments epoch, preventing old tab heartbeat/save/approve/discard.
- Closing a tab does not delete draft. Lease expires; owner can resume. Never assume unload heartbeat/save succeeds.
- Reload in the same tab reuses a tab-session UUID stored only as session metadata in sessionStorage (never document/Undo history); a duplicated tab may copy it, so revision CAS is still mandatory. A closed/reopened tab without that UUID waits for expiry before reacquiring. Missing heartbeat never auto-deletes a draft.

### D. Autosave and conflict policy

- Staff save delay 800ms after a committed semantic change, maximum waiting 5s while not in gesture/IME/crop/live transaction; guest remains 400ms.
- Single-flight save queue: one request in flight, one latest pending snapshot. Follow-up uses returned revision. Never parallel POSTs for pointer frames.
- Save intent has requestId, expectedRevision and document hash. Replaying the latest acknowledged request returns its prior result; same requestId with changed payload fails. If response was lost and a later state exists, report conflict; never guess a new revision and overwrite.
- Stop save queue on 409 revision/lease/base conflict or 423 production lock. Retain unsaved local content in memory, show conflict banner; no merge or automatic reload.
- Recovery choices: explicitly discard local unsaved changes and reload authoritative draft; optionally download a JSON recovery copy after user action. No autosaving draft content into guest localStorage and no automatic upload of recovery copy.
- Back/Xong first commits or cancels open editor transactions according to existing transaction UI, awaits asset uploads and flush, then navigates. Failed flush keeps editor visible with retry/leave confirmation. beforeunload only when dirty; hide-tab best effort does not claim saved.

### E. Server Preflight and approval trust

- Browser runs existing getPreflight for instant feedback. Server loads saved draft, validates immutable business config, resolves real asset dimensions/references/fonts, and runs the SAME getPreflight for approval.
- Reuse shared asset/document validation from completed State 37. Missing blob/data/unknown asset references block. Never pretend QR/barcode validation exists if the shared core does not support those objects; reject unsupported document kinds with the common validator rather than approve silently or build admin-only rules.
- Server-created assessment binds draftId, document revision + hash, base/expected production pointer, validator version, pinned product config hash, asset manifest hash, lease epoch, evaluator user, expiry (10 minutes), full findings.
- Store assessments in private server-written table. Browser has no insert/update grant. Verified Next server may create assessments via server-only service client; it derives actor from staff session, not request body. Staff approval RPC uses request-authenticated client and auth.uid(). Never allow a client-created “passed” receipt.
- Saving changes invalidates ready_for_review and assessment. Approval requires same revision/hash/lease/actor and unexpired assessment; locks assets/references needed to prevent cleanup races.
- The transition to ready_for_review must reference the server-written assessment ID and recheck its bindings; an authenticated browser cannot directly set ready status or submit findings. Authenticated RPC save validates JSON structure/frozen product fields itself, not merely the Next wrapper, because callers can invoke Supabase RPC directly.
- Blocking findings always block. Allowed warnings require exact acknowledged finding IDs; store actor/time/acknowledgements in new version snapshot and event. As-is acknowledgement is an event/assessment, never a mutation of customer Preflight snapshot.
- Same flow for as-is evaluates immutable customer document server-side before operation. No duplicate version.

### F. Thumbnails and private binaries

- Immutable DesignVersion content and original objects never overwritten. New image/derived mask/font attachment gets a fresh asset identity and `upsert:false`.
- Reuse State 37 thumbnail renderer/upload path, but make render status an independent artifact row keyed by version ID. An outbox render job is inserted atomically on approval.
- Approval succeeds with `thumbnail_pending`. Rendering retry creates the exact new-version artifact; no old-version thumbnail mislabeled as new. Pending/error UI shows text/neutral skeleton, not v1 artwork for v2.
- Successful rendition gets write-once path+checksum; later retry returns same artifact. Failed rendering does not alter version JSON or roll back approval. Outbox worker drains with server-authenticated bounded command and retries; no new external queue dependency.
- All image, original, removed-background, mask, texture, font and sticker references are collected into an asset manifest. Existing binaries/metadata must be immutable or pinned to an immutable copy before they can enter a version.
- Draft-only assets become GC candidates only after draft discarded/closed and 7 days. A scheduled/operator-run server script claims deletion candidates under lock, verifies no active draft, version, template or other project references, then deletes via Storage API. Never delete customer originals by “project unused” inference.
- Persist references for every new draft/version; for legacy documents lacking manifests, backfill references or conservatively retain their assets. Incomplete reference inventory means no deletion.
- New render-artifact table is `design_version_renders(version_id uuid primary key, storage_path text unique, checksum text, created_at timestamptz)`. Only successful immutable outputs enter it. Mutable attempts/status belong solely to `design_render_jobs`; neither table rewrites an existing version thumbnail.

### G. UI and navigation

Route: `/admin/orders/[id]/design`, replacing/enhancing State 38's read-only inspection route. Server authorizes before sending document. Entry REVIEW, focused on current production, with visible customer v1 + production vN identities and selector for read-only older versions.

Modes: REVIEW → STAFF_EDIT → PREFLIGHT → REVIEW_CHANGES → approval → State 38 detail. Back reverses modes without deleting server draft. Deep URL never bypasses lease/server guard.

- REVIEW: zoom/pan, selectable read-only layers/element properties, surface switch, quality/safety, cutline, Preview and Preflight. No mutation controls or hotkeys.
- STAFF_EDIT: “Bản chỉnh sửa #QT…”, undo/redo, save status, Xong. No launcher/product setup/Checkout/quantity actions. Show “Khóa với khách” without flipping stored locked flags.
- Business config frozen: productId, variantId, quantity, physical orientation/dimensions/shape/fold/binding. Artwork may change background, content, transforms, pattern spacing/scale/rotation and die-cut border settings. Unknown product option changes fail closed at server.
- Customer-intent changes require external confirmation using existing State 38 Hold workflow. Explain this near revision reason; do not detect intent automatically. Editor can request a Hold through permitted State 38 affordance; do not expand Hold privileges if Admin-only.
- Mobile compare toggles “Bản trước”/“Bản sửa”; desktop >=1024px side-by-side. One shared active surface, preview mode, normalized zoom/pan. Card front/inside/back align; wrapping uses actual tiled/full-sheet output; die-cut renders actual silhouette.
- Version reason visible. Approval dialog states customer v1 remains; discard/takeover confirmation mandatory. Conflict and production-lock messages match user brief.
- Reuse shadcn Dialog/AlertDialog, Button, Badge, ToggleGroup, Sheet, Skeleton, DropdownMenu from completed admin surface. Preserve tokens/Be Vietnam Pro and 44px actions. Do not redesign admin navigation.
- Existing GSAP via useGSAP may do <=150ms opacity transition on mode chrome, scoped ref and cleanup; reduced-motion skips. Do not animate before/after artwork or pan/zoom on toggle. Focus lands on mode heading/dialog, announcements use aria-live. No layout-heavy motion or animated save indicators.

## 3. File ownership and dependency graph

**Existing files to extend:**

- `src/lib/domain/order.ts`, `src/lib/order-types.ts`, `src/lib/admin/order-next-action.ts`
- `src/lib/repositories/{order,design-version,asset,order-event}-repository.ts`
- `src/lib/services/prepare-order-from-guest-checkout.ts`, `src/lib/services/serve-asset.ts`
- `src/components/customizer/{customizer-shell,design-canvas,editor-preflight-mode,editor-preview-mode,editor-sheets,bottom-navigation,layers-sheet-content}.tsx`
- `src/lib/{product-state,use-design-history,multi-selection,grouping,use-editor-shortcuts}.ts`
- `src/lib/upload.ts`, `src/lib/background-removal/{provider,mask-editor}.ts`, `src/lib/fonts.ts` only where resolving/uploading draft assets needs an existing seam.

**State 37/38 outputs to modify AFTER Gate 0:**

- `src/lib/admin/{authorization,realtime,thumbnail-delivery}.ts`
- `src/lib/services/admin-order-operations.ts`
- `src/app/admin/orders/[id]/{page,order-detail-client}.tsx`, `actions.ts`, `design/page.tsx`
- `src/components/admin/{order-design-card,order-next-action-card,order-activity-timeline,order-row,order-thumbnail}.tsx`
- `src/app/api/admin/orders/[id]/route.ts`
- `supabase/migrations/0003_state38_order_operations.sql` is a prerequisite, NOT rewritten by State 39.

**New files owned by this state:**

- `supabase/migrations/0004_state39_design_revisions.sql`
- `supabase/tests/state39_design_revisions.sql`
- `src/lib/domain/design-revision.ts`, `src/lib/editor-context.ts`
- `src/lib/repositories/design-revision-repository.ts`
- `src/lib/services/admin-design-revisions.ts`, `src/lib/services/staff-design-preflight.ts`
- `src/lib/staff-draft-autosave.ts`, `src/lib/use-staff-draft-session.ts`
- `src/app/admin/orders/[id]/design/actions.ts`, `design-review-client.tsx`
- `src/app/api/admin/orders/[id]/design/route.ts`, `draft-assets/route.ts`
- `src/components/admin/design-review.tsx`, `design-compare.tsx`, `design-revision-dialogs.tsx`
- `scripts/state39-render-jobs.ts`, `scripts/state39-asset-gc.ts`, `scripts/state39-concurrency-smoke.ts`
- `docs/superpowers/state39-design-revisions-runbook.md`
- Tests listed per task below; no scaffolding-only test files.

**Order:** T0 → T1 → T2 → T3 → T4 → T5. T6 can follow T1 alongside backend work (one owner for shared shell). T7 depends T3+T6; T8 depends T4+T5+T6+T7; T9 depends T5+T8; T10 depends all. Do not run live DB tasks before deployment approval. Parallel agents skip mid-flight suite/build; integration owner runs once at each completed batch.

## 4. Shared operation contracts

Add to `src/lib/domain/design-revision.ts`; import existing DesignState, PreflightResult, StaffIdentity and status types, do not redefine them.

```ts
export type StaffDraftStatus = 'editing' | 'ready_for_review' | 'approved' | 'discarded';
export type DesignReviewMode = 'review' | 'staff-edit' | 'preflight' | 'review-changes';
export type RevisionErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'ORDER_LOCKED' | 'ACTIVE_DRAFT_EXISTS'
  | 'LEASE_LOST' | 'REVISION_CONFLICT' | 'PRODUCTION_CHANGED' | 'INVALID_DOCUMENT'
  | 'PREFLIGHT_BLOCKED' | 'PREFLIGHT_STALE' | 'WARNINGS_UNACKNOWLEDGED'
  | 'INVALID_REASON' | 'DRAFT_CLOSED' | 'ASSET_UNAVAILABLE';
export type RevisionResult<T> = { ok: true; value: T } |
  { ok: false; code: RevisionErrorCode; message: string };
export interface DraftLease { sessionId: string; epoch: number; expiresAt: string; }
export interface StaffDesignDraft {
  id: string; orderId: string; projectId: string;
  baseDesignVersionId: string; expectedProductionDesignVersionId: string;
  document: DesignState; revision: number; reason: string;
  status: StaffDraftStatus; createdBy: string; editorUserId: string;
  lease: DraftLease | null; createdAt: string; updatedAt: string;
  approvedDesignVersionId: string | null;
}
export interface DraftWriteGuard {
  draftId: string; expectedRevision: number; expectedProductionVersionId: string;
  lease: Pick<DraftLease, 'sessionId' | 'epoch'>;
}
export interface SaveStaffDraftInput extends DraftWriteGuard {
  requestId: string; document: DesignState;
}
export interface StaffPreflightAssessment {
  id: string; draftId: string | null; versionId: string | null;
  revision: number | null; documentHash: string; findings: PreflightResult;
  expiresAt: string; warningIds: string[];
}
export interface ApprovedRevisionResult {
  orderId: string; customerVersionId: string; productionVersionId: string;
  versionNumber: number; draftId: string | null;
}
export interface DesignVersionListItem {
  id: string; versionNumber: number; source: string; parentVersionId: string | null;
  reason: string | null; createdBy: string | null; createdAt: string;
  thumbnailPath: string | null; isCustomer: boolean; isProduction: boolean;
}
```

Next server service `admin-design-revisions.ts` operations return `Promise<RevisionResult<...>>` and acquire verified staff internally:

| Operation | Input | Result value |
|---|---|---|
| createDraft | orderId, baseVersionId, expectedProductionVersionId, reason, sessionId, requestId | StaffDesignDraft |
| acquireDraftLease | draftId, sessionId, expectedEpoch | StaffDesignDraft |
| heartbeatDraft | draftId, sessionId, epoch | DraftLease |
| saveDraft | SaveStaffDraftInput | `{revision: number; updatedAt: string; requestId: string}` |
| runDraftPreflight | DraftWriteGuard | StaffPreflightAssessment |
| runCustomerPreflight | orderId, expectedCustomerVersionId, expectedProductionVersionId | StaffPreflightAssessment |
| approveDraft | DraftWriteGuard + assessmentId + acknowledgedWarningIds + requestId | ApprovedRevisionResult |
| approveCustomerAsIs | orderId, expectedCustomerVersionId, expectedProductionVersionId, assessmentId, acknowledgedWarningIds, requestId | ApprovedRevisionResult |
| discardDraft | DraftWriteGuard + requestId | `{draftId: string; status: 'discarded'}` |
| takeoverDraft | draftId, expectedEpoch, sessionId, requestId | StaffDesignDraft |

Methods are TypeScript wrappers around same-named snake_case Postgres RPCs except the two Preflight runners, which load server data/evaluate/persist assessment. Map safe errors to 401/403/409/423/422/503 where HTTP routes are used. Server Actions return the discriminated result. Never leak database detail/PII.

## 5. Executable tasks

### T0 — Verify prerequisite cutover and record baseline

**Dependency:** None. **Goal:** do not implement against imaginary State 38 APIs.
**Files:** update this plan's evidence and runbook when execution begins; product code unchanged.
**Schema/server/RLS/UI:** verify Gate 0, no new behavior.

- [ ] Read current 0001–0003 migrations, actual auth/hold/detail/realtime/asset endpoints and relevant Next installed guides under `node_modules/next/dist/docs/01-app/` before writing code.
- [ ] Map prerequisite outputs listed in section 3 and locate exported-symbol references with LSP before changing signatures. Record any renamed paths once.
- [ ] Run `pnpm test`, `pnpm typecheck`, `pnpm build`; record counts and warnings. Do not rerun user-reported failures merely to confirm them.
- [ ] Run existing local app and observe authenticated Order Detail/Inbox and guest editor when prerequisites are available. No VPS tests before user deployment confirmation.
- [ ] Stop execution at a genuinely missing prerequisite; deliver exact absent paths, not a fake implementation. This does not block writing this plan.

**Commit boundary:** baseline/prerequisite documentation only if changed.

### T1 — Revision domain, document invariants and editor capabilities

**Dependency:** T0. **Goal:** pin invariants before schema/UI changes.
**Files:** create `src/lib/domain/design-revision.ts`, `src/lib/editor-context.ts`, `src/test/design-revision-domain.test.ts`; modify `src/lib/domain/order.ts` for `continue_design_edit` and draft summary types.
**Schema:** none. **Server/RLS:** pure domain checks are defense in depth, not authorization. **UI:** capability contract only.

- [ ] Add shared types above; `isDesignMutationEligible(state)` accepts only unprocessed/ready_for_production and rejects cancellation regardless of Hold/payment.
- [ ] Implement `assertStaffArtworkCompatible(base, next)` using actual product option definitions. Always freeze productId/variantId/quantity; freeze card orientation/fold, fixed-sticker shape/physical sizes, notebook physical/binding spec, wrapping physical size. Whitelist artwork keys by product; reject unknown changed keys. Do not compare every productOptions field wholesale: border/pattern edits are requested behavior.
- [ ] Implement `canMutateElement(mode, element)` where review=false, guest=!locked, staff-edit=true for permitted artwork; stored locked flags unchanged. Do not conflate review inspection selection with edit permission.
- [ ] Define discriminated Customizer context: omitted/guest context preserves old initialization/storage; staff context carries document, mode, save/upload/exit callbacks, order label, and session identity. Existing `useDesignHistory` remains the single state engine.
- [ ] Add runnable behavior assertions, e.g.:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../lib/product-state.ts';
import { assertStaffArtworkCompatible } from '../lib/domain/design-revision.ts';
test('staff changes artwork but not ordered quantity', () => {
  const before = createInitialState('card');
  const after = { ...before, text: 'Nội dung đã được khách xác nhận' };
  assertStaffArtworkCompatible(before, after);
  assert.throws(() => assertStaffArtworkCompatible(before, { ...after, quantity: 2 }));
  assert.equal(before.text, createInitialState('card').text);
});
```

- [ ] Run `node --test --experimental-strip-types src/test/design-revision-domain.test.ts`; cover each product/config boundary and locked element guest/staff/review matrix. Run red before code then green.

**Commit:** `feat(design): define staff revision invariants and editor context`.

### T2 — Forward-only schema migration, pointer cutover and immutable security

**Dependency:** T1 + completed State 38 migration. **Goal:** DB enforces history and one draft.
**Files:** create `supabase/migrations/0004_state39_design_revisions.sql`, `supabase/tests/state39_design_revisions.sql`; modify `src/lib/{domain/order,order-types}.ts`, existing order/version repositories and `prepare-order-from-guest-checkout.ts` for pointer names. Include State 36 customer mapper, Inbox and detail joins in the same cutover.
**UI:** pointer read migration only. **Server:** no old/new-pointer compatibility alias.

- [ ] Migration precheck requires 0003 outputs and rejects missing/mismatched order/project/version references. Snapshot counts and back up before user deployment. Never edit applied 0001–0003 or reset VPS.
- [ ] Rename customer pointer, add/backfill production pointer, validate both FKs plus project ownership, change destructive project/version cascades to RESTRICT for history. Reject customer pointer change after insert using trigger. Adapt guest order creation to write both pointers atomically.
- Rename/update every stored function body, view, PostgREST FK join, seed and generated type referring to the old pointer in this forward migration; PostgreSQL column rename does not repair text SQL inside PL/pgSQL automatically. Deploy migration and application cutover in one maintenance window; no permanent compatibility column. Roll back application only with a matching schema recovery procedure, never by moving customer pointers.
- [ ] Add lineage and draft table with unique approved result, guarded statuses, revision >=1, server timestamps, last save request/hash/result, prior_design_status, lease_epoch/session/expiry. Schema core:

```sql
create unique index design_revision_drafts_one_active_order
  on public.design_revision_drafts(order_id)
  where status in ('editing', 'ready_for_review');
create unique index design_versions_one_result_per_draft
  on public.design_versions(revision_draft_id)
  where revision_draft_id is not null;
```

- [ ] Add server-private `design_preflight_assessments`; no Data API client read/write; contain bindings described in section 2E and consumed result. Add `design_version_assets` and `design_draft_assets` manifest join tables (asset FKs RESTRICT), and append-only render-artifact identity plus transactional `design_render_jobs`.
- Pin table details: `design_revision_drafts` has UUID PK; order/project/base/expected-production/created-by/editor FKs; JSONB design_document NOT NULL; text reason with char_length 3–500; text checked status; bigint revision default 1; bigint lease_epoch default 1; UUID lease_session_id; timestamptz lease_expires_at/last_activity_at/created_at/updated_at; nullable UUID approved_design_version_id; prior_design_status; nullable last_save_request_id/document_hash/result_revision. Closed rows reject document/reason/ownership updates. Store request IDs for create/takeover/discard in a private `design_revision_requests` table keyed by (actor_user_id, operation, request_id), with target, input_hash and result JSON. Same key with different input fails. Insert result in the operation transaction; no standalone event-log dedup guess.
- `design_preflight_assessments` has UUID PK; mutually exclusive draft_id/version_id; order_id; revision; document_hash; expected_production_version_id; base_version_id; actor_user_id; lease_epoch; validator_version; product_config_hash; asset_manifest_hash; findings JSONB; warning_ids text[]; expires_at and created_at. No client mutation grant. Consumed result is written only by approval RPC; deleting expired assessments never deletes immutable version snapshots.
- Manifest joins use composite PK (draft_id, asset_id) / (version_id, asset_id), kind and immutable content checksum. Render jobs have version_id UNIQUE, status pending/running/failed/completed, attempts, next_attempt_at, claim_expires_at and safe error code. Apply staff-read RLS only where required; worker/private tables deny client writes and event payloads never include documents.
- [ ] Revoke direct client INSERT/UPDATE/DELETE on drafts/versions/manifest/history/assessment/production pointers; RLS SELECT only for staff on operational rows. Do not trust own-draft UPDATE policy without revision checks. RPCs are the write path. Customer/nonstaff/anon no draft read.
- [ ] Remove `Allow staff manage design versions` and direct event inserts. Add committed-version UPDATE/DELETE rejection trigger, protect content assets' metadata identity and Storage overwrite/delete. Preserve public catalog bucket behavior; modify policies by bucket/path/reference, not a global denial that breaks libraries.
- [ ] Use SELECT RLS/security-invoker queries for reads. Mutation functions use SECURITY DEFINER because callers intentionally lack underlying write grants; `SET search_path = ''`, fully qualified relations, no dynamic SQL, revoke EXECUTE from PUBLIC/anon, grant exact signatures to authenticated, independently check auth.uid + staff_roles in each. Assessment recording callable only by trusted server role. Do not expose generic arbitrary-document approval RPC.
- [ ] Query tests assert raw version update/delete, customer-pointer rewrite, protected Storage overwrite, nonstaff draft read, client assessment insert and direct event insert all fail. Index draft order/owner/base, active status+activity, manifest FKs and jobs status. PK/unique indexes already cover exact ID checks.
- [ ] Local verification: `pnpm typecheck` after caller cutover; SQL execution waits for user. Deliver full migration SQL, not schema pseudocode, with apply-order instructions. After user deployment run SQL assertions through authorized test connection (T10).

**Commit:** `feat(db): add immutable production revisions and staff drafts`.

### T3 — Atomic draft creation, lease, discard and takeover

**Dependency:** T2. **Goal:** safe resumable single-owner draft lifecycle.
**Files:** extend 0004 before first deployment (after deployment use next numbered forward migration); create `src/lib/repositories/design-revision-repository.ts`, `src/lib/services/admin-design-revisions.ts`, `src/app/admin/orders/[id]/design/actions.ts`, `src/test/design-draft-operations.test.ts`.
**UI:** actions consumed later. **RLS:** authenticated RPC only, staff SELECT.

- [ ] Implement read summaries/full draft separately; full JSON only for selected draft/review/compare. Return database errors as failures, not “no draft” fallback.
- [ ] All operations lock in consistent order: Order → Project (if allocating version) → Draft → assessments/assets/events. State 38 payment/Hold and future production transitions must also lock Order first. No production transition implementation here.
- [ ] `create_design_revision_draft`: authenticate, lock Order, eligibility + expected pointer, validate base belongs to order project, reason, request replay, one active index. Clone stored base document server-side, manifest refs, acquire lease, set design_status editing, capture prior status, append exactly one design_draft_created event and return. Concurrent create loser gets ACTIVE_DRAFT_EXISTS plus allowed summary, never another row.
- [ ] Resume returns existing draft; acquire/heartbeat check role, same editor/session/epoch, active status and eligible Order. Expired owner reacquire increments epoch. Another active session never hijacks on read.
- [ ] Admin stale takeover locks same rows, checks expected epoch and DB expiry <= now, increments epoch, changes editor/session, appends design_draft_taken_over with old/new IDs, keeps content/revision. Concurrent retry returns existing result by request identity, not duplicate event.
- [ ] Discard requires active lease owner (Admin first takes over stale draft), expected revision and current production pointer. Set discarded/release lease, restore prior design_status only if production unchanged; never restore payment/Hold/fulfillment. Append design_draft_discarded; versions untouched. Closed result retry idempotent.
- [ ] Tests: reason bounds, race two creates, second staff read-only, forbidden takeover, expired takeover, stale epoch save/heartbeat/discard, production/cancel race, event exactly-once, discarded draft allows a new draft.
- [ ] Run `node --test --experimental-strip-types src/test/design-draft-operations.test.ts`. Real lock/RLS proof is SQL + two-connection check in T10, not fake-repository assertions.

**Commit:** `feat(design): add audited draft ownership lifecycle`.

### T4 — Revision-aware autosave and private draft assets

**Dependency:** T3. **Goal:** durable semantic saves without lost updates or public uploads.
**Files:** create `src/lib/staff-draft-autosave.ts`, `src/lib/use-staff-draft-session.ts`, `src/app/api/admin/orders/[id]/design/draft-assets/route.ts`, `src/test/staff-draft-autosave.test.ts`, `src/test/staff-draft-assets.test.ts`; extend revision service/repository, `asset-repository.ts`, private serving boundary and 0004 RPCs.
**RLS:** no generic browser draft UPDATE; narrow server-authorized upload; no object overwrites. **UI:** save/error/conflict/ownership state consumed by T7.

- [ ] `save_design_revision_draft`: under locks check session/epoch/owner, eligible Order, expectedProduction, expectedRevision, product invariants, asset manifests, request replay. Atomically replace document, revision+1, status editing, clear assessment/readiness, timestamps, manifest refs. No Order event.
- [ ] Add bounded request JSON limits: 5 MiB draft JSON, 2,000 elements, finite numeric transforms, valid product IDs/types, known shape/option structures; reject remote arbitrary URLs and client-supplied signed URL identities. Preserve existing accepted schema within those explicit limits.
- [ ] Upload accepts PNG/JPEG/WebP, max 20 MiB each and 40 megapixels; read actual headers/dimensions, not MIME/name alone. Derived outputs use same path. Reject active SVG uploads through this endpoint; published library SVG stays its existing vetted route.
- [ ] Upload uses existing private Storage API, stable unique asset ID, checksum, uploader/draft/project association. Validate lease both before upload and at metadata attach. If ownership changes during upload, leave unreferenced candidate for GC; do not attach to closed/stolen draft or delete anything already referenced.
- [ ] Browser may display temporary blob while uploading; save/Preflight/approval cannot serialize unresolved blob/data URLs. Replace original + derived references with stable asset IDs/proxy identities; failed upload stays retryable and blocks saved status.
- [ ] Save queue exposes `enqueue(document)`, `flush(): Promise<void>`, `stop(reason)`, status listener. Inject clock/transport for deterministic tests; no UI framework dependency.
- [ ] Tests manually resolve two deferred saves to prove latest queued state uses returned revision. Check retry after lost response; same id/different payload denied; stale tab no overwrite; heartbeat doesn't change revision; failed upload cannot be approved; no guest storage writes. Representative CAS result:

```ts
assert.equal(firstSave.revision, loadedRevision + 1);
assert.equal(staleSave.ok, false);
if (!staleSave.ok) assert.equal(staleSave.code, 'REVISION_CONFLICT');
assert.deepEqual(reloaded.document, firstTabDocument);
```

- [ ] Run `node --test --experimental-strip-types src/test/staff-draft-autosave.test.ts src/test/staff-draft-assets.test.ts` then typecheck.

**Commit:** `feat(design): autosave staff drafts with fenced revision checks`.

### T5 — Server Preflight, atomic approval and durable render jobs

**Dependency:** T4. **Goal:** exactly one version/pointer/event per approval, never trust client pass.
**Files:** create `src/lib/services/staff-design-preflight.ts`, `scripts/state39-render-jobs.ts`, `scripts/state39-asset-gc.ts`, `src/test/staff-design-approval.test.ts`, `src/test/staff-design-preflight.test.ts`; extend revision/asset/version services and 0004 functions.
**UI:** no publication directly from Xong. **RLS:** assessment private; approval authenticated RPC with validated attestation.

- [ ] Run Preflight on server-loaded saved document, use actual private asset metadata and pinned fonts/catalog references; call shared getPreflight. Store assessment using server-only credentials AFTER verified role/lease/revision, then authenticated RPC CASes draft to ready_for_review without revision change. Race during calculation returns PREFLIGHT_STALE.
- [ ] Define warning IDs from stable finding IDs plus category/element/surface; require complete allowed-warning acknowledgement set. Do not override blocking checks for Admin.
- [ ] `approve_design_revision`: authenticate → lock Order/Project/Draft → handle previously approved idempotent replay → eligibility/lease/revision/base/assessment/manifest checks → allocate project version_number under project row lock → INSERT immutable version with lineage/reason/source/actor/Preflight+acks/product snapshot → copy manifest refs → update production pointer + design_status approved → close draft approved/resultVersionId/release lease → append design_revision_approved and enqueue render job → commit. No financial/hold/fulfillment writes.
- [ ] Version insertion UNIQUE(project_id,version_number), UNIQUE(revision_draft_id) plus closed-draft result prevents duplicate v2 under concurrent approve, retries and lost response. Failure before commit leaves no partial version/pointer/event. Earlier Storage uploads remain candidates, not evidence of approval.
- [ ] `approve_customer_design_as_production`: expected customer/production identity, same-project refs, no active draft, eligible Order, valid server assessment + warnings. Set design_status approved and retain production=customer, append design_approved_as_is. No version insert, no customer snapshot changes. Repeat with same requestId returns same success/event.
- [ ] If production moved, return PRODUCTION_CHANGED. Keep draft read-only for inspection/recovery. Explicit discard + new draft from current or selected historical version is the only rebase; never overwrite pointer or merge automatically.
- [ ] Render job uses exact stored version and shared renderer, fetches fonts/assets privately, writes `<version-id>/<content-hash>.png` once. Claim jobs with SKIP LOCKED + expiry, retries recover after worker crash; failed generation records safe error/category and leaves version approved. State38 existing path is reused for old versions; new renditions attach to artifact table, not UPDATE committed version.
- [ ] GC command defaults dry-run, deletion requires explicit flag. Only claim 7-day unreferenced draft assets under same asset lock protocol used by save/approve; mark deleting so new refs fail, remove via Storage API, then finalize metadata. Missing objects idempotent, transient failures retry; never cascade-delete versions. Deployed scheduler/worker setup documented, not assumed.
- [ ] Test v1 unchanged byte-for-byte after saves/v2/v3; as-is creates no v2; two approvals one result; invalid assessment injection; stale hash/revision/epoch/validator; warning actor recorded; cancellation/production starts during evaluation; held order approval preserves Hold; thumbnail failure doesn't roll back; GC retains referenced binaries/fonts/customer originals.
- [ ] Run `node --test --experimental-strip-types src/test/staff-design-approval.test.ts src/test/staff-design-preflight.test.ts`; database atomicity verified later in T10.

**Commit:** `feat(design): approve immutable production revisions atomically`.

### T6 — Add staff context to existing Editor Core without forking

**Dependency:** T1; backend callbacks connected by T7. **Goal:** same editing tools, different persistence/capabilities.
**Files:** modify `customizer-shell.tsx`, `design-canvas.tsx`, `editor-sheets.tsx`, `bottom-navigation.tsx`, `layers-sheet-content.tsx`, `src/lib/{product-state,use-design-history,multi-selection,grouping,use-editor-shortcuts}.ts`; create `src/test/editor-context.test.ts`; existing history/interaction tests remain regression gates.
**Schema/RLS/server:** none; UI policy does not replace T2–T5 enforcement.

- [ ] Extend CustomizerShell optional discriminated context; omitted prop follows existing launcher/local hydrate/local autosave. Staff initializes from supplied server draft/version and `resetHistory` once per session/draft identity, never from window search/localStorage.
- [ ] Route autosave/upload/exit/Xong through context callbacks. Staff never calls saveRecentProject/flushAutosave/checkout draft creation or launcher navigation. Font search/viewport/history remain memory/session-local; no staff document persisted into guest project keys.
- [ ] Pass mode/capability into same history mutation boundary and transitionState helpers with guest default. Guard executeAction, dispatchDirect, setState callbacks, manual entries, undo/redo, transforms, measurement writes, paste/delete/duplicate/reorder and text edit. Review may inspect/select but no state-changing callback reaches document.
- [ ] Replace hardcoded `.locked` eligibility checks across shell/canvas/grouping/multi-selection with shared canMutateElement policy. Retain locked metadata in before/after/history/server document; do not temporarily clear every lock or fork reducer.
- [ ] Staff business-option controls hidden and reducer policy rejects denied actions, including direct SET_ELEMENTS/SET_PRODUCT_OPTION payload bypasses. Server validator independently checks immutable config. Product-specific artwork controls remain available.
- [ ] Add controlled view props to shared product preview if needed: activeCardSurface/pattern output/view/viewport are UI state, not document edits. Read-only text auto-measure must not mutate historical JSON.
- [ ] Run `node --test --experimental-strip-types src/test/editor-context.test.ts src/test/history-transaction.test.ts src/test/use-design-history.test.ts src/test/multi-selection.test.ts src/test/grouping.test.ts src/test/editor-shortcuts.test.ts`. Tests exercise mutations denied/allowed and lock metadata surviving undo/redo, not source strings.
- [ ] Browser smoke customer all product tools + staff same tools; verify guest recent-project keys unchanged during staff use. No second canvas implementation.

**Commit:** `feat(editor): reuse core in read-only and staff draft contexts`.

### T7 — Review entry, draft recovery and staff shell

**Dependency:** T3+T4+T6. **Goal:** secure review-first UX and resumable editing.
**Files:** enhance prerequisite `src/app/admin/orders/[id]/design/page.tsx`; create `design-review-client.tsx`, `src/app/api/admin/orders/[id]/design/route.ts`, `src/components/admin/{design-review,design-revision-dialogs}.tsx`; extend `use-staff-draft-session.ts`.
**Schema/RLS:** no new schema. **Server:** reads/RPCs only through verified services.

- [ ] Server loader calls requireCurrentStaff; load Order identities, active draft SUMMARY, lightweight versions list. Fetch full selected production document only; selected version constrained to Order project. Customer version loaded only on selection.
- [ ] Entry REVIEW; display “Phiên bản khách duyệt • v1” and current production vN labels. “Duyệt không cần sửa” only in initial customer/production state and no active draft; “Tạo bản chỉnh sửa” opens required-reason dialog.
- [ ] Existing draft banner: same owner “Bạn có bản chỉnh sửa chưa hoàn tất.” + Tiếp tục chỉnh/Hủy bản nháp. Other user shows display name/activity/start time + Xem chỉ đọc; Admin takeover only expiry-confirmed. Read-only viewers never heartbeat.
- [ ] Bind Staff Editor to saved draft, save queue and lease heartbeat; show saved/saving/error/conflict explicitly, never toast “saved” before acknowledgement. Stop on role/lease/Order-state change; don't discard local content during refetch.
- [ ] Production locked text: “Sản xuất đã bắt đầu. Thiết kế hiện được khóa.” Completed/cancelled still permit historical review, not mutations. Payment pending still permits design review.
- [ ] Add reason/discard/takeover accessible dialogs with specified copy; Back flushes or asks before losing unsaved content. Dialog cancellation never mutates server.
- [ ] Browser checks 390×844 + 1440×900: keyboard/screen-reader dialog flow, no overflow, readable layers, all three Card surfaces, zoom/pan without modifying version. Cover review/owner/other-owner/stale/locked/loading/error/not-found states. Use throwaway browser assertions; retain only meaningful domain tests from T6, not static markup-copy tests.

**Commit:** `feat(admin): add review-first design and resumable staff editing`.

### T8 — Staff Preflight, comparison and approval interactions

**Dependency:** T5+T6+T7. **Goal:** Xong means inspect/compare, never auto-publish.
**Files:** create `src/components/admin/design-compare.tsx`; modify shared `editor-preflight-mode.tsx`, `editor-preview-mode.tsx`, staff review client/dialogs; create `src/test/design-review-transitions.test.ts`.
**Schema/RLS:** none. **Server:** T5 operations; same error model.

- [ ] Replace checkout-specific Preflight callback with `onContinue` + `continueLabel` contract and migrate every existing caller. Guest label/flow preserved, staff label “So sánh bản sửa”; read-only review exposes no edit/submit action. Reuse existing finding list/fix navigation, no validator fork.
- [ ] Xong finishes transaction → flushes queue/uploads → runs authoritative server Preflight. Blocking findings return staff to exact surface/element. Allowed warnings require explicit acknowledgement. Back to edit preserves draft and invalidates ready assessment on next change.
- [ ] Compare loads base full version and current saved draft only. Mobile toggle preserves surface/view/zoom; desktop side-by-side same renderers. Add read-only earlier-version selection outside compare; no pointer change on selection.
- [ ] Show reason and optional final note. If note changes after assessment, save it through revision CAS and rerun assessment before enabling approval; no unguarded last-second content edits.
- [ ] “Duyệt bản sửa” confirmation: “Dùng bản chỉnh sửa này để sản xuất?” / “Bản khách duyệt v1 vẫn được giữ nguyên.” / “Bản chỉnh sửa sẽ trở thành phiên bản sản xuất.” Submit one idempotent action, disable double taps. As-is uses own server assessment and confirmation, no duplicate version.
- [ ] Success disposes timers/lease subscriptions/upload callbacks, resets staff history, exits to State38 detail/refetch. Failure stays in compare with content intact; PREFLIGHT_STALE routes to Preflight, PRODUCTION_CHANGED to safe read-only recovery, ORDER_LOCKED to locked review.
- [ ] Tests assert state transitions: editing → saved → preflight → compare → approved; stale save/assessment cannot publish; Back retains draft; no checkout callback from staff mode; same-surface comparison for Card and same full output for wrapping.
- [ ] Run `node --test --experimental-strip-types src/test/design-review-transitions.test.ts` and browser matrix for wrapping pattern/full-sheet, card horizontal/vertical, die-cut, fixed shapes, notebook; verify cutline/border and derived assets accurately represented.

**Commit:** `feat(admin): compare and explicitly approve staff artwork`.

### T9 — Integrate State 38 detail, Inbox, audit and Realtime

**Dependency:** T8. **Goal:** operational changes visible without altering financial/hold semantics.
**Files:** existing `src/lib/admin/order-next-action.ts`, `src/lib/domain/order.ts`, order/version/event repositories; prerequisite `src/lib/admin/realtime.ts`, detail client, order-design-card, order-next-action-card, timeline, order-row/thumbnail; extend `src/test/order-next-action.test.ts`, create `src/test/design-revision-integration.test.ts`.
**Schema/RLS:** narrow authorized draft/order event subscription only; no public payloads.

- [ ] State38 Design action becomes “Xem & kiểm tra” linked to existing design route. Show customer and production labels separately. Summary/version list query omits design_document, fetches only id/number/source/creator/time/reason/render path.
- [ ] Resolver keeps State38 Hold/payment priority and terminal behavior. Insert active editing action `continue_design_edit` when design work is next; direct Design section remains available before payment. paid+approved+noHold eligible fulfillment gives ready; Hold not released by approval.
- [ ] Add derived Inbox attention for design editing and stale drafts; one row even with multiple reasons. Terminal Orders excluded. Production thumbnail query uses explicit production FK join, never latest project version; guest confirmation keeps customer FK.
- [ ] Add human-readable event templates for created/approved-as-is/revision-approved/discarded/taken-over; actor + version + short reason only, no entire document. Omit review_started to avoid read-event spam; no autosave events.
- [ ] Narrow realtime invalidation for Order/draft business state; refetch after mutation/focus/reconnect and existing polling fallback. Do not load complete draft document for every background event; dirty owner receives conflict banner, not silent replacement. Others see ownership/closed status without collaborative rendering.
- [ ] Tests Hold priority after approval, paid editing resume, unpaid direct review, production thumbnail v2/customer v1, future v3 and old versions queryable, event exactly-once/no autosave, reconnect fresh state, unauthorized subscriptions/reads denied.
- [ ] Run `node --test --experimental-strip-types src/test/order-next-action.test.ts src/test/design-revision-integration.test.ts`; browser Back restores detail/Inbox URL state and scroll.

**Commit:** `feat(admin): reflect production revisions in detail inbox and timeline`.

### T10 — Seed, deployed SQL proof, concurrency QA and documentation

**Dependency:** T0–T9, user-confirmed SQL deployment for live checks. **Goal:** operational proof, not merely a rendered page.
**Files:** extend `supabase/seed.sql` or isolated `supabase/seed_state39.sql` without production PII; `supabase/tests/state39_design_revisions.sql`; create `scripts/state39-concurrency-smoke.ts`; README + `docs/superpowers/state39-design-revisions-runbook.md`.
**Server/RLS/UI:** verification of all prior tasks, no new feature scope.

- [ ] Seed isolated orders: editable v1, approved-as-is, active owner draft, expired lease, v2 lineage, held order, in-production/completed/cancelled, failed render, missing asset, warning and blocking Preflight, all supported products. Real staff Auth IDs supplied locally, not fake auth.users inserts or hardcoded passwords.
- [ ] Provide operator SQL bundle: existing 0001/0002 + completed 0003 + 0004, ordered migration ledger and assertions. On a disposable Supabase instance verify empty-schema creation AND upgrade from seeded State38; backfill leaves customer pointer/JSON/assets unchanged. Never run destructive clean migration on VPS production.
- [ ] SQL tests run in transaction with rollback and set authenticated JWT subject/role for anon, nonstaff, Editor A/B, Admin. They assert exact rows/results, not bare statement success. Test direct UPDATE/DELETE and malicious cross-project refs, forged assessment and direct privileged RPC execution.
- [ ] Concurrency script uses two independent authenticated Supabase clients, barriers instead of sleeps: two create drafts (one success), two saves expected N (one N+1), two approvals (one version/event), stale takeover vs save, production lock before approval. Check persisted rows using authorized fixtures; test cleanup removes only fixture namespace under explicit test permission.
- [ ] Add SQL negative proof:

```sql
-- Execute under authenticated Editor fixture, inside rollback-only test transaction.
-- Expected: insufficient_privilege or immutability exception; original JSON unchanged.
update public.design_versions
set design_document = '{"tampered":true}'::jsonb
where id = current_setting('test.customer_version_id')::uuid;
```

- [ ] Unit sequence per task: red test → minimal implementation → focused green. Final integration owner runs:

```bash
pnpm test
pnpm typecheck
pnpm build
node --experimental-strip-types scripts/state39-concurrency-smoke.ts
node --experimental-strip-types scripts/state39-render-jobs.ts --once
node --experimental-strip-types scripts/state39-asset-gc.ts --dry-run
```

Last three commands require user-authorized test environment; scripts must validate test target before writes and never print secrets/signed URLs. SQL assertions may run through approved SQL client/Editor if Supabase CLI unavailable; do not require Docker on this workstation.

- [ ] Manual QA (Admin and Editor, mobile and desktop): v1 as-is/no v2; create reason/edit/autosave/reload/Preflight/compare/approve v2; new revision from v2 gives v3; older v1 restore yields new v4, never pointer reset; two staff ownership + stale Admin takeover; same-user tabs stale conflict; production begins between load and submit; Hold survives approval; draft discard leaves v1/v2; upload/derived mask survives reload; blocked/warning Preflight; thumb worker outage/recovery; private asset expiration refresh; Back/close with pending save; logout/revoked role while editing.
- [ ] Regress customer editor/local projects, checkout/State36, Inbox/State38 payment and Hold actions, private Storage/RLS. Confirm staff editing never writes guest draft keys or extends access to customer operational drafts.
- [ ] Document pointers/lineage, draft vs version, lease+epoch, CAS/conflict recovery, atomic approvals, Preflight attestation, asset refs/GC, render jobs/scheduling, audit/RBAC/RLS, production lock, staff role bootstrap reuse, troubleshooting. Update State37/38 plan notes only for changed pointer/thumbnail contracts, not unchecked-box guessing.
- [ ] Record actual test/build results, screenshots/manual steps, DB role/concurrency outputs and remaining blockers. State39 is not complete until every Done criterion below is exercised.

**Commit:** `test(design): verify staff revision lifecycle and document operations`.

## 6. Requirement traceability

Each numbered range is inclusive; task references point to implementation and verification, not proof of completion.

| User requirements | Decision / task |
|---|---|
| 1–3 primary goal/repo inspection/editor reuse | Evidence, Gate0, T0, T6–T8 |
| 4–7 customer/production/lineage | 2B, T2, T5, T9 |
| 8–12 mutable draft/status/active uniqueness | 2C, T2–T3 |
| 13–16 review entry/read-only/actions | 2G, T6–T7 |
| 17–19 as-is atomic approval/event | 2B/2E, T5, T8 |
| 20–21 eligibility/races | Global constraints, T3–T5/T10 |
| 22–26 reason/atomic creation/base/later revision | 2B/2C, T3 |
| 27–30 server drafts/autosave/recovery | 2D, T4/T7 |
| 31–37 ownership/no collaboration/lease/takeover | 2C, T3/T7/T10 |
| 38–42 shared staff editor/identity/customer locks | 2G, T1/T6/T7 |
| 43–46 frozen config/allowed artwork/intent/Hold | 2G, T1/T4/T9 |
| 47–50 private upload/originals/GC | 2F, T4/T5 |
| 51–55 shared Preflight/blockers/warnings | 2E, T5/T8 |
| 56–64 compare/product surfaces/reason/no diff | 2G, T6/T8 |
| 65–71 explicit atomic approval/version numbering/pointers | 2B/2E, T2/T5/T8/T10 |
| 72–76 status/discard/history preservation | 2C, T3/T9 |
| 77–79 audit/no autosave spam | T3/T5/T9 |
| 80–85 Editor approval/RBAC/function security/RLS/immutability | Global constraints, T2–T5/T10 |
| 86–91 Realtime/CAS/tabs/conflicts/no merge | 2C/2D, T4/T9/T10 |
| 92–97 private assets/signed URLs/renders/fidelity/export boundary | 2F, T4/T5/T10 |
| 98–101 production review/history/old selection/restore | 2B/2G, T3/T7/T8 |
| 102–104 production/completed/cancelled read-only | Global constraints, T3–T7/T10 |
| 105–113 navigation/flush/session cleanup/history/reload | 2D/2G, T4/T6–T9 |
| 114–115 server Preflight revision authority | 2E, T5/T8 |
| 116–119 Hold/payment/cancellation independence | Global constraints, T3/T5/T9/T10 |
| 120–126 next action/Inbox/timeline/query/compare efficiency | T7–T9 |
| 127–128 shared serialization/schema migration | Evidence, T1/T6; use current DesignState/legacy migration, no historic rewrites |
| 129–136 additive schema/uniqueness/atomicity/stale base | T2–T5/T10 |
| 137–150 automated immutability/as-is/drafts/save/tabs/takeover/assets/permissions/UI tests | T1–T10 focused tests and browser checks |
| 151–156 six manual scenarios | T10 manual matrix |
| 157–158 executable format/order | Task dependencies, file map, T0–T10 |
| 159–161 regression/verification/docs | T0/T10 |
| 162 explicit deferrals | Global constraints and exclusions below |
| 163 23 Done criteria | Matrix below |

## 7. Definition-of-Done evidence matrix

| # | Required observable outcome | Verification owner |
|---|---|---|
| 1 | Authorized staff reads customer version read-only | T2/T7 role + browser matrix |
| 2 | Customer JSON/config/assets/thumbnail immutable | T2 DB/Storage denial + T5 v1 byte-equality |
| 3 | As-is approves without duplicate version | T5/T10 DB version/event counts |
| 4 | One active server draft per order | T2 partial index + T3/T10 concurrent creation |
| 5 | Required revision reason | T1/T3/T7 bounds/dialog |
| 6 | Same Editor Core | T6 guest/staff behavior regression |
| 7 | Staff saves in Supabase | T4/T10 saved document query |
| 8 | Reload restores server draft | T7/T10 reload scenario |
| 9 | Stale save cannot overwrite | T4/T10 two-client CAS |
| 10 | Other staff cannot duplicate active draft | T3/T10 unique/RBAC assertions |
| 11 | Admin stale takeover fenced/audited | T3/T10 epoch + event |
| 12 | Existing Preflight engine governs draft | T5/T8 same findings/server attestation |
| 13 | Product-aware before/after | T8 mobile/desktop screenshots |
| 14 | Authorized atomic approval | T5/T10 rollback/race/RLS |
| 15 | New immutable DesignVersion | T2/T5 insert + denied mutation |
| 16 | Customer pointer unchanged | T5/T10 v1→v2→v3 |
| 17 | Production pointer advances | T5/T9/T10 v2/v3 source |
| 18 | Meaningful accurate audit | T3/T5/T9 events, no saves |
| 19 | Production start blocks mutation | T3–T5/T10 race and locked UI |
| 20 | Detail and Inbox reflect state | T9/T10 refetch and thumbnail |
| 21 | Auth/RBAC/RLS enforcement | T2/T10 real identities and direct API attacks |
| 22 | Existing/new behavioral tests green | T0 baseline vs T10 final results |
| 23 | Production build green | T10 pnpm build |

## 8. Explicit exclusions and handoff

No customer revision portal, messaging/comments, live collaborative editing/cursors, CRDT, object/pixel/text diff, merge/rebase engine, partial merges, product/price/quantity/address changes, post-production override, print/export pipeline, production-status mutation or customer account migration.

Current deliverable is this implementation plan. SQL migration files, new routes, staff editor callbacks, workers and tests named above are planned outputs, not claimed present. Only execute after prerequisites are satisfied. On implementation handoff choose subagent-driven task batches or inline executing-plans; neither choice authorizes remote database writes before the user's SQL deployment confirmation.
