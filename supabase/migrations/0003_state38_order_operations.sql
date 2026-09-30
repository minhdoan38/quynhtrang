-- Migration: 0003_state38_order_operations.sql
-- State 38: Admin Order Detail + Payment Confirmation & Atomic Operations

-- 1. Schema Extensions
alter table public.design_versions
  add column if not exists approved_thumbnail_path text null;

alter table public.staff_roles
  add column if not exists display_name text not null default 'Nhân viên';

-- 2. Order Holds table
create table if not exists public.order_holds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  held_by uuid not null references auth.users(id),
  held_at timestamptz not null default now(),
  released_by uuid null references auth.users(id),
  released_at timestamptz null,
  check ((released_by is null) = (released_at is null))
);

create unique index if not exists order_holds_one_active_per_order
  on public.order_holds(order_id)
  where released_at is null;

create index if not exists order_holds_order_history
  on public.order_holds(order_id, held_at desc);

-- 3. Grants and RLS for order_holds
alter table public.order_holds enable row level security;

revoke all on table public.order_holds from public, anon, authenticated;

grant select on table public.order_holds to authenticated;

drop policy if exists "Allow staff read order holds" on public.order_holds;
create policy "Allow staff read order holds"
  on public.order_holds for select
  using (public.is_staff());

-- 4. Revoke direct write privileges from authenticated on operational tables
revoke insert, update, delete on table
  public.orders,
  public.order_payments,
  public.order_holds,
  public.order_events
from public, anon, authenticated;

-- Drop State 37 direct write policies
drop policy if exists "Allow admin update orders" on public.orders;
drop policy if exists "Allow admin insert order payments" on public.order_payments;
drop policy if exists "Allow admin update order payments" on public.order_payments;
drop policy if exists "Allow staff insert order events" on public.order_events;

-- 5. Atomic Operation: confirm_order_payment
create or replace function public.confirm_order_payment(
  p_order_id uuid,
  p_expected_state text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text;
  v_order record;
  v_payment record;
begin
  -- 1. Validate auth.uid() and Admin role
  if auth.uid() is null then
    return jsonb_build_object('code', 'forbidden');
  end if;

  select role into v_caller_role
  from public.staff_roles
  where user_id = auth.uid();

  if v_caller_role is null or v_caller_role <> 'admin' then
    return jsonb_build_object('code', 'forbidden');
  end if;

  -- 2. Lock orders and matching order_payments with FOR UPDATE
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('code', 'not_found');
  end if;

  select * into v_payment
  from public.order_payments
  where order_id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('code', 'not_found');
  end if;

  -- 4. Reject orders.fulfillment_status = 'cancelled' or payment_status = 'cancelled'
  if v_order.fulfillment_status = 'cancelled' or v_order.payment_status = 'cancelled' then
    return jsonb_build_object('code', 'cancelled');
  end if;

  -- 5. If payment already paid, return already_paid with current safe state
  if v_payment.status = 'paid' then
    return jsonb_build_object(
      'code', 'already_paid',
      'order_id', p_order_id,
      'payment_status', 'paid'
    );
  end if;

  -- 6. Permit only current pending_payment or payment_reported
  if v_payment.status not in ('pending_payment', 'payment_reported') then
    return jsonb_build_object('code', 'state_conflict');
  end if;

  -- 7. Require current status equals p_expected_state; otherwise return state_conflict
  if v_payment.status <> p_expected_state then
    return jsonb_build_object('code', 'state_conflict');
  end if;

  -- 8. Set payment row status='paid', confirmed_at=clock_timestamp(), confirmed_by=auth.uid()
  update public.order_payments
  set
    status = 'paid',
    confirmed_at = clock_timestamp(),
    confirmed_by = auth.uid(),
    updated_at = clock_timestamp()
  where id = v_payment.id;

  -- 9. Set orders.payment_status='paid', orders.updated_at=clock_timestamp()
  update public.orders
  set
    payment_status = 'paid',
    updated_at = clock_timestamp()
  where id = p_order_id;

  -- 10. Insert exactly one order_events row
  insert into public.order_events (
    order_id,
    event_type,
    actor_user_id,
    actor_role,
    payload,
    created_at
  )
  values (
    p_order_id,
    'payment_confirmed',
    auth.uid(),
    'admin',
    jsonb_build_object(
      'payment_id', v_payment.id,
      'amount', v_payment.amount,
      'previous_status', v_payment.status,
      'resulting_status', 'paid'
    ),
    clock_timestamp()
  );

  -- 11. Return confirmed code
  return jsonb_build_object(
    'code', 'confirmed',
    'order_id', p_order_id,
    'payment_status', 'paid'
  );
end;
$$;

alter function public.confirm_order_payment(uuid, text) set search_path = '';
revoke all on function public.confirm_order_payment(uuid, text) from public, anon;
grant execute on function public.confirm_order_payment(uuid, text) to authenticated;

-- 6. Atomic Operation: hold_order
create or replace function public.hold_order(
  p_order_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text;
  v_order record;
  v_trimmed_reason text;
  v_hold_id uuid;
begin
  -- 1. Validate auth.uid() and Admin role
  if auth.uid() is null then
    return jsonb_build_object('code', 'forbidden');
  end if;

  select role into v_caller_role
  from public.staff_roles
  where user_id = auth.uid();

  if v_caller_role is null or v_caller_role <> 'admin' then
    return jsonb_build_object('code', 'forbidden');
  end if;

  -- Validate reason length
  v_trimmed_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_trimmed_reason) < 3 or char_length(v_trimmed_reason) > 500 then
    return jsonb_build_object('code', 'validation_error', 'message', 'Lý do phải từ 3 đến 500 ký tự');
  end if;

  -- Lock order
  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    return jsonb_build_object('code', 'not_found');
  end if;

  -- Reject cancelled or completed orders
  if v_order.fulfillment_status in ('cancelled', 'completed') or v_order.payment_status = 'cancelled' then
    return jsonb_build_object('code', 'cancelled');
  end if;

  -- Check existing active hold
  if exists (
    select 1 from public.order_holds
    where order_id = p_order_id and released_at is null
  ) then
    return jsonb_build_object('code', 'state_conflict', 'message', 'Đơn hàng đang có tạm giữ hiệu lực');
  end if;

  -- Insert active hold
  insert into public.order_holds (
    order_id,
    reason,
    held_by,
    held_at
  )
  values (
    p_order_id,
    v_trimmed_reason,
    auth.uid(),
    clock_timestamp()
  )
  returning id into v_hold_id;

  -- Update order timestamp
  update public.orders
  set updated_at = clock_timestamp()
  where id = p_order_id;

  -- Append event
  insert into public.order_events (
    order_id,
    event_type,
    actor_user_id,
    actor_role,
    payload,
    created_at
  )
  values (
    p_order_id,
    'order_held',
    auth.uid(),
    'admin',
    jsonb_build_object(
      'hold_id', v_hold_id,
      'reason', v_trimmed_reason
    ),
    clock_timestamp()
  );

  return jsonb_build_object(
    'code', 'held',
    'hold_id', v_hold_id
  );
end;
$$;

alter function public.hold_order(uuid, text) set search_path = '';
revoke all on function public.hold_order(uuid, text) from public, anon;
grant execute on function public.hold_order(uuid, text) to authenticated;

-- 7. Atomic Operation: release_order_hold
create or replace function public.release_order_hold(
  p_order_id uuid,
  p_expected_hold_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_role text;
  v_hold record;
begin
  -- 1. Validate auth.uid() and Admin role
  if auth.uid() is null then
    return jsonb_build_object('code', 'forbidden');
  end if;

  select role into v_caller_role
  from public.staff_roles
  where user_id = auth.uid();

  if v_caller_role is null or v_caller_role <> 'admin' then
    return jsonb_build_object('code', 'forbidden');
  end if;

  -- Lock active hold
  select * into v_hold
  from public.order_holds
  where order_id = p_order_id
    and released_at is null
  for update;

  if not found then
    return jsonb_build_object('code', 'state_conflict', 'message', 'Không tìm thấy tạm giữ đang hiệu lực');
  end if;

  if v_hold.id <> p_expected_hold_id then
    return jsonb_build_object('code', 'state_conflict', 'message', 'Tạm giữ đã thay đổi');
  end if;

  -- Mark released
  update public.order_holds
  set
    released_by = auth.uid(),
    released_at = clock_timestamp()
  where id = v_hold.id;

  -- Update order timestamp
  update public.orders
  set updated_at = clock_timestamp()
  where id = p_order_id;

  -- Append event
  insert into public.order_events (
    order_id,
    event_type,
    actor_user_id,
    actor_role,
    payload,
    created_at
  )
  values (
    p_order_id,
    'order_hold_released',
    auth.uid(),
    'admin',
    jsonb_build_object(
      'hold_id', v_hold.id
    ),
    clock_timestamp()
  );

  return jsonb_build_object(
    'code', 'released',
    'hold_id', v_hold.id
  );
end;
$$;

alter function public.release_order_hold(uuid, uuid) set search_path = '';
revoke all on function public.release_order_hold(uuid, uuid) from public, anon;
grant execute on function public.release_order_hold(uuid, uuid) to authenticated;
