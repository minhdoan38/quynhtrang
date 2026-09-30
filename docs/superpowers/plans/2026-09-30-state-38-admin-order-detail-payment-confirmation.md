# State 38: Admin Order Detail + Payment Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a protected `/admin/orders/[orderId]` command center that shows authoritative Order truth, resolves one deterministic next action, lets Admin confirm manual payment and place/release operational holds through atomic audited Supabase operations, and keeps Editor read access non-financial.

**Architecture:** Build on State 37's Supabase schema, staff authorization, repositories, immutable DesignVersions, private approved thumbnails, Admin Inbox, `order_events`, and Realtime/refetch infrastructure. Extend those boundaries rather than adding browser-side Supabase writes: one optimized server detail query supplies the page, domain resolver derives the next action, server actions call tightly locked `SECURITY DEFINER` Postgres functions that authorize `auth.uid()`, lock rows, and atomically update current state plus append one event, then UI refetches authoritative data. Keep `order_payments.status` canonical and update denormalized `orders.payment_status` only inside the same payment transaction.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, existing shadcn/ui Base Nova primitives, Supabase Postgres/Auth/RLS/Realtime/Storage from State 37, Node test runner, tracked SQL migrations/tests. GSAP remains installed, but this Operate surface uses normal shadcn/Tailwind state transitions; no page-load choreography or runtime animation dependency is justified.

**Spec:** State 38 requirements supplied in the user request. Prerequisite architecture: `docs/superpowers/plans/2026-09-30-state-37-supabase-admin-inbox.md`.

## Global Constraints

- **Execution gate:** State 37 is partially implemented in the current working tree and must be completed, reviewed, deployed, and verified before State 38 execution. Reuse its migrations and Supabase clients; do not rebuild those foundations or substitute an in-memory State 38 path.
- Preserve State 37 contracts and names: `StaffRole = 'admin' | 'editor'`; `PaymentStatus`; `DesignStatus = 'awaiting_review' | 'ready' | 'editing' | 'approved' | 'needs_changes'`; `FulfillmentStatus = 'unprocessed' | 'ready_for_production' | 'in_production' | 'completed' | 'cancelled'`.
- Keep payment, design, fulfillment, and hold as separate dimensions. Never add one generic Order status or `on_hold` lifecycle value.
- `payment_reported` is a customer claim, never proof of payment. Only Admin may transition `pending_payment` or `payment_reported` to `paid` in State 38.
- Payment confirmation, hold, and release hold are server-authorized domain actions. Never call `.from(...).update(...)` from a Client Component.
- Use the authenticated request-scoped Supabase client to invoke RPCs so `auth.uid()` reflects the staff session. The narrowly scoped `SECURITY DEFINER` functions bypass table-write denial only after their own role, Order access, expected-state, and business-rule checks; never use the service client for staff mutations.
- Actor identity and timestamps come from `auth.uid()` and Postgres time. Never accept `confirmedBy`, `heldBy`, `releasedBy`, or browser timestamps.
- `order_events` stays append-only. Current-state tables answer “what is true now”; events answer “what happened.”
- Customer artwork and approved thumbnails remain private. Detail uses approved `DesignVersion`, never mutable Project state or permanent public URLs.
- Initial detail query omits full `design_document`; fetch it only in the read-only design inspection route.
- Realtime is a freshness hint. Initial query, mutation refetch, reconnect, tab focus, and explicit retry remain correctness paths.
- Vietnamese operational copy stays concise. Do not log phone, address, raw customer data, payment payloads, or signed asset URLs.
- State 38 does not implement design editing/revisions, production transitions, cancellation, shipping, refunds, partial payments, reversal, webhook confirmation, bulk actions, or customer messaging.

## Baseline Evidence and Dependency Gate

Current repository audit on 2026-09-30:

- HEAD is `47e8982` (`docs: plan State 37 Supabase backend and admin inbox`); uncommitted State 37 work appeared during this planning pass and remains user-owned.
- `package.json` now includes `@supabase/ssr` and `@supabase/supabase-js`; `src/lib/supabase/{browser,server,admin,config}.ts` and `supabase/config.toml` exist.
- `supabase/migrations/0001_state37_core.sql` now defines `staff_roles`, Projects, Assets, immutable `design_versions`, Orders, `order_payments`, `order_events`, guest access, independent payment/design/fulfillment checks, indexes, grants, and RLS. `0002_state37_storage.sql` defines private `approved-renders` Storage, but `design_versions` currently has no approved-render path column; Task 2 adds `approved_thumbnail_path`.
- Current State 37 schema has no `staff_roles.display_name`; State 38 adds it for readable audit actors.
- Current State 37 grants broad authenticated insert/update/delete privileges, then limits writes through RLS; Admin can directly update Orders/payments and staff can directly insert events. `supabase/tests/state37_rls.sql` currently expects direct Admin Order update. State 38 must revoke those direct paths and update the regression assertion to require RPC-only mutation.
- Admin routes, repositories, authorization, Inbox, and Realtime are not present yet. `supabase/seed.sql` and `supabase/tests/state37_rls.sql` now exist, but State 37 remains incomplete.
- Current customer runtime still uses `src/lib/server-order-store.ts`; `src/lib/order-types.ts` has `pending_payment`, `payment_reported`, and `paid`, but no independent design/fulfillment/hold detail model. Current customer payment report mutates memory; no staff confirmation mutation exists.
- Existing UI primitives include `Button`, `Card`, `Dialog`, `Badge`, `Separator`, `Skeleton`, `Input`, `Textarea`, `Drawer`, and `ToggleGroup`; AlertDialog, DropdownMenu, and Collapsible are not present in the current baseline.
- `components.json` uses shadcn Base Nova, RSC, CSS variables, Lucide icons, and aliases under `src/components/ui`.
- Existing design rules define Admin as an **Operate** surface: Be Vietnam Pro for operational UI, warm paper/ink/primary-blue tokens, restrained status color, 44px actions, stable skeletons, and no decorative dashboard treatment.

Before Task 1, verify State 37 produced these paths/contracts:

```text
supabase/migrations/0001_state37_core.sql
supabase/migrations/0002_state37_storage.sql
supabase/tests/state37_rls.sql
src/lib/domain/order.ts
src/lib/admin/authorization.ts
src/lib/admin/realtime.ts
src/lib/repositories/order-repository.ts
src/lib/repositories/payment-repository.ts
src/lib/repositories/order-event-repository.ts
src/lib/repositories/design-version-repository.ts
src/app/admin/orders/page.tsx
src/app/admin/orders/[id]/page.tsx
src/app/api/admin/orders/[id]/route.ts
```

Run before starting State 38:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: State 37 tests, typecheck, build, deployed migration checks, staff login, Inbox, and read-only detail handoff pass. If any required State 37 artifact is absent, stop and execute `docs/superpowers/plans/2026-09-30-state-37-supabase-admin-inbox.md`; do not substitute an in-memory State 38 implementation.

## File Map

### Domain and query contracts

- Modify: `src/lib/domain/order.ts` — detail, hold, event, mutation-result, and next-action models.
- Create: `src/lib/admin/order-next-action.ts` — pure deterministic resolver only.
- Modify: `src/lib/repositories/order-repository.ts` — optimized `getOrderDetail` query and row mapper.
- Modify: `src/lib/repositories/order-event-repository.ts` — cursor-paginated timeline query.
- Modify: `src/lib/repositories/design-version-repository.ts` — approved-version summary and separate full-document inspection read.
- Modify: `src/lib/admin/thumbnail-delivery.ts` — add one authorized approved-thumbnail URL/proxy mapper for Order Detail.

### Database and authorization

- Create: `supabase/migrations/0003_state38_order_operations.sql` — approved thumbnail path, staff display names, `order_holds`, indexes, narrowed grants/RLS, and atomic payment/hold/release functions.
- Create: `supabase/tests/state38_order_operations.sql` — real role/RLS/RPC/concurrency assertions.
- Modify: `supabase/tests/state37_rls.sql` — replace direct Admin Order update success with direct-write denial while preserving read/catalog/Storage regressions.
- Modify: `supabase/seed.sql` — deterministic State 38 scenarios.
- Modify: `src/lib/admin/authorization.ts` — add request-context `requireCurrentStaff(role?)` by reusing State 37's verified-claims/staff-role lookup; migrate admin Server Action callers to it without adding a second role model.

### Server mutations and routes

- Create: `src/lib/services/admin-order-operations.ts` — typed calls to atomic Postgres functions and safe error mapping.
- Create: `src/app/admin/orders/[id]/actions.ts` — thin authenticated Server Actions.
- Modify: `src/app/api/admin/orders/[id]/route.ts` — authoritative detail refetch response.
- Create: `src/app/api/admin/orders/[id]/events/route.ts` — authorized event pagination.
- Create: `src/app/admin/orders/[id]/design/page.tsx` — read-only approved DesignVersion inspection; full design JSON loads only here.

### Order Detail UI

- Modify: `src/app/admin/orders/[id]/page.tsx` — protected Server Component initial query, not-found behavior, and Inbox return state.
- Create: `src/app/admin/orders/[id]/loading.tsx` — stable detail skeleton.
- Create: `src/app/admin/orders/[id]/error.tsx` — recoverable route error without raw Supabase detail.
- Create: `src/app/admin/orders/[id]/order-detail-client.tsx` — local mutation/dialog/realtime/refetch coordinator.
- Replace or modify: `src/components/admin/order-detail-readonly.tsx` from State 37 — become composition shell, or delete after all callers move to `order-detail.tsx`; no compatibility duplicate.
- Create: `src/components/admin/order-detail.tsx` — responsive page composition.
- Create: `src/components/admin/order-next-action-card.tsx` — one resolved action.
- Create: `src/components/admin/order-payment-card.tsx` — status, amount, reference, report/confirmation metadata, Admin dialog trigger.
- Create: `src/components/admin/order-hold-banner.tsx` — active hold truth and Admin release action.
- Create: `src/components/admin/order-more-menu.tsx` — hold action only; no fake cancellation.
- Create: `src/components/admin/order-design-card.tsx` — approved thumbnail, review state, Preflight summary/detail, read-only inspection link.
- Create: `src/components/admin/order-summary-sections.tsx` — product snapshot, fulfillment, customer, delivery, safe copy actions.
- Create: `src/components/admin/order-activity-timeline.tsx` — newest-first event history and `Xem thêm`.
- Add only if absent after State 37: `src/components/ui/alert-dialog.tsx`, `dropdown-menu.tsx`, `collapsible.tsx` via official shadcn registry.
- Reuse: `src/components/admin/order-status-chip.tsx` — one centralized status presentation mapping shared with Inbox.

### Tests and docs

- Create: `src/test/order-next-action.test.ts`.
- Create: `src/test/order-detail-repository.test.ts`.
- Create: `src/test/admin-order-operations.test.ts`.
- Create: `src/test/admin-order-detail.test.ts`.
- Create: `src/test/order-activity-timeline.test.ts`.
- Create: `src/test/admin-order-detail-realtime.test.ts`.
- Modify: `src/test/orders-inbox.test.ts` — row navigation/return state and mutation-driven Inbox refresh regression.
- Modify: `README.md` — State 38 migration, permission, seed, and verification commands.
- Create: `docs/superpowers/state38-order-detail-runbook.md` — operational and concurrency troubleshooting.

---

### Task 1: Add Order Detail domain models and deterministic Next Action resolver

**Goal:** Establish one typed source for detail data and one pure priority resolver before any UI or mutation work.

**Dependencies:** Verified State 37 `src/lib/domain/order.ts` enums and `StaffRole`.

**Files:**
- Modify: `src/lib/domain/order.ts`
- Create: `src/lib/admin/order-next-action.ts`
- Create: `src/test/order-next-action.test.ts`

**Interfaces:**

```ts
export interface ActiveOrderHold {
  id: string;
  reason: string;
  heldAt: string;
  heldBy: { userId: string; displayName: string; role: StaffRole };
}

export interface OrderOperationalState {
  paymentStatus: PaymentStatus;
  designStatus: DesignStatus;
  fulfillmentStatus: FulfillmentStatus;
  activeHold: ActiveOrderHold | null;
}

export type OrderNextActionKind =
  | 'release_hold'
  | 'verify_payment'
  | 'wait_for_payment'
  | 'review_design'
  | 'resolve_design_changes'
  | 'ready_for_production'
  | 'production_in_progress'
  | 'none';

export interface OrderNextAction {
  kind: OrderNextActionKind;
  eyebrow: 'CẦN XỬ LÝ' | 'ĐANG CHỜ' | 'SẴN SÀNG' | 'TRẠNG THÁI';
  title: string;
  description: string;
  intent: 'attention' | 'waiting' | 'ready' | 'neutral';
  cta: null | {
    label: string;
    type: 'confirm_payment' | 'release_hold' | 'navigate';
    href?: string;
  };
}

export function resolveOrderNextAction(state: OrderOperationalState): OrderNextAction;
```

Priority is exact and table-driven:

1. Active hold → `release_hold`, regardless of other states.
2. `cancelled` → `none` (`Đơn đã hủy`).
3. `completed` → `none` (`Đơn đã hoàn tất`).
4. `payment_reported` → `verify_payment` (`Khách báo đã chuyển khoản`).
5. `pending_payment` → `wait_for_payment` (`Đang chờ khách thanh toán`).
6. `paid` + `in_production` → `production_in_progress`.
7. `paid` + design `awaiting_review` or `ready` → `review_design`.
8. `paid` + design `needs_changes` or `editing` → `resolve_design_changes`.
9. `paid` + design `approved` + fulfillment `unprocessed` or `ready_for_production` → `ready_for_production`.
10. Any invalid/unrecognized combination → neutral `none` titled `Kiểm tra trạng thái đơn`; do not invent a mutation.

- [ ] **Step 1: Write table-driven resolver tests.**

```ts
const cases: Array<[string, OrderOperationalState, OrderNextActionKind]> = [
  ['hold overrides payment report', state({ activeHold: hold, paymentStatus: 'payment_reported' }), 'release_hold'],
  ['reported payment precedes design review', state({ paymentStatus: 'payment_reported', designStatus: 'awaiting_review' }), 'verify_payment'],
  ['pending payment waits', state({ paymentStatus: 'pending_payment' }), 'wait_for_payment'],
  ['paid awaiting review opens design', state({ paymentStatus: 'paid', designStatus: 'awaiting_review' }), 'review_design'],
  ['paid approved is production ready', state({ paymentStatus: 'paid', designStatus: 'approved', fulfillmentStatus: 'ready_for_production' }), 'ready_for_production'],
  ['completed has no action', state({ fulfillmentStatus: 'completed' }), 'none'],
];
```

Also assert repeat calls with identical input deep-equal, resolver does not mutate input, and component order is irrelevant.

- [ ] **Step 2: Run the focused test and observe failure.**

Run: `node --test --experimental-strip-types src/test/order-next-action.test.ts`

Expected: FAIL because `order-next-action.ts` and detail contracts do not exist.

- [ ] **Step 3: Implement the model and resolver as a pure exhaustive switch/ordered guard list.**

No React, Supabase, dates, random values, or locale-dependent logic may enter the resolver. Use `assertNever` or an explicit neutral fallback for future enum values.

- [ ] **Step 4: Run focused test and typecheck.**

Run: `node --test --experimental-strip-types src/test/order-next-action.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/domain/order.ts src/lib/admin/order-next-action.ts src/test/order-next-action.test.ts
git commit -m "feat(admin): add deterministic order next action resolver"
```

---

### Task 2: Add State 38 schema, Hold history, and atomic payment/hold functions

**Goal:** Add the smallest schema extension needed for current hold truth and atomic audited high-impact operations.

**Dependencies:** Task 1 domain names; deployed State 37 migration and enums/check constraints.

**Files:**
- Create: `supabase/migrations/0003_state38_order_operations.sql`
- Create: `supabase/tests/state38_order_operations.sql`
- Modify: `supabase/tests/state37_rls.sql`

**Approved thumbnail schema:**

```sql
alter table public.design_versions
  add column approved_thumbnail_path text null;
```

The value is an identity path inside private `approved-renders`, never a signed URL. It belongs to the immutable version row. State 37 creation stores the stable path after rendering/upload; Admin Detail signs/proxies it only after staff authorization.

**Canonical state decision:** `order_payments.status` is payment source of truth because confirmation metadata belongs to that row. `orders.payment_status` remains a denormalized Inbox/search projection and MUST be updated by the same locked Postgres function. No application code may update either field independently.

**Hold schema:**

```sql
create table public.order_holds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  held_by uuid not null references auth.users(id),
  held_at timestamptz not null default now(),
  released_by uuid null references auth.users(id),
  released_at timestamptz null,
  check ((released_by is null) = (released_at is null))
);

create unique index order_holds_one_active_per_order
  on public.order_holds(order_id)
  where released_at is null;

create index order_holds_order_history
  on public.order_holds(order_id, held_at desc);
```

State 37's planned `staff_roles` contract has no display name. Add `display_name text not null default 'Nhân viên'`, update staff bootstrap docs/seed, and map event actors through this field. Do not expose raw staff UUID as UI identity.

**Postgres function contracts:**

```sql
public.confirm_order_payment(p_order_id uuid, p_expected_state text) returns jsonb
public.hold_order(p_order_id uuid, p_reason text) returns jsonb
public.release_order_hold(p_order_id uuid, p_expected_hold_id uuid) returns jsonb
```

Use `SECURITY DEFINER` for all three because the application must deny direct table writes—even to Admin—while permitting only these audited transition functions. `SECURITY INVOKER` would require granting the `authenticated` database role direct update/insert privileges that PostgREST could also exercise outside the domain action. Lock each definer function down explicitly:

```sql
alter function public.confirm_order_payment(uuid, text) set search_path = '';
revoke all on function public.confirm_order_payment(uuid, text) from public, anon;
grant execute on function public.confirm_order_payment(uuid, text) to authenticated;
```

Repeat for hold/release; fully qualify every object; own functions with the trusted migration owner; grant no direct `insert/update/delete` on `orders`, `order_payments`, `order_holds`, or `order_events` to `anon`/`authenticated`. Supabase maps both Admin and Editor to database role `authenticated`, so execute grants cannot distinguish application roles. Each function MUST read `auth.uid()`, query `public.staff_roles`, require `role = 'admin'`, and repeat every business-state validation internally before privileged writes. Editor may invoke RPC transport but receives `forbidden` and no state change; this is the enforceable application-role meaning of “Editor cannot execute confirmation.”

`confirm_order_payment` transaction behavior:

1. Validate `auth.uid()` and Admin role.
2. Lock `orders` and matching `order_payments` with `FOR UPDATE`.
3. Return `not_found` without revealing extra data when no accessible Order exists.
4. Reject `orders.fulfillment_status = 'cancelled'` as `cancelled`.
5. If payment already `paid`, return `already_paid` with current safe state; do not update timestamp/actor and do not append event.
6. Permit only current `pending_payment` or `payment_reported`.
7. Require current status equals `p_expected_state`; otherwise return `state_conflict`.
8. Set payment row `status='paid'`, `confirmed_at=now()`, `confirmed_by=auth.uid()`.
9. Set `orders.payment_status='paid'`, `orders.updated_at=now()` in the same function.
10. Insert exactly one `order_events` row with `event_type='payment_confirmed'`, authenticated actor, role `admin`, and payload `{payment_id, amount, previous_status, resulting_status}`. No phone/address/QR payload.
11. Return `{code:'confirmed', order_id, payment_status:'paid'}`.

`hold_order` locks Order, rejects cancelled/completed Orders and existing active hold, normalizes `btrim(reason)`, inserts active row, appends `order_held` with `{hold_id, reason}` and Admin actor, then returns `{code:'held', hold_id}`. Reason is operational audit data; never analytics data.

`release_order_hold` locks the active hold, requires `p_expected_hold_id`, returns `state_conflict` if another session changed it, sets `released_by/released_at`, appends `order_hold_released` with `{hold_id}`, and preserves the row forever.

- [ ] **Step 1: Write failing SQL assertions first.**

Create transaction-wrapped assertions for Admin success, Editor/non-staff/anon rejection, invalid reason, cancelled Order rejection, already-paid idempotency, expected-state conflict, exactly-one event, one-active-hold constraint, release actor/time, and history preservation. Roll back fixtures after each scenario.

- [ ] **Step 2: Write migration in dependency order.**

Order: add `design_versions.approved_thumbnail_path` and staff display name → create `order_holds` → indexes/RLS select policy → revoke authenticated direct `insert/update/delete` on `orders`, `order_payments`, `order_holds`, and `order_events` → drop State 37 direct-write policies `Allow admin update orders`, `Allow admin insert order payments`, `Allow admin update order payments`, and `Allow staff insert order events` → fully qualified `SECURITY DEFINER` functions → locked `search_path`/ownership → explicit execute grants.

- [ ] **Step 3: Narrow State 37 grants/policies and add Hold reads.**

Admin/editor may select holds for Orders they may read. No application role may insert/update/delete holds, payments, financial Order fields, or events directly. Definer functions are the only staff-operation mutation path and therefore MUST reproduce authorization, Order access, allowed-state, and audit checks internally. State 37 guest checkout creation remains a separate server-only orchestration using its privileged server client/atomic creation boundary; verify it still creates Order, Payment, GuestAccess, initial Event, and immutable approved thumbnail path after authenticated-role grants are revoked. No application role may delete holds or events.

- [ ] **Step 4: Update State 37 SQL regression expectation.**

Change `supabase/tests/state37_rls.sql` scenario 7 from direct Admin `update public.orders` success to: Admin can read Orders; direct Admin updates to Orders/payments and direct event inserts raise `insufficient_privilege` or affect zero rows; State 38 RPC tests own authorized mutation success. Keep anon/non-staff/catalog/Storage assertions unchanged.

- [ ] **Step 5: Validate migration and SQL tests against deployed Supabase.**

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/0003_state38_order_operations.sql
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/state38_order_operations.sql
```

Expected: all assertions pass; no secret value appears in command output or committed files. If VPS access is unavailable, static review may proceed but this task remains blocked, not “passed.”

- [ ] **Step 6: Commit.**

```bash
git add supabase/migrations/0003_state38_order_operations.sql supabase/tests/state37_rls.sql supabase/tests/state38_order_operations.sql
git commit -m "feat(admin): add atomic payment and order hold operations"
```

---

### Task 3: Extend development seed for operational Order states

**Goal:** Make every important State 38 state manually testable without mutating real customer Orders.

**Dependencies:** Task 2 migration; State 37 seed IDs and catalog snapshots.

**Files:**
- Modify: `supabase/seed.sql`
- Test: extend `supabase/tests/state38_order_operations.sql` with seed-shape checks

- [ ] **Step 1: Add deterministic seeded scenarios.**

Use stable UUIDs/public codes and real State 37 product/variant snapshots for:

```text
QT3801 pending_payment + awaiting_review + unprocessed
QT3802 payment_reported + awaiting_review + unprocessed
QT3803 paid + awaiting_review + unprocessed
QT3804 paid + approved + ready_for_production
QT3805 paid + approved + ready_for_production + active hold
QT3806 paid + approved + in_production
QT3807 paid + approved + completed
```

Each Order gets one immutable approved DesignVersion, approved thumbnail path, concise Preflight snapshot, payment row, and coherent creation/report/confirmation/hold events. Use obvious non-real Vietnamese fixture phone/address values. Do not insert fake Auth users; bind staff roles only when operator supplies real seed Auth UUID variables per State 37 runbook.

- [ ] **Step 2: Assert seeded state coherence.**

Tests verify payment/order projection match, approved version belongs to the same Project, one active hold maximum, event ordering is deterministic, and no completed/cancelled fixture has an active hold.

- [ ] **Step 3: Reset/apply seed in approved development environment.**

Run the State 37 seed/reset command from its runbook, then query only codes/status dimensions—not phone/address—in logs.

- [ ] **Step 4: Commit.**

```bash
git add supabase/seed.sql supabase/tests/state38_order_operations.sql
git commit -m "test(admin): seed State 38 order detail scenarios"
```

---

### Task 4: Build optimized Order Detail and timeline repositories

**Goal:** Return one mapped, permission-safe detail model without card-level fetches, N+1 reads, or initial full design JSON.

**Dependencies:** Tasks 1–3; State 37 repositories, private thumbnail delivery, and staff identity.

**Files:**
- Modify: `src/lib/domain/order.ts`
- Modify: `src/lib/repositories/order-repository.ts`
- Modify: `src/lib/repositories/order-event-repository.ts`
- Modify: `src/lib/repositories/design-version-repository.ts`
- Modify: `src/lib/admin/thumbnail-delivery.ts`
- Create: `src/test/order-detail-repository.test.ts`
- Create: `src/test/order-activity-timeline.test.ts`

**Interfaces:**

```ts
export interface PreflightSummary {
  level: 'pass' | 'warning' | 'error';
  passCount: number;
  warningCount: number;
  errorCount: number;
  acceptedWarningCount: number;
  checks: Array<{
    id: string;
    level: 'warning' | 'error';
    category: 'image' | 'safe-area' | 'sticker' | 'notebook' | 'card' | 'general';
    label: string;
    description: string | null;
    advice: string | null;
  }>;
}

export interface OrderActivityItem {
  id: string;
  eventType: string;
  title: string;
  description: string | null;
  actor: { kind: 'customer' | 'system' | 'staff'; displayName: string };
  createdAt: string;
}

export interface AdminOrderDetail {
  id: string;
  publicOrderCode: string;
  createdAt: string;
  updatedAt: string;
  paymentStatus: PaymentStatus;
  designStatus: DesignStatus;
  fulfillmentStatus: FulfillmentStatus;
  payment: {
    id: string;
    status: PaymentStatus;
    amount: number;
    currency: string;
    reference: string;
    customerReportedAt: string | null;
    confirmedAt: string | null;
    confirmedBy: null | { userId: string; displayName: string };
  };
  approvedDesign: {
    id: string;
    versionNumber: number;
    source: 'customer_approved' | 'admin_revision';
    label: string;
    thumbnailUrl: string | null;
    preflight: PreflightSummary;
    createdAt: string;
  };
  product: {
    name: string;
    variant: string;
    configuration: Array<{ label: string; value: string }>;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    total: number;
    currency: string;
  };
  customer: { fullName: string; phone: string };
  delivery: { shippingAddress: string };
  activeHold: ActiveOrderHold | null;
  nextAction: OrderNextAction;
  recentEvents: OrderActivityItem[];
  nextEventCursor: string | null;
}

export interface EventPage {
  items: OrderActivityItem[];
  nextCursor: string | null;
}

export interface OrderRepository {
  getOrderDetail(orderId: string, staff: StaffIdentity, options?: { eventLimit?: number }): Promise<AdminOrderDetail | null>;
}

export interface OrderEventRepository {
  listForOrder(orderId: string, staff: StaffIdentity, options: { limit: number; cursor?: string }): Promise<EventPage>;
}
```

- [ ] **Step 1: Write mapper/query tests with snake_case fixtures.**

Assert one detail query selects Order snapshots, payment, approved DesignVersion summary/Preflight, active hold, customer/delivery, and recent 20 events; omits `design_document`, QR payload, asset metadata, and mutable Project JSON; maps signed thumbnail separately; derives `nextAction` once after mapping. Extend `GET /api/admin/orders/[id]` to call this same repository method after `requireStaff`, return `{detail}`, and map inaccessible/missing Orders to the same 404 response.

- [ ] **Step 2: Write event mapping tests.**

Known mappings:

```text
order_created → Hệ thống / Đơn hàng được tạo
customer_payment_reported → Khách hàng / Báo đã chuyển khoản
payment_confirmed → staff display name / Đã xác nhận thanh toán
order_held → staff display name / Đã tạm giữ đơn
order_hold_released → staff display name / Đã bỏ tạm giữ
```

Unknown event types render `Cập nhật đơn hàng`, optional safe description, and mapped actor—not raw UUID or raw JSON. Newest-first ordering uses `(created_at desc, id desc)` cursor stability.

- [ ] **Step 3: Implement one optimized detail query.**

Use State 37 repository's Supabase client and explicit column selection with relational embeds where supported. Do not let each UI card query independently. Fetch/generate one short-lived approved thumbnail URL after authorization. Resolve confirmer/holder display names in the same relational result or one bounded staff lookup, never one lookup per event.

- [ ] **Step 4: Implement separate full approved-version read for design inspection.**

```ts
getApprovedDesignForStaff(
  orderId: string,
  staff: StaffIdentity,
): Promise<{
  orderId: string;
  publicOrderCode: string;
  versionId: string;
  versionNumber: number;
  source: string;
  designDocument: DesignState;
  preflight: PreflightSummary;
} | null>;
```

Only this method selects `design_document`; verify the version ID equals `orders.approved_design_version_id`.

- [ ] **Step 5: Run focused tests and typecheck.**

Run:

```bash
node --test --experimental-strip-types src/test/order-detail-repository.test.ts src/test/order-activity-timeline.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/domain/order.ts src/lib/repositories src/lib/admin/thumbnail-delivery.ts src/test/order-detail-repository.test.ts src/test/order-activity-timeline.test.ts
git commit -m "feat(admin): add authorized order detail query"
```

---

### Task 5: Add typed high-impact operation service and authenticated Server Actions

**Goal:** Give UI one consistent mutation boundary with safe result codes, Admin authorization, and no raw Supabase errors.

**Dependencies:** Tasks 2 and 4; State 37 `requireStaff` and request-scoped server client.

**Files:**
- Create: `src/lib/services/admin-order-operations.ts`
- Create: `src/app/admin/orders/[id]/actions.ts`
- Create: `src/test/admin-order-operations.test.ts`

**Interfaces:**

```ts
export type AdminOrderMutationErrorCode =
  | 'forbidden'
  | 'not_found'
  | 'validation_error'
  | 'state_conflict'
  | 'already_paid'
  | 'cancelled'
  | 'unavailable';

export type AdminOrderMutationResult =
  | { ok: true; code: 'confirmed' | 'held' | 'released'; orderId: string }
  | { ok: false; code: AdminOrderMutationErrorCode; message: string };

export interface AdminOrderOperationDeps {
  supabase: SupabaseClient;
  staff: StaffIdentity;
}

export async function confirmOrderPayment(
  deps: AdminOrderOperationDeps,
  input: { orderId: string; expectedState: 'pending_payment' | 'payment_reported' },
): Promise<AdminOrderMutationResult>;

export async function placeOrderHold(
  deps: AdminOrderOperationDeps,
  input: { orderId: string; reason: string },
): Promise<AdminOrderMutationResult>;

export async function releaseOrderHold(
  deps: AdminOrderOperationDeps,
  input: { orderId: string; expectedHoldId: string },
): Promise<AdminOrderMutationResult>;

export async function confirmPaymentAction(input: {
  orderId: string;
  expectedState: 'pending_payment' | 'payment_reported';
}): Promise<AdminOrderMutationResult>;

export async function holdOrderAction(input: {
  orderId: string;
  reason: string;
}): Promise<AdminOrderMutationResult>;

export async function releaseHoldAction(input: {
  orderId: string;
  expectedHoldId: string;
}): Promise<AdminOrderMutationResult>;
```

- [ ] **Step 1: Write service tests with fake RPC responses.**

Cover Admin success, Editor forbidden before RPC, empty/2-character/over-500-character reason rejected, conflict mapping, already paid mapping, cancelled mapping, network failure mapping, and no actor/timestamp fields in inputs.

- [ ] **Step 2: Implement service methods.**

Service receives verified `StaffIdentity` and request-scoped Supabase client; checks `role === 'admin'` before calling RPC; validates UUID/order ID and hold reason; maps function JSON result to stable Vietnamese messages:

```text
forbidden → Bạn không có quyền thực hiện thao tác này.
state_conflict/already_paid → Đơn này vừa được cập nhật.
cancelled → Không thể cập nhật đơn đã hủy.
unavailable → Chưa thể cập nhật đơn hàng.
```

Log only operation name, Order internal ID, result code, and server request correlation ID where available. Never log customer/payment payload.

- [ ] **Step 3: Implement thin Server Actions.**

Add `requireCurrentStaff(role?: StaffRole): Promise<StaffIdentity>` in `src/lib/admin/authorization.ts`; it reuses State 37's `getClaims()` plus `staff_roles` lookup with the request-scoped server Supabase client, while existing Route Handlers keep `requireStaff(request, role?)`. Each Server Action calls `requireCurrentStaff('admin')`, creates the request-scoped client, invokes the service, and on success calls `revalidatePath('/admin/orders')` plus `revalidatePath(`/admin/orders/${input.orderId}`)`. Return only `AdminOrderMutationResult`.

- [ ] **Step 4: Test manual invocation as Editor.**

Call the action/service boundary with Editor identity and assert no RPC call occurs. Live SQL test separately proves direct RPC invocation cannot mutate.

- [ ] **Step 5: Run focused tests and typecheck.**

Run: `node --test --experimental-strip-types src/test/admin-order-operations.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/services/admin-order-operations.ts src/app/admin/orders/[id]/actions.ts src/test/admin-order-operations.test.ts
git commit -m "feat(admin): add authorized order operation actions"
```

---

### Task 6: Build protected Order Detail route, responsive shell, and stable states

**Goal:** Replace State 37's read-only handoff with the operational command center while preserving Inbox navigation state.

**Dependencies:** Tasks 1, 4, 5; State 37 Admin layout and Inbox query-state conventions.

**Files:**
- Modify: `src/app/admin/orders/[id]/page.tsx`
- Create: `src/app/admin/orders/[id]/loading.tsx`
- Create: `src/app/admin/orders/[id]/error.tsx`
- Create: `src/app/admin/orders/[id]/order-detail-client.tsx`
- Create: `src/components/admin/order-detail.tsx`
- Create: `src/components/admin/order-next-action-card.tsx`
- Modify/delete after migration: `src/components/admin/order-detail-readonly.tsx`
- Add official shadcn primitives only if absent after State 37
- Create: `src/test/admin-order-detail.test.ts`

**Route contract:**

```ts
export default async function AdminOrderDetailPage(
  props: PageProps<'/admin/orders/[id]'>,
): Promise<React.JSX.Element>;
```

The Server Component awaits `params`, validates ID, calls `requireStaff`, then `getOrderDetail(id, staff, {eventLimit: 20})`. Missing/inaccessible Order returns the same `notFound()` result; unauthorized users receive no Order data. `searchParams.returnTo` is accepted only when it resolves to `/admin/orders` with relative query parameters—never arbitrary origins.

- [ ] **Step 1: Write route/render contract tests.**

Assert Header shows `← #QT1042`, creation time, product × quantity, total; Next Action appears before Payment; mobile section order is Header → Next Action/Hold → Payment → Design → Product/Customer/Delivery → Activity; Editor receives the same readable truth but no financial/hold action props; no full design JSON is serialized to client.

- [ ] **Step 2: Implement loading/error/not-found states.**

`loading.tsx` renders stable header, top action card, two main cards, and side summary skeletons. `error.tsx` keeps route shell and offers `Thử lại` plus `Về danh sách đơn`; no raw error text. Not found copy: `Không tìm thấy đơn hàng.` with Inbox link.

- [ ] **Step 3: Compose responsive layout.**

Mobile/tablet: one column in priority order. Desktop: `minmax(0, 1fr)` main column for Next Action, Payment, Design, Activity plus 320–360px side column for Product, Customer, Delivery, status summary. Use existing shadcn `Card`, `Badge`, `Button`, `Separator`, `Skeleton`; no nested-card wall, charts, sidebar addition, or serif operational labels.

- [ ] **Step 4: Preserve Inbox state.**

Inbox row links append sanitized `returnTo` containing current view/search/filter/page. Header Back uses that value; browser Back naturally returns to existing route. Restore scroll through State 37's existing mechanism; do not create a second persistence scheme.

- [ ] **Step 5: Render one Next Action card from resolver output.**

React receives `detail.nextAction`; it never recomputes status priority. `confirm_payment` opens payment dialog, `release_hold` opens release action, navigate CTAs use `/admin/orders/[id]/design`. Waiting/ready/no-action states have no fake button.

- [ ] **Step 6: Keep motion operational.**

Use shadcn/Tailwind focus/open/close transitions only. Do not add a GSAP page entrance: no sequencing/runtime control is required, and Operate guidance prefers immediate task availability. Respect `prefers-reduced-motion` through existing shadcn/Tailwind motion variants.

- [ ] **Step 7: Run focused tests and typecheck.**

Run: `node --test --experimental-strip-types src/test/admin-order-detail.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 8: Commit.**

```bash
git add src/app/admin/orders/[id] src/components/admin src/components/ui src/test/admin-order-detail.test.ts
git commit -m "feat(admin): build responsive order detail command center"
```

---

### Task 7: Add explicit Admin payment confirmation UX

**Goal:** Let Admin confirm money received without optimistic paid state or generic dropdowns; keep Editor read-only.

**Dependencies:** Tasks 5–6.

**Files:**
- Create: `src/components/admin/order-payment-card.tsx`
- Modify: `src/app/admin/orders/[id]/order-detail-client.tsx`
- Modify: `src/test/admin-order-detail.test.ts`
- Modify: `src/test/admin-order-operations.test.ts`

**UI contract:**

```tsx
export interface OrderPaymentCardProps {
  orderCode: string;
  payment: AdminOrderDetail['payment'];
  canConfirmPayment: boolean;
  isSubmitting: boolean;
  onConfirmIntent: () => void;
}
```

Payment card always shows status text, expected amount, reference, customer report timestamp when present, and confirmation timestamp/actor when paid. Admin sees `Xác nhận đã nhận tiền` for `pending_payment` or `payment_reported`; Editor never sees it. The primary Next Action promotes this button only for `payment_reported`; pending payment keeps `Đang chờ khách thanh toán` as the page recommendation but still permits deliberate Admin confirmation from Payment section when bank reconciliation proves receipt.

- [ ] **Step 1: Add behavior tests for payment states and roles.**

Test Reported/Admin, Pending/Admin, Paid/Admin, Reported/Editor. Assert no `Payment Status [Paid ▼]`, no `Mark unpaid`, no optimistic paid label, and paid actor/time are visible after refetch.

- [ ] **Step 2: Build official AlertDialog confirmation.**

Copy:

```text
Xác nhận thanh toán?
Đơn #QT1042
200.000đ
Chỉ xác nhận khi bạn đã kiểm tra tiền đã vào tài khoản.
Hủy | Xác nhận
```

Dialog uses accessible title/description, focuses safely, disables close/duplicate submit while pending, and announces server error in a non-destructive inline region.

- [ ] **Step 3: Wire non-optimistic submission.**

Flow is exact: intent → dialog → Server Action with current expected state → success → authoritative detail refetch/`router.refresh()` → close dialog → UI renders paid data. Do not mutate local `payment.status='paid'` before refetch.

On `state_conflict` or `already_paid`, close/retain dialog as appropriate, automatically refetch, and show `Đơn này vừa được cập nhật.`. On failure, keep current valid server data visible and allow retry.

- [ ] **Step 4: Verify duplicate submission protection.**

Rapid double click produces one disabled pending action. SQL concurrency test remains authority for two separate sessions.

- [ ] **Step 5: Run focused tests.**

Run:

```bash
node --test --experimental-strip-types src/test/admin-order-detail.test.ts src/test/admin-order-operations.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/components/admin/order-payment-card.tsx src/app/admin/orders/[id]/order-detail-client.tsx src/test/admin-order-detail.test.ts src/test/admin-order-operations.test.ts
git commit -m "feat(admin): add manual payment confirmation flow"
```

---

### Task 8: Add Admin-only Hold and release Hold UX

**Goal:** Make operational holds visible, actionable, and audited without corrupting independent statuses.

**Permission decision:** State 38 keeps hold/release **Admin-only**. State 37 has only broad Admin/Editor roles and no typed design-vs-operations hold capability; allowing Editor to block all production would be overbroad. State 39 may add a typed design-review hold capability after its workflow exists.

**Dependencies:** Tasks 2, 5–6.

**Files:**
- Create: `src/components/admin/order-hold-banner.tsx`
- Create: `src/components/admin/order-more-menu.tsx`
- Modify: `src/app/admin/orders/[id]/order-detail-client.tsx`
- Modify: `src/components/admin/order-detail.tsx`
- Modify: `src/test/admin-order-detail.test.ts`
- Modify: `src/test/admin-order-operations.test.ts`

- [ ] **Step 1: Write Hold UI tests.**

Assert unheld Admin sees `••• → Tạm giữ đơn`; held Admin sees hold reason, actor/time, and `Bỏ tạm giữ`; Editor sees active hold truth but neither mutation; cancelled/completed Orders offer no hold; no cancellation placeholder exists.

- [ ] **Step 2: Build hold dialog.**

Use official `DropdownMenu` and `Dialog`/`AlertDialog` plus existing `Textarea`. Required label `Lý do tạm giữ`; trim input; 3–500 characters; show count only near limit; actions `Hủy` and `Tạm giữ`; local pending state disables duplicate submit. Do not log reason.

- [ ] **Step 3: Build active Hold banner and release action.**

Banner appears directly below Next Action, not hidden in side metadata. It shows `Đơn đang tạm giữ`, reason, staff display name, held time, and Admin `Bỏ tạm giữ`. Release sends `expectedHoldId`; no destructive confirmation is required, but button has pending state.

- [ ] **Step 4: Refetch after hold/release.**

Success refetches detail and Inbox projection; Next Action changes only from authoritative response. Conflict refetches and shows `Đơn này vừa được cập nhật.`. Never delete hold rows or past events.

- [ ] **Step 5: Run focused tests.**

Run:

```bash
node --test --experimental-strip-types src/test/admin-order-detail.test.ts src/test/admin-order-operations.test.ts src/test/order-next-action.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/components/admin/order-hold-banner.tsx src/components/admin/order-more-menu.tsx src/app/admin/orders/[id]/order-detail-client.tsx src/components/admin/order-detail.tsx src/test
git commit -m "feat(admin): add audited order hold controls"
```

---

### Task 9: Add Design, Preflight, Product, Customer, Delivery, and fulfillment sections

**Goal:** Show immutable ordered truth and useful staff context without turning detail into an editable record or loading full design JSON initially.

**Dependencies:** Tasks 4 and 6.

**Files:**
- Create: `src/components/admin/order-design-card.tsx`
- Create: `src/components/admin/order-summary-sections.tsx`
- Create: `src/app/admin/orders/[id]/design/page.tsx`
- Create: `src/components/admin/approved-design-inspector.tsx`
- Modify: `src/components/admin/order-detail.tsx`
- Modify: `src/test/admin-order-detail.test.ts`

- [ ] **Step 1: Add section behavior tests.**

Assert approved version label explicitly says `Phiên bản khách duyệt v1` for `customer_approved`; thumbnail points to `approvedDesign.id`; Preflight pass/warning summary and expandable detail render; product quantity/unit price/final total come from Order snapshot; customer/delivery values are readable but not inputs; fulfillment is read-only; no production mutation exists.

- [ ] **Step 2: Build Design and Preflight card.**

Use approved thumbnail with useful alt text, centralized design status badge, version label, warning summary (`2 cảnh báo khách đã chấp nhận`), and shadcn Collapsible `Xem chi tiết`. Detail shows label, customer-facing consequence, and advice for image/safe-area/fold/sticker warnings; no stack trace/rule code.

- [ ] **Step 3: Build read-only approved-design inspection route.**

`/admin/orders/[id]/design` repeats staff authorization and repository access, then loads only the exact `approved_design_version_id` full document. Render with existing canvas/preview components in non-editable mode. Header identifies Order and approved version; Back returns to detail. Do not mount editor mutation/history controls or create an Admin revision.

- [ ] **Step 4: Build Product and fulfillment summary from snapshots.**

Display product, variant, relevant configuration, quantity, unit price where useful, subtotal/final total, and current fulfillment status. Never join current catalog pricing to reconstruct historical values. `Sẵn sàng sản xuất` may be displayed when resolver conditions hold, but no `Bắt đầu sản xuất` action exists.

- [ ] **Step 5: Build Customer and Delivery sections.**

Show full name/phone and address in separate compact sections. Add explicit accessible copy actions `Sao chép số điện thoại` and `Sao chép địa chỉ` with non-blocking `Đã sao chép`; no inline edit. Clipboard values never enter console/analytics.

- [ ] **Step 6: Run focused tests and typecheck.**

Run: `node --test --experimental-strip-types src/test/admin-order-detail.test.ts && pnpm typecheck`

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add src/components/admin/order-design-card.tsx src/components/admin/order-summary-sections.tsx src/components/admin/approved-design-inspector.tsx src/app/admin/orders/[id]/design src/components/admin/order-detail.tsx src/test/admin-order-detail.test.ts
git commit -m "feat(admin): add approved design and order snapshot detail"
```

---

### Task 10: Add Activity Timeline with bounded pagination

**Goal:** Render meaningful append-only history without raw identifiers or unlimited initial data.

**Dependencies:** Task 4 repository and Task 6 shell.

**Files:**
- Create: `src/app/api/admin/orders/[id]/events/route.ts`
- Create: `src/components/admin/order-activity-timeline.tsx`
- Modify: `src/app/admin/orders/[id]/order-detail-client.tsx`
- Modify: `src/test/order-activity-timeline.test.ts`
- Modify: `src/test/admin-order-detail.test.ts`

**API contract:**

```http
GET /api/admin/orders/:id/events?limit=20&cursor=<opaque>
200 { "items": OrderActivityItem[], "nextCursor": string | null }
404 { "error": "Không tìm thấy đơn hàng." }
500 { "error": "Chưa thể tải hoạt động." }
```

- [ ] **Step 1: Test authorization, order, mapping, and cursor behavior.**

Admin/editor with Order access receive newest-first events; non-staff/anon get no data; limit clamps to 20–50; cursor remains stable for equal timestamps; actor UUID and raw payload are absent.

- [ ] **Step 2: Implement protected pagination route.**

Use `requireStaff`, validate ID/cursor/limit, call `listForOrder`, and map expected repository errors to concise copy. Never accept an actor/filter from browser.

- [ ] **Step 3: Build timeline UI.**

Initial 20 items come from `AdminOrderDetail`. Each item shows local date/time, human actor, title, and optional safe description. Use semantic list markup. `Xem thêm` appends one page with local button loading; do not replace the entire page or duplicate items.

- [ ] **Step 4: Add empty/unknown states.**

Empty: `Chưa có hoạt động.` Unknown event: mapped generic title from Task 4, not JSON dump. Pagination failure leaves loaded events visible and provides local retry.

- [ ] **Step 5: Run focused tests.**

Run:

```bash
node --test --experimental-strip-types src/test/order-activity-timeline.test.ts src/test/admin-order-detail.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/app/api/admin/orders/[id]/events src/components/admin/order-activity-timeline.tsx src/app/admin/orders/[id]/order-detail-client.tsx src/test/order-activity-timeline.test.ts src/test/admin-order-detail.test.ts
git commit -m "feat(admin): add paginated order activity timeline"
```

---

### Task 11: Extend private Realtime/refetch synchronization

**Goal:** Keep Inbox and Order Detail reasonably fresh without trusting WebSocket payloads or breaking when disconnected.

**Dependencies:** Tasks 6–10; State 37 private Realtime helper.

**Files:**
- Modify: `src/lib/admin/realtime.ts`
- Modify: `src/app/admin/orders/[id]/order-detail-client.tsx`
- Modify: `src/app/admin/orders/orders-inbox-client.tsx`
- Create: `src/test/admin-order-detail-realtime.test.ts`
- Modify: `src/test/orders-inbox.test.ts`

**Interface:**

```ts
export function subscribeToOrderDetailChanges(
  client: SupabaseClient,
  orderId: string,
  onSignal: () => void,
  onReconnect: () => void,
): () => void;
```

- [ ] **Step 1: Write lifecycle tests.**

Assert topic is the private channel `order:<orderId>`; channel authorization reuses State 37's staff Order-read policy; payload is only a refetch signal; cleanup removes channel; mutation success, reconnect, and `visibilitychange` to visible trigger refetch; repeated signals coalesce; disconnect leaves current data usable.

- [ ] **Step 2: Implement narrow private subscription.**

Reuse State 37 client/channel authorization. Listen only for Order/payment/hold/event changes relevant to this ID. Never place customer data, address, amount, or event payload in broadcast messages.

- [ ] **Step 3: Implement authoritative refetch.**

On signal, fetch `GET /api/admin/orders/[id]` or `router.refresh()` through one coordinator. Replace complete detail state only after successful authorized response. Keep current valid state and show local stale/error message on failure.

- [ ] **Step 4: Refresh Inbox after detail mutation.**

State 37 Inbox subscription/refocus path must update counts/attention rows after payment confirmation and hold/release. Preserve search/filter/page/scroll state.

- [ ] **Step 5: Run focused tests.**

Run:

```bash
node --test --experimental-strip-types src/test/admin-order-detail-realtime.test.ts src/test/orders-inbox.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/admin/realtime.ts src/app/admin/orders src/test/admin-order-detail-realtime.test.ts src/test/orders-inbox.test.ts
git commit -m "feat(admin): synchronize order detail with authoritative refetch"
```

---

### Task 12: Document operations, validate permissions, and run full regression/manual QA

**Goal:** Prove State 38 behavior end-to-end against deployed Supabase and leave an actionable runbook.

**Dependencies:** Tasks 1–11; deployed State 37 and State 38 migrations; test Admin and Editor Auth users.

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/state38-order-detail-runbook.md`
- No additional production feature files.

- [ ] **Step 1: Document permission and state-transition matrix.**

Runbook records:

```text
Admin: read detail, confirm pending/reported payment, hold, release.
Editor: read detail/payment/customer/design/preflight/history; no confirm/hold/release.
Anon/non-staff: no private detail, thumbnail, event, or mutation access.
pending_payment|payment_reported → paid: Admin only, irreversible in State 38.
no active hold → active hold → released hold: Admin only, append-only history.
```

Document canonical payment source, denormalized synchronization, RPC result codes, event types, private Realtime topic, migration order, seed scenarios, and conflict troubleshooting.

- [ ] **Step 2: Run all repository checks.**

```bash
pnpm test
pnpm typecheck
pnpm build
```

Expected: all existing and State 38 tests pass; production build passes. Record exact warnings rather than hiding them.

- [ ] **Step 3: Run deployed migration/RLS/RPC checks.**

Apply State 38 migration in a clean development Supabase project, then run `supabase/tests/state37_rls.sql` and `state38_order_operations.sql`. Verify Admin, Editor, authenticated non-staff, and anon behavior. Confirm direct Editor RPC call returns forbidden and no row/event changes.

- [ ] **Step 4: Run payment browser smoke at mobile and desktop widths.**

Scenario: customer Order → customer reports payment → Inbox `Cần xử lý` → Admin detail → Reported card → confirmation dialog → server success → refetch → Paid actor/time → exactly one timeline event → Inbox attention/count update. Inspect network/UI to prove no optimistic Paid before server response.

- [ ] **Step 5: Run Editor-role smoke.**

Open same Order as Editor. Verify readable permitted detail, approved design/Preflight/customer delivery, payment status/amount, no confirmation/hold controls, and manually invoking protected Server Action/RPC fails.

- [ ] **Step 6: Run Hold smoke.**

Admin places hold with reason; Next Action becomes Hold; banner and timeline event appear; Inbox attention updates; release uses current hold ID; prior hold row/event remain; derived production readiness returns after refetch.

- [ ] **Step 7: Run true concurrency smoke.**

Open same `payment_reported` Order in two authenticated Admin browser sessions. Submit confirmation in session A, then session B. Expected: A confirms; B receives stale/already-paid result and refetches; `confirmed_at/confirmed_by` remain from A; exactly one `payment_confirmed` event exists. Repeat hold placement to prove one active hold.

- [ ] **Step 8: Run Realtime-disconnect smoke.**

With Inbox and Detail open separately, mutate and observe private signal/refetch. Disable Realtime, mutate in another session, then refocus/revisit; authoritative state still refreshes correctly.

- [ ] **Step 9: Verify responsive/accessibility behavior.**

At 390×844 and desktop: action/payment/design remain above address/history on mobile; desktop columns do not overflow; keyboard reaches More menu, dialogs, Collapsible, copy buttons, `Xem thêm`; focus returns to trigger; status meaning is text plus icon, not color; reduced-motion mode has no required motion.

- [ ] **Step 10: Run Impeccable detector once after UI completion.**

```bash
cmd /c ".agents\skills\impeccable\scripts\impeccable.cmd detect --json src\app\admin\orders\[id] src\components\admin"
```

Resolve actionable State 38 findings in one batch; do not restyle unrelated surfaces.

- [ ] **Step 11: Commit documentation and final fixes.**

```bash
git add README.md docs/superpowers/state38-order-detail-runbook.md
git commit -m "docs(admin): document State 38 order operations"
```

---

## Explicit Deferrals

State 38 MUST NOT implement:

- full Admin Design Editor or Admin revision creation (State 39);
- production start/complete, shipping, cancellation, or production timeline mutation (State 40);
- partial/over/under-payment, refund, reversal, “Mark unpaid,” or correction workflow;
- automatic provider callback/webhook or client redirect trust;
- public/private customer messaging;
- bulk Order operations;
- shipping provider integration;
- permanent public artwork URLs;
- generic payment/status dropdowns;
- fake disabled buttons for future features.

## Requirement Coverage

| State 38 area | Plan coverage |
|---|---|
| Real repository inspection and State 37 reuse | Baseline Evidence, execution gate, File Map |
| Independent statuses and deterministic Next Action | Task 1 |
| Payment section, Admin confirmation, Editor denial | Tasks 2, 5, 7 |
| Atomicity, expected state, concurrency, exactly-once event | Task 2, Task 12 |
| Function security, grants, RLS/RBAC, DB actor/time | Tasks 2, 5, 12 |
| Hold/release model, history, permissions, progression block | Tasks 1–3, 5, 8 |
| Optimized detail query and no full design JSON initially | Task 4 |
| Approved DesignVersion, private thumbnail, read-only inspection | Tasks 4, 9 |
| Preflight, immutable product/price snapshot | Tasks 4, 9 |
| Customer/delivery privacy and copy actions | Tasks 4, 9 |
| Read-only fulfillment/production | Tasks 1, 9 |
| Activity timeline, actor labels, unknown events, pagination | Tasks 4, 10 |
| Responsive shadcn UI, loading/error/not-found | Tasks 6–10 |
| Realtime as hint plus fallback refetch | Task 11 |
| Seed, test matrices, manual QA, docs, regression/build | Tasks 3, 12 |
| State 39/40 and financial-operation deferrals | Explicit Deferrals |

## Definition of Done Checklist

- [ ] Admin and Editor securely open `/admin/orders/[orderId]`; unauthorized access returns no private data.
- [ ] Detail identifies one deterministic Next Action from independent payment/design/fulfillment/hold state.
- [ ] Admin confirms `pending_payment` or `payment_reported` through one authorized atomic Postgres function.
- [ ] Confirmation sets canonical payment and denormalized Order projection together, records DB actor/time, and appends exactly one event.
- [ ] Editor UI hides confirmation, and direct Server Action/RPC invocation cannot mutate.
- [ ] Active hold is separate from lifecycle statuses, blocks readiness in resolver, and can be released without deleting history.
- [ ] Customer-approved DesignVersion, private thumbnail, and Preflight summary are explicit; full JSON loads only in read-only inspection.
- [ ] Product and price use immutable snapshots; customer/delivery data is readable, non-inline-editable, and never logged.
- [ ] Timeline is newest-first, paginated, actor-readable, and resilient to unknown future event types.
- [ ] Two-Admin concurrency creates one payment transition/event and stale session refetches safely.
- [ ] Realtime improves freshness but disconnect/refocus/navigation still converges on authoritative state.
- [ ] Existing checkout, QR Payment, Order Confirmation, Inbox, local editing, Auth, RLS, and private Storage tests remain green.
- [ ] State 37 and State 38 SQL tests, full tests, typecheck, production build, mobile/desktop browser smoke, role smoke, concurrency smoke, and Realtime-disconnect smoke pass.

## Self-Review

- **Scope:** State 38 remains one operational detail subsystem with payment/hold mutations; State 39 editing and State 40 production/cancellation stay deferred.
- **Architecture:** Every critical mutation follows UI intent → authenticated Server Action → Admin domain service → locked `SECURITY DEFINER` atomic RPC → append-only event → authoritative refetch. Direct table writes remain denied.
- **Payment integrity:** One canonical payment row; denormalized Order status changes only in same transaction; no client-supplied actor/time; no optimistic Paid.
- **Concurrency:** Row locks plus expected state/hold ID prevent duplicate confirmation/events and stale releases.
- **Permission:** UI capability rendering and server/RLS/function enforcement are separate and both required.
- **Data loading:** Initial page omits full design JSON and unlimited events; one repository detail query feeds all cards.
- **UI:** Operate hierarchy prioritizes identity/action/payment/design; official shadcn primitives; no unjustified GSAP choreography; stable mobile and desktop states.
- **Placeholder scan:** No implementation placeholder, fake button, unowned follow-up, or unspecified edge handling remains. Live database checks are explicit prerequisites, not inferred success.
