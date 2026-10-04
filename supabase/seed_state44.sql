-- State 44 Seed Data: Development & Test Fixtures
-- Includes:
-- 1. Draft Product with incomplete Variant config
-- 2. Active full-payment Product with two commercial versions
-- 3. Active fixed-deposit Product with validated tiers (synthetic test amount)
-- 4. Archived Product and archived Variant with historical Project/Template/Order references
-- Existing stable State 43 template target rows are untouched.

do $$
declare
  v_admin_id uuid;
  v_archived_proj_id uuid := '44000000-0000-4000-8000-000000004001'::uuid;
  v_archived_ver_id  uuid := '44000000-0000-4000-8000-000000004011'::uuid;
  v_archived_ord_id  uuid := '44000000-0000-4000-8000-000000005001'::uuid;
  v_archived_tpl_id  text := 'fixture-archived-template';
  v_archived_tver_id uuid := '44000000-0000-4000-8000-000000006001'::uuid;
  v_v1_order_proj_id uuid := '44000000-0000-4000-8000-000000004002'::uuid;
  v_v1_order_ver_id  uuid := '44000000-0000-4000-8000-000000004012'::uuid;
  v_v1_order_ord_id  uuid := '44000000-0000-4000-8000-000000005002'::uuid;
  v_deposit_proj_id  uuid := '44000000-0000-4000-8000-000000004003'::uuid;
  v_deposit_ver_id   uuid := '44000000-0000-4000-8000-000000004013'::uuid;
  v_deposit_ord_id   uuid := '44000000-0000-4000-8000-000000005003'::uuid;
begin
  select user_id into v_admin_id from public.staff_roles where role = 'admin' limit 1;
  if v_admin_id is null then
    select user_id into v_admin_id from public.staff_roles limit 1;
  end if;

  set local migration.allow_commercial_mutation = '1';

  -- =========================================================================
  -- Fixture 1: Draft Product with incomplete Variant config
  -- =========================================================================
  insert into public.products (
    id, slug, name, product_type, active, status, revision, metadata
  )
  values (
    'fixture-draft-product',
    'fixture-draft-product',
    'Sản phẩm thử nghiệm nháp',
    'card',
    false,
    'draft',
    1,
    jsonb_build_object(
      'state44Blockers', jsonb_build_array(
        jsonb_build_object('code', 'MISSING_COMMERCIAL_CONFIG', 'message', 'Chưa có cấu hình thương mại')
      )
    )
  )
  on conflict (id) do nothing;

  insert into public.product_variants (
    id, product_id, name, price, active, status, definition_key, revision, metadata
  )
  values (
    'fixture-draft-var',
    'fixture-draft-product',
    'Biến thể nháp chưa hoàn chỉnh',
    20000,
    false,
    'draft',
    'card:horizontal',
    1,
    jsonb_build_object(
      'state44Blockers', jsonb_build_array(
        jsonb_build_object('code', 'COMMERCIAL_CONFIG_INCOMPLETE', 'message', 'Chưa có quy tắc định giá thương mại')
      )
    )
  )
  on conflict (id) do nothing;

  -- =========================================================================
  -- Fixture 2: Active full-payment Product with two commercial versions
  -- =========================================================================
  insert into public.products (
    id, slug, name, product_type, active, status, revision, metadata
  )
  values (
    'fixture-active-full',
    'fixture-active-full',
    'Sản phẩm mẫu trả thẳng 2 phiên bản',
    'wrapping',
    true,
    'active',
    1,
    '{}'::jsonb
  )
  on conflict (id) do nothing;

  insert into public.product_variants (
    id, product_id, name, price, active, status, definition_key, revision
  )
  values
    ('fixture-full-var-1', 'fixture-active-full', 'Khổ chuẩn A1 Mẫu', 70000, true, 'active', 'wrapping:a1', 1),
    ('fixture-full-var-2', 'fixture-active-full', 'Khổ chuẩn A2 Mẫu', 50000, true, 'active', 'wrapping:a2', 1),
    ('fixture-full-var-archived', 'fixture-active-full', 'Khổ đặc biệt cũ (Đã lưu trữ)', 80000, false, 'archived', 'wrapping:a1', 1)
  on conflict (id) do nothing;

  -- Commercial version 1 (Historical)
  insert into public.product_commercial_config_versions (
    id, product_id, version_number, currency, payment_policy, published_by
  )
  values (
    '44000000-0000-4000-8000-000000001001'::uuid,
    'fixture-active-full',
    1,
    'VND',
    '{"kind": "full_payment"}'::jsonb,
    v_admin_id
  )
  on conflict (id) do nothing;

  insert into public.commercial_variant_rules (
    id, version_id, variant_id, minimum_quantity, quantity_step, maximum_quantity
  )
  values
    ('44000000-0000-4000-8000-000000001101'::uuid, '44000000-0000-4000-8000-000000001001'::uuid, 'fixture-full-var-1', 1, 1, null),
    ('44000000-0000-4000-8000-000000001102'::uuid, '44000000-0000-4000-8000-000000001001'::uuid, 'fixture-full-var-2', 1, 1, null),
    ('44000000-0000-4000-8000-000000001105'::uuid, '44000000-0000-4000-8000-000000001001'::uuid, 'fixture-full-var-archived', 1, 1, null)
  on conflict (id) do nothing;

  insert into public.commercial_pricing_tiers (
    id, rule_id, minimum_quantity, unit_price
  )
  values
    ('44000000-0000-4000-8000-000000001201'::uuid, '44000000-0000-4000-8000-000000001101'::uuid, 1, 70000),
    ('44000000-0000-4000-8000-000000001202'::uuid, '44000000-0000-4000-8000-000000001102'::uuid, 1, 50000),
    ('44000000-0000-4000-8000-000000001207'::uuid, '44000000-0000-4000-8000-000000001105'::uuid, 1, 80000)
  on conflict (id) do nothing;

  -- Commercial version 2 (Current published)
  insert into public.product_commercial_config_versions (
    id, product_id, version_number, currency, payment_policy, published_by
  )
  values (
    '44000000-0000-4000-8000-000000001002'::uuid,
    'fixture-active-full',
    2,
    'VND',
    '{"kind": "full_payment"}'::jsonb,
    v_admin_id
  )
  on conflict (id) do nothing;

  insert into public.commercial_variant_rules (
    id, version_id, variant_id, minimum_quantity, quantity_step, maximum_quantity
  )
  values
    ('44000000-0000-4000-8000-000000001103'::uuid, '44000000-0000-4000-8000-000000001002'::uuid, 'fixture-full-var-1', 5, 5, 100),
    ('44000000-0000-4000-8000-000000001104'::uuid, '44000000-0000-4000-8000-000000001002'::uuid, 'fixture-full-var-2', 5, 5, 100)
  on conflict (id) do nothing;

  insert into public.commercial_pricing_tiers (
    id, rule_id, minimum_quantity, unit_price
  )
  values
    ('44000000-0000-4000-8000-000000001203'::uuid, '44000000-0000-4000-8000-000000001103'::uuid, 5, 65000),
    ('44000000-0000-4000-8000-000000001204'::uuid, '44000000-0000-4000-8000-000000001103'::uuid, 20, 60000),
    ('44000000-0000-4000-8000-000000001205'::uuid, '44000000-0000-4000-8000-000000001104'::uuid, 5, 45000),
    ('44000000-0000-4000-8000-000000001206'::uuid, '44000000-0000-4000-8000-000000001104'::uuid, 20, 40000)
  on conflict (id) do nothing;

  update public.products
  set current_commercial_config_version_id = '44000000-0000-4000-8000-000000001002'::uuid
  where id = 'fixture-active-full';

  -- Historical Order fixed to Commercial Version 1 of fixture-active-full
  insert into public.projects (
    id, product_id, variant_id, current_design_document, created_at, updated_at
  )
  values (
    v_v1_order_proj_id,
    'fixture-active-full',
    'fixture-full-var-1',
    '{"productId":"fixture-active-full","variantId":"fixture-full-var-1"}'::jsonb,
    now() - interval '20 days',
    now() - interval '20 days'
  )
  on conflict (id) do nothing;

  insert into public.design_versions (
    id, project_id, version_number, source, design_document,
    product_snapshot, preflight_snapshot, created_by, created_at
  )
  values (
    v_v1_order_ver_id,
    v_v1_order_proj_id,
    1,
    'customizer',
    '{"productId":"fixture-active-full","variantId":"fixture-full-var-1"}'::jsonb,
    '{"productId":"fixture-active-full","variantId":"fixture-full-var-1"}'::jsonb,
    '{"level":"pass"}'::jsonb,
    v_admin_id,
    now() - interval '20 days'
  )
  on conflict (id) do nothing;

  insert into public.orders (
    id, public_order_code, project_id,
    customer_approved_design_version_id, production_design_version_id,
    commercial_config_version_id, payment_policy, amount_due_now, remaining_amount, applied_tier_minimum_quantity,
    quantity, unit_price, subtotal, total, customer_full_name, customer_phone, customer_phone_normalized,
    shipping_address, payment_status, design_status, fulfillment_status, idempotency_key,
    product_snapshot, variant_snapshot, created_at, updated_at
  )
  values (
    v_v1_order_ord_id,
    'QT44-V1-ORDER-01',
    v_v1_order_proj_id,
    v_v1_order_ver_id,
    v_v1_order_ver_id,
    '44000000-0000-4000-8000-000000001001'::uuid,
    '{"kind": "full_payment"}'::jsonb,
    70000,
    0,
    1,
    1,
    70000,
    70000,
    70000,
    'Nguyễn Văn V1',
    '0901231111',
    '+84901231111',
    '456 Đường Phiên Bản Một, TP.HCM',
    'paid',
    'approved',
    'completed',
    'idemp-qt44-v1-order-001',
    jsonb_build_object('id', 'fixture-active-full', 'name', 'Sản phẩm mẫu trả thẳng 2 phiên bản'),
    jsonb_build_object('id', 'fixture-full-var-1', 'name', 'Khổ chuẩn A1 Mẫu', 'price', 70000),
    now() - interval '20 days',
    now() - interval '20 days'
  )
  on conflict (id) do nothing;

  insert into public.order_payments (
    order_id, provider, amount, currency, reference, status, purpose, confirmed_at, updated_at
  )
  values (
    v_v1_order_ord_id,
    'vietqr',
    70000,
    'VND',
    'VQR-QT44-V1-01',
    'paid',
    'full_order_payment',
    now() - interval '20 days',
    now() - interval '20 days'
  )
  on conflict (order_id, purpose) do nothing;

  -- =========================================================================
  -- Fixture 3: Active fixed-deposit Product with validated tiers (Synthetic test amount)
  -- =========================================================================
  insert into public.products (
    id, slug, name, product_type, active, status, revision, metadata
  )
  values (
    'fixture-active-deposit',
    'fixture-active-deposit',
    'Sản phẩm mẫu đặt cọc cố định',
    'sticker',
    true,
    'active',
    1,
    '{}'::jsonb
  )
  on conflict (id) do nothing;

  insert into public.product_variants (
    id, product_id, name, price, active, status, definition_key, revision
  )
  values (
    'fixture-deposit-var',
    'fixture-active-deposit',
    'Sticker bế theo hình mẫu',
    15000,
    true,
    'active',
    'sticker:die-cut',
    1
  )
  on conflict (id) do nothing;

  -- Commercial version 1 with synthetic fixed deposit of 50000 VND
  -- Validated: min qty 10 * 15000 = 150000 >= 50000, qty 50 * 12000 = 600000 >= 50000
  insert into public.product_commercial_config_versions (
    id, product_id, version_number, currency, payment_policy, published_by
  )
  values (
    '44000000-0000-4000-8000-000000002001'::uuid,
    'fixture-active-deposit',
    1,
    'VND',
    '{"kind": "fixed_deposit", "depositAmount": 50000}'::jsonb,
    v_admin_id
  )
  on conflict (id) do nothing;

  insert into public.commercial_variant_rules (
    id, version_id, variant_id, minimum_quantity, quantity_step, maximum_quantity
  )
  values (
    '44000000-0000-4000-8000-000000002101'::uuid,
    '44000000-0000-4000-8000-000000002001'::uuid,
    'fixture-deposit-var',
    10,
    5,
    null
  )
  on conflict (id) do nothing;

  insert into public.commercial_pricing_tiers (
    id, rule_id, minimum_quantity, unit_price
  )
  values
    ('44000000-0000-4000-8000-000000002201'::uuid, '44000000-0000-4000-8000-000000002101'::uuid, 10, 15000),
    ('44000000-0000-4000-8000-000000002202'::uuid, '44000000-0000-4000-8000-000000002101'::uuid, 50, 12000)
  on conflict (id) do nothing;

  update public.products
  set current_commercial_config_version_id = '44000000-0000-4000-8000-000000002001'::uuid
  where id = 'fixture-active-deposit';

  -- Order with fixed deposit fixture in production
  insert into public.projects (
    id, product_id, variant_id, current_design_document, created_at, updated_at
  )
  values (
    v_deposit_proj_id,
    'fixture-active-deposit',
    'fixture-deposit-var',
    '{"productId":"fixture-active-deposit","variantId":"fixture-deposit-var"}'::jsonb,
    now() - interval '5 days',
    now() - interval '5 days'
  )
  on conflict (id) do nothing;

  insert into public.design_versions (
    id, project_id, version_number, source, design_document,
    product_snapshot, preflight_snapshot, created_by, created_at
  )
  values (
    v_deposit_ver_id,
    v_deposit_proj_id,
    1,
    'customizer',
    '{"productId":"fixture-active-deposit","variantId":"fixture-deposit-var"}'::jsonb,
    '{"productId":"fixture-active-deposit","variantId":"fixture-deposit-var"}'::jsonb,
    '{"level":"pass"}'::jsonb,
    v_admin_id,
    now() - interval '5 days'
  )
  on conflict (id) do nothing;

  insert into public.orders (
    id, public_order_code, project_id,
    customer_approved_design_version_id, production_design_version_id,
    commercial_config_version_id, payment_policy, amount_due_now, remaining_amount, applied_tier_minimum_quantity,
    quantity, unit_price, subtotal, total, customer_full_name, customer_phone, customer_phone_normalized,
    shipping_address, payment_status, design_status, fulfillment_status, idempotency_key,
    product_snapshot, variant_snapshot, created_at, updated_at
  )
  values (
    v_deposit_ord_id,
    'QT44-DEPOSIT-01',
    v_deposit_proj_id,
    v_deposit_ver_id,
    v_deposit_ver_id,
    '44000000-0000-4000-8000-000000002001'::uuid,
    '{"kind": "fixed_deposit", "depositAmount": 50000}'::jsonb,
    50000,
    100000,
    10,
    10,
    15000,
    150000,
    150000,
    'Phạm Thị Đặt Cọc',
    '0901237777',
    '+84901237777',
    '101 Đường Cọc Tiền, Hải Phòng',
    'deposit_confirmed',
    'approved',
    'in_production',
    'idemp-qt44-deposit-001',
    jsonb_build_object('id', 'fixture-active-deposit', 'name', 'Sản phẩm mẫu đặt cọc cố định'),
    jsonb_build_object('id', 'fixture-deposit-var', 'name', 'Sticker bế theo hình mẫu', 'price', 15000),
    now() - interval '5 days',
    now() - interval '5 days'
  )
  on conflict (id) do nothing;

  insert into public.order_payments (
    order_id, provider, amount, currency, reference, status, purpose, confirmed_at, updated_at
  )
  values (
    v_deposit_ord_id,
    'vietqr',
    50000,
    'VND',
    'VQR-QT44-DEP-01',
    'paid',
    'checkout_deposit',
    now() - interval '5 days',
    now() - interval '5 days'
  )
  on conflict (order_id, purpose) do nothing;

  -- =========================================================================
  -- Fixture 4: Archived Product & Archived Variant with historical references
  -- =========================================================================
  insert into public.products (
    id, slug, name, product_type, active, status, revision, metadata
  )
  values (
    'fixture-archived-product',
    'fixture-archived-product',
    'Sản phẩm mẫu đã lưu trữ',
    'notebook',
    false,
    'archived',
    1,
    '{}'::jsonb
  )
  on conflict (id) do nothing;

  insert into public.product_variants (
    id, product_id, name, price, active, status, definition_key, revision
  )
  values (
    'fixture-archived-var',
    'fixture-archived-product',
    'Bìa sổ mẫu đã lưu trữ',
    45000,
    false,
    'archived',
    'notebook:standard',
    1
  )
  on conflict (id) do nothing;

  insert into public.product_commercial_config_versions (
    id, product_id, version_number, currency, payment_policy, published_by
  )
  values (
    '44000000-0000-4000-8000-000000003001'::uuid,
    'fixture-archived-product',
    1,
    'VND',
    '{"kind": "full_payment"}'::jsonb,
    v_admin_id
  )
  on conflict (id) do nothing;

  insert into public.commercial_variant_rules (
    id, version_id, variant_id, minimum_quantity, quantity_step, maximum_quantity
  )
  values (
    '44000000-0000-4000-8000-000000003101'::uuid,
    '44000000-0000-4000-8000-000000003001'::uuid,
    'fixture-archived-var',
    1,
    1,
    null
  )
  on conflict (id) do nothing;

  insert into public.commercial_pricing_tiers (
    id, rule_id, minimum_quantity, unit_price
  )
  values (
    '44000000-0000-4000-8000-000000003201'::uuid,
    '44000000-0000-4000-8000-000000003101'::uuid,
    1,
    45000
  )
  on conflict (id) do nothing;

  update public.products
  set current_commercial_config_version_id = '44000000-0000-4000-8000-000000003001'::uuid
  where id = 'fixture-archived-product';

  -- Historical Project referencing archived product and variant
  insert into public.projects (
    id, product_id, variant_id, current_design_document, created_at, updated_at
  )
  values (
    v_archived_proj_id,
    'fixture-archived-product',
    'fixture-archived-var',
    '{"productId":"fixture-archived-product","variantId":"fixture-archived-var"}'::jsonb,
    now() - interval '30 days',
    now() - interval '30 days'
  )
  on conflict (id) do nothing;

  -- Historical Design Version
  insert into public.design_versions (
    id, project_id, version_number, source, design_document,
    product_snapshot, preflight_snapshot, created_by, created_at
  )
  values (
    v_archived_ver_id,
    v_archived_proj_id,
    1,
    'customizer',
    '{"productId":"fixture-archived-product","variantId":"fixture-archived-var"}'::jsonb,
    '{"productId":"fixture-archived-product","variantId":"fixture-archived-var"}'::jsonb,
    '{"level":"pass"}'::jsonb,
    v_admin_id,
    now() - interval '30 days'
  )
  on conflict (id) do nothing;

  -- Historical Template (insert without current version first)
  insert into public.templates (
    id, product_id, variant_id, slug, name, status, target_snapshot
  )
  values (
    v_archived_tpl_id,
    'fixture-archived-product',
    'fixture-archived-var',
    'fixture-archived-template',
    'Mẫu bìa sổ đã lưu trữ',
    'archived',
    '{"productId":"fixture-archived-product","variantId":"fixture-archived-var","surfaces":[{"id":"front","widthMm":148,"heightMm":210}]}'::jsonb
  )
  on conflict (id) do nothing;

  -- Historical Template Version
  insert into public.template_versions (
    id, template_id, version, design_document, target_snapshot
  )
  values (
    v_archived_tver_id,
    v_archived_tpl_id,
    1,
    '{"text":"Bìa sổ lịch sử"}'::jsonb,
    '{"productId":"fixture-archived-product","variantId":"fixture-archived-var","surfaces":[{"id":"front","widthMm":148,"heightMm":210}]}'::jsonb
  )
  on conflict (id) do nothing;

  -- Link current version on Template
  update public.templates
  set current_published_version_id = v_archived_tver_id
  where id = v_archived_tpl_id;

  -- Historical Order referencing archived product and variant
  insert into public.orders (
    id, public_order_code, project_id,
    customer_approved_design_version_id, production_design_version_id,
    commercial_config_version_id, payment_policy, amount_due_now, remaining_amount, applied_tier_minimum_quantity,
    quantity, unit_price, subtotal, total, customer_full_name, customer_phone, customer_phone_normalized,
    shipping_address, payment_status, design_status, fulfillment_status, idempotency_key,
    product_snapshot, variant_snapshot, created_at, updated_at
  )
  values (
    v_archived_ord_id,
    'QT44-ARCHIVED-01',
    v_archived_proj_id,
    v_archived_ver_id,
    v_archived_ver_id,
    '44000000-0000-4000-8000-000000003001'::uuid,
    '{"kind": "full_payment"}'::jsonb,
    45000,
    0,
    1,
    1,
    45000,
    45000,
    45000,
    'Lê Khắc Lưu Trữ',
    '0901239999',
    '+84901239999',
    '123 Đường Lịch Sử, Hà Nội',
    'paid',
    'approved',
    'completed',
    'idemp-qt44-archived-001',
    jsonb_build_object('id', 'fixture-archived-product', 'name', 'Sản phẩm mẫu đã lưu trữ'),
    jsonb_build_object('id', 'fixture-archived-var', 'name', 'Bìa sổ mẫu đã lưu trữ', 'price', 45000),
    now() - interval '25 days',
    now() - interval '25 days'
  )
  on conflict (id) do nothing;

  insert into public.order_payments (
    order_id, provider, amount, currency, reference, status, purpose, confirmed_at, updated_at
  )
  values (
    v_archived_ord_id,
    'vietqr',
    45000,
    'VND',
    'VQR-QT44-ARCH-01',
    'paid',
    'full_order_payment',
    now() - interval '25 days',
    now() - interval '25 days'
  )
  on conflict (order_id, purpose) do nothing;

  set local migration.allow_commercial_mutation = '0';
end $$;
