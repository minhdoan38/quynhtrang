-- State 42 asset library schema, grant, RLS, and RPC assertions.
-- Run after 0007_state42_asset_library.sql. All fixture writes roll back.
begin;

DO $$
declare
  v_count integer;
  v_has boolean;
  v_denied boolean;
  v_result jsonb;
begin
  select count(*) into v_count
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('font_faces', 'library_validation_runs', 'asset_events', 'library_uploads');
  if v_count <> 4 then raise exception 'Expected four State 42 tables, got %', v_count; end if;

  select exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_font_faces_published_checksum') into v_has;
  if not v_has then raise exception 'Missing published font checksum index'; end if;
  select exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'idx_sticker_assets_published_checksum') into v_has;
  if not v_has then raise exception 'Missing published sticker checksum index'; end if;

  select public = false and file_size_limit = 52428800 into v_has
  from storage.buckets where id = 'library-drafts';
  if not coalesce(v_has, false) then raise exception 'library-drafts must be private and capped at 50MB'; end if;

  select prosecdef = false into v_has
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'library_archive';
  if not coalesce(v_has, false) then raise exception 'library_archive must be SECURITY INVOKER'; end if;

  set local role anon;
  set local "request.jwt.claim.sub" = '';
  set local "request.jwt.claims" = '{"role":"anon"}';
  select count(*) into v_count from public.fonts where status = 'draft';
  if v_count <> 0 then raise exception 'Anon can read font drafts'; end if;
  select count(*) into v_count from public.sticker_assets where status = 'draft';
  if v_count <> 0 then raise exception 'Anon can read sticker drafts'; end if;
  v_denied := false;
  begin
    select public.library_prepare_delete(gen_random_uuid(), gen_random_uuid(), 'sticker', 'missing', 1) into v_result;
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Anon can call private delete RPC'; end if;

  set local role authenticated;
  set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000001';
  set local "request.jwt.claims" = '{"role":"authenticated","sub":"a0000000-0000-0000-0000-000000000001"}';
  v_denied := false;
  begin
    insert into public.sticker_assets(id, category, storage_path, published, status) values ('state42-test', 'test', 'draft/test.svg', false, 'draft');
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Customer can directly mutate sticker assets'; end if;
end $$;

-- Invalid archive reason and revision conflict must fail for a real staff actor.
DO $$
declare
  v_actor uuid := 'a0000000-0000-0000-0000-000000000003';
  v_denied boolean;
  v_result jsonb;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (v_actor, '00000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'state42-admin@example.com', 'password', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now())
  on conflict (id) do nothing;
  set local role postgres;
  insert into public.staff_roles(user_id, role) values (v_actor, 'admin') on conflict (user_id) do update set role = excluded.role;
  insert into public.sticker_assets(id, category, storage_path, published, status, revision)
  values ('state42-test', 'test', 'draft/test.svg', false, 'draft', 2)
  on conflict (id) do update set status = 'draft', published = false, revision = 2, ever_published_at = null;
  insert into public.fonts(id, family_name, published, status, revision, ever_published_at)
  values ('state42-test-family', 'State 42 Test', false, 'archived', 2, now())
  on conflict (id) do update set status = 'archived', published = false, revision = 2, ever_published_at = now();
  set local role authenticated;
  set local "request.jwt.claim.sub" = 'a0000000-0000-0000-0000-000000000003';
  set local "request.jwt.claims" = '{"role":"authenticated","sub":"a0000000-0000-0000-0000-000000000003"}';

  v_denied := false;
  begin
    select public.library_archive(v_actor, gen_random_uuid(), 'sticker', 'state42-test', 2, 'no') into v_result;
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Short archive reason was accepted'; end if;

  v_denied := false;
  begin
    select public.library_patch_metadata(v_actor, gen_random_uuid(), 'sticker', 'state42-test', 1, '{"description":"stale"}') into v_result;
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Mismatched revision was accepted'; end if;

  v_denied := false;
  begin
    select public.library_set_family_status(v_actor, gen_random_uuid(), 'state42-test-family', 2, 'draft') into v_result;
  exception when others then
    if sqlerrm <> 'CANNOT_RETURN_TO_DRAFT' then raise; end if;
    v_denied := true;
  end;
  if not v_denied then raise exception 'Ever-published font family returned to draft'; end if;
end $$;

rollback;
