-- State 39 Seed Data: Design Revisions & Staff Draft Fixtures
-- Safe for execution after 0001, 0002, 0003, 0004

do $$
declare
  v_project_id uuid := '00000000-0000-0000-0000-000000000039'::uuid;
  v_v1_id uuid := '00000000-0000-0000-0000-000000000101'::uuid;
  v_v2_id uuid := '00000000-0000-0000-0000-000000000102'::uuid;
  v_order_editable uuid := '00000000-0000-0000-0000-000000000201'::uuid;
  v_order_active_draft uuid := '00000000-0000-0000-0000-000000000202'::uuid;
  v_draft_active uuid := '00000000-0000-0000-0000-000000000301'::uuid;
  v_order_v2 uuid := '00000000-0000-0000-0000-000000000203'::uuid;
  v_order_locked uuid := '00000000-0000-0000-0000-000000000204'::uuid;
  v_admin_id uuid;
begin
  select user_id into v_admin_id from public.staff_roles where role = 'admin' limit 1;
  if v_admin_id is null then
    -- Fallback to first available staff or null
    select user_id into v_admin_id from public.staff_roles limit 1;
  end if;

  if v_admin_id is not null then
    -- 1. Create project
    insert into public.projects (id, product_id, current_design_document, created_at, updated_at)
    values (
      v_project_id,
      'card',
      '{"productId":"card","variantId":"horizontal","quantity":1,"text":"Chúc mừng ngày nhà giáo"}'::jsonb,
      now(),
      now()
    )
    on conflict (id) do nothing;

    -- 2. Customer approved version v1
    insert into public.design_versions (
      id, project_id, version_number, source, design_document,
      product_snapshot, preflight_snapshot, preflight_revision, created_by, created_at
    )
    values (
      v_v1_id, v_project_id, 1, 'customer_approved',
      '{"productId":"card","variantId":"horizontal","quantity":1,"text":"Chúc mừng ngày nhà giáo","backgroundColor":"#ffffff"}'::jsonb,
      '{"productId":"card","variantId":"horizontal"}'::jsonb,
      '{"level":"pass","passCount":3,"warningCount":0,"errorCount":0,"checks":[]}'::jsonb,
      'rev-1', v_admin_id, now() - interval '2 days'
    )
    on conflict (id) do nothing;

    -- 3. Staff revision version v2
    insert into public.design_versions (
      id, project_id, version_number, source, design_document,
      product_snapshot, preflight_snapshot, preflight_revision, created_by,
      parent_design_version_id, revision_reason, created_at
    )
    values (
      v_v2_id, v_project_id, 2, 'admin_revision',
      '{"productId":"card","variantId":"horizontal","quantity":1,"text":"Chúc mừng ngày Nhà Giáo Việt Nam","backgroundColor":"#fff8f8"}'::jsonb,
      '{"productId":"card","variantId":"horizontal"}'::jsonb,
      '{"level":"pass","passCount":3,"warningCount":0,"errorCount":0,"checks":[]}'::jsonb,
      'rev-2', v_admin_id, v_v1_id, 'Chỉnh sửa chính tả và màu nền', now() - interval '1 day'
    )
    on conflict (id) do nothing;

    -- 4. Order 1: Editable v1 (customer == production)
    insert into public.orders (
      id, public_order_code, project_id,
      customer_approved_design_version_id, production_design_version_id,
      quantity, unit_price, subtotal, total, customer_full_name, customer_phone,
      shipping_address, payment_status, design_status, fulfillment_status, idempotency_key
    )
    values (
      v_order_editable, 'QT39-EDITABLE', v_project_id,
      v_v1_id, v_v1_id,
      1, 29000, 29000, 29000, 'Lê Thị Thu', '0912345678',
      '123 Hoàn Kiếm, Hà Nội', 'paid', 'awaiting_review', 'unprocessed', 'idemp-qt39-001'
    )
    on conflict (id) do nothing;

    -- 5. Order 2: Has active draft
    insert into public.orders (
      id, public_order_code, project_id,
      customer_approved_design_version_id, production_design_version_id,
      quantity, unit_price, subtotal, total, customer_full_name, customer_phone,
      shipping_address, payment_status, design_status, fulfillment_status, idempotency_key
    )
    values (
      v_order_active_draft, 'QT39-DRAFTING', v_project_id,
      v_v1_id, v_v1_id,
      1, 29000, 29000, 29000, 'Trần Minh Đức', '0987654321',
      '456 Cầu Giấy, Hà Nội', 'paid', 'editing', 'unprocessed', 'idemp-qt39-002'
    )
    on conflict (id) do nothing;

    -- Draft for Order 2
    insert into public.design_revision_drafts (
      id, order_id, project_id, base_design_version_id, expected_production_design_version_id,
      document, revision, reason, status, created_by, editor_user_id,
      lease_session_id, lease_epoch, lease_expires_at, prior_design_status
    )
    values (
      v_draft_active, v_order_active_draft, v_project_id, v_v1_id, v_v1_id,
      '{"productId":"card","variantId":"horizontal","quantity":1,"text":"Chúc mừng ngày Nhà Giáo"}'::jsonb,
      1, 'Căn chỉnh chữ tiêu đề', 'editing', v_admin_id, v_admin_id,
      gen_random_uuid(), 1, now() + interval '120 seconds', 'awaiting_review'
    )
    on conflict (id) do nothing;

    -- 6. Order 3: Already has v2 production
    insert into public.orders (
      id, public_order_code, project_id,
      customer_approved_design_version_id, production_design_version_id,
      quantity, unit_price, subtotal, total, customer_full_name, customer_phone,
      shipping_address, payment_status, design_status, fulfillment_status, idempotency_key
    )
    values (
      v_order_v2, 'QT39-APPROVED-V2', v_project_id,
      v_v1_id, v_v2_id,
      1, 29000, 29000, 29000, 'Nguyễn Mai Anh', '0909090909',
      '789 Ba Đình, Hà Nội', 'paid', 'approved', 'ready_for_production', 'idemp-qt39-003'
    )
    on conflict (id) do nothing;

    -- 7. Order 4: Locked (in_production)
    insert into public.orders (
      id, public_order_code, project_id,
      customer_approved_design_version_id, production_design_version_id,
      quantity, unit_price, subtotal, total, customer_full_name, customer_phone,
      shipping_address, payment_status, design_status, fulfillment_status, idempotency_key
    )
    values (
      v_order_locked, 'QT39-IN-PROD', v_project_id,
      v_v1_id, v_v2_id,
      1, 29000, 29000, 29000, 'Phạm Quốc Hùng', '0933333333',
      '12 Đống Đa, Hà Nội', 'paid', 'approved', 'in_production', 'idemp-qt39-004'
    )
    on conflict (id) do nothing;
  end if;
end $$;
