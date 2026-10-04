-- State 44 catalog and commercial schema invariant tests
-- Run inside transaction with automatic rollback

begin;

do $$
declare
  v_nonstaff uuid := '44000000-0000-0000-0000-000000000001'::uuid;
  v_editor   uuid := '44000000-0000-0000-0000-000000000002'::uuid;
  v_admin    uuid := '44000000-0000-0000-0000-000000000003'::uuid;

  v_prod_id  text := 'test_card_44';
  v_var_v_id text := 'vertical_44';
  v_var_h_id text := 'horizontal_44';
  v_ver_id   uuid := '44000000-0000-0000-0000-000000000101'::uuid;
  v_ver2_id  uuid := '44000000-0000-0000-0000-000000000102'::uuid;
  v_rule_id  uuid := '44000000-0000-0000-0000-000000000201'::uuid;
  v_tier_id  uuid := '44000000-0000-0000-0000-000000000301'::uuid;
  v_quote_id uuid := '44000000-0000-0000-0000-000000000401'::uuid;
  v_order_id uuid := '44000000-0000-0000-0000-000000000501'::uuid;
  v_draft_id uuid;

  v_res jsonb;
  v_failed boolean;
  v_count integer;
begin
  -- 0. Set up authenticated users & staff roles
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_nonstaff, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'nonstaff44@example.com', 'pwd', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
    (v_editor,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'editor44@example.com',   'pwd', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
    (v_admin,    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin44@example.com',    'pwd', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now())
  on conflict (id) do nothing;

  insert into public.staff_roles (user_id, role)
  values
    (v_editor, 'editor'),
    (v_admin, 'admin')
  on conflict (user_id) do update set role = excluded.role;

  -- 1. Assert existing IDs and columns remain valid
  insert into public.products (id, slug, name, product_type, active, status, revision)
  values (v_prod_id, 'test-card-44', 'Thiệp Thử Nghiệm 44', 'card', false, 'draft', 1);

  insert into public.product_variants (id, product_id, name, price, active, status, definition_key, revision)
  values
    (v_var_v_id, v_prod_id, 'Thiệp Đứng 44', 29000, false, 'draft', 'card:vertical', 1),
    (v_var_h_id, v_prod_id, 'Thiệp Ngang 44 (Chưa key)', 29000, false, 'draft', null, 1);

  -- 2. Create Commercial Version, Rules, Tiers (using migration bypass for initial setup)
  set local migration.allow_commercial_mutation = '1';

  insert into public.product_commercial_config_versions (
    id, product_id, version_number, currency, payment_policy, published_by
  ) values (
    v_ver_id, v_prod_id, 1, 'VND', '{"kind": "full_payment"}'::jsonb, v_admin
  );

  insert into public.commercial_variant_rules (
    id, version_id, variant_id, minimum_quantity, quantity_step, maximum_quantity
  ) values (
    v_rule_id, v_ver_id, v_var_v_id, 10, 5, 500
  );

  insert into public.commercial_pricing_tiers (
    id, rule_id, minimum_quantity, unit_price
  ) values (
    v_tier_id, v_rule_id, 10, 25000
  );

  -- Set current commercial version pointer on product
  update public.products
  set current_commercial_config_version_id = v_ver_id
  where id = v_prod_id;

  set local migration.allow_commercial_mutation = '0';

  -- 3. Assert Published Commercial Version, Rules, Tiers cannot UPDATE or DELETE
  -- 3.1 Version UPDATE rejection
  v_failed := false;
  begin
    update public.product_commercial_config_versions
    set currency = 'USD'
    where id = v_ver_id;
  exception when sqlstate 'P0001' then
    if sqlerrm = 'IMMUTABLE_COMMERCIAL_VERSION' then v_failed := true; end if;
  end;
  if not v_failed then
    raise exception 'Expected IMMUTABLE_COMMERCIAL_VERSION on version update';
  end if;

  -- 3.2 Version DELETE rejection
  v_failed := false;
  begin
    delete from public.product_commercial_config_versions where id = v_ver_id;
  exception when sqlstate 'P0001' then
    if sqlerrm = 'IMMUTABLE_COMMERCIAL_VERSION' then v_failed := true; end if;
  end;
  if not v_failed then
    raise exception 'Expected IMMUTABLE_COMMERCIAL_VERSION on version delete';
  end if;

  -- 3.3 Rule UPDATE rejection
  v_failed := false;
  begin
    update public.commercial_variant_rules set minimum_quantity = 20 where id = v_rule_id;
  exception when sqlstate 'P0001' then
    if sqlerrm = 'IMMUTABLE_COMMERCIAL_RULE' then v_failed := true; end if;
  end;
  if not v_failed then
    raise exception 'Expected IMMUTABLE_COMMERCIAL_RULE on rule update';
  end if;

  -- 3.4 Tier DELETE rejection
  v_failed := false;
  begin
    delete from public.commercial_pricing_tiers where id = v_tier_id;
  exception when sqlstate 'P0001' then
    if sqlerrm = 'IMMUTABLE_COMMERCIAL_TIER' then v_failed := true; end if;
  end;
  if not v_failed then
    raise exception 'Expected IMMUTABLE_COMMERCIAL_TIER on tier delete';
  end if;

  -- 4. Version numbers are unique under concurrent publication
  v_failed := false;
  begin
    set local migration.allow_commercial_mutation = '1';
    insert into public.product_commercial_config_versions (
      id, product_id, version_number, currency, payment_policy, published_by
    ) values (
      v_ver2_id, v_prod_id, 1, 'VND', '{"kind": "full_payment"}'::jsonb, v_admin
    );
    set local migration.allow_commercial_mutation = '0';
  exception when unique_violation then
    v_failed := true;
    set local migration.allow_commercial_mutation = '0';
  end;
  if not v_failed then
    raise exception 'Expected unique violation on duplicate (product_id, version_number)';
  end if;

  -- 5. Anonymous cannot read drafts, history, or unpublished versions
  -- 5.1 Create open draft
  insert into public.product_commercial_drafts (
    product_id, base_version_id, revision, payload, author_id
  ) values (
    v_prod_id, v_ver_id, 1, '{"tiers": [10, 20]}'::jsonb, v_editor
  ) returning id into v_draft_id;

  -- Test as Anon
  set local role anon;
  set local "request.jwt.claim.sub" = '';
  set local "request.jwt.claims" = '{"role": "anon"}';

  -- Anon select on drafts is blocked by revoked grant / RLS
  v_failed := false;
  begin
    perform count(*) from public.product_commercial_drafts;
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Expected anonymous select on product_commercial_drafts to fail with insufficient_privilege';
  end if;

  -- Anon sees 0 draft products (products is still draft)
  select count(*) into v_count from public.products where id = v_prod_id;
  if v_count <> 0 then
    raise exception 'Expected anon to see 0 draft products, got %', v_count;
  end if;

  -- Anon sees 0 commercial versions for draft product
  select count(*) into v_count from public.product_commercial_config_versions where id = v_ver_id;
  if v_count <> 0 then
    raise exception 'Expected anon to see 0 commercial versions for draft product, got %', v_count;
  end if;

  -- Reset role to postgres for setup
  reset role;

  -- 6. Activation validation gates
  -- 6.1 Variant activation without definition_key MUST FAIL
  set local role authenticated;
  set local "request.jwt.claim.sub" = '44000000-0000-0000-0000-000000000003';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "44000000-0000-0000-0000-000000000003"}';

  v_res := public.catalog_set_variant_status(v_var_h_id, 'active', 1);
  if (v_res->>'ok')::boolean = true or (v_res->>'code') <> 'MISSING_DEFINITION_KEY' then
    raise exception 'Expected MISSING_DEFINITION_KEY when activating variant without definition_key, got: %', v_res;
  end if;

  -- 6.2 Variant activation with valid definition_key succeeds
  v_res := public.catalog_set_variant_status(v_var_v_id, 'active', 1);
  if (v_res->>'ok')::boolean <> true then
    raise exception 'Expected valid variant activation to succeed, got: %', v_res;
  end if;

  -- 6.3 Product activation succeeds now that it has an active variant with definition_key and commercial config
  v_res := public.catalog_set_product_status(v_prod_id, 'active', 1);
  if (v_res->>'ok')::boolean <> true then
    raise exception 'Expected product activation to succeed, got: %', v_res;
  end if;

  -- Now test Anon can read sellable projection
  set local role anon;
  set local "request.jwt.claim.sub" = '';
  set local "request.jwt.claims" = '{"role": "anon"}';

  select count(*) into v_count from public.products where id = v_prod_id;
  if v_count <> 1 then
    raise exception 'Expected anon to read active product, got %', v_count;
  end if;

  select count(*) into v_count from public.product_commercial_config_versions where id = v_ver_id;
  if v_count <> 1 then
    raise exception 'Expected anon to read current commercial version of active product, got %', v_count;
  end if;

  select count(*) into v_count from public.commercial_variant_rules where id = v_rule_id;
  if v_count <> 1 then
    raise exception 'Expected anon to read commercial variant rule of visible product, got %', v_count;
  end if;

  -- 7. Nonstaff and Editor cannot mutate lifecycle or commercial tables
  -- 7.1 Nonstaff mutation denial
  set local role authenticated;
  set local "request.jwt.claim.sub" = '44000000-0000-0000-0000-000000000001';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "44000000-0000-0000-0000-000000000001"}';

  v_res := public.catalog_set_product_status(v_prod_id, 'draft', 2);
  if (v_res->>'ok')::boolean = true or (v_res->>'code') <> 'FORBIDDEN' then
    raise exception 'Expected FORBIDDEN for nonstaff catalog_set_product_status, got: %', v_res;
  end if;

  -- Direct update on products denied by revoked grant
  v_failed := false;
  begin
    update public.products set status = 'archived' where id = v_prod_id;
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Expected direct product update to fail with insufficient_privilege for nonstaff';
  end if;

  -- 7.2 Editor mutation denial
  set local role authenticated;
  set local "request.jwt.claim.sub" = '44000000-0000-0000-0000-000000000002';
  set local "request.jwt.claims" = '{"role": "authenticated", "sub": "44000000-0000-0000-0000-000000000002"}';

  v_res := public.catalog_set_product_status(v_prod_id, 'draft', 2);
  if (v_res->>'ok')::boolean = true or (v_res->>'code') <> 'FORBIDDEN' then
    raise exception 'Expected FORBIDDEN for editor catalog_set_product_status, got: %', v_res;
  end if;

  -- Direct update on product_variants denied for editor
  v_failed := false;
  begin
    update public.product_variants set status = 'archived' where id = v_var_v_id;
  exception when insufficient_privilege then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Expected direct variant update to fail with insufficient_privilege for editor';
  end if;

  -- 8. Structural Immutability once referenced in history
  reset role;

  -- Create order referencing product and variant
  insert into public.orders (
    id, public_order_code, quantity, unit_price, subtotal, total,
    customer_full_name, customer_phone, customer_phone_normalized,
    product_snapshot, variant_snapshot,
    commercial_config_version_id, payment_policy, deposit_amount, amount_due_now, remaining_amount, applied_tier_minimum_quantity
  ) values (
    v_order_id, 'QT4400-0001', 10, 25000, 250000, 250000,
    'Khách Hàng 44', '0900000044', '+84900000044',
    jsonb_build_object('id', v_prod_id, 'name', 'Thiệp Thử Nghiệm 44'),
    jsonb_build_object('id', v_var_v_id, 'name', 'Thiệp Đứng 44'),
    v_ver_id, '{"kind": "full_payment"}'::jsonb, 0, 250000, 0, 10
  );

  -- Mutating structural product_type on product referenced by order MUST fail
  v_failed := false;
  begin
    update public.products set product_type = 'sticker' where id = v_prod_id;
  exception when sqlstate 'P0001' then
    if sqlerrm = 'IMMUTABLE_PRODUCT_STRUCTURAL_IDENTITY' then v_failed := true; end if;
  end;
  if not v_failed then
    raise exception 'Expected IMMUTABLE_PRODUCT_STRUCTURAL_IDENTITY when changing product_type after sale';
  end if;

  -- Mutating definition_key on variant referenced by order MUST fail
  v_failed := false;
  begin
    update public.product_variants set definition_key = 'card:horizontal' where id = v_var_v_id;
  exception when sqlstate 'P0001' then
    if sqlerrm = 'IMMUTABLE_VARIANT_STRUCTURAL_IDENTITY' then v_failed := true; end if;
  end;
  if not v_failed then
    raise exception 'Expected IMMUTABLE_VARIANT_STRUCTURAL_IDENTITY when changing definition_key after sale';
  end if;

  -- 9. Order Payments purpose extension and composite uniqueness
  insert into public.order_payments (
    order_id, provider, amount, currency, reference, status, purpose
  ) values (
    v_order_id, 'vietqr', 50000, 'VND', 'REF44-DEP', 'pending_payment', 'checkout_deposit'
  );

  insert into public.order_payments (
    order_id, provider, amount, currency, reference, status, purpose
  ) values (
    v_order_id, 'vietqr', 200000, 'VND', 'REF44-FULL', 'pending_payment', 'full_order_payment'
  );

  -- Duplicate purpose for same order MUST fail
  v_failed := false;
  begin
    insert into public.order_payments (
      order_id, provider, amount, currency, reference, status, purpose
    ) values (
      v_order_id, 'vietqr', 10000, 'VND', 'REF44-DEP2', 'pending_payment', 'checkout_deposit'
    );
  exception when unique_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Expected unique violation on duplicate (order_id, purpose)';
  end if;

  -- 10. Price quotes table checks
  insert into public.price_quotes (
    id, product_id, variant_id, commercial_config_version_id, quantity,
    calculation, checkout_key_hash, expires_at
  ) values (
    v_quote_id, v_prod_id, v_var_v_id, v_ver_id, 10,
    jsonb_build_object('subtotal', 250000, 'unitPrice', 25000),
    'hash_key_123', now() + interval '30 minutes'
  );

  -- Link consumed order
  update public.price_quotes set consumed_order_id = v_order_id where id = v_quote_id;

  raise notice 'All State 44 catalog and commercial schema assertions passed.';
end $$;

rollback;
