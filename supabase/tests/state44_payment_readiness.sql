-- Test: state44_payment_readiness.sql
-- Verification of production readiness for deposit payments and start_order_production RPC

begin;

do $$
declare
  v_admin_id uuid := gen_random_uuid();
  v_order_id uuid := gen_random_uuid();
  v_version_id uuid := gen_random_uuid();
  v_project_id uuid := gen_random_uuid();
  v_res jsonb;
begin
  -- Setup admin user
  insert into auth.users (id, email) values (v_admin_id, 'admin@example.com');
  insert into public.staff_roles (user_id, role) values (v_admin_id, 'admin');

  -- Setup project and design version
  insert into public.projects (id, product_id, status) values (v_project_id, 'card', 'editing');
  insert into public.design_versions (id, project_id, version_number, source)
  values (v_version_id, v_project_id, 1, 'customer_approved');

  -- 1. Create deposit order with pending deposit -> must be blocked
  insert into public.orders (
    id, project_id, customer_approved_design_version_id, production_design_version_id,
    quantity, unit_price, subtotal, total, customer_full_name, customer_phone, customer_phone_normalized,
    payment_status, design_status, fulfillment_status,
    payment_policy, deposit_amount, amount_due_now, remaining_amount
  ) values (
    v_order_id, v_project_id, v_version_id, v_version_id,
    1, 200000, 200000, 200000, 'Test User', '0901234567', '+84901234567',
    'pending_payment', 'approved', 'ready_for_production',
    '{"kind": "fixed_deposit", "depositAmount": 50000}'::jsonb, 50000, 50000, 150000
  );

  -- Set auth context
  set local role authenticated;
  set local "request.jwt.claim.sub" = v_admin_id::text;

  v_res := public.start_order_production(v_order_id, 'ready_for_production', 'req-1');
  if (v_res->>'ok')::boolean = true then
    raise exception 'Expected pending deposit to block production, but it succeeded';
  end if;
  if v_res->>'message' not like '%Tiền cọc chưa được xác nhận%' then
    raise exception 'Expected deposit-specific error message, got %', v_res->>'message';
  end if;

  -- 2. Update order to deposit_confirmed -> must succeed!
  update public.orders set payment_status = 'deposit_confirmed' where id = v_order_id;

  v_res := public.start_order_production(v_order_id, 'ready_for_production', 'req-2');
  if (v_res->>'ok')::boolean <> true then
    raise exception 'Expected confirmed deposit to satisfy production readiness, got error %', v_res;
  end if;

  raise notice 'state44_payment_readiness test passed successfully';
end $$;

rollback;
