-- State 45 RLS and privileged-operation verification.
-- Run against isolated migrated/seeded Supabase; all writes roll back.
begin;

do $$
declare
  v_customer_a uuid := '45000000-0000-0000-0000-000000000001'::uuid;
  v_customer_b uuid := '45000000-0000-0000-0000-000000000002'::uuid;
  v_editor uuid := '45000000-0000-0000-0000-000000000003'::uuid;
  v_order_a uuid;
  v_order_b uuid;
  v_count integer;
  v_denied boolean;
  v_result jsonb;
begin
  -- Deterministic identities and two tenant-owned orders for isolation checks.
  set local role postgres;
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_customer_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'state45-customer-a@example.com', 'pwd', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
    (v_customer_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'state45-customer-b@example.com', 'pwd', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
    (v_editor, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'state45-editor@example.com', 'pwd', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now())
  on conflict (id) do nothing;
  insert into public.staff_roles (user_id, role) values (v_editor, 'editor')
  on conflict (user_id) do update set role = excluded.role;

  select id into v_order_a from public.orders order by created_at, id limit 1;
  select id into v_order_b from public.orders where id <> v_order_a order by created_at, id limit 1;
  if v_order_a is null or v_order_b is null then
    raise exception 'Security fixture requires at least two orders';
  end if;
  update public.orders set customer_user_id = v_customer_a where id = v_order_a;
  update public.orders set customer_user_id = v_customer_b where id = v_order_b;

  -- Anonymous cannot list private order, asset, or design-version rows.
  set local role anon;
  set local "request.jwt.claim.sub" = '';
  set local "request.jwt.claims" = '{"role":"anon"}';
  v_denied := false;
  begin
    select count(*) into v_count from public.orders;
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied and v_count <> 0 then raise exception 'anon can list orders'; end if;

  v_denied := false;
  begin
    select count(*) into v_count from public.assets;
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied and v_count <> 0 then raise exception 'anon can list assets'; end if;

  v_denied := false;
  begin
    select count(*) into v_count from public.design_versions;
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied and v_count <> 0 then raise exception 'anon can list design_versions'; end if;

  -- Customer A sees own order but not Customer B's order.
  set local role authenticated;
  set local "request.jwt.claim.sub" = v_customer_a::text;
  set local "request.jwt.claims" = jsonb_build_object('role', 'authenticated', 'sub', v_customer_a)::text;
  select count(*) into v_count from public.orders where id = v_order_a;
  if v_count <> 1 then raise exception 'customer A cannot read own order'; end if;
  select count(*) into v_count from public.orders where id = v_order_b;
  if v_count <> 0 then raise exception 'customer A can read customer B order'; end if;

  -- Editor cannot start or complete production through admin-only RPCs.
  set local "request.jwt.claim.sub" = v_editor::text;
  set local "request.jwt.claims" = jsonb_build_object('role', 'authenticated', 'sub', v_editor)::text;
  v_result := public.start_order_production(v_order_a, null, 'state45-editor-start');
  if v_result->>'code' is distinct from 'FORBIDDEN' then
    raise exception 'editor start production was not forbidden: %', v_result;
  end if;
  v_result := public.complete_order_production(v_order_a, null, 'state45-editor-complete');
  if v_result->>'code' is distinct from 'FORBIDDEN' then
    raise exception 'editor complete production was not forbidden: %', v_result;
  end if;
end;
$$;

rollback;
