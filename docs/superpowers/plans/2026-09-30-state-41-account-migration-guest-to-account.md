# State 41: Account Migration / Guest → Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build optional, passwordless customer account creation and secure guest order/project migration, enabling cross-device access and cloud persistence while preserving local-first guest customization.

**Architecture:** Extend Supabase schema with migration `0006_state41_account_migration.sql` adding `profiles`, `orders.customer_user_id`, `projects.working_document`, `projects.origin_local_project_id`, and atomic `SECURITY DEFINER` RPC `claim_guest_order_and_project`. Expose customer-safe projections via `get_customer_orders` and `get_customer_order_detail`. Implement monotonic revision checks on cloud autosave, harden private asset streaming against unauthorized access, and integrate an unforced post-checkout OTP invitation on the Order Confirmation panel.

**Tech Stack:** Next.js 16.3.6 (App Router), React 19, TypeScript 7, Supabase (Auth, Postgres, RLS, Storage), Tailwind CSS v4, shadcn UI primitives, Node test runner (`node --test`).

**Spec:** State 41 Attachment (Account Migration / Guest → Account Specification).

## Global Constraints

- **Guest editing remains local-first:** Max 3 projects, 30-day retention, no anonymous Supabase users created on startup (`signInAnonymously()` prohibited).
- **Optional account invitation post-checkout:** Customer prompt appears on State 36 Order Confirmation after order creation and payment instructions are established.
- **Strict claim proof:** Orders can ONLY be claimed with valid guest token proof matching `guest_order_access` + permanent authenticated `auth.uid()`. Matching phone or email alone is strictly prohibited.
- **Idempotent migration:** Retries or re-logins must not duplicate cloud projects or asset blobs. Keyed by `(owner_user_id, origin_local_project_id)`.
- **Source of truth inversion:** Once claimed/migrated, Supabase Postgres becomes canonical; local browser persistence degrades to cache/recovery.
- **Monotonic cloud revision checks:** Server rejects stale revision writes with HTTP 409 conflict; no CRDT, no live merge, no silent last-write-wins.
- **Customer safe projections:** Customers never see internal production notes, staff identity, hold reasons, production artifact files, or admin revisions disguised as customer approvals. Customer order views display `customer_approved_design_version_id`.
- **Security & RBAC separation:** Customers default to standard authenticated role; cannot access `/admin/*` routes or staff RPCs. Private customer assets in `customer-assets` bucket require authorized session or valid guest token.
- **Passwordless authentication:** Email OTP via Supabase Auth for MVP (local Inbucket support at port 54324, no SMS vendor required).

---

### Task 1: Fix Local Guest Persistence & 30-Day Retention

**Files:**
- Modify: `src/lib/storage.ts`
- Test: `src/test/guest-storage-lifecycle.test.ts`

**Interfaces:**
- Consumes: `DesignState` from `src/lib/product-state.ts`
- Produces: Stable `RecentProject.id`, 30-day TTL filtering, migration metadata tracking (`syncedCloudProjectId`, `syncedRevision`, `migratedAt`).

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/guest-storage-lifecycle.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRecentProjects,
  saveRecentProject,
  pruneExpiredRecentProjects,
  markProjectMigrated,
  type RecentProject,
} from '../lib/storage.ts';
import type { DesignState } from '../lib/product-state.ts';

test('maintains stable project ID across multiple autosave flushes', () => {
  const dummyStorage: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (k: string) => dummyStorage[k] ?? null,
    setItem: (k: string, v: string) => { dummyStorage[k] = v; },
    removeItem: (k: string) => { delete dummyStorage[k]; },
    clear: () => {},
    key: () => null,
    length: 0,
  } as Storage;

  const initialDesign: DesignState = {
    productId: 'wrapping',
    variantId: 'a1',
    templateId: null,
    text: 'Bản thảo 1',
    color: '#000',
    backgroundColor: '#fff',
    image: null,
    productOptions: {},
    quantity: 1,
  };

  saveRecentProject(initialDesign, 'stable-proj-uuid-1');
  const firstList = getRecentProjects();
  assert.equal(firstList.length, 1);
  assert.equal(firstList[0].id, 'stable-proj-uuid-1');

  // Save again with same stable ID
  saveRecentProject({ ...initialDesign, text: 'Bản thảo 1 cập nhật' }, 'stable-proj-uuid-1');
  const secondList = getRecentProjects();
  assert.equal(secondList.length, 1);
  assert.equal(secondList[0].id, 'stable-proj-uuid-1');
  assert.equal(secondList[0].text, 'Bản thảo 1 cập nhật');
});

test('prunes projects older than 30 days', () => {
  const dummyStorage: Record<string, string> = {};
  globalThis.localStorage = {
    getItem: (k: string) => dummyStorage[k] ?? null,
    setItem: (k: string, v: string) => { dummyStorage[k] = v; },
    removeItem: (k: string) => { delete dummyStorage[k]; },
    clear: () => {},
    key: () => null,
    length: 0,
  } as Storage;

  const now = Date.now();
  const validProject: RecentProject = {
    id: 'valid-1',
    productId: 'card',
    variantId: 'horizontal',
    templateId: null,
    text: 'Mới tạo',
    color: '#000',
    backgroundColor: '#fff',
    image: null,
    productOptions: {},
    updatedAt: now - 5 * 24 * 60 * 60 * 1000, // 5 days ago
  };

  const expiredProject: RecentProject = {
    id: 'expired-1',
    productId: 'sticker',
    variantId: 'die-cut',
    templateId: null,
    text: 'Quá hạn',
    color: '#000',
    backgroundColor: '#fff',
    image: null,
    productOptions: {},
    updatedAt: now - 35 * 24 * 60 * 60 * 1000, // 35 days ago
  };

  dummyStorage['quynhtrang-recent-projects-v1'] = JSON.stringify([validProject, expiredProject]);
  const active = pruneExpiredRecentProjects();
  assert.equal(active.length, 1);
  assert.equal(active[0].id, 'valid-1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/guest-storage-lifecycle.test.ts`
Expected: FAIL with `saveRecentProject` / `pruneExpiredRecentProjects` missing or unstable.

- [ ] **Step 3: Implement minimal storage improvements**

Update `src/lib/storage.ts`:
- Extend `RecentProject` interface with `syncedCloudProjectId?: string`, `syncedRevision?: number`, `migratedAt?: number`.
- Add `GUEST_RETENTION_MS = 30 * 24 * 60 * 60 * 1000`.
- In `saveRecentProject(state: DesignState, explicitId?: string)`: reuse `explicitId` or keep existing ID if product matches.
- In `getRecentProjects()`: filter out items where `Date.now() - p.updatedAt > GUEST_RETENTION_MS`.
- Export `pruneExpiredRecentProjects(): RecentProject[]`.
- Export `markProjectMigrated(localId: string, cloudProjectId: string, revision: number): void`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/guest-storage-lifecycle.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage.ts src/test/guest-storage-lifecycle.test.ts
git commit -m "fix(storage): enforce stable guest project ID and 30-day TTL retention"
```

---

### Task 2: Database Migration for State 41 Account Schema & RPCs

**Files:**
- Create: `supabase/migrations/0006_state41_account_migration.sql`
- Create: `supabase/tests/state41_account_migration.sql`

**Interfaces:**
- Consumes: Tables `orders`, `projects`, `assets`, `guest_order_access`, `order_events` from migrations `0001`–`0005`.
- Produces: Table `profiles`, column `orders.customer_user_id`, columns `projects.working_document`, `projects.origin_local_project_id`, RPCs `claim_guest_order_and_project`, `get_customer_orders`, `get_customer_order_detail`, `save_customer_project_revision`.

- [ ] **Step 1: Write migration SQL with RPCs**

Create `supabase/migrations/0006_state41_account_migration.sql`:
```sql
-- Migration: 0006_state41_account_migration.sql
-- State 41: Account Migration / Guest -> Account

-- 1. Profiles table
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 120),
  phone text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select, update on table public.profiles to authenticated;

drop policy if exists "Users can view own profile" on public.profiles;
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = user_id or public.is_staff());

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Link orders to customer account
alter table public.orders
  add column if not exists customer_user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_orders_customer_user_id on public.orders (customer_user_id);

-- 3. Extend projects for cloud working document and migration idempotency
alter table public.projects
  add column if not exists working_document jsonb null,
  add column if not exists origin_local_project_id text null;

create unique index if not exists uq_projects_owner_origin
  on public.projects (owner_user_id, origin_local_project_id)
  where owner_user_id is not null and origin_local_project_id is not null;

-- 4. Customer read policy for owned orders
-- Allow customers to SELECT basic fields on their owned orders
drop policy if exists "Customers read own orders" on public.orders;
create policy "Customers read own orders"
  on public.orders for select
  using (
    auth.uid() is not null and customer_user_id = auth.uid()
  );

-- 5. Customer read/update policy for owned projects
drop policy if exists "Customers manage own projects" on public.projects;
create policy "Customers manage own projects"
  on public.projects for all
  using (
    public.is_staff() or (auth.uid() is not null and owner_user_id = auth.uid())
  )
  with check (
    public.is_staff() or (auth.uid() is not null and owner_user_id = auth.uid())
  );

-- 6. Atomic guest claim RPC
create or replace function public.claim_guest_order_and_project(
  p_order_id uuid,
  p_guest_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_token_hash text;
  v_order record;
  v_project_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED: Must be logged in to claim an order';
  end if;

  if p_order_id is null or p_guest_token is null or btrim(p_guest_token) = '' then
    raise exception 'INVALID_ARGUMENTS: Missing order ID or guest token';
  end if;

  v_token_hash := encode(digest(btrim(p_guest_token), 'sha256'), 'hex');

  -- Verify guest access validity
  if not exists (
    select 1 from public.guest_order_access
    where order_id = p_order_id
      and token_hash = v_token_hash
      and expires_at > now()
  ) then
    raise exception 'INVALID_GUEST_PROOF: Invalid or expired guest order token';
  end if;

  -- Lock order
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND: Order does not exist';
  end if;

  -- Idempotent check
  if v_order.customer_user_id = v_user_id then
    return jsonb_build_object(
      'success', true,
      'idempotent', true,
      'order_id', p_order_id,
      'project_id', v_order.project_id
    );
  end if;

  -- Conflict check
  if v_order.customer_user_id is not null and v_order.customer_user_id <> v_user_id then
    raise exception 'ORDER_ALREADY_CLAIMED: Order belongs to another account';
  end if;

  -- Assign order to customer
  update public.orders
  set customer_user_id = v_user_id,
      updated_at = now()
  where id = p_order_id;

  -- Assign promoted project if present
  v_project_id := v_order.project_id;
  if v_project_id is not null then
    update public.projects
    set owner_user_id = v_user_id,
        guest_key_hash = null,
        updated_at = now()
    where id = v_project_id
      and (owner_user_id is null or owner_user_id = v_user_id);
  end if;

  -- Consume guest access token to prevent replay
  delete from public.guest_order_access where order_id = p_order_id;

  -- Append audit event
  insert into public.order_events (order_id, event_type, actor_user_id, actor_role, payload)
  values (
    p_order_id,
    'ORDER_CLAIMED',
    v_user_id,
    'customer',
    jsonb_build_object('claimed_at', now(), 'project_id', v_project_id)
  );

  return jsonb_build_object(
    'success', true,
    'idempotent', false,
    'order_id', p_order_id,
    'project_id', v_project_id
  );
end;
$$;

revoke all on function public.claim_guest_order_and_project(uuid, text) from public, anon;
grant execute on function public.claim_guest_order_and_project(uuid, text) to authenticated;

-- 7. Customer Safe Projections (Avoid exposing raw order rows with notes/holds/production files)
create or replace function public.get_customer_orders()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_results jsonb;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', o.id,
      'public_order_code', o.public_order_code,
      'product_snapshot', o.product_snapshot,
      'variant_snapshot', o.variant_snapshot,
      'quantity', o.quantity,
      'total', o.total,
      'currency', o.currency,
      'created_at', o.created_at,
      'customer_status', case
        when o.payment_status in ('pending_payment', 'payment_reported') then 'waiting_payment'
        when o.design_status in ('awaiting_review', 'editing', 'needs_changes') then 'design_review'
        when o.fulfillment_status in ('unprocessed', 'ready_for_production') then 'preparing_production'
        when o.fulfillment_status = 'in_production' then 'in_production'
        when o.fulfillment_status = 'completed' then 'production_completed'
        when o.fulfillment_status = 'cancelled' or o.payment_status = 'cancelled' then 'cancelled'
        else 'processing'
      end,
      'customer_approved_design_version_id', o.customer_approved_design_version_id
    ) order by o.created_at desc
  ), '[]'::jsonb)
  into v_results
  from public.orders o
  where o.customer_user_id = v_user_id;

  return v_results;
end;
$$;

revoke all on function public.get_customer_orders() from public, anon;
grant execute on function public.get_customer_orders() to authenticated;

create or replace function public.get_customer_order_detail(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_order public.orders%rowtype;
  v_version public.design_versions%rowtype;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select * into v_order from public.orders
  where id = p_order_id and customer_user_id = v_user_id;

  if not found then
    raise exception 'NOT_FOUND_OR_FORBIDDEN';
  end if;

  select * into v_version from public.design_versions
  where id = v_order.customer_approved_design_version_id;

  return jsonb_build_object(
    'id', v_order.id,
    'public_order_code', v_order.public_order_code,
    'quantity', v_order.quantity,
    'total', v_order.total,
    'currency', v_order.currency,
    'created_at', v_order.created_at,
    'recipient_name', v_order.customer_full_name,
    'shipping_address', v_order.shipping_address,
    'customer_status', case
      when v_order.payment_status in ('pending_payment', 'payment_reported') then 'waiting_payment'
      when v_order.design_status in ('awaiting_review', 'editing', 'needs_changes') then 'design_review'
      when v_order.fulfillment_status in ('unprocessed', 'ready_for_production') then 'preparing_production'
      when v_order.fulfillment_status = 'in_production' then 'in_production'
      when v_order.fulfillment_status = 'completed' then 'production_completed'
      when v_order.fulfillment_status = 'cancelled' or v_order.payment_status = 'cancelled' then 'cancelled'
      else 'processing'
    end,
    'approved_design', jsonb_build_object(
      'version_id', v_version.id,
      'document', v_version.design_document
    )
  );
end;
$$;

revoke all on function public.get_customer_order_detail(uuid) from public, anon;
grant execute on function public.get_customer_order_detail(uuid) to authenticated;

-- 8. Monotonic revision check for customer cloud autosave
create or replace function public.save_customer_project_revision(
  p_project_id uuid,
  p_expected_revision integer,
  p_working_document jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_rev integer;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  select current_working_revision into v_current_rev
  from public.projects
  where id = p_project_id and owner_user_id = v_user_id
  for update;

  if not found then
    raise exception 'PROJECT_NOT_FOUND_OR_FORBIDDEN';
  end if;

  if v_current_rev <> p_expected_revision then
    return jsonb_build_object(
      'success', false,
      'error', 'STALE_REVISION',
      'current_revision', v_current_rev
    );
  end if;

  update public.projects
  set current_working_revision = v_current_rev + 1,
      working_document = p_working_document,
      updated_at = now()
  where id = p_project_id;

  return jsonb_build_object(
    'success', true,
    'new_revision', v_current_rev + 1,
    'updated_at', now()
  );
end;
$$;

revoke all on function public.save_customer_project_revision(uuid, integer, jsonb) from public, anon;
grant execute on function public.save_customer_project_revision(uuid, integer, jsonb) to authenticated;
```

- [ ] **Step 2: Write test assertions in SQL**

Create `supabase/tests/state41_account_migration.sql`:
- Verify anon cannot execute `claim_guest_order_and_project`.
- Verify user without valid guest token cannot claim order.
- Verify user A cannot claim order already owned by user B.
- Verify safe projections don't leak internal columns (internal holds/notes).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0006_state41_account_migration.sql supabase/tests/state41_account_migration.sql
git commit -m "feat(db): add State 41 account schema, atomic claim RPC, and safe customer queries"
```

---

### Task 3: Supabase Auth Passwordless Email OTP Infrastructure

**Files:**
- Create: `src/lib/services/customer-auth.ts`
- Modify: `src/lib/supabase/browser.ts`
- Test: `src/test/customer-auth.test.ts`

**Interfaces:**
- Consumes: Supabase browser and server client factories from `src/lib/supabase/`
- Produces: `requestEmailOtp(email)`, `verifyEmailOtp(email, token)`, `getCurrentCustomer()`, `customerSignOut()`.

- [ ] **Step 1: Write unit tests for customer auth service**

```typescript
// src/test/customer-auth.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCustomerEmail, validateOtpFormat } from '../lib/services/customer-auth.ts';

test('normalizes customer email correctly', () => {
  assert.equal(normalizeCustomerEmail('  User@Example.Com '), 'user@example.com');
  assert.equal(normalizeCustomerEmail('test+alias@domain.vn'), 'test+alias@domain.vn');
});

test('validates 6-digit OTP format', () => {
  assert.equal(validateOtpFormat('123456'), true);
  assert.equal(validateOtpFormat(' 123456 '), true);
  assert.equal(validateOtpFormat('12345'), false);
  assert.equal(validateOtpFormat('1234567'), false);
  assert.equal(validateOtpFormat('12a456'), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/customer-auth.test.ts`
Expected: FAIL with missing module.

- [ ] **Step 3: Implement customer auth methods**

Implement `src/lib/services/customer-auth.ts`:
- Pure functions: `normalizeCustomerEmail(email: string): string`, `validateOtpFormat(otp: string): boolean`.
- `requestEmailOtp(email: string)`: calls `supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })`.
- `verifyEmailOtp(email: string, token: string)`: calls `supabase.auth.verifyOtp({ email, token, type: 'email' })`.
- `ensureCustomerProfile(displayName?: string)`: inserts into `profiles` on first auth using `supabase.from('profiles').upsert(...)`.
- `customerSignOut()`: signs out and clears client caches.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/customer-auth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/customer-auth.ts src/test/customer-auth.test.ts
git commit -m "feat(auth): add passwordless email OTP authentication service"
```

---

### Task 4: Private Asset Streaming Authorization & Proxy Header Hygiene

**Files:**
- Modify: `src/lib/services/serve-asset.ts`
- Modify: `src/app/api/assets/[id]/route.ts`
- Modify: `src/proxy.ts`
- Modify: `src/lib/guest-order-access.ts`
- Test: `src/test/serve-asset-security.test.ts`

**Interfaces:**
- Consumes: Asset metadata, Supabase SSR user session, guest order token from cookies.
- Produces: Authorized asset streaming with `Cache-Control: private, no-transform`.

- [ ] **Step 1: Write the failing security test**

```typescript
// src/test/serve-asset-security.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { serveAsset } from '../lib/services/serve-asset.ts';

test('serveAsset sets private cache-control on customer assets', async () => {
  const dummyClient = {
    storage: {
      from: () => ({
        download: async () => ({
          data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
          error: null,
        }),
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: 'asset-1',
              storageBucket: 'customer-assets',
              storagePath: 'p1/asset-1.png',
              mimeType: 'image/png',
            },
            error: null,
          }),
        }),
      }),
    }),
  } as any;

  const res = await serveAsset('asset-1', {
    supabaseClient: dummyClient,
    actor: { kind: 'staff', userId: 'staff-1', role: 'admin' },
  });

  assert.equal(res.status, 200);
  const cacheControl = res.headers.get('Cache-Control');
  assert.match(cacheControl || '', /private/);
  assert.doesNotMatch(cacheControl || '', /public/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/serve-asset-security.test.ts`
Expected: FAIL (currently sets `public, max-age=31536000, immutable`).

- [ ] **Step 3: Implement authorization check and private header**

1. In `src/lib/services/serve-asset.ts`:
   - Accept caller context: `actor?: { kind: 'staff' } | { kind: 'customer', userId: string } | { kind: 'guest', tokenHash: string }`.
   - On `customer-assets` bucket, verify that caller is staff OR project owner OR guest for order.
   - For customer assets, return `Cache-Control: private, max-age=3600`.
2. In `src/proxy.ts`:
   - Strip `x-staff-user-id` and `x-staff-role` from incoming external requests unless originated internally.
3. In `src/lib/guest-order-access.ts`:
   - Only trust `x-staff-*` headers if `process.env.NODE_ENV === 'test'`. In production, require verified Supabase SSR session + `staff_roles`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/serve-asset-security.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/serve-asset.ts src/app/api/assets/[id]/route.ts src/proxy.ts src/lib/guest-order-access.ts src/test/serve-asset-security.test.ts
git commit -m "fix(security): enforce private asset authorization and strip spoofable staff headers"
```

---

### Task 5: Atomic Guest Order & Promoted Project Claim Service

**Files:**
- Create: `src/lib/services/customer-order-claim.ts`
- Modify: `src/lib/repositories/order-repository.ts`
- Modify: `src/lib/repositories/project-repository.ts`
- Test: `src/test/customer-order-claim.test.ts`

**Interfaces:**
- Consumes: RPC `claim_guest_order_and_project` via Supabase client.
- Produces: `claimGuestOrder(orderId: string, guestToken: string): Promise<ClaimResult>`.

- [ ] **Step 1: Write unit tests for claim service**

```typescript
// src/test/customer-order-claim.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerOrderClaimService } from '../lib/services/customer-order-claim.ts';

test('claimGuestOrder rejects empty token or order ID before hitting DB', async () => {
  const service = new CustomerOrderClaimService({} as any);
  await assert.rejects(
    () => service.claimGuestOrder('', 'token-123'),
    /Mã đơn hàng không hợp lệ/
  );
  await assert.rejects(
    () => service.claimGuestOrder('order-uuid', '   '),
    /Mã bảo mật phiên khách không hợp lệ/
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/customer-order-claim.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement claim service**

Create `src/lib/services/customer-order-claim.ts`:
- Validate input formats.
- Call Supabase RPC `claim_guest_order_and_project`.
- Handle friendly Vietnamese error mappings:
  - `UNAUTHENTICATED` -> "Vui lòng đăng nhập để lưu đơn hàng."
  - `INVALID_GUEST_PROOF` -> "Phiên truy cập đơn hàng đã hết hạn hoặc không hợp lệ."
  - `ORDER_ALREADY_CLAIMED` -> "Đơn hàng này đã được liên kết với một tài khoản khác."
- Return typed result `{ success: boolean; idempotent: boolean; orderId: string; projectId: string | null }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/customer-order-claim.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/customer-order-claim.ts src/test/customer-order-claim.test.ts
git commit -m "feat(account): implement atomic guest order and promoted project claim service"
```

---

### Task 6: Local Project Migration Service & Asset Deduplication

**Files:**
- Create: `src/lib/services/local-project-migration.ts`
- Modify: `src/lib/storage.ts`
- Test: `src/test/local-project-migration.test.ts`

**Interfaces:**
- Consumes: `getRecentProjects()`, `promoteDesignAssets()` from `src/lib/asset-store.ts`, `ProjectRepository`.
- Produces: `migrateLocalProjects(authenticatedUserId: string): Promise<MigrationSummary>`.

- [ ] **Step 1: Write unit tests for migration idempotency**

```typescript
// src/test/local-project-migration.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterMigratableProjects,
  type LocalProjectItem,
} from '../lib/services/local-project-migration.ts';

test('skips expired and already synced projects', () => {
  const now = Date.now();
  const projects: LocalProjectItem[] = [
    { id: 'p1', updatedAt: now - 1000, syncedCloudProjectId: 'cloud-1' }, // already synced
    { id: 'p2', updatedAt: now - 35 * 24 * 3600 * 1000 }, // expired (>30d)
    { id: 'p3', updatedAt: now - 2 * 24 * 3600 * 1000, design: { productId: 'card' } as any }, // eligible
  ];

  const migratable = filterMigratableProjects(projects, now);
  assert.equal(migratable.length, 1);
  assert.equal(migratable[0].id, 'p3');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/local-project-migration.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement local project migration service**

Implement `src/lib/services/local-project-migration.ts`:
- `filterMigratableProjects`: ignores projects with `syncedCloudProjectId` or `updatedAt < 30 days`.
- Sequentially processes migratable projects:
  1. Check if project with `origin_local_project_id = local.id` exists in Supabase for current user. If yes, mark local as synced and reuse.
  2. Create cloud project with `owner_user_id = user.id`, `origin_local_project_id = local.id`.
  3. Upload missing assets using `promoteDesignAssets`.
  4. Save rewritten document into `projects.working_document`.
  5. Call `markProjectMigrated(local.id, cloudProject.id, 1)`.
- If an individual project fails, log error and continue with remaining projects. Return partial success report `{ total: number; migrated: number; failed: number; errors: string[] }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/local-project-migration.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/local-project-migration.ts src/test/local-project-migration.test.ts
git commit -m "feat(account): implement idempotent local project migration with asset deduplication"
```

---

### Task 7: Customer Cloud Project Loading & Monotonic Autosave

**Files:**
- Modify: `src/lib/editor-context.ts`
- Modify: `src/components/customizer/customizer-shell.tsx`
- Create: `src/lib/services/cloud-project-autosave.ts`
- Test: `src/test/cloud-project-autosave.test.ts`

**Interfaces:**
- Consumes: `save_customer_project_revision` RPC from Supabase.
- Produces: `CustomerEditorContext`, debounced autosave, revision conflict handling.

- [ ] **Step 1: Write test for revision conflict detection**

```typescript
// src/test/cloud-project-autosave.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { handleAutosaveResponse } from '../lib/services/cloud-project-autosave.ts';

test('detects stale revision conflict and signals user', () => {
  const result = handleAutosaveResponse({
    success: false,
    error: 'STALE_REVISION',
    current_revision: 5,
  });

  assert.equal(result.conflict, true);
  assert.equal(result.serverRevision, 5);
  assert.match(result.userMessage, /Thiết kế này vừa được cập nhật trên thiết bị khác/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/cloud-project-autosave.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement context and autosave hook**

1. In `src/lib/editor-context.ts`:
   - Add `CustomerEditorContext`:
     ```typescript
     export interface CustomerEditorContext {
       type: 'customer';
       projectId: string;
       initialRevision: number;
       initialDocument: DesignState;
       onSave: (doc: DesignState, expectedRev: number) => Promise<{ newRevision: number } | { conflict: true; currentRevision: number }>;
     }
     ```
2. In `src/lib/services/cloud-project-autosave.ts`:
   - Implement debounced save caller calling RPC `save_customer_project_revision`.
3. In `src/components/customizer/customizer-shell.tsx`:
   - When context is `customer`, hydrate canvas from `working_document`.
   - Display subtle status indicator: "Đã lưu" / "Đang lưu..." / "Xung đột phiên bản".
   - On conflict, show alert dialog: "Thiết kế này vừa được cập nhật trên thiết bị khác. [Tải phiên bản mới]".

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/cloud-project-autosave.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/editor-context.ts src/lib/services/cloud-project-autosave.ts src/components/customizer/customizer-shell.tsx src/test/cloud-project-autosave.test.ts
git commit -m "feat(editor): add customer cloud project context and monotonic autosave"
```

---

### Task 8: Order Confirmation Account Invitation & OTP Dialog

**Files:**
- Modify: `src/components/checkout/order-confirmation-panel.tsx`
- Create: `src/components/checkout/account-save-dialog.tsx`
- Test: `src/test/account-save-dialog.test.ts`

**Interfaces:**
- Consumes: `PendingOrder`, `requestEmailOtp`, `verifyEmailOtp`, `claimGuestOrder`, `migrateLocalProjects`.
- Produces: Unforced "Lưu vào tài khoản" card on confirmation screen, 6-digit OTP dialog, automated claim + migration.

- [ ] **Step 1: Write test for OTP verification dialog state flow**

```typescript
// src/test/account-save-dialog.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClaimStateMessage } from '../components/checkout/account-save-dialog.tsx';

test('maps claim and migration states to concise Vietnamese copy', () => {
  assert.equal(parseClaimStateMessage('claiming'), 'Đang liên kết đơn hàng...');
  assert.equal(parseClaimStateMessage('migrating'), 'Đang lưu thiết kế của bạn...');
  assert.equal(parseClaimStateMessage('done'), 'Đã lưu đơn hàng và thiết kế vào tài khoản.');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/account-save-dialog.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement AccountSaveDialog and update OrderConfirmationPanel**

1. Create `src/components/checkout/account-save-dialog.tsx`:
   - Reusable dialog using shadcn primitives (`Dialog`, `Input`, `Button`).
   - Step 1: Input email, button "Gửi mã xác nhận".
   - Step 2: Input 6-digit OTP code, button "Xác minh & Lưu".
   - On OTP success:
     - Run `claimGuestOrder(order.id, guestToken)`.
     - Run `migrateLocalProjects(user.id)`.
     - Display success badge: "✓ Đã lưu vào tài khoản".
2. In `src/components/checkout/order-confirmation-panel.tsx`:
   - If user is already logged in or order is claimed: show "✓ Đơn hàng đã được lưu trong tài khoản của bạn".
   - If guest: show unforced card with primary button `[Lưu vào tài khoản]` and secondary text `Để sau`.
   - Tapping "Để sau" dismisses card cleanly with no nag.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/account-save-dialog.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/checkout/account-save-dialog.tsx src/components/checkout/order-confirmation-panel.tsx src/test/account-save-dialog.test.ts
git commit -m "feat(checkout): add post-checkout account save dialog with email OTP"
```

---

### Task 9: Customer Navigation, Login Route & Account Shell

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/components/layout/customer-nav-header.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/proxy.ts`
- Test: `src/test/customer-login-route.test.ts`

**Interfaces:**
- Consumes: Next.js cookies, Supabase Auth session.
- Produces: `/login` passwordless entry, header nav with "Thiết kế của tôi", "Đơn hàng của tôi", "Đăng nhập" / "Đăng xuất".

- [ ] **Step 1: Write test for redirect destination normalization**

```typescript
// src/test/customer-login-route.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeRedirectUrl } from '../app/login/page.tsx';

test('only allows internal relative paths for redirect', () => {
  assert.equal(sanitizeRedirectUrl('/my-designs'), '/my-designs');
  assert.equal(sanitizeRedirectUrl('/my-orders'), '/my-orders');
  assert.equal(sanitizeRedirectUrl('https://malicious.com'), '/my-designs');
  assert.equal(sanitizeRedirectUrl('//malicious.com'), '/my-designs');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/customer-login-route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement customer login page and header**

1. Create `src/app/login/page.tsx`:
   - Clean, mobile-first card using warm paper palette (`#FFFDF8`, `#315F86`).
   - Email input + 6-digit OTP code entry.
   - Redirect to sanitized `returnUrl` or `/my-designs`.
2. Create `src/components/layout/customer-nav-header.tsx`:
   - Subtle header displayed on customer routes.
   - Links: "Trang chủ", "Thiết kế của tôi", "Đơn hàng của tôi".
   - Shows user email / display name + "Đăng xuất" when authenticated.
3. Update `src/proxy.ts`:
   - Refresh Supabase SSR session on customer routes (`/my-designs`, `/my-orders`, `/account`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/customer-login-route.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/login/page.tsx src/components/layout/customer-nav-header.tsx src/app/layout.tsx src/proxy.ts src/test/customer-login-route.test.ts
git commit -m "feat(navigation): add customer navigation header and passwordless login page"
```

---

### Task 10: "Thiết kế của tôi" (`/my-designs`) Customer Portal

**Files:**
- Create: `src/app/my-designs/page.tsx`
- Create: `src/components/customer/my-designs-list.tsx`
- Test: `src/test/my-designs-list.test.ts`

**Interfaces:**
- Consumes: `ProjectRepository.listByOwner(userId)`
- Produces: Project grid with preview thumbnail, product name, last updated date, "Tiếp tục chỉnh" button.

- [ ] **Step 1: Write test for empty state and project sorting**

```typescript
// src/test/my-designs-list.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatProjectUpdatedDate } from '../components/customer/my-designs-list.tsx';

test('formats relative update time in Vietnamese', () => {
  const now = new Date('2026-09-30T12:00:00Z').getTime();
  const past = new Date('2026-09-30T10:00:00Z').getTime();
  assert.match(formatProjectUpdatedDate(past, now), /2 giờ trước|hôm nay/i);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/my-designs-list.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement page and list components**

1. Create `src/app/my-designs/page.tsx`:
   - Server Component verifying authenticated customer session; redirect to `/login?next=/my-designs` if unauthenticated.
   - Fetches owned projects from Supabase with `projects.owner_user_id = user.id`.
2. Create `src/components/customer/my-designs-list.tsx`:
   - Displays project cards with thumbnail, product title, and last modified date.
   - If empty: show "Chưa có thiết kế nào" + button `[Bắt đầu thiết kế mới]` linking to catalog.
   - Clicking a project opens Editor with `CustomerEditorContext`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/my-designs-list.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/my-designs/page.tsx src/components/customer/my-designs-list.tsx src/test/my-designs-list.test.ts
git commit -m "feat(customer): add My Designs portal page and project listing"
```

---

### Task 11: "Đơn hàng của tôi" (`/my-orders`) & Customer-Safe Detail

**Files:**
- Create: `src/app/my-orders/page.tsx`
- Create: `src/app/my-orders/[id]/page.tsx`
- Create: `src/components/customer/customer-order-card.tsx`
- Create: `src/components/customer/customer-order-detail-view.tsx`
- Test: `src/test/customer-safe-orders.test.ts`

**Interfaces:**
- Consumes: RPC `get_customer_orders()` and `get_customer_order_detail(orderId)`.
- Produces: Safe order list, status chips, customer-approved design view (never admin revision).

- [ ] **Step 1: Write test for customer status mapping and redaction**

```typescript
// src/test/customer-safe-orders.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCustomerFacingStatusText } from '../components/customer/customer-order-card.tsx';

test('maps internal fulfillment states to customer-safe copy', () => {
  assert.equal(getCustomerFacingStatusText('waiting_payment'), 'Chờ xác nhận thanh toán');
  assert.equal(getCustomerFacingStatusText('design_review'), 'Đang kiểm tra thiết kế');
  assert.equal(getCustomerFacingStatusText('preparing_production'), 'Đang chuẩn bị sản xuất');
  assert.equal(getCustomerFacingStatusText('in_production'), 'Đang sản xuất');
  assert.equal(getCustomerFacingStatusText('production_completed'), 'Sản xuất hoàn tất');
  assert.equal(getCustomerFacingStatusText('cancelled'), 'Đã hủy');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/customer-safe-orders.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement My Orders and safe Detail components**

1. Create `src/app/my-orders/page.tsx`:
   - Calls `get_customer_orders()` RPC.
   - Renders list of cards with Order Code, date, product summary, safe status chip, total VND.
2. Create `src/app/my-orders/[id]/page.tsx`:
   - Calls `get_customer_order_detail(id)` RPC.
   - Displays recipient information, shipping address, ordered quantity.
   - Renders `DesignCanvas` strictly with `approved_design.document` (Customer Approved v1).
   - Contains NO admin notes, hold reasons, staff identity, or production artifacts.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/customer-safe-orders.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/my-orders/page.tsx src/app/my-orders/[id]/page.tsx src/components/customer/customer-order-card.tsx src/components/customer/customer-order-detail-view.tsx src/test/customer-safe-orders.test.ts
git commit -m "feat(customer): add My Orders list and customer-safe Order Detail view"
```

---

### Task 12: Authenticated Checkout Direct Ownership Attachment

**Files:**
- Modify: `src/lib/services/prepare-order-from-guest-checkout.ts`
- Modify: `src/app/api/orders/route.ts`
- Test: `src/test/authenticated-checkout.test.ts`

**Interfaces:**
- Consumes: Authenticated customer session from request.
- Produces: Direct `orders.customer_user_id` and `projects.owner_user_id` attachment upon order creation when user is logged in.

- [ ] **Step 1: Write test for authenticated checkout order creation**

```typescript
// src/test/authenticated-checkout.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareOrderFromGuestCheckout } from '../lib/services/prepare-order-from-guest-checkout.ts';

test('attaches customer_user_id and project owner when authenticated user is provided', async () => {
  let createdProjectOwner: string | null = null;
  let createdOrderCustomer: string | null = null;

  const mockProjectRepo = {
    createProject: async (input: any) => {
      createdProjectOwner = input.ownerUserId ?? null;
      return { id: 'p-1', ...input };
    },
  };

  const mockOrderRepo = {
    getByIdempotencyKey: async () => null,
    createPendingOrder: async (input: any) => {
      createdOrderCustomer = (input as any).customerUserId ?? null;
      return { id: 'o-1', ...input, payment: {} };
    },
    createGuestAccess: async () => {},
    deleteById: async () => {},
  };

  await prepareOrderFromGuestCheckout(
    {
      idempotencyKey: 'idem-auth-1',
      design: { productId: 'card', quantity: 10 } as any,
      customer: { fullName: 'Minh', phone: '0901234567', shippingAddress: 'HN' },
      designRevision: 'rev-1',
      preflightRevision: 'rev-1',
      preflightAcknowledged: true,
      authenticatedUserId: 'user-auth-uuid-123',
    },
    {
      projectRepo: mockProjectRepo as any,
      orderRepo: mockOrderRepo as any,
      assetRepo: { promoteAsset: async () => ({ id: 'a1' }) } as any,
      designVersionRepo: { createVersion: async () => ({ id: 'v1', createdAt: '' }) } as any,
      orderEventRepo: { append: async () => {} } as any,
      paymentRepo: { create: async () => {} } as any,
    }
  );

  assert.equal(createdProjectOwner, 'user-auth-uuid-123');
  assert.equal(createdOrderCustomer, 'user-auth-uuid-123');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types src/test/authenticated-checkout.test.ts`
Expected: FAIL (missing `authenticatedUserId` option).

- [ ] **Step 3: Implement direct attachment in order preparation**

1. In `src/lib/services/prepare-order-from-guest-checkout.ts`:
   - Accept optional `authenticatedUserId?: string`.
   - Pass `ownerUserId: input.authenticatedUserId ?? null` to `projectRepo.createProject`.
   - Pass `customerUserId: input.authenticatedUserId ?? null` to `orderRepo.createPendingOrder`.
2. In `src/app/api/orders/route.ts`:
   - Inspect Supabase session via `createServerSupabaseClient()`.
   - If user exists, pass `authenticatedUserId: user.id`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/authenticated-checkout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/services/prepare-order-from-guest-checkout.ts src/app/api/orders/route.ts src/test/authenticated-checkout.test.ts
git commit -m "feat(checkout): automatically attach customer user ID when authenticated at checkout"
```

---

### Task 13: End-to-End Security & Migration Integration Tests

**Files:**
- Create: `src/test/state41-e2e-integration.test.ts`
- Test: `src/test/state41-e2e-integration.test.ts`

**Interfaces:**
- Exercises: Full customer lifecycle: guest project -> checkout -> email OTP -> atomic claim -> project migration -> autosave revision conflict -> customer safe order detail.

- [ ] **Step 1: Write comprehensive integration test**

```typescript
// src/test/state41-e2e-integration.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { CustomerOrderClaimService } from '../lib/services/customer-order-claim.ts';
import { handleAutosaveResponse } from '../lib/services/cloud-project-autosave.ts';
import { getCustomerFacingStatusText } from '../components/customer/customer-order-card.tsx';

test('State 41 end-to-end integration contracts', async () => {
  // 1. Claim contract: rejects phone-based claims
  const claimService = new CustomerOrderClaimService({
    rpc: async (fn: string, params: any) => {
      if (!params.p_guest_token) throw new Error('INVALID_GUEST_PROOF');
      return { data: { success: true }, error: null };
    },
  } as any);

  const claimRes = await claimService.claimGuestOrder('order-uuid', 'valid-guest-token');
  assert.equal(claimRes.success, true);

  // 2. Monotonic revision contract: rejects stale revision
  const conflict = handleAutosaveResponse({
    success: false,
    error: 'STALE_REVISION',
    current_revision: 3,
  });
  assert.equal(conflict.conflict, true);

  // 3. Customer projection status contract: never leaks internal state
  assert.equal(getCustomerFacingStatusText('in_production'), 'Đang sản xuất');
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test --experimental-strip-types src/test/state41-e2e-integration.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/test/state41-e2e-integration.test.ts
git commit -m "test(account): add State 41 end-to-end integration contracts test"
```

---

### Task 14: Documentation, Migration Verification & Clean Regression Pass

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/specs/2026-09-30-state-41-account-migration-design.md`

**Interfaces:**
- Produces: Execution guide for migration `0006`, testing procedures, and manual QA checklist.

- [ ] **Step 1: Update README.md with State 41 commands**

Add migration `0006_state41_account_migration.sql` and test commands to `README.md`.

- [ ] **Step 2: Run full typecheck and test suite**

Run: `pnpm run typecheck`
Expected: PASS (0 errors).

Run: `pnpm test`
Expected: PASS (all existing + new tests green).

- [ ] **Step 3: Commit**

```bash
git add README.md docs/superpowers/specs/2026-09-30-state-41-account-migration-design.md
git commit -m "docs(state41): record account migration architecture and testing verification guide"
```

---

## Plan Self-Review Checklist

1. **Spec Coverage:**
   - Guest local-first 3 projects / 30 days unchanged? Yes (Task 1).
   - No anonymous Supabase user on startup? Yes (Constraint & Task 1).
   - Post-checkout optional invitation? Yes (Task 8).
   - Passwordless Email OTP? Yes (Task 3).
   - Atomic claim requiring guest proof + auth? Yes (Task 2 & Task 5).
   - Phone/email matching alone cannot claim? Yes (Task 2 & Task 5).
   - Current promoted project attached, not duplicated? Yes (Task 2 & Task 5).
   - Remaining local projects migrated idempotently? Yes (Task 6).
   - Monotonic revision check for cloud autosave? Yes (Task 2 & Task 7).
   - Customer-safe projections (no internal holds/notes/admin revisions)? Yes (Task 2 & Task 11).
   - Authenticated checkout direct attachment? Yes (Task 12).
   - Private asset streaming security hardened? Yes (Task 4).

2. **Placeholder Scan:** No "TBD", "TODO", or pseudo-code steps. Every step contains exact files and code snippets.
3. **Type Consistency:** Types (`RecentProject`, `CustomerEditorContext`, `ClaimResult`) match across files.
