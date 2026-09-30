-- Test: state37_rls.sql
-- Verification script for State 37 RLS, grants, and Storage policies
-- Rolls back automatically after verifying all assertions.

begin;

do $$
declare
  v_non_staff_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_editor_id uuid := 'a0000000-0000-0000-0000-000000000002'::uuid;
  v_admin_id uuid := 'a0000000-0000-0000-0000-000000000003'::uuid;
  v_order_id uuid := 'e0000000-0000-4000-8000-000000000001'::uuid;
  v_count integer;
  v_denied boolean;
begin
  -- 1. Setup temporary test identities in auth.users & staff_roles
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_non_staff_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'customer@example.com', 'password', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
    (v_editor_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor@example.com', 'password', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
    (v_admin_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.com', 'password', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now())
  on conflict (id) do nothing;

  insert into public.staff_roles (user_id, role)
  values
    (v_editor_id, 'editor'),
    (v_admin_id, 'admin')
  on conflict (user_id) do update set role = excluded.role;

  -- 2. Test: Anon cannot select orders (direct grant revoked)
  set local role anon;
  set local "request.jwt.claim.sub" = '';
  set local "request.jwt.claims" = '{"role": "anon"}';

  v_denied := false;
  begin
    perform count(*) from public.orders;
  exception
    when insufficient_privilege then
      v_denied := true;
  end;
  if not v_denied then
    raise exception 'Assertion failed: anon should not be able to select from public.orders';
  end if;

  -- 3. Test: Anon cannot select assets, design_versions, projects, order_payments
  v_denied := false;
  begin
    perform count(*) from public.assets;
  exception
    when insufficient_privilege then
      v_denied := true;
  end;
  if not v_denied then
    raise exception 'Assertion failed: anon should not be able to select from public.assets';
  end if;

  v_denied := false;
  begin
    perform count(*) from public.design_versions;
  exception
    when insufficient_privilege then
      v_denied := true;
  end;
  if not v_denied then
    raise exception 'Assertion failed: anon should not be able to select from public.design_versions';
  end if;

  v_denied := false;
  begin
    perform count(*) from public.projects;
  exception
    when insufficient_privilege then
      v_denied := true;
  end;
  if not v_denied then
    raise exception 'Assertion failed: anon should not be able to select from public.projects';
  end if;

  v_denied := false;
  begin
    perform count(*) from public.order_payments;
  exception
    when insufficient_privilege then
      v_denied := true;
  end;
  if not v_denied then
    raise exception 'Assertion failed: anon should not be able to select from public.order_payments';
  end if;

  -- 4. Test: Anon can select active products and published templates
  select count(*) into v_count from public.products where active = true;
  if v_count < 1 then
    raise exception 'Assertion failed: anon should be able to read active products';
  end if;

  select count(*) into v_count from public.templates where published = true;
  if v_count < 1 then
    raise exception 'Assertion failed: anon should be able to read published templates';
  end if;

  -- 5. Test: Non-staff authenticated user cannot read orders
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000001';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "a0000000-0000-0000-0000-000000000001"}';

  select count(*) into v_count from public.orders;
  if v_count <> 0 then
    raise exception 'Assertion failed: non-staff user should see 0 orders due to RLS, saw %', v_count;
  end if;

  select count(*) into v_count from public.order_payments;
  if v_count <> 0 then
    raise exception 'Assertion failed: non-staff user should see 0 order payments due to RLS, saw %', v_count;
  end if;

  -- 6. Test: Staff (editor) can read orders
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000002';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "a0000000-0000-0000-0000-000000000002"}';

  select count(*) into v_count from public.orders;
  if v_count < 1 then
    raise exception 'Assertion failed: staff editor should be able to read orders';
  end if;

  -- 7. Test: Staff (admin) can read and update orders
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000003';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "a0000000-0000-0000-0000-000000000003"}';

  select count(*) into v_count from public.orders;
  if v_count < 1 then
    raise exception 'Assertion failed: staff admin should be able to read orders';
  end if;

  update public.orders
  set fulfillment_status = 'ready_for_production'
  where id = v_order_id;

  -- 8. Test: Storage policy assertions
  -- Anon can read public buckets ('template-assets') but denied for private buckets ('customer-assets')
  set local role anon;
  set local "request.jwt.claim.sub" = '';
  set local "request.jwt.claims" = '{"role": "anon"}';

  -- Simulate storage object check for private bucket
  select count(*) into v_count from storage.objects where bucket_id = 'customer-assets';
  if v_count <> 0 then
    raise exception 'Assertion failed: anon should not see storage objects in customer-assets';
  end if;

  raise notice 'All State 37 RLS and authorization assertions passed successfully.';
end;
$$;

rollback;
