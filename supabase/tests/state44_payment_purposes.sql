-- Test: state44_payment_purposes.sql
-- Verification script for State 44 payment purpose semantics, deposit vs full-payment confirmation,
-- compatibility status projection, and audit event payloads.
-- Transaction rolls back automatically after verifying all assertions.

begin;

do $$
declare
  v_customer_id uuid := 'a0000000-0000-4000-8000-000000000090'::uuid;
  v_editor_id uuid := 'a0000000-0000-4000-8000-000000000091'::uuid;
  v_admin_id uuid := 'a0000000-0000-4000-8000-000000000092'::uuid;

  v_full_order_id uuid := 'e0000000-0000-4000-8000-000000000091'::uuid;
  v_full_payment_id uuid := 'e0000000-0000-4000-8000-000000000092'::uuid;

  v_dep_order_id uuid := 'e0000000-0000-4000-8000-000000000093'::uuid;
  v_dep_payment_id uuid := 'e0000000-0000-4000-8000-000000000094'::uuid;

  v_res jsonb;
  v_order_status text;
  v_payment_status text;
  v_event_count integer;
  v_last_event_payload jsonb;
begin
  -- 1. Setup test staff and customer identities
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_customer_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cust9@example.com', 'password', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
    (v_editor_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor9@example.com', 'password', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
    (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin9@example.com', 'password', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now())
  on conflict (id) do nothing;

  insert into public.staff_roles (user_id, role, display_name)
  values
    (v_editor_id, 'editor', 'Biên tập viên Minh'),
    (v_admin_id, 'admin', 'Quản trị viên Trang')
  on conflict (user_id) do update set role = excluded.role, display_name = excluded.display_name;

  -- 2. Insert Full Payment Order and Requirement
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
    payment_policy,
    deposit_amount,
    amount_due_now,
    remaining_amount,
    payment_status,
    design_status,
    fulfillment_status
  )
  values (
    v_full_order_id,
    'QT-TEST-FULL-9',
    1,
    300000,
    300000,
    300000,
    'VND',
    'Khách Hàng Trả Đủ',
    '0901111111',
    '0901111111',
    '123 Đường 1',
    '{"kind":"full_payment"}'::jsonb,
    null,
    300000,
    0,
    'payment_reported',
    'awaiting_review',
    'unprocessed'
  );

  insert into public.order_payments (
    id,
    order_id,
    provider,
    amount,
    currency,
    reference,
    status,
    purpose
  )
  values (
    v_full_payment_id,
    v_full_order_id,
    'vietqr-demo',
    300000,
    'VND',
    'QT-TEST-FULL-9',
    'payment_reported',
    'full_order_payment'
  );

  -- 3. Insert Deposit Order and Requirement
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
    payment_policy,
    deposit_amount,
    amount_due_now,
    remaining_amount,
    payment_status,
    design_status,
    fulfillment_status
  )
  values (
    v_dep_order_id,
    'QT-TEST-DEP-9',
    1,
    300000,
    300000,
    300000,
    'VND',
    'Khách Hàng Đặt Cọc',
    '0902222222',
    '0902222222',
    '456 Đường 2',
    '{"kind":"fixed_deposit","depositAmount":100000}'::jsonb,
    100000,
    100000,
    200000,
    'payment_reported',
    'awaiting_review',
    'unprocessed'
  );

  insert into public.order_payments (
    id,
    order_id,
    provider,
    amount,
    currency,
    reference,
    status,
    purpose
  )
  values (
    v_dep_payment_id,
    v_dep_order_id,
    'vietqr-demo',
    100000,
    'VND',
    'QT-TEST-DEP-9',
    'payment_reported',
    'checkout_deposit'
  );

  -- 4. Test non-admin authorization
  perform set_config('request.jwt.claim.sub', v_editor_id::text, true);
  v_res := public.confirm_order_payment(v_dep_order_id, 'payment_reported', 'checkout_deposit', v_dep_payment_id);
  if (v_res->>'code') <> 'forbidden' then
    raise exception 'Assertion failed: Editor must receive forbidden from confirm_order_payment, got %', v_res;
  end if;

  -- 5. Test wrong-purpose confirmation has no side effect
  perform set_config('request.jwt.claim.sub', v_admin_id::text, true);
  v_res := public.confirm_order_payment(v_dep_order_id, 'payment_reported', 'full_order_payment', v_dep_payment_id);
  if (v_res->>'code') not in ('state_conflict', 'not_found') then
    raise exception 'Assertion failed: Wrong purpose confirmation must be rejected, got %', v_res;
  end if;

  select payment_status into v_order_status from public.orders where id = v_dep_order_id;
  if v_order_status <> 'payment_reported' then
    raise exception 'Assertion failed: Order status was mutated on rejected confirmation: %', v_order_status;
  end if;

  -- 6. Confirm deposit payment requirement
  v_res := public.confirm_order_payment(v_dep_order_id, 'payment_reported', 'checkout_deposit', v_dep_payment_id);
  if (v_res->>'code') <> 'confirmed' or (v_res->>'payment_status') <> 'deposit_confirmed' or (v_res->>'purpose') <> 'checkout_deposit' then
    raise exception 'Assertion failed: Expected confirmed deposit result, got %', v_res;
  end if;

  -- Assert orders.payment_status is deposit_confirmed (NOT generic paid)
  select payment_status into v_order_status from public.orders where id = v_dep_order_id;
  if v_order_status <> 'deposit_confirmed' then
    raise exception 'Assertion failed: Order payment_status must be deposit_confirmed, got %', v_order_status;
  end if;

  -- Assert specific payment requirement row status is paid
  select status into v_payment_status from public.order_payments where id = v_dep_payment_id;
  if v_payment_status <> 'paid' then
    raise exception 'Assertion failed: Requirement status must be paid, got %', v_payment_status;
  end if;

  -- Assert exactly one audit event with purpose and amount
  select count(*), max(payload) into v_event_count, v_last_event_payload
  from public.order_events
  where order_id = v_dep_order_id and event_type = 'payment_confirmed';

  if v_event_count <> 1 then
    raise exception 'Assertion failed: Expected 1 payment_confirmed event, got %', v_event_count;
  end if;

  if (v_last_event_payload->>'purpose') <> 'checkout_deposit'
     or (v_last_event_payload->>'amount')::numeric <> 100000
     or (v_last_event_payload->>'resulting_status') <> 'paid'
     or (v_last_event_payload->>'order_payment_status') <> 'deposit_confirmed' then
    raise exception 'Assertion failed: Audit event payload mismatch: %', v_last_event_payload;
  end if;

  -- 7. Test duplicate confirmation of deposit payment
  v_res := public.confirm_order_payment(v_dep_order_id, 'payment_reported', 'checkout_deposit', v_dep_payment_id);
  if (v_res->>'code') <> 'already_paid' or (v_res->>'payment_status') <> 'deposit_confirmed' then
    raise exception 'Assertion failed: Duplicate confirmation must return already_paid, got %', v_res;
  end if;

  select count(*) into v_event_count
  from public.order_events
  where order_id = v_dep_order_id and event_type = 'payment_confirmed';

  if v_event_count <> 1 then
    raise exception 'Assertion failed: Duplicate confirmation must not append events, got %', v_event_count;
  end if;

  -- 8. Confirm full-order payment
  v_res := public.confirm_order_payment(v_full_order_id, 'payment_reported', 'full_order_payment', v_full_payment_id);
  if (v_res->>'code') <> 'confirmed' or (v_res->>'payment_status') <> 'paid' or (v_res->>'purpose') <> 'full_order_payment' then
    raise exception 'Assertion failed: Expected confirmed full payment result, got %', v_res;
  end if;

  select payment_status into v_order_status from public.orders where id = v_full_order_id;
  if v_order_status <> 'paid' then
    raise exception 'Assertion failed: Full order payment_status must be paid, got %', v_order_status;
  end if;

  select status into v_payment_status from public.order_payments where id = v_full_payment_id;
  if v_payment_status <> 'paid' then
    raise exception 'Assertion failed: Full payment requirement status must be paid, got %', v_payment_status;
  end if;

  select count(*), max(payload) into v_event_count, v_last_event_payload
  from public.order_events
  where order_id = v_full_order_id and event_type = 'payment_confirmed';

  if v_event_count <> 1 or (v_last_event_payload->>'purpose') <> 'full_order_payment' or (v_last_event_payload->>'amount')::numeric <> 300000 then
    raise exception 'Assertion failed: Full payment event mismatch: count %, payload %', v_event_count, v_last_event_payload;
  end if;

  -- 9. Test replay behavior with explicit p_request_id
  declare
    v_replay_order_id uuid := 'e0000000-0000-4000-8000-000000000095'::uuid;
    v_replay_payment_id uuid := 'e0000000-0000-4000-8000-000000000096'::uuid;
    v_initial_res jsonb;
    v_replay_res jsonb;
  begin
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
      payment_policy,
      deposit_amount,
      amount_due_now,
      remaining_amount,
      payment_status,
      design_status,
      fulfillment_status
    )
    values (
      v_replay_order_id,
      'QT-TEST-REPLAY-9',
      1,
      300000,
      300000,
      300000,
      'VND',
      'Khách Hàng Replay',
      '0903333333',
      '0903333333',
      '789 Đường 3',
      '{"kind":"full_payment"}'::jsonb,
      null,
      300000,
      0,
      'payment_reported',
      'awaiting_review',
      'unprocessed'
    );

    insert into public.order_payments (
      id,
      order_id,
      provider,
      amount,
      currency,
      reference,
      status,
      purpose
    )
    values (
      v_replay_payment_id,
      v_replay_order_id,
      'vietqr-demo',
      300000,
      'VND',
      'QT-TEST-REPLAY-9',
      'payment_reported',
      'full_order_payment'
    );

    -- Initial confirmation with explicit request ID
    v_initial_res := public.confirm_order_payment(
      v_replay_order_id,
      'payment_reported',
      'full_order_payment',
      v_replay_payment_id,
      'test-replay-req-1'
    );
    if (v_initial_res->>'code') <> 'confirmed' then
      raise exception 'Assertion failed: Initial confirmation with request ID must succeed, got %', v_initial_res;
    end if;

    -- Replay confirmation with identical request ID returns exact original result without duplicate effects
    v_replay_res := public.confirm_order_payment(
      v_replay_order_id,
      'payment_reported',
      'full_order_payment',
      v_replay_payment_id,
      'test-replay-req-1'
    );
    if v_replay_res <> v_initial_res then
      raise exception 'Assertion failed: Replay confirmation must return exact original result, got % instead of %', v_replay_res, v_initial_res;
    end if;

    select count(*) into v_event_count
    from public.order_events
    where order_id = v_replay_order_id and event_type = 'payment_confirmed';

    if v_event_count <> 1 then
      raise exception 'Assertion failed: Replay confirmation must not append events, got %', v_event_count;
    end if;
  end;
end;
$$;

rollback;
