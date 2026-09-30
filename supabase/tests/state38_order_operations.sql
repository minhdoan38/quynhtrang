-- Test: state38_order_operations.sql
-- Verification script for State 38 atomic payment & hold operations, grants, and concurrency
-- Transaction rolls back automatically after verifying all assertions.

begin;

do $$
declare
  v_non_staff_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_editor_id uuid := 'a0000000-0000-0000-0000-000000000002'::uuid;
  v_admin_id uuid := 'a0000000-0000-0000-0000-000000000003'::uuid;
  v_order_id uuid := 'e0000000-0000-4000-8000-000000000038'::uuid;
  v_payment_id uuid := 'e0000000-0000-4000-8000-000000000039'::uuid;
  v_res jsonb;
  v_event_count integer;
  v_hold_id uuid;
  v_denied boolean;
begin
  -- 1. Setup test identities
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_non_staff_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cust38@example.com', 'password', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
    (v_editor_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor38@example.com', 'password', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
    (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin38@example.com', 'password', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now())
  on conflict (id) do nothing;

  insert into public.staff_roles (user_id, role, display_name)
  values
    (v_editor_id, 'editor', 'Biên tập viên Minh'),
    (v_admin_id, 'admin', 'Quản trị viên Trang')
  on conflict (user_id) do update set role = excluded.role, display_name = excluded.display_name;

  -- 2. Insert test fixture order and payment
  insert into public.orders (
    id,
    public_order_code,
    quantity,
    unit_price,
    subtotal,
    total,
    currency,
    customer_full_name,
    customer_phone,
    customer_phone_normalized,
    shipping_address,
    payment_status,
    design_status,
    fulfillment_status
  )
  values (
    v_order_id,
    'QT-TEST-38',
    1,
    200000,
    200000,
    200000,
    'VND',
    'Nguyễn Văn A',
    '0901234567',
    '0901234567',
    '123 Đường B, Q.1, TP.HCM',
    'payment_reported',
    'awaiting_review',
    'unprocessed'
  )
  on conflict (id) do nothing;

  insert into public.order_payments (
    id,
    order_id,
    provider,
    amount,
    currency,
    reference,
    status,
    customer_reported_at
  )
  values (
    v_payment_id,
    v_order_id,
    'sepay',
    200000,
    'VND',
    'QT-TEST-38',
    'payment_reported',
    now()
  )
  on conflict (id) do nothing;

  -- 3. Assert direct write denial for Admin (grants revoked in 0003)
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000003';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "a0000000-0000-0000-0000-000000000003"}';

  v_denied := false;
  begin
    update public.orders set payment_status = 'paid' where id = v_order_id;
  exception
    when insufficient_privilege then
      v_denied := true;
  end;
  if not v_denied then
    raise exception 'Assertion failed: direct update on public.orders should be denied by revoked grant';
  end if;

  v_denied := false;
  begin
    insert into public.order_events (order_id, event_type) values (v_order_id, 'direct_test');
  exception
    when insufficient_privilege then
      v_denied := true;
  end;
  if not v_denied then
    raise exception 'Assertion failed: direct insert on public.order_events should be denied by revoked grant';
  end if;

  -- 4. Test: Editor cannot call confirm_order_payment
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000002';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "a0000000-0000-0000-0000-000000000002"}';

  select public.confirm_order_payment(v_order_id, 'payment_reported') into v_res;
  if (v_res->>'code') <> 'forbidden' then
    raise exception 'Assertion failed: editor should receive forbidden, got %', v_res;
  end if;

  -- 5. Test: Non-staff cannot call confirm_order_payment
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000001';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "a0000000-0000-0000-0000-000000000001"}';

  select public.confirm_order_payment(v_order_id, 'payment_reported') into v_res;
  if (v_res->>'code') <> 'forbidden' then
    raise exception 'Assertion failed: non-staff should receive forbidden, got %', v_res;
  end if;

  -- 6. Test: Admin calling confirm_order_payment with state mismatch
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000003';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "a0000000-0000-0000-0000-000000000003"}';

  select public.confirm_order_payment(v_order_id, 'pending_payment') into v_res;
  if (v_res->>'code') <> 'state_conflict' then
    raise exception 'Assertion failed: state mismatch should return state_conflict, got %', v_res;
  end if;

  -- 7. Test: Admin calling confirm_order_payment with matching state
  select public.confirm_order_payment(v_order_id, 'payment_reported') into v_res;
  if (v_res->>'code') <> 'confirmed' then
    raise exception 'Assertion failed: admin confirmation should succeed with confirmed, got %', v_res;
  end if;

  -- Verify canonical payment status & denormalized order status updated
  if not exists (select 1 from public.order_payments where id = v_payment_id and status = 'paid' and confirmed_by = v_admin_id) then
    raise exception 'Assertion failed: order_payments row not updated to paid with admin actor';
  end if;

  if not exists (select 1 from public.orders where id = v_order_id and payment_status = 'paid') then
    raise exception 'Assertion failed: orders row not updated to paid';
  end if;

  select count(*) into v_event_count from public.order_events where order_id = v_order_id and event_type = 'payment_confirmed';
  if v_event_count <> 1 then
    raise exception 'Assertion failed: expected exactly 1 payment_confirmed event, saw %', v_event_count;
  end if;

  -- 8. Test: Idempotency (already paid)
  select public.confirm_order_payment(v_order_id, 'payment_reported') into v_res;
  if (v_res->>'code') <> 'already_paid' then
    raise exception 'Assertion failed: second confirmation should return already_paid, got %', v_res;
  end if;

  select count(*) into v_event_count from public.order_events where order_id = v_order_id and event_type = 'payment_confirmed';
  if v_event_count <> 1 then
    raise exception 'Assertion failed: idempotency violated, event count is %', v_event_count;
  end if;

  -- 9. Test: Order hold operations
  -- 9.1 Editor cannot hold
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000002';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "a0000000-0000-0000-0000-000000000002"}';

  select public.hold_order(v_order_id, 'Lý do hợp lệ') into v_res;
  if (v_res->>'code') <> 'forbidden' then
    raise exception 'Assertion failed: editor hold should be forbidden, got %', v_res;
  end if;

  -- 9.2 Admin short reason rejected
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000003';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "a0000000-0000-0000-0000-000000000003"}';

  select public.hold_order(v_order_id, '  ab ') into v_res;
  if (v_res->>'code') <> 'validation_error' then
    raise exception 'Assertion failed: short reason should return validation_error, got %', v_res;
  end if;

  -- 9.3 Admin valid hold
  select public.hold_order(v_order_id, 'Khách yêu cầu tạm giữ để thay đổi địa chỉ nhận') into v_res;
  if (v_res->>'code') <> 'held' then
    raise exception 'Assertion failed: valid hold should return held, got %', v_res;
  end if;

  v_hold_id := (v_res->>'hold_id')::uuid;
  if not exists (select 1 from public.order_holds where id = v_hold_id and released_at is null and held_by = v_admin_id) then
    raise exception 'Assertion failed: active hold record not found';
  end if;

  select count(*) into v_event_count from public.order_events where order_id = v_order_id and event_type = 'order_held';
  if v_event_count <> 1 then
    raise exception 'Assertion failed: expected 1 order_held event, saw %', v_event_count;
  end if;

  -- 9.4 Duplicate hold rejected
  select public.hold_order(v_order_id, 'Thử tạm giữ lần 2') into v_res;
  if (v_res->>'code') <> 'state_conflict' then
    raise exception 'Assertion failed: duplicate active hold should return state_conflict, got %', v_res;
  end if;

  -- 10. Test: Release hold operations
  -- 10.1 Editor cannot release
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000002';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "a0000000-0000-0000-0000-000000000002"}';

  select public.release_order_hold(v_order_id, v_hold_id) into v_res;
  if (v_res->>'code') <> 'forbidden' then
    raise exception 'Assertion failed: editor release should be forbidden, got %', v_res;
  end if;

  -- 10.2 Admin wrong hold_id returns state_conflict
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000003';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "a0000000-0000-0000-0000-000000000003"}';

  select public.release_order_hold(v_order_id, '00000000-0000-0000-0000-000000000000'::uuid) into v_res;
  if (v_res->>'code') <> 'state_conflict' then
    raise exception 'Assertion failed: mismatched hold_id should return state_conflict, got %', v_res;
  end if;

  -- 10.3 Admin valid release succeeds
  select public.release_order_hold(v_order_id, v_hold_id) into v_res;
  if (v_res->>'code') <> 'released' then
    raise exception 'Assertion failed: valid release should return released, got %', v_res;
  end if;

  if not exists (select 1 from public.order_holds where id = v_hold_id and released_at is not null and released_by = v_admin_id) then
    raise exception 'Assertion failed: released hold row was not updated with released_at/released_by';
  end if;

  select count(*) into v_event_count from public.order_events where order_id = v_order_id and event_type = 'order_hold_released';
  if v_event_count <> 1 then
    raise exception 'Assertion failed: expected 1 order_hold_released event, saw %', v_event_count;
  end if;

  -- 11. Assert hold history is preserved
  select count(*) into v_event_count from public.order_holds where order_id = v_order_id;
  if v_event_count <> 1 then
    raise exception 'Assertion failed: hold row should be preserved forever, count is %', v_event_count;
  end if;

  -- 12. Seed coherence assertions (if seeded orders exist)
  if exists (select 1 from public.orders where public_order_code = 'QT3801') then
    -- 12.1 Payment and order projection match
    if exists (
      select 1 from public.orders o
      join public.order_payments op on op.order_id = o.id
      where o.public_order_code like 'QT38%'
        and o.payment_status <> op.status
    ) then
      raise exception 'Assertion failed: seeded payment_status mismatch between orders and order_payments';
    end if;

    -- 12.2 Approved version belongs to the same project
    if exists (
      select 1 from public.orders o
      join public.design_versions dv on dv.id = o.approved_design_version_id
      where o.public_order_code like 'QT38%'
        and o.project_id <> dv.project_id
    ) then
      raise exception 'Assertion failed: approved_design_version does not belong to order project';
    end if;

    -- 12.3 No completed order has an active hold
    if exists (
      select 1 from public.orders o
      join public.order_holds oh on oh.order_id = o.id
      where o.fulfillment_status = 'completed'
        and oh.released_at is null
    ) then
      raise exception 'Assertion failed: completed order has an active hold';
    end if;
  end if;

  raise notice 'All State 38 operations assertions passed successfully.';
end;
$$;

rollback;
