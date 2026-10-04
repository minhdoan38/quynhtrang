-- State 43: Final Template Catalog Cutover & Legacy Deprecation
-- Gate assertion, drop obsolete published boolean, enforce active targets, and revoke legacy SELECT.

-- 1. Verification gate assertion
-- Fails migration if preexisting legacy catalog has unmapped or unverified target combinations
do $$
declare
  v_unmapped_count integer;
  v_null_target_count integer;
begin
  -- 1.1 Refuse cutover if any published template lacks exact target specification
  select count(*) into v_null_target_count
  from public.templates
  where status = 'published'
    and (
      product_id is null
      or variant_id is null
      or target_snapshot is null
      or current_published_version_id is null
    );

  if v_null_target_count > 0 then
    raise exception 'Migration 0009 verification gate failed: % published templates have null target fields', v_null_target_count;
  end if;

  -- 1.2 If legacy catalog rows exist, verify full legacy mapping in template_legacy_targets
  select count(distinct t.id) into v_unmapped_count
  from public.templates t
  join public.template_versions tv on tv.template_id = t.id
  where (tv.document_schema_version = 0 or tv.document_schema_version is null)
    and not exists (
      select 1 from public.template_legacy_targets tlt
      where tlt.legacy_id = t.id
    );

  if v_unmapped_count > 0 then
    raise exception 'Migration 0009 verification gate failed: % legacy templates lack entries in template_legacy_targets', v_unmapped_count;
  end if;
end $$;

-- 2. Drop obsolete published boolean column from public.templates
alter table public.templates drop column if exists published;

-- 3. Enforce NOT NULL on target fields for active templates
alter table public.templates drop constraint if exists templates_active_target_check;
alter table public.templates add constraint templates_active_target_check
  check (
    status != 'published' or (
      product_id is not null
      and variant_id is not null
      and target_snapshot is not null
      and current_published_version_id is not null
    )
  );

-- 4. Retain read policy for published templates on anon and authenticated; protect raw drafts and versions
drop policy if exists "Read published templates or staff drafts" on public.templates;
drop policy if exists "Allow read published templates" on public.templates;
create policy "Allow read published templates"
  on public.templates for select
  to anon, authenticated
  using (status = 'published' or public.is_staff('editor'));

grant select on table public.templates to anon, authenticated;

drop policy if exists "Read published template versions or staff" on public.template_versions;
create policy "Staff read template versions"
  on public.template_versions for select
  using (public.is_staff('editor'));

drop policy if exists "Read template version dependencies" on public.template_version_dependencies;
create policy "Staff read template version dependencies"
  on public.template_version_dependencies for select
  using (public.is_staff('editor'));

-- Revoke direct customer SELECT grants from anon on internal raw tables
revoke select on table
  public.template_versions,
  public.template_version_dependencies
from anon;
