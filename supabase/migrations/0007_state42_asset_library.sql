-- State 42: admin asset library lifecycle and private draft storage.

-- Private candidate objects. Public library buckets remain immutable service-role surfaces.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library-drafts', 'library-drafts', false, 52428800, null)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "Staff manage storage objects insert" on storage.objects;
drop policy if exists "Staff manage storage objects update" on storage.objects;
drop policy if exists "Staff manage storage objects delete" on storage.objects;
drop policy if exists "Public buckets readable by all" on storage.objects;
drop policy if exists "Private buckets readable by staff" on storage.objects;
create policy "Library drafts readable by staff"
  on storage.objects for select using (bucket_id = 'library-drafts' and public.is_staff());
create policy "Private buckets readable by staff"
  on storage.objects for select using (
    bucket_id in ('customer-assets', 'approved-renders') and public.is_staff()
  );
create policy "Public library objects readable by all"
  on storage.objects for select using (bucket_id in ('template-assets', 'sticker-library', 'fonts'));
create policy "Staff inserts library drafts"
  on storage.objects for insert
  with check (bucket_id = 'library-drafts' and public.is_staff());
create policy "Staff updates library drafts"
  on storage.objects for update
  using (bucket_id = 'library-drafts' and public.is_staff())
  with check (bucket_id = 'library-drafts' and public.is_staff());
create policy "Staff deletes library drafts"
  on storage.objects for delete
  using (bucket_id = 'library-drafts' and public.is_staff());
create policy "Service role manages library objects"
  on storage.objects for all
  using (auth.role() = 'service_role' and bucket_id in ('fonts', 'sticker-library'))
  with check (auth.role() = 'service_role' and bucket_id in ('fonts', 'sticker-library'));

alter table public.fonts
  add column if not exists status text not null default 'draft',
  add column if not exists revision bigint not null default 1,
  add column if not exists ever_published_at timestamptz null,
  add column if not exists display_name text null,
  add column if not exists category text null,
  add column if not exists tags text[] not null default '{}',
  add column if not exists search_keywords text[] not null default '{}',
  add column if not exists description text null,
  add column if not exists sample_text text null,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.fonts drop constraint if exists fonts_status_check;
alter table public.fonts add constraint fonts_status_check check (status in ('draft', 'published', 'archived'));
alter table public.fonts drop constraint if exists fonts_category_check;
alter table public.fonts add constraint fonts_category_check check (category is null or category in ('sans', 'serif', 'handwriting', 'display'));
update public.fonts
set status = case when published then 'published' when metadata->>'status' = 'archived' then 'archived' else 'draft' end,
    ever_published_at = case when published then coalesce(ever_published_at, now()) else ever_published_at end;

create table if not exists public.font_faces (
  id uuid primary key default gen_random_uuid(),
  family_id text not null references public.fonts(id) on delete cascade,
  css_family text not null,
  format text not null check (format in ('ttf', 'otf', 'woff', 'woff2')),
  weight_min integer not null check (weight_min between 100 and 1000),
  weight_max integer not null check (weight_max between 100 and 1000 and weight_max >= weight_min),
  style text not null check (style in ('normal', 'italic')),
  internal_family text not null,
  postscript_name text not null,
  storage_bucket text not null default 'library-drafts',
  storage_path text not null,
  checksum text not null,
  byte_size bigint not null check (byte_size > 0),
  mime_type text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  revision bigint not null default 1,
  ever_published_at timestamptz null,
  license jsonb null,
  validation_id uuid null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_font_faces_published_checksum
  on public.font_faces (checksum) where status <> 'draft';
create index if not exists idx_font_faces_family_status on public.font_faces (family_id, status);

alter table public.sticker_assets
  add column if not exists status text not null default 'draft',
  add column if not exists revision bigint not null default 1,
  add column if not exists ever_published_at timestamptz null,
  add column if not exists display_name text null,
  add column if not exists search_keywords text[] not null default '{}',
  add column if not exists description text null,
  add column if not exists checksum text null,
  add column if not exists mime_type text null,
  add column if not exists byte_size bigint null,
  add column if not exists width integer null,
  add column if not exists height integer null,
  add column if not exists license jsonb null,
  add column if not exists validation_id uuid null,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table public.sticker_assets drop constraint if exists sticker_assets_status_check;
alter table public.sticker_assets add constraint sticker_assets_status_check check (status in ('draft', 'published', 'archived'));
update public.sticker_assets
set status = case when published then 'published' else 'draft' end,
    ever_published_at = case when published then coalesce(ever_published_at, now()) else ever_published_at end;
create unique index if not exists idx_sticker_assets_published_checksum
  on public.sticker_assets (checksum) where status <> 'draft' and checksum is not null;

create table if not exists public.library_validation_runs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('sticker', 'font-face')),
  asset_id text not null,
  revision bigint not null check (revision > 0),
  checksum text not null,
  validator_version text not null,
  engine_fingerprint text not null,
  passed boolean not null,
  failures jsonb not null default '[]'::jsonb,
  missing_codepoints integer[] not null default '{}',
  browser_proof_hash text null,
  production_proof_hash text null,
  result jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_library_validation_asset on public.library_validation_runs (kind, asset_id, revision desc);

create table if not exists public.asset_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  kind text not null,
  target_id text not null,
  request_id uuid null,
  before_revision bigint null,
  after_revision bigint null,
  event text not null,
  metadata_diff jsonb not null default '{}'::jsonb,
  reason text null,
  created_at timestamptz not null default now()
);
create index if not exists idx_asset_events_target on public.asset_events (kind, target_id, created_at desc);

create table if not exists public.library_uploads (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  kind text not null check (kind in ('sticker', 'font-face')),
  asset_id text not null,
  request_id uuid not null,
  bucket text not null default 'library-drafts',
  storage_path text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 52428800),
  checksum text null,
  state text not null default 'pending' check (state in ('pending', 'uploaded', 'committed', 'cleanup_pending', 'cleaned')),
  expires_at timestamptz not null default now() + interval '24 hours',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (actor_user_id, request_id)
);

create or replace function public.reject_asset_event_mutation()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin raise exception 'asset_events is append-only'; end;
$$;
drop trigger if exists asset_events_append_only on public.asset_events;
create trigger asset_events_append_only before update or delete on public.asset_events
for each row execute function public.reject_asset_event_mutation();

drop trigger if exists font_faces_updated_at on public.font_faces;
create trigger font_faces_updated_at before update on public.font_faces
for each row execute function public.set_updated_at();
drop trigger if exists library_uploads_updated_at on public.library_uploads;
create trigger library_uploads_updated_at before update on public.library_uploads
for each row execute function public.set_updated_at();

-- Existing catalog policies granted broad staff mutation. Replace them with published-only reads.
drop policy if exists "Allow read published fonts" on public.fonts;
drop policy if exists "Allow admin manage fonts" on public.fonts;
drop policy if exists "Allow read published sticker assets" on public.sticker_assets;
drop policy if exists "Allow staff manage sticker assets" on public.sticker_assets;
create policy "Read published fonts or staff drafts" on public.fonts for select
  using (status = 'published' or public.is_staff());
create policy "Read published stickers or staff drafts" on public.sticker_assets for select
  using (status = 'published' or public.is_staff());
create policy "Read font faces with published family" on public.font_faces for select
  using (status = 'published' and exists (select 1 from public.fonts f where f.id = family_id and f.status = 'published') or public.is_staff());
create policy "Staff read validation runs" on public.library_validation_runs for select using (public.is_staff());
create policy "Staff read asset events" on public.asset_events for select using (public.is_staff());
create policy "Staff read uploads" on public.library_uploads for select using (public.is_staff());

create policy "Library RPC inserts fonts" on public.fonts for insert
  with check (current_setting('request.library_rpc', true) = '1' and public.is_staff());
create policy "Library RPC updates fonts" on public.fonts for update
  using (current_setting('request.library_rpc', true) = '1' and public.is_staff())
  with check (current_setting('request.library_rpc', true) = '1' and public.is_staff());
create policy "Library RPC deletes fonts" on public.fonts for delete
  using (current_setting('request.library_rpc', true) = '1' and public.is_staff());
create policy "Library RPC inserts stickers" on public.sticker_assets for insert
  with check (current_setting('request.library_rpc', true) = '1' and public.is_staff());
create policy "Library RPC updates stickers" on public.sticker_assets for update
  using (current_setting('request.library_rpc', true) = '1' and public.is_staff())
  with check (current_setting('request.library_rpc', true) = '1' and public.is_staff());
create policy "Library RPC deletes stickers" on public.sticker_assets for delete
  using (current_setting('request.library_rpc', true) = '1' and public.is_staff());
create policy "Library RPC inserts faces" on public.font_faces for insert
  with check (current_setting('request.library_rpc', true) = '1' and public.is_staff());
create policy "Library RPC updates faces" on public.font_faces for update
  using (current_setting('request.library_rpc', true) = '1' and public.is_staff())
  with check (current_setting('request.library_rpc', true) = '1' and public.is_staff());
create policy "Library RPC deletes faces" on public.font_faces for delete
  using (current_setting('request.library_rpc', true) = '1' and public.is_staff());
create policy "Library RPC inserts uploads" on public.library_uploads for insert
  with check (current_setting('request.library_rpc', true) = '1' and public.is_staff());
create policy "Library RPC updates uploads" on public.library_uploads for update
  using (current_setting('request.library_rpc', true) = '1' and public.is_staff())
  with check (current_setting('request.library_rpc', true) = '1' and public.is_staff());
create policy "Library RPC inserts events" on public.asset_events for insert
  with check (current_setting('request.library_rpc', true) = '1' and public.is_staff());
revoke insert, update, delete on table public.fonts, public.font_faces, public.sticker_assets,
  public.library_validation_runs, public.asset_events, public.library_uploads from anon, authenticated;
grant insert, update, delete on table public.fonts, public.font_faces, public.sticker_assets,
  public.asset_events, public.library_uploads to authenticated;
grant select on table public.fonts, public.font_faces, public.sticker_assets to anon, authenticated;
grant select on table public.library_validation_runs, public.asset_events, public.library_uploads to authenticated;

create or replace function public.library_authorize(p_actor uuid, p_admin boolean default false)
returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_role text;
begin
  if auth.uid() is null or p_actor is null or auth.uid() <> p_actor then raise exception 'UNAUTHENTICATED'; end if;
  select role into v_role from public.staff_roles where user_id = p_actor;
  if v_role is null or (p_admin and v_role <> 'admin') then raise exception 'FORBIDDEN'; end if;
  perform set_config('request.library_rpc', '1', true);
end;
$$;

create or replace function public.library_event(
  p_actor uuid, p_request uuid, p_kind text, p_id text, p_before bigint, p_after bigint,
  p_event text, p_diff jsonb default '{}'::jsonb, p_reason text default null
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  insert into public.asset_events(actor_user_id, request_id, kind, target_id, before_revision, after_revision, event, metadata_diff, reason)
  values (p_actor, p_request, p_kind, p_id, p_before, p_after, p_event, coalesce(p_diff, '{}'::jsonb), p_reason);
end;
$$;

create or replace function public.library_create_draft(p_actor uuid, p_request uuid, p_kind text, p_id text, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_row jsonb; v_role text;
begin
  perform public.library_authorize(p_actor);
  if p_kind = 'sticker' then
    insert into public.sticker_assets(id, category, tags, storage_path, published, metadata, status, revision, display_name, search_keywords, description, created_by, updated_by)
    values (p_id, coalesce(p_payload->>'category',''), coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'tags','[]'::jsonb))), '{}'), coalesce(p_payload->>'storage_path',''), false, coalesce(p_payload->'metadata','{}'::jsonb), 'draft', 1, p_payload->>'display_name', coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'search_keywords','[]'::jsonb))), '{}'), p_payload->>'description', p_actor, p_actor)
    returning to_jsonb(sticker_assets.*) into v_row;
  elsif p_kind = 'font-face' then
    insert into public.font_faces(family_id, css_family, format, weight_min, weight_max, style, internal_family, postscript_name, storage_path, checksum, byte_size, mime_type, created_by, updated_by)
    values (p_payload->>'family_id', coalesce(p_payload->>'css_family',''), coalesce(p_payload->>'format','woff2'), coalesce((p_payload->>'weight_min')::integer,400), coalesce((p_payload->>'weight_max')::integer,400), coalesce(p_payload->>'style','normal'), coalesce(p_payload->>'internal_family',''), coalesce(p_payload->>'postscript_name',''), coalesce(p_payload->>'storage_path',''), coalesce(p_payload->>'checksum',''), coalesce((p_payload->>'byte_size')::bigint,1), coalesce(p_payload->>'mime_type','font/woff2'), p_actor, p_actor)
    returning to_jsonb(font_faces.*) into v_row;
  else raise exception 'INVALID_INPUT'; end if;
  perform public.library_event(p_actor, p_request, p_kind, p_id, null, 1, 'created', p_payload);
  return jsonb_build_object('ok', true, 'item', v_row);
end;
$$;

create or replace function public.library_patch_metadata(p_actor uuid, p_request uuid, p_kind text, p_id text, p_revision bigint, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_next bigint; v_row jsonb;
begin
  perform public.library_authorize(p_actor);
  if p_kind = 'sticker' then
    select revision into v_next from public.sticker_assets where id = p_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_next <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
    update public.sticker_assets set display_name = coalesce(p_patch->>'display_name', display_name), category = coalesce(p_patch->>'category', category), description = coalesce(p_patch->>'description', description), revision = revision + 1, updated_by = p_actor where id = p_id returning to_jsonb(sticker_assets.*) into v_row;
  elsif p_kind = 'font-face' then
    select revision into v_next from public.font_faces where id::text = p_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_next <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
    update public.font_faces set revision = revision + 1, updated_by = p_actor where id::text = p_id returning to_jsonb(font_faces.*) into v_row;
  else raise exception 'INVALID_INPUT'; end if;
  perform public.library_event(p_actor, p_request, p_kind, p_id, p_revision, p_revision + 1, 'metadata_patched', p_patch);
  return jsonb_build_object('ok', true, 'item', v_row);
end;
$$;

create or replace function public.library_publish(p_actor uuid, p_request uuid, p_kind text, p_id text, p_revision bigint, p_validation uuid, p_public_objects jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_next bigint; v_row jsonb;
begin
  perform public.library_authorize(p_actor);
  if not exists (select 1 from public.library_validation_runs where id = p_validation and passed and kind = p_kind and asset_id = p_id and revision = p_revision) then raise exception 'VALIDATION_FAILED'; end if;
  if p_kind = 'sticker' then
    select revision into v_next from public.sticker_assets where id = p_id and status in ('draft', 'archived') for update;
    if not found then raise exception 'INVALID_TRANSITION'; end if;
    if v_next <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
    update public.sticker_assets set status = 'published', published = true, ever_published_at = coalesce(ever_published_at, now()), validation_id = p_validation, storage_path = coalesce(p_public_objects->>'key', storage_path), revision = revision + 1, updated_by = p_actor where id = p_id returning to_jsonb(sticker_assets.*) into v_row;
  elsif p_kind = 'font-face' then
    select revision into v_next from public.font_faces where id::text = p_id and status in ('draft', 'archived') for update;
    if not found then raise exception 'INVALID_TRANSITION'; end if;
    if v_next <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
    update public.font_faces set status = 'published', storage_bucket = 'fonts', storage_path = coalesce(p_public_objects->>'key', storage_path), ever_published_at = coalesce(ever_published_at, now()), validation_id = p_validation, revision = revision + 1, updated_by = p_actor where id::text = p_id returning to_jsonb(font_faces.*) into v_row;
  else raise exception 'INVALID_INPUT'; end if;
  perform public.library_event(p_actor, p_request, p_kind, p_id, p_revision, p_revision + 1, 'published', p_public_objects);
  return jsonb_build_object('ok', true, 'item', v_row);
end;
$$;

create or replace function public.library_archive(p_actor uuid, p_request uuid, p_kind text, p_id text, p_revision bigint, p_reason text)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_next bigint; v_row jsonb; v_reason text := btrim(coalesce(p_reason,''));
begin
  perform public.library_authorize(p_actor);
  if char_length(v_reason) < 3 then raise exception 'INVALID_REASON'; end if;
  if p_kind = 'sticker' then
    select revision into v_next from public.sticker_assets where id = p_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_next <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
    update public.sticker_assets set status = 'archived', revision = revision + 1, updated_by = p_actor where id = p_id returning to_jsonb(sticker_assets.*) into v_row;
  elsif p_kind = 'font-face' then
    select revision into v_next from public.font_faces where id::text = p_id for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if v_next <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
    update public.font_faces set status = 'archived', revision = revision + 1, updated_by = p_actor where id::text = p_id returning to_jsonb(font_faces.*) into v_row;
  else raise exception 'INVALID_INPUT'; end if;
  perform public.library_event(p_actor, p_request, p_kind, p_id, p_revision, p_revision + 1, 'archived', '{}'::jsonb, v_reason);
  return jsonb_build_object('ok', true, 'item', v_row);
end;
$$;

create or replace function public.library_prepare_delete(p_actor uuid, p_request uuid, p_kind text, p_id text, p_revision bigint)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_next bigint; v_intent uuid := gen_random_uuid();
begin
  perform public.library_authorize(p_actor, true);
  if p_kind = 'sticker' then select revision into v_next from public.sticker_assets where id = p_id and status = 'draft' and ever_published_at is null for update;
  elsif p_kind = 'font-face' then select revision into v_next from public.font_faces where id::text = p_id and status = 'draft' and ever_published_at is null for update;
  else raise exception 'INVALID_INPUT'; end if;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_next <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
  if exists (
    select 1 from public.design_versions dv
    where dv.design_document::text like '%"' || p_id || '"%'
  ) or exists (
    select 1 from public.projects pr
    where pr.working_document::text like '%"' || p_id || '"%'
  ) then
    raise exception 'REFERENCED_DRAFT';
  end if;
  insert into public.library_uploads(id, actor_user_id, kind, asset_id, request_id, storage_path, byte_size, state) values (v_intent, p_actor, p_kind, p_id, p_request, v_intent::text, 1, 'cleanup_pending');
  perform public.library_event(p_actor, p_request, p_kind, p_id, p_revision, p_revision, 'delete_prepared', '{}'::jsonb);
  return jsonb_build_object('ok', true, 'intent', v_intent);
end;
$$;

create or replace function public.library_finish_delete(p_actor uuid, p_intent uuid)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_upload public.library_uploads%rowtype;
begin
  perform public.library_authorize(p_actor, true);
  select * into v_upload from public.library_uploads where id = p_intent and state = 'cleanup_pending' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_upload.kind = 'sticker' then delete from public.sticker_assets where id = v_upload.asset_id and status = 'draft' and ever_published_at is null;
  else delete from public.font_faces where id::text = v_upload.asset_id and status = 'draft' and ever_published_at is null; end if;
  update public.library_uploads set state = 'cleaned' where id = p_intent;
  perform public.library_event(p_actor, null, v_upload.kind, v_upload.asset_id, null, null, 'deleted', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.library_create_family(p_actor uuid, p_request uuid, p_id text, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_row jsonb;
begin
  perform public.library_authorize(p_actor);
  insert into public.fonts(id, family_name, display_name, category, tags, search_keywords, description, sample_text, published, status, revision, created_by, updated_by)
  values (p_id, coalesce(p_payload->>'family_name', p_id), p_payload->>'display_name', p_payload->>'category', coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'tags','[]'::jsonb))), '{}'), coalesce(array(select jsonb_array_elements_text(coalesce(p_payload->'search_keywords','[]'::jsonb))), '{}'), p_payload->>'description', p_payload->>'sample_text', false, 'draft', 1, p_actor, p_actor)
  returning to_jsonb(fonts.*) into v_row;
  perform public.library_event(p_actor, p_request, 'font-family', p_id, null, 1, 'created', p_payload);
  return jsonb_build_object('ok', true, 'item', v_row);
end;
$$;

create or replace function public.library_patch_family(p_actor uuid, p_request uuid, p_id text, p_revision bigint, p_patch jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_row jsonb;
begin
  perform public.library_authorize(p_actor);
  perform 1 from public.fonts where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if (select revision from public.fonts where id = p_id) <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
  update public.fonts set display_name = coalesce(p_patch->>'display_name', display_name), category = coalesce(p_patch->>'category', category), description = coalesce(p_patch->>'description', description), sample_text = coalesce(p_patch->>'sample_text', sample_text), revision = revision + 1, updated_by = p_actor where id = p_id returning to_jsonb(fonts.*) into v_row;
  perform public.library_event(p_actor, p_request, 'font-family', p_id, p_revision, p_revision + 1, 'metadata_patched', p_patch);
  return jsonb_build_object('ok', true, 'item', v_row);
end;
$$;

create or replace function public.library_set_family_status(p_actor uuid, p_request uuid, p_id text, p_revision bigint, p_status text)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_family public.fonts%rowtype;
  v_row jsonb;
begin
  perform public.library_authorize(p_actor);
  if p_status not in ('draft','published','archived') then raise exception 'INVALID_INPUT'; end if;
  select * into v_family from public.fonts where id = p_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_family.revision <> p_revision then raise exception 'REVISION_CONFLICT'; end if;
  if p_status = 'draft' and (v_family.ever_published_at is not null or v_family.status <> 'draft') then
    raise exception 'CANNOT_RETURN_TO_DRAFT';
  end if;
  if p_status = 'published' and not exists (select 1 from public.font_faces where family_id = p_id and status = 'published') then raise exception 'VALIDATION_FAILED'; end if;
  update public.fonts
  set status = p_status,
      published = (p_status = 'published'),
      ever_published_at = case when p_status = 'published' then coalesce(v_family.ever_published_at, now()) else v_family.ever_published_at end,
      revision = revision + 1,
      updated_by = p_actor
  where id = p_id
  returning to_jsonb(fonts.*) into v_row;
  perform public.library_event(p_actor, p_request, 'font-family', p_id, p_revision, p_revision + 1, 'status_changed', jsonb_build_object('status', p_status));
  return jsonb_build_object('ok', true, 'item', v_row);
end;
$$;

revoke all on function public.library_create_draft(uuid, uuid, text, text, jsonb) from public, anon;
revoke all on function public.library_patch_metadata(uuid, uuid, text, text, bigint, jsonb) from public, anon;
revoke all on function public.library_publish(uuid, uuid, text, text, bigint, uuid, jsonb) from public, anon;
revoke all on function public.library_archive(uuid, uuid, text, text, bigint, text) from public, anon;
revoke all on function public.library_prepare_delete(uuid, uuid, text, text, bigint) from public, anon;
revoke all on function public.library_finish_delete(uuid, uuid) from public, anon;
revoke all on function public.library_create_family(uuid, uuid, text, jsonb) from public, anon;
revoke all on function public.library_patch_family(uuid, uuid, text, bigint, jsonb) from public, anon;
revoke all on function public.library_set_family_status(uuid, uuid, text, bigint, text) from public, anon;
grant execute on function public.library_create_draft(uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.library_patch_metadata(uuid, uuid, text, text, bigint, jsonb) to authenticated;
grant execute on function public.library_publish(uuid, uuid, text, text, bigint, uuid, jsonb) to authenticated;
grant execute on function public.library_archive(uuid, uuid, text, text, bigint, text) to authenticated;
grant execute on function public.library_prepare_delete(uuid, uuid, text, text, bigint) to authenticated;
grant execute on function public.library_finish_delete(uuid, uuid) to authenticated;
grant execute on function public.library_create_family(uuid, uuid, text, jsonb) to authenticated;
grant execute on function public.library_patch_family(uuid, uuid, text, bigint, jsonb) to authenticated;
grant execute on function public.library_set_family_status(uuid, uuid, text, bigint, text) to authenticated;
