-- State 44 catalog operations RPC tests
-- Verifies save_product_commercial_draft and publish_product_commercial_config
-- Tests signature correctness, 4-arg removal, 5-arg canonical RPC, and RBAC / revision guards
-- Run inside transaction with automatic rollback

begin;

do $$
declare
  v_nonstaff uuid := '44000000-0000-0000-0000-000000000001'::uuid;
  v_editor   uuid := '44000000-0000-0000-0000-000000000002'::uuid;
  v_admin    uuid := '44000000-0000-0000-0000-000000000003'::uuid;

  v_prod_id  text := 'test_ops_card';
  v_var_id   text := 'test_ops_var';
  v_draft_id uuid;
  v_res      jsonb;
  v_count    integer;
begin
  -- 1. Assert signature correctness in pg_proc
  -- 4-arg obsolete overload must NOT exist
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'publish_product_commercial_config'
      and p.pronargs = 4
  ) then
    raise exception 'Obsolete 4-argument publish_product_commercial_config still exists';
  end if;

  -- Canonical 5-arg overload must exist, use plpgsql, and be security definer
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
      and p.proname = 'publish_product_commercial_config'
      and p.pronargs = 5
      and l.lanname = 'plpgsql'
      and p.prosecdef = true
  ) then
    raise exception 'Canonical 5-argument publish_product_commercial_config with plpgsql and security definer not found';
  end if;

  -- save_product_commercial_draft must exist, use plpgsql, and be security definer
  if not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
      and p.proname = 'save_product_commercial_draft'
      and p.pronargs = 3
      and l.lanname = 'plpgsql'
      and p.prosecdef = true
  ) then
    raise exception 'save_product_commercial_draft with plpgsql and security definer not found';
  end if;

  -- 2. Setup fixtures
  insert into public.products (id, slug, name, product_type, active, status, revision)
  values (v_prod_id, 'test-ops-card', 'Thiệp Ops Test', 'card', false, 'draft', 1)
  on conflict (id) do nothing;

  insert into public.product_variants (id, product_id, name, price, active, status, definition_key, revision)
  values (v_var_id, v_prod_id, 'Biến thể Ops Test', 30000, true, 'active', 'card:horizontal', 1)
  on conflict (id) do nothing;

  insert into public.product_commercial_drafts (product_id, revision, payload, author_id)
  values (
    v_prod_id,
    1,
    jsonb_build_object(
      'currency', 'VND',
      'paymentPolicy', jsonb_build_object('kind', 'full_payment'),
      'variantRules', jsonb_build_array(
        jsonb_build_object(
          'variantId', v_var_id,
          'minimumQuantity', 1,
          'quantityStep', 1,
          'maximumQuantity', 100,
          'tiers', jsonb_build_array(
            jsonb_build_object('minimumQuantity', 1, 'unitPrice', 30000)
          )
        )
      )
    ),
    v_admin
  )
  returning id into v_draft_id;

  -- 3. RBAC: non-admin and editor cannot execute save or publish
  set local role authenticated;
  set local "request.jwt.claim.sub" = '44000000-0000-0000-0000-000000000002';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "44000000-0000-0000-0000-000000000002"}';

  v_res := public.save_product_commercial_draft(v_draft_id, 1, '{"currency":"VND"}'::jsonb);
  if (v_res->>'ok')::boolean = true or (v_res->>'code') <> 'FORBIDDEN' then
    raise exception 'Editor save draft should be rejected with FORBIDDEN, got %', v_res;
  end if;

  v_res := public.publish_product_commercial_config(v_prod_id, v_draft_id, 1, 1, 'req-editor');
  if (v_res->>'ok')::boolean = true or (v_res->>'code') <> 'FORBIDDEN' then
    raise exception 'Editor publish should be rejected with FORBIDDEN, got %', v_res;
  end if;

  -- 4. Admin operations
  set local "request.jwt.claim.sub" = '44000000-0000-0000-0000-000000000003';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "44000000-0000-0000-0000-000000000003"}';

  -- 4.1 Stale revision on save fails
  v_res := public.save_product_commercial_draft(v_draft_id, 999, '{"currency":"VND"}'::jsonb);
  if (v_res->>'ok')::boolean = true or (v_res->>'code') <> 'REVISION_CONFLICT' then
    raise exception 'Save with stale revision should return REVISION_CONFLICT, got %', v_res;
  end if;

  -- 4.2 Valid save succeeds and increments revision
  v_res := public.save_product_commercial_draft(
    v_draft_id,
    1,
    jsonb_build_object(
      'currency', 'VND',
      'paymentPolicy', jsonb_build_object('kind', 'full_payment'),
      'variantRules', jsonb_build_array(
        jsonb_build_object(
          'variantId', v_var_id,
          'minimumQuantity', 1,
          'quantityStep', 1,
          'maximumQuantity', 100,
          'tiers', jsonb_build_array(
            jsonb_build_object('minimumQuantity', 1, 'unitPrice', 28000)
          )
        )
      )
    )
  );
  if (v_res->>'ok')::boolean <> true or ((v_res->'draft'->>'revision')::bigint) <> 2 then
    raise exception 'Valid save should succeed with revision 2, got %', v_res;
  end if;

  -- 4.3 Stale publish fails
  v_res := public.publish_product_commercial_config(v_prod_id, v_draft_id, 1, 1, 'req-pub-stale');
  if (v_res->>'ok')::boolean = true or (v_res->>'code') <> 'REVISION_CONFLICT' then
    raise exception 'Publish with stale draft revision should return REVISION_CONFLICT, got %', v_res;
  end if;

  -- 4.4 Valid publish succeeds
  v_res := public.publish_product_commercial_config(v_prod_id, v_draft_id, 2, 1, 'req-pub-valid');
  if (v_res->>'ok')::boolean <> true then
    raise exception 'Valid publish should succeed, got %', v_res;
  end if;

  -- 4.5 Assert draft closed and audit event recorded
  select count(*) into v_count from public.product_commercial_drafts where id = v_draft_id;
  if v_count <> 0 then
    raise exception 'Draft must be deleted upon successful publish';
  end if;

  select count(*) into v_count
  from public.asset_events
  where target_id = v_prod_id and event = 'commercial_config_published';
  if v_count <> 1 then
    raise exception 'Expected exactly 1 commercial_config_published event, found %', v_count;
  end if;
end;
$$;

rollback;
