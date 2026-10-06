-- State 45: persist original mutation results atomically; replay before mutable-state checks.
-- Existing SECURITY DEFINER order/design RPCs retain their privilege boundary.

create unique index design_revision_requests_operation_request_unique
  on public.design_revision_requests(operation, request_id);

create unique index asset_events_commercial_request_unique
  on public.asset_events ((metadata_diff->>'requestId'))
  where event = 'commercial_config_published' and metadata_diff ? 'requestId';

create or replace function public.publish_product_commercial_config(
  p_product_id text,
  p_draft_id uuid,
  p_expected_draft_revision bigint,
  p_expected_product_revision bigint,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_product public.products%rowtype;
  v_draft public.product_commercial_drafts%rowtype;
  v_version_id uuid;
  v_version_number integer;
  v_rule jsonb;
  v_tier jsonb;
  v_rule_id uuid;
  v_event_request uuid;
  v_replay public.asset_events%rowtype;
  v_hash text;
  v_result jsonb;
  v_variant_rules jsonb := '[]'::jsonb;
begin
  select role into v_role from public.staff_roles where user_id = v_actor;
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;
  if v_role is distinct from 'admin' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  if p_request_id is null or btrim(p_request_id) = '' then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  end if;
  v_hash := md5(jsonb_build_array(p_product_id, p_draft_id, p_expected_draft_revision, p_expected_product_revision)::text);
  perform pg_advisory_xact_lock(hashtextextended('commercial_publish:' || p_request_id, 0));
  select * into v_replay from public.asset_events
    where event = 'commercial_config_published' and metadata_diff->>'requestId' = p_request_id;
  if found then
    if v_replay.metadata_diff->>'inputHash' is distinct from v_hash then
      return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT');
    end if;
    return v_replay.metadata_diff->'result';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_product.revision <> p_expected_product_revision then
    return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT');
  end if;

  select * into v_draft from public.product_commercial_drafts where id = p_draft_id and product_id = p_product_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_draft.revision <> p_expected_draft_revision then
    return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT');
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version_number
  from public.product_commercial_config_versions where product_id = p_product_id;
  insert into public.product_commercial_config_versions(product_id, version_number, currency, payment_policy, published_by)
  values (p_product_id, v_version_number, 'VND', coalesce(v_draft.payload->'paymentPolicy', '{"kind":"full_payment"}'::jsonb), v_actor)
  returning id into v_version_id;

  for v_rule in select value from jsonb_array_elements(coalesce(v_draft.payload->'variantRules', '[]'::jsonb)) loop
    insert into public.commercial_variant_rules(version_id, variant_id, minimum_quantity, quantity_step, maximum_quantity)
    values (
      v_version_id,
      v_rule->>'variantId',
      (v_rule->>'minimumQuantity')::integer,
      (v_rule->>'quantityStep')::integer,
      case when v_rule->>'maximumQuantity' is null or v_rule->>'maximumQuantity' = '' then null else (v_rule->>'maximumQuantity')::integer end
    ) returning id into v_rule_id;
    for v_tier in select value from jsonb_array_elements(coalesce(v_rule->'tiers', '[]'::jsonb)) loop
      insert into public.commercial_pricing_tiers(rule_id, minimum_quantity, unit_price)
      values (v_rule_id, (v_tier->>'minimumQuantity')::integer, (v_tier->>'unitPrice')::integer);
    end loop;
    v_variant_rules := v_variant_rules || jsonb_build_array(v_rule);
  end loop;

  update public.products
  set current_commercial_config_version_id = v_version_id,
      revision = revision + 1,
      updated_at = clock_timestamp()
  where id = p_product_id;
  delete from public.product_commercial_drafts where id = v_draft.id;

  begin
    v_event_request := p_request_id::uuid;
  exception when others then
    v_event_request := null;
  end;
  v_result := jsonb_build_object('ok', true, 'version', jsonb_build_object(
    'id', v_version_id, 'product_id', p_product_id, 'version_number', v_version_number,
    'currency', 'VND', 'payment_policy', coalesce(v_draft.payload->'paymentPolicy', '{"kind":"full_payment"}'::jsonb), 'variantRules', v_variant_rules));
  insert into public.asset_events(actor_user_id, request_id, kind, target_id, before_revision, after_revision, event, metadata_diff)
  values (v_actor, v_event_request, 'catalog', p_product_id, p_expected_product_revision, p_expected_product_revision + 1, 'commercial_config_published', jsonb_build_object('versionId', v_version_id, 'versionNumber', v_version_number, 'requestId', p_request_id,
      'inputHash', v_hash, 'draftId', p_draft_id, 'draftRevision', p_expected_draft_revision,
      'productRevision', p_expected_product_revision, 'result', v_result,
      'version', jsonb_build_object('id', v_version_id, 'productId', p_product_id, 'versionNumber', v_version_number,
        'currency', 'VND', 'paymentPolicy', coalesce(v_draft.payload->'paymentPolicy', '{"kind":"full_payment"}'::jsonb), 'variantRules', v_variant_rules)));

  return v_result;
exception when others then
  return jsonb_build_object('ok', false, 'code', 'PUBLISH_FAILED');
end;
$$;

revoke all on function public.publish_product_commercial_config(text, uuid, bigint, bigint, text) from public, anon;
grant execute on function public.publish_product_commercial_config(text, uuid, bigint, bigint, text) to authenticated;

drop function public.confirm_order_payment(uuid, text, text, uuid);
create function public.confirm_order_payment(
  p_order_id uuid, p_expected_state text, p_purpose text, p_payment_id uuid, p_request_id text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_request record;
  v_hash text;
  v_result jsonb;
  v_order public.orders%rowtype;
  v_payment public.order_payments%rowtype;
  v_purpose text;
  v_status text;
begin
  if auth.uid() is null or not exists (
    select 1 from public.staff_roles where user_id = auth.uid() and role = 'admin'
  ) then return jsonb_build_object('code', 'forbidden'); end if;
  if p_request_id is null or btrim(p_request_id) = '' then return jsonb_build_object('code', 'validation_error'); end if;
  v_hash := md5(jsonb_build_array(p_order_id, p_expected_state, p_purpose, p_payment_id)::text);
  perform pg_advisory_xact_lock(hashtextextended('confirm_payment:' || p_request_id, 0));
  select * into v_request from public.design_revision_requests
    where operation = 'confirm_payment' and request_id = p_request_id;
  if found then
    if v_request.input_hash is distinct from v_hash then return jsonb_build_object('code', 'state_conflict'); end if;
    return v_request.result_payload;
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then return jsonb_build_object('code', 'not_found'); end if;
  v_purpose := case when v_order.payment_policy->>'kind' = 'fixed_deposit' then 'checkout_deposit' else 'full_order_payment' end;
  if p_purpose is distinct from v_purpose then return jsonb_build_object('code', 'state_conflict'); end if;
  select * into v_payment from public.order_payments
    where order_id = p_order_id and purpose = p_purpose
      and (p_payment_id is null or id = p_payment_id) for update;
  if not found then return jsonb_build_object('code', 'not_found'); end if;
  if v_order.fulfillment_status = 'cancelled' or v_order.payment_status = 'cancelled' or v_payment.status = 'cancelled' then
    return jsonb_build_object('code', 'cancelled');
  end if;
  if v_payment.amount is distinct from coalesce(v_order.amount_due_now, v_order.total)
    or v_payment.currency is distinct from v_order.currency then
    return jsonb_build_object('code', 'state_conflict');
  end if;
  v_status := case when p_purpose = 'checkout_deposit' then 'deposit_confirmed' else 'paid' end;
  if v_payment.status = 'paid' then
    return jsonb_build_object('code', 'already_paid', 'payment_status', v_status);
  end if;
  if p_expected_state is null or p_expected_state not in ('pending_payment', 'payment_reported')
    or v_payment.status is distinct from p_expected_state then
    return jsonb_build_object('code', 'state_conflict');
  end if;
  update public.order_payments set status = 'paid', confirmed_at = clock_timestamp(), confirmed_by = auth.uid()
    where id = v_payment.id returning * into v_payment;
  update public.orders set payment_status = v_status where id = p_order_id;
  insert into public.order_events(order_id, event_type, actor_user_id, actor_role, payload)
    values(p_order_id, 'payment_confirmed', auth.uid(), 'admin', jsonb_build_object(
      'payment_id', v_payment.id, 'purpose', p_purpose, 'amount', v_payment.amount,
      'expected_amount', coalesce(v_order.amount_due_now, v_order.total),
      'previous_status', p_expected_state, 'resulting_status', 'paid', 'payment_status', v_status));
  v_result := jsonb_build_object('code', 'confirmed', 'order_id', p_order_id, 'payment_id', v_payment.id, 'purpose', p_purpose, 'payment_status', v_status, 'confirmed_by', v_payment.confirmed_by, 'confirmed_at', v_payment.confirmed_at);
  insert into public.design_revision_requests(actor_user_id, operation, request_id, target_id, input_hash, result_payload)
    values(auth.uid(), 'confirm_payment', p_request_id, p_order_id, v_hash, v_result);
  return v_result;
end;
$$;
revoke all on function public.confirm_order_payment(uuid, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.confirm_order_payment(uuid, text, text, uuid, text) to authenticated;


drop function public.hold_order(uuid, text);
create or replace function public.hold_order(
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
  v_request record;
  v_hash text;
  v_result jsonb;
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

  if p_request_id is null or btrim(p_request_id) = '' then return jsonb_build_object('code', 'validation_error'); end if;
  v_hash := md5(jsonb_build_array(p_order_id, v_trimmed_reason)::text);
  perform pg_advisory_xact_lock(hashtextextended('hold_order:' || p_request_id, 0));
  select * into v_request from public.design_revision_requests
    where operation = 'hold_order' and request_id = p_request_id;
  if found then
    if v_request.input_hash is distinct from v_hash then return jsonb_build_object('code', 'state_conflict'); end if;
    return v_request.result_payload;
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

  if v_order.fulfillment_status = 'in_production' then return jsonb_build_object('code', 'state_conflict'); end if;

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

  v_result := jsonb_build_object('code', 'held', 'hold_id', v_hold_id,
    'held_by', auth.uid(), 'held_at', (select held_at from public.order_holds where id = v_hold_id));
  insert into public.design_revision_requests(actor_user_id, operation, request_id, target_id, input_hash, result_payload)
    values(auth.uid(), 'hold_order', p_request_id, p_order_id, v_hash, v_result);
  return v_result;
end;
$$;

alter function public.hold_order(uuid, text, text) set search_path = '';
revoke all on function public.hold_order(uuid, text, text) from public, anon;
grant execute on function public.hold_order(uuid, text, text) to authenticated;


drop function public.release_order_hold(uuid, uuid);
create or replace function public.release_order_hold(
  p_order_id uuid,
  p_expected_hold_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request record;
  v_hash text;
  v_result jsonb;
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

  if p_request_id is null or btrim(p_request_id) = '' then return jsonb_build_object('code', 'validation_error'); end if;
  v_hash := md5(jsonb_build_array(p_order_id, p_expected_hold_id)::text);
  perform pg_advisory_xact_lock(hashtextextended('release_hold:' || p_request_id, 0));
  select * into v_request from public.design_revision_requests
    where operation = 'release_hold' and request_id = p_request_id;
  if found then
    if v_request.input_hash is distinct from v_hash then return jsonb_build_object('code', 'state_conflict'); end if;
    return v_request.result_payload;
  end if;
  perform 1 from public.orders where id = p_order_id for update;
  if not found then return jsonb_build_object('code', 'not_found'); end if;

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

  v_result := jsonb_build_object('code', 'released', 'hold_id', v_hold.id,
    'released_by', auth.uid(), 'released_at', (select released_at from public.order_holds where id = v_hold.id));
  insert into public.design_revision_requests(actor_user_id, operation, request_id, target_id, input_hash, result_payload)
    values(auth.uid(), 'release_hold', p_request_id, p_order_id, v_hash, v_result);
  return v_result;
end;
$$;

alter function public.release_order_hold(uuid, uuid, text) set search_path = '';
revoke all on function public.release_order_hold(uuid, uuid, text) from public, anon;
grant execute on function public.release_order_hold(uuid, uuid, text) to authenticated;

create or replace function public.approve_design_revision(
  p_draft_id uuid,
  p_expected_revision bigint,
  p_expected_production_version_id uuid,
  p_session_id uuid,
  p_epoch bigint,
  p_assessment_id uuid,
  p_acknowledged_warning_ids text[],
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
  v_draft record;
  v_order record;
  v_assessment record;
  v_version_number integer;
  v_new_version_id uuid;
  v_existing_req record;
  v_input_hash text;
  v_warn_id text;
  v_missing_warn text;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập');
  end if;

  select role into v_role from public.staff_roles where user_id = v_actor_id;
  if v_role is null or (v_role <> 'admin' and v_role <> 'editor') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Không có quyền duyệt thiết kế');
  end if;

  if p_request_id is null or btrim(p_request_id) = '' then return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT'); end if;
  v_input_hash := md5(jsonb_build_array(p_draft_id, p_expected_revision, p_expected_production_version_id, p_session_id, p_epoch, p_assessment_id, p_acknowledged_warning_ids)::text);
  perform pg_advisory_xact_lock(hashtextextended('approve_revision:' || p_request_id, 0));
  -- Check idempotent request
  select * into v_existing_req
  from public.design_revision_requests
  where operation = 'approve_revision' and request_id = p_request_id;
  if found then
    if v_existing_req.input_hash is distinct from v_input_hash then return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT'); end if;
    return v_existing_req.result_payload;
  end if;

  -- Lock Order
  select * into v_draft from public.design_revision_drafts where id = p_draft_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'DRAFT_CLOSED', 'message', 'Bản nháp không tồn tại');
  end if;

  if v_draft.status = 'approved' then
    return jsonb_build_object('ok', false, 'code', 'DRAFT_CLOSED');
  end if;

  if v_draft.status not in ('editing', 'ready_for_review') then
    return jsonb_build_object('ok', false, 'code', 'DRAFT_CLOSED', 'message', 'Bản nháp đã đóng');
  end if;

  if v_draft.editor_user_id <> v_actor_id or v_draft.lease_session_id <> p_session_id or v_draft.lease_epoch <> p_epoch then
    return jsonb_build_object('ok', false, 'code', 'LEASE_LOST', 'message', 'Quyền sở hữu bản nháp đã mất');
  end if;

  if v_draft.revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT', 'message', 'Bản nháp đã được chỉnh sửa');
  end if;

  -- Lock Order
  select * into v_order from public.orders where id = v_draft.order_id for update;
  if v_order.fulfillment_status not in ('unprocessed', 'ready_for_production') then
    return jsonb_build_object('ok', false, 'code', 'ORDER_LOCKED', 'message', 'Đơn hàng đã vào sản xuất hoặc đã hủy');
  end if;

  if v_order.production_design_version_id <> p_expected_production_version_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CHANGED', 'message', 'Phiên bản sản xuất đã thay đổi');
  end if;

  -- Lock and validate assessment
  select * into v_assessment from public.design_preflight_assessments where id = p_assessment_id;
  if not found or v_assessment.draft_id <> p_draft_id or v_assessment.revision <> v_draft.revision or v_assessment.expires_at < clock_timestamp() then
    return jsonb_build_object('ok', false, 'code', 'PREFLIGHT_STALE', 'message', 'Kết quả kiểm tra trước in đã hết hạn hoặc không khớp bản sửa');
  end if;

  -- Check if blocking findings exist
  if (v_assessment.findings->>'level') = 'error' then
    return jsonb_build_object('ok', false, 'code', 'PREFLIGHT_BLOCKED', 'message', 'Bản thiết kế còn lỗi chặn sản xuất');
  end if;

  -- Check if all warning IDs are acknowledged
  if v_assessment.warning_ids is not null and array_length(v_assessment.warning_ids, 1) > 0 then
    foreach v_warn_id in array v_assessment.warning_ids loop
      if not (p_acknowledged_warning_ids @> array[v_warn_id]) then
        return jsonb_build_object('ok', false, 'code', 'WARNINGS_UNACKNOWLEDGED', 'message', 'Chưa xác nhận hết các cảnh báo in ấn');
      end if;
    end loop;
  end if;

  -- Lock Project and allocate version_number
  select coalesce(max(version_number), 0) + 1 into v_version_number
  from public.design_versions
  where project_id = v_order.project_id;

  -- Insert new immutable design version
  v_new_version_id := gen_random_uuid();
  insert into public.design_versions (
    id,
    project_id,
    version_number,
    source,
    design_document,
    product_snapshot,
    preflight_snapshot,
    preflight_revision,
    created_by,
    parent_design_version_id,
    revision_reason,
    revision_draft_id,
    created_at
  )
  values (
    v_new_version_id,
    v_order.project_id,
    v_version_number,
    case when v_role = 'admin' then 'admin_revision' else 'editor_revision' end,
    v_draft.document,
    v_order.product_snapshot,
    v_assessment.findings,
    concat('rev-', v_draft.revision),
    v_actor_id,
    v_draft.base_design_version_id,
    v_draft.reason,
    p_draft_id,
    clock_timestamp()
  );

  -- Copy draft asset manifests to version asset manifest
  insert into public.design_version_assets (version_id, asset_id, kind, checksum, created_at)
  select v_new_version_id, asset_id, kind, checksum, clock_timestamp()
  from public.design_draft_assets
  where draft_id = p_draft_id
  on conflict do nothing;

  -- Update order production pointer & status
  update public.orders
  set
    production_design_version_id = v_new_version_id,
    design_status = 'approved',
    updated_at = clock_timestamp()
  where id = v_order.id;

  -- Close draft
  update public.design_revision_drafts
  set
    status = 'approved',
    approved_design_version_id = v_new_version_id,
    lease_session_id = null,
    lease_expires_at = null,
    updated_at = clock_timestamp()
  where id = p_draft_id;

  -- Append design_revision_approved event
  insert into public.order_events (
    order_id,
    event_type,
    actor_user_id,
    actor_role,
    payload,
    created_at
  )
  values (
    v_order.id,
    'design_revision_approved',
    v_actor_id,
    v_role,
    jsonb_build_object(
      'version_id', v_new_version_id,
      'version_number', v_version_number,
      'base_version_id', v_draft.base_design_version_id,
      'reason', v_draft.reason
    ),
    clock_timestamp()
  );

  -- Enqueue render job for new version
  insert into public.design_render_jobs (
    version_id,
    order_id,
    status,
    created_at,
    updated_at
  )
  values (
    v_new_version_id,
    v_order.id,
    'pending',
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (version_id) do nothing;

  -- Save request result for idempotency
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
    'approve_revision',
    p_request_id,
    v_new_version_id,
    v_input_hash,
    jsonb_build_object(
      'ok', true,
      'value', jsonb_build_object(
        'orderId', v_order.id,
        'customerVersionId', v_order.customer_approved_design_version_id,
        'productionVersionId', v_new_version_id,
        'versionNumber', v_version_number,
        'draftId', p_draft_id
      )
    )
  );

  return jsonb_build_object(
    'ok', true,
    'value', jsonb_build_object(
      'orderId', v_order.id,
      'customerVersionId', v_order.customer_approved_design_version_id,
      'productionVersionId', v_new_version_id,
      'versionNumber', v_version_number,
      'draftId', p_draft_id
    )
  );
end;
$$;

-- G. approve_customer_design_as_production
create or replace function public.approve_customer_design_as_production(
  p_order_id uuid,
  p_expected_customer_version_id uuid,
  p_expected_production_version_id uuid,
  p_assessment_id uuid,
  p_acknowledged_warning_ids text[],
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
  v_active_draft record;
  v_assessment record;
  v_existing_req record;
  v_input_hash text;
  v_warn_id text;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập');
  end if;

  select role into v_role from public.staff_roles where user_id = v_actor_id;
  if v_role is null or (v_role <> 'admin' and v_role <> 'editor') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Không có quyền duyệt thiết kế');
  end if;

  if p_request_id is null or btrim(p_request_id) = '' then return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT'); end if;
  v_input_hash := md5(jsonb_build_array(p_order_id, p_expected_customer_version_id, p_expected_production_version_id, p_assessment_id, p_acknowledged_warning_ids)::text);
  perform pg_advisory_xact_lock(hashtextextended('approve_as_is:' || p_request_id, 0));
  select * into v_existing_req
  from public.design_revision_requests
  where operation = 'approve_as_is' and request_id = p_request_id;
  if found then
    if v_existing_req.input_hash is distinct from v_input_hash then return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT'); end if;
    return v_existing_req.result_payload;
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_LOCKED', 'message', 'Đơn hàng không tồn tại');
  end if;

  if v_order.fulfillment_status not in ('unprocessed', 'ready_for_production') then
    return jsonb_build_object('ok', false, 'code', 'ORDER_LOCKED', 'message', 'Đơn hàng đã vào sản xuất hoặc đã hủy');
  end if;

  if v_order.customer_approved_design_version_id <> p_expected_customer_version_id or
     v_order.production_design_version_id <> p_expected_production_version_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CHANGED', 'message', 'Phiên bản thiết kế của đơn hàng đã thay đổi');
  end if;

  if v_order.design_status = 'approved' then return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CHANGED'); end if;

  -- Ensure no active draft exists
  select * into v_active_draft
  from public.design_revision_drafts
  where order_id = p_order_id and status in ('editing', 'ready_for_review');
  if found then
    return jsonb_build_object('ok', false, 'code', 'ACTIVE_DRAFT_EXISTS', 'message', 'Đang có bản nháp chỉnh sửa, không thể duyệt nguyên bản');
  end if;

  -- Validate assessment
  select * into v_assessment from public.design_preflight_assessments where id = p_assessment_id;
  if not found or v_assessment.version_id <> p_expected_customer_version_id or v_assessment.expires_at < clock_timestamp() then
    return jsonb_build_object('ok', false, 'code', 'PREFLIGHT_STALE', 'message', 'Kết quả kiểm tra trước in đã hết hạn');
  end if;

  if (v_assessment.findings->>'level') = 'error' then
    return jsonb_build_object('ok', false, 'code', 'PREFLIGHT_BLOCKED', 'message', 'Bản thiết kế còn lỗi chặn sản xuất');
  end if;

  if v_assessment.warning_ids is not null and array_length(v_assessment.warning_ids, 1) > 0 then
    foreach v_warn_id in array v_assessment.warning_ids loop
      if not (p_acknowledged_warning_ids @> array[v_warn_id]) then
        return jsonb_build_object('ok', false, 'code', 'WARNINGS_UNACKNOWLEDGED', 'message', 'Chưa xác nhận hết các cảnh báo in ấn');
      end if;
    end loop;
  end if;

  -- Update order design status to approved (production stays customer version)
  update public.orders
  set
    design_status = 'approved',
    updated_at = clock_timestamp()
  where id = p_order_id;

  -- Append design_approved_as_is event
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
    'design_approved_as_is',
    v_actor_id,
    v_role,
    jsonb_build_object(
      'version_id', p_expected_customer_version_id
    ),
    clock_timestamp()
  );

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
    'approve_as_is',
    p_request_id,
    p_order_id,
    v_input_hash,
    jsonb_build_object(
      'ok', true,
      'value', jsonb_build_object(
        'orderId', p_order_id,
        'customerVersionId', p_expected_customer_version_id,
        'productionVersionId', p_expected_customer_version_id,
        'versionNumber', 1,
        'draftId', null
      )
    )
  );

  return jsonb_build_object(
    'ok', true,
    'value', jsonb_build_object(
      'orderId', p_order_id,
      'customerVersionId', p_expected_customer_version_id,
      'productionVersionId', p_expected_customer_version_id,
      'versionNumber', 1,
      'draftId', null
    )
  );
end;
$$;


create unique index asset_events_library_publish_request_unique
  on public.asset_events(request_id) where event = 'published' and metadata_diff ? 'inputHash';

create or replace function public.library_publish(p_actor uuid, p_request uuid, p_kind text, p_id text, p_revision bigint, p_validation uuid, p_public_objects jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_next bigint;
  v_row jsonb;
  v_event public.asset_events%rowtype;
  v_hash text := md5(jsonb_build_array(p_kind, p_id, p_revision, p_validation)::text);
begin
  perform public.library_authorize(p_actor);
  if p_request is null then raise exception 'INVALID_INPUT'; end if;
  perform pg_advisory_xact_lock(hashtextextended('library_publish:' || p_request::text, 0));
  select * into v_event from public.asset_events where request_id = p_request and event = 'published' and metadata_diff ? 'inputHash';
  if found then
    if v_event.metadata_diff->>'inputHash' is distinct from v_hash
      or (p_public_objects is not null and v_event.metadata_diff->'objects' is distinct from p_public_objects) then
      raise exception 'REVISION_CONFLICT';
    end if;
    return jsonb_build_object('ok', true, 'item', v_event.metadata_diff->'item');
  end if;
  if p_public_objects is null then raise exception 'REVISION_CONFLICT'; end if;
  if not exists (select 1 from public.library_validation_runs where id = p_validation and passed and kind = p_kind and asset_id = p_id and revision = p_revision) then raise exception 'VALIDATION_FAILED'; end if;
  if p_kind = 'sticker' then
    select revision into v_next from public.sticker_assets where id = p_id and status in ('draft', 'archived') for update;
    if not found then raise exception 'INVALID_TRANSITION'; end if;
    if v_next <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
    if p_public_objects->>'bucket' is distinct from 'sticker-library' then raise exception 'VALIDATION_FAILED'; end if;
    update public.sticker_assets set status = 'published', published = true, ever_published_at = coalesce(ever_published_at, now()), validation_id = p_validation, storage_path = p_public_objects->>'key', revision = revision + 1, updated_by = p_actor where id = p_id returning to_jsonb(sticker_assets.*) into v_row;
  elsif p_kind = 'font-face' then
    select revision into v_next from public.font_faces where id::text = p_id and status in ('draft', 'archived') for update;
    if not found then raise exception 'INVALID_TRANSITION'; end if;
    if v_next <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
    if p_public_objects->>'bucket' is distinct from 'fonts' then raise exception 'VALIDATION_FAILED'; end if;
    update public.font_faces set status = 'published', storage_bucket = 'fonts', storage_path = p_public_objects->>'key', ever_published_at = coalesce(ever_published_at, now()), validation_id = p_validation, revision = revision + 1, updated_by = p_actor where id::text = p_id returning to_jsonb(font_faces.*) into v_row;
  else raise exception 'INVALID_INPUT'; end if;
  if not exists (select 1 from storage.objects where bucket_id = p_public_objects->>'bucket' and name = p_public_objects->>'key') then raise exception 'VALIDATION_FAILED'; end if;
  if p_public_objects ? 'thumbnail_key' and not exists (select 1 from storage.objects where bucket_id = p_public_objects->>'bucket' and name = p_public_objects->>'thumbnail_key') then raise exception 'VALIDATION_FAILED'; end if;
  perform public.library_event(p_actor, p_request, p_kind, p_id, p_revision, p_revision + 1, 'published', jsonb_build_object('inputHash', v_hash, 'objects', p_public_objects, 'item', v_row));
  return jsonb_build_object('ok', true, 'item', v_row);
end;
$$;

-- Validation receipts do not prove objects still exist at commit time.
create function public.check_template_publish_objects()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_asset record; v_dependency jsonb;
begin
  for v_asset in
    select a.* from public.template_assets a
    where a.id in (select (value->>'id')::uuid from jsonb_array_elements(new.asset_manifest))
  loop
    if not exists (select 1 from storage.objects where bucket_id = v_asset.storage_bucket and name = v_asset.storage_path) then
      raise exception 'MISSING_DEPENDENCY';
    end if;
  end loop;
  for v_dependency in select value from jsonb_array_elements(new.dependency_snapshot) loop
    if v_dependency->>'kind' = 'font-face' and v_dependency->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      if not exists (select 1 from public.font_faces f join storage.objects o on o.bucket_id = f.storage_bucket and o.name = f.storage_path where f.id::text = v_dependency->>'id') then
        raise exception 'MISSING_DEPENDENCY';
      end if;
    elsif v_dependency->>'kind' = 'sticker' then
      if not exists (select 1 from public.sticker_assets s join storage.objects o on o.bucket_id = 'sticker-library' and o.name = s.storage_path where s.id = v_dependency->>'id') then
        raise exception 'MISSING_DEPENDENCY';
      end if;
    end if;
  end loop;
  return new;
end;
$$;
create trigger template_publish_objects_present before insert on public.template_versions
  for each row execute function public.check_template_publish_objects();
