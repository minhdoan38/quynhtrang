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
  upload_status text not null default 'pending' check (upload_status in ('pending', 'uploaded', 'verified', 'failed')),
  expires_at timestamptz null,
  is_published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
