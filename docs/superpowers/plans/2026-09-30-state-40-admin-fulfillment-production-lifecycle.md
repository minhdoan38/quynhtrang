# State 40: Admin Order Fulfillment & Production Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Staff transition orders through the manufacturing and fulfillment lifecycle: starting production with strict prerequisites (paid + design approved + no active hold + valid production design version), completing production, and canceling orders with audited reason.

**Architecture:** Extend the existing authenticated Supabase RPC boundary with forward-only migration `0005_state40_fulfillment_operations.sql`. Enforce row locking in canonical order (`orders` -> `order_holds` -> `design_revision_drafts` -> `order_events`). Implement domain services, server actions, accessible confirmation dialogs, and update next action resolver and timeline.

**Tech Stack:** Next.js 16.3.6, React 19, TypeScript, Supabase Postgres/Auth/RLS, shadcn UI components, existing Node test runner.

**Prerequisites:** State 37 (Admin Inbox), State 38 (Order Detail & Operations), State 39 (Design Revisions & Lineage).

## Global Constraints

- **Strict prerequisite gating for production start:** Order must be `payment_status = 'paid'`, `design_status = 'approved'`, `activeHold = null`, `fulfillment_status in ('unprocessed', 'ready_for_production')`, and have a valid `production_design_version_id`.
- **Active Hold priority:** An active Hold blocks starting production and completing production. Approval does NOT release a Hold.
- **Immutability when in production:** Once `fulfillment_status = 'in_production'`, design revisions are completely locked (enforced by State 39 DB triggers and RPC checks).
- **Atomic and audited:** Every transition runs in a single `SECURITY DEFINER` transaction with row-level locks, increments `orders.updated_at`, appends an `order_events` entry, and returns an idempotent response.
- **Permissions:** Admin and Editor can start and complete production. Only Admin can cancel an order, requiring a trimmed 3–500 character reason.
- **No side-effects on money:** Production transition changes fulfillment status only; never alters payment, pricing, quantity, or shipping address.

---

### Task 1: Domain types, transition invariants and pure functions

**Files:**
- Modify: `src/lib/domain/order.ts`
- Modify: `src/lib/admin/order-next-action.ts`
- Test: `src/test/fulfillment-lifecycle-domain.test.ts`

- [ ] **Step 1: Write the failing test**

Test prerequisite validation for starting production, completing production, cancellation rules, and next action CTAs.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/fulfillment-lifecycle-domain.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement domain functions and next action CTAs**

Add `assertProductionStartEligible`, `assertProductionCompleteEligible`, `assertOrderCancelEligible`, update `OrderNextAction` CTAs for `ready_for_production` and `production_in_progress`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/fulfillment-lifecycle-domain.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(fulfillment): define production lifecycle invariants and next actions"
```

---

### Task 2: Database migration for atomic fulfillment operations

**Files:**
- Create: `supabase/migrations/0005_state40_fulfillment_operations.sql`
- Create: `supabase/tests/state40_fulfillment_operations.sql`

- [ ] **Step 1: Write migration SQL with RPCs**

Implement `start_order_production`, `complete_order_production`, `cancel_order` with row-level locking, eligibility checks, audit events, and idempotency tracking.

- [ ] **Step 2: Write test assertions in SQL**

Test role authorization (anon/nonstaff denied, editor allowed for production, admin required for cancel), hold blocking, idempotency, and audit event insertion.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(db): add atomic fulfillment and production transition RPCs"
```

---

### Task 3: Fulfillment repository & server service methods

**Files:**
- Create: `src/lib/services/admin-fulfillment-operations.ts`
- Modify: `src/lib/repositories/order-repository.ts`
- Test: `src/test/admin-fulfillment-operations.test.ts`

- [ ] **Step 1: Write unit tests for fulfillment service**

Test calling `startProduction`, `completeProduction`, and `cancelOrder` with mock client.

- [ ] **Step 2: Implement service methods**

Call `requireCurrentStaff()` and dispatch to corresponding database RPCs.

- [ ] **Step 3: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/admin-fulfillment-operations.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(fulfillment): add authorized admin fulfillment operations service"
```

---

### Task 4: Server Actions & accessible confirmation dialogs

**Files:**
- Modify: `src/app/admin/orders/[id]/actions.ts`
- Create: `src/components/admin/order-fulfillment-dialogs.tsx`
- Modify: `src/components/admin/order-next-action-card.tsx`
- Modify: `src/app/admin/orders/[id]/order-detail-client.tsx`

- [ ] **Step 1: Add server actions in actions.ts**

Expose `startProductionAction`, `completeProductionAction`, `cancelOrderAction`.

- [ ] **Step 2: Create confirmation dialogs component**

Accessible Dialogs for:
- "Bắt đầu sản xuất" (shows order code, quantity, production design version)
- "Hoàn tất sản xuất" (confirms delivery readiness)
- "Hủy đơn hàng" (mandatory textarea for reason, 3-500 chars)

- [ ] **Step 3: Wire into OrderDetailClient and OrderNextActionCard**

Connect CTAs and card actions to trigger confirmation dialogs, call server actions, and refresh state on success.

- [ ] **Step 4: Commit**

```bash
git commit -m "feat(admin): build production transition controls and confirmation dialogs"
```

---

### Task 5: End-to-end verification, seed fixtures and documentation

**Files:**
- Create: `supabase/seed_state40.sql`
- Create: `docs/superpowers/state40-fulfillment-runbook.md`
- Modify: `README.md`

- [ ] **Step 1: Create seed data for State 40**

Seed orders in ready_for_production, in_production, completed, and cancelled states.

- [ ] **Step 2: Write operator runbook and update README.md**

Document fulfillment lifecycle, prerequisite checks, DB migrations, and troubleshooting.

- [ ] **Step 3: Run full verification suite**

Run: `pnpm typecheck && pnpm test && pnpm build`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "test(fulfillment): verify order production lifecycle and document runbook"
```
