-- Migration: 0004_state39_design_revisions.sql
-- State 39: Admin Design Review & Edit, Lineage and Immutable Production Revisions

-- 1. Migration precheck: requires State 38 schema
do $$
begin
  if not exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'order_holds'
  ) then
    raise exception 'Migration prerequisite 0003_state38_order_operations is missing';
  end if;
end $$;

-- 2. Version pointers cutover on public.orders
alter table public.orders
  rename column approved_design_version_id to customer_approved_design_version_id;

alter table public.orders
  add column if not exists production_design_version_id uuid references public.design_versions(id) on delete restrict;

-- Backfill production pointer from customer pointer
update public.orders
set production_design_version_id = customer_approved_design_version_id
where production_design_version_id is null;

alter table public.orders
  alter column production_design_version_id set not null;

-- Strengthen customer pointer foreign key to RESTRICT
alter table public.orders
  drop constraint if exists orders_approved_design_version_id_fkey,
  drop constraint if exists orders_customer_approved_design_version_id_fkey;

alter table public.orders
  add constraint orders_customer_approved_design_version_id_fkey
  foreign key (customer_approved_design_version_id)
  references public.design_versions(id)
  on delete restrict;

-- Trigger: protect customer_approved_design_version_id against any update
create or replace function public.trig_protect_customer_design_version()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' and old.customer_approved_design_version_id is distinct from new.customer_approved_design_version_id then
    raise exception 'customer_approved_design_version_id is immutable and cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists tr_protect_customer_design_version on public.orders;
create trigger tr_protect_customer_design_version
  before update on public.orders
  for each row
  execute function public.trig_protect_customer_design_version();

-- 3. Design Versions Lineage and Immutability
alter table public.design_versions
  add column if not exists parent_design_version_id uuid references public.design_versions(id) on delete restrict,
  add column if not exists revision_reason text null,
  add column if not exists revision_draft_id uuid null;

create unique index if not exists design_versions_one_result_per_draft
  on public.design_versions(revision_draft_id)
  where revision_draft_id is not null;

-- Ensure projects delete restrict for design_versions (history preservation)
alter table public.design_versions
  drop constraint if exists design_versions_project_id_fkey;

alter table public.design_versions
  add constraint design_versions_project_id_fkey
  foreign key (project_id)
  references public.projects(id)
  on delete restrict;

-- Trigger: protect committed design_versions against UPDATE or DELETE
create or replace function public.trig_protect_design_version_immutability()
returns trigger
language plpgsql
as $$
begin
  raise exception 'design_versions table is append-only; update and delete are not permitted';
end;
$$;

drop trigger if exists tr_protect_design_version_immutability on public.design_versions;
create trigger tr_protect_design_version_immutability
  before update or delete on public.design_versions
  for each row
  execute function public.trig_protect_design_version_immutability();

-- Revoke direct mutation on design_versions
revoke insert, update, delete on table public.design_versions from public, anon, authenticated;
drop policy if exists "Allow staff manage design versions" on public.design_versions;

-- 4. Staff Design Revision Drafts Table
create table if not exists public.design_revision_drafts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  base_design_version_id uuid not null references public.design_versions(id) on delete restrict,
  expected_production_design_version_id uuid not null references public.design_versions(id) on delete restrict,
  document jsonb not null,
  revision bigint not null default 1 check (revision >= 1),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  status text not null check (status in ('editing', 'ready_for_review', 'approved', 'discarded')),
  created_by uuid not null references auth.users(id),
  editor_user_id uuid not null references auth.users(id),
  lease_session_id uuid null,
  lease_epoch bigint not null default 1,
  lease_expires_at timestamptz null,
  last_activity_at timestamptz not null default now(),
  prior_design_status text not null,
  last_save_request_id text null,
  last_document_hash text null,
  last_result_revision bigint null,
  approved_design_version_id uuid null references public.design_versions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Exactly one active draft (editing or ready_for_review) per order
create unique index if not exists design_revision_drafts_one_active_order
  on public.design_revision_drafts(order_id)
  where status in ('editing', 'ready_for_review');

create index if not exists design_revision_drafts_order_id_idx
  on public.design_revision_drafts(order_id);

create index if not exists design_revision_drafts_editor_user_id_idx
  on public.design_revision_drafts(editor_user_id);

create index if not exists design_revision_drafts_base_version_idx
  on public.design_revision_drafts(base_design_version_id);

-- 5. Idempotent Operation Requests Table
create table if not exists public.design_revision_requests (
  actor_user_id uuid not null references auth.users(id),
  operation text not null,
  request_id text not null,
  target_id uuid not null,
  input_hash text not null,
  result_payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_user_id, operation, request_id)
);

-- 6. Server Preflight Assessments Table (Private to server)
create table if not exists public.design_preflight_assessments (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid null references public.design_revision_drafts(id) on delete cascade,
  version_id uuid null references public.design_versions(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  revision bigint null,
  document_hash text not null,
  expected_production_version_id uuid not null references public.design_versions(id),
  base_version_id uuid not null references public.design_versions(id),
  actor_user_id uuid not null references auth.users(id),
  lease_epoch bigint not null,
  validator_version text not null,
  product_config_hash text not null,
  asset_manifest_hash text not null,
  findings jsonb not null,
  warning_ids text[] not null default '{}',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((draft_id is not null and version_id is null) or (draft_id is null and version_id is not null))
);

-- 7. Manifest Join Tables
create table if not exists public.design_version_assets (
  version_id uuid not null references public.design_versions(id) on delete restrict,
  asset_id uuid not null references public.assets(id) on delete restrict,
  kind text not null,
  checksum text null,
  created_at timestamptz not null default now(),
  primary key (version_id, asset_id)
);

create table if not exists public.design_draft_assets (
  draft_id uuid not null references public.design_revision_drafts(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  kind text not null,
  checksum text null,
  created_at timestamptz not null default now(),
  primary key (draft_id, asset_id)
);

-- 8. Render Artifacts & Outbox Jobs
create table if not exists public.design_version_renders (
  version_id uuid primary key references public.design_versions(id) on delete restrict,
  storage_path text not null unique,
  checksum text null,
  created_at timestamptz not null default now()
);

create table if not exists public.design_render_jobs (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null unique references public.design_versions(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  status text not null check (status in ('pending', 'running', 'failed', 'completed')) default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claim_expires_at timestamptz null,
  error_code text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists design_render_jobs_status_next_attempt_idx
  on public.design_render_jobs(status, next_attempt_at)
  where status in ('pending', 'failed');

-- 9. Grants and RLS
alter table public.design_revision_drafts enable row level security;
alter table public.design_revision_requests enable row level security;
alter table public.design_preflight_assessments enable row level security;
alter table public.design_version_assets enable row level security;
alter table public.design_draft_assets enable row level security;
alter table public.design_version_renders enable row level security;
alter table public.design_render_jobs enable row level security;

-- Revoke direct writes on operational tables from public, anon, authenticated
revoke insert, update, delete on table
  public.design_revision_drafts,
  public.design_revision_requests,
  public.design_preflight_assessments,
  public.design_version_assets,
  public.design_draft_assets,
  public.design_version_renders,
  public.design_render_jobs
from public, anon, authenticated;

-- Staff SELECT grants
grant select on table
  public.design_revision_drafts,
  public.design_version_assets,
  public.design_draft_assets,
  public.design_version_renders
to authenticated;

create policy "Allow staff read design revision drafts"
  on public.design_revision_drafts for select
  using (public.is_staff());

create policy "Allow staff read design version assets"
  on public.design_version_assets for select
  using (public.is_staff());

create policy "Allow staff read design draft assets"
  on public.design_draft_assets for select
  using (public.is_staff());

create policy "Allow staff read design version renders"
  on public.design_version_renders for select
  using (public.is_staff());

-- 10. RPCs: Atomic State 39 Operations

-- A. create_design_revision_draft
create or replace function public.create_design_revision_draft(
  p_order_id uuid,
  p_base_version_id uuid,
  p_expected_production_version_id uuid,
  p_reason text,
  p_session_id uuid,
  p_request_id text,
  p_input_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_role text;
  v_order record;
  v_base_version record;
  v_existing_req record;
  v_active_draft record;
  v_draft_id uuid;
  v_trimmed_reason text;
  v_lease_duration interval := interval '120 seconds';
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập');
  end if;

  select role into v_role from public.staff_roles where user_id = v_actor_id;
  if v_role is null or (v_role <> 'admin' and v_role <> 'editor') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Không có quyền truy cập');
  end if;

  v_trimmed_reason := btrim(p_reason);
  if char_length(v_trimmed_reason) < 3 or char_length(v_trimmed_reason) > 500 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REASON', 'message', 'Lý do phải từ 3 đến 500 ký tự');
  end if;

  -- Check idempotent request
  select * into v_existing_req
  from public.design_revision_requests
  where actor_user_id = v_actor_id and operation = 'create_draft' and request_id = p_request_id;
  if found then
    if v_existing_req.input_hash <> p_input_hash then
      return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT', 'message', 'Mã yêu cầu trùng lặp với tham số khác');
    end if;
    return v_existing_req.result_payload;
  end if;

  -- Lock Order row first
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_LOCKED', 'message', 'Đơn hàng không tồn tại');
  end if;

  if v_order.fulfillment_status not in ('unprocessed', 'ready_for_production') then
    return jsonb_build_object('ok', false, 'code', 'ORDER_LOCKED', 'message', 'Đơn hàng đã vào sản xuất hoặc đã hủy, không thể chỉnh sửa');
  end if;

  if v_order.production_design_version_id <> p_expected_production_version_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CHANGED', 'message', 'Phiên bản sản xuất đã thay đổi');
  end if;

  -- Lock and validate base version belongs to order project
  select * into v_base_version from public.design_versions where id = p_base_version_id;
  if not found or v_base_version.project_id <> v_order.project_id then
    return jsonb_build_object('ok', false, 'code', 'INVALID_DOCUMENT', 'message', 'Phiên bản gốc không thuộc dự án của đơn hàng');
  end if;

  -- Check if active draft already exists
  select * into v_active_draft
  from public.design_revision_drafts
  where order_id = p_order_id and status in ('editing', 'ready_for_review')
  for update;

  if found then
    return jsonb_build_object('ok', false, 'code', 'ACTIVE_DRAFT_EXISTS', 'message', 'Đơn hàng đã có bản nháp đang chỉnh sửa');
  end if;

  -- Insert new draft
  v_draft_id := gen_random_uuid();
  insert into public.design_revision_drafts (
    id,
    order_id,
    project_id,
    base_design_version_id,
    expected_production_design_version_id,
    document,
    revision,
    reason,
    status,
    created_by,
    editor_user_id,
    lease_session_id,
    lease_epoch,
    lease_expires_at,
    last_activity_at,
    prior_design_status,
    created_at,
    updated_at
  )
  values (
    v_draft_id,
    p_order_id,
    v_order.project_id,
    p_base_version_id,
    p_expected_production_version_id,
    v_base_version.design_document,
    1,
    v_trimmed_reason,
    'editing',
    v_actor_id,
    v_actor_id,
    p_session_id,
    1,
    clock_timestamp() + v_lease_duration,
    clock_timestamp(),
    v_order.design_status,
    clock_timestamp(),
    clock_timestamp()
  );

  -- Update order design status to editing
  update public.orders
  set
    design_status = 'editing',
    updated_at = clock_timestamp()
  where id = p_order_id;

  -- Append exactly one design_draft_created event
  insert into public.order_events (
    order_id,
    event_type,
    actor_user_id,
    actor_role,
    payload,
    created_at
  )
  values (
    p_order_id,
    'design_draft_created',
    v_actor_id,
    v_role,
    jsonb_build_object(
      'draft_id', v_draft_id,
      'base_version_id', p_base_version_id,
      'reason', v_trimmed_reason
    ),
    clock_timestamp()
  );

  -- Record request result for idempotency
  insert into public.design_revision_requests (
    actor_user_id,
    operation,
    request_id,
    target_id,
    input_hash,
    result_payload
  )
  values (
    v_actor_id,
    'create_draft',
    p_request_id,
    v_draft_id,
    p_input_hash,
    jsonb_build_object(
      'ok', true,
      'value', jsonb_build_object(
        'id', v_draft_id,
        'orderId', p_order_id,
        'projectId', v_order.project_id,
        'baseDesignVersionId', p_base_version_id,
        'expectedProductionDesignVersionId', p_expected_production_version_id,
        'document', v_base_version.design_document,
        'revision', 1,
        'reason', v_trimmed_reason,
        'status', 'editing',
        'createdBy', v_actor_id,
        'editorUserId', v_actor_id,
        'lease', jsonb_build_object(
          'sessionId', p_session_id,
          'epoch', 1,
          'expiresAt', (clock_timestamp() + v_lease_duration)
        ),
        'createdAt', clock_timestamp(),
        'updatedAt', clock_timestamp(),
        'approvedDesignVersionId', null
      )
    )
  );

  return jsonb_build_object(
    'ok', true,
    'value', jsonb_build_object(
      'id', v_draft_id,
      'orderId', p_order_id,
      'projectId', v_order.project_id,
      'baseDesignVersionId', p_base_version_id,
      'expectedProductionDesignVersionId', p_expected_production_version_id,
      'document', v_base_version.design_document,
      'revision', 1,
      'reason', v_trimmed_reason,
      'status', 'editing',
      'createdBy', v_actor_id,
      'editorUserId', v_actor_id,
      'lease', jsonb_build_object(
        'sessionId', p_session_id,
        'epoch', 1,
        'expiresAt', (clock_timestamp() + v_lease_duration)
      ),
      'createdAt', clock_timestamp(),
      'updatedAt', clock_timestamp(),
      'approvedDesignVersionId', null
    )
  );
end;
$$;

-- B. heartbeat_draft_lease
create or replace function public.heartbeat_draft_lease(
  p_draft_id uuid,
  p_session_id uuid,
  p_epoch bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_draft record;
  v_lease_duration interval := interval '120 seconds';
  v_expires_at timestamptz;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập');
  end if;

  select * into v_draft from public.design_revision_drafts where id = p_draft_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'DRAFT_CLOSED', 'message', 'Bản nháp không tồn tại');
  end if;

  if v_draft.status not in ('editing', 'ready_for_review') then
    return jsonb_build_object('ok', false, 'code', 'DRAFT_CLOSED', 'message', 'Bản nháp đã đóng');
  end if;

  if v_draft.editor_user_id <> v_actor_id or v_draft.lease_session_id <> p_session_id or v_draft.lease_epoch <> p_epoch then
    return jsonb_build_object('ok', false, 'code', 'LEASE_LOST', 'message', 'Quyền chỉnh sửa đã bị chuyển sang phiên khác');
  end if;

  v_expires_at := clock_timestamp() + v_lease_duration;
  update public.design_revision_drafts
  set
    lease_expires_at = v_expires_at,
    last_activity_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where id = p_draft_id;

  return jsonb_build_object(
    'ok', true,
    'value', jsonb_build_object(
      'sessionId', p_session_id,
      'epoch', p_epoch,
      'expiresAt', v_expires_at
    )
  );
end;
$$;

-- C. save_design_revision_draft
create or replace function public.save_design_revision_draft(
  p_draft_id uuid,
  p_expected_revision bigint,
  p_expected_production_version_id uuid,
  p_session_id uuid,
  p_epoch bigint,
  p_request_id text,
  p_document jsonb,
  p_document_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_draft record;
  v_order record;
  v_next_revision bigint;
  v_lease_duration interval := interval '120 seconds';
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập');
  end if;

  -- Lock Draft
  select * into v_draft from public.design_revision_drafts where id = p_draft_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'DRAFT_CLOSED', 'message', 'Bản nháp không tồn tại');
  end if;

  if v_draft.status not in ('editing', 'ready_for_review') then
    return jsonb_build_object('ok', false, 'code', 'DRAFT_CLOSED', 'message', 'Bản nháp đã được đóng');
  end if;

  -- Check idempotent save
  if v_draft.last_save_request_id = p_request_id then
    if v_draft.last_document_hash = p_document_hash then
      return jsonb_build_object(
        'ok', true,
        'value', jsonb_build_object(
          'revision', v_draft.last_result_revision,
          'updatedAt', v_draft.updated_at,
          'requestId', p_request_id
        )
      );
    else
      return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT', 'message', 'Mã yêu cầu lưu trùng lặp với nội dung khác');
    end if;
  end if;

  -- Check lease
  if v_draft.editor_user_id <> v_actor_id or v_draft.lease_session_id <> p_session_id or v_draft.lease_epoch <> p_epoch then
    return jsonb_build_object('ok', false, 'code', 'LEASE_LOST', 'message', 'Phiên làm việc đã hết hạn hoặc bị chiếm quyền');
  end if;

  -- Check revision CAS
  if v_draft.revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT', 'message', 'Bản nháp đã có phiên bản chỉnh sửa mới hơn');
  end if;

  -- Lock Order
  select * into v_order from public.orders where id = v_draft.order_id for update;
  if v_order.fulfillment_status not in ('unprocessed', 'ready_for_production') then
    return jsonb_build_object('ok', false, 'code', 'ORDER_LOCKED', 'message', 'Đơn hàng đã vào sản xuất');
  end if;

  if v_order.production_design_version_id <> p_expected_production_version_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CHANGED', 'message', 'Phiên bản sản xuất của đơn hàng đã thay đổi');
  end if;

  v_next_revision := v_draft.revision + 1;

  -- Invalidate any pending preflight assessments for this draft
  delete from public.design_preflight_assessments where draft_id = p_draft_id;

  update public.design_revision_drafts
  set
    document = p_document,
    revision = v_next_revision,
    status = 'editing',
    last_save_request_id = p_request_id,
    last_document_hash = p_document_hash,
    last_result_revision = v_next_revision,
    last_activity_at = clock_timestamp(),
    lease_expires_at = clock_timestamp() + v_lease_duration,
    updated_at = clock_timestamp()
  where id = p_draft_id;

  return jsonb_build_object(
    'ok', true,
    'value', jsonb_build_object(
      'revision', v_next_revision,
      'updatedAt', clock_timestamp(),
      'requestId', p_request_id
    )
  );
end;
$$;

-- D. discard_design_revision_draft
create or replace function public.discard_design_revision_draft(
  p_draft_id uuid,
  p_expected_revision bigint,
  p_expected_production_version_id uuid,
  p_session_id uuid,
  p_epoch bigint,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_role text;
  v_draft record;
  v_order record;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập');
  end if;

  select role into v_role from public.staff_roles where user_id = v_actor_id;
  if v_role is null or (v_role <> 'admin' and v_role <> 'editor') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Không có quyền truy cập');
  end if;

  select * into v_draft from public.design_revision_drafts where id = p_draft_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'DRAFT_CLOSED', 'message', 'Bản nháp không tồn tại');
  end if;

  if v_draft.status = 'discarded' then
    return jsonb_build_object('ok', true, 'value', jsonb_build_object('draftId', p_draft_id, 'status', 'discarded'));
  end if;

  if v_draft.status <> 'editing' and v_draft.status <> 'ready_for_review' then
    return jsonb_build_object('ok', false, 'code', 'DRAFT_CLOSED', 'message', 'Bản nháp đã đóng');
  end if;

  if v_draft.editor_user_id <> v_actor_id or v_draft.lease_session_id <> p_session_id or v_draft.lease_epoch <> p_epoch then
    return jsonb_build_object('ok', false, 'code', 'LEASE_LOST', 'message', 'Chỉ người nắm quyền chỉnh sửa mới có thể hủy bản nháp');
  end if;

  if v_draft.revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT', 'message', 'Phiên bản bản nháp không khớp');
  end if;

  select * into v_order from public.orders where id = v_draft.order_id for update;
  if v_order.production_design_version_id <> p_expected_production_version_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CHANGED', 'message', 'Phiên bản sản xuất đã thay đổi');
  end if;

  -- Mark discarded and release lease
  update public.design_revision_drafts
  set
    status = 'discarded',
    lease_session_id = null,
    lease_expires_at = null,
    updated_at = clock_timestamp()
  where id = p_draft_id;

  -- Restore order design_status if production untouched
  update public.orders
  set
    design_status = v_draft.prior_design_status,
    updated_at = clock_timestamp()
  where id = v_draft.order_id;

  -- Append event
  insert into public.order_events (
    order_id,
    event_type,
    actor_user_id,
    actor_role,
    payload,
    created_at
  )
  values (
    v_draft.order_id,
    'design_draft_discarded',
    v_actor_id,
    v_role,
    jsonb_build_object('draft_id', p_draft_id),
    clock_timestamp()
  );

  return jsonb_build_object('ok', true, 'value', jsonb_build_object('draftId', p_draft_id, 'status', 'discarded'));
end;
$$;

-- E. takeover_draft_lease (Admin only, expired lease takeover)
create or replace function public.takeover_draft_lease(
  p_draft_id uuid,
  p_expected_epoch bigint,
  p_session_id uuid,
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_role text;
  v_draft record;
  v_prev_editor uuid;
  v_next_epoch bigint;
  v_lease_duration interval := interval '120 seconds';
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập');
  end if;

  select role into v_role from public.staff_roles where user_id = v_actor_id;
  if v_role is null or v_role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Chỉ Quản trị viên (Admin) mới có quyền tiếp quản bản nháp');
  end if;

  select * into v_draft from public.design_revision_drafts where id = p_draft_id for update;
  if not found or v_draft.status not in ('editing', 'ready_for_review') then
    return jsonb_build_object('ok', false, 'code', 'DRAFT_CLOSED', 'message', 'Bản nháp không còn hoạt động');
  end if;

  if v_draft.lease_epoch <> p_expected_epoch then
    return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT', 'message', 'Epoch phiên làm việc đã thay đổi');
  end if;

  if v_draft.lease_expires_at is not null and v_draft.lease_expires_at > clock_timestamp() then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Phiên làm việc của nhân viên khác vẫn đang còn hiệu lực');
  end if;

  v_prev_editor := v_draft.editor_user_id;
  v_next_epoch := v_draft.lease_epoch + 1;

  update public.design_revision_drafts
  set
    editor_user_id = v_actor_id,
    lease_session_id = p_session_id,
    lease_epoch = v_next_epoch,
    lease_expires_at = clock_timestamp() + v_lease_duration,
    last_activity_at = clock_timestamp(),
    updated_at = clock_timestamp()
  where id = p_draft_id;

  insert into public.order_events (
    order_id,
    event_type,
    actor_user_id,
    actor_role,
    payload,
    created_at
  )
  values (
    v_draft.order_id,
    'design_draft_taken_over',
    v_actor_id,
    'admin',
    jsonb_build_object(
      'draft_id', p_draft_id,
      'previous_editor_id', v_prev_editor,
      'new_editor_id', v_actor_id,
      'epoch', v_next_epoch
    ),
    clock_timestamp()
  );

  return jsonb_build_object(
    'ok', true,
    'value', jsonb_build_object(
      'id', v_draft.id,
      'orderId', v_draft.order_id,
      'projectId', v_draft.project_id,
      'baseDesignVersionId', v_draft.base_design_version_id,
      'expectedProductionDesignVersionId', v_draft.expected_production_design_version_id,
      'document', v_draft.document,
      'revision', v_draft.revision,
      'reason', v_draft.reason,
      'status', v_draft.status,
      'createdBy', v_draft.created_by,
      'editorUserId', v_actor_id,
      'lease', jsonb_build_object(
        'sessionId', p_session_id,
        'epoch', v_next_epoch,
        'expiresAt', (clock_timestamp() + v_lease_duration)
      ),
      'createdAt', v_draft.created_at,
      'updatedAt', clock_timestamp(),
      'approvedDesignVersionId', v_draft.approved_design_version_id
    )
  );
end;
$$;

-- F. approve_design_revision
create or replace function public.approve_design_revision(
  p_draft_id uuid,
  p_expected_revision bigint,
  p_expected_production_version_id uuid,
  p_session_id uuid,
  p_epoch bigint,
  p_assessment_id uuid,
  p_acknowledged_warning_ids text[],
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_role text;
  v_draft record;
  v_order record;
  v_assessment record;
  v_version_number integer;
  v_new_version_id uuid;
  v_existing_req record;
  v_warn_id text;
  v_missing_warn text;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập');
  end if;

  select role into v_role from public.staff_roles where user_id = v_actor_id;
  if v_role is null or (v_role <> 'admin' and v_role <> 'editor') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Không có quyền duyệt thiết kế');
  end if;

  -- Check idempotent request
  select * into v_existing_req
  from public.design_revision_requests
  where actor_user_id = v_actor_id and operation = 'approve_revision' and request_id = p_request_id;
  if found then
    return v_existing_req.result_payload;
  end if;

  -- Lock Order
  select * into v_draft from public.design_revision_drafts where id = p_draft_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'DRAFT_CLOSED', 'message', 'Bản nháp không tồn tại');
  end if;

  if v_draft.status = 'approved' and v_draft.approved_design_version_id is not null then
    return jsonb_build_object(
      'ok', true,
      'value', jsonb_build_object(
        'orderId', v_draft.order_id,
        'customerVersionId', (select customer_approved_design_version_id from public.orders where id = v_draft.order_id),
        'productionVersionId', v_draft.approved_design_version_id,
        'versionNumber', (select version_number from public.design_versions where id = v_draft.approved_design_version_id),
        'draftId', v_draft.id
      )
    );
  end if;

  if v_draft.status not in ('editing', 'ready_for_review') then
    return jsonb_build_object('ok', false, 'code', 'DRAFT_CLOSED', 'message', 'Bản nháp đã đóng');
  end if;

  if v_draft.editor_user_id <> v_actor_id or v_draft.lease_session_id <> p_session_id or v_draft.lease_epoch <> p_epoch then
    return jsonb_build_object('ok', false, 'code', 'LEASE_LOST', 'message', 'Quyền sở hữu bản nháp đã mất');
  end if;

  if v_draft.revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT', 'message', 'Bản nháp đã được chỉnh sửa');
  end if;

  -- Lock Order
  select * into v_order from public.orders where id = v_draft.order_id for update;
  if v_order.fulfillment_status not in ('unprocessed', 'ready_for_production') then
    return jsonb_build_object('ok', false, 'code', 'ORDER_LOCKED', 'message', 'Đơn hàng đã vào sản xuất hoặc đã hủy');
  end if;

  if v_order.production_design_version_id <> p_expected_production_version_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CHANGED', 'message', 'Phiên bản sản xuất đã thay đổi');
  end if;

  -- Lock and validate assessment
  select * into v_assessment from public.design_preflight_assessments where id = p_assessment_id;
  if not found or v_assessment.draft_id <> p_draft_id or v_assessment.revision <> v_draft.revision or v_assessment.expires_at < clock_timestamp() then
    return jsonb_build_object('ok', false, 'code', 'PREFLIGHT_STALE', 'message', 'Kết quả kiểm tra trước in đã hết hạn hoặc không khớp bản sửa');
  end if;

  -- Check if blocking findings exist
  if (v_assessment.findings->>'level') = 'error' then
    return jsonb_build_object('ok', false, 'code', 'PREFLIGHT_BLOCKED', 'message', 'Bản thiết kế còn lỗi chặn sản xuất');
  end if;

  -- Check if all warning IDs are acknowledged
  if v_assessment.warning_ids is not null and array_length(v_assessment.warning_ids, 1) > 0 then
    foreach v_warn_id in array v_assessment.warning_ids loop
      if not (p_acknowledged_warning_ids @> array[v_warn_id]) then
        return jsonb_build_object('ok', false, 'code', 'WARNINGS_UNACKNOWLEDGED', 'message', 'Chưa xác nhận hết các cảnh báo in ấn');
      end if;
    end loop;
  end if;

  -- Lock Project and allocate version_number
  select coalesce(max(version_number), 0) + 1 into v_version_number
  from public.design_versions
  where project_id = v_order.project_id;

  -- Insert new immutable design version
  v_new_version_id := gen_random_uuid();
  insert into public.design_versions (
    id,
    project_id,
    version_number,
    source,
    design_document,
    product_snapshot,
    preflight_snapshot,
    preflight_revision,
    created_by,
    parent_design_version_id,
    revision_reason,
    revision_draft_id,
    created_at
  )
  values (
    v_new_version_id,
    v_order.project_id,
    v_version_number,
    case when v_role = 'admin' then 'admin_revision' else 'editor_revision' end,
    v_draft.document,
    v_order.product_snapshot,
    v_assessment.findings,
    concat('rev-', v_draft.revision),
    v_actor_id,
    v_draft.base_design_version_id,
    v_draft.reason,
    p_draft_id,
    clock_timestamp()
  );

  -- Copy draft asset manifests to version asset manifest
  insert into public.design_version_assets (version_id, asset_id, kind, checksum, created_at)
  select v_new_version_id, asset_id, kind, checksum, clock_timestamp()
  from public.design_draft_assets
  where draft_id = p_draft_id
  on conflict do nothing;

  -- Update order production pointer & status
  update public.orders
  set
    production_design_version_id = v_new_version_id,
    design_status = 'approved',
    updated_at = clock_timestamp()
  where id = v_order.id;

  -- Close draft
  update public.design_revision_drafts
  set
    status = 'approved',
    approved_design_version_id = v_new_version_id,
    lease_session_id = null,
    lease_expires_at = null,
    updated_at = clock_timestamp()
  where id = p_draft_id;

  -- Append design_revision_approved event
  insert into public.order_events (
    order_id,
    event_type,
    actor_user_id,
    actor_role,
    payload,
    created_at
  )
  values (
    v_order.id,
    'design_revision_approved',
    v_actor_id,
    v_role,
    jsonb_build_object(
      'version_id', v_new_version_id,
      'version_number', v_version_number,
      'base_version_id', v_draft.base_design_version_id,
      'reason', v_draft.reason
    ),
    clock_timestamp()
  );

  -- Enqueue render job for new version
  insert into public.design_render_jobs (
    version_id,
    order_id,
    status,
    created_at,
    updated_at
  )
  values (
    v_new_version_id,
    v_order.id,
    'pending',
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (version_id) do nothing;

  -- Save request result for idempotency
  insert into public.design_revision_requests (
    actor_user_id,
    operation,
    request_id,
    target_id,
    input_hash,
    result_payload
  )
  values (
    v_actor_id,
    'approve_revision',
    p_request_id,
    v_new_version_id,
    concat(p_draft_id::text, ':', p_assessment_id::text),
    jsonb_build_object(
      'ok', true,
      'value', jsonb_build_object(
        'orderId', v_order.id,
        'customerVersionId', v_order.customer_approved_design_version_id,
        'productionVersionId', v_new_version_id,
        'versionNumber', v_version_number,
        'draftId', p_draft_id
      )
    )
  );

  return jsonb_build_object(
    'ok', true,
    'value', jsonb_build_object(
      'orderId', v_order.id,
      'customerVersionId', v_order.customer_approved_design_version_id,
      'productionVersionId', v_new_version_id,
      'versionNumber', v_version_number,
      'draftId', p_draft_id
    )
  );
end;
$$;

-- G. approve_customer_design_as_production
create or replace function public.approve_customer_design_as_production(
  p_order_id uuid,
  p_expected_customer_version_id uuid,
  p_expected_production_version_id uuid,
  p_assessment_id uuid,
  p_acknowledged_warning_ids text[],
  p_request_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_role text;
  v_order record;
  v_active_draft record;
  v_assessment record;
  v_existing_req record;
  v_warn_id text;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập');
  end if;

  select role into v_role from public.staff_roles where user_id = v_actor_id;
  if v_role is null or (v_role <> 'admin' and v_role <> 'editor') then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Không có quyền duyệt thiết kế');
  end if;

  select * into v_existing_req
  from public.design_revision_requests
  where actor_user_id = v_actor_id and operation = 'approve_as_is' and request_id = p_request_id;
  if found then
    return v_existing_req.result_payload;
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'ORDER_LOCKED', 'message', 'Đơn hàng không tồn tại');
  end if;

  if v_order.fulfillment_status not in ('unprocessed', 'ready_for_production') then
    return jsonb_build_object('ok', false, 'code', 'ORDER_LOCKED', 'message', 'Đơn hàng đã vào sản xuất hoặc đã hủy');
  end if;

  if v_order.customer_approved_design_version_id <> p_expected_customer_version_id or
     v_order.production_design_version_id <> p_expected_production_version_id then
    return jsonb_build_object('ok', false, 'code', 'PRODUCTION_CHANGED', 'message', 'Phiên bản thiết kế của đơn hàng đã thay đổi');
  end if;

  -- Ensure no active draft exists
  select * into v_active_draft
  from public.design_revision_drafts
  where order_id = p_order_id and status in ('editing', 'ready_for_review');
  if found then
    return jsonb_build_object('ok', false, 'code', 'ACTIVE_DRAFT_EXISTS', 'message', 'Đang có bản nháp chỉnh sửa, không thể duyệt nguyên bản');
  end if;

  -- Validate assessment
  select * into v_assessment from public.design_preflight_assessments where id = p_assessment_id;
  if not found or v_assessment.version_id <> p_expected_customer_version_id or v_assessment.expires_at < clock_timestamp() then
    return jsonb_build_object('ok', false, 'code', 'PREFLIGHT_STALE', 'message', 'Kết quả kiểm tra trước in đã hết hạn');
  end if;

  if (v_assessment.findings->>'level') = 'error' then
    return jsonb_build_object('ok', false, 'code', 'PREFLIGHT_BLOCKED', 'message', 'Bản thiết kế còn lỗi chặn sản xuất');
  end if;

  if v_assessment.warning_ids is not null and array_length(v_assessment.warning_ids, 1) > 0 then
    foreach v_warn_id in array v_assessment.warning_ids loop
      if not (p_acknowledged_warning_ids @> array[v_warn_id]) then
        return jsonb_build_object('ok', false, 'code', 'WARNINGS_UNACKNOWLEDGED', 'message', 'Chưa xác nhận hết các cảnh báo in ấn');
      end if;
    end loop;
  end if;

  -- Update order design status to approved (production stays customer version)
  update public.orders
  set
    design_status = 'approved',
    updated_at = clock_timestamp()
  where id = p_order_id;

  -- Append design_approved_as_is event
  insert into public.order_events (
    order_id,
    event_type,
    actor_user_id,
    actor_role,
    payload,
    created_at
  )
  values (
    p_order_id,
    'design_approved_as_is',
    v_actor_id,
    v_role,
    jsonb_build_object(
      'version_id', p_expected_customer_version_id
    ),
    clock_timestamp()
  );

  insert into public.design_revision_requests (
    actor_user_id,
    operation,
    request_id,
    target_id,
    input_hash,
    result_payload
  )
  values (
    v_actor_id,
    'approve_as_is',
    p_request_id,
    p_order_id,
    p_assessment_id::text,
    jsonb_build_object(
      'ok', true,
      'value', jsonb_build_object(
        'orderId', p_order_id,
        'customerVersionId', p_expected_customer_version_id,
        'productionVersionId', p_expected_customer_version_id,
        'versionNumber', 1,
        'draftId', null
      )
    )
  );

  return jsonb_build_object(
    'ok', true,
    'value', jsonb_build_object(
      'orderId', p_order_id,
      'customerVersionId', p_expected_customer_version_id,
      'productionVersionId', p_expected_customer_version_id,
      'versionNumber', 1,
      'draftId', null
    )
  );
end;
$$;

-- Grant EXECUTE on functions to authenticated
grant execute on function public.create_design_revision_draft to authenticated;
grant execute on function public.heartbeat_draft_lease to authenticated;
grant execute on function public.save_design_revision_draft to authenticated;
grant execute on function public.discard_design_revision_draft to authenticated;
grant execute on function public.takeover_draft_lease to authenticated;
grant execute on function public.approve_design_revision to authenticated;
grant execute on function public.approve_customer_design_as_production to authenticated;
