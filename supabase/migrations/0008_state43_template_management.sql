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

-- 12.1 Extend Design Versions with Template Provenance
alter table public.design_versions
  add column if not exists source_template_id text null references public.templates(id) on delete restrict,
  add column if not exists source_template_version_id uuid null references public.template_versions(id) on delete restrict;

alter table public.design_versions drop constraint if exists fk_design_versions_source_template_version;
alter table public.design_versions add constraint fk_design_versions_source_template_version
  foreign key (source_template_id, source_template_version_id)
  references public.template_versions(template_id, id)
  on delete restrict;

create index if not exists idx_design_versions_source_template
  on public.design_versions(source_template_id, source_template_version_id);

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

-- 21. Get Template Availability (Central SQL contract for list/clone/order gating)
create or replace function public.get_template_availability(p_template_id text)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_template record;
  v_version record;
  v_blockers jsonb := '[]'::jsonb;
  v_dep record;
  v_face record;
  v_family record;
  v_sticker record;
  v_broken_asset_count integer;
begin
  select * into v_template
  from public.templates
  where id = p_template_id;

  if not found then
    return jsonb_build_object(
      'available', false,
      'blockers', jsonb_build_array(
        jsonb_build_object('code', 'NOT_FOUND', 'message', 'Mẫu không tồn tại')
      )
    );
  end if;

  -- 1. Check if template is archived
  if v_template.status = 'archived' or v_template.archived_at is not null then
    v_blockers := v_blockers || jsonb_build_array(
      jsonb_build_object('code', 'TEMPLATE_ARCHIVED', 'message', 'Mẫu đã được lưu trữ')
    );
  end if;

  -- 2. Check if published version exists
  if v_template.current_published_version_id is null then
    v_blockers := v_blockers || jsonb_build_array(
      jsonb_build_object('code', 'NO_PUBLISHED_VERSION', 'message', 'Mẫu chưa có phiên bản xuất bản')
    );
    return jsonb_build_object('available', false, 'blockers', v_blockers);
  end if;

  select * into v_version
  from public.template_versions
  where id = v_template.current_published_version_id;

  if not found then
    v_blockers := v_blockers || jsonb_build_array(
      jsonb_build_object('code', 'NO_PUBLISHED_VERSION', 'message', 'Phiên bản xuất bản không tồn tại')
    );
    return jsonb_build_object('available', false, 'blockers', v_blockers);
  end if;

  -- 3. Check target snapshot
  if v_template.product_id is null
     or (v_template.target_snapshot is not null
         and v_template.target_snapshot->'surfaces' is not null
         and jsonb_array_length(v_template.target_snapshot->'surfaces') = 0) then
    v_blockers := v_blockers || jsonb_build_array(
      jsonb_build_object('code', 'INVALID_PRODUCT_TARGET', 'message', 'Mục tiêu sản phẩm không hợp lệ')
    );
  end if;

  -- 4. Check version manifest health
  select count(*) into v_broken_asset_count
  from public.template_version_assets tva
  left join public.template_assets ta on ta.id = tva.asset_id
  where tva.version_id = v_version.id
    and (ta.id is null or ta.status = 'cleaned');

  if v_broken_asset_count > 0 then
    v_blockers := v_blockers || jsonb_build_array(
      jsonb_build_object('code', 'VERSION_INVALID', 'message', 'Tài nguyên trong phiên bản bị thiếu hoặc hư hỏng')
    );
  end if;

  -- 5. Check dependencies in template_version_dependencies
  for v_dep in
    select * from public.template_version_dependencies
    where version_id = v_version.id
  loop
    if v_dep.kind = 'font-face' then
      select * into v_face
      from public.font_faces
      where id = v_dep.asset_id::uuid;

      if not found then
        v_blockers := v_blockers || jsonb_build_array(
          jsonb_build_object(
            'code', 'MISSING_DEPENDENCY',
            'kind', 'font-face',
            'id', v_dep.asset_id,
            'message', 'Phông chữ không tồn tại: ' || v_dep.asset_id
          )
        );
      else
        if v_dep.checksum is not null and v_face.checksum is not null and v_dep.checksum <> v_face.checksum then
          v_blockers := v_blockers || jsonb_build_array(
            jsonb_build_object(
              'code', 'MISSING_DEPENDENCY',
              'kind', 'font-face',
              'id', v_dep.asset_id,
              'message', 'Mã kiểm tra phông chữ không khớp: ' || v_dep.asset_id
            )
          );
        end if;

        if v_face.status = 'archived' then
          v_blockers := v_blockers || jsonb_build_array(
            jsonb_build_object(
              'code', 'ARCHIVED_DEPENDENCY',
              'kind', 'font-face',
              'id', v_dep.asset_id,
              'message', 'Phông chữ đã bị lưu trữ: ' || v_dep.asset_id
            )
          );
        elsif v_face.status = 'draft' then
          v_blockers := v_blockers || jsonb_build_array(
            jsonb_build_object(
              'code', 'UNPUBLISHED_DEPENDENCY',
              'kind', 'font-face',
              'id', v_dep.asset_id,
              'message', 'Phông chữ chưa xuất bản: ' || v_dep.asset_id
            )
          );
        end if;

        -- Check parent font family
        select * into v_family
        from public.fonts
        where id = v_face.family_id;

        if not found then
          v_blockers := v_blockers || jsonb_build_array(
            jsonb_build_object(
              'code', 'MISSING_DEPENDENCY',
              'kind', 'font-face',
              'id', v_face.family_id,
              'message', 'Bộ phông chữ không tồn tại: ' || v_face.family_id
            )
          );
        elsif v_family.status = 'archived' then
          v_blockers := v_blockers || jsonb_build_array(
            jsonb_build_object(
              'code', 'ARCHIVED_DEPENDENCY',
              'kind', 'font-face',
              'id', v_face.family_id,
              'message', 'Bộ phông chữ đã bị lưu trữ: ' || v_face.family_id
            )
          );
        elsif v_family.status = 'draft' then
          v_blockers := v_blockers || jsonb_build_array(
            jsonb_build_object(
              'code', 'UNPUBLISHED_DEPENDENCY',
              'kind', 'font-face',
              'id', v_face.family_id,
              'message', 'Bộ phông chữ chưa xuất bản: ' || v_face.family_id
            )
          );
        end if;
      end if;

    elsif v_dep.kind = 'sticker' then
      select * into v_sticker
      from public.sticker_assets
      where id = v_dep.asset_id;

      if not found then
        v_blockers := v_blockers || jsonb_build_array(
          jsonb_build_object(
            'code', 'MISSING_DEPENDENCY',
            'kind', 'sticker',
            'id', v_dep.asset_id,
            'message', 'Nhãn dán không tồn tại: ' || v_dep.asset_id
          )
        );
      else
        if v_dep.checksum is not null and v_sticker.checksum is not null and v_dep.checksum <> v_sticker.checksum then
          v_blockers := v_blockers || jsonb_build_array(
            jsonb_build_object(
              'code', 'MISSING_DEPENDENCY',
              'kind', 'sticker',
              'id', v_dep.asset_id,
              'message', 'Mã kiểm tra nhãn dán không khớp: ' || v_dep.asset_id
            )
          );
        end if;

        if v_sticker.status = 'archived' then
          v_blockers := v_blockers || jsonb_build_array(
            jsonb_build_object(
              'code', 'ARCHIVED_DEPENDENCY',
              'kind', 'sticker',
              'id', v_dep.asset_id,
              'message', 'Nhãn dán đã bị lưu trữ: ' || v_dep.asset_id
            )
          );
        elsif v_sticker.status = 'draft' then
          v_blockers := v_blockers || jsonb_build_array(
            jsonb_build_object(
              'code', 'UNPUBLISHED_DEPENDENCY',
              'kind', 'sticker',
              'id', v_dep.asset_id,
              'message', 'Nhãn dán chưa xuất bản: ' || v_dep.asset_id
            )
          );
        end if;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'available', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers
  );
end;
$$;

-- 21.1 Browse Available Templates (Set-based SQL availability query for customer browsing)
create or replace function public.browse_available_templates(
  p_product_id text default null,
  p_variant_id text default null,
  p_mode text default null,
  p_shape text default null,
  p_category_id text default null,
  p_query text default null,
  p_cursor_sort_order integer default null,
  p_cursor_id text default null,
  p_limit integer default 24
)
returns table (
  id text,
  slug text,
  name text,
  product_id text,
  variant_id text,
  product_mode text,
  fixed_sticker_shape text,
  category_id text,
  tags text[],
  sort_order integer,
  current_published_version_id uuid,
  thumbnail_path text,
  target_snapshot jsonb,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    t.id,
    t.slug,
    t.name,
    t.product_id,
    t.variant_id,
    t.product_mode,
    t.fixed_sticker_shape,
    t.category_id,
    t.tags,
    t.sort_order,
    t.current_published_version_id,
    coalesce(tv.thumbnail_path, t.thumbnail_path) as thumbnail_path,
    coalesce(tv.target_snapshot, t.target_snapshot) as target_snapshot,
    t.updated_at
  from public.templates t
  join public.template_versions tv on tv.id = t.current_published_version_id
  where t.status = 'published'
    and t.archived_at is null
    and t.current_published_version_id is not null
    and t.product_id is not null
    and (p_product_id is null or t.product_id = p_product_id)
    and (p_variant_id is null or t.variant_id = p_variant_id)
    and (
      p_mode is null
      or (p_mode = 'none' and t.product_mode is null)
      or (p_mode <> 'none' and t.product_mode = p_mode)
    )
    and (
      p_shape is null
      or (p_shape = 'none' and t.fixed_sticker_shape is null)
      or (p_shape <> 'none' and t.fixed_sticker_shape = p_shape)
    )
    and (p_category_id is null or p_category_id = 'all' or t.category_id = p_category_id)
    and (
      p_query is null
      or p_query = ''
      or t.name ilike '%' || p_query || '%'
      or t.id ilike '%' || p_query || '%'
      or (t.slug is not null and t.slug ilike '%' || p_query || '%')
      or (p_query = any(t.tags))
    )
    and not exists (
      select 1
      from public.template_version_assets tva
      left join public.template_assets ta on ta.id = tva.asset_id
      where tva.version_id = tv.id
        and (ta.id is null or ta.status = 'cleaned')
    )
    and not exists (
      select 1
      from public.template_version_dependencies tvd
      left join public.font_faces ff on ff.id = tvd.asset_id::uuid
      left join public.fonts f on f.id = ff.family_id
      where tvd.version_id = tv.id
        and tvd.kind = 'font-face'
        and (
          ff.id is null
          or ff.status <> 'published'
          or f.id is null
          or f.status <> 'published'
          or (tvd.checksum is not null and ff.checksum is not null and tvd.checksum <> ff.checksum)
        )
    )
    and not exists (
      select 1
      from public.template_version_dependencies tvd
      left join public.sticker_assets sa on sa.id = tvd.asset_id
      where tvd.version_id = tv.id
        and tvd.kind = 'sticker'
        and (
          sa.id is null
          or sa.status <> 'published'
          or (tvd.checksum is not null and sa.checksum is not null and tvd.checksum <> sa.checksum)
        )
    )
    and (
      p_cursor_sort_order is null or p_cursor_id is null
      or (coalesce(t.sort_order, 0) > p_cursor_sort_order)
      or (coalesce(t.sort_order, 0) = p_cursor_sort_order and t.id > p_cursor_id)
    )
  order by coalesce(t.sort_order, 0) asc, t.id asc
  limit least(coalesce(p_limit, 24), 60);
$$;

revoke all on function public.browse_available_templates(text, text, text, text, text, text, integer, text, integer) from public;
grant execute on function public.browse_available_templates(text, text, text, text, text, text, integer, text, integer) to authenticated, service_role, anon;

-- 22. Record Template Validation Run (Server-only RPC)
create or replace function public.template_record_validation_run(
  p_actor_id uuid,
  p_template_id text,
  p_draft_id uuid,
  p_source_revision bigint,
  p_lease_session_id uuid,
  p_lease_epoch bigint,
  p_source_document_hash text,
  p_candidate_document_hash text,
  p_target_hash text,
  p_dependency_manifest_hash text,
  p_findings jsonb,
  p_warning_ids text[],
  p_validator_version text,
  p_engine_fingerprint text,
  p_customer_preview_passed boolean,
  p_thumbnail_asset_id uuid,
  p_thumbnail_checksum text,
  p_preview_metadata jsonb,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_created_at timestamptz;
begin
  insert into public.template_validation_runs (
    template_id,
    draft_id,
    source_revision,
    lease_session_id,
    lease_epoch,
    source_document_hash,
    candidate_document_hash,
    target_hash,
    dependency_manifest_hash,
    findings,
    warning_ids,
    validator_version,
    engine_fingerprint,
    customer_preview_passed,
    thumbnail_asset_id,
    thumbnail_checksum,
    preview_metadata,
    expires_at
  ) values (
    p_template_id,
    p_draft_id,
    p_source_revision,
    p_lease_session_id,
    p_lease_epoch,
    p_source_document_hash,
    p_candidate_document_hash,
    p_target_hash,
    p_dependency_manifest_hash,
    coalesce(p_findings, '[]'::jsonb),
    coalesce(p_warning_ids, '{}'::text[]),
    coalesce(p_validator_version, '1.0.0'),
    p_engine_fingerprint,
    p_customer_preview_passed,
    p_thumbnail_asset_id,
    p_thumbnail_checksum,
    coalesce(p_preview_metadata, '{}'::jsonb),
    p_expires_at
  )
  returning id, created_at into v_id, v_created_at;

  return jsonb_build_object(
    'id', v_id,
    'template_id', p_template_id,
    'draft_id', p_draft_id,
    'source_revision', p_source_revision,
    'created_at', v_created_at,
    'expires_at', p_expires_at
  );
end;
$$;

revoke all on function public.get_template_availability(text) from public, anon;
grant execute on function public.get_template_availability(text) to authenticated, service_role;

revoke all on function public.template_record_validation_run(uuid, text, uuid, bigint, uuid, bigint, text, text, text, text, jsonb, text[], text, text, boolean, uuid, text, jsonb, timestamptz) from public, anon, authenticated;
grant execute on function public.template_record_validation_run(uuid, text, uuid, bigint, uuid, bigint, text, text, text, text, jsonb, text[], text, text, boolean, uuid, text, jsonb, timestamptz) to service_role;


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

-- 23. template_publish_draft RPC (State 43 Task 12)
create or replace function public.template_publish_draft(
  p_actor uuid,
  p_request text,
  p_template_id text,
  p_draft_id uuid,
  p_expected_draft_revision bigint,
  p_expected_catalog_revision bigint,
  p_session_id uuid,
  p_lease_epoch bigint,
  p_validation_id uuid,
  p_acknowledged_warning_ids text[],
  p_revision_note text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
declare
  v_payload_hash text;
  v_op record;
  v_template record;
  v_draft record;
  v_val record;
  v_dep_record record;
  v_face record;
  v_family record;
  v_sticker record;
  v_target_snapshot jsonb;
  v_dependency_snapshot jsonb;
  v_asset_manifest jsonb;
  v_thumb_path text;
  v_next_version integer;
  v_version_id uuid;
  v_version record;
  v_asset_row record;
  v_fam_id text;
  v_result jsonb;
begin
  perform public.template_authorize_actor(p_actor, 'editor');

  if p_request is null or btrim(p_request) = '' then
    raise exception 'INVALID_REQUEST_ID' using errcode = 'P0001';
  end if;
  if p_template_id is null or btrim(p_template_id) = '' then
    raise exception 'INVALID_INPUT: templateId required' using errcode = 'P0001';
  end if;
  if p_draft_id is null then
    raise exception 'INVALID_INPUT: draftId required' using errcode = 'P0001';
  end if;
  if p_validation_id is null then
    raise exception 'INVALID_INPUT: validationId required' using errcode = 'P0001';
  end if;
  if p_revision_note is not null and length(p_revision_note) > 500 then
    raise exception 'INVALID_INPUT: revisionNote max 500 characters' using errcode = 'P0001';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'templateId', p_template_id,
    'draftId', p_draft_id,
    'expectedDraftRevision', p_expected_draft_revision,
    'expectedCatalogRevision', p_expected_catalog_revision,
    'sessionId', p_session_id,
    'leaseEpoch', p_lease_epoch,
    'validationId', p_validation_id,
    'acknowledgedWarningIds', coalesce(p_acknowledged_warning_ids, '{}'::text[]),
    'revisionNote', p_revision_note
  )::text);

  -- 1. Idempotency check via template_operations
  select * into v_op from public.template_operations where request_id = p_request;
  if found then
    if v_op.actor_user_id is distinct from p_actor or v_op.payload_hash <> v_payload_hash then
      raise exception 'OPERATION_CONFLICT' using errcode = 'P0001';
    end if;
    return v_op.result;
  end if;

  -- 2. Lock Template FOR UPDATE
  select * into v_template from public.templates where id = p_template_id for update;
  if not found then
    raise exception 'NOT_FOUND: template not found' using errcode = 'P0001';
  end if;

  -- Re-check idempotency under lock in case a concurrent request with the same request_id just committed
  select * into v_op from public.template_operations where request_id = p_request;
  if found then
    if v_op.actor_user_id is distinct from p_actor or v_op.payload_hash <> v_payload_hash then
      raise exception 'OPERATION_CONFLICT' using errcode = 'P0001';
    end if;
    return v_op.result;
  end if;

  if v_template.status = 'archived' or v_template.archived_at is not null then
    raise exception 'TEMPLATE_ARCHIVED' using errcode = 'P0001';
  end if;

  if p_expected_catalog_revision is not null and v_template.revision <> p_expected_catalog_revision then
    raise exception 'REVISION_CONFLICT' using errcode = 'P0001';
  end if;

  -- 3. Lock Draft FOR UPDATE
  select * into v_draft from public.template_drafts where id = p_draft_id and template_id = p_template_id for update;
  if not found then
    raise exception 'NOT_FOUND: draft not found' using errcode = 'P0001';
  end if;

  if p_expected_draft_revision is not null and v_draft.draft_revision <> p_expected_draft_revision then
    raise exception 'REVISION_CONFLICT' using errcode = 'P0001';
  end if;

  if v_draft.lease_session_id is null or v_draft.lease_session_id <> p_session_id then
    raise exception 'LEASE_CONFLICT: invalid session' using errcode = 'P0001';
  end if;

  if v_draft.lease_epoch <> p_lease_epoch then
    raise exception 'LEASE_CONFLICT: epoch mismatch' using errcode = 'P0001';
  end if;

  if v_draft.lease_expires_at is not null and v_draft.lease_expires_at < now() then
    raise exception 'LEASE_EXPIRED' using errcode = 'P0001';
  end if;

  if v_draft.editor_user_id is not null and v_draft.editor_user_id <> p_actor then
    raise exception 'LEASE_CONFLICT: held by another editor' using errcode = 'P0001';
  end if;

  -- 4. Validate Validation Receipt
  select * into v_val from public.template_validation_runs
  where id = p_validation_id and template_id = p_template_id and draft_id = p_draft_id;
  if not found then
    raise exception 'VALIDATION_FAILED: validation run not found' using errcode = 'P0001';
  end if;

  if v_val.expires_at <= now() then
    raise exception 'VALIDATION_FAILED: validation receipt expired' using errcode = 'P0001';
  end if;

  if not v_val.customer_preview_passed then
    raise exception 'VALIDATION_FAILED: customer preview did not pass' using errcode = 'P0001';
  end if;

  if v_val.source_revision <> v_draft.draft_revision then
    raise exception 'REVISION_CONFLICT: validation source revision mismatch' using errcode = 'P0001';
  end if;

  if v_val.lease_epoch <> v_draft.lease_epoch or v_val.lease_session_id <> v_draft.lease_session_id then
    raise exception 'LEASE_CONFLICT: validation lease mismatch' using errcode = 'P0001';
  end if;

  if v_draft.source_document_hash is not null and v_val.source_document_hash <> v_draft.source_document_hash then
    raise exception 'VALIDATION_FAILED: source document hash mismatch' using errcode = 'P0001';
  end if;

  -- 5. Validates all warnings are acknowledged
  if coalesce(array_length(v_val.warning_ids, 1), 0) > 0 then
    if p_acknowledged_warning_ids is null or not (v_val.warning_ids <@ p_acknowledged_warning_ids) then
      raise exception 'UNACKNOWLEDGED_WARNINGS: all validation warnings must be acknowledged' using errcode = 'P0001';
    end if;
  end if;

  -- 6. Lock and verify dependencies under row lock
  for v_dep_record in (
    select distinct elem->'data'->>'fontFaceId' as font_face_id
    from jsonb_array_elements(coalesce(v_draft.design_document->'elements', '[]'::jsonb)) as elem
    where elem->'data'->>'fontFaceId' is not null
      and btrim(elem->'data'->>'fontFaceId') <> ''
    order by 1
  ) loop
    if v_dep_record.font_face_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select * into v_face from public.font_faces where id = v_dep_record.font_face_id::uuid for update;
      if not found then
        raise exception 'MISSING_DEPENDENCY: font-face % not found', v_dep_record.font_face_id using errcode = 'P0001';
      end if;
      if v_face.status = 'archived' then
        raise exception 'ARCHIVED_DEPENDENCY: font-face % is archived', v_dep_record.font_face_id using errcode = 'P0001';
      elsif v_face.status <> 'published' then
        raise exception 'UNPUBLISHED_DEPENDENCY: font-face % is not published', v_dep_record.font_face_id using errcode = 'P0001';
      end if;

      select * into v_family from public.fonts where id = v_face.family_id for update;
      if not found then
        raise exception 'MISSING_DEPENDENCY: font family % not found', v_face.family_id using errcode = 'P0001';
      end if;
      if v_family.status = 'archived' then
        raise exception 'ARCHIVED_DEPENDENCY: font family % is archived', v_face.family_id using errcode = 'P0001';
      elsif v_family.status <> 'published' then
        raise exception 'UNPUBLISHED_DEPENDENCY: font family % is not published', v_face.family_id using errcode = 'P0001';
      end if;
    end if;
  end loop;

  for v_dep_record in (
    select distinct elem->'data'->>'libraryAssetId' as sticker_id
    from jsonb_array_elements(coalesce(v_draft.design_document->'elements', '[]'::jsonb)) as elem
    where elem->'data'->>'libraryAssetId' is not null
      and btrim(elem->'data'->>'libraryAssetId') <> ''
    order by 1
  ) loop
    select * into v_sticker from public.sticker_assets where id = v_dep_record.sticker_id for update;
    if not found then
      raise exception 'MISSING_DEPENDENCY: sticker % not found', v_dep_record.sticker_id using errcode = 'P0001';
    end if;
    if v_sticker.status = 'archived' then
      raise exception 'ARCHIVED_DEPENDENCY: sticker % is archived', v_dep_record.sticker_id using errcode = 'P0001';
    elsif v_sticker.status <> 'published' then
      raise exception 'UNPUBLISHED_DEPENDENCY: sticker % is not published', v_dep_record.sticker_id using errcode = 'P0001';
    end if;
  end loop;

  -- 7. Prepare target snapshot, dependency snapshot and thumbnail
  v_target_snapshot := coalesce(
    v_template.target_snapshot,
    jsonb_build_object(
      'productId', v_template.product_id,
      'variantId', v_template.variant_id,
      'mode', v_template.product_mode,
      'shape', v_template.fixed_sticker_shape,
      'geometryKey', v_template.product_id || coalesce(':' || v_template.variant_id, ''),
      'surfaces', '[]'::jsonb
    )
  );

  v_dependency_snapshot := '[]'::jsonb;
  for v_dep_record in (
    select distinct
      'font-face' as kind,
      elem->'data'->>'fontFaceId' as asset_id,
      elem->'data'->>'fontChecksum' as checksum
    from jsonb_array_elements(coalesce(v_draft.design_document->'elements', '[]'::jsonb)) as elem
    where elem->'data'->>'fontFaceId' is not null and btrim(elem->'data'->>'fontFaceId') <> ''
    union
    select distinct
      'sticker' as kind,
      elem->'data'->>'libraryAssetId' as asset_id,
      elem->'data'->>'assetChecksum' as checksum
    from jsonb_array_elements(coalesce(v_draft.design_document->'elements', '[]'::jsonb)) as elem
    where elem->'data'->>'libraryAssetId' is not null and btrim(elem->'data'->>'libraryAssetId') <> ''
    order by 1, 2
  ) loop
    v_dependency_snapshot := v_dependency_snapshot || jsonb_build_array(
      jsonb_build_object(
        'kind', v_dep_record.kind,
        'id', v_dep_record.asset_id,
        'checksum', coalesce(v_dep_record.checksum, '')
      )
    );
  end loop;

  v_thumb_path := null;
  if v_val.thumbnail_asset_id is not null then
    select storage_path into v_thumb_path from public.template_assets where id = v_val.thumbnail_asset_id;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'checksum', checksum,
        'storage_path', storage_path,
        'mime_type', mime_type,
        'byte_size', byte_size
      )
    ),
    '[]'::jsonb
  ) into v_asset_manifest
  from public.template_assets
  where template_id = p_template_id
    and (draft_id = p_draft_id or id = v_val.thumbnail_asset_id);

  -- 8. Compute next version number under Template lock
  select coalesce(max(version), 0) + 1 into v_next_version
  from public.template_versions
  where template_id = p_template_id;

  v_version_id := gen_random_uuid();

  -- 9. Insert immutable template_versions record
  insert into public.template_versions (
    id,
    template_id,
    version,
    design_document,
    document_schema_version,
    target_snapshot,
    dependency_snapshot,
    preflight_snapshot,
    validation_id,
    asset_manifest,
    thumbnail_path,
    thumbnail_checksum,
    preview_metadata,
    published_by,
    published_at,
    revision_note
  ) values (
    v_version_id,
    p_template_id,
    v_next_version,
    v_draft.design_document,
    v_draft.document_schema_version,
    v_target_snapshot,
    v_dependency_snapshot,
    jsonb_build_object('findings', v_val.findings, 'warningIds', v_val.warning_ids),
    v_val.id,
    v_asset_manifest,
    v_thumb_path,
    v_val.thumbnail_checksum,
    v_val.preview_metadata,
    p_actor,
    now(),
    p_revision_note
  ) returning * into v_version;

  -- 10. Insert normalized template_version_dependencies
  for v_dep_record in (
    select distinct
      elem->'data'->>'fontFaceId' as font_face_id,
      elem->'data'->>'fontChecksum' as font_checksum
    from jsonb_array_elements(coalesce(v_draft.design_document->'elements', '[]'::jsonb)) as elem
    where elem->'data'->>'fontFaceId' is not null and btrim(elem->'data'->>'fontFaceId') <> ''
  ) loop
    if v_dep_record.font_face_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      select family_id into v_fam_id from public.font_faces where id = v_dep_record.font_face_id::uuid;
      insert into public.template_version_dependencies (version_id, kind, asset_id, checksum, family_id)
      values (v_version_id, 'font-face', v_dep_record.font_face_id, v_dep_record.font_checksum, v_fam_id)
      on conflict do nothing;
    end if;
  end loop;

  for v_dep_record in (
    select distinct
      elem->'data'->>'libraryAssetId' as sticker_id,
      elem->'data'->>'assetChecksum' as sticker_checksum
    from jsonb_array_elements(coalesce(v_draft.design_document->'elements', '[]'::jsonb)) as elem
    where elem->'data'->>'libraryAssetId' is not null and btrim(elem->'data'->>'libraryAssetId') <> ''
  ) loop
    insert into public.template_version_dependencies (version_id, kind, asset_id, checksum)
    values (v_version_id, 'sticker', v_dep_record.sticker_id, v_dep_record.sticker_checksum)
    on conflict do nothing;
  end loop;

  -- 11. Link template_version_assets and mark assets published
  for v_asset_row in
    select * from public.template_assets
    where template_id = p_template_id
      and (draft_id = p_draft_id or id = v_val.thumbnail_asset_id)
  loop
    insert into public.template_version_assets (version_id, asset_id)
    values (v_version_id, v_asset_row.id)
    on conflict do nothing;

    update public.template_assets
    set is_published = true,
        status = 'published',
        ever_published_at = coalesce(ever_published_at, now()),
        upload_status = 'verified',
        draft_id = null
    where id = v_asset_row.id;
  end loop;

  -- 12. Update public.templates
  update public.templates
  set current_published_version_id = v_version_id,
      status = 'published',
      ever_published_at = coalesce(ever_published_at, now()),
      revision = revision + 1,
      updated_at = now()
  where id = p_template_id;

  -- 13. Delete active draft
  delete from public.template_drafts
  where id = p_draft_id and template_id = p_template_id;

  -- 14. Record template_published in public.asset_events
  insert into public.asset_events (
    actor_user_id,
    request_id,
    kind,
    target_id,
    before_revision,
    after_revision,
    event,
    metadata_diff
  ) values (
    p_actor,
    case when p_request ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request::uuid else null end,
    'template',
    p_template_id,
    v_template.revision,
    v_template.revision + 1,
    'template_published',
    jsonb_build_object(
      'event', 'template_published',
      'draftId', p_draft_id::text,
      'draft_id', p_draft_id::text,
      'versionId', v_version_id::text,
      'version_id', v_version_id::text,
      'version', v_next_version,
      'validationId', p_validation_id::text
    )
  );

  -- 15. Record template_operations and return
  v_result := jsonb_build_object(
    'ok', true,
    'version', to_jsonb(v_version)
  );

  insert into public.template_operations (
    request_id,
    actor_user_id,
    operation,
    template_id,
    payload_hash,
    reserved_version_id,
    status,
    result
  ) values (
    p_request,
    p_actor,
    'publish',
    p_template_id,
    v_payload_hash,
    v_version_id,
    'completed',
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.template_publish_draft(uuid, text, text, uuid, bigint, bigint, uuid, bigint, uuid, text[], text) from public, anon, authenticated;
grant execute on function public.template_publish_draft(uuid, text, text, uuid, bigint, bigint, uuid, bigint, uuid, text[], text) to service_role;

-- 24. template_archive RPC (State 43 Task 13)
create or replace function public.template_archive(
  p_actor uuid,
  p_request text,
  p_template_id text,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_op record;
  v_payload_hash text;
  v_template record;
  v_updated record;
  v_result jsonb;
begin
  perform public.template_authorize_actor(p_actor, 'editor');

  if p_request is null or btrim(p_request) = '' then
    raise exception 'INVALID_REQUEST_ID' using errcode = 'P0001';
  end if;
  if p_template_id is null or btrim(p_template_id) = '' then
    raise exception 'INVALID_INPUT: template_id required' using errcode = 'P0001';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'INVALID_INPUT: expected_revision must be positive' using errcode = 'P0001';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'templateId', p_template_id,
    'expectedRevision', p_expected_revision
  )::text);

  select * into v_op from public.template_operations where request_id = p_request;
  if found then
    if v_op.actor_user_id is distinct from p_actor or v_op.payload_hash <> v_payload_hash then
      raise exception 'OPERATION_CONFLICT' using errcode = 'P0001';
    end if;
    return v_op.result;
  end if;

  select * into v_template from public.templates where id = p_template_id for update;
  if not found then
    raise exception 'NOT_FOUND: template not found' using errcode = 'P0001';
  end if;

  if v_template.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT' using errcode = 'P0001';
  end if;

  update public.templates
  set
    status = 'archived',
    archived_at = coalesce(archived_at, now()),
    archived_by = p_actor,
    revision = revision + 1,
    updated_by = p_actor,
    updated_at = now()
  where id = p_template_id
  returning * into v_updated;

  insert into public.asset_events (
    actor_user_id,
    request_id,
    kind,
    target_id,
    before_revision,
    after_revision,
    event,
    metadata_diff
  ) values (
    p_actor,
    case when p_request ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request::uuid else null end,
    'template',
    p_template_id,
    p_expected_revision,
    p_expected_revision + 1,
    'template_archived',
    jsonb_build_object('event', 'template_archived', 'template_id', p_template_id)
  );

  v_result := jsonb_build_object('ok', true, 'template', to_jsonb(v_updated));

  insert into public.template_operations (
    request_id,
    actor_user_id,
    operation,
    template_id,
    payload_hash,
    status,
    result
  ) values (
    p_request,
    p_actor,
    'archive',
    p_template_id,
    v_payload_hash,
    'completed',
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.template_archive(uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.template_archive(uuid, text, text, bigint) to service_role;

-- 25. template_republish RPC (State 43 Task 13)
create or replace function public.template_republish(
  p_actor uuid,
  p_request text,
  p_template_id text,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_op record;
  v_payload_hash text;
  v_template record;
  v_version record;
  v_updated record;
  v_result jsonb;
  v_dep record;
  v_face record;
  v_family record;
  v_sticker record;
begin
  perform public.template_authorize_actor(p_actor, 'editor');

  if p_request is null or btrim(p_request) = '' then
    raise exception 'INVALID_REQUEST_ID' using errcode = 'P0001';
  end if;
  if p_template_id is null or btrim(p_template_id) = '' then
    raise exception 'INVALID_INPUT: template_id required' using errcode = 'P0001';
  end if;
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'INVALID_INPUT: expected_revision must be positive' using errcode = 'P0001';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'templateId', p_template_id,
    'expectedRevision', p_expected_revision
  )::text);

  select * into v_op from public.template_operations where request_id = p_request;
  if found then
    if v_op.actor_user_id is distinct from p_actor or v_op.payload_hash <> v_payload_hash then
      raise exception 'OPERATION_CONFLICT' using errcode = 'P0001';
    end if;
    return v_op.result;
  end if;

  select * into v_template from public.templates where id = p_template_id for update;
  if not found then
    raise exception 'NOT_FOUND: template not found' using errcode = 'P0001';
  end if;

  if v_template.revision <> p_expected_revision then
    raise exception 'REVISION_CONFLICT' using errcode = 'P0001';
  end if;

  if v_template.current_published_version_id is null then
    raise exception 'NO_PUBLISHED_VERSION: cannot republish template without a published version' using errcode = 'P0001';
  end if;

  select * into v_version from public.template_versions
  where template_id = p_template_id and id = v_template.current_published_version_id;
  if not found then
    raise exception 'NOT_FOUND: published version not found' using errcode = 'P0001';
  end if;

  -- Verify all dependencies in template_version_dependencies are still published
  for v_dep in
    select * from public.template_version_dependencies
    where version_id = v_version.id
    order by kind, asset_id
  loop
    if v_dep.kind = 'font-face' then
      select * into v_face from public.font_faces where id::text = v_dep.asset_id for update;
      if not found or v_face.status = 'archived' or v_face.status <> 'published' or v_face.ever_published_at is null then
        raise exception 'ARCHIVED_DEPENDENCY: font-face % is archived or missing', v_dep.asset_id using errcode = 'P0001';
      end if;

      if v_face.family_id is not null then
        select * into v_family from public.fonts where id = v_face.family_id for update;
        if not found or v_family.status = 'archived' or v_family.status <> 'published' then
          raise exception 'ARCHIVED_DEPENDENCY: font family % is archived or missing', v_face.family_id using errcode = 'P0001';
        end if;
      end if;
    end if;

    if v_dep.family_id is not null then
      select * into v_family from public.fonts where id = v_dep.family_id for update;
      if not found or v_family.status = 'archived' or v_family.status <> 'published' then
        raise exception 'ARCHIVED_DEPENDENCY: font family % is archived or missing', v_dep.family_id using errcode = 'P0001';
      end if;
    end if;

    if v_dep.kind = 'sticker' then
      select * into v_sticker from public.sticker_assets where id = v_dep.asset_id for update;
      if not found or v_sticker.status = 'archived' or v_sticker.status <> 'published' or v_sticker.ever_published_at is null then
        raise exception 'ARCHIVED_DEPENDENCY: sticker % is archived or missing', v_dep.asset_id using errcode = 'P0001';
      end if;
    end if;
  end loop;

  update public.templates
  set
    status = 'published',
    archived_at = null,
    archived_by = null,
    revision = revision + 1,
    updated_by = p_actor,
    updated_at = now()
  where id = p_template_id
  returning * into v_updated;

  insert into public.asset_events (
    actor_user_id,
    request_id,
    kind,
    target_id,
    before_revision,
    after_revision,
    event,
    metadata_diff
  ) values (
    p_actor,
    case when p_request ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request::uuid else null end,
    'template',
    p_template_id,
    p_expected_revision,
    p_expected_revision + 1,
    'template_republished',
    jsonb_build_object(
      'event', 'template_republished',
      'template_id', p_template_id,
      'version_id', v_template.current_published_version_id
    )
  );

  v_result := jsonb_build_object('ok', true, 'template', to_jsonb(v_updated));

  insert into public.template_operations (
    request_id,
    actor_user_id,
    operation,
    template_id,
    payload_hash,
    status,
    result
  ) values (
    p_request,
    p_actor,
    'republish',
    p_template_id,
    v_payload_hash,
    'completed',
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.template_republish(uuid, text, text, bigint) from public, anon, authenticated;
grant execute on function public.template_republish(uuid, text, text, bigint) to service_role;

-- 26. template_duplicate RPC (State 43 Task 13)
create or replace function public.template_duplicate(
  p_actor uuid,
  p_request text,
  p_source_template_id text,
  p_new_template_id text default null,
  p_source_version_id uuid default null,
  p_new_name text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_op record;
  v_payload_hash text;
  v_source record;
  v_version record;
  v_draft record;
  v_new_template record;
  v_new_draft record;
  v_doc jsonb;
  v_schema_version integer := 1;
  v_doc_hash text;
  v_new_id text;
  v_new_name text;
  v_result jsonb;
  v_asset record;
  v_new_asset_id uuid;
  v_new_storage_path text;
  v_has_draft_assets boolean := false;
begin
  perform public.template_authorize_actor(p_actor, 'editor');

  if p_request is null or btrim(p_request) = '' then
    raise exception 'INVALID_REQUEST_ID' using errcode = 'P0001';
  end if;
  if p_source_template_id is null or btrim(p_source_template_id) = '' then
    raise exception 'INVALID_INPUT: source_template_id required' using errcode = 'P0001';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'sourceTemplateId', p_source_template_id,
    'newTemplateId', p_new_template_id,
    'sourceVersionId', p_source_version_id,
    'newName', p_new_name
  )::text);

  select * into v_op from public.template_operations where request_id = p_request;
  if found then
    if v_op.actor_user_id is distinct from p_actor or v_op.payload_hash <> v_payload_hash then
      raise exception 'OPERATION_CONFLICT' using errcode = 'P0001';
    end if;
    return v_op.result;
  end if;

  select * into v_source from public.templates where id = p_source_template_id;
  if not found then
    raise exception 'NOT_FOUND: source template not found' using errcode = 'P0001';
  end if;

  -- Determine which document to duplicate
  if p_source_version_id is not null then
    select * into v_version from public.template_versions
    where template_id = p_source_template_id and id = p_source_version_id;
    if not found then
      raise exception 'NOT_FOUND: source version not found' using errcode = 'P0001';
    end if;
    v_doc := v_version.design_document;
    v_schema_version := coalesce(v_version.document_schema_version, 1);
  elsif v_source.current_published_version_id is not null then
    select * into v_version from public.template_versions
    where template_id = p_source_template_id and id = v_source.current_published_version_id;
    if found then
      v_doc := v_version.design_document;
      v_schema_version := coalesce(v_version.document_schema_version, 1);
    end if;
  end if;

  if v_doc is null then
    select * into v_draft from public.template_drafts where template_id = p_source_template_id;
    if found then
      v_doc := v_draft.design_document;
      v_schema_version := coalesce(v_draft.document_schema_version, 1);
    end if;
  end if;

  if v_doc is null then
    raise exception 'NOT_FOUND: no version or draft found to duplicate' using errcode = 'P0001';
  end if;

  v_new_id := coalesce(nullif(btrim(p_new_template_id), ''), 'tmpl-' || encode(gen_random_bytes(6), 'hex'));
  v_new_name := coalesce(nullif(btrim(p_new_name), ''), substring((v_source.name || ' — Bản sao') from 1 for 120));

  insert into public.templates (
    id, name, slug, product_id, variant_id, product_mode, fixed_sticker_shape,
    category_id, tags, sort_order, target_snapshot, status, revision,
    current_published_version_id, ever_published_at,
    created_by, updated_by, created_at, updated_at
  ) values (
    v_new_id,
    v_new_name,
    v_new_id,
    v_source.product_id,
    v_source.variant_id,
    v_source.product_mode,
    v_source.fixed_sticker_shape,
    v_source.category_id,
    v_source.tags,
    v_source.sort_order,
    v_source.target_snapshot,
    'draft',
    1,
    null,
    null,
    p_actor,
    p_actor,
    now(),
    now()
  ) returning * into v_new_template;

  v_doc_hash := encode(digest(v_doc::text, 'sha256'), 'hex');

  insert into public.template_drafts (
    template_id, based_on_version_id, design_document, document_schema_version,
    draft_revision, source_document_hash, created_by, updated_by, created_at, updated_at
  ) values (
    v_new_id, null, v_doc, v_schema_version,
    1, v_doc_hash, p_actor, p_actor, now(), now()
  ) returning * into v_new_draft;

  -- Copy private draft assets and rewrite document references
  for v_asset in
    select * from public.template_assets
    where template_id = p_source_template_id and status = 'draft'
  loop
    v_new_asset_id := gen_random_uuid();
    v_new_storage_path := v_new_id || '/' || v_new_asset_id::text ||
      coalesce(
        substring(v_asset.storage_path from '\.[a-zA-Z0-9]+$'),
        case v_asset.mime_type
          when 'image/png' then '.png'
          when 'image/jpeg' then '.jpg'
          when 'image/webp' then '.webp'
          when 'image/svg+xml' then '.svg'
          else ''
        end
      );

    insert into public.template_assets (
      id, template_id, draft_id, storage_bucket, storage_path, checksum,
      mime_type, byte_size, pixel_width, pixel_height, upload_status,
      status, ever_published_at, expires_at, is_published,
      created_by, created_at, updated_at
    ) values (
      v_new_asset_id,
      v_new_id,
      v_new_draft.id,
      v_asset.storage_bucket,
      v_new_storage_path,
      v_asset.checksum,
      v_asset.mime_type,
      v_asset.byte_size,
      v_asset.pixel_width,
      v_asset.pixel_height,
      v_asset.upload_status,
      'draft',
      null,
      v_asset.expires_at,
      false,
      p_actor,
      now(),
      now()
    );

    v_doc := replace(v_doc::text, v_asset.id::text, v_new_asset_id::text)::jsonb;
    v_has_draft_assets := true;
  end loop;

  if v_has_draft_assets then
    v_doc := replace(v_doc::text, '/api/admin/content/templates/' || p_source_template_id || '/', '/api/admin/content/templates/' || v_new_id || '/')::jsonb;
    v_doc_hash := encode(digest(v_doc::text, 'sha256'), 'hex');
    update public.template_drafts
    set design_document = v_doc,
        source_document_hash = v_doc_hash,
        updated_at = now()
    where id = v_new_draft.id
    returning * into v_new_draft;
  end if;
  insert into public.asset_events (
    actor_user_id, request_id, kind, target_id, before_revision, after_revision, event, metadata_diff
  ) values (
    p_actor,
    case when p_request ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request::uuid else null end,
    'template',
    v_new_id,
    null,
    1,
    'created',
    jsonb_build_object(
      'event', 'created',
      'source_template_id', p_source_template_id,
      'name', v_new_name
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'template', to_jsonb(v_new_template),
    'draft', to_jsonb(v_new_draft)
  );

  insert into public.template_operations (
    request_id, actor_user_id, operation, template_id, payload_hash, status, result
  ) values (
    p_request, p_actor, 'duplicate', v_new_id, v_payload_hash, 'completed', v_result
  );

  return v_result;
end;
$$;

revoke all on function public.template_duplicate(uuid, text, text, text, uuid, text) from public, anon, authenticated;
grant execute on function public.template_duplicate(uuid, text, text, text, uuid, text) to service_role;

-- 27. template_delete_draft RPC (State 43 Task 13)
create or replace function public.template_delete_draft(
  p_actor uuid,
  p_request text,
  p_template_id text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_op record;
  v_payload_hash text;
  v_template record;
  v_result jsonb;
begin
  perform public.template_authorize_actor(p_actor, 'admin');

  if p_request is null or btrim(p_request) = '' then
    raise exception 'INVALID_REQUEST_ID' using errcode = 'P0001';
  end if;
  if p_template_id is null or btrim(p_template_id) = '' then
    raise exception 'INVALID_INPUT: template_id required' using errcode = 'P0001';
  end if;

  v_payload_hash := md5(jsonb_build_object('templateId', p_template_id)::text);

  select * into v_op from public.template_operations where request_id = p_request;
  if found then
    if v_op.actor_user_id is distinct from p_actor or v_op.payload_hash <> v_payload_hash then
      raise exception 'OPERATION_CONFLICT' using errcode = 'P0001';
    end if;
    return v_op.result;
  end if;

  select * into v_template from public.templates where id = p_template_id for update;
  if not found then
    raise exception 'NOT_FOUND: template not found' using errcode = 'P0001';
  end if;

  if v_template.status <> 'draft' or v_template.ever_published_at is not null or v_template.current_published_version_id is not null then
    raise exception 'CANNOT_DELETE_PUBLISHED_TEMPLATE: template has been published' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.template_versions where template_id = p_template_id) then
    raise exception 'CANNOT_DELETE_TEMPLATE_WITH_VERSIONS: template has versions' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.projects where source_template_id = p_template_id) then
    raise exception 'CANNOT_DELETE_REFERENCED_TEMPLATE: template is referenced by projects' using errcode = 'P0001';
  end if;

  -- Delete draft assets belonging to this draft template
  delete from public.template_assets where template_id = p_template_id;

  -- Delete draft
  delete from public.template_drafts where template_id = p_template_id;

  -- Delete template
  delete from public.templates where id = p_template_id;

  insert into public.asset_events (
    actor_user_id, request_id, kind, target_id, before_revision, after_revision, event, metadata_diff
  ) values (
    p_actor,
    case when p_request ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request::uuid else null end,
    'template',
    p_template_id,
    v_template.revision,
    null,
    'deleted',
    jsonb_build_object('name', v_template.name, 'template_id', p_template_id)
  );

  v_result := jsonb_build_object('ok', true, 'templateId', p_template_id, 'deleted', true);

  insert into public.template_operations (
    request_id, actor_user_id, operation, template_id, payload_hash, status, result
  ) values (
    p_request, p_actor, 'delete', null, v_payload_hash, 'completed', v_result
  );

  return v_result;
end;
$$;

revoke all on function public.template_delete_draft(uuid, text, text) from public, anon, authenticated;
grant execute on function public.template_delete_draft(uuid, text, text) to service_role;

-- 28. Extend library_prepare_delete with template draft and version dependency checks (State 43 Task 13)
create or replace function public.library_prepare_delete(
  p_actor uuid,
  p_request uuid,
  p_kind text,
  p_id text,
  p_revision bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_next bigint;
  v_intent uuid := gen_random_uuid();
begin
  perform public.library_authorize(p_actor, true);

  if p_kind = 'sticker' then
    select revision into v_next
    from public.sticker_assets
    where id = p_id and status = 'draft' and ever_published_at is null
    for update;
  elsif p_kind = 'font-face' then
    select revision into v_next
    from public.font_faces
    where id::text = p_id and status = 'draft' and ever_published_at is null
    for update;
  else
    raise exception 'INVALID_INPUT';
  end if;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if v_next <> p_revision then
    raise exception 'REVISION_CONFLICT';
  end if;

  if exists (
    select 1 from public.design_versions dv
    where dv.design_document::text like '%"' || p_id || '"%'
  ) or exists (
    select 1 from public.projects pr
    where pr.working_document::text like '%"' || p_id || '"%'
  ) or exists (
    select 1 from public.template_drafts td
    where td.design_document::text like '%"' || p_id || '"%'
  ) or exists (
    select 1 from public.template_version_dependencies tvd
    where tvd.asset_id = p_id or tvd.family_id = p_id
  ) then
    raise exception 'REFERENCED_DRAFT';
  end if;

  insert into public.library_uploads(id, actor_user_id, kind, asset_id, request_id, storage_path, byte_size, state)
  values (v_intent, p_actor, p_kind, p_id, p_request, v_intent::text, 1, 'cleanup_pending');

  perform public.library_event(p_actor, p_request, p_kind, p_id, p_revision, p_revision, 'delete_prepared', '{}'::jsonb);

  return jsonb_build_object('ok', true, 'intent', v_intent);
end;
$$;

revoke all on function public.library_prepare_delete(uuid, uuid, text, text, bigint) from public, anon;
grant execute on function public.library_prepare_delete(uuid, uuid, text, text, bigint) to authenticated;

-- 29. clone_template_into_project RPC (State 43 Task 17)
create or replace function public.clone_template_into_project(
  p_actor uuid,
  p_request text,
  p_template_id text,
  p_expected_version_id uuid,
  p_target jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_payload_hash text;
  v_op record;
  v_existing_project record;
  v_template record;
  v_version record;
  v_cloned_doc jsonb;
  v_new_project record;
  v_result jsonb;
begin
  -- 1. Actor authorization
  if p_actor is null then
    raise exception 'UNAUTHENTICATED' using errcode = 'P0001';
  end if;

  if auth.uid() is not null and auth.uid() <> p_actor then
    raise exception 'FORBIDDEN: cannot clone template for another user' using errcode = 'P0001';
  end if;

  -- 2. Request validation
  if p_request is null or btrim(p_request) = '' then
    raise exception 'INVALID_REQUEST_ID' using errcode = 'P0001';
  end if;

  if p_template_id is null or btrim(p_template_id) = '' or p_expected_version_id is null then
    raise exception 'INVALID_INPUT' using errcode = 'P0001';
  end if;

  v_payload_hash := md5(jsonb_build_object(
    'templateId', p_template_id,
    'expectedVersionId', p_expected_version_id,
    'target', p_target
  )::text);

  -- 3. Idempotency check: project row
  select id, current_working_revision, working_document
  into v_existing_project
  from public.projects
  where owner_user_id = p_actor and clone_request_key = p_request;

  if found then
    return jsonb_build_object(
      'project_id', v_existing_project.id,
      'revision', v_existing_project.current_working_revision,
      'document', v_existing_project.working_document
    );
  end if;

  -- 4. Idempotency check: template_operations
  select * into v_op from public.template_operations where request_id = p_request;
  if found then
    if v_op.actor_user_id is distinct from p_actor or v_op.payload_hash <> v_payload_hash then
      raise exception 'OPERATION_CONFLICT' using errcode = 'P0001';
    end if;
    return v_op.result;
  end if;

  -- 5. Lock template FOR UPDATE
  select * into v_template
  from public.templates
  where id = p_template_id
  for update;

  if not found then
    raise exception 'NOT_FOUND: template not found' using errcode = 'P0001';
  end if;

  -- 6. Check template status and archived state
  if v_template.status <> 'published' or v_template.archived_at is not null then
    raise exception 'TEMPLATE_UNAVAILABLE: template is not available for cloning' using errcode = 'P0001';
  end if;

  -- 7. Check current published version
  if v_template.current_published_version_id is distinct from p_expected_version_id then
    raise exception 'TEMPLATE_CHANGED: expected version does not match current published version' using errcode = 'P0001';
  end if;

  -- 8. Fetch immutable version
  select * into v_version
  from public.template_versions
  where id = p_expected_version_id;

  if not found then
    raise exception 'NOT_FOUND: template version not found' using errcode = 'P0001';
  end if;

  -- 9. Validate target if provided
  if p_target is not null and p_target ? 'productId' and v_version.product_id <> (p_target->>'productId') then
    raise exception 'TARGET_MISMATCH: target product does not match template' using errcode = 'P0001';
  end if;

  -- 10. Check dependencies availability
  if exists (
    select 1
    from public.template_version_dependencies tvd
    left join public.fonts f on tvd.family_id is not null and f.id = tvd.family_id
    left join public.font_faces ff on tvd.asset_id is not null and tvd.asset_type = 'font_face' and ff.id::text = tvd.asset_id
    left join public.sticker_assets sa on tvd.asset_id is not null and tvd.asset_type = 'sticker' and sa.id = tvd.asset_id
    where tvd.version_id = p_expected_version_id
      and (
        (tvd.family_id is not null and (f.id is null or f.status = 'archived'))
        or (tvd.asset_type = 'font_face' and (ff.id is null or ff.status = 'archived'))
        or (tvd.asset_type = 'sticker' and (sa.id is null or sa.status = 'archived'))
      )
  ) then
    raise exception 'TEMPLATE_UNAVAILABLE: template has blocked dependencies' using errcode = 'P0001';
  end if;

  -- 11. Clone version document, set sourceTemplate and documentSchemaVersion, preserving customerLocked
  v_cloned_doc := v_version.design_document;
  v_cloned_doc := jsonb_set(v_cloned_doc, '{templateId}', to_jsonb(p_template_id));
  v_cloned_doc := jsonb_set(v_cloned_doc, '{sourceTemplate}', jsonb_build_object(
    'templateId', p_template_id,
    'templateVersionId', p_expected_version_id
  ));
  v_cloned_doc := jsonb_set(v_cloned_doc, '{documentSchemaVersion}', coalesce(to_jsonb(v_version.document_schema_version), '1'::jsonb));
  v_cloned_doc := jsonb_set(v_cloned_doc, '{productId}', to_jsonb(v_version.product_id));
  if v_version.variant_id is not null then
    v_cloned_doc := jsonb_set(v_cloned_doc, '{variantId}', to_jsonb(v_version.variant_id));
  end if;

  -- 12. Insert into public.projects
  insert into public.projects (
    owner_user_id,
    product_id,
    variant_id,
    status,
    current_working_revision,
    working_document,
    source_template_id,
    source_template_version_id,
    clone_request_key,
    created_at,
    updated_at
  ) values (
    p_actor,
    v_version.product_id,
    v_version.variant_id,
    'editing',
    1,
    v_cloned_doc,
    p_template_id,
    p_expected_version_id,
    p_request,
    now(),
    now()
  ) returning * into v_new_project;

  -- 13. Log metadata-only template_used in asset_events
  insert into public.asset_events (
    actor_user_id,
    request_id,
    kind,
    target_id,
    before_revision,
    after_revision,
    event,
    metadata_diff
  ) values (
    p_actor,
    case when p_request ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_request::uuid else null end,
    'template',
    p_template_id,
    v_template.revision,
    v_template.revision,
    'template_used',
    jsonb_build_object(
      'project_id', v_new_project.id,
      'version_id', p_expected_version_id
    )
  );

  v_result := jsonb_build_object(
    'project_id', v_new_project.id,
    'revision', v_new_project.current_working_revision,
    'document', v_new_project.working_document
  );

  -- 14. Record in template_operations
  insert into public.template_operations (
    request_id,
    actor_user_id,
    operation,
    template_id,
    payload_hash,
    status,
    result
  ) values (
    p_request,
    p_actor,
    'clone',
    p_template_id,
    v_payload_hash,
    'completed',
    v_result
  );

  return v_result;
end;
$$;

revoke all on function public.clone_template_into_project(uuid, text, text, uuid, jsonb) from public, anon;
grant execute on function public.clone_template_into_project(uuid, text, text, uuid, jsonb) to authenticated, service_role;
