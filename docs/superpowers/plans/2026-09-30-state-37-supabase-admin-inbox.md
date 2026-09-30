# State 37: Supabase Backend Retrofit + Admin Orders Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retrofit durable Supabase persistence into server-worthy functionality without moving anonymous editor state off-device, then ship a protected, real-data `/admin/orders` operational inbox.

**Architecture:** Keep the existing editor, local project storage, undo/redo, transient UI state, and checkout UX intact. Replace the in-memory `ServerOrderStore` and filesystem asset cache at the State 35 checkout promotion boundary with Supabase Postgres + private Storage behind domain repositories and one server-side order preparation service. Add Supabase Auth/RBAC/RLS for staff and a server-paginated Orders Inbox that reads mapped domain models, not raw database rows.

**Tech Stack:** Next.js 16 App Router with `proxy.ts`, React 19, TypeScript, Tailwind CSS v4, existing shadcn primitives, GSAP 3.15 + `@gsap/react`, `@supabase/supabase-js`, `@supabase/ssr`, Supabase Postgres/Storage/Auth, SQL migrations and seed files, Node test runner via `pnpm test`.

**Spec:** State 37 requirements supplied in the user request; existing State 35 design at `docs/superpowers/specs/2026-09-30-customer-information-ux-design.md`; repository baseline recorded below.

## Global Constraints

- Anonymous editor state remains local-first: session state, maximum three recent guest projects, 30-day retention, undo/redo, viewport, selection, sheets, detents, font search, layer scroll, focus mode, crop transactions, and temporary previews stay client/session concerns.
- Do not create a Supabase project row when a guest opens the editor. Promote only the current checkout project.
- Do not scan or upload historical local projects automatically.
- Supabase integration starts at Checkout State 35: valid customer data → promote current project/assets → immutable approved design version → pending order → State 36 QR payment.
- Existing States 01–36 behavior and tests remain authoritative; do not rewrite working editor/product/Preflight/checkout systems.
- All schema, grants, RLS policies, Storage policies, indexes, and seed data are tracked SQL. No Dashboard-only setup.
- SQL is written and tested syntactically in-repo where possible, but VPS Supabase integration tests are blocked until the user deploys SQL and supplies non-secret connection environment variables.
- Browser code may use only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- `SUPABASE_SECRET_KEY` is server-only, never `NEXT_PUBLIC_*`, never passed through props, never logged, and never imported by client modules.
- Use request-scoped server Supabase clients with `@supabase/ssr`; use `supabase.auth.getClaims()` for protected server decisions, not unverified cookie values.
- RLS and Postgres grants are both required. Every exposed application table gets explicit policies or explicit client-role denial.
- Customer Order data and customer-uploaded assets are private. Published catalog metadata is the only anonymous-read domain.
- Order identity uses internal UUID plus server-generated unique human code. Human code is searchable, not authorization.
- Payment, design, and fulfillment are independent status dimensions.
- QR visibility never means payment is confirmed. Customer report means `payment_reported`; only authorized staff can later mark `paid`.
- Inbox queries are server-side, paginated, filtered, and column-minimal. Never load all Orders into the browser.
- Realtime is a freshness hint only; initial query, refetch, focus, and reconnect remain correctness paths.
- No payment-confirmation mutation UI, detail editing, fulfillment mutation, cancellation, bulk action, analytics dashboard, customer account migration, webhook, shipping integration, or production export in State 37.
- Preserve Vietnamese UX copy and current visual tokens. Admin is an Operate surface: scanability outranks decorative stationery treatment.

## Baseline Evidence

Before implementation, the repository audit recorded:

- `pnpm test`: 496 tests, 496 pass, 0 fail.
- `pnpm build`: successful Next.js 16.3.6 production build and TypeScript compilation.
- Build emitted five Turbopack warnings from filesystem tracing in `src/lib/asset-store.ts`; the Supabase asset migration removes that runtime dependency from the order path.
- No `supabase/` directory exists.
- No `src/app/admin/**`, `src/proxy.ts`, Supabase client, repository layer, staff auth, or RLS test files exist.
- Current order creation is `POST /api/orders` → `promoteDesignAssets()` → global in-memory `serverOrderStore`; State 36 reads the same memory store.
- Current guest projects remain in `sessionStorage`/`localStorage`; recent projects are capped at three but the current reader does not enforce 30-day expiry.
- Current static catalog contains four products, eight canonical/alias slugs, 17 unique templates plus aliases, 11 published fonts, one draft font, one archived font, and no sticker-library graphics.

## File Map

### Supabase foundation

- Create: `supabase/config.toml` — local/project config without secrets.
- Create: `supabase/migrations/0001_state37_core.sql` — enums, catalog, staff, projects, assets, design versions, orders, payments, events, guest access, indexes, grants, RLS, Storage metadata.
- Create: `supabase/migrations/0002_state37_storage.sql` — private/public bucket definitions and Storage object policies through Storage API metadata/policies.
- Create: `supabase/seed.sql` — products, variants, published templates, published fonts, sticker metadata, deterministic example staff-role rows only when Auth user IDs are supplied, and example Orders/design versions/events.
- Create: `supabase/tests/state37_rls.sql` — SQL policy/grant assertions to run after VPS deployment.
- Create: `.env.example` — public URL/publishable key and server-only secret key names; no values.
- Modify: `package.json`, `pnpm-lock.yaml` — add Supabase SDKs only.
- Create: `src/lib/supabase/browser.ts` — browser client.
- Create: `src/lib/supabase/server.ts` — request-scoped SSR client.
- Create: `src/lib/supabase/admin.ts` — privileged server-only client with import-boundary guard.
- Create: `src/lib/supabase/config.ts` — validated environment access and configured/unconfigured mode.
- Create: `src/proxy.ts` — Supabase auth refresh plus `/admin/**` optimistic redirect; server authorization remains mandatory.

### Domain/repository layer

- Create: `src/lib/domain/catalog.ts` — application catalog models and row mappers.
- Create: `src/lib/domain/order.ts` — independent status models, Inbox row model, guest access model.
- Create: `src/lib/repositories/catalog-repository.ts` — published catalog reads with static fallback for offline editor/catalog operation.
- Create: `src/lib/repositories/order-repository.ts` — server-only Order creation/read/list/count/access methods.
- Create: `src/lib/repositories/project-repository.ts` — promoted project and working revision persistence.
- Create: `src/lib/repositories/design-version-repository.ts` — append-only approved design versions.
- Create: `src/lib/repositories/asset-repository.ts` — Postgres asset metadata + private Supabase Storage operations.
- Create: `src/lib/repositories/payment-repository.ts` — payment instruction lookup and customer report transition.
- Create: `src/lib/repositories/order-event-repository.ts` — append-only audit events.
- Create: `src/lib/services/prepare-order-from-guest-checkout.ts` — single promotion/order orchestration boundary.
- Modify: `src/lib/order-types.ts`, `src/lib/server-order-store.ts`, `src/lib/asset-store.ts`, `src/lib/payment-qr-provider.ts` — preserve domain-compatible callers while routing server persistence through repositories; remove normal-path memory/disk authority.
- Modify: `src/lib/storage.ts` — enforce 30-day local-project TTL only; do not migrate data.

### State 35/36 API integration

- Modify: `src/app/api/orders/route.ts` — call preparation service, server-recompute quote, return safe guest access token/cookie metadata.
- Modify: `src/app/api/orders/[id]/route.ts` — require guest access token or staff authorization; return only domain-safe order data.
- Modify: `src/app/api/orders/[id]/payment/route.ts` — use PaymentRepository and authorized guest access.
- Modify: `src/app/api/orders/[id]/payment/report/route.ts` — allow only controlled guest token and append audit event.
- Modify: `src/app/order/[id]/page.tsx`, `src/app/checkout/page.tsx`, `src/components/checkout/payment-qr-panel.tsx` — preserve UX while using durable server order recovery.
- Create: `src/lib/guest-order-access.ts` — opaque token generation, hashing, HttpOnly cookie/session verification.

### Catalog retrofit

- Modify: `src/lib/product-catalog.ts`, `src/lib/fonts.ts`, `src/lib/product-state.ts`, `src/lib/add-content.ts` — retain typed rendering/template fallbacks and static IDs; route published customer metadata through adapters where server data is available.
- Modify customer catalog/template/font consumers only at their existing data-fetch seams; do not alter editor geometry or template application algorithms.
- Create: `src/app/api/catalog/route.ts` only if the existing Server Component boundary cannot consume the repository directly.

### Admin Inbox

- Create: `src/lib/admin/authorization.ts` — verified staff identity and role checks.
- Create: `src/lib/admin/inbox-query.ts` — URL filter parsing and repository query contract.
- Create: `src/app/admin/layout.tsx` — protected staff shell boundary.
- Create: `src/app/admin/login/page.tsx` — minimal Supabase Auth email/password login; no customer account flow.
- Create: `src/app/admin/orders/page.tsx` — server-rendered initial Inbox state.
- Create: `src/app/admin/orders/orders-inbox-client.tsx` — search/filter/view URL state, pagination, realtime refresh hint, loading/error transitions.
- Create: `src/app/admin/orders/[id]/page.tsx` — read-only order context handoff needed by row navigation; no high-risk mutations.
- Create: `src/app/api/admin/orders/route.ts` — verified staff list/count endpoint.
- Create: `src/app/api/admin/orders/[id]/route.ts` — verified staff read-only detail endpoint.
- Create: `src/components/admin/orders-inbox.tsx`, `order-row.tsx`, `order-filters.tsx`, `order-status-chip.tsx`, `order-thumbnail.tsx`, `admin-empty-state.tsx` — responsive shadcn composition.
- Create: `src/components/ui/tabs.tsx`, `src/components/ui/dropdown-menu.tsx`, `src/components/ui/sheet.tsx`, or install only missing official primitives after checking existing registry; do not duplicate existing primitives.

### Tests and docs

- Create: `src/test/supabase-config.test.ts`, `catalog-repository.test.ts`, `guest-order-access.test.ts`, `order-repository.test.ts`, `order-preparation.test.ts`, `admin-authorization.test.ts`, `admin-inbox-query.test.ts`, `orders-inbox.test.ts`.
- Modify: `src/test/orders-api.test.ts`, `order-flow.test.ts`, `payment-flow.test.ts`, `state-36-lifecycle.test.ts`, `asset-store.test.ts`, `checkout-draft.test.ts`, `product-catalog.test.ts`, `font-browser.test.ts` only where durable adapters change existing contracts.
- Modify: `README.md` — VPS Supabase setup, SQL deployment, seed, env, staff role bootstrap, Storage, RLS, and verification commands.
- Create: `docs/superpowers/state37-supabase-runbook.md` — operational deployment/troubleshooting runbook.

---

### Task 1: Add Supabase SDK boundaries and environment contract

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`
- Create: `.env.example`
- Create: `src/lib/supabase/config.ts`
- Create: `src/lib/supabase/browser.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`
- Test: `src/test/supabase-config.test.ts`

**Interfaces:**

```ts
export interface SupabaseConfig {
  url: string;
  publishableKey: string;
  secretKey?: string;
}

export function getSupabaseConfig(): SupabaseConfig | null;
export function isSupabaseConfigured(): boolean;
export function createBrowserSupabaseClient(): SupabaseClient;
export async function createServerSupabaseClient(): Promise<SupabaseClient>;
export function createPrivilegedSupabaseClient(): SupabaseClient;
```

- [ ] **Step 1: Add only `@supabase/supabase-js` and `@supabase/ssr` and run typecheck.**

Run: `pnpm add @supabase/supabase-js @supabase/ssr && pnpm typecheck`

Expected: existing TypeScript checks pass; no application behavior changes.

- [ ] **Step 2: Write failing config tests.**

Test configured public variables, missing-variable behavior, server-only secret lookup, and rejection of `NEXT_PUBLIC_SUPABASE_SECRET_KEY` as a valid privileged credential.

- [ ] **Step 3: Implement clients with explicit import boundaries.**

Browser client uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Server client uses request cookies through `createServerClient`. Privileged client requires `SUPABASE_URL` + `SUPABASE_SECRET_KEY`; it must throw if imported in a browser bundle or if only public variables are present.

- [ ] **Step 4: Run focused tests and typecheck.**

Run: `node --test --experimental-strip-types src/test/supabase-config.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add package.json pnpm-lock.yaml .env.example src/lib/supabase src/test/supabase-config.test.ts
git commit -m "feat(supabase): add typed client boundaries and environment contract"
```

### Task 2: Write tracked SQL schema, grants, RLS, Storage policies, and seed

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/0001_state37_core.sql`
- Create: `supabase/migrations/0002_state37_storage.sql`
- Create: `supabase/seed.sql`
- Create: `supabase/tests/state37_rls.sql`

**Interfaces:**

The SQL contract must provide these tables and columns:

```sql
staff_roles(user_id uuid primary key references auth.users(id), role text check (role in ('admin','editor')))
products(id text primary key, slug text unique, name text, product_type text, active boolean, metadata jsonb, created_at timestamptz, updated_at timestamptz)
product_variants(id text primary key, product_id text references products(id), name text, price integer, metadata jsonb, active boolean)
templates(id text primary key, product_id text null, slug text unique, name text, published boolean, thumbnail_path text null, metadata jsonb, created_at timestamptz, updated_at timestamptz)
template_versions(id uuid primary key, template_id text references templates(id), version integer, design_document jsonb, created_at timestamptz, unique(template_id, version))
fonts(id text primary key, family_name text, google_font text null, storage_path text null, published boolean, metadata jsonb)
sticker_assets(id text primary key, category text, tags text[], storage_path text, thumbnail_path text, published boolean, metadata jsonb, created_at timestamptz)
projects(id uuid primary key, owner_user_id uuid null references auth.users(id), guest_key_hash text null, product_id text, variant_id text, status text, current_working_revision integer, created_at timestamptz, updated_at timestamptz)
assets(id uuid primary key, project_id uuid references projects(id), kind text, storage_bucket text, storage_path text unique, original_name text, mime_type text, byte_size integer, pixel_width integer null, pixel_height integer null, checksum text null, metadata jsonb, created_at timestamptz)
design_versions(id uuid primary key, project_id uuid references projects(id), version_number integer, source text, design_document jsonb, product_snapshot jsonb, preflight_snapshot jsonb, preflight_revision text, created_by uuid null references auth.users(id), created_at timestamptz, unique(project_id, version_number))
orders(id uuid primary key, public_order_code text unique, project_id uuid references projects(id), approved_design_version_id uuid references design_versions(id), product_snapshot jsonb, variant_snapshot jsonb, quantity integer, unit_price integer, subtotal integer, total integer, currency text, customer_full_name text, customer_phone text, customer_phone_normalized text, shipping_address text, payment_status text, design_status text, fulfillment_status text, idempotency_key text unique, created_at timestamptz, updated_at timestamptz)
order_payments(id uuid primary key, order_id uuid unique references orders(id), provider text, amount integer, currency text, reference text, qr_payload text null, status text, customer_reported_at timestamptz null, confirmed_at timestamptz null, confirmed_by uuid null references auth.users(id), created_at timestamptz)
order_events(id uuid primary key, order_id uuid references orders(id), event_type text, actor_user_id uuid null references auth.users(id), actor_role text null, payload jsonb, created_at timestamptz)
guest_order_access(order_id uuid primary key references orders(id), token_hash text unique, expires_at timestamptz, created_at timestamptz)
```

- [ ] **Step 1: Write schema SQL in dependency order.**

Create enums/check constraints for `payment_status`, `design_status`, and `fulfillment_status`; add database-generated timestamps; add a server-side function or trigger for unique `public_order_code` generation; add indexes for `created_at`, all three status columns, `public_order_code`, normalized phone, `owner_user_id`, `project_id`, `order_id`, and staff role lookup.

- [ ] **Step 2: Write grants and RLS in the same migrations.**

Revoke all `anon`/`authenticated` table privileges by default. Grant anonymous select only on `active` products/variants, published templates/template versions, published fonts, and published sticker metadata. Grant staff reads through policies using `staff_roles`; permit admin/editor order reads but reserve future destructive mutations for admin policies. Deny anonymous direct Orders, Projects, Assets, DesignVersions, Payments, Events, and GuestAccess access.

Use a helper such as `public.is_staff(required_role text)` with a locked `search_path` if needed. Do not use a security-definer helper without explicit `search_path` and execute restrictions.

- [ ] **Step 3: Write Storage buckets and policies.**

Create private `customer-assets` and `approved-renders`, plus public-read/restricted-write `template-assets`, `sticker-library`, and `fonts`. Revoke unrestricted Storage access; allow customer-private reads only through controlled server routes/signing, and allow published asset reads only where the catalog marks them published.

- [ ] **Step 4: Write deterministic seed data.**

Seed the four current product IDs, their current variants/prices, current published catalog metadata, 11 published fonts, draft/archived font metadata, current template IDs/design documents, and example orders with approved versions, payments, events, and approved thumbnail paths. Preserve existing IDs/slugs. Do not insert fake Auth users; include a commented SQL command and runbook step that attaches `admin`/`editor` roles after real Auth users exist.

- [ ] **Step 5: Write SQL policy assertions.**

`supabase/tests/state37_rls.sql` must prove: anon cannot select Orders or private Storage objects; non-staff authenticated users cannot read Inbox rows; editor/admin can read permitted order summaries; editor cannot perform admin-only payment/lifecycle updates; published catalog reads work; unpublished catalog reads fail; Storage bucket separation holds.

- [ ] **Step 6: Review SQL statically and commit.**

Run: `git diff --check -- supabase .env.example`

Do not claim DB execution. Record in the plan handoff that SQL execution and `supabase test db` remain blocked until the user deploys the migrations to VPS.

```bash
git add supabase
 git commit -m "feat(supabase): add State 37 schema RLS storage policies and seed"
```

### Task 3: Add domain models and repository row mappers

**Files:**
- Create: `src/lib/domain/catalog.ts`
- Create: `src/lib/domain/order.ts`
- Create: `src/lib/repositories/catalog-repository.ts`
- Create: `src/lib/repositories/order-repository.ts`
- Create: `src/lib/repositories/project-repository.ts`
- Create: `src/lib/repositories/design-version-repository.ts`
- Create: `src/lib/repositories/asset-repository.ts`
- Create: `src/lib/repositories/payment-repository.ts`
- Create: `src/lib/repositories/order-event-repository.ts`
- Test: `src/test/catalog-repository.test.ts`, `src/test/order-repository.test.ts`

**Interfaces:**

Define shared domain contracts before repository-specific methods:

```ts
export type StaffRole = 'admin' | 'editor';
export interface StaffIdentity { userId: string; role: StaffRole; email: string | null; }
export type DesignStatus = 'awaiting_review' | 'ready' | 'editing' | 'approved' | 'needs_changes';
export type FulfillmentStatus = 'unprocessed' | 'ready_for_production' | 'in_production' | 'completed' | 'cancelled';
export type AttentionReason = 'PAYMENT_REPORTED' | 'DESIGN_REVIEW' | 'DESIGN_NEEDS_CHANGES' | 'ASSET_ERROR' | 'OPERATIONAL_HOLD';
export interface InboxCounts { attention: number; payment: number; production: number; }
export interface OrderAccess { kind: 'guest'; token: string } | { kind: 'staff'; staff: StaffIdentity };
export interface CreatePendingOrderInput {
  idempotencyKey: string;
  projectId: string;
  approvedDesignVersionId: string;
  productSnapshot: Record<string, unknown>;
  variantSnapshot: Record<string, unknown>;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  total: number;
  customer: CustomerInfo;
  paymentReference: string;
  guestAccessTokenHash: string;
}
export interface PublishedTemplate { id: string; productId: ProductId | null; slug: string; name: string; thumbnailPath: string | null; metadata: Record<string, unknown>; }
export interface PublishedFont { id: string; familyName: string; googleFont: string | null; storagePath: string | null; metadata: Record<string, unknown>; }
export interface PublishedSticker { id: string; category: string; tags: string[]; storagePath: string; thumbnailPath: string; metadata: Record<string, unknown>; }
export interface ApprovedDesignVersionSummary { id: string; revision: string; thumbnailPath: string | null; preflightRevision: string; createdAt: string; }
export interface PaymentSummary { status: PaymentStatus; amount: number; currency: string; reference: string; customerReportedAt: string | null; }
export interface OrderEventSummary { eventType: string; actorRole: StaffRole | null; createdAt: string; }
```

Repository contracts:

```ts
export interface OrderInboxRow {
  id: string;
  publicOrderCode: string;
  createdAt: string;
  productId: ProductId;
  productLabel: string;
  variantLabel: string;
  quantity: number;
  customerName: string;
  amount: number;
  currency: string;
  paymentStatus: PaymentStatus;
  designStatus: DesignStatus;
  fulfillmentStatus: FulfillmentStatus;
  thumbnailPath: string | null;
  attentionReasons: AttentionReason[];
}

export interface OrderListQuery {
  view: 'attention' | 'payment' | 'production' | 'all';
  search: string;
  paymentStatus?: PaymentStatus;
  designStatus?: DesignStatus;
  fulfillmentStatus?: FulfillmentStatus;
  productId?: ProductId;
  dateRange?: { from: string; to: string };
  page: number;
  pageSize: number;
}

export interface OrderRepository {
  createPendingOrder(input: CreatePendingOrderInput): Promise<PendingOrder>;
  getById(id: string, access: OrderAccess): Promise<PendingOrder | null>;
  getByPublicCode(code: string, access: OrderAccess): Promise<PendingOrder | null>;
  listInbox(query: OrderListQuery, staff: StaffIdentity): Promise<{ rows: OrderInboxRow[]; total: number }>;
  countViews(staff: StaffIdentity): Promise<InboxCounts>;
}
```

- [ ] **Step 1: Write mapper tests using snake_case fixtures.**

Assert database rows map to camelCase application models, unknown enum values fail closed, list rows omit design JSON/address/full events, and changing a catalog row does not mutate a previously mapped order snapshot.

- [ ] **Step 2: Implement domain enums and mappers.**

Keep raw Postgres names inside repository files. Export application types with independent status dimensions and explicit attention reasons. Do not expose Supabase response types to components.

- [ ] **Step 3: Implement repository contracts with configured Supabase and test adapters.**

Repositories accept a Supabase client/dependency object. Unit tests use deterministic fake query results; no React component calls `.from()` directly.

- [ ] **Step 4: Implement catalog fallback behavior.**

When Supabase is not configured, customer catalog consumers retain current static `CATALOG_PRODUCTS`, typed `TEMPLATES`, `FONT_REGISTRY`, and product geometry. When configured, published metadata can hydrate server/catalog routes, but typed rendering defaults remain code-owned.

- [ ] **Step 5: Run focused tests.**

Run: `node --test --experimental-strip-types src/test/catalog-repository.test.ts src/test/order-repository.test.ts`

Expected: PASS without VPS access.

### Task 4: Replace filesystem/in-memory promotion authority with Supabase asset/project/version services

**Files:**
- Create: `src/lib/services/prepare-order-from-guest-checkout.ts`
- Modify: `src/lib/repositories/project-repository.ts`, `asset-repository.ts`, `design-version-repository.ts`, `order-event-repository.ts`
- Modify: `src/lib/asset-store.ts`, `src/lib/server-order-store.ts`, `src/lib/order-types.ts`
- Test: `src/test/order-preparation.test.ts`, `src/test/asset-store.test.ts`, `src/test/order-flow.test.ts`

**Interfaces:**

```ts
export interface PrepareOrderInput {
  idempotencyKey: string;
  design: DesignState;
  customer: CustomerInfo;
  designRevision: string;
  preflightRevision: string;
  preflightAcknowledged: boolean;
  preflightSnapshot: PreflightResult;
  guestAccessSeed: string;
}

export interface PreparedOrderResult {
  order: PendingOrder;
  guestAccessToken: string;
  paymentData: PaymentInstructions;
}

export async function prepareOrderFromGuestCheckout(input: PrepareOrderInput): Promise<PreparedOrderResult>;
```

- [ ] **Step 1: Add failing lifecycle tests.**

Cover current guest design with one blob asset → one project row, one Storage object, one asset metadata row, one immutable DesignVersion, one pending Order, one payment row, one order-created event, and one guest access record. Assert unrelated local projects are never touched.

- [ ] **Step 2: Implement private Storage promotion.**

Upload originals and derived assets through Storage API to deterministic project/order paths. Preserve original and derivatives. Store metadata in Postgres. Reuse an existing asset by project/source/checksum on retry. Keep `/api/assets/[id]` as the delivery contract, but make it resolve private Storage through a server-authorized route or short-lived signed URL; do not expose permanent public customer URLs.

- [ ] **Step 3: Implement project and append-only DesignVersion creation.**

Create a promoted project only inside this service. Store sanitized, rewritten design JSONB with server-backed asset references, product/variant snapshot, full relevant Preflight snapshot, revision, source `customer_approved`, and immutable version number. Never update an existing approved version; retries reuse the version attached to the idempotent order.

- [ ] **Step 4: Implement atomic relational creation.**

Use a Postgres RPC/function or a single transaction-capable server operation for DesignVersion + Order + Payment + initial Event + GuestAccess. The server recomputes pricing via `calculatePriceQuote`; client subtotal is ignored. Store `pending_payment`, `awaiting_review`, and `unprocessed` independently.

- [ ] **Step 5: Remove normal-path memory/disk authority.**

Keep a fake/in-memory repository only as an explicit unit-test adapter. `serverOrderStore` and `asset-store` must no longer be the production source of truth. Remove reliance on `node_modules/.cache/quynhtrang-assets` from the Supabase path, eliminating the current Turbopack filesystem-tracing warnings from order persistence.

- [ ] **Step 6: Verify idempotency and immutability.**

Run: `node --test --experimental-strip-types src/test/order-preparation.test.ts src/test/asset-store.test.ts src/test/order-flow.test.ts`

Expected: duplicate key returns the original Order; source design mutation leaves the approved version unchanged; partial asset retry reuses the existing Storage path in the fake adapter.

### Task 5: Implement secure guest Order access and retrofit State 35/36 APIs

**Files:**
- Create: `src/lib/guest-order-access.ts`
- Modify: `src/app/api/orders/route.ts`
- Modify: `src/app/api/orders/[id]/route.ts`
- Modify: `src/app/api/orders/[id]/payment/route.ts`
- Modify: `src/app/api/orders/[id]/payment/report/route.ts`
- Modify: `src/app/order/[id]/page.tsx`, `src/app/checkout/page.tsx`, `src/components/checkout/payment-qr-panel.tsx`
- Test: `src/test/guest-order-access.test.ts`, `orders-api.test.ts`, `payment-flow.test.ts`, `state-36-lifecycle.test.ts`

**Interfaces:**

```ts
export function createGuestOrderAccessToken(): string;
export function hashGuestOrderAccessToken(token: string): string;
export function setGuestOrderAccessCookie(response: NextResponse, token: string): void;
export async function verifyGuestOrderAccess(request: Request, orderId: string): Promise<boolean>;
```

- [ ] **Step 1: Write access-control tests before changing routes.**

Assert predictable `QTxxxx` without the opaque token returns 401/404; correct HttpOnly token reads only its Order; expired/wrong token fails; staff access uses verified staff identity; customer payment reporting changes only `payment_reported` and appends an event.

- [ ] **Step 2: Implement opaque access token flow.**

Generate cryptographically random token, store only a hash, set a Secure/HttpOnly/SameSite cookie scoped to the order flow, and return no token in public JSON after cookie installation. The human Order code remains display/search-only.

- [ ] **Step 3: Retrofit POST `/api/orders`.**

Keep request shape compatible with State 35, add `preflightSnapshot` if the existing client can supply it, validate server-side, call `prepareOrderFromGuestCheckout()`, set the access cookie, and return the existing `order` + `paymentData` shape plus no private secret. Return stable stale-revision and promotion errors in current Vietnamese copy.

- [ ] **Step 4: Retrofit GET/payment/report routes.**

Require guest cookie or verified staff for Order reads. Use PaymentRepository for instructions/reporting. Never return full design JSON or asset metadata to the list/detail route unless the authorized detail path explicitly requests it.

- [ ] **Step 5: Preserve State 35/36 behavior.**

Keep existing form, loading, retry, QR, `payment_reported`, refresh recovery, and Back behavior. Replace only the persistence calls and guest access handling. Add tests proving QR shown → pending; report → payment_reported; refresh → same Order; no duplicate submission.

- [ ] **Step 6: Run existing and focused tests.**

Run: `pnpm test`

Expected: all baseline tests pass, with new secure-access/order-persistence tests included. VPS-backed verification remains blocked until deployment env exists.

### Task 6: Retrofit published Products, Variants, Templates, Fonts, and Sticker metadata

**Files:**
- Modify: `src/lib/product-catalog.ts`, `src/lib/product-state.ts`, `src/lib/fonts.ts`, `src/lib/add-content.ts`
- Create/modify: `src/lib/repositories/catalog-repository.ts`, optional `src/app/api/catalog/route.ts`
- Modify: existing catalog/template/font consumers at their current server/client boundaries
- Test: `src/test/product-catalog.test.ts`, `font-browser.test.ts`, new catalog repository tests

**Interfaces:**

```ts
export interface PublishedCatalogRepository {
  listProducts(): Promise<CatalogProduct[]>;
  listPublishedTemplates(productId?: ProductId): Promise<PublishedTemplate[]>;
  listPublishedFonts(): Promise<PublishedFont[]>;
  listPublishedStickers(category?: string): Promise<PublishedSticker[]>;
}
```

- [ ] **Step 1: Add regression tests for stable IDs and offline fallback.**

Assert all current product IDs, aliases, variants, 17 unique template IDs/aliases, 11 published font IDs, draft/archived visibility, and current typed geometry behavior remain unchanged when Supabase is unavailable.

- [ ] **Step 2: Map published database rows to domain models.**

Only `published=true` catalog content reaches anonymous customer consumers. Keep product geometry, rendering algorithms, template editable structure compatibility, and font lazy loading in version-controlled code. Do not turn executable design logic into database JSON.

- [ ] **Step 3: Wire existing consumers to repository/server boundary.**

Use Server Components/API for published metadata. Keep client fallback to static registry when offline. Keep `add-content.ts` sticker status honest: metadata becomes available only when seeded published sticker assets exist; do not invent sticker graphics.

- [ ] **Step 4: Run focused tests.**

Run: `node --test --experimental-strip-types src/test/product-catalog.test.ts src/test/font-browser.test.ts`

Expected: PASS; no editor canvas or local persistence behavior changes.

### Task 7: Add Supabase Auth refresh, staff RBAC, and protected admin routing

**Files:**
- Create: `src/proxy.ts`
- Create: `src/lib/admin/authorization.ts`
- Create: `src/app/admin/login/page.tsx`
- Create: `src/app/admin/layout.tsx`
- Modify: root/admin route metadata only as needed
- Test: `src/test/admin-authorization.test.ts`

**Interfaces:**

Task 7 imports `StaffRole` and `StaffIdentity` from `src/lib/domain/order.ts`; it does not define a second role model.

```ts
export async function requireStaff(request: Request, role?: StaffRole): Promise<StaffIdentity>;
export async function getOptionalStaff(request: Request): Promise<StaffIdentity | null>;
```

- [ ] **Step 1: Write authorization tests with verified-claims fixtures.**

Assert admin and editor can access read-only Inbox; non-staff authenticated users receive 403; anon receives redirect/401; editor fails admin-only capability checks; browser-supplied role strings are ignored.

- [ ] **Step 2: Implement `proxy.ts` for session refresh and optimistic redirect.**

Use Supabase SSR cookie refresh on matched admin/auth paths. Redirect unauthenticated `/admin/**` to `/admin/login?next=...`; do not treat Proxy as final authorization. Exclude public customer/editor routes from unnecessary auth work.

- [ ] **Step 3: Implement minimal staff login.**

Use Supabase Auth email/password sign-in, Vietnamese error copy, loading/error states, and redirect to preserved `next` path. Do not add customer registration or account migration.

- [ ] **Step 4: Implement server `requireStaff`.**

Create request-scoped client, call `getClaims()`, query `staff_roles`, and return role. Enforce role again inside every admin API/repository call.

- [ ] **Step 5: Run tests and typecheck.**

Run: `node --test --experimental-strip-types src/test/admin-authorization.test.ts && pnpm typecheck`

Expected: PASS without requiring live Auth; live staff login is verified after VPS SQL/env deployment.

### Task 8: Build Inbox server query, counts, search, filters, pagination, and secure thumbnails

**Files:**
- Create: `src/lib/admin/inbox-query.ts`
- Create: `src/app/api/admin/orders/route.ts`
- Create: `src/app/api/admin/orders/[id]/route.ts`
- Create: `src/lib/admin/thumbnail-delivery.ts`
- Modify: `src/lib/repositories/order-repository.ts`, `asset-repository.ts`
- Test: `src/test/admin-inbox-query.test.ts`

**Interfaces:**

```ts
export interface InboxQueryParams {
  view: 'attention' | 'payment' | 'production' | 'all';
  q: string;
  payment?: PaymentStatus;
  processing?: DesignStatus | FulfillmentStatus;
  product?: ProductId;
  date?: 'today' | '7d' | '30d';
  page: number;
  pageSize: number;
}

export interface InboxResponse {
  rows: OrderInboxRow[];
  counts: InboxCounts;
  page: number;
  pageSize: number;
  total: number;
}
```

- [ ] **Step 1: Write query tests.**

Test Cần xử lý deduplication across multiple attention reasons, Chờ thanh toán, Sẵn sàng sản xuất requiring paid + approved + ready_for_production, Tất cả newest-first, order-code/name/normalized-phone search, combined filters, date presets, deterministic pagination, and counts without loading full rows.

- [ ] **Step 2: Implement server query parsing and policy-safe repository queries.**

Normalize phone search, use case-insensitive name search, constrain page size to 20–50, use server-side filters/order/limit, select only row fields, and avoid N+1 asset/design queries. Do not return address, full design JSON, preflight JSON, event history, or signed URLs in list rows.

- [ ] **Step 3: Implement attention derivation.**

Derive reasons from payment reported, awaiting review, needs changes, asset/render error, and explicit operational hold. Return one row with an ordered `attentionReasons[]`; do not persist redundant `needs_attention` unless the query contract later proves a deterministic cache is needed.

- [ ] **Step 4: Implement secure thumbnail delivery.**

Use short-lived signed URLs or an authenticated server proxy for private approved-render paths. Thumbnail must resolve from `approved_design_version_id`, never mutable working project JSON. Do not persist signed URL as asset identity.

- [ ] **Step 5: Implement protected API routes.**

`GET /api/admin/orders` returns rows/counts; `GET /api/admin/orders/[id]` returns read-only authorized context. Reject unauthorized callers before querying private data. Keep raw Supabase errors server-side and return `Chưa thể tải đơn hàng.` to UI callers.

- [ ] **Step 6: Run focused tests.**

Run: `node --test --experimental-strip-types src/test/admin-inbox-query.test.ts`

Expected: PASS with fake repository data.

### Task 9: Build responsive shadcn Orders Inbox UI

**Files:**
- Create: `src/app/admin/orders/page.tsx`
- Create: `src/app/admin/orders/orders-inbox-client.tsx`
- Create: `src/components/admin/orders-inbox.tsx`
- Create: `src/components/admin/order-row.tsx`
- Create: `src/components/admin/order-filters.tsx`
- Create: `src/components/admin/order-status-chip.tsx`
- Create: `src/components/admin/order-thumbnail.tsx`
- Create: `src/components/admin/admin-empty-state.tsx`
- Add only missing official primitives under `src/components/ui/`
- Test: `src/test/orders-inbox.test.ts`

**Interfaces:**

```tsx
export interface OrdersInboxProps {
  initialData: InboxResponse;
  initialQuery: InboxQueryParams;
  role: StaffRole;
}
```

- [ ] **Step 1: Write component behavior tests.**

Assert default view is `Cần xử lý`; header counts show `Cần xử lý`, `Chờ tiền`, `Sẵn sàng`; search placeholder is `Tìm mã đơn, tên, SĐT...`; row shows thumbnail, code, relative/absolute time, product × quantity, name, selected status chips, and amount; address is absent; row navigation uses `/admin/orders/[id]`; no payment/cancel/production mutation buttons exist.

- [ ] **Step 2: Compose official shadcn primitives.**

Use `Input`, `Badge`, `Card`/responsive row structure, `Tabs` or `ToggleGroup`, `DropdownMenu`/`Popover`, `Skeleton`, `Sheet`, and `Button` where they improve semantics. Do not introduce a sidebar for this single operational surface unless the existing app gains multiple admin sections. Use warm paper/ink/blue tokens, restrained status colors, and no charts or dashboard cards.

- [ ] **Step 3: Implement responsive layout.**

Mobile/tablet uses scan-friendly cards and a filter Sheet; desktop may use a denser row/table composition with the same information hierarchy. Avoid horizontal-scroll-only desktop tables. Keep search/views/header stable during loading and refresh.

- [ ] **Step 4: Implement URL state and navigation preservation.**

Represent view, search, filters, date, and page in query parameters. On row navigation, retain query in the return URL. On return, restore query state and scroll where practical. Debounce text search lightly; do not issue a request for every unbatched keystroke.

- [ ] **Step 5: Implement loading, empty, error, permission states.**

Use stable skeleton rows; show `Chưa có đơn hàng.` with no-results context; show `Không có đơn phù hợp.` + `Xóa bộ lọc`; show `Chưa thể tải đơn hàng.` + `Thử lại`; never render partial private rows on permission failure.

- [ ] **Step 6: Add purposeful GSAP motion.**

Use `useGSAP` with a scoped Inbox ref for one short row/content entrance or view transition. Animate transform/opacity only, use `gsap.matchMedia()` with `prefers-reduced-motion: reduce`, clean up on route/unmount, and keep data refresh independent of animation. No animated counters/charts.

- [ ] **Step 7: Run focused tests and typecheck.**

Run: `node --test --experimental-strip-types src/test/orders-inbox.test.ts && pnpm typecheck`

Expected: PASS.

### Task 10: Add read-only Admin Order Detail handoff

**Files:**
- Create: `src/app/admin/orders/[id]/page.tsx`
- Create: `src/components/admin/order-detail-readonly.tsx`
- Modify: `src/app/admin/orders/orders-inbox-client.tsx` only for back-link state
- Test: extend `src/test/orders-inbox.test.ts`

**Interfaces:**

```ts
export interface ReadonlyAdminOrderDetail {
  order: PendingOrder;
  approvedDesign: ApprovedDesignVersionSummary;
  payment: PaymentSummary;
  events: OrderEventSummary[];
}
```

- [ ] **Step 1: Write route contract tests.**

Assert authorized staff can load order code, customer name/phone/address in detail, approved thumbnail/design reference, independent status dimensions, amount, and relevant event summaries; anonymous/non-staff callers receive no private data.

- [ ] **Step 2: Implement read-only server page.**

Load detail through repository with verified staff identity. Include Back to Inbox preserving encoded query state. Do not add payment confirmation, design editing, fulfillment mutation, cancellation, bulk action, or activity-feed management UI.

- [ ] **Step 3: Verify responsive detail rendering.**

Keep private customer data out of list rows but available in authorized detail. Ensure approved version—not mutable project state—drives preview/thumbnail.

### Task 11: Add Realtime freshness hint and refetch lifecycle

**Files:**
- Modify: `src/app/admin/orders/orders-inbox-client.tsx`
- Create: `src/lib/admin/realtime.ts`
- Test: extend `src/test/orders-inbox.test.ts`

**Interfaces:**

```ts
export function subscribeToOrderChanges(
  client: SupabaseClient,
  onChange: (orderId: string) => void,
): () => void;
```

- [ ] **Step 1: Write lifecycle tests.**

Assert subscription is narrow to Orders/status events, cleanup removes the channel, an event triggers refetch rather than trusting payload data, and disconnect does not make the Inbox unusable.

- [ ] **Step 2: Implement narrow private subscription.**

Use authenticated/private channel strategy compatible with deployed RLS. Subscribe only to changes needed for the Inbox; do not broadcast customer payloads. If client configuration is absent or subscription fails, keep normal query mode.

- [ ] **Step 3: Add refetch triggers.**

Refetch on route load, tab focus, reconnect, and relevant Realtime event. Preserve query state and show a non-blocking refresh state rather than replacing the page with a spinner.

- [ ] **Step 4: Run focused tests.**

Run: `node --test --experimental-strip-types src/test/orders-inbox.test.ts`

### Task 12: Enforce 30-day local project retention without server migration

**Files:**
- Modify: `src/lib/storage.ts`
- Test: `src/test/storage-retention.test.ts` or existing storage test location

**Interfaces:**

```ts
export const RECENT_PROJECT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export function getRecentProjects(now?: number): RecentProject[];
```

- [ ] **Step 1: Write expiry tests.**

Assert fresh projects remain, projects older than 30 days are removed on read, maximum three projects remains, and reading/cleaning local projects never calls Supabase or uploads assets.

- [ ] **Step 2: Implement bounded local cleanup.**

Filter invalid/stale rows in `getRecentProjects()`, persist the pruned list, and preserve current deduplication/sanitization behavior. Do not change editor session keys or history.

- [ ] **Step 3: Run focused and baseline tests.**

Run: `node --test --experimental-strip-types src/test/storage-retention.test.ts src/test/checkout-draft.test.ts`

### Task 13: Document VPS SQL deployment and staff bootstrap

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/state37-supabase-runbook.md`

- [ ] **Step 1: Document environment names exactly.**

Include `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_URL`, and `SUPABASE_SECRET_KEY`; state which are safe for browser and which are server-only.

- [ ] **Step 2: Document SQL deployment order.**

Provide exact steps for applying `0001_state37_core.sql`, `0002_state37_storage.sql`, `seed.sql`, then running `supabase/tests/state37_rls.sql` or equivalent SQL editor checks on the VPS. State that the app must not claim integration readiness before these SQL checks pass.

- [ ] **Step 3: Document staff setup.**

Create Auth users through the Supabase Auth mechanism, then insert their UUID/role into `staff_roles` using controlled SQL. Explain `admin` vs `editor` permissions and that customer accounts are not part of State 37.

- [ ] **Step 4: Document Storage and recovery assumptions.**

Explain private buckets, signed/proxy delivery, path identity versus temporary URLs, Postgres row backups versus Storage object durability, guest promotion retries, and clearing local dev seed data safely.

### Task 14: Full verification after VPS deployment

**Files:**
- No new production files; run all repository and SQL checks.

**Prerequisite:** The user has deployed migrations/seed/RLS to VPS and provided runtime env values through an uncommitted `.env.local` or process environment. Do not request or print secret values in chat/logs.

- [ ] **Step 1: Run repository checks before live integration.**

Run:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all tests pass, TypeScript passes, build passes. Record any remaining warning with exact file/path; do not hide it.

- [ ] **Step 2: Run deployed SQL/RLS checks.**

Run the user-approved SQL test file against the VPS project. Verify anon, authenticated non-staff, editor, and admin behavior; verify published/unpublished catalog and private/public Storage boundaries.

- [ ] **Step 3: Run guest flow smoke.**

In a browser at mobile and desktop widths: edit offline; confirm no Supabase project is created; complete Preflight → State 34 → State 35; submit once; verify one Project, Asset set, DesignVersion, Order, Payment, GuestAccess record, and Order event; refresh State 36; report payment; verify `payment_reported`, not `paid`.

- [ ] **Step 4: Run failure/retry smoke.**

Force a failed promotion or temporary API failure; verify local editor remains usable, State 35 preserves all fields, retry reuses assets and idempotency result, and duplicate submit does not create a second Order.

- [ ] **Step 5: Run staff Inbox smoke.**

Verify `/admin/orders` redirects unauthenticated users to login; login as editor/admin; confirm real seeded/created Orders appear; validate default Attention view, counts, search by code/name/phone, filters, pagination, empty/error states, responsive cards/table, approved thumbnail, row navigation, query-state restoration, and Realtime/refetch freshness.

- [ ] **Step 6: Record acceptance evidence.**

Capture command output and browser observations for infrastructure criteria 1–12, Inbox criteria 1–14, and regression criteria in the State 37 brief. Mark unverified VPS-dependent items as blocked rather than inferring success.

---

## Requirement Coverage Map

The numbered State 37 brief is covered by these plan tasks:

| Brief requirements | Plan coverage |
|---|---|
| 1–9: inspect existing architecture, preserve States 01–36, local-only boundaries | Baseline Evidence, Global Constraints, Tasks 3, 6, 12 |
| 10–18: env, server-only secret, clients, repositories, tracked migrations | Tasks 1–3, 13 |
| 19–31: Auth/RBAC/RLS/grants, guest access, private assets/render delivery | Tasks 2, 4, 5, 7, 8, 14 |
| 32–47: bucket separation, asset metadata/originals, catalog/templates/fonts/stickers | Tasks 2, 4, 6 |
| 48–57: promoted projects, immutable versions, Preflight snapshot, working-vs-approved boundary | Task 4 |
| 58–74: Orders, snapshots, independent statuses, payments, State 36, audit events | Tasks 2, 4, 5 |
| 75–83: indexes, search normalization, pagination, sorting, Realtime scope/security | Tasks 2, 8, 11 |
| 84–101: Inbox route, views, filters, default attention logic, date/product/payment/processing filters | Tasks 8–9 |
| 102–128: row content, thumbnails, status/amount/time, responsive layout, states, secure delivery, performance | Tasks 8–10 |
| 129–143: counts/indexes, server authorization, no service role client, tests, mock boundaries | Tasks 2, 3, 7, 8, 14 |
| 144–161: development seed, backward compatibility, partial failures, transaction boundaries, Phase 8 readiness | Tasks 2, 4, 6, 13 |
| 162–174: PII/logging/backups/offline/realtime/UI density/shadcn/motion/query state/debounce/page size | Tasks 5, 9, 11, 13, 14 |
| 175–180: acceptance, documentation, explicit non-goals, final mental model | Tasks 4–14 and this section |

## Acceptance Matrix

### Infrastructure

1. Supabase config exists — Tasks 1, 13.
2. Tracked migrations recreate schema — Task 2, verified in Task 14 after VPS deployment.
3. Staff Auth works — Task 7, Task 14.
4. Admin/editor RBAC works — Tasks 2, 7, 14.
5. RLS protects private data — Task 2, Task 14.
6. Private/public Storage separation exists — Task 2, Task 4, Task 14.
7. Server-worthy catalogs have Supabase-backed repositories — Tasks 3, 6.
8. Guest local-only editing remains local — Tasks 4, 6, 12, 14.
9. State 35 promotion creates server-backed project/assets/version/order — Tasks 4–5, 14.
10. State 36 uses real Order — Task 5, 14.
11. Approved versions are immutable — Task 4, 14.
12. Audit event architecture exists — Tasks 2, 4, 14.

### Orders Inbox

1. `/admin/orders` protected — Task 7, 9.
2. Admin/editor permitted reads work — Tasks 7–9.
3. Default `Cần xử lý` — Tasks 8–9.
4. Counts use real database state — Task 8.
5. Search code/name/phone — Task 8.
6. Server-side filters — Task 8.
7. Pagination — Task 8.
8. Approved thumbnails — Tasks 8–9.
9. Row tap to read-only detail — Task 10.
10. No high-risk row mutations — Tasks 9–10.
11. Anonymous private data denial — Tasks 2, 5, 7, 14.
12. Realtime/refetch freshness — Task 11.
13. Loading/empty/error states — Task 9.
14. Mobile/desktop usability — Task 9, Task 14.

### Regression

- Full old test suite, typecheck, and build — Task 14.
- Empty-VPS migration/seed/RLS verification — Task 14 after user deployment.
- Guest editor without Supabase session — Tasks 4, 6, 12, 14.
- Checkout promotion — Tasks 4–5, 14.
- Order Confirmation/State 36 — Task 5, 14.
- Admin Inbox with seeded and real Orders — Tasks 8–11, 14.

## Self-Review

- **Placeholder scan:** no `TBD`, `TODO`, mock-later, or unspecified “appropriate error handling” steps remain. VPS-dependent verification is explicitly marked as a prerequisite, not silently assumed.
- **Type consistency:** `OrderInboxRow`, `OrderListQuery`, `InboxQueryParams`, `InboxResponse`, `StaffIdentity`, `PrepareOrderInput`, and `PreparedOrderResult` are defined before downstream tasks consume them. Repository boundaries map snake_case rows to camelCase domain models.
- **Scope check:** Supabase foundation, schema/RLS, promotion retrofit, catalog adapters, staff auth, Inbox API/UI, detail handoff, realtime, local TTL, docs, and verification are independent task boundaries but share the explicit domain contracts above. Existing editor systems remain out of scope.
- **Security check:** no anon Order read, no public customer bucket, no human code authorization, no client secret, no browser-supplied role trust, and no Realtime correctness dependency.
- **Known prerequisite:** live Supabase/RLS/Storage/Auth tests cannot run until the user applies SQL to the VPS and provides runtime env. Until then, only static SQL review, fake-repository tests, existing test suite, typecheck, and build are valid evidence.
- **Known baseline warning:** current filesystem tracing warnings originate in the pre-retrofit `asset-store.ts`; Task 4 removes that runtime authority from the Supabase production path and Task 14 verifies the resulting build output.
