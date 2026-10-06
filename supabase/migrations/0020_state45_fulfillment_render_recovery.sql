-- Migration: 0020_state45_fulfillment_render_recovery.sql
-- State 45: Admin-only production transitions, atomic leased render claim, and stale-worker fencing

-- 1. Schema extension: record worker identity on render jobs
alter table public.design_render_jobs
  add column if not exists claimed_by text null;

create index if not exists design_render_jobs_reclaim_idx
  on public.design_render_jobs(status, claim_expires_at)
  where status = 'running';

-- 2. Atomic RPC: claim_next_render_job
create or replace function public.claim_next_render_job(
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns table (
  id uuid,
  version_id uuid,
  order_id uuid,
  attempts integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_id uuid;
begin
  -- Select and lock one pending/failed or expired running job
  select j.id into v_job_id
  from public.design_render_jobs j
  where (
    j.status in ('pending', 'failed')
    or (j.status = 'running' and j.claim_expires_at <= clock_timestamp())
  )
    and j.next_attempt_at <= clock_timestamp()
    and j.attempts < 3
  order by j.created_at asc
  for update skip locked
  limit 1;

  if v_job_id is null then
    return;
  end if;

  -- Atomically advance attempts token, assign worker lease, and set status to running
  return query
  update public.design_render_jobs
  set
    status = 'running',
    attempts = public.design_render_jobs.attempts + 1,
    claimed_by = p_worker_id,
    claim_expires_at = clock_timestamp() + (p_lease_seconds || ' seconds')::interval,
    updated_at = clock_timestamp()
  where public.design_render_jobs.id = v_job_id
  returning
    public.design_render_jobs.id,
    public.design_render_jobs.version_id,
    public.design_render_jobs.order_id,
    public.design_render_jobs.attempts;
end;
$$;

revoke all on function public.claim_next_render_job(text, integer) from public, anon;
grant execute on function public.claim_next_render_job(text, integer) to authenticated, service_role;

-- 3. Atomic RPC: start_order_production (Strict Admin-only, preserves 0018 deposit readiness)
create or replace function public.start_order_production(
  p_order_id uuid,
  p_expected_fulfillment_status text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_role text;
  v_order record;
  v_existing_req record;
  v_payment_satisfied boolean := false;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập');
  end if;

  select role into v_role from public.staff_roles where user_id = v_actor_id;
  if v_role is null or v_role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Chỉ Quản trị viên (Admin) mới có quyền đưa đơn hàng vào sản xuất');
  end if;

  -- Idempotency check
  select * into v_existing_req
  from public.design_revision_requests
  where actor_user_id = v_actor_id and operation = 'start_production' and request_id = p_request_id;
  if found then
    return v_existing_req.result_payload;
  end if;

  -- Lock Order
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND', 'message', 'Đơn hàng không tồn tại');
  end if;

  -- Check if already in production or completed
  if v_order.fulfillment_status = 'in_production' then
    return jsonb_build_object(
      'ok', true,
      'value', jsonb_build_object('orderId', p_order_id, 'fulfillmentStatus', 'in_production')
    );
  end if;

  if v_order.fulfillment_status <> 'unprocessed' and v_order.fulfillment_status <> 'ready_for_production' then
    return jsonb_build_object('ok', false, 'code', 'ORDER_LOCKED', 'message', 'Trạng thái đơn hàng không hợp lệ để đưa vào sản xuất');
  end if;

  if p_expected_fulfillment_status is not null and v_order.fulfillment_status <> p_expected_fulfillment_status then
    return jsonb_build_object('ok', false, 'code', 'STATE_CONFLICT', 'message', 'Trạng thái đơn hàng đã thay đổi');
  end if;

  -- Check payment satisfaction based on policy and status (0018 semantics preserved)
  if v_order.payment_status = 'paid' then
    v_payment_satisfied := true;
  elsif v_order.payment_status = 'deposit_confirmed' and (v_order.payment_policy->>'kind' = 'fixed_deposit') then
    v_payment_satisfied := true;
  end if;

  if not v_payment_satisfied then
    if (v_order.payment_policy->>'kind' = 'fixed_deposit') then
      return jsonb_build_object('ok', false, 'code', 'PAYMENT_REQUIRED', 'message', 'Tiền cọc chưa được xác nhận, không thể bắt đầu sản xuất');
    else
      return jsonb_build_object('ok', false, 'code', 'PAYMENT_REQUIRED', 'message', 'Đơn hàng chưa thanh toán, không thể bắt đầu sản xuất');
    end if;
  end if;

  -- Check design approved
  if v_order.design_status <> 'approved' then
    return jsonb_build_object('ok', false, 'code', 'DESIGN_NOT_APPROVED', 'message', 'Thiết kế chưa được duyệt, không thể bắt đầu sản xuất');
  end if;

  -- Check valid production design version
  if v_order.production_design_version_id is null then
    return jsonb_build_object('ok', false, 'code', 'DESIGN_VERSION_MISSING', 'message', 'Thiếu phiên bản thiết kế sản xuất');
  end if;

  -- Check no active hold
  if exists (select 1 from public.order_holds where order_id = p_order_id and released_at is null) then
    return jsonb_build_object('ok', false, 'code', 'ORDER_HELD', 'message', 'Đơn hàng đang bị tạm giữ, không thể bắt đầu sản xuất');
  end if;

  -- Check no active draft
  if exists (select 1 from public.design_revision_drafts where order_id = p_order_id and status in ('editing', 'ready_for_review')) then
    return jsonb_build_object('ok', false, 'code', 'ACTIVE_DRAFT_EXISTS', 'message', 'Đơn hàng đang có bản nháp chỉnh sửa dở dang');
  end if;

  -- Update order
  update public.orders
  set
    fulfillment_status = 'in_production',
    updated_at = clock_timestamp()
  where id = p_order_id;

  -- Append event with frozen production design version pointer
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
    'production_started',
    v_actor_id,
    'admin',
    jsonb_build_object(
      'production_version_id', v_order.production_design_version_id
    ),
    clock_timestamp()
  );

  -- Record request for idempotency
  insert into public.design_revision_requests (
    actor_user_id,
    operation,
    request_id,
    target_id,
    input_hash,
    result_payload
  )
  values (
    v_actor_id,
    'start_production',
    p_request_id,
    p_order_id,
    concat(p_order_id::text, ':start_production'),
    jsonb_build_object(
      'ok', true,
      'value', jsonb_build_object('orderId', p_order_id, 'fulfillmentStatus', 'in_production')
    )
  );

  return jsonb_build_object(
    'ok', true,
    'value', jsonb_build_object('orderId', p_order_id, 'fulfillmentStatus', 'in_production')
  );
end;
$$;

revoke all on function public.start_order_production(uuid, text, text) from public, anon;
grant execute on function public.start_order_production(uuid, text, text) to authenticated;

-- 4. Atomic RPC: complete_order_production (Strict Admin-only, requires in_production)
create or replace function public.complete_order_production(
  p_order_id uuid,
  p_expected_fulfillment_status text,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_role text;
  v_order record;
  v_existing_req record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập');
  end if;

  select role into v_role from public.staff_roles where user_id = v_actor_id;
  if v_role is null or v_role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Chỉ Quản trị viên (Admin) mới có quyền hoàn tất sản xuất');
  end if;

  -- Idempotency check
  select * into v_existing_req
  from public.design_revision_requests
  where actor_user_id = v_actor_id and operation = 'complete_production' and request_id = p_request_id;
  if found then
    return v_existing_req.result_payload;
  end if;

  -- Lock Order
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND', 'message', 'Đơn hàng không tồn tại');
  end if;

  if v_order.fulfillment_status = 'completed' then
    return jsonb_build_object(
      'ok', true,
      'value', jsonb_build_object('orderId', p_order_id, 'fulfillmentStatus', 'completed')
    );
  end if;

  if v_order.fulfillment_status <> 'in_production' then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_IN_PRODUCTION', 'message', 'Đơn hàng chưa ở trạng thái đang sản xuất');
  end if;

  if p_expected_fulfillment_status is not null and v_order.fulfillment_status <> p_expected_fulfillment_status then
    return jsonb_build_object('ok', false, 'code', 'STATE_CONFLICT', 'message', 'Trạng thái đơn hàng đã thay đổi');
  end if;

  -- Check no active hold
  if exists (select 1 from public.order_holds where order_id = p_order_id and released_at is null) then
    return jsonb_build_object('ok', false, 'code', 'ORDER_HELD', 'message', 'Đơn hàng đang bị tạm giữ, không thể hoàn tất sản xuất');
  end if;

  -- Update order
  update public.orders
  set
    fulfillment_status = 'completed',
    updated_at = clock_timestamp()
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
    'production_completed',
    v_actor_id,
    'admin',
    '{}'::jsonb,
    clock_timestamp()
  );

  -- Record request for idempotency
  insert into public.design_revision_requests (
    actor_user_id,
    operation,
    request_id,
    target_id,
    input_hash,
    result_payload
  )
  values (
    v_actor_id,
    'complete_production',
    p_request_id,
    p_order_id,
    concat(p_order_id::text, ':complete_production'),
    jsonb_build_object(
      'ok', true,
      'value', jsonb_build_object('orderId', p_order_id, 'fulfillmentStatus', 'completed')
    )
  );

  return jsonb_build_object(
    'ok', true,
    'value', jsonb_build_object('orderId', p_order_id, 'fulfillmentStatus', 'completed')
  );
end;
$$;

revoke all on function public.complete_order_production(uuid, text, text) from public, anon;
grant execute on function public.complete_order_production(uuid, text, text) to authenticated;
