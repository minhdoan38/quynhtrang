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
set search_path = public, extensions, pg_temp
as $$
declare
  v_user_id uuid;
  v_token_hash text;
  v_order record;
  v_project_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('success', false, 'error', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập tài khoản');
  end if;

  if p_order_id is null or p_guest_token is null or btrim(p_guest_token) = '' then
    return jsonb_build_object('success', false, 'error', 'INVALID_ARGUMENTS', 'message', 'Thiếu mã đơn hàng hoặc token khách');
  end if;

  v_token_hash := encode(digest(btrim(p_guest_token), 'sha256'), 'hex');

  -- Verify guest access validity
  if not exists (
    select 1 from public.guest_order_access
    where order_id = p_order_id
      and token_hash = v_token_hash
      and expires_at > now()
  ) then
    return jsonb_build_object('success', false, 'error', 'INVALID_GUEST_PROOF', 'message', 'Mã xác thực khách không hợp lệ hoặc đã hết hạn');
  end if;

  -- Lock order
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND', 'message', 'Đơn hàng không tồn tại');
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
    return jsonb_build_object('success', false, 'error', 'ORDER_ALREADY_CLAIMED', 'message', 'Đơn hàng này đã được liên kết với một tài khoản khác');
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
    'order_claimed',
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
set search_path = public, extensions, pg_temp
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
set search_path = public, extensions, pg_temp
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
set search_path = public, extensions, pg_temp
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
