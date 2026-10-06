# State 45: Release Hardening — Reliability, Recovery, Observability & E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make States 01–44 safe to ship under failure conditions: preserve customer work, prevent duplicate business effects, recover interrupted workflows, expose safe actionable failures, and make critical failures diagnosable.

**Architecture:** Keep existing product/editor/checkout/payment/production business rules. Add only thin reliability contracts around current repositories, RPCs, route handlers, browser persistence, error boundaries, and test seams. Supabase remains canonical for authenticated projects and business state; guest editing remains local-first. Critical mutations resolve through transactionally idempotent server operations and expected-revision/status checks; no last-write-wins, merge engine, service-worker queue, saga framework, or full offline mirror.

**Tech Stack:** Next.js 16.3.6 App Router, React 19.3, TypeScript 7, Supabase Postgres/Auth/Storage/RLS, Tailwind CSS v4, existing Base UI/shadcn primitives, Playwright 1.63, Node built-in test runner, pnpm 12.6.

**Spec:** User-provided State 45 requirements in the task request; repository references `docs/superpowers/plans/2026-10-04-state-44-product-catalog-variant-pricing-admin.md`, `docs/superpowers/state37-supabase-runbook.md`, `docs/superpowers/state39-design-revisions-runbook.md`, `docs/superpowers/state40-fulfillment-runbook.md`, `docs/superpowers/state42-asset-library-runbook.md`, `docs/superpowers/state43-template-management-runbook.md`, and `docs/superpowers/state44-product-catalog-pricing-runbook.md`.

## Global Constraints

- No new major business feature. Preserve existing editor interactions, payment rules, product pricing, production lifecycle, Template lifecycle, and commercial model.
- Guest editing remains local-first. Do not create anonymous Supabase sessions on editor launch.
- Supabase is canonical for authenticated Projects and business state; browser storage is cache/recovery only.
- Expected revision, lease epoch, immutable version, and transaction status checks remain authoritative. Never add last-write-wins or an automatic merge engine.
- Customer artwork and production artifacts remain in private Storage buckets. Never expose service-role credentials or signed URLs in logs/client bundles.
- Production readiness remains derived. Starting production explicitly freezes the selected production DesignVersion and Artifact Set snapshot.
- Starting production, completing production, generating artifacts, payment confirmation, and Publish operations retain server-side role enforcement; only Admin may perform the administrator-only operations.
- Guest order claims require authenticated user plus valid guest proof. Never claim by phone/email matching.
- Expected business failures return stable domain codes/safe messages. Unexpected failures are reported through structured redacted diagnostics and route/component boundaries.
- Do not add full PWA, background sync, push, offline Supabase mirror, distributed saga/workflow engine, analytics dashboard, support ticketing, full WCAG remediation, Core Web Vitals project, or full Safari visual polish.
- Do not weaken tests, RLS, Storage policies, verification scripts, or release gates to make checks pass.
- Existing Base UI/shadcn components and visual tokens remain the feedback surface. Do not redesign the product UI.
- No lint script or ESLint dependency exists in current `package.json`; Task 14 must add one minimal repository-approved lint command before claiming the lint release gate, rather than silently omitting lint.

---

## 1. Repository facts and current architecture

Verified during planning:

- App Router routes live under `src/app`. Only `src/app/admin/orders/[id]/error.tsx` currently exists as a route-level boundary. Next 16.3.6 supports `src/instrumentation.ts`, `src/instrumentation-client.ts`, `onRequestError`, and `error.tsx` with `reset()`; implementation must follow the installed docs in `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/`.
- Existing server actions are in `src/app/admin/orders/[id]/actions.ts`, `src/app/admin/orders/[id]/design/actions.ts`, and `src/app/admin/products/actions.ts`.
- Existing API routes include `src/app/api/orders/route.ts`, `src/app/api/orders/[id]/route.ts`, `src/app/api/orders/[id]/payment/route.ts`, `src/app/api/orders/[id]/payment/report/route.ts`, `src/app/api/quotes/route.ts`, `src/app/api/admin/content/**`, and template routes under `src/app/api/templates/**`.
- Existing Supabase clients are `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`, and `src/lib/supabase/admin.ts`. `createServerSupabaseClient()` is publishable-key SSR; `createPrivilegedSupabaseClient()` is server-only service-role access.
- Current browser persistence is `sessionStorage` for `print-customizer-state-v1`, `print-customizer-order-v1`, and `quynhtrang_checkout_draft_v1`; `localStorage` for `quynhtrang-recent-projects-v1`; no `indexedDB` or Cache API implementation exists.
- Guest persistence is implemented in `src/lib/storage.ts`; upload data is created by `src/lib/upload.ts`; `src/lib/asset-store.ts` promotes design assets to private `customer-assets` during order preparation.
- Authenticated Project autosave uses `src/lib/services/cloud-project-autosave.ts` and SQL RPC `save_customer_project_revision` in `supabase/migrations/0006_state41_account_migration.sql`.
- Staff Design Draft autosave uses `src/lib/draft-autosave.ts`, `src/lib/staff-draft-autosave.ts`, `src/lib/use-staff-draft-session.ts`, and `src/app/admin/orders/[id]/design/design-review-client.tsx`. Template Draft autosave/lease uses `src/lib/use-template-draft-session.ts` and template draft API routes. Commercial Draft saving is manual through `src/components/admin/commercial-config-editor.tsx` and `src/app/admin/products/actions.ts`.
- Checkout state uses `src/lib/checkout-draft.ts` and `src/app/checkout/page.tsx`. Order preparation is `src/lib/services/prepare-order-from-guest-checkout.ts`; Supabase route wiring is `src/app/api/orders/route.ts`. Existing order idempotency uses `orders.idempotency_key` and a deterministic guest token derived from the idempotency key.
- Payment report route currently calls `PaymentRepository.markCustomerReported()` and appends an event separately, despite atomic RPC `report_checkout_payment` existing in `supabase/migrations/0017_state44_payment_purposes.sql`.
- Admin payment confirmation uses `confirm_order_payment` in `0017_state44_payment_purposes.sql`. Hold/release uses `0003_state38_order_operations.sql`. Design approval is in `0004_state39_design_revisions.sql`. Fulfillment uses `0005_state40_fulfillment_operations.sql`, overridden by `0018_state44_payment_readiness_cutover.sql` for readiness/payment semantics.
- Render worker is `scripts/state39-render-jobs.ts`; renderer is `src/lib/services/document-renderer.ts`; worker output is stored in `approved-renders` and recorded in `design_version_renders`.
- Content/template/commercial services are `src/lib/services/asset-library.ts`, `src/lib/services/template-management.ts`, `src/lib/services/template-assets.ts`, and `src/lib/services/commercial-config-service.ts`, with API routes under `src/app/api/admin/content/**` and actions under `src/app/admin/products/actions.ts`.
- Existing tests use `node:test` with `node --test --experimental-strip-types`. Relevant test files include `storage-retention.test.ts`, `guest-storage-lifecycle.test.ts`, `asset-store.test.ts`, `cloud-project-autosave.test.ts`, `staff-draft-autosave.test.ts`, `template-draft-concurrency.test.ts`, `checkout-draft.test.ts`, `order-preparation.test.ts`, `orders-api.test.ts`, `payment-flow.test.ts`, `customer-order-claim.test.ts`, `local-project-migration.test.ts`, `state44-concurrency.test.ts`, and the State 37–44 SQL test scripts.
- `scripts/state43-template-smoke.ts` already uses Playwright Chromium, screenshots, route observation, and a test staff environment bypass; it starts `next dev`, so State 45 must add production-build coverage without deleting this smoke utility.
- Local Supabase config is `supabase/config.toml` with API 54321, DB 54322, Studio 54323, Inbucket 54324, Storage limit 50MiB, and Auth enabled. `supabase` CLI 2.109.1, Node 25.2.1, pnpm 12.6.0, Next 16.3.6, and Playwright 1.63.0 are installed. `psql` and Docker are not available in this workstation shell; CI/staging must provide the documented SQL execution environment.
- Current commands are `pnpm test`, `pnpm typecheck`, `pnpm build`, and the exact SQL/smoke commands in `README.md:34-90`. There is no current `lint` script.

### Confirmed P0/P1/P2 gaps

- **P0 — production trust-boundary bypass:** `src/lib/admin/authorization.ts:60-77,95-117` and `src/proxy.ts:71` accept `SMOKE_TEST_STAFF_ROLE` / `smoke_staff_role` without a production-only guard. This can synthesize Admin identity and reach privileged routes. Fix before any release.
- **P0 — order route passes unprivileged SSR client to privileged preparation:** `src/app/api/orders/route.ts:69-104` passes `createServerSupabaseClient()` into `prepareOrderFromGuestCheckout`; real RLS denies required inserts. Keep publishable client only for auth context; use server-only privileged repositories for the preparation transaction.
- **P0 — guest account claim is unreachable after successful order:** `src/app/api/orders/route.ts:118-130` puts the token only in an HttpOnly cookie and omits it from JSON; `src/app/checkout/page.tsx:578-586` does not pass a token to `OrderConfirmationPanel`; `account-save-dialog.tsx` receives an empty token. Prefer a server-side claim endpoint that reads the HttpOnly cookie, avoiding token exposure to JavaScript.
- **P0 — customer payment report bypasses atomic RPC:** `src/app/api/orders/[id]/payment/report/route.ts:62-71` performs separate status/event writes. It can downgrade a paid order and can leave status changed without an event. Cut over to `report_checkout_payment`.
- **P0 — production role drift:** `src/lib/services/admin-fulfillment-operations.ts:79-106` calls `requireCurrentStaff()` without `admin`; `0005_state40_fulfillment_operations.sql` and `0018_state44_payment_readiness_cutover.sql` allow editor. Enforce Admin in service and latest SQL RPCs.
- **P1 — cloud Project reopen broken:** `/my-designs` links `/?project=<id>` (`src/components/customer/my-designs-list.tsx:112`), but `src/components/customizer/customizer-shell.tsx:399-405` ignores `project` and `src/app/page.tsx:7` does not provide authenticated context. This silently falls back to local/session state.
- **P1 — revoked guest `blob:` URLs:** `src/lib/upload.ts:60-70` stores object URL plus base64, and `src/lib/storage.ts:160-188` serializes the object URL. After restart, canvas uses dead `blob:` URL (`src/components/customizer/design-canvas.tsx:685,877`) although data exists.
- **P1 — render jobs cannot reclaim crashed running jobs:** `scripts/state39-render-jobs.ts:20-56` only selects pending/failed jobs and does not atomically claim with `SKIP LOCKED` or reclaim expired `running` jobs.
- **P1 — render record retry is not idempotent:** `scripts/state39-render-jobs.ts:81-91` inserts `design_version_renders` by primary key after upload; upload/response loss can make retry fail on duplicate row.
- **P1 — commercial Publish loses successful result on response loss:** `supabase/migrations/0015_state44_catalog_operations_publish_signature.sql:45-90` deletes the draft and records a non-unique event but does not persist request-to-version replay data.
- **P1 — staff save flush swallows errors:** `src/lib/staff-draft-autosave.ts:60` catches and ignores flush failures; `design-review-client.tsx:344` can proceed after failed persistence.
- **P1 — Template heartbeat has no transient retry:** `src/lib/use-template-draft-session.ts:153` can lose a 30-second heartbeat during a transient network drop while the lease lasts 120 seconds.
- **P1 — local migration can persist dead blob URLs:** `src/lib/services/local-project-migration.ts:98` writes local image state without guaranteed asset promotion.
- **P1 — order rollback leaves project/assets:** `src/lib/services/prepare-order-from-guest-checkout.ts:139-153,280-286` deletes only the Order after downstream failure.
- **P2 — render completion does not update the thumbnail source read by Admin Order Detail:** worker records `design_version_renders`, while `src/lib/repositories/order-repository.ts:340` reads `design_versions.approved_thumbnail_path`.
- **P2 — only one route boundary:** Admin catalog/template routes have no local error boundary.
- **P2 — raw console logging:** API routes and client code log arbitrary errors; no structured redaction/correlation layer exists.

---

## 2. Failure Matrix — completed planning artifact

The matrix uses four explicit operation contracts. Each operation row maps to one contract and adds its repository-specific source, current evidence, and required recovery. This answers the fifteen required questions without inventing a separate policy for every endpoint.

### Contract L — local durable browser write

1. Source of truth: last successfully committed guest Project/asset record in browser storage; memory is current working state only.
2. Mutating: yes.
3. Idempotency: stable Project/asset ID plus schema/revision; same write replaces that record, never creates an implicit second Project.
4. Failure before persistence: prior record remains; current memory remains dirty.
5. Commit with lost acknowledgement: read record/revision after retry before saying saved.
6. Retry: exact same record identity and payload only.
7. Refresh: restore last durable state and quarantine malformed record.
8. Close: cannot guarantee pending memory; correctness depends on prior debounced writes, not unload.
9. Other tab: reject stale write or surface conflict; do not overwrite newer record.
10. Changed state: explicit conflict/reload path.
11. Automatic retry: exact local transaction only; bounded.
12. Refetch before retry: storage metadata after ambiguous completion or competing tab write.
13. Never optimistic success: `Đã lưu` only after durable write resolves.
14. User state: keep memory, show `Chưa thể lưu`, `Thử lại`, and a meaningful unsaved-navigation warning.
15. Diagnostics: stable code, operation ID, storage key/schema, element count/serialized size/estimate; no design content.

### Contract A — revisioned server autosave/draft

1. Source of truth: Supabase document/draft row; client tracks acknowledged server revision, local base revision, and pending snapshot separately.
2. Mutating: yes.
3. Idempotency: stable save request ID plus expected revision/hash where current RPC supports it.
4. Failure before receive: server unchanged; pending local work retained.
5. Commit with lost response: unknown outcome; read row/revision/request cache before retry.
6. Retry: same base revision and request only; advanced revision becomes conflict.
7. Refresh: load canonical row plus recoverable pending local snapshot.
8. Close: prior durable local recovery only; no unload server mutation.
9. Other tab/session: expected revision, lease session, and epoch fence stale writes.
10. Changed state: conflict; no silent overwrite.
11. Automatic retry: bounded only when operation is known idempotent and base revision is unchanged.
12. Refetch: reconnect, unknown response, lease expiry, or conflict.
13. Never optimistic success: only authoritative save response/refetch marks saved.
14. User state: `idle`, `saving`, `saved`, `unsynced`, `conflict`, `error`; preserve current document.
15. Diagnostics: operation/request ID, base/current/new revision, lease epoch, role, duration, stable code.

### Contract R — read/quote/payment-display acquisition

1. Source of truth: server Catalog/Order/payment requirement; issued Quote has identity and expiry.
2. Mutating: normally no; Quote issuance/consumption is separately classified as transactional.
3. Idempotency: reads replay; quote refresh must not silently change an already accepted Order snapshot.
4. Failure before receive: preserve last input/state.
5. Lost response: refetch by stable quote/order/payment ID.
6. Retry: bounded exponential backoff with jitter for reads/network/transient 5xx only.
7. Refresh: recover selected Project, quantity, Quote ID/version/expiry and existing Order/payment requirement.
8. Close: no business mutation at unload.
9. Other session: server revalidates availability, active Variant, expiry, and economics.
10. Changed state: explicit price/availability/expiry message; require revalidation.
11. Automatic retry: safe reads only, bounded.
12. Refetch before action: when quote/payment/order freshness matters.
13. Never treat cache as acceptance: cached quote/QR is display-only until server confirms.
14. User state: preserve form/design and show contextual retry.
15. Diagnostics: route, safe IDs, product/Variant code, duration, code; no PII or payload.

### Contract M — high-impact transactional mutation

1. Source of truth: database state plus append-only event/audit row in one transaction.
2. Mutating: yes.
3. Idempotency: stable intent/request ID, target/payload hash, unique transaction record or existing result replay.
4. Failure before receive: no effect.
5. Commit with lost response: `UNKNOWN_OUTCOME`; never display failure as permission to create a new intent.
6. Retry: same intent/payload returns original result; different payload conflicts.
7. Refresh: stable entity ID/intent loads authoritative state.
8. Close: committed action remains; incomplete UI is recoverable through refetch.
9. Other session: row lock/status/revision/unique index allows one logical transition.
10. Changed state: conflict/current-state result.
11. Automatic retry: only after explicit replay proof; otherwise refetch first.
12. Refetch: unknown response, stale status, or competing action.
13. Never optimistic success: payment, Order, immutable approval, Publish, and production require server proof.
14. User state: pending/unknown/conflict with retry/refetch and optional short support reference.
15. Diagnostics: operation/request ID, target ID, role, status, revision, duration, stable code; no PII, tokens, SQL or document body.

### Contract U — asset upload / promotion

1. Source of truth: private Storage bytes plus database metadata; browser-local source remains until commit verified.
2. Mutating: yes, across Storage and metadata.
3. Idempotency: stable asset ID/content hash and deterministic owner-scoped path.
4. Failure before receive: item remains pending/failed; source is retained.
5. Lost response: reconcile metadata/object by stable ID/hash before retry.
6. Retry: missing file/stage only; successful uploads remain.
7. Refresh: reconstruct uploaded/failed status; require reselection only when browser File was never durably retained.
8. Close: committed files remain; unfinished file remains recoverable or clearly requires reselection.
9. Other session: ownership and stable ID prevent unrelated overwrite.
10. Changed state: revalidate draft/template/project ownership and revision.
11. Automatic retry: only safe object/metadata stage.
12. Refetch: after ambiguous upload/metadata acknowledgement.
13. Never show uploaded/attached before required bytes and metadata exist.
14. User state: per-file `pending`, `uploading`, `uploaded`, `failed`; retry missing items.
15. Diagnostics: file/asset ID, hash, MIME class, bytes, stage and stable code; no signed URL/content.

### Contract J — recoverable render/artifact job

1. Source of truth: `design_render_jobs`, immutable DesignVersion, Artifact Set metadata and verified private Storage objects.
2. Mutating: asynchronous.
3. Idempotency: stable job/version/input hash; one fenced worker attempt may finalize.
4. Failure before receive: job remains pending.
5. Lost response: read job/version/artifact status; do not create an uncontrolled second job.
6. Retry: failed or expired attempt only; never overwrite ready frozen output.
7. Refresh: authoritative job status.
8. Close/process crash: expired lease reclaims; no permanent `running`.
9. Other worker: atomic claim with `FOR UPDATE SKIP LOCKED`/fencing.
10. Changed design/version: stale worker cannot finalize.
11. Automatic retry: bounded attempt count/backoff.
12. Refetch: job/lease/input before retry.
13. Never mark ready until mandatory outputs and dependencies verify.
14. User state: failed/retryable; Order/DesignVersion stays valid; production blocks.
15. Diagnostics: job/attempt/version/release/stage/duration/error code; no document body.

### Contract G — guest claim/local migration

1. Source of truth: authenticated canonical records plus per-project local progress and valid guest proof.
2. Mutating: yes.
3. Idempotency: stable guest local ID, `origin_local_project_id`, order ID, and proof-bound claim result.
4. Failure before receive: local source/proof remains.
5. Lost response: query claim/mapping by stable identity/proof.
6. Retry: unresolved Project/stage only.
7. Refresh: resume progress; do not repeat successful claim.
8. Close: never delete local source before verified cloud record.
9. Other session: same account/identity converges; competing owner is conflict.
10. Changed state: server validates ownership/status/proof.
11. Automatic retry: proven idempotent stage only.
12. Refetch: after ambiguous claim/migration response.
13. Never announce/delete early: canonical verification first.
14. User state: account stays signed in; successful records remain; failed item retryable.
15. Diagnostics: operation/stage/counts and safe IDs; no phone/email/proof/token.

### Operation-specific matrix

| Operation | Contract / actual source | Verified current behavior | State45 target and user-visible result |
|---|---|---|---|
| Guest Project Save | L; `src/lib/storage.ts:160-193` → `localStorage` | 3-item/30-day lazy retention; whole image including base64/blob URL serialized; catches quota to false | IndexedDB blob records, metadata references, migration/quarantine, truthful save state; protect open/checkout/migration records |
| Guest Asset Save | L; `src/lib/upload.ts:60-70`, `src/lib/storage.ts:174` | base64 plus transient `blob:` URL; restart can render dead URL | Stable local blob ID; restore from durable bytes; no large base64 in localStorage |
| Authenticated Project Autosave | A; `save_customer_project_revision` in `0006_state41...`, `cloud-project-autosave.ts:42-109` | SQL CAS is correct; `/?project=` is ignored by `customizer-shell.tsx:399-405` | Load cloud project from authenticated route; preserve pending/unsynced state; stale revision dialog |
| Staff Design Draft Autosave | A; `staff-draft-autosave.ts`, `0004_state39...` | debounce, lease/epoch/request hash fencing; `flush()` swallows errors at line 60 | Flush failure blocks completion and exposes retry; stale/reconnect state retained |
| Template Draft Autosave | A; `use-template-draft-session.ts`, template draft RPC/routes | lease fencing and request log; heartbeat has no transient retry | bounded heartbeat retry, explicit lease conflict/takeover, refresh latest persisted draft |
| Commercial Config Draft Autosave | A/manual; `commercial-config-editor.tsx`, `commercial-config-service.ts` | manual CAS save, no continuous autosave/lease | preserve manual semantics; explicit `unsynced/conflict/error`, no pointer-frame requests |
| Asset Upload | U; `asset-library.ts`, `asset-repository.ts` | checksum dedupe; DB failure cleanup; retry creates new draft identity | stable intent/file status and reconcile unknown outcome; successful files persist |
| Template-owned Asset Upload | U; `template-assets.ts`, template API routes | draft ownership/asset operations exist; publish copies assets | stable draft/template ownership, partial retry, historical dependency resolution |
| Checkout PriceQuote | R; `src/app/api/quotes/route.ts`, `price-quote-service.ts` | 15-minute TTL, quote ID/session draft, server checks expiry/config | bounded read retry; refresh existing quote or explicit updated-price prompt |
| Guest Project Promotion | G/U; `prepare-order-from-guest-checkout.ts:139-153`, `asset-store.ts` | promotion hashes data; dead blob-only source fails; unprivileged route client breaks RLS | privileged server repositories; retain source; per-asset progress and cleanup reconciliation |
| Order Creation | M; `orders.idempotency_key`, `prepare-order...:127-133` | DB key/deterministic token; route passes wrong client; downstream rollback deletes Order only | same intent returns same Order/payment economics; response-loss recovery; complete rollback/reference cleanup |
| QR Generation | R; `src/app/api/orders/[id]/payment/route.ts`, `payment-qr-provider.ts` | derives payment data from Order snapshot | refresh existing requirement/reference; no new payment record/reference |
| Customer Payment Report | M; `report_checkout_payment` exists but route bypasses it | separate updates/event can downgrade paid | atomic RPC result `reported/already_reported/already_paid`; one event |
| Admin Payment Confirmation | M; `confirm_order_payment` in `0017...` | row locks/purpose/amount checks; idempotency requires verified request behavior | replay original confirmation; one event/time/actor; unknown outcome refetch |
| Order Hold / Release | M; `0003_state38...` | Admin and locks; release expected hold ID | replay-safe result; hold remains pre-production only |
| Staff Draft Creation | M; `design_revision_requests`, design actions | request ID and active draft checks | replay returns same draft; one active draft invariant |
| Design Revision Approval | M; `approve_design_revision` / `approve_customer_design_as_production` | row locks, immutable versions, request cache | retry/concurrency proof; customer v1 and production v2 pointers remain correct |
| Production Artifact Generation | J; `scripts/state39-render-jobs.ts` | upload upsert but job claim/recovery/DB insert weak | fenced reclaim, idempotent rendition upsert, mandatory verification, safe retry |
| Start Production | M; `start_order_production` latest override | locks/idempotency/readiness; editor currently allowed | Admin-only; one event; freeze exact DesignVersion/Artifact Set |
| Complete Production | M; `complete_order_production` | requires in-production and idempotency | Admin-only; one completion event; no shipping semantics |
| Guest Order Claim | G; `claim_guest_order_and_project`, account-save UI | SQL proof/claim is atomic; client receives empty token | HttpOnly-cookie-backed claim endpoint; retry recognizes existing claim |
| Local Project Migration | G; `local-project-migration.ts` | origin ID dedupe; blob URL can be stored | promote/reconcile bytes before marking migrated; partial retry |
| Sticker Publish | M/U; `asset-library.ts`, `0007_state42...` | revision check/content hash; replay may conflict rather than resolve original | request replay returns same published asset/version; no duplicate event |
| Font Publish | M/U; font faces/API | license/validation and revision checks | missing historical font blocks preview/production; no silent production substitution |
| Template Publish | M; `template-management.ts`, `0008_state43...` | request log/atomic dependency copy but privileged route trust chain needs audit | safe replay, dependency verification, historical template/project resolution |
| Commercial Config Publish | M; `commercial-config-service.ts`, `0015...` | locks/revisions/version pointer; draft deleted without replay result | request-to-version result cache/unique event; old Orders retain snapshot |

---

## 3. P0/P1/P2 implementation order

**P0 first:** close production staff-bypass trust boundary; fix privileged Order preparation; make guest claim reachable; use atomic payment-report RPC; restrict production transitions to Admin. These are data/security/business-integrity failures.

**P1 second:** repair cloud Project loading, guest blob persistence/migration, autosave flush/heartbeat recovery, render job reclaim/idempotency, commercial Publish replay, upload/migration rollback and exact-once mutation tests.

**P2 third:** route/component boundaries, structured observability, thumbnail synchronization, safe health endpoint, operational runbook, browser matrix and release automation. P2 work cannot mask unresolved P0/P1 behavior.

---

## 4. File map and produced interfaces

Use existing files wherever listed. Create only these focused files when no equivalent exists:

- `src/lib/reliability/error-contract.ts` — stable error codes, safe message keys, retry classification, unknown outcome and conflict metadata.
- `src/lib/reliability/operation-id.ts` — request/operation ID creation and validation; no PII.
- `src/lib/observability/report.ts` — provider-neutral allowlisted structured reporting and redaction.
- `src/lib/observability/report.test.ts` — redaction/correlation tests.
- `src/instrumentation.ts` — Next 16 server request error hook and provider registration, only if no existing file.
- `src/instrumentation-client.ts` — client `error`/`unhandledrejection` capture, only if no existing file.
- Meaningful route `error.tsx` files under `src/app/checkout`, `src/app/admin/products/[id]`, `src/app/admin/content/templates`, customer account/order routes, and a root `src/app/global-error.tsx`, only where inspection confirms route boundary value.
- `src/app/api/orders/[id]/claim/route.ts` — HttpOnly-cookie-backed claim endpoint, if chosen over exposing guest proof to client code.
- `src/lib/browser-storage/guest-project-store.ts` and `src/lib/browser-storage/guest-project-store.test.ts` — versioned IndexedDB metadata/blob store, if no existing adapter is suitable.
- `supabase/migrations/0019_state45_order_recovery.sql`, `0020_state45_fulfillment_render_recovery.sql`, `0021_state45_publish_replay.sql`, and `0022_state45_integrity_constraints.sql` — only migrations required by evidence; keep each forward-compatible and ordered after `0018`.
- `e2e/playwright.config.ts`, `e2e/fixtures/*`, `e2e/golden/*`, `e2e/failure/*`, and `scripts/state45-production-smoke.ts` — reuse existing Playwright patterns and avoid duplicate test infrastructure.
- `docs/operations/state45-recovery-runbook.md` — concise support/operations recovery semantics.
- Actual CI file discovered during implementation; no `.github/workflows` exists in current repository listing, so Task 14 must use the repository’s real CI provider or create a single release workflow only if deployment uses GitHub Actions.

Produced contracts:

```ts
export type ReliabilityErrorCode =
  | 'EXPECTED_VALIDATION_ERROR'
  | 'BUSINESS_CONFLICT'
  | 'AUTHORIZATION_ERROR'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'RETRYABLE_SERVER_ERROR'
  | 'NON_RETRYABLE_SERVER_ERROR'
  | 'CLIENT_PERSISTENCE_ERROR'
  | 'CONCURRENCY_CONFLICT'
  | 'UNKNOWN_OUTCOME'
  | 'UNEXPECTED_ERROR';

export type OperationResult<T> =
  | { ok: true; value: T; operationId: string }
  | {
      ok: false;
      code: ReliabilityErrorCode | string;
      safeMessageKey: string;
      retryable: boolean;
      operationId: string;
      currentState?: Record<string, unknown>;
    };
```

Do not force every old repository to adopt this exact wrapper where it would duplicate a domain contract. Adapt existing `RevisionResult`, `CatalogActionResult`, `FulfillmentResult`, and `OrderPreparationError` at the boundary, preserving stable domain codes.

---

## 5. Executable implementation tasks

### Task 1: Baseline inventory, failure matrix, and consistency map

**Goal:** Freeze current behavior and all call sites before changing shared reliability patterns.

**Reliability risk addressed:** partial fixes to duplicated route/RPC/action patterns; regressions hidden by testing only one sibling.

**Files:**
- Read: all files in the repository facts section.
- Create: `docs/superpowers/plans/2026-10-06-state-45-release-hardening.md` (this plan).
- Modify: none in application code.

**Steps:**

- [ ] Record every call site of `requireCurrentStaff`, `requireStaff`, `SMOKE_TEST_STAFF_ROLE`, `smoke_staff_role`, `createServerSupabaseClient`, `createPrivilegedSupabaseClient`, `markCustomerReported`, `report_checkout_payment`, `startOrderProduction`, `completeOrderProduction`, Publish RPCs, `saveRecentProject`, `saveState`, and all `console.error/warn` in routes/services.
- [ ] For each discovered duplicate, map the same target behavior and test module. A change to a shared signature must update every caller, every wrapper, every mock, and every SQL test.
- [ ] Record current full-module commands before implementation: `pnpm test`, `node --test --experimental-strip-types src/test/<full-module>.test.ts`, `pnpm typecheck`, and the exact SQL scripts in `README.md:34-90`.
- [ ] Mark this planning task complete only after the failure matrix above is checked against all requested operations and no listed operation is left without a source-of-truth path.

**Manual verification:** compare this plan’s file map against `glob`/`grep` output. No application diff is expected.

**Expected outcome:** the implementation agent starts with verified paths, risk ranking, sibling call-site list, and full-file verification command for every planned fix.

**Dependency:** none.

**Commit:** `docs(state45): map release hardening risks and contracts`.

### Task 2: Remove test authentication bypass from production

**Goal:** Make production authorization depend only on Supabase Auth and `staff_roles`.

**Reliability/security risk:** P0 unauthorized access to private Orders, assets, payment mutations, Publish and production.

**Files:**
- Modify: `src/lib/admin/authorization.ts:56-145`.
- Modify: `src/proxy.ts:5-103`.
- Modify: every route/page that assumes smoke bypass, including `src/app/admin/content/templates/[id]/edit/page.tsx:24-35` only for test-only fixture gating.
- Test: `src/test/admin-authorization.test.ts`, `src/test/state44-rbac.test.ts`, `src/test/admin-fulfillment-operations.test.ts` if present; create `src/test/admin-authorization-hardening.test.ts` only if no suitable module exists.
- Test: every affected route test from the consistency map.

**Behavior:**

- Gate synthetic staff identity behind both a non-production environment and an explicit test-only flag, for example `NODE_ENV !== 'production' && ENABLE_TEST_STAFF_BYPASS === '1'`. Production must ignore both the environment role and the cookie, not merely hide the login redirect.
- Keep the bypass out of production route authorization even if a cookie is attacker-supplied. Do not accept a client-provided role/header.
- Preserve current local Playwright smoke support by setting the explicit flag in the smoke process environment, not by making production code trust the cookie.
- Ensure all privileged repository construction remains server-only and all public routes continue using publishable clients.

**Tests:**

- Production-mode authorization with `smoke_staff_role=admin` returns unauthenticated/not-staff.
- Non-production test mode still allows existing smoke fixture.
- Editor cannot access Admin-only payment/fulfillment operations.
- Customer/anon cannot access private Orders/assets.
- Run the full affected files, not only the new assertion: `node --test --experimental-strip-types src/test/admin-authorization.test.ts src/test/state44-rbac.test.ts src/test/admin-fulfillment-operations.test.ts`.

**Manual verification:** start production mode without test flag; request `/admin/orders` with smoke cookie; verify redirect/401 and no synthetic identity. Start isolated smoke mode with explicit flag; verify existing admin smoke still runs.

**Expected outcome:** no production path accepts `SMOKE_TEST_STAFF_ROLE` or `smoke_staff_role` as identity; test convenience remains isolated.

**Dependency:** Task 1.

**Commit:** `fix(security): isolate staff smoke bypass from production`.

### Task 3: Establish stable error, safe result, and operation-ID contracts

**Goal:** Stop expected domain outcomes from becoming generic exceptions and make unknown outcomes distinguishable from ordinary failures.

**Reliability risk:** unsafe automatic retry, raw PostgREST/SQL leakage, impossible support diagnosis.

**Files:**
- Create: `src/lib/reliability/error-contract.ts`.
- Create: `src/lib/reliability/operation-id.ts`.
- Modify: `src/lib/services/cloud-project-autosave.ts`.
- Modify: `src/lib/admin/product-catalog-ui.ts` and existing `RevisionResult`/`FulfillmentResult` adapters only where needed.
- Modify: high-impact route/action response types: `src/app/api/orders/route.ts`, payment routes, admin actions, template routes, commercial actions.
- Test: `src/test/cloud-project-autosave.test.ts`, `src/test/price-quote-api.test.ts`, `src/test/payment-flow.test.ts`, `src/test/state44-regression.test.ts`; create `src/test/reliability-error-contract.test.ts` if no existing module fits.

**Interfaces:**

- `createOperationId(): string` returns a non-PII opaque ID.
- `toSafeOperationError(error, context): OperationResult<never>` maps stable codes without returning SQL, stack, PostgREST text, Storage path or token.
- `classifyRetry(code, operationKind)` returns `retryable`, `refetchFirst`, or `unknownOutcome`.
- Preserve existing business codes such as `STALE_REVISION`, `REVISION_CONFLICT`, `PAYMENT_REQUIRED`, `ORDER_ALREADY_CLAIMED`, `LEASE_EXPIRED`, and `NOT_FOUND`; do not replace them with one generic code.

**Behavior:** expected validation/conflict/auth/not-found values are normal results; unexpected exceptions report and return safe user copy. `UNKNOWN_OUTCOME` always leads to refetch/reconciliation, not arbitrary POST retry.

**Tests:** full modules verify expired quote, stale revision, unavailable Variant, invalid payment state, missing proof, authorization denial, and unexpected error mapping. Assert user output contains none of SQL, stack, PostgREST, Storage path, token, or PII.

**Manual verification:** inject one expected conflict and one unexpected exception; verify contextual retry/refetch and safe message.

**Expected outcome:** one small contract at boundaries, no parallel error framework.

**Dependency:** Task 1.

**Commit:** `feat(reliability): standardize safe operation outcomes`.

### Task 4: Fix Order preparation, guest claim, payment report, and response-loss recovery

**Goal:** Make Order creation, guest claim, QR recovery, and customer payment reporting converge deterministically.

**Reliability risk:** P0 duplicate/lost Orders, broken claim, paid-order downgrade, wrong payment event count.

**Files:**
- Modify: `src/app/api/orders/route.ts:14-130`.
- Modify: `src/lib/services/prepare-order-from-guest-checkout.ts:79-391`.
- Create: `src/app/api/orders/[id]/claim/route.ts` if server-side HttpOnly-cookie claim is selected.
- Modify: `src/components/checkout/order-confirmation-panel.tsx`, `src/components/checkout/account-save-dialog.tsx`, `src/app/checkout/page.tsx` only if claim endpoint still needs UI state.
- Modify: `src/app/api/orders/[id]/payment/report/route.ts:43-101`.
- Modify: `src/lib/repositories/payment-repository.ts` only to remove/contain unsafe report path; retain other payment methods.
- Create: `supabase/migrations/0019_state45_order_recovery.sql` only for missing uniqueness/recovery RPC support.
- Test full modules: `src/test/orders-api.test.ts`, `src/test/order-preparation.test.ts`, `src/test/payment-flow.test.ts`, `src/test/customer-order-claim.test.ts`, `src/test/state-36-lifecycle.test.ts`, `src/test/guest-order-access.test.ts`, `src/test/order-commercial-snapshot.test.ts`.

**Behavior:**

- Use `createServerSupabaseClient()` only to resolve authenticated user context. Do not pass it as the repository client for guest Order preparation. Construct server-only privileged repositories through `createServerOrderPreparationOptions()`/`createPrivilegedSupabaseClient()`; never send that key to browser.
- Persist stable idempotency intent before submit. Same key/payload returns existing Order, token/payment data, and original commercial snapshot. Same key/different payload returns conflict.
- Choose server-side `/api/orders/[id]/claim`: read the proof-bound HttpOnly cookie, invoke `claim_guest_order_and_project`, and return a safe result. Do not make guest token readable by arbitrary page JavaScript solely to repair the flow. Keep guest proof required.
- Replace separate `markCustomerReported` plus event insert with atomic `report_checkout_payment`. Map `reported`, `already_reported`, and `already_paid` without changing paid state or adding a second event.
- Preserve QR/payment reference and amount from the existing Order snapshot on refresh. Do not create a new payment requirement.
- Track created project/assets during preparation. If downstream creation fails, clean only the exact unreferenced records/objects after transaction outcome is known; if outcome is ambiguous, reconcile first and defer cleanup.
- Keep checkout design, quantity, Quote ID/version/expiry, and required customer form state through refresh. Treat phone/address as session-scoped PII: scrub it after authoritative Order creation or explicit exit while retaining only the minimum Order recovery identifier.

**Tests:**

- Double click/concurrent same-key Order create returns one Order.
- Server commit followed by dropped client response, then same-key retry returns same Order.
- Different payload with same key conflicts.
- Real Supabase repository path can insert through server privilege while browser client remains unprivileged.
- Claim endpoint succeeds from HttpOnly proof, replay recognizes already claimed Order, wrong/missing proof fails.
- Payment report concurrent with Admin confirmation never downgrades paid; exactly one report event; full module tests pass.
- Downstream failure does not leave uncontrolled project/asset orphans; ambiguous Storage outcome is not synchronously deleted.

**Manual verification:** offline before submit, refresh Steps 1–3, double-submit, commit/drop-response, QR refresh, claim after confirmation, two payment reporters/admins. Verify database Order count, payment state and event count.

**Expected outcome:** one authoritative Order/payment effect per intent; claim works without exposing proof; customer sees safe retry/refetch, not fake success.

**Dependency:** Tasks 2–3.

**Commit:** `fix(order): harden idempotency claim and payment reporting`.

### Task 5: Repair guest persistence and cloud Project recovery

**Goal:** Keep guest local-first work durable and restore authenticated Projects from canonical cloud state.

**Reliability risk:** P0/P1 lost designs, dead image URLs, false local save status, wrong source of truth.

**Files:**
- Create: `src/lib/browser-storage/guest-project-store.ts` and test module, unless an existing adapter is discovered during implementation.
- Modify: `src/lib/storage.ts:1-233`.
- Modify: `src/lib/upload.ts:60-70`.
- Modify: `src/components/customizer/customizer-shell.tsx:399-405,619` and its authenticated/guest context wiring.
- Modify: `src/app/page.tsx:1-20`.
- Modify: `src/components/customer/my-designs-list.tsx:112` only if URL contract changes.
- Modify: `src/components/customizer/design-canvas.tsx:685,877` to resolve durable local asset references, not transient object URLs.
- Modify: `src/lib/services/local-project-migration.ts:1-160` and `src/lib/asset-store.ts` for source reconciliation.
- Test full modules: `src/test/storage-retention.test.ts`, `src/test/guest-storage-lifecycle.test.ts`, `src/test/asset-store.test.ts`, `src/test/cloud-project-autosave.test.ts`, `src/test/local-project-migration.test.ts`, `src/test/state41-e2e-integration.test.ts`.

**Data model:** Keep small recent-project metadata/references in localStorage. Create versioned IndexedDB stores for `projects` metadata and binary `assets`, keyed by stable Project ID/asset ID with byte metadata, checksum, schema version and last-used time. Migrate in read/commit order: copy bytes and verify checksum, write reference, then remove legacy binary; malformed records go to a quarantined recovery record and do not abort all Projects.

**Behavior:**

- `saveRecentProject` awaits durable IndexedDB transaction and only then reports saved. On quota/security/transaction failure, retain in-memory DesignDocument and expose `CLIENT_PERSISTENCE_ERROR`; do not clear the Project.
- Rehydrate `src` from durable bytes on browser restart; never persist a `blob:` URL as the sole source.
- Enforce existing 3-project/30-day retention while protecting open Project, checkout/promotion source, and synced account recovery cache. Cleanup is exact-record and reference-aware.
- Use `navigator.storage.estimate()` on save failure/explicit open, not polling. `navigator.storage.persist()` is best-effort and never required for correctness.
- Load `/?project=<id>` through authenticated cloud Project repository/context; local storage remains recovery cache. On stale/current revision, show existing conflict UX and never silently fall back to a different local Project.
- Promote local image bytes before marking migration complete; if bytes are absent, preserve local source and show a retry/reselect path.

**Tests:** quota/blocked storage/transaction abort, corrupt JSON/schema migration, interrupted migration, dead object URL recovery, retention ordering/protected records, cross-tab stale writes, authenticated Project route load, and migration with partial asset failure.

**Manual verification:** guest save/reload, close/reopen browser, upload several large images, injected storage failure, open My Designs Project, disconnect during save, inspect save indicator. Verify no base64 binary remains in localStorage and guest mode never calls Supabase on launch.

**Expected outcome:** guest work survives normal reload/restart and safe failures; cloud Projects load canonically; storage pressure is visible and recoverable.

**Dependency:** Tasks 3–4.

**Commit:** `fix(storage): make guest projects durable and cloud recovery explicit`.

### Task 6: Harden revisioned autosave, conflicts, and draft leases

**Goal:** Preserve unsynced work and ensure no stale write overwrites newer state across tabs/devices.

**Reliability risk:** silent data loss, false saved state, permanent draft lock.

**Files:**
- Modify: `src/lib/services/cloud-project-autosave.ts:13-109`.
- Modify: `src/lib/draft-autosave.ts`, `src/lib/staff-draft-autosave.ts:1-100`.
- Modify: `src/lib/use-staff-draft-session.ts`, `src/lib/use-template-draft-session.ts`, `src/components/admin/commercial-config-editor.tsx`.
- Modify: `src/app/admin/orders/[id]/design/design-review-client.tsx:344,427` and template draft client/API routes.
- Modify: SQL only where existing lease/revision function lacks required recovery; preserve current fencing RPCs.
- Test full modules: `src/test/cloud-project-autosave.test.ts`, `src/test/staff-draft-autosave.test.ts`, `src/test/template-draft-concurrency.test.ts`, `src/test/template-management.test.ts`, `src/test/design-draft-operations.test.ts`, `src/test/commercial-config-service.test.ts`.

**Behavior:**

- Standardize UI state to `idle/saving/saved/unsynced/conflict/error` without forcing one domain implementation.
- Preserve 800ms/5s staff semantic debounce and existing manual commercial draft save. Never save per pointer frame.
- Remove swallowed `flush()` exceptions. A failed flush leaves pending state and blocks completion/approval until the user retries or explicitly resolves conflict.
- Reconnect retries only unchanged-base revision. If current revision/lease differs, stop auto-save, refetch metadata, and show `Thiết kế đã được cập nhật ở nơi khác.` with `Tải phiên bản mới`; do not merge.
- Template heartbeat gets bounded retry/backoff before lease expiry; visibility restore triggers immediate heartbeat. Lease takeover remains explicit and admin-only.
- Refresh restores latest persisted content; undo history may reset. Browser close relies on prior durable save/recovery, not unload.
- Concurrent acknowledgement ordering cannot mark a newer local snapshot saved because an older request completed.

**Tests:** edit-during-save, response reordering, network failure/reconnect, stale revision, two tabs/accounts, lease expiry/takeover, heartbeat transient failure, refresh while dirty, and failed flush before approval. Run every full test module listed above.

**Manual verification:** authenticated autosave failure/reconnect, cross-device conflict, staff draft refresh, two staff editors, Template heartbeat interruption, Commercial conflict. Verify server revision and local pending snapshot separately.

**Expected outcome:** unsynced work remains available, stale writes never silently win, and no abandoned lease blocks recovery.

**Dependency:** Tasks 3 and 5.

**Commit:** `fix(autosave): preserve pending drafts and fence stale writes`.

### Task 7: Make payment, hold, approval, Publish, and commercial mutations replay-safe

**Goal:** Ensure all high-impact mutations have explicit request replay and concurrency semantics.

**Reliability risk:** duplicate financial/audit events, duplicate immutable versions, wrong commercial pointer/economics, unsafe stale actions.

**Files:**
- Modify: `src/app/admin/orders/[id]/actions.ts`, `src/lib/services/admin-order-operations.ts`.
- Modify: `src/app/admin/orders/[id]/design/actions.ts`, `src/lib/services/admin-design-revisions.ts`.
- Modify: `src/lib/services/asset-library.ts`, `src/lib/services/template-management.ts`, `src/lib/services/template-assets.ts`, `src/app/api/admin/content/**`.
- Modify: `src/app/admin/products/actions.ts`, `src/lib/services/commercial-config-service.ts`.
- Create: `supabase/migrations/0021_state45_publish_replay.sql` for request-to-result uniqueness/replay only where current SQL lacks it.
- Test full modules: `src/test/payment-flow.test.ts`, `src/test/admin-order-operations.test.ts`, `src/test/design-revision-integration.test.ts`, `src/test/design-review-transitions.test.ts`, `src/test/template-publish.test.ts`, `src/test/template-management.test.ts`, `src/test/state44-concurrency.test.ts`, `src/test/commercial-config-service.test.ts`, `src/test/state44-commercial-version.test.ts`.

**Behavior:**

- Every mutation accepts/generates a stable operation request ID before network call, binds it to target and input hash, and records original result in the same transaction as the business change.
- Same request ID and same hash returns the original result, including original actor/time/version. Same request ID and changed hash returns conflict.
- Different concurrent requests see row lock/status/revision conflict. Never use UI optimistic success for payment, approval, immutable Publish, or commercial Publish.
- Commercial Publish stores request ID → created version/result before deleting draft or otherwise lets a unique event resolve replay. Old Order commercial snapshots never read current config.
- Sticker/font/template Publish verifies required bytes/dependencies before marking published; historical dependencies remain resolvable after archive.
- Hold remains forbidden during production. Approval cannot change customer-approved v1. Start/complete rules remain unchanged except Admin-only enforcement in Task 8.

**Tests:** paired concurrent calls, response-drop/retry, stale revision, exact event/version cardinality, unchanged confirmer/timestamp, immutable customer/production pointers, old/new economics, archive dependency behavior. Run full files, not isolated assertions.

**Manual verification:** two Admin payment confirmations; lost response; Template Publish retry; Commercial Publish concurrency; approval retry; Hold/Release race.

**Expected outcome:** one logical effect per intent and safe current-state conflict for competing intent.

**Dependency:** Tasks 3–4.

**Commit:** `fix(mutations): make publish and admin effects replay-safe`.

### Task 8: Enforce Admin-only production and protect immutable production state

**Goal:** Make artifact generation, Start Production, and Complete Production safe under retry, concurrency, crash, and permission failure.

**Reliability risk:** unauthorized production, wrong DesignVersion, stuck jobs, partial/corrupt artifacts.

**Files:**
- Modify: `src/lib/services/admin-fulfillment-operations.ts:79-106`.
- Create: `supabase/migrations/0020_state45_fulfillment_render_recovery.sql`.
- Modify: `scripts/state39-render-jobs.ts:12-118`.
- Modify: `src/lib/services/document-renderer.ts`, `src/lib/repositories/order-repository.ts:340` only for verified dependency/thumbnail fixes.
- Modify: `src/lib/services/library-dependencies.ts` if renderer dependency resolution requires it.
- Test full modules: `src/test/template-production.test.ts`, `src/test/fulfillment-lifecycle-domain.test.ts`, `src/test/admin-fulfillment-operations.test.ts`, `src/test/document-renderer.test.ts`, `src/test/admin-order-detail.test.ts`, `src/test/order-detail-repository.test.ts`, `src/test/state40-e2e-integration.test.ts` if present.

**Database behavior:**

- Latest `start_order_production` and `complete_order_production` RPCs require `v_role = 'admin'`; preserve payment-policy/readiness semantics from `0018`.
- Add one atomic render-job claim function that selects pending/failed or expired-running jobs with `FOR UPDATE SKIP LOCKED`, increments attempt/fencing token, and sets lease. Reclaimed job cannot be finalized by stale worker.
- Use upsert/verified existing-row reconciliation for `design_version_renders` by immutable version/checksum. A committed upload/row with lost response must resolve as success, not duplicate failure.
- Mark artifact/job ready only after every mandatory surface/output exists and validates. Update the thumbnail pointer/read path consistently so Admin Order Detail sees the authoritative render. Preserve the existing multi-surface renderer contract; do not silently substitute missing production fonts.
- Start rechecks derived readiness and freezes exact production DesignVersion/Artifact Set snapshot in one transaction. Complete strictly requires active `in_production`; neither operation means shipping/delivery.

**Tests:** editor denial at service and SQL levels; two Admin starts/completes; renderer exception; worker crash/expired lease; two workers; partial output; response loss after storage/DB commit; changed DesignVersion during generation; missing font/image; exact event count and frozen pointer.

**Manual verification:** fail renderer, verify Order/DesignVersion remains valid and Start is blocked; fix and retry; run two Admin sessions and inspect events/snapshot.

**Expected outcome:** one authorized production transition and one verified immutable artifact set; crashed workers recover without duplicate output.

**Dependency:** Tasks 3 and 7.

**Commit:** `fix(production): fence render jobs and enforce admin transitions`.

### Task 9: Harden partial uploads and guest/account migration

**Goal:** Preserve successful files/projects when one upload or migration item fails.

**Reliability risk:** partial data loss, duplicate canonical Projects, orphaned private objects, premature local deletion.

**Files:**
- Modify: `src/lib/services/asset-library.ts`, `src/lib/services/template-assets.ts`, `src/lib/repositories/asset-library-repository.ts`, `src/lib/repositories/asset-repository.ts`.
- Modify: `src/lib/services/local-project-migration.ts`, `src/components/checkout/account-save-dialog.tsx`.
- Modify: relevant upload routes under `src/app/api/admin/content/**`, `src/app/api/assets/**`, and template asset routes.
- Test full modules: `src/test/template-assets.test.ts`, `src/test/asset-library-service.test.ts`, `src/test/asset-library-api.test.ts`, `src/test/local-project-migration.test.ts`, `src/test/state41-e2e-integration.test.ts`, `src/test/guest-order-access.test.ts`.

**Behavior:**

- Track each file as pending/uploading/uploaded/failed. Stable asset ID/hash/path lets retry reconcile existing bytes/metadata rather than create uncontrolled duplicate.
- Keep successful uploads when one file fails. Retry only missing file/stage. Do not synchronously delete an object when metadata outcome is uncertain; use reference-aware delayed cleanup and existing dry-run GC conventions.
- Migration claims Order first only after proof validation; successful Projects stay linked; failed local Project remains source and retryable. Never logout or burn proof prematurely.
- Verify object checksum/size and ownership before marking uploaded/migrated. Missing required historical asset surfaces an operational dependency error; do not delete design elements.

**Tests/manual:** fail one of several files; response loss after object upload; retry; partial migration; refresh midway; concurrent migration; orphan cleanup dry-run. Run full modules listed.

**Expected outcome:** no successful item is discarded and retry cannot duplicate canonical records.

**Dependency:** Tasks 5 and 7.

**Commit:** `fix(assets): recover partial uploads and migrations safely`.

### Task 10: Add invariant constraints and Storage-integrity checks

**Goal:** Move already-established invariants below UI assumptions without unsafe migration failure.

**Reliability risk:** duplicate active drafts/events, missing foreign dependencies, invalid immutable pointers.

**Files:**
- Create: `supabase/migrations/0022_state45_integrity_constraints.sql` only after violation queries pass.
- Modify: relevant repositories/RPCs only for missing server-side checks.
- Create/modify: `supabase/tests/state45_integrity.sql`, `supabase/tests/state45_security.sql`, and existing SQL tests only to add coverage, never remove assertions.

**Pre-migration checks:** query duplicate active staff/template/commercial drafts, duplicate request IDs/events, invalid version pointers, missing Order/design/artifact dependencies, bad version numbers, and existing Storage metadata without objects. Backfill or quarantine only with explicit test-environment evidence; do not silently delete production rows.

**Constraints/checks:** add foreign keys, unique/partial unique indexes, not-null/check constraints only for existing invariants: one active draft, unique Order intent, one logical payment confirmation, monotonic commercial version, immutable version references, and valid current commercial pointer. Keep changing business policy in RPCs, not complex CHECK constraints.

**Storage/RLS assertions:** anonymous cannot list/read private customer assets/artifacts/drafts or Orders; Customer A cannot read Customer B; Customer cannot read Admin Draft; Editor cannot confirm payment/start/complete/generate; Admin retains required operations; published public library assets remain readable; archived historical dependencies resolve as designed.

**Tests/commands:** exact SQL scripts from README against clean isolated Supabase. Local shell lacks `psql`/Docker, so CI/staging must run them. Do not point tests at production.

**Expected outcome:** known invalid states are prevented and migration is forward-compatible.

**Dependency:** Tasks 4, 7–9.

**Commit:** `feat(db): enforce state45 integrity and security invariants`.

### Task 11: Add route/component error isolation and structured observability

**Goal:** Diagnose unexpected failures while keeping affected surface recoverable and user messages safe.

**Reliability risk:** whole-page crashes, raw backend leakage, untraceable renderer/migration errors.

**Files:**
- Create: `src/lib/observability/report.ts`, `src/lib/observability/report.test.ts`.
- Create if absent: `src/instrumentation.ts`, `src/instrumentation-client.ts`.
- Modify: `src/app/admin/orders/[id]/error.tsx` to use `retry()` per installed Next 16 contract while retaining safe Vietnamese copy.
- Create meaningful boundaries: `src/app/checkout/error.tsx`, `src/app/admin/products/[id]/error.tsx`, `src/app/admin/content/templates/error.tsx`, `src/app/my-orders/error.tsx`, `src/app/my-designs/error.tsx`, and `src/app/global-error.tsx` only where route segment inspection confirms they isolate a real recovery surface.
- Modify: API/service catch blocks currently using arbitrary `console.error`, including `src/app/api/orders/route.ts`, payment routes, `src/app/api/admin/content/_shared.ts`, `src/app/api/admin/content/templates/_shared.ts`, `src/app/api/assets/[id]/route.ts`, `src/app/api/library/[kind]/[id]/route.ts`.
- Modify: `src/lib/admin/realtime.ts` only to report subscription/reconnect failures safely if needed.

**Behavior:**

- `reportUnexpectedError({ operation, operationId, route, role, productType, status, duration, errorCode, release })` allowlists fields and centralizes redaction. Structural DesignDocument stats only: element count, product/Variant, schema version, approximate size.
- Never log customer name/phone/address, OTP, bank/payment credentials, guest proof, auth tokens, signed URLs, image bytes, full DesignDocument, SQL, Storage paths, or raw backend messages.
- Use Next 16 `onRequestError` for server errors and client `error`/`unhandledrejection` instrumentation where provider boundary exists. Reuse existing provider if discovered; otherwise keep provider-neutral exporter interface and one concrete integration later, not multiple vendors.
- Error boundaries provide safe message, retry/reset, navigation recovery, and short reference code derived from operation ID; expected validation/conflicts are not exception alerts.
- Add small meaningful boundaries, not one boundary per component. A failed timeline/asset preview may degrade locally only if the component architecture supports it without artificial rewrites.
- Emit low-cardinality metrics for Order creation failures, autosave failures, payment-confirmation conflicts, renderer failures, Production Start failures, Template Publish failures, and Commercial Publish failures. Alert only on unexpected-error/order/renderer/production/publish spikes; keep expected validation/conflict counts out of exception alerts.

**Tests/manual:** full `report` test module with phone/address/token/signed URL/document sentinels; unexpected server error emits operation ID; boundary retry; no raw message in response; correlation ID appears in server hook and returned safe reference. Run full affected route/unit test files.

**Expected outcome:** critical failures are traceable by operation/release without leaking private content; route failures do not destroy unrelated surfaces.

**Dependency:** Tasks 2–4.

**Commit:** `feat(observability): add redacted correlated error reporting`.

### Task 12: Build isolated production-mode Playwright and fault-injection infrastructure

**Goal:** Test real workflows and unknown-outcome behavior without shared records or production-only branches.

**Files:**
- Reuse/modify: `scripts/state43-template-smoke.ts` only for shared helpers; do not remove current scenarios.
- Create: `e2e/playwright.config.ts`, `e2e/fixtures/auth.ts`, `e2e/fixtures/supabase.ts`, `e2e/fixtures/cleanup.ts`, `e2e/helpers/fault-injection.ts`, `e2e/helpers/unknown-outcome.ts`.
- Create: `scripts/state45-production-smoke.ts` for building/starting production server if an existing runner cannot do so.
- Modify: CI configuration discovered in the repository/deployment environment.

**Environment:**

- Use isolated local Supabase (`supabase start`) or dedicated test project, deterministic Customer A/B/Admin/Editor fixtures, unique run/worker prefixes, and exact cleanup. Refuse non-test URLs for cleanup.
- Auth fixtures must not call real OTP/SMS. Security/RLS behavior remains separately tested with real role claims.
- `unknown-outcome` forwards a real server request, verifies commit through an independent DB/repository read in test infrastructure, then drops the browser response. Never add `?forceError=true` or other public fault parameters.
- Fault helpers cover route abort/offline, delayed response, controlled 500, storage transaction failure, stale revision, expired lease, and renderer failure at interception boundaries.
- Test semantic role/name/label locators. No arbitrary `waitForTimeout`; await visible state, response, revision, or backend assertion. Keep screenshot/trace/console/network artifacts sanitized.

**Matrix:** full suite desktop Chromium; customer-critical smoke mobile Chromium and mobile WebKit; Admin-critical smoke desktop Chromium. Firefox smoke only if CI capacity exists.

**Verification:** run against `pnpm build` + `pnpm start`, not only `pnpm dev`; capture page errors/hydration failures with narrow allowlist.

**Expected outcome:** deterministic test foundation for Golden and failure suites.

**Dependency:** Tasks 4–11.

**Commit:** `test(e2e): add isolated production-mode fault injection`.

### Task 13: Add Golden E2E journeys

**Goal:** Prove core product/business behavior end to end, with backend assertions.

**Files:**
- Create: `e2e/golden/guest-checkout.spec.ts`.
- Create: `e2e/golden/admin-order-production.spec.ts`.
- Create: `e2e/golden/staff-revision.spec.ts`.
- Create: `e2e/golden/account-migration.spec.ts`.
- Create: `e2e/golden/content-template.spec.ts`.
- Create: `e2e/golden/commercial-versioning.spec.ts`.

**Journeys and assertions:**

- Guest product/Variant/template/editor/preflight/quantity/quote/customer info/order/QR/confirmation; verify exact Order, payment amount, commercial version and design version in DB.
- Admin payment confirmation → review/approve → readiness → Start → Complete; verify role, status and append-only audit events.
- Customer-approved v1 → Staff draft edit/preflight → v2 approval; verify customer pointer remains v1 and production pointer is v2.
- Guest Order/Auth → proof-bound claim → promoted current Project → remaining Project migration → My Orders/My Designs; verify no duplicate canonical Project/Order.
- Sticker publish → Template uses asset → customer uses Template → archive Sticker; existing Project resolves, new use is unavailable.
- Commercial v1 quote/order → publish v2; old Order retains v1 economics, new Quote uses v2 and correct payment policy.

**Tests:** use accessible role/name/label locators and full database assertions. Run each spec as a full file, not only a selected test.

**Manual verification:** run all six in production mode once with screenshots/traces retained only in isolated artifacts.

**Expected outcome:** major customer/Admin/account/content/commercial workflows pass without relying on toast text alone.

**Dependency:** Task 12.

**Commit:** `test(e2e): cover State45 golden workflows`.

### Task 14: Add deliberate failure E2E scenarios

**Goal:** Prove preservation, safe retry, and exact-once behavior under interruption.

**Files:**
- Create: `e2e/failure/guest-persistence.spec.ts`.
- Create: `e2e/failure/autosave-conflict.spec.ts`.
- Create: `e2e/failure/checkout-unknown-outcome.spec.ts`.
- Create: `e2e/failure/payment-unknown-outcome.spec.ts`.
- Create: `e2e/failure/production-concurrency.spec.ts`.
- Create: `e2e/failure/asset-upload-recovery.spec.ts`.
- Create: `e2e/failure/artifact-retry.spec.ts`.
- Create: `e2e/failure/account-migration-recovery.spec.ts`.
- Create: `e2e/failure/publish-replay.spec.ts`.

**Scenarios:**

- Storage quota/write abort: Editor stays open, current memory remains, warning shown, no fake `Đã lưu`.
- Autosave 5xx/offline then reconnect: `unsynced`, retry, correct server revision.
- Two tabs: first save then stale second save; conflict, no overwrite.
- Offline before Order creation: form/design persist, no false Order; reconnect and retry creates exactly one.
- Commit Order then drop response: retry same intent resolves same ID.
- Commit payment confirmation then drop response: retry/refetch yields one payment event and original confirmer/time.
- Two Admin Start requests: one transition and one `production_started` event; second refreshes current state.
- Multi-upload one failure: successful files persist; failed item retries; no duplicate object.
- Renderer crash: failed status, valid Order/DesignVersion, Start blocked; fixed retry becomes ready.
- Partial account migration: logged-in account, claimed Order and successful Projects remain; failed Project retry no duplicate.
- Template/commercial Publish response loss/concurrency: one immutable result/version and valid current pointer.

**Verification:** each spec runs as a full file. Assert backend records, status/revision/event cardinality and UI state. No blanket test retries; only one CI retry for documented browser infrastructure flake, with recurring failures investigated.

**Expected outcome:** failure is visible, user work remains, retry semantics converge deterministically.

**Dependency:** Tasks 4–13.

**Commit:** `test(e2e): cover State45 failure recovery`.

### Task 15: Add migration/security/Storage smoke and release gate

**Goal:** Block releases unless application, DB, RLS, Storage, build, Golden, failure and mobile smoke checks pass.

**Files:**
- Create/modify: `supabase/tests/state45_integrity.sql`, `supabase/tests/state45_security.sql`.
- Create/modify: actual CI workflow after inspecting deployment provider; if GitHub Actions is confirmed, use `.github/workflows/state45-release-gate.yml`.
- Modify: `package.json` scripts with exact reproducible commands.
- Modify: `README.md` and `docs/superpowers/state37-supabase-runbook.md` only for actual new commands/order.

**Gate commands:**

```sh
pnpm exec eslint src scripts e2e
pnpm typecheck
pnpm test
pnpm build
pnpm start
node --test --experimental-strip-types src/test/state45-*.test.ts
# Supabase test environment only:
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state37_rls.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state38_order_operations.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state39_design_revisions.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state40_fulfillment_operations.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state41_account_migration.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state42_asset_library.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state43_template_management.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state44_catalog_commercial.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state44_catalog_backfill.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state44_catalog_operations.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state44_admin_catalog_ui.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state44_payment_purposes.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state44_payment_readiness.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state45_integrity.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state45_security.sql
pnpm exec playwright test e2e/golden e2e/failure --project=chromium
pnpm exec playwright test e2e/golden/guest-checkout.spec.ts e2e/failure/checkout-unknown-outcome.spec.ts --project=mobile-chromium
pnpm exec playwright test e2e/golden/guest-checkout.spec.ts e2e/failure/checkout-unknown-outcome.spec.ts --project=mobile-webkit
```

The current repository has no lint command or ESLint dependency; Task 15 must first add a minimal compatible ESLint setup and then use `pnpm exec eslint ...`. If CI cannot provide `psql`, use the existing Supabase CLI/local database service in that CI environment; never mark SQL tests skipped as passed. Clean migration smoke is ordered `0001` through `0018`, then State45 migrations and seeds. Upgrade smoke starts from a representative pre-State45 schema snapshot when the deployment stack supports it. Do not promise rollback of forward-only SQL; use expand/migrate/switch/cleanup and document compatible application/schema pairs.

**Expected outcome:** one concrete release gate fails closed on missing environment, failed migration/security, production build, Golden, failure, or mobile WebKit smoke.

**Dependency:** Tasks 10–14.

**Commit:** `ci(state45): enforce release hardening gate`.

### Task 16: Recovery documentation and final manual QA

**Goal:** Make Retry, Refetch, Reconcile, and support diagnosis unambiguous to engineers/operators.

**Files:**
- Create: `docs/operations/state45-recovery-runbook.md`.
- Modify: `README.md` and State 37–44 runbooks only where State45 changes their recovery command/semantics.

**Runbook sections:**

- Guest Project: local key/schema, IndexedDB blob ID, quota/corruption quarantine, safe export/retry, retention protection.
- Cloud autosave: server revision/base revision/pending snapshot, conflict and takeover handling.
- Order submit: search by Order ID/idempotency/operation reference before asking customer to retry; never recreate blindly.
- Payment report/confirmation: refetch payment and audit, distinguish `already_paid`/`already_reported`/unknown outcome.
- Production artifact: inspect job/attempt/status/dependencies, retry failed/expired attempt, never edit immutable DesignVersion.
- Production transition: inspect status/request/event/frozen snapshot; do not repeat with new request until reconciliation.
- Publish: resolve request-to-version result, preserve old Order economics.
- Migration/upload: retain source, retry failed stage/file, reconcile Storage object before cleanup.
- Support-safe IDs: public Order code and short operation reference only; no UUID/token/signed URL/secrets.

**Manual QA checklist:** guest save/reload/storage failure; authenticated autosave failure/reconnect; cross-device conflict; checkout refresh/offline; double-click and lost response; payment lost response/two Admins; Staff Draft refresh/two editors; renderer fail/retry; two Start attempts; partial migration; partial sticker upload; Template Publish retry; Commercial Publish concurrency.

**Expected outcome:** support/operator can determine what happened without asking customer to recreate data or exposing internals.

**Dependency:** Task 15.

**Commit:** `docs(operations): add State45 recovery runbook`.

---

## 6. Required consistency, scope, and verification protocol

Every implementation task must satisfy this before it is marked complete:

### Consistency check

- Grep every call site and duplicate implementation for changed functions, RPC signatures, stable error codes, smoke flags, request IDs, and UI state names.
- When changing a SQL function signature or result payload, update all route/action/service callers, mocks, repositories, seed/test fixtures, and every SQL test. Confirm with exact searches such as `grep` equivalent through repository search for the function name and old/new argument count.
- When changing Admin authorization, inspect every `requireCurrentStaff`, `requireStaff`, `verifyStaffAccess`, privileged client construction, and smoke bypass occurrence. A route-level fix alone is insufficient.
- When changing payment-report semantics, inspect both API routes and repository methods; no caller may retain the old non-atomic status/event pair.
- When changing guest storage schema, inspect `saveState`, `loadState`, `saveRecentProject`, `addRecentProject`, cleanup, migration, checkout, editor rehydration, and asset promotion callers.
- When changing error boundaries/result types, inspect every consumer’s retry/reset prop and visible message path; Next 16 uses `reset()` in the component contract.

### Scope check

- Review diff after each task against only the files listed for that task. Remove unrelated formatting, visual redesign, dependency upgrades, or business-rule changes.
- Confirm Product geometry, editor behavior, pricing/payment policy, Template lifecycle, production terminology, and historical data semantics are unchanged except for reliability/security enforcement explicitly listed.
- Prefer the smallest server transaction/adapter/RPC change that closes the verified gap. Do not add a generic framework when one operation-specific request log or unique constraint is sufficient.

### Verification check

- Run the entire affected test file/module, not only the newly added or expected-to-flip test. The mandatory command appears in every task; sibling tests must remain green.
- Run `pnpm typecheck` for TypeScript changes and `pnpm build` for route/instrumentation/Next changes.
- Run the real changed surface: browser flow for UI/storage/checkout, isolated Supabase SQL for RLS/transaction changes, production server for E2E.
- Verify backend state after every mutation scenario: exact Order ID/count, payment status/event count, revision, lease epoch, immutable version pointers, artifact files/checksum, Publish version/current pointer, ownership, and no uncontrolled orphan.
- Record failed checks and root cause; never change tests or gates to conceal a failure.

---

## 7. Definition of done

State45 is complete only when:

1. Every listed critical operation has a repository-backed source of truth and explicit failure/retry/refresh/close/concurrency/diagnostic semantics in the matrix.
2. Verified P0/P1 reliability and security gaps are fixed.
3. Guest local persistence uses a blob-capable store for large binaries, handles quota/corruption safely, and remains local-first.
4. Authenticated/draft autosave retains unsynced work and rejects stale writes.
5. Refresh recovers every critical workflow from an authoritative source.
6. Order creation is exactly-once under double-submit and committed-response loss.
7. Guest claim works with valid proof; migration is partial-failure safe.
8. Payment report/confirmation are atomic, replay-safe, and exactly-once under retry/concurrency.
9. Staff revision approval, Publish operations, Start Production, and Complete Production are replay/concurrency safe and role-correct.
10. Production artifacts recover from crash/partial output and never become ready before mandatory verification.
11. Expected errors use stable safe results; unexpected errors are isolated and observable.
12. Logs/traces redact PII, tokens, signed URLs, image contents and full DesignDocuments; critical operations carry correlation IDs/release context.
13. Golden E2E covers customer, Admin/production, Staff revision, account migration, content/template, and commercial versioning.
14. Failure E2E covers storage, offline, network, unknown outcome, concurrency, renderer, upload and migration failures.
15. Desktop Chromium, mobile Chromium customer smoke, mobile WebKit customer smoke, and Admin Chromium smoke run in production mode.
16. Clean migrations, relevant upgrade path, RLS, Storage policies, seed, typecheck, full unit/integration tests, production build and lint gate pass.
17. Recovery runbook and manual QA ledger exist.
18. All pre-State45 tests remain green.

### Explicitly deferred

Full PWA/background sync, push notifications, offline Supabase mirror, distributed saga/workflow engine, full WCAG remediation, Core Web Vitals optimization, full Safari visual polish, analytics BI, customer support ticketing, and automated incident-response platform.
