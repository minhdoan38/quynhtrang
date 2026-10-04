-- Migration: 0018_state44_payment_readiness_cutover.sql
-- State 44: Production readiness cutover for deposit payments and customer projections

-- 1. Update start_order_production RPC to accept deposit_confirmed for fixed_deposit orders
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

  -- Check payment satisfaction based on policy and status
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

revoke all on function public.start_order_production(uuid, text, text) from public, anon;
grant execute on function public.start_order_production(uuid, text, text) to authenticated;

-- 2. Update customer projections to expose payment policy and deposit breakdown
create or replace function public.get_customer_orders()
returns table (
  id uuid,
  public_order_code text,
  status text,
  customer_full_name text,
  customer_phone text,
  product_name text,
  variant_name text,
  quantity integer,
  total integer,
  currency text,
  payment_status text,
  payment_policy jsonb,
  deposit_amount integer,
  amount_due_now integer,
  remaining_amount integer,
  created_at timestamptz,
  can_claim boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  return query
  select
    o.id,
    o.public_order_code,
    case
      when o.payment_status in ('pending_payment', 'payment_reported') then 'waiting_payment'
      when o.design_status in ('awaiting_review', 'editing', 'needs_changes') then 'design_review'
      when o.fulfillment_status in ('unprocessed', 'ready_for_production') then 'preparing_production'
      when o.fulfillment_status = 'in_production' then 'in_production'
      when o.fulfillment_status = 'completed' then 'production_completed'
      when o.fulfillment_status = 'cancelled' or o.payment_status = 'cancelled' then 'cancelled'
      else 'processing'
    end as status,
    o.customer_full_name,
    o.customer_phone,
    coalesce(o.product_snapshot->>'name', 'Sản phẩm in') as product_name,
    coalesce(o.variant_snapshot->>'name', 'Mặc định') as variant_name,
    o.quantity,
    o.total,
    o.currency,
    o.payment_status,
    o.payment_policy,
    o.deposit_amount,
    o.amount_due_now,
    o.remaining_amount,
    o.created_at,
    false as can_claim
  from public.orders o
  where o.customer_user_id = auth.uid()
  order by o.created_at desc;
end;
$$;

revoke all on function public.get_customer_orders() from public, anon;
grant execute on function public.get_customer_orders() to authenticated;
