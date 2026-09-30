-- State 40 Seed Data: Order Fulfillment & Production Lifecycle Fixtures
-- Safe for execution after 0001, 0002, 0003, 0004, 0005

do $$
declare
  v_project_id uuid := '00000000-0000-0000-0000-000000000040'::uuid;
  v_v1_id uuid := '00000000-0000-0000-0000-000000000401'::uuid;
  v_order_ready uuid := '00000000-0000-0000-0000-000000000501'::uuid;
  v_order_in_prod uuid := '00000000-0000-0000-0000-000000000502'::uuid;
  v_order_completed uuid := '00000000-0000-0000-0000-000000000503'::uuid;
  v_order_cancelled uuid := '00000000-0000-0000-0000-000000000504'::uuid;
  v_admin_id uuid;
begin
  select user_id into v_admin_id from public.staff_roles where role = 'admin' limit 1;
  if v_admin_id is null then
    select user_id into v_admin_id from public.staff_roles limit 1;
  end if;

  if v_admin_id is not null then
    -- Project
    insert into public.projects (id, product_id, current_design_document, created_at, updated_at)
    values (
      v_project_id,
      'sticker',
      '{"productId":"sticker","variantId":"die-cut","quantity":10,"borderWidth":2}'::jsonb,
      now(),
      now()
    )
    on conflict (id) do nothing;

    -- Version v1
    insert into public.design_versions (
      id, project_id, version_number, source, design_document,
      product_snapshot, preflight_snapshot, preflight_revision, created_by, created_at
    )
    values (
      v_v1_id, v_project_id, 1, 'customer_approved',
      '{"productId":"sticker","variantId":"die-cut","quantity":10,"borderWidth":2}'::jsonb,
      '{"productId":"sticker","variantId":"die-cut"}'::jsonb,
      '{"level":"pass","passCount":3,"warningCount":0,"errorCount":0,"checks":[]}'::jsonb,
      'rev-1', v_admin_id, now() - interval '3 days'
    )
    on conflict (id) do nothing;

    -- 1. Order Ready for Production
    insert into public.orders (
      id, public_order_code, project_id,
      customer_approved_design_version_id, production_design_version_id,
      quantity, unit_price, subtotal, total, customer_full_name, customer_phone,
      shipping_address, payment_status, design_status, fulfillment_status, idempotency_key
    )
    values (
      v_order_ready, 'QT40-READY', v_project_id,
      v_v1_id, v_v1_id,
      10, 19000, 190000, 190000, 'Nguyễn Thanh Tùng', '0911223344',
      '100 Hai Bà Trưng, Hà Nội', 'paid', 'approved', 'ready_for_production', 'idemp-qt40-001'
    )
    on conflict (id) do nothing;

    -- 2. Order In Production
    insert into public.orders (
      id, public_order_code, project_id,
      customer_approved_design_version_id, production_design_version_id,
      quantity, unit_price, subtotal, total, customer_full_name, customer_phone,
      shipping_address, payment_status, design_status, fulfillment_status, idempotency_key
    )
    values (
      v_order_in_prod, 'QT40-INPROD', v_project_id,
      v_v1_id, v_v1_id,
      20, 19000, 380000, 380000, 'Đỗ Hoàng Long', '0922334455',
      '200 Nguyễn Huệ, TP.HCM', 'paid', 'approved', 'in_production', 'idemp-qt40-002'
    )
    on conflict (id) do nothing;

    -- 3. Order Completed
    insert into public.orders (
      id, public_order_code, project_id,
      customer_approved_design_version_id, production_design_version_id,
      quantity, unit_price, subtotal, total, customer_full_name, customer_phone,
      shipping_address, payment_status, design_status, fulfillment_status, idempotency_key
    )
    values (
      v_order_completed, 'QT40-COMPLETED', v_project_id,
      v_v1_id, v_v1_id,
      5, 19000, 95000, 95000, 'Vũ Phương Linh', '0933445566',
      '300 Lê Lợi, Đà Nẵng', 'paid', 'approved', 'completed', 'idemp-qt40-003'
    )
    on conflict (id) do nothing;

    -- 4. Order Cancelled
    insert into public.orders (
      id, public_order_code, project_id,
      customer_approved_design_version_id, production_design_version_id,
      quantity, unit_price, subtotal, total, customer_full_name, customer_phone,
      shipping_address, payment_status, design_status, fulfillment_status, idempotency_key
    )
    values (
      v_order_cancelled, 'QT40-CANCELLED', v_project_id,
      v_v1_id, v_v1_id,
      1, 19000, 19000, 19000, 'Bùi Văn Hùng', '0944556677',
      '400 Trần Phú, Nha Trang', 'cancelled', 'awaiting_review', 'cancelled', 'idemp-qt40-004'
    )
    on conflict (id) do nothing;
  end if;
end $$;
