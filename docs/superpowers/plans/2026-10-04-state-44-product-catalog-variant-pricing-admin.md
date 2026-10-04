# State 44: Product Catalog + Variant + Pricing Admin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Product/Variant lifecycle, sellable configuration, quantity rules, volume pricing, payment policy, quote creation, and payment-purpose semantics into safe Supabase-backed Admin operations while preserving code-owned product geometry and immutable historical Orders/DesignVersions/Templates.

**Architecture:** Keep existing structural behavior in `src/lib/product-state.ts`, `src/lib/product-catalog.ts`, `src/lib/template-target.ts`, product-specific canvas/renderers, and preflight. Add a thin code registry that exposes supported definition metadata only. Supabase stores Product/Variant business configuration and immutable `CommercialConfigVersion` records; customer browse reads only sellable projections; Admin changes use revision-checked server actions/RPCs. Checkout receives a short-lived server quote, and Order creation snapshots all economics. Existing `order_payments` is extended with explicit payment purpose and canonical production readiness resolves that purpose instead of treating every confirmation as full payment.

**Tech Stack:** Next.js 16.3.6 App Router, React 19, TypeScript 7, Supabase Postgres/Auth/RLS, Tailwind CSS v4, existing Base UI/shadcn primitives, Lucide React, GSAP only where existing checkout motion remains, Node built-in test runner.

**Spec:** User-provided State 44 requirements in conversation; existing State 43 template plan and State 40 fulfillment plan are repository references.

## Grounded repository facts

- No runtime `ProductDefinition` interface/class exists. Structural behavior is split across `src/lib/product-state.ts:13-176,440-514,1182-1260,2234-2450`, `src/lib/template-target.ts:39-165,466-485`, `src/components/customizer/design-canvas.tsx`, and `src/components/customizer/document-render-surface.ts`.
- Existing static catalog is `src/lib/product-catalog.ts:7-350`; existing DB adapters are `src/lib/domain/catalog.ts:18-171` and `src/lib/repositories/catalog-repository.ts:24-235`.
- Stable Product IDs are `wrapping`, `card`, `sticker`, `notebook`; stable Variant IDs are `a1`, `a2`, `horizontal`, `vertical`, `die-cut`, `fixed-shape`, `phone`, `standard`.
- Exact Template compatibility already depends on immutable Product/Variant/mode/shape targets in `supabase/migrations/0008_state43_template_management.sql` and `0009_state43_template_catalog_cutover.sql`.
- Existing pricing is `calculatePriceQuote` in `src/lib/pricing.ts:3-49`; it reads static `PRODUCTS` and hard clamps quantity to 1–999.
- Existing Checkout is `src/app/checkout/page.tsx:1-510`; `CheckoutDraft` is `src/lib/order-types.ts:94-111` and `src/lib/checkout-draft.ts:1-72`.
- Relational Order preparation is `src/lib/services/prepare-order-from-guest-checkout.ts:1-224`; fallback is `src/lib/server-order-store.ts:1-360`.
- Existing DB schema is `supabase/migrations/0001_state37_core.sql`; State 38 uses `confirm_order_payment` in `0003_state38_order_operations.sql`; State 40 uses `start_order_production` in `0005_state40_fulfillment_operations.sql`; State 41 customer projections are in `0006_state41_account_migration.sql`.
- Existing Admin mutation convention is server actions plus `requireCurrentStaff()` and `revalidatePath()`, as used in `src/app/admin/orders/[id]/actions.ts` and `src/lib/services/admin-order-operations.ts`.
- Package commands are `pnpm test`, `pnpm typecheck`, and `pnpm build`.

## Global constraints

- Code defines geometry, surfaces, editor mode, tools, safe areas, fold/binding/sticker behavior, previews, preflight, renderer, and exact Template compatibility.
- Supabase MUST NOT accept arbitrary geometry, renderer names, cut algorithms, dimensions, safe-area implementations, or customer-defined Variants.
- Product and Variant lifecycle values are `draft`, `active`, `archived`; legacy `active` columns remain only during staged migration and are not canonical after cutover.
- Product/Variant structural identity is immutable once configured/sold; material structural change creates a new code registry entry and Variant identity.
- Published commercial versions are immutable. Customer pricing resolves through Product’s current published version pointer only.
- Money is integer VND. No floating-point pricing, negative prices, percentage deposits, installments, promotions, tax, inventory, shipping, refund, or final-balance collection workflow.
- Volume pricing uses highest applicable minimum threshold for all units; no graduated pricing.
- Quantity validity is `quantity >= minimum_quantity`, `(quantity - minimum_quantity) % quantity_step = 0`, and optional maximum bound.
- Payment policy is `full_payment` or `fixed_deposit`; fixed deposit is validated against the minimum total across every reachable quantity-tier start for every sellable Variant.
- Existing Orders snapshot economics and never reprice from current Catalog.
- Customer browse and historical resolution are separate operations.
- Only Admin can mutate Product/Variant lifecycle, commercial drafts, and publication. Editor may read where operationally useful.
- Do not weaken Supabase grants/RLS with direct client writes or browser service-role credentials.
- Do not modify tests or verification assets to make checks pass.

---

## Task 1: Formalize the code-owned structural registry

**Goal:** expose supported structural definitions to server/Admin validation without creating a second geometry system.

**Files:**
- Modify: `src/lib/product-state.ts` — retain `ProductId`, `ProductVariant`, `ProductConfig`, `PRODUCTS`; add only stable metadata hooks if needed.
- Modify: `src/lib/product-catalog.ts` — retain `CATALOG_PRODUCTS`, slug aliases, and stable IDs; remove no legacy resolver.
- Modify: `src/lib/template-target.ts` — expose existing exact target/capability resolution without changing target strings.
- Create: `src/lib/product-definition-registry.ts`.
- Modify: `src/test/product-state.test.ts`.
- Modify: `src/test/product-catalog.test.ts`.
- Create: `src/test/product-definition-registry.test.ts`.

**Produces:**
```ts
export type ProductDefinitionKey =
  | 'wrapping:a1'
  | 'wrapping:a2'
  | 'card:horizontal'
  | 'card:vertical'
  | 'sticker:die-cut'
  | 'sticker:fixed-shape'
  | 'sticker:phone'
  | 'notebook:standard';

export type ProductDefinitionCapabilities = {
  definitionKey: ProductDefinitionKey;
  productId: ProductId;
  variantId: string;
  familyLabel: string;
  physicalSummary: string;
  surfacesSummary: string;
  previewAvailable: boolean;
  productionRendererAvailable: boolean;
  templateTargetKeys: readonly string[];
};

export function resolveProductDefinition(
  productId: string,
  variantId: string,
): ProductDefinitionCapabilities | null;

export function listProductDefinitionCapabilities(): readonly ProductDefinitionCapabilities[];
```

**Implementation rules:**
- Registry entries compose existing Product state/catalog/template-target helpers; they do not duplicate geometry calculations.
- `definition_key` is a stable code value. Use actual existing terminology above; do not invent A1/A2 aliases.
- Missing key returns `null`, never a fallback definition.
- Registry output is safe serializable metadata only; no renderer/editor function is serialized or stored in Supabase.
- Keep `PRODUCTS` and `CATALOG_PRODUCTS` usable by existing editor/tests during migration.

**Tests:**
- Every current static Product/Variant maps to one registry entry.
- All 14 State 43 target keys remain discoverable.
- Unknown Product/Variant returns `null`.
- Registry exposes renderer/preview capability booleans but no implementation function.
- Existing product-specific state/preflight tests remain behaviorally unchanged.

**Verification:**
```bash
node --test --experimental-strip-types src/test/product-definition-registry.test.ts src/test/product-state.test.ts src/test/product-catalog.test.ts
```
Expected: PASS; existing IDs, slugs, geometry, and exact target keys unchanged.

**Dependency:** none.
**Commit:** `feat(catalog): formalize code-owned product definition registry`.

---

## Task 2: Add commercial domain types and pure validators

**Goal:** define and test quantity, tier, payment-policy, version, quote, and presentation rules before wiring Supabase/UI.

**Files:**
- Create: `src/lib/domain/commercial-config.ts`.
- Create: `src/lib/domain/payment-requirement.ts`.
- Modify: `src/lib/pricing.ts` — preserve `formatCurrencyVND`, replace static-only calculation after new domain tests are green.
- Modify: `src/lib/order-types.ts` — add immutable commercial/payment snapshot fields while retaining legacy fields during migration.
- Create: `src/test/commercial-config.test.ts`.
- Modify: `src/test/pricing.test.ts`.

**Contracts:**
```ts
export type CatalogStatus = 'draft' | 'active' | 'archived';
export type PaymentPolicy =
  | { kind: 'full_payment' }
  | { kind: 'fixed_deposit'; depositAmount: number };

export type VolumeTier = {
  minimumQuantity: number;
  unitPrice: number;
};

export type CommercialVariantRule = {
  variantId: string;
  minimumQuantity: number;
  quantityStep: number;
  maximumQuantity: number | null;
  tiers: readonly VolumeTier[];
};

export type CommercialConfigVersion = {
  id: string;
  productId: string;
  versionNumber: number;
  currency: 'VND';
  paymentPolicy: PaymentPolicy;
  variantRules: readonly CommercialVariantRule[];
};

export type PriceCalculation = {
  commercialConfigVersionId: string;
  productId: string;
  variantId: string;
  currency: 'VND';
  quantity: number;
  appliedTier: VolumeTier;
  unitPrice: number;
  subtotal: number;
  totalAmount: number;
  paymentPolicy: PaymentPolicy;
  amountDueNow: number;
  remainingAmount: number;
};

export function validateCommercialConfig(config: CommercialConfigVersion, activeVariantIds: readonly string[]): string[];
export function validateQuantity(rule: CommercialVariantRule, quantity: number): boolean;
export function calculatePrice(config: CommercialConfigVersion, variantId: string, quantity: number): PriceCalculation;
export function formatCurrencyVND(amount: number): string;
```

**Validation details:**
- Reject non-safe integers, min/step below 1, max below min, empty tiers, duplicate thresholds, unsorted thresholds, non-safe/negative prices, first tier not equal to minimum, unreachable tiers, unknown active Variant IDs, unsupported currency, and fixed deposits greater than the minimum total at any reachable tier start.
- Treat zero unit price as invalid for State 44.
- Calculate fixed-deposit validity at each tier threshold that is reachable by the quantity lattice, not only at minimum quantity.
- Calculator selects the highest threshold `<= quantity` and applies that unit price to every unit.
- Return explicit applied tier and all three amounts.
- Quantity errors must be actionable Vietnamese messages at the UI adapter, not raw database errors.

**Tests:**
- 10/19/20/49/50 tier boundaries.
- Step 10 rejects 11 and accepts 10/20.
- Maximum quantity and safe-integer boundaries.
- Invalid first threshold, duplicate/unsorted/unreachable tiers.
- 200,000 total + 50,000 deposit = 50,000 due now + 150,000 remaining.
- Deposit rejected when a later discounted tier makes minimum reachable total lower.
- Full payment due now equals total and remaining is zero.

**Verification:**
```bash
node --test --experimental-strip-types src/test/commercial-config.test.ts src/test/pricing.test.ts
```
Expected: PASS with no static fallback silently supplying a price for a missing configured Variant in the new domain API.

**Dependency:** Task 1.
**Commit:** `feat(pricing): add versioned commercial domain and volume pricing rules`.

---

## Task 3: Migrate Product/Variant and commercial schema

**Goal:** add lifecycle, structural identity, immutable commercial versions, drafts, quotes, and Order snapshot columns without breaking the pre-cutover schema.

**Files:**
- Create: `supabase/migrations/0010_state44_catalog_commercial.sql`.
- Create: `supabase/tests/state44_catalog_commercial.sql`.
- Modify only if generated manually by repository convention: no generated DB types currently exist.

**Migration contents:**
1. Extend `products` with `status` check (`draft|active|archived`), `revision`, and `current_commercial_config_version_id` after version table creation.
2. Extend `product_variants` with `status`, `definition_key`, and `revision`; retain legacy `price` during staged backfill.
3. Create `product_commercial_config_versions` with immutable Product/version/currency/payment-policy fields, unique `(product_id, version_number)`, and publication metadata.
4. Create `commercial_variant_rules` with quantity bounds and immutable version/Variant references.
5. Create `commercial_pricing_tiers` with strictly positive integer thresholds/prices and unique `(rule_id, minimum_quantity)`.
6. Create `product_commercial_drafts` with one open draft per Product, base version pointer, revision, author, JSON payload or normalized child draft tables following repository convention, and timestamps.
7. Create `price_quotes` with UUID/token, Product/Variant, commercial version, quantity, serialized calculation, checkout-key hash, created/expiry timestamps, and consumed Order pointer.
8. Add Order snapshot columns: `commercial_config_version_id`, `payment_policy`, `deposit_amount`, `amount_due_now`, `remaining_amount`, `applied_tier_minimum_quantity`, preserving existing `total`, `unit_price`, `subtotal`, and snapshots.
9. Extend `order_payments` with `purpose` (`checkout_deposit|full_order_payment`), retain existing status values, remove one-row-per-order uniqueness only after adding unique `(order_id,purpose)`, and preserve legacy data as `full_order_payment`.
10. Add quote/payment/order indexes.
11. Add immutable triggers rejecting updates/deletes to published commercial versions, rules, and tiers.
12. Add Product/Variant structural immutability trigger once a row has a sold/history reference; a draft row may only be corrected before sale.
13. Keep `products.active` and `product_variants.active` for migration compatibility; canonical reads switch to `status` in later tasks.

**Security:**
- Enable RLS on all new tables.
- Revoke all public/anon/authenticated writes by default.
- Public customer projection may read only active Product/Variant and current commercial data required for browse/quote.
- Admin operations use controlled RPCs; do not grant generic `update`/`delete` on commercial history.
- Editor may read operationally permitted rows, never draft commercial data unless existing operational policy explicitly requires it.
- Use explicit `search_path` and fixed role checks for security-definer functions.

**SQL tests:**
- Published versions cannot update/delete.
- Anon can read sellable projection but not drafts/history/audit.
- Nonstaff and Editor cannot mutate lifecycle/commercial tables.
- Admin can execute intended RPCs only.
- Unknown/missing `definition_key` cannot pass activation validation.
- Version numbers are unique under concurrent publication.
- Existing Product/Variant IDs remain valid.

**Verification:**
```text
Run supabase/tests/state44_catalog_commercial.sql inside a transaction against the local Supabase database.
```
Expected: all assertions pass and transaction rolls back. Migration must apply after `0009_state43_template_catalog_cutover.sql` without modifying State 43 target rows.

**Dependency:** Tasks 1–2.
**Commit:** `feat(db): add state 44 catalog and commercial version schema`.

---

## Task 4: Backfill stable catalog identities and initial commercial versions

**Goal:** migrate current static catalog/pricing without changing customer-visible behavior until explicit State 44 publication is enabled.

**Files:**
- Create: `supabase/migrations/0011_state44_catalog_backfill.sql`.
- Create: `supabase/seed_state44.sql`.
- Modify: `supabase/seed.sql` only if repository seed convention requires one canonical seed; preserve existing deterministic IDs.
- Create: `src/test/state44-catalog-backfill.test.ts` only if migration mapping needs pure TypeScript coverage; SQL remains authoritative.

**Backfill mapping:**
- Products: `wrapping`, `card`, `sticker`, `notebook`; preserve slugs and metadata.
- Variants: `a1`, `a2`, `horizontal`, `vertical`, `die-cut`, `fixed-shape`, `phone`, `standard`; set exact `definition_key` from Task 1.
- Map existing `active=true` to `status='active'` only where a valid current commercial rule exists; otherwise `draft` with explicit blocker.
- Create CommercialConfig v1 from current `product_variants.price`: minimum 1, step 1, no maximum, one tier at 1, full-payment policy unless confirmed business deposit configuration exists in repository data.
- Do not invent production deposit amounts. Development seed may include clearly synthetic fixed-deposit examples in separate fixture Products/configs.
- Set Product current version pointer only after child rows validate.
- Derive starting prices from active Variant rules; remove use of `metadata.startingPrice` in canonical customer reads after cutover.
- Keep static catalog as offline/test fallback only; it must not override a configured Supabase result.

**Legacy Orders:**
- Preserve `total`, `unit_price`, `subtotal`, `currency`, Product/Variant snapshots, payment amount, references, timestamps, and actors.
- Set legacy Orders’ `payment_policy='full_payment'`, `amount_due_now=total`, `remaining_amount=0`, `purpose='full_order_payment'` unless explicit deposit data exists.
- Never recompute legacy historical amounts from current catalog prices.

**Seed fixtures:**
- Draft Product with incomplete Variant config.
- Active full-payment Product with two commercial versions.
- Active fixed-deposit Product with validated tiers.
- Archived Product and archived Variant with historical Project/Template/Order references.
- Existing stable State 43 template target rows untouched.

**Verification:**
```text
Run migration 0011 after 0010, then query every Product/Variant mapping and compare against src/lib/product-catalog.ts.
Run the existing State 43 migration/template SQL tests.
```
Expected: stable IDs/slugs/target references match exactly; all legacy Orders remain readable; no fabricated production deposit values.

**Dependency:** Task 3.
**Commit:** `feat(db): backfill state 44 catalog identities and commercial v1`.

---

## Task 5: Implement Catalog repositories and controlled lifecycle/commercial services

**Goal:** create the server/domain boundary used by Admin and customer browse.

**Files:**
- Modify: `src/lib/domain/catalog.ts` — add lifecycle/status, definition key, commercial summary, and historical resolver models.
- Modify: `src/lib/repositories/catalog-repository.ts` — split `browseSellableProducts()` from `resolveProductById()` and `resolveVariantById()`; remove active-only fallback for historical resolution.
- Create: `src/lib/repositories/admin-catalog-repository.ts`.
- Create: `src/lib/services/admin-product-catalog.ts`.
- Create: `src/lib/services/commercial-config-service.ts`.
- Create: `src/lib/services/price-quote-service.ts`.
- Modify: `src/lib/product-catalog.ts` — preserve slug helpers, route canonical browse through sellable DB data, keep static fallback only for unconfigured test/offline mode.
- Create: `src/test/catalog-lifecycle.test.ts`.
- Create: `src/test/commercial-config-service.test.ts`.
- Create: `src/test/price-quote-service.test.ts`.

**Contracts:**
```ts
browseSellableProducts(): Promise<PublishedProduct[]>;
resolveProductById(id: string): Promise<CatalogProduct | null>;
resolveVariantById(id: string): Promise<CatalogVariant | null>;
createOrLoadCommercialDraft(productId: string, staffId: string): Promise<CommercialDraft>;
saveCommercialDraft(input: SaveCommercialDraftInput): Promise<CommercialDraft>;
publishProductCommercialConfig(input: PublishCommercialConfigInput): Promise<PublishedCommercialConfig>;
activateProduct(productId: string, expectedRevision: number): Promise<MutationResult>;
archiveProduct(productId: string, expectedRevision: number): Promise<MutationResult>;
activateVariant(variantId: string, expectedRevision: number): Promise<MutationResult>;
archiveVariant(variantId: string, expectedRevision: number): Promise<MutationResult>;
createPriceQuote(input: CreatePriceQuoteInput): Promise<PriceQuote>;
```

**Rules:**
- `browseSellableProducts()` returns only Product `active`, at least one Variant `active`, valid current commercial version, resolved definition, renderer, and valid rules.
- Historical resolvers return archived rows and code registry metadata for existing Project/Order/Template resolution.
- Activation functions call the registry and central validator, use expected revision, and return explicit blockers.
- No direct `.update({ status: ... })` from React or repository browser code.
- Publish transaction creates immutable version/children, allocates server-side version under Product row lock, updates pointer, closes draft, and appends exactly one `commercial_config_published` audit event.
- Use idempotency request IDs following State 39/43 operation patterns.
- A valid active Variant may exist under a draft Product; storefront sale requires both active Product and active Variant.
- Archiving the last active Variant of an active Product is rejected with an actionable blocker rather than silently leaving an unsellable active Product.

**Verification:**
```bash
node --test --experimental-strip-types src/test/catalog-lifecycle.test.ts src/test/commercial-config-service.test.ts src/test/price-quote-service.test.ts src/test/catalog-repository.test.ts
```
Expected: PASS; stale revisions return conflict, unknown definitions cannot activate, customer browse excludes draft/archive/unpriced records, and historical resolve still succeeds.

**Dependency:** Tasks 1–4.
**Commit:** `feat(catalog): add sellable queries and admin catalog services`.

---

## Task 6: Add Admin Product Catalog routes and UX

**Goal:** give Admin operational control without exposing geometry editing or financial mutation to Editor.

**Files:**
- Modify: `src/app/admin/layout.tsx` — add `/admin/products` navigation using existing shell.
- Create: `src/app/admin/products/page.tsx`.
- Create: `src/app/admin/products/[id]/page.tsx`.
- Create: `src/app/admin/products/actions.ts` with Admin-only server actions.
- Create: `src/components/admin/product-catalog.tsx`.
- Create: `src/components/admin/product-detail.tsx`.
- Create: `src/components/admin/commercial-config-editor.tsx`.
- Create: `src/components/admin/commercial-preview.tsx`.
- Create: `src/components/admin/product-lifecycle-dialogs.tsx`.
- Create: `src/test/admin-product-catalog.test.ts`.
- Create: `src/test/admin-commercial-editor.test.ts`.

**UI structure:**
- Product list tabs: `Đang bán`, `Bản nháp`, `Đã lưu trữ`, `Tất cả`.
- List shows Product name, active Variant count, derived starting price, payment summary, lifecycle.
- Detail tabs/sections: `Tổng quan`, `Variants`, `Giá & số lượng`, `Thanh toán`, `Hiển thị`.
- Overview edits name, description, thumbnail, sort order, lifecycle; code family/definition is read-only.
- Variants list shows name, technical definition key, physical summary, lifecycle, derived starting price.
- `Bật variant` lists only registry-supported definitions not yet configured.
- Pricing editor modifies one revision-checked Draft with minimum/step/maximum and ordered thresholds per Variant.
- Payment editor supports only full payment/fixed deposit.
- Preview uses the same `calculatePrice` function and shows tier, unit price, total, due now, remaining.
- Publish dialog copy explicitly says new Checkout quotes use the published config and existing Orders do not change.
- Archive dialog says new customer Orders are blocked and old designs/Orders remain.
- Errors use existing Vietnamese copy: `Chưa thể tải cấu hình sản phẩm.`, `Bảng giá chưa hợp lệ.`, `Chưa thể áp dụng giá mới.`, `Sản phẩm chưa đủ điều kiện để đưa vào bán.`
- Draft saved and published states are visually distinct.

**Component constraints:**
- Reuse installed components under `src/components/ui`; inspect `components.json` and existing Base UI APIs before adding anything.
- Use accessible labels, focusable controls, 44px targets, semantic status badges, and existing Admin patterns.
- No GSAP addition. Existing page motion is not a reason to animate Admin forms.
- No raw SQL/Supabase errors in UI.

**Authorization tests:**
- Admin can read/edit/publish/archive through server actions.
- Editor can view permitted catalog data but receives 403 for every commercial/lifecycle action.
- Direct RPC invocation by Editor/nonstaff fails even if browser UI is bypassed.
- Two Admin tabs receive revision conflict rather than overwriting.

**Verification:**
```bash
node --test --experimental-strip-types src/test/admin-product-catalog.test.ts src/test/admin-commercial-editor.test.ts
pnpm typecheck
```
Expected: PASS; typecheck zero errors. Manual browser verification later in Task 14 covers desktop/mobile layouts and all loading/error/empty states.

**Dependency:** Task 5.
**Commit:** `feat(admin): add product catalog lifecycle and commercial configuration UI`.

---

## Task 7: Wire server PriceQuote into Checkout and quantity UX

**Goal:** replace hardcoded quantity/pricing behavior in State 34 with current sellable rules while preserving design/customer recovery.

**Files:**
- Modify: `src/lib/order-types.ts` — add quote ID/version/expiry and payment breakdown to CheckoutDraft/PendingOrder.
- Modify: `src/lib/checkout-draft.ts` — persist quote metadata without deleting design/customer data on expiry.
- Modify: `src/app/checkout/page.tsx` — request/refresh quote at appropriate boundaries; never use client-supplied money for Order creation.
- Modify: `src/components/checkout/quantity-stepper.tsx` — consume min/step/max and display actionable invalid quantity errors.
- Modify: `src/components/checkout/order-summary-card.tsx` — show configured Product/Variant names and quote-backed price summary.
- Create: `src/app/api/quotes/route.ts`.
- Create: `src/lib/services/price-quote-service.ts` if not completed in Task 5.
- Create: `src/lib/repositories/price-quote-repository.ts` if repository separation is needed.
- Modify: `src/test/checkout-summary-e2e.test.ts`.
- Modify: `src/test/quantity-stepper.test.ts`.
- Create: `src/test/price-quote-api.test.ts`.

**Quote policy:**
- Default validity: 30 minutes, stored server-side; use exact `PRICE_QUOTE_TTL_MS = 30 * 60 * 1000` in one domain module, not scattered literals.
- Quote stores current CommercialConfig version and calculation; pointer changes do not mutate it.
- Bind quote to hashed existing checkout idempotency key plus secure guest/auth access context.
- Expiry requires explicit refresh and shows `Giá sản phẩm vừa được cập nhật.`; retain design, quantity, customer information, and preflight state.
- Product/Variant archive blocks new Order creation even if a quote has not expired.
- No remote request per plus/minus tap when current config is loaded; refresh quote on entering customer submission, after expiry, and after meaningful config/catalog refetch.

**Tests:**
- Min/step/max derive from configuration.
- Client-forged total is ignored/rejected.
- Valid v1 quote remains v1 after v2 publication until expiry.
- Expired v1 refreshes to v2 and requires continuation.
- Quantity/design/customer data survives expiry.
- Archived Product/Variant cannot produce a new quote/order.
- Deposit summary shows `Tổng đơn`, `Thanh toán trước`, `Còn lại`; full payment does not show a fake deposit row.

**Verification:**
```bash
node --test --experimental-strip-types src/test/price-quote-api.test.ts src/test/checkout-summary-e2e.test.ts src/test/quantity-stepper.test.ts src/test/checkout-draft.test.ts
```
Expected: PASS; quote totals come from commercial domain, quantity controls honor step, and old State 34 test expectations are updated only where requested behavior changes.

**Dependency:** Tasks 2 and 5.
**Commit:** `feat(checkout): consume server-backed commercial quotes and quantity rules`.

---

## Task 8: Make Order creation quote-authoritative and snapshot economics

**Goal:** ensure State 35 creates immutable Orders from a valid server Quote and never reuses mutable Catalog data afterward.

**Files:**
- Modify: `src/lib/services/prepare-order-from-guest-checkout.ts`.
- Modify: `src/lib/repositories/order-repository.ts`.
- Modify: `src/lib/server-order-store.ts` fallback behavior.
- Modify: `src/app/api/orders/route.ts` request/response contract.
- Modify: `src/lib/domain/order.ts` mapping/types.
- Modify: `src/lib/order-types.ts` PendingOrder/snapshot fields.
- Modify: `src/test/order-preparation.test.ts`.
- Modify: `src/test/order-repository.test.ts`.
- Create: `src/test/order-commercial-snapshot.test.ts`.

**Order creation contract:**
```ts
POST /api/orders
{
  idempotencyKey,
  quoteId,
  design,
  customer,
  designRevision,
  preflightRevision,
  preflightAcknowledged
}
```

**Rules:**
- Server loads Quote, verifies checkout binding, expiry, Product/Variant availability, design Product/Variant match, quantity, and preflight.
- Ignore `total`, `unitPrice`, `subtotal`, `amountDueNow`, and payment policy from browser.
- Create Order and initial payment requirement atomically with approved DesignVersion/project/assets and existing idempotency/rollback behavior.
- Snapshot Product/Variant ID/name/definition key, commercial version ID, tier threshold, quantity, unit price, subtotal/total, VND, payment policy, deposit, amount due now, remaining amount.
- Quote is marked consumed by Order; repeated idempotent submission returns same Order without a second payment requirement/audit event.
- After creation, current Catalog changes cannot alter Order output or payment amount.
- Legacy in-memory fallback accepts only domain-calculated quote-equivalent input for tests and must expose same snapshot fields.

**Verification:**
```bash
node --test --experimental-strip-types src/test/order-preparation.test.ts src/test/order-repository.test.ts src/test/order-commercial-snapshot.test.ts src/test/order-flow.test.ts
```
Expected: PASS; forged money cannot affect Order, Order created from v1 remains v1 after v2 publication, and repeated idempotency returns one Order/payment requirement.

**Dependency:** Task 7.
**Commit:** `feat(orders): snapshot quote economics at order creation`.

---

## Task 9: Retrofit QR and explicit payment-purpose semantics

**Goal:** make Deposit confirmation distinct from full payment while preserving existing payment reference and guest reporting flows.

**Files:**
- Create: `supabase/migrations/0012_state44_payment_purposes.sql`.
- Create: `supabase/tests/state44_payment_purposes.sql`.
- Modify: `src/lib/order-types.ts` — add `PaymentPurpose`, payment presentation, and `deposit_confirmed` compatibility status where needed.
- Modify: `src/lib/repositories/payment-repository.ts` — purpose-aware records; no generic “confirm any payment for Order” API.
- Modify: `src/lib/services/admin-order-operations.ts` — confirm specific payment requirement ID/purpose.
- Modify: `src/lib/services/prepare-order-from-guest-checkout.ts` — create `checkout_deposit` or `full_order_payment` based on immutable Order snapshot.
- Modify: `src/app/api/orders/[id]/payment/report/route.ts` — report only the expected checkout requirement.
- Modify: `src/app/api/orders/[id]/payment/route.ts` — return snapshot due-now amount and purpose.
- Modify: `src/lib/payment-qr-provider.ts` — encode `amountDueNow`, retain server payment reference.
- Modify: `src/components/checkout/payment-qr-panel.tsx`.
- Modify: `src/components/checkout/order-confirmation-panel.tsx`.
- Modify: `src/test/payment-flow.test.ts`.
- Modify: `src/test/state-36-lifecycle.test.ts`.
- Create: `src/test/payment-purpose.test.ts`.

**Canonical model:**
```ts
type PaymentPurpose = 'checkout_deposit' | 'full_order_payment';
type PaymentRequirementStatus = 'pending_payment' | 'payment_reported' | 'paid' | 'payment_failed' | 'cancelled';
```

Use `purpose` as canonical meaning; `paid` means that specific requirement is confirmed, not that the entire deposit Order is fully settled.

**Migration rules:**
- Existing `order_payments` rows become `full_order_payment`.
- Add unique `(order_id,purpose)` and retain one current checkout requirement per purpose.
- Keep `orders.payment_status` as a compatibility projection during cutover; deposit confirmation sets a non-`paid` projection such as `deposit_confirmed`, and all new readiness/presentation logic stops treating generic `paid` as canonical.
- Existing full-payment Orders remain `paid` when confirmed.
- Do not rewrite historical amount/reference/timestamp/actor values.
- Confirm RPC locks Order and specific payment row, validates Admin and expected state, transitions once, and appends exactly one event with purpose and expected amount.
- Keep security-definer function hardening (`search_path=''`, explicit grants, fixed role checks).

**Copy:**
- Deposit QR: `Quét mã để thanh toán tiền cọc`, `Tiền cọc: X`, `Tổng đơn: Y`, `Còn lại: Z`.
- Full payment: `Quét mã để thanh toán`, total amount.
- Customer confirmation must not say full payment after deposit report.

**Verification:**
```bash
node --test --experimental-strip-types src/test/payment-purpose.test.ts src/test/payment-flow.test.ts src/test/state-36-lifecycle.test.ts
```
```text
Run supabase/tests/state44_payment_purposes.sql in a rollback transaction.
```
Expected: deposit QR amount is due-now; full QR amount is total; duplicate/wrong-purpose confirmation has no side effect; audit payload includes purpose/amount.

**Dependency:** Tasks 3, 8.
**Commit:** `feat(payment): distinguish deposit and full-payment requirements`.

---

## Task 10: Centralize payment presentation and retrofit Inbox, confirmation, readiness, and My Orders

**Goal:** remove every consumer-visible and authoritative dependency on generic `payment_status === 'paid'` for deposit Orders.

**Files:**
- Create: `src/lib/domain/payment-presentation.ts`.
- Modify: `src/lib/domain/order.ts:121-170,460-618` — call shared production/payment functions and map snapshots.
- Modify: `src/lib/services/admin-fulfillment-operations.ts`.
- Modify: `src/lib/admin/order-next-action.ts`.
- Modify: `src/lib/repositories/order-repository.ts:156-294,370-450`.
- Modify: `src/app/admin/orders/[id]/actions.ts`.
- Modify: `src/components/admin/order-payment-card.tsx`.
- Modify: `src/components/admin/order-status-chip.tsx`.
- Modify: `src/components/admin/order-row.tsx`.
- Modify: `src/components/admin/order-filters.tsx` and `src/lib/admin/inbox-query.ts` where filter labels/status values need purpose-aware display.
- Modify: `src/app/admin/orders/[id]/design/page.tsx` and `src/components/admin/design-review.tsx` only where payment summary is passed/displayed.
- Modify: `src/app/my-orders/page.tsx` and `src/components/customer/customer-order-card.tsx`/`customer-order-detail-view.tsx`.
- Modify: `supabase/migrations/0013_state44_payment_readiness_cutover.sql`.
- Create: `supabase/tests/state44_payment_readiness.sql`.
- Modify: `src/test/order-next-action.test.ts`.
- Modify: `src/test/orders-inbox.test.ts`.
- Modify: `src/test/admin-order-detail.test.ts`.
- Modify: `src/test/admin-fulfillment-operations.test.ts`.
- Modify: `src/test/customer-safe-orders.test.ts`.
- Create: `src/test/payment-readiness.test.ts`.

**Contracts:**
```ts
export type PaymentPresentation = {
  policyLabel: string;
  statusLabel: string;
  isFullyPaid: boolean;
  isCheckoutPaymentConfirmed: boolean;
  amountDueNow: number;
  remainingAmount: number;
};

export function resolvePaymentPresentation(order: OrderWithPaymentSnapshot): PaymentPresentation;
export function isPaymentSatisfiedForProduction(order: OrderWithPaymentSnapshot): boolean;
```

**Production rules:**
- Deposit Product: confirmed `checkout_deposit` requirement satisfies production payment; `remaining_amount` does not block under State 44 approved flow.
- Full Product: confirmed `full_order_payment` requirement required.
- Both paths retain design approval, production version, hold, active-draft, and fulfillment checks.
- Update both TypeScript readiness assertions and authoritative `start_order_production` RPC; UI-only changes are insufficient.
- Deposit copy: `Tiền cọc chưa được xác nhận` when blocked; confirmed label is `Đã xác nhận cọc`.
- Full copy: `Thanh toán chưa được xác nhận`; confirmed label is `Đã thanh toán`.
- Order Inbox production view uses the shared satisfaction condition, not direct status equality.
- State 41 SQL customer projections include payment-purpose-aware status/summary and never claim full payment for deposit-only confirmation.

**Verification:**
```bash
node --test --experimental-strip-types src/test/payment-readiness.test.ts src/test/order-next-action.test.ts src/test/orders-inbox.test.ts src/test/admin-order-detail.test.ts src/test/admin-fulfillment-operations.test.ts src/test/customer-safe-orders.test.ts
```
```text
Run supabase/tests/state44_payment_readiness.sql in a rollback transaction.
```
Expected: deposit confirmed + approved design enables production; deposit pending blocks; full payment still requires full requirement; Inbox/My Orders/detail never display full-paid wording for deposit.

**Dependency:** Task 9.
**Commit:** `feat(fulfillment): derive readiness from payment purpose and policy`.

---

## Task 11: Integrate Product/Variant availability with Templates, Projects, and historical resolution

**Goal:** archive new-use availability without breaking exact Template targets or historical editor/production loading.

**Files:**
- Modify: `src/lib/repositories/template-repository.ts` — use Product/Variant availability resolver for new-use browse and availability blockers.
- Modify: `src/lib/services/template-clone.ts` — reject new clone/use when Product/Variant unavailable; keep historical target resolution unchanged.
- Modify: `src/lib/template-target.ts` only for explicit unavailable reason mapping, never target geometry changes.
- Modify: `src/lib/repositories/project-repository.ts` — historical Product/Variant resolve ignores active status but still validates code registry key.
- Modify: `src/components/customizer/template-browser.tsx` and `src/components/customizer/template-chooser.tsx` where unavailable templates are excluded from customer browse.
- Modify: `src/components/admin/template-library.tsx` to show `Cần cập nhật`/unavailable reason.
- Modify: `src/app/products/page.tsx`, `src/app/products/[slug]/page.tsx`, `src/components/products/products-catalog-view.tsx`, `src/components/products/product-detail-catalog-view.tsx`, and `src/lib/product-catalog.ts` to consume sellable browse data while preserving canonical slugs.
- Create/modify: `src/test/catalog-archive-template-availability.test.ts`.
- Modify: `src/test/template-catalog.test.ts`, `template-guest-clone.test.ts`, `template-production.test.ts`, `product-catalog.test.ts`.

**Rules:**
- Customer listing returns only active Product + active sellable Variant + valid current commercial config.
- Archived Product/Variant does not appear in new selection, Variant toggle, or Template Browser.
- Existing Project opens read-only/according to existing safe rules using code registry and historical snapshot.
- Existing TemplateVersion and Order never mutate or auto-convert.
- Existing Order for archived Product/Variant continues artifact retrieval and production completion.
- Template availability blocker is `VARIANT_UNAVAILABLE`; Product archive blocks all new Template use without archiving Template rows.
- Missing code definition blocks new use but does not delete historical data.

**Verification:**
```bash
node --test --experimental-strip-types src/test/catalog-archive-template-availability.test.ts src/test/template-catalog.test.ts src/test/template-guest-clone.test.ts src/test/template-production.test.ts src/test/product-catalog.test.ts
```
Expected: archived rows absent from browse, historical target/project/order resolution still succeeds, and exact State 43 geometry keys remain unchanged.

**Dependency:** Tasks 1, 5, 8.
**Commit:** `feat(catalog): preserve historical targets while gating archived product use`.

---

## Task 12: Add comprehensive State 44 automated coverage and concurrency checks

**Goal:** cover every acceptance criterion with deterministic tests that catch consumer-visible failures and authorization bypasses.

**Files:**
- Create: `src/test/state44-lifecycle.test.ts`.
- Create: `src/test/state44-commercial-version.test.ts`.
- Create: `src/test/state44-concurrency.test.ts`.
- Create: `src/test/state44-rbac.test.ts`.
- Create: `src/test/state44-regression.test.ts`.
- Modify: relevant existing State 34–43 test files only to assert changed contracts, never to weaken unrelated assertions.
- Create/update: `supabase/tests/state44_catalog_commercial.sql`, `state44_payment_purposes.sql`, `state44_payment_readiness.sql` from Tasks 3/9/10.

**Required cases:**
- Draft hidden, active visible, archived hidden, historical resolution intact.
- Active/archived Variant selection and archived checkout rejection.
- Unknown definition and arbitrary geometry rejection.
- Structural identity immutability after sale.
- Publish v1, create Order, publish v2; v1 and Order unchanged, new Quote uses v2.
- Tier boundaries and quantity step.
- Fixed deposit/full payment amounts and invalid deposit publication rejection.
- Client total manipulation rejection.
- Quote expiry refresh preserving design/customer data.
- QR amount due-now.
- Payment confirmation purpose, exact once, audit metadata.
- Deposit production eligibility and full-payment blocking.
- Template availability/archive and historical production.
- Editor/Admin permission matrix at service and SQL RPC layers.
- RLS/grant denial for anon, nonstaff, Editor writes; Admin success.
- Concurrent publication: no duplicate version, no lost pointer, stale draft conflict.
- Existing State 01–43 regression commands remain green.

**Verification:**
```bash
node --test --experimental-strip-types src/test/state44-lifecycle.test.ts src/test/state44-commercial-version.test.ts src/test/state44-concurrency.test.ts src/test/state44-rbac.test.ts src/test/state44-regression.test.ts
pnpm test
```
Expected: focused tests and complete Node suite pass without changing fixtures solely for assertions.

**Dependency:** Tasks 1–11.
**Commit:** `test(state44): cover catalog commercial payment and archive invariants`.

---

## Task 13: Development seed, migration runbook, and technical documentation

**Goal:** make QA and future operations reproducible.

**Files:**
- Modify/create: `supabase/seed_state44.sql`.
- Create: `docs/superpowers/state44-product-catalog-pricing-runbook.md`.
- Modify: `README.md` with State 44 local setup/check commands only.
- Create or modify the existing technical architecture doc identified during implementation if one exists; otherwise use the runbook as the canonical State 44 document.

**Document explicitly:**
- Registry vs Catalog responsibility.
- Stable Product/Variant IDs and structural immutability.
- Draft/active/archive lifecycle and browse vs historical resolve.
- Commercial version publication and revision conflicts.
- Integer VND, quantity lattice, volume tiers, starting-price derivation.
- Full payment/fixed deposit, Quote TTL, Order snapshot, payment purpose.
- Deposit production rule and remaining balance deferred scope.
- Template availability and archive behavior.
- RLS/grants/RPC security model.
- Backfill/legacy Order semantics and rollback/cutover ordering.
- Troubleshooting for invalid definition, invalid price, stale draft, expired Quote, archived Variant, and denied role.

**Seed requirements:**
- Draft, active, archived Products; active/archived Variants.
- Full-payment and validated synthetic deposit examples.
- Two commercial versions and an Order fixed to v1.
- Historical Project/Template/Order tied to archived identity.
- No fake production money in canonical production seed.

**Verification:**
```text
Reset local Supabase, apply all migrations, seed, run all State 37–44 SQL verification files.
```
Expected: deterministic seed, stable IDs, no migration precheck failures, and reproducible Admin/customer QA fixtures.

**Dependency:** Tasks 3–12.
**Commit:** `docs(state44): add catalog pricing payment runbook and QA seed`.

---

## Task 14: Final typecheck, build, browser smoke, security smoke, and release gate

**Goal:** prove the complete changed surface in the actual app and database before State 44 is considered complete.

**Files:**
- No implementation files should change in this task unless a verification failure identifies a real defect; fix the defect in its owning task and rerun that task’s focused check.
- Create no throwaway verification assets committed to the repository.

**Commands:**
```bash
pnpm typecheck
pnpm test
pnpm build
```
Expected: zero TypeScript errors, all Node tests pass, production build exits 0.

**Database checks:**
```text
Run migrations from 0001 through 0013 on a clean local Supabase instance.
Run supabase/tests/state37_rls.sql.
Run supabase/tests/state38_order_operations.sql.
Run supabase/tests/state40_fulfillment_operations.sql.
Run supabase/tests/state41_account_migration.sql.
Run supabase/tests/state42_asset_library.sql.
Run supabase/tests/state43_template_management.sql.
Run supabase/tests/state44_catalog_commercial.sql.
Run supabase/tests/state44_payment_purposes.sql.
Run supabase/tests/state44_payment_readiness.sql.
```
Expected: every SQL test passes inside its rollback transaction; direct unauthorized table/RPC writes are denied.

**Browser smoke:**
1. Admin opens `/admin/products`, enables supported Variant, configures min/step/tier/deposit, sees preview, saves Draft, publishes, activates Product.
2. Editor sees read-only catalog and receives 403 for direct lifecycle/commercial mutation.
3. Customer browse shows only sellable Product/Variant and derived starting price.
4. Customer creates v1 quote, Admin publishes v2, existing valid v1 quote remains stable; expired quote refreshes with message and preserves design/customer data.
5. Deposit checkout displays total/due-now/remaining; QR encodes due-now; report and Admin confirmation show cọc, not full paid; production readiness passes after design approval.
6. Full-payment checkout displays total and requires full payment confirmation.
7. Archive Variant: new selection/Template use/Checkout blocked; existing Project/Order/production remains usable.
8. Archive Product: storefront hidden; historical account Order and production remain usable.
9. Mobile Admin/customer screens have no horizontal overflow, controls remain keyboard/touch accessible, loading/error states render existing Vietnamese copy.

**Visual verification:**
- Run the Impeccable detector once against changed Admin/customer UI targets:
```bash
C:\Users\minhmice\Documents\projects\quynhtrang\.claude\skills\impeccable\scripts\impeccable.cmd detect --json <changed UI targets>
```
- Review findings; fix actual UI defects in owning tasks. Do not alter detector or verification assets to suppress findings.
- Existing Checkout GSAP transitions must retain reduced-motion handling; do not add decorative Admin animation.

**Release gate:**
- Product structural behavior remains code-controlled.
- Catalog lifecycle, Variant gating, commercial versions, quantity/tier rules, Quote, Order snapshot, payment purposes, QR, readiness, Templates, historical resources, RBAC/RLS/grants, audit, migration, seeds, docs, tests, typecheck, and build all pass.
- No State 44 item is silently narrowed or deferred except explicitly listed exclusions.

**Dependency:** Tasks 1–13.
**Commit:** `verify(state44): complete catalog pricing payment and historical compatibility gate`.

---

## Explicitly deferred

Arbitrary Product geometry CMS, customer-defined Variants, inventory/warehouse, shipping prices/carriers/tracking, promotions/coupons/scheduled sales/segment pricing, cost/margin accounting, tax engine, percentage deposits, installments, final-balance payment UI, refund workflow, dynamic printer/material pricing, automatic Product conversion, Variant geometry conversion, Product duplication, realtime catalog subscriptions, and analytics dashboards.

## Definition of Done mapping

1. Tasks 1–2 preserve code-owned structure and registry validation.
2. Tasks 3–6 implement Supabase lifecycle, supported Variants, Admin controls, and activation gates.
3. Tasks 2–5 implement immutable commercial versions, integer VND, quantity rules, volume tiers, and payment policy.
4. Tasks 7–8 implement server-backed Quote and immutable Order snapshot.
5. Tasks 9–10 retrofit QR, payment confirmation, Inbox, My Orders, and production readiness.
6. Task 11 preserves archived Product/Variant historical Project/Template/Order/production resolution.
7. Tasks 3, 9, 10, and 12 implement RLS, grants, audit, concurrency, and legacy compatibility.
8. Tasks 12–14 prove focused behavior, State 01–43 regression, seed/migration safety, typecheck, build, and manual customer/Admin flows.
