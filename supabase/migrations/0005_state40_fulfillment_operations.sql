-- Migration: 0005_state40_fulfillment_operations.sql
-- State 40: Admin Order Fulfillment & Production Lifecycle (Atomic Transitions & Auditing)

-- 1. Migration precheck: requires State 39 schema
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'production_design_version_id'
  ) then
    raise exception 'Migration prerequisite 0004_state39_design_revisions is missing';
  end if;
end $$;

-- 2. Atomic RPC: start_order_production
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
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập');
  end if;

  select role into v_role from public.staff_roles where user_id = v_actor_id;
  if v_role is null or (v_role <> 'admin' and v_role <> 'editor') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Không có quyền thực hiện thao tác');
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

  -- Check payment
  if v_order.payment_status <> 'paid' then
    return jsonb_build_object('ok', false, 'code', 'PAYMENT_REQUIRED', 'message', 'Đơn hàng chưa thanh toán, không thể bắt đầu sản xuất');
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
    'production_started',
    v_actor_id,
    v_role,
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

-- 3. Atomic RPC: complete_order_production
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
  if v_role is null or (v_role <> 'admin' and v_role <> 'editor') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Không có quyền thực hiện thao tác');
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
    v_role,
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

-- 4. Atomic RPC: cancel_order (Admin only with mandatory reason)
create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text,
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
  v_trimmed_reason text;
  v_existing_req record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập');
  end if;

  select role into v_role from public.staff_roles where user_id = v_actor_id;
  if v_role is null or v_role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Chỉ Quản trị viên (Admin) mới có quyền hủy đơn hàng');
  end if;

  v_trimmed_reason := btrim(p_reason);
  if char_length(v_trimmed_reason) < 3 or char_length(v_trimmed_reason) > 500 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REASON', 'message', 'Lý do hủy đơn phải từ 3 đến 500 ký tự');
  end if;

  -- Idempotency check
  select * into v_existing_req
  from public.design_revision_requests
  where actor_user_id = v_actor_id and operation = 'cancel_order' and request_id = p_request_id;
  if found then
    return v_existing_req.result_payload;
  end if;

  -- Lock Order
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND', 'message', 'Đơn hàng không tồn tại');
  end if;

  if v_order.fulfillment_status = 'cancelled' then
    return jsonb_build_object(
      'ok', true,
      'value', jsonb_build_object('orderId', p_order_id, 'fulfillmentStatus', 'cancelled')
    );
  end if;

  if v_order.fulfillment_status = 'completed' then
    return jsonb_build_object('ok', false, 'code', 'ORDER_COMPLETED', 'message', 'Đơn hàng đã hoàn tất sản xuất, không thể hủy');
  end if;

  -- Release any active hold
  update public.order_holds
  set
    released_by = v_actor_id,
    released_at = clock_timestamp()
  where order_id = p_order_id and released_at is null;

  -- Discard any active draft
  update public.design_revision_drafts
  set
    status = 'discarded',
    lease_session_id = null,
    lease_expires_at = null,
    updated_at = clock_timestamp()
  where order_id = p_order_id and status in ('editing', 'ready_for_review');

  -- Update order
  update public.orders
  set
    fulfillment_status = 'cancelled',
    payment_status = case when payment_status = 'paid' then 'paid' else 'cancelled' end,
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
    'order_cancelled',
    v_actor_id,
    'admin',
    jsonb_build_object('reason', v_trimmed_reason),
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
    'cancel_order',
    p_request_id,
    p_order_id,
    concat(p_order_id::text, ':', v_trimmed_reason),
    jsonb_build_object(
      'ok', true,
      'value', jsonb_build_object('orderId', p_order_id, 'fulfillmentStatus', 'cancelled')
    )
  );

  return jsonb_build_object(
    'ok', true,
    'value', jsonb_build_object('orderId', p_order_id, 'fulfillmentStatus', 'cancelled')
  );
end;
$$;

-- Grant EXECUTE to authenticated
grant execute on function public.start_order_production to authenticated;
grant execute on function public.complete_order_production to authenticated;
grant execute on function public.cancel_order to authenticated;
