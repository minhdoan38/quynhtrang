-- State 43: Admin Template Management, Drafts, Immutable Versions, and Receipts
-- Forward migration: additive schema, draft leasing, immutable versioning, and operation logs.

-- 1. Template Categories
create table if not exists public.template_categories (
  id text primary key,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed standard categories
insert into public.template_categories (id, name, sort_order)
values
  ('all', 'Tất cả', 0),
  ('birthday', 'Sinh nhật', 1),
  ('cute', 'Cute', 2),
  ('floral', 'Hoa', 3),
  ('minimal', 'Tối giản', 4),
  ('love', 'Tình yêu', 5),
  ('thanks', 'Cảm ơn', 6)
on conflict (id) do update set
  name = excluded.name,
  sort_order = excluded.sort_order;

-- 2. Ensure product_variants composite unique constraint for target reference
alter table public.product_variants drop constraint if exists uq_product_variants_product_id;
alter table public.product_variants add constraint uq_product_variants_product_id unique (product_id, id);

-- 3. Extend Templates
alter table public.templates alter column published set default false;

alter table public.templates
  add column if not exists status text not null default 'draft',
  add column if not exists revision bigint not null default 1,
  add column if not exists variant_id text null,
  add column if not exists product_mode text null,
  add column if not exists fixed_sticker_shape text null,
  add column if not exists target_snapshot jsonb null,
  add column if not exists category_id text references public.template_categories(id) on delete set null,
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists sort_order integer not null default 0,
  add column if not exists current_published_version_id uuid null,
  add column if not exists ever_published_at timestamptz null,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists archived_at timestamptz null,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

alter table public.templates drop constraint if exists templates_status_check;
alter table public.templates add constraint templates_status_check check (status in ('draft', 'published', 'archived'));

alter table public.templates drop constraint if exists templates_product_mode_check;
alter table public.templates add constraint templates_product_mode_check check (product_mode is null or product_mode in ('pattern', 'full-sheet'));

alter table public.templates drop constraint if exists templates_fixed_sticker_shape_check;
alter table public.templates add constraint templates_fixed_sticker_shape_check check (fixed_sticker_shape is null or fixed_sticker_shape in ('circle', 'square', 'rectangle', 'oval', 'heart'));

alter table public.templates drop constraint if exists fk_templates_product_variant;
alter table public.templates add constraint fk_templates_product_variant
  foreign key (product_id, variant_id)
  references public.product_variants(product_id, id)
  on delete restrict;

create index if not exists idx_templates_status on public.templates(status);
create index if not exists idx_templates_category on public.templates(category_id);
create index if not exists idx_templates_target on public.templates(product_id, variant_id);
create index if not exists idx_templates_browse on public.templates(sort_order, id);

-- 4. Extend Template Versions
-- Remove cascade on delete from templates; historical versions are never cascade deleted
alter table public.template_versions drop constraint if exists template_versions_template_id_fkey;
alter table public.template_versions drop constraint if exists fk_template_versions_template;
alter table public.template_versions add constraint fk_template_versions_template
  foreign key (template_id)
  references public.templates(id)
  on delete restrict;

-- Ensure (template_id, id) unique for composite same-template foreign keys
alter table public.template_versions drop constraint if exists uq_template_versions_template_id_id;
alter table public.template_versions add constraint uq_template_versions_template_id_id unique (template_id, id);

alter table public.template_versions
  add column if not exists target_snapshot jsonb null,
  add column if not exists dependency_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists document_schema_version integer not null default 0,
  add column if not exists preflight_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists validation_id uuid null,
  add column if not exists asset_manifest jsonb not null default '[]'::jsonb,
  add column if not exists thumbnail_path text null,
  add column if not exists thumbnail_checksum text null,
  add column if not exists preview_metadata jsonb not null default '{}'::jsonb,
  add column if not exists published_by uuid references auth.users(id) on delete set null,
  add column if not exists published_at timestamptz not null default now(),
  add column if not exists revision_note text null;

alter table public.template_versions drop constraint if exists template_versions_revision_note_check;
alter table public.template_versions add constraint template_versions_revision_note_check
  check (revision_note is null or length(revision_note) <= 500);

create index if not exists idx_template_versions_template on public.template_versions(template_id, version desc);

-- 5. Link Template current_published_version_id via composite same-template foreign key
alter table public.templates drop constraint if exists fk_templates_current_published_version;
alter table public.templates add constraint fk_templates_current_published_version
  foreign key (id, current_published_version_id)
  references public.template_versions(template_id, id)
  on delete restrict;

-- 6. Template Drafts
create table if not exists public.template_drafts (
  id uuid primary key default gen_random_uuid(),
  template_id text not null unique references public.templates(id) on delete cascade,
  based_on_version_id uuid null,
  design_document jsonb not null default '{}'::jsonb,
  document_schema_version integer not null default 1,
  draft_revision bigint not null default 1 check (draft_revision >= 1),
  source_document_hash text null,
  editor_user_id uuid references auth.users(id) on delete set null,
  lease_session_id uuid null,
  lease_epoch bigint not null default 0 check (lease_epoch >= 0),
  lease_expires_at timestamptz null,
  last_activity_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  constraint fk_template_drafts_based_on
    foreign key (template_id, based_on_version_id)
    references public.template_versions(template_id, id)
    on delete set null
);

create index if not exists idx_template_drafts_editor on public.template_drafts(editor_user_id);
create index if not exists idx_template_drafts_lease on public.template_drafts(lease_session_id, lease_expires_at);

drop trigger if exists trigger_template_drafts_updated_at on public.template_drafts;
create trigger trigger_template_drafts_updated_at
  before update on public.template_drafts
  for each row execute function public.set_updated_at();

-- 7. Template Version Dependencies (Normalized)
create table if not exists public.template_version_dependencies (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.template_versions(id) on delete restrict,
  kind text not null check (kind in ('font-face', 'sticker')),
  asset_id text not null,
  checksum text null,
  family_id text null,
  created_at timestamptz not null default now(),
  constraint uq_template_version_dependencies unique (version_id, kind, asset_id)
);

create index if not exists idx_template_version_deps_asset on public.template_version_dependencies(kind, asset_id);
create index if not exists idx_template_version_deps_family on public.template_version_dependencies(family_id) where family_id is not null;
create index if not exists idx_template_version_deps_version on public.template_version_dependencies(version_id);

-- 8. Template Assets and Version Assets Join
create table if not exists public.template_assets (
  id uuid primary key default gen_random_uuid(),
  template_id text not null references public.templates(id) on delete restrict,
  draft_id uuid null references public.template_drafts(id) on delete set null,
  storage_bucket text not null check (storage_bucket in ('template-drafts', 'template-versions', 'template-assets')),
  storage_path text not null unique,
  checksum text not null,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  pixel_width integer null check (pixel_width is null or pixel_width > 0),
  pixel_height integer null check (pixel_height is null or pixel_height > 0),
  upload_status text not null default 'pending' check (upload_status in ('pending', 'uploaded', 'attached', 'verified', 'cleanup_pending', 'cleaned', 'failed')),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived', 'cleaned')),
  ever_published_at timestamptz null,
  expires_at timestamptz null,
  is_published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.template_assets add column if not exists status text not null default 'draft' check (status in ('draft', 'published', 'archived', 'cleaned'));
alter table public.template_assets add column if not exists ever_published_at timestamptz null;


create index if not exists idx_template_assets_template on public.template_assets(template_id);
create index if not exists idx_template_assets_draft on public.template_assets(draft_id);
create index if not exists idx_template_assets_checksum on public.template_assets(checksum);
create index if not exists idx_template_assets_published on public.template_assets(is_published);

drop trigger if exists trigger_template_assets_updated_at on public.template_assets;
create trigger trigger_template_assets_updated_at
  before update on public.template_assets
  for each row execute function public.set_updated_at();

create table if not exists public.template_version_assets (
  version_id uuid not null references public.template_versions(id) on delete restrict,
  asset_id uuid not null references public.template_assets(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint pk_template_version_assets primary key (version_id, asset_id)
);

create index if not exists idx_template_version_assets_asset on public.template_version_assets(asset_id);

-- 9. Template Validation Runs (Append-only receipts)
create table if not exists public.template_validation_runs (
  id uuid primary key default gen_random_uuid(),
  template_id text not null references public.templates(id) on delete restrict,
  draft_id uuid not null references public.template_drafts(id) on delete restrict,
  source_revision bigint not null,
  lease_session_id uuid not null,
  lease_epoch bigint not null default 0,
  source_document_hash text not null,
  candidate_document_hash text not null,
  target_hash text not null,
  dependency_manifest_hash text null,
  findings jsonb not null default '[]'::jsonb,
  warning_ids text[] not null default '{}'::text[],
  validator_version text not null default '1.0.0',
  engine_fingerprint text not null,
  customer_preview_passed boolean not null default false,
  thumbnail_asset_id uuid null references public.template_assets(id) on delete set null,
  thumbnail_checksum text null,
  preview_metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_template_validation_runs_lookup on public.template_validation_runs(template_id, draft_id, expires_at desc);

create or replace function public.reject_validation_run_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    -- Allow shortening/expiring unexpired validation receipts, reject all other mutations
    if new.id = old.id
      and new.template_id = old.template_id
      and new.draft_id = old.draft_id
      and new.source_revision = old.source_revision
      and new.lease_session_id = old.lease_session_id
      and new.lease_epoch = old.lease_epoch
      and new.source_document_hash = old.source_document_hash
      and new.candidate_document_hash = old.candidate_document_hash
      and new.target_hash = old.target_hash
      and new.dependency_manifest_hash is not distinct from old.dependency_manifest_hash
      and new.findings = old.findings
      and new.warning_ids = old.warning_ids
      and new.validator_version = old.validator_version
      and new.engine_fingerprint = old.engine_fingerprint
      and new.customer_preview_passed = old.customer_preview_passed
      and new.thumbnail_asset_id is not distinct from old.thumbnail_asset_id
      and new.thumbnail_checksum is not distinct from old.thumbnail_checksum
      and new.preview_metadata = old.preview_metadata
      and new.created_at = old.created_at
      and new.expires_at <= old.expires_at
    then
      return new;
    end if;
  end if;
  raise exception 'template_validation_runs is append-only' using errcode = 'P0001';
end;
$$;

drop trigger if exists trigger_validation_runs_append_only on public.template_validation_runs;
create trigger trigger_validation_runs_append_only
  before update or delete on public.template_validation_runs
  for each row execute function public.reject_validation_run_mutation();

-- 10. Template Operations (Idempotency and lineage)
create table if not exists public.template_operations (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  actor_user_id uuid references auth.users(id) on delete set null,
  operation text not null check (operation in ('create', 'publish', 'clone', 'duplicate', 'archive', 'republish', 'discard', 'takeover', 'delete', 'patch_metadata', 'save_draft')),
  template_id text null references public.templates(id) on delete set null,
  payload_hash text not null,
  reserved_version_id uuid null,
  result jsonb null,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  cleanup_state text not null default 'none' check (cleanup_state in ('none', 'needed', 'done', 'failed')),
  error_message text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_template_operations_template on public.template_operations(template_id, operation, created_at desc);
create index if not exists idx_template_operations_actor on public.template_operations(actor_user_id, created_at desc);

drop trigger if exists trigger_template_operations_updated_at on public.template_operations;
create trigger trigger_template_operations_updated_at
  before update on public.template_operations
  for each row execute function public.set_updated_at();

-- 11. Template Legacy Targets (Durable migration alias mapping)
create table if not exists public.template_legacy_targets (
  legacy_id text not null,
  target_key text not null,
  template_id text not null references public.templates(id) on delete restrict,
  version_id uuid null references public.template_versions(id) on delete set null,
  verified_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint pk_template_legacy_targets primary key (legacy_id, target_key)
);

create index if not exists idx_template_legacy_targets_template on public.template_legacy_targets(template_id, version_id);

-- 12. Extend Projects with Template Provenance
alter table public.projects
  add column if not exists source_template_id text null references public.templates(id) on delete restrict,
  add column if not exists source_template_version_id uuid null references public.template_versions(id) on delete restrict,
  add column if not exists clone_request_key text null;

alter table public.projects drop constraint if exists fk_projects_source_template_version;
alter table public.projects add constraint fk_projects_source_template_version
  foreign key (source_template_id, source_template_version_id)
  references public.template_versions(template_id, id)
  on delete restrict;

create unique index if not exists uq_projects_owner_clone_request
  on public.projects(owner_user_id, clone_request_key)
  where clone_request_key is not null;

create index if not exists idx_projects_source_template
  on public.projects(source_template_id, source_template_version_id);

-- 13. Template Version Immutability Triggers
create or replace function public.reject_template_version_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_setting('migration.allow_version_mutation', true) = '1' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  raise exception 'IMMUTABLE_TEMPLATE_VERSION' using errcode = 'P0001';
end;
$$;

drop trigger if exists trigger_reject_template_version_mutation on public.template_versions;
create trigger trigger_reject_template_version_mutation
  before update or delete on public.template_versions
  for each row execute function public.reject_template_version_mutation();

create or replace function public.reject_template_version_dep_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_setting('migration.allow_version_mutation', true) = '1' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  raise exception 'IMMUTABLE_TEMPLATE_VERSION_DEPENDENCY' using errcode = 'P0001';
end;
$$;

drop trigger if exists trigger_template_version_deps_immutable on public.template_version_dependencies;
create trigger trigger_template_version_deps_immutable
  before update or delete on public.template_version_dependencies
  for each row execute function public.reject_template_version_dep_mutation();

drop trigger if exists trigger_template_version_assets_immutable on public.template_version_assets;
create trigger trigger_template_version_assets_immutable
  before update or delete on public.template_version_assets
  for each row execute function public.reject_template_version_dep_mutation();

-- 14. Template Invariants Trigger (ever_published_at write-once, immutable targets)
create or replace function public.enforce_template_invariants()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Migration bypass for legacy data enrichment
  if current_setting('migration.allow_version_mutation', true) = '1' then
    return new;
  end if;

  -- ever_published_at is write-once: once set, it cannot be modified or cleared
  if old.ever_published_at is not null then
    if new.ever_published_at is distinct from old.ever_published_at then
      raise exception 'EVER_PUBLISHED_AT_WRITE_ONCE' using errcode = 'P0001';
    end if;
  end if;

  -- Target cannot be changed once set
  if old.product_id is not null and new.product_id is distinct from old.product_id then
    raise exception 'IMMUTABLE_TEMPLATE_TARGET' using errcode = 'P0001';
  end if;
  if old.variant_id is not null and new.variant_id is distinct from old.variant_id then
    raise exception 'IMMUTABLE_TEMPLATE_TARGET' using errcode = 'P0001';
  end if;
  if old.product_mode is not null and new.product_mode is distinct from old.product_mode then
    raise exception 'IMMUTABLE_TEMPLATE_TARGET' using errcode = 'P0001';
  end if;
  if old.fixed_sticker_shape is not null and new.fixed_sticker_shape is distinct from old.fixed_sticker_shape then
    raise exception 'IMMUTABLE_TEMPLATE_TARGET' using errcode = 'P0001';
  end if;
  if old.target_snapshot is not null and new.target_snapshot is distinct from old.target_snapshot then
    raise exception 'IMMUTABLE_TEMPLATE_TARGET' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_templates_invariants on public.templates;
create trigger trigger_templates_invariants
  before update on public.templates
  for each row execute function public.enforce_template_invariants();

-- 15. Enable RLS on all newly created tables immediately (default deny; T04 supplies policies)
alter table public.template_categories enable row level security;
alter table public.template_drafts enable row level security;
alter table public.template_version_dependencies enable row level security;
alter table public.template_assets enable row level security;
alter table public.template_version_assets enable row level security;
alter table public.template_validation_runs enable row level security;
alter table public.template_operations enable row level security;
alter table public.template_legacy_targets enable row level security;

-- 16. Template Operations Immutability Trigger
create or replace function public.reject_template_operation_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'template_operations is append-only and cannot be deleted' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.status in ('completed', 'failed') and new.cleanup_state is not distinct from old.cleanup_state then
    raise exception 'completed template_operations cannot be updated' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_template_operations_immutable on public.template_operations;
create trigger trigger_template_operations_immutable
  before update or delete on public.template_operations
  for each row execute function public.reject_template_operation_mutation();

-- 17. Access boundaries and RLS policies (State 43 Task 4)
-- 17.1 Revoke old permissive direct write & read policies from 0001
drop policy if exists "Allow staff manage templates" on public.templates;
drop policy if exists "Allow staff manage template versions" on public.template_versions;
drop policy if exists "Allow read published templates" on public.templates;
drop policy if exists "Allow read published template versions" on public.template_versions;

-- 17.2 Explicit SELECT policies for templates and versions
create policy "Read published templates or staff drafts"
  on public.templates for select
  using (
    status = 'published'
    or published = true
    or public.is_staff('editor')
  );

create policy "Read published template versions or staff"
  on public.template_versions for select
  using (
    public.is_staff('editor')
    or exists (
      select 1 from public.templates t
      where t.id = template_versions.template_id
        and (t.status = 'published' or t.published = true)
    )
  );

-- 17.3 Explicit SELECT policies for newly created tables
create policy "Allow read template categories"
  on public.template_categories for select
  using (true);

create policy "Allow read template legacy targets"
  on public.template_legacy_targets for select
  using (true);

create policy "Read template version dependencies"
  on public.template_version_dependencies for select
  using (
    public.is_staff('editor')
    or exists (
      select 1 from public.template_versions tv
      join public.templates t on t.id = tv.template_id
      where tv.id = template_version_dependencies.version_id
        and (t.status = 'published' or t.published = true)
    )
  );

create policy "Staff read template drafts"
  on public.template_drafts for select
  using (public.is_staff('editor'));

create policy "Staff read template assets"
  on public.template_assets for select
  using (public.is_staff('editor'));

create policy "Staff read template version assets"
  on public.template_version_assets for select
  using (public.is_staff('editor'));

create policy "Staff read template validation runs"
  on public.template_validation_runs for select
  using (public.is_staff('editor'));

create policy "Staff read template operations"
  on public.template_operations for select
  using (public.is_staff('editor'));

-- 17.3.1 Storage Buckets for Templates (State 43 Task 10)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('template-drafts', 'template-drafts', false, 10485760, array['image/png', 'image/jpeg', 'image/webp']::text[]),
  ('template-versions', 'template-versions', false, 10485760, array['image/png', 'image/jpeg', 'image/webp']::text[])
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp']::text[];

drop policy if exists "Staff read template-drafts storage" on storage.objects;
create policy "Staff read template-drafts storage"
  on storage.objects for select
  using (bucket_id = 'template-drafts' and public.is_staff('editor'));

drop policy if exists "Staff write template-drafts storage" on storage.objects;
create policy "Staff write template-drafts storage"
  on storage.objects for insert
  with check (bucket_id = 'template-drafts' and public.is_staff('editor'));

drop policy if exists "Staff update template-drafts storage" on storage.objects;
create policy "Staff update template-drafts storage"
  on storage.objects for update
  using (bucket_id = 'template-drafts' and public.is_staff('editor'))
  with check (bucket_id = 'template-drafts' and public.is_staff('editor'));

drop policy if exists "Staff delete template-drafts storage" on storage.objects;
create policy "Staff delete template-drafts storage"
  on storage.objects for delete
  using (bucket_id = 'template-drafts' and public.is_staff('editor'));

drop policy if exists "Staff read template-versions storage" on storage.objects;
create policy "Staff read template-versions storage"
  on storage.objects for select
  using (bucket_id = 'template-versions' and public.is_staff('editor'));

-- 17.4 Revoke direct write grants from public, anon, and authenticated
revoke insert, update, delete on table
  public.templates,
  public.template_versions,
  public.template_drafts,
  public.template_version_dependencies,
  public.template_assets,
  public.template_version_assets,
  public.template_validation_runs,
  public.template_operations,
  public.template_categories,
  public.template_legacy_targets
from public, anon, authenticated;

-- 17.5 Explicit SELECT grants
grant select on table
  public.templates,
  public.template_versions,
  public.template_version_dependencies,
  public.template_categories,
  public.template_legacy_targets,
  public.template_drafts,
  public.template_assets,
  public.template_version_assets,
  public.template_validation_runs,
  public.template_operations
to anon, authenticated;

-- 18. Template Management RPCs (State 43 Task 5)
alter table public.templates add column if not exists updated_by uuid references auth.users(id) on delete set null;

alter table public.template_operations drop constraint if exists template_operations_operation_check;
alter table public.template_operations add constraint template_operations_operation_check
  check (operation in ('create', 'create_draft', 'publish', 'clone', 'duplicate', 'archive', 'republish', 'discard', 'takeover', 'delete', 'patch_metadata', 'save_draft'));

-- 18.1 Authorize actor helper
create or replace function public.template_authorize_actor(p_actor uuid, p_required_role text default 'editor')
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_role text;
begin
  if p_actor is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;
  select role into v_role from public.staff_roles where user_id = p_actor;
  if v_role is null or (p_required_role = 'admin' and v_role <> 'admin') or (p_required_role = 'editor' and v_role not in ('admin', 'editor')) then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
end;
$$;

-- 18.2 template_create RPC
create or replace function public.template_create(
  p_actor uuid,
  p_request text,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_doc_hash text;
  v_payload_hash text;
  v_op record;
  v_id text;
  v_name text;
  v_product_id text;
  v_variant_id text;
  v_product_mode text;
  v_fixed_sticker_shape text;
  v_category_id text;
  v_tags text[];
  v_sort_order integer;
  v_target_snapshot jsonb;
  v_initial_document jsonb;
  v_template record;
  v_draft record;
  v_result jsonb;
begin
  perform public.template_authorize_actor(p_actor, 'editor');

  if p_request is null or btrim(p_request) = '' then
    raise exception 'INVALID_REQUEST_ID' using errcode = 'P0001';
  end if;

  v_payload_hash := md5(p_payload::text);

  -- Check template_operations for idempotency
  select * into v_op from public.template_operations where request_id = p_request;
  if found then
    if v_op.actor_user_id is distinct from p_actor or v_op.payload_hash <> v_payload_hash then
      raise exception 'OPERATION_CONFLICT' using errcode = 'P0001';
    end if;
    return v_op.result;
  end if;

  -- Extract fields
  v_id := btrim(coalesce(p_payload->>'id', p_payload->>'templateId', ''));
  if v_id = '' then
    raise exception 'INVALID_INPUT: id is required' using errcode = 'P0001';
  end if;

  v_name := btrim(coalesce(p_payload->>'name', ''));
  if char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception 'INVALID_INPUT: name must be 1 to 120 characters' using errcode = 'P0001';
  end if;

  v_product_id := coalesce(p_payload->>'productId', p_payload->>'product_id');
  v_variant_id := coalesce(p_payload->>'variantId', p_payload->>'variant_id');
  v_product_mode := coalesce(p_payload->>'productMode', p_payload->>'product_mode');
  v_fixed_sticker_shape := coalesce(p_payload->>'fixedStickerShape', p_payload->>'fixed_sticker_shape');

  if v_product_id is null or v_variant_id is null then
    raise exception 'INVALID_INPUT: target productId and variantId required' using errcode = 'P0001';
  end if;

  v_category_id := coalesce(p_payload->>'categoryId', p_payload->>'category_id');
  if v_category_id is not null and v_category_id <> '' then
    if not exists (select 1 from public.template_categories where id = v_category_id) then
      raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
    end if;
  else
    v_category_id := null;
  end if;

  v_tags := coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'tags', '[]'::jsonb))), '{}'::text[]);
  if cardinality(v_tags) > 20 then
    raise exception 'INVALID_INPUT: tags cannot exceed 20' using errcode = 'P0001';
  end if;

  v_sort_order := coalesce((p_payload->>'sortOrder')::integer, (p_payload->>'sort_order')::integer, 0);
  v_target_snapshot := coalesce(p_payload->'targetSnapshot', p_payload->'target_snapshot', '{}'::jsonb);
  v_initial_document := coalesce(p_payload->'initialDocument', p_payload->'initial_document', '{}'::jsonb);

  -- Insert into templates
  insert into public.templates (
    id, name, product_id, variant_id, product_mode, fixed_sticker_shape,
    category_id, tags, sort_order, target_snapshot, status, revision,
    created_by, updated_by, created_at, updated_at
  ) values (
    v_id, v_name, v_product_id, v_variant_id, v_product_mode, v_fixed_sticker_shape,
    v_category_id, v_tags, v_sort_order, v_target_snapshot, 'draft', 1,
    p_actor, p_actor, now(), now()
  ) returning * into v_template;

  v_doc_hash := encode(digest(v_initial_document::text, 'sha256'), 'hex');

  -- Insert initial draft
  insert into public.template_drafts (
    template_id, based_on_version_id, design_document, document_schema_version,
    draft_revision, source_document_hash, created_by, updated_by, created_at, updated_at
  ) values (
    v_id, null, v_initial_document, 1,
    1, v_doc_hash, p_actor, p_actor, now(), now()
  ) returning * into v_draft;

  -- Insert asset_event
  insert into public.asset_events (
    actor_user_id, request_id, kind, target_id, before_revision, after_revision, event, metadata_diff
  ) values (
    p_actor,
    case when p_request ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request::uuid else null end,
    'template',
    v_id,
    null,
    1,
    'created',
    jsonb_build_object('name', v_name, 'productId', v_product_id, 'variantId', v_variant_id)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'template', to_jsonb(v_template),
    'draft', to_jsonb(v_draft)
  );

  -- Record template_operations
  insert into public.template_operations (
    request_id, actor_user_id, operation, template_id, payload_hash, status, result
  ) values (
    p_request, p_actor, 'create', v_id, v_payload_hash, 'completed', v_result
  );

  return v_result;
end;
$$;

-- 18.3 template_create_draft RPC
create or replace function public.template_create_draft(
  p_actor uuid,
  p_request text,
  p_template_id text,
  p_expected_catalog_revision bigint default null,
  p_expected_base_version_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_doc_hash text;
  v_payload_hash text;
  v_op record;
  v_draft record;
  v_template record;
  v_version record;
  v_result jsonb;
begin
  perform public.template_authorize_actor(p_actor, 'editor');

  if p_request is null or btrim(p_request) = '' then
    raise exception 'INVALID_REQUEST_ID' using errcode = 'P0001';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'templateId', p_template_id,
    'expectedCatalogRevision', p_expected_catalog_revision,
    'expectedBaseVersionId', p_expected_base_version_id
  )::text);

  -- Check template_operations for idempotency
  select * into v_op from public.template_operations where request_id = p_request;
  if found then
    if v_op.actor_user_id is distinct from p_actor or v_op.payload_hash <> v_payload_hash then
      raise exception 'OPERATION_CONFLICT' using errcode = 'P0001';
    end if;
    return v_op.result;
  end if;

  -- If draft already exists, return it unchanged (unique template_id catches racing open)
  select * into v_draft from public.template_drafts where template_id = p_template_id;
  if found then
    v_result := jsonb_build_object('ok', true, 'draft', to_jsonb(v_draft));
    insert into public.template_operations (
      request_id, actor_user_id, operation, template_id, payload_hash, status, result
    ) values (
      p_request, p_actor, 'create_draft', p_template_id, v_payload_hash, 'completed', v_result
    );
    return v_result;
  end if;

  -- Template must exist
  select * into v_template from public.templates where id = p_template_id;
  if not found then
    raise exception 'NOT_FOUND: template not found' using errcode = 'P0001';
  end if;

  if p_expected_catalog_revision is not null and v_template.revision <> p_expected_catalog_revision then
    raise exception 'REVISION_CONFLICT' using errcode = 'P0001';
  end if;

  -- Select base version: explicit version ID or template's current_published_version_id
  if p_expected_base_version_id is not null then
    select * into v_version
    from public.template_versions
    where template_id = p_template_id and id = p_expected_base_version_id;
    if not found then
      raise exception 'NOT_FOUND: base version not found' using errcode = 'P0001';
    end if;
  elsif v_template.current_published_version_id is not null then
    select * into v_version
    from public.template_versions
    where template_id = p_template_id and id = v_template.current_published_version_id;
    if not found then
      raise exception 'NOT_FOUND: current published version not found' using errcode = 'P0001';
    end if;
  else
    raise exception 'INVALID_TRANSITION: template has no published version to base draft on' using errcode = 'P0001';
  end if;
  -- Insert new draft from version immutable json
  v_doc_hash := encode(digest(v_version.design_document::text, 'sha256'), 'hex');

  -- Insert new draft from version immutable json
  insert into public.template_drafts (
    template_id, based_on_version_id, design_document, document_schema_version,
    draft_revision, source_document_hash, created_by, updated_by, created_at, updated_at
  ) values (
    p_template_id, v_version.id, v_version.design_document, coalesce(v_version.document_schema_version, 1),
    1, v_doc_hash, p_actor, p_actor, now(), now()
  )
  on conflict (template_id) do nothing
  returning * into v_draft;

  if v_draft is null then
    -- Conflict caught racing open
    select * into v_draft from public.template_drafts where template_id = p_template_id;
  else
    -- Log draft_created event
    insert into public.asset_events (
      actor_user_id, request_id, kind, target_id, before_revision, after_revision, event, metadata_diff
    ) values (
      p_actor,
      case when p_request ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request::uuid else null end,
      'template',
      p_template_id,
      null,
      1,
      'draft_created',
      jsonb_build_object('basedOnVersionId', v_version.id)
    );
  end if;

  v_result := jsonb_build_object('ok', true, 'draft', to_jsonb(v_draft));

  insert into public.template_operations (
    request_id, actor_user_id, operation, template_id, payload_hash, status, result
  ) values (
    p_request, p_actor, 'create_draft', p_template_id, v_payload_hash, 'completed', v_result
  );

  return v_result;
end;
$$;

-- 18.4 template_patch_metadata RPC
create or replace function public.template_patch_metadata(
  p_actor uuid,
  p_request text,
  p_template_id text,
  p_expected_revision bigint,
  p_patch jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_payload_hash text;
  v_op record;
  v_template record;
  v_updated record;
  v_name text;
  v_category_id text;
  v_tags text[];
  v_sort_order integer;
  v_result jsonb;
begin
  perform public.template_authorize_actor(p_actor, 'editor');

  if p_request is null or btrim(p_request) = '' then
    raise exception 'INVALID_REQUEST_ID' using errcode = 'P0001';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'expectedRevision', p_expected_revision,
    'patch', p_patch
  )::text);

  -- Check template_operations for idempotency
  select * into v_op from public.template_operations where request_id = p_request;
  if found then
    if v_op.actor_user_id is distinct from p_actor or v_op.payload_hash <> v_payload_hash then
      raise exception 'OPERATION_CONFLICT' using errcode = 'P0001';
    end if;
    return v_op.result;
  end if;

  -- Lock template for update
  select * into v_template from public.templates where id = p_template_id for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;

  -- CAS check
  if v_template.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT' using errcode = 'P0001';
  end if;

  -- Validate patch fields
  if p_patch ? 'name' then
    v_name := btrim(coalesce(p_patch->>'name', ''));
    if char_length(v_name) < 1 or char_length(v_name) > 120 then
      raise exception 'INVALID_INPUT: name must be 1 to 120 characters' using errcode = 'P0001';
    end if;
  else
    v_name := v_template.name;
  end if;

  if p_patch ? 'categoryId' or p_patch ? 'category_id' then
    v_category_id := coalesce(p_patch->>'categoryId', p_patch->>'category_id');
    if v_category_id is not null and v_category_id <> '' then
      if not exists (select 1 from public.template_categories where id = v_category_id) then
        raise exception 'INVALID_CATEGORY' using errcode = 'P0001';
      end if;
    else
      v_category_id := null;
    end if;
  else
    v_category_id := v_template.category_id;
  end if;

  if p_patch ? 'tags' then
    v_tags := coalesce(array(select jsonb_array_elements_text(coalesce(p_patch->'tags', '[]'::jsonb))), '{}'::text[]);
    if cardinality(v_tags) > 20 then
      raise exception 'INVALID_INPUT: tags cannot exceed 20' using errcode = 'P0001';
    end if;
  else
    v_tags := v_template.tags;
  end if;

  if p_patch ? 'sortOrder' or p_patch ? 'sort_order' then
    v_sort_order := coalesce((p_patch->>'sortOrder')::integer, (p_patch->>'sort_order')::integer, 0);
  else
    v_sort_order := v_template.sort_order;
  end if;

  -- Update template
  update public.templates
  set
    name = v_name,
    category_id = v_category_id,
    tags = v_tags,
    sort_order = v_sort_order,
    revision = revision + 1,
    updated_by = p_actor,
    updated_at = now()
  where id = p_template_id
  returning * into v_updated;

  -- Log asset_event
  insert into public.asset_events (
    actor_user_id, request_id, kind, target_id, before_revision, after_revision, event, metadata_diff
  ) values (
    p_actor,
    case when p_request ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request::uuid else null end,
    'template',
    p_template_id,
    p_expected_revision,
    p_expected_revision + 1,
    'metadata_patched',
    p_patch
  );

  v_result := jsonb_build_object('ok', true, 'template', to_jsonb(v_updated));

  -- Record template_operations
  insert into public.template_operations (
    request_id, actor_user_id, operation, template_id, payload_hash, status, result
  ) values (
    p_request, p_actor, 'patch_metadata', p_template_id, v_payload_hash, 'completed', v_result
  );

  return v_result;
end;
$$;

-- 18.5 Revoke from public, anon, authenticated; grant strictly to service_role
revoke all on function public.template_authorize_actor(uuid, text) from public, anon, authenticated;
grant execute on function public.template_authorize_actor(uuid, text) to service_role;

revoke all on function public.template_create(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.template_create(uuid, text, jsonb) to service_role;

revoke all on function public.template_create_draft(uuid, text, text, bigint, uuid) from public, anon, authenticated;
grant execute on function public.template_create_draft(uuid, text, text, bigint, uuid) to service_role;

revoke all on function public.template_patch_metadata(uuid, text, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.template_patch_metadata(uuid, text, text, bigint, jsonb) to service_role;

-- 18.6 template_acquire_draft_lease RPC
create or replace function public.template_acquire_draft_lease(
  p_actor uuid,
  p_request text,
  p_draft_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_draft record;
  v_updated_draft record;
  v_now timestamptz := clock_timestamp();
  v_lease_duration interval := interval '120 seconds';
begin
  perform public.template_authorize_actor(p_actor, 'editor');

  if p_request is null or btrim(p_request) = '' then
    raise exception 'INVALID_REQUEST_ID' using errcode = 'P0001';
  end if;
  if p_draft_id is null or p_session_id is null then
    raise exception 'INVALID_INPUT: draft_id and session_id required' using errcode = 'P0001';
  end if;

  select * into v_draft from public.template_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'NOT_FOUND: draft not found' using errcode = 'P0001';
  end if;

  if v_draft.lease_expires_at is not null and v_draft.lease_expires_at > v_now then
    if v_draft.editor_user_id = p_actor and v_draft.lease_session_id = p_session_id then
      update public.template_drafts
      set
        lease_expires_at = v_now + v_lease_duration,
        last_activity_at = v_now,
        updated_at = v_now
      where id = p_draft_id
      returning * into v_updated_draft;
      return jsonb_build_object('ok', true, 'draft', to_jsonb(v_updated_draft));
    else
      raise exception 'LEASE_CONFLICT: lease is currently held by another session' using errcode = 'P0001';
    end if;
  else
    if v_draft.lease_session_id is not null and (v_draft.editor_user_id is distinct from p_actor or v_draft.lease_session_id is distinct from p_session_id) then
      raise exception 'LEASE_EXPIRED: lease has expired and must be taken over by admin' using errcode = 'P0001';
    end if;

    update public.template_drafts
    set
      editor_user_id = p_actor,
      lease_session_id = p_session_id,
      lease_expires_at = v_now + v_lease_duration,
      last_activity_at = v_now,
      updated_at = v_now
    where id = p_draft_id
    returning * into v_updated_draft;

    return jsonb_build_object('ok', true, 'draft', to_jsonb(v_updated_draft));
  end if;
end;
$$;

-- 18.7 template_heartbeat_draft_lease RPC
create or replace function public.template_heartbeat_draft_lease(
  p_actor uuid,
  p_request text,
  p_draft_id uuid,
  p_session_id uuid,
  p_epoch bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_draft record;
  v_now timestamptz := clock_timestamp();
  v_expires_at timestamptz;
begin
  perform public.template_authorize_actor(p_actor, 'editor');

  if p_draft_id is null or p_session_id is null or p_epoch is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select * into v_draft from public.template_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'NOT_FOUND: draft not found' using errcode = 'P0001';
  end if;

  if v_draft.editor_user_id is distinct from p_actor or v_draft.lease_session_id is distinct from p_session_id or v_draft.lease_epoch <> p_epoch then
    raise exception 'LEASE_LOST: lease held by another session or epoch changed' using errcode = 'P0001';
  end if;

  if v_draft.lease_expires_at is null or v_draft.lease_expires_at <= v_now then
    raise exception 'LEASE_EXPIRED: lease expired' using errcode = 'P0001';
  end if;

  v_expires_at := v_now + interval '120 seconds';

  update public.template_drafts
  set
    lease_expires_at = v_expires_at,
    last_activity_at = v_now,
    updated_at = v_now
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

-- 18.8 template_save_draft RPC
create or replace function public.template_save_draft(
  p_actor uuid,
  p_request text,
  p_draft_id uuid,
  p_expected_revision bigint,
  p_session_id uuid,
  p_epoch bigint,
  p_document jsonb,
  p_document_schema_version integer default 1
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_doc_hash text;
  v_payload_hash text;
  v_op record;
  v_draft record;
  v_next_revision bigint;
  v_schema_version integer;
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
begin
  perform public.template_authorize_actor(p_actor, 'editor');

  if p_request is null or btrim(p_request) = '' then
    raise exception 'INVALID_REQUEST_ID' using errcode = 'P0001';
  end if;
  if p_draft_id is null or p_session_id is null or p_expected_revision is null or p_epoch is null or p_document is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'draftId', p_draft_id,
    'expectedRevision', p_expected_revision,
    'sessionId', p_session_id,
    'epoch', p_epoch,
    'document', p_document,
    'schemaVersion', p_document_schema_version
  )::text);

  -- Check idempotency
  select * into v_op from public.template_operations where request_id = p_request;
  if found then
    if v_op.actor_user_id is distinct from p_actor or v_op.payload_hash <> v_payload_hash then
      raise exception 'OPERATION_CONFLICT' using errcode = 'P0001';
    end if;
    return v_op.result;
  end if;

  select * into v_draft from public.template_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'NOT_FOUND: draft not found' using errcode = 'P0001';
  end if;

  if v_draft.editor_user_id is distinct from p_actor or v_draft.lease_session_id is distinct from p_session_id or v_draft.lease_epoch <> p_epoch then
    raise exception 'LEASE_LOST: lease held by another session or epoch changed' using errcode = 'P0001';
  end if;

  if v_draft.lease_expires_at is null or v_draft.lease_expires_at <= v_now then
    raise exception 'LEASE_EXPIRED: lease expired' using errcode = 'P0001';
  end if;

  if v_draft.draft_revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT' using errcode = 'P0001';
  end if;

  v_doc_hash := encode(digest(p_document::text, 'sha256'), 'hex');
  v_schema_version := coalesce(p_document_schema_version, v_draft.document_schema_version, 1);

  if p_document = v_draft.design_document then
    -- No semantic change: do not increment revision, touch lease/activity
    update public.template_drafts
    set
      document_schema_version = v_schema_version,
      source_document_hash = coalesce(v_draft.source_document_hash, v_doc_hash),
      lease_expires_at = v_now + interval '120 seconds',
      last_activity_at = v_now,
      updated_by = p_actor,
      updated_at = v_now
    where id = p_draft_id;

    v_result := jsonb_build_object(
      'ok', true,
      'value', jsonb_build_object(
        'revision', v_draft.draft_revision,
        'updatedAt', v_now,
        'requestId', p_request
      )
    );
  else
    v_next_revision := v_draft.draft_revision + 1;

    update public.template_drafts
    set
      design_document = p_document,
      document_schema_version = v_schema_version,
      draft_revision = v_next_revision,
      source_document_hash = v_doc_hash,
      lease_expires_at = v_now + interval '120 seconds',
      last_activity_at = v_now,
      updated_by = p_actor,
      updated_at = v_now
    where id = p_draft_id;

    -- Invalidate unexpired validation receipts for this draft
    update public.template_validation_runs
    set expires_at = v_now
    where draft_id = p_draft_id
      and expires_at > v_now;

    v_result := jsonb_build_object(
      'ok', true,
      'value', jsonb_build_object(
        'revision', v_next_revision,
        'updatedAt', v_now,
        'requestId', p_request
      )
    );
  end if;

  insert into public.template_operations (
    request_id, actor_user_id, operation, template_id, payload_hash, status, result
  ) values (
    p_request, p_actor, 'save_draft', v_draft.template_id, v_payload_hash, 'completed', v_result
  );

  return v_result;
end;
$$;

-- 18.9 template_takeover_draft RPC
create or replace function public.template_takeover_draft(
  p_actor uuid,
  p_request text,
  p_draft_id uuid,
  p_expected_revision bigint,
  p_expected_epoch bigint,
  p_new_session_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_draft record;
  v_updated_draft record;
  v_next_epoch bigint;
  v_prev_editor uuid;
  v_now timestamptz := clock_timestamp();
  v_reason text;
begin
  perform public.template_authorize_actor(p_actor, 'admin');

  if p_request is null or btrim(p_request) = '' then
    raise exception 'INVALID_REQUEST_ID' using errcode = 'P0001';
  end if;
  if p_draft_id is null or p_expected_revision is null or p_expected_epoch is null or p_new_session_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'INVALID_INPUT: takeover reason must be 3 to 500 characters' using errcode = 'P0001';
  end if;

  select * into v_draft from public.template_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'NOT_FOUND: draft not found' using errcode = 'P0001';
  end if;

  if v_draft.draft_revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT' using errcode = 'P0001';
  end if;

  if v_draft.lease_epoch <> p_expected_epoch then
    raise exception 'REVISION_CONFLICT: draft epoch mismatch' using errcode = 'P0001';
  end if;

  if v_draft.lease_expires_at is not null and v_draft.lease_expires_at > v_now then
    raise exception 'LEASE_ACTIVE: cannot take over active lease' using errcode = 'P0001';
  end if;

  v_next_epoch := v_draft.lease_epoch + 1;
  v_prev_editor := v_draft.editor_user_id;

  update public.template_drafts
  set
    editor_user_id = p_actor,
    lease_session_id = p_new_session_id,
    lease_epoch = v_next_epoch,
    lease_expires_at = v_now + interval '120 seconds',
    last_activity_at = v_now,
    updated_by = p_actor,
    updated_at = v_now
  where id = p_draft_id
  returning * into v_updated_draft;

  insert into public.asset_events (
    actor_user_id, request_id, kind, target_id, before_revision, after_revision, event, metadata_diff
  ) values (
    p_actor,
    case when p_request ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request::uuid else null end,
    'template',
    v_draft.template_id,
    v_draft.draft_revision,
    v_draft.draft_revision,
    'draft_taken_over',
    jsonb_build_object(
      'draft_id', p_draft_id,
      'previous_editor_id', v_prev_editor,
      'new_editor_id', p_actor,
      'previous_epoch', v_draft.lease_epoch,
      'epoch', v_next_epoch,
      'reason', v_reason
    )
  );

  return jsonb_build_object('ok', true, 'draft', to_jsonb(v_updated_draft));
end;
$$;

-- 18.10 template_discard_draft RPC
create or replace function public.template_discard_draft(
  p_actor uuid,
  p_request text,
  p_draft_id uuid,
  p_expected_revision bigint,
  p_session_id uuid,
  p_epoch bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_draft record;
  v_now timestamptz := clock_timestamp();
begin
  perform public.template_authorize_actor(p_actor, 'editor');

  if p_request is null or btrim(p_request) = '' then
    raise exception 'INVALID_REQUEST_ID' using errcode = 'P0001';
  end if;
  if p_draft_id is null or p_session_id is null or p_expected_revision is null or p_epoch is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  select * into v_draft from public.template_drafts where id = p_draft_id for update;
  if not found then
    raise exception 'NOT_FOUND: draft not found' using errcode = 'P0001';
  end if;

  if v_draft.editor_user_id is distinct from p_actor or v_draft.lease_session_id is distinct from p_session_id or v_draft.lease_epoch <> p_epoch then
    raise exception 'LEASE_LOST: lease held by another session or epoch changed' using errcode = 'P0001';
  end if;

  if v_draft.lease_expires_at is null or v_draft.lease_expires_at <= v_now then
    raise exception 'LEASE_EXPIRED: lease expired' using errcode = 'P0001';
  end if;

  if v_draft.draft_revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.asset_events (
    actor_user_id, request_id, kind, target_id, before_revision, after_revision, event, metadata_diff
  ) values (
    p_actor,
    case when p_request ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request::uuid else null end,
    'template',
    v_draft.template_id,
    v_draft.draft_revision,
    null,
    'draft_discarded',
    jsonb_build_object('draft_id', p_draft_id)
  );

  delete from public.template_drafts where id = p_draft_id;

  return jsonb_build_object('ok', true, 'draftId', p_draft_id, 'discarded', true);
end;
$$;

-- 18.11 template_attach_asset RPC (State 43 Task 10)
create or replace function public.template_attach_asset(
  p_actor uuid,
  p_template_id text,
  p_draft_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_checksum text,
  p_mime_type text,
  p_byte_size bigint,
  p_pixel_width integer default null,
  p_pixel_height integer default null,
  p_upload_status text default 'attached'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_template record;
  v_draft record;
  v_asset record;
begin
  perform public.template_authorize_actor(p_actor, 'editor');

  if p_template_id is null or btrim(p_template_id) = '' then
    raise exception 'INVALID_INPUT: template_id required' using errcode = 'P0001';
  end if;
  if p_storage_bucket is null or p_storage_bucket not in ('template-drafts', 'template-versions', 'template-assets') then
    raise exception 'INVALID_INPUT: invalid storage_bucket' using errcode = 'P0001';
  end if;
  if p_storage_path is null or btrim(p_storage_path) = '' then
    raise exception 'INVALID_INPUT: storage_path required' using errcode = 'P0001';
  end if;
  if p_checksum is null or btrim(p_checksum) = '' then
    raise exception 'INVALID_INPUT: checksum required' using errcode = 'P0001';
  end if;
  if p_mime_type is null or p_mime_type not in ('image/png', 'image/jpeg', 'image/webp', 'image/svg+xml') then
    raise exception 'INVALID_INPUT: invalid mime_type' using errcode = 'P0001';
  end if;
  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 10485760 then
    raise exception 'INVALID_INPUT: invalid byte_size' using errcode = 'P0001';
  end if;

  select * into v_template from public.templates where id = p_template_id;
  if not found then
    raise exception 'NOT_FOUND: template not found' using errcode = 'P0001';
  end if;

  if p_draft_id is not null then
    select * into v_draft from public.template_drafts where id = p_draft_id and template_id = p_template_id;
    if not found then
      raise exception 'NOT_FOUND: draft not found for template' using errcode = 'P0001';
    end if;
  end if;

  insert into public.template_assets (
    template_id,
    draft_id,
    storage_bucket,
    storage_path,
    checksum,
    mime_type,
    byte_size,
    pixel_width,
    pixel_height,
    upload_status,
    created_by
  ) values (
    p_template_id,
    p_draft_id,
    p_storage_bucket,
    p_storage_path,
    p_checksum,
    p_mime_type,
    p_byte_size,
    p_pixel_width,
    p_pixel_height,
    coalesce(p_upload_status, 'attached'),
    p_actor
  )
  on conflict (storage_path) do update set
    checksum = excluded.checksum,
    mime_type = excluded.mime_type,
    byte_size = excluded.byte_size,
    pixel_width = coalesce(excluded.pixel_width, public.template_assets.pixel_width),
    pixel_height = coalesce(excluded.pixel_height, public.template_assets.pixel_height),
    upload_status = excluded.upload_status,
    updated_at = now()
  returning * into v_asset;

  return jsonb_build_object(
    'ok', true,
    'asset', jsonb_build_object(
      'id', v_asset.id,
      'templateId', v_asset.template_id,
      'draftId', v_asset.draft_id,
      'storageBucket', v_asset.storage_bucket,
      'storagePath', v_asset.storage_path,
      'checksum', v_asset.checksum,
      'mimeType', v_asset.mime_type,
      'byteSize', v_asset.byte_size,
      'pixelWidth', v_asset.pixel_width,
      'pixelHeight', v_asset.pixel_height,
      'uploadStatus', v_asset.upload_status,
      'isPublished', v_asset.is_published,
      'createdAt', v_asset.created_at,
      'updatedAt', v_asset.updated_at
    )
  );
end;
$$;

-- 18.12 template_list_eligible_source_projects RPC (State 43 Task 10)
create or replace function public.template_list_eligible_source_projects(
  p_actor uuid,
  p_product_id text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_result jsonb;
begin
  perform public.template_authorize_actor(p_actor, 'editor');

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'productId', p.product_id,
      'variantId', p.variant_id,
      'currentWorkingRevision', p.current_working_revision,
      'createdAt', p.created_at,
      'updatedAt', p.updated_at,
      'eligible', (
        not exists (select 1 from public.orders o where o.project_id = p.id)
        and not exists (
          select 1 from public.orders o
          where o.approved_design_version_id in (
            select dv.id from public.design_versions dv where dv.project_id = p.id
          )
        )
        and p.working_document is not null
      ),
      'blockedReason', case
        when exists (select 1 from public.orders o where o.project_id = p.id)
          or exists (
            select 1 from public.orders o
            where o.approved_design_version_id in (
              select dv.id from public.design_versions dv where dv.project_id = p.id
            )
          ) then 'HAS_LINKED_ORDERS'
        when p.working_document is null then 'NO_DOCUMENT'
        else null
      end
    ) order by p.updated_at desc
  ), '[]'::jsonb)
  into v_result
  from public.projects p
  where p.owner_user_id = p_actor
    and (p_product_id is null or p.product_id = p_product_id);

  return v_result;
end;
$$;

-- 18.13 template_cleanup_draft_asset RPC (State 43 Task 10)
create or replace function public.template_cleanup_draft_asset(
  p_actor uuid,
  p_request text,
  p_asset_id uuid,
  p_max_age_hours integer default 24
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_asset record;
  v_age_interval interval;
  v_now timestamptz := clock_timestamp();
  v_max_age integer;
begin
  perform public.template_authorize_actor(p_actor, 'editor');

  if p_asset_id is null then
    return jsonb_build_object('success', false, 'reason', 'INVALID_INPUT: asset_id required');
  end if;

  v_max_age := coalesce(p_max_age_hours, 24);
  v_age_interval := (v_max_age || ' hours')::interval;

  -- 1. Lock the template_assets row FOR UPDATE
  select * into v_asset from public.template_assets where id = p_asset_id for update;
  if not found then
    return jsonb_build_object('success', false, 'reason', 'NOT_FOUND');
  end if;

  -- 2. Verify status = 'draft' and ever_published_at IS NULL
  if coalesce(v_asset.status, 'draft') <> 'draft' or v_asset.ever_published_at is not null or v_asset.is_published is true then
    return jsonb_build_object('success', false, 'reason', 'EVER_PUBLISHED_OR_NOT_DRAFT');
  end if;

  -- 3. Verify created_at <= now() - (p_max_age_hours || ' hours')::interval
  if v_asset.created_at > (v_now - v_age_interval) then
    return jsonb_build_object('success', false, 'reason', 'TOO_RECENT');
  end if;

  -- 4. Verify that id::text and storage_path are NOT referenced in:
  --    template_drafts.design_document
  if exists (
    select 1 from public.template_drafts
    where design_document::text like '%' || p_asset_id::text || '%'
       or design_document::text like '%' || v_asset.storage_path || '%'
  ) then
    return jsonb_build_object('success', false, 'reason', 'REFERENCED_IN_DRAFT');
  end if;

  --    template_versions.design_document
  if exists (
    select 1 from public.template_versions
    where design_document::text like '%' || p_asset_id::text || '%'
       or design_document::text like '%' || v_asset.storage_path || '%'
  ) then
    return jsonb_build_object('success', false, 'reason', 'REFERENCED_IN_VERSION');
  end if;

  --    template_version_assets
  if exists (
    select 1 from public.template_version_assets
    where asset_id = p_asset_id
  ) then
    return jsonb_build_object('success', false, 'reason', 'REFERENCED_IN_VERSION_ASSETS');
  end if;

  -- 5. Updates status to 'cleaned', deletes the row, and returns success
  update public.template_assets
  set status = 'cleaned', upload_status = 'cleaned', updated_at = v_now
  where id = p_asset_id;

  delete from public.template_assets where id = p_asset_id;

  return jsonb_build_object(
    'success', true,
    'storage_path', v_asset.storage_path,
    'storage_bucket', v_asset.storage_bucket
  );
end;
$$;

revoke all on function public.template_acquire_draft_lease(uuid, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.template_acquire_draft_lease(uuid, text, uuid, uuid) to service_role;

revoke all on function public.template_heartbeat_draft_lease(uuid, text, uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.template_heartbeat_draft_lease(uuid, text, uuid, uuid, bigint) to service_role;

revoke all on function public.template_save_draft(uuid, text, uuid, bigint, uuid, bigint, jsonb, integer) from public, anon, authenticated;
grant execute on function public.template_save_draft(uuid, text, uuid, bigint, uuid, bigint, jsonb, integer) to service_role;

revoke all on function public.template_takeover_draft(uuid, text, uuid, bigint, bigint, uuid, text) from public, anon, authenticated;
grant execute on function public.template_takeover_draft(uuid, text, uuid, bigint, bigint, uuid, text) to service_role;

revoke all on function public.template_discard_draft(uuid, text, uuid, bigint, uuid, bigint) from public, anon, authenticated;
grant execute on function public.template_discard_draft(uuid, text, uuid, bigint, uuid, bigint) to service_role;

revoke all on function public.template_attach_asset(uuid, text, uuid, text, text, text, text, bigint, integer, integer, text) from public, anon, authenticated;
grant execute on function public.template_attach_asset(uuid, text, uuid, text, text, text, text, bigint, integer, integer, text) to service_role;

revoke all on function public.template_list_eligible_source_projects(uuid, text) from public, anon, authenticated;
grant execute on function public.template_list_eligible_source_projects(uuid, text) to service_role;

revoke all on function public.template_cleanup_draft_asset(uuid, text, uuid, integer) from public, anon, authenticated;
grant execute on function public.template_cleanup_draft_asset(uuid, text, uuid, integer) to service_role;
