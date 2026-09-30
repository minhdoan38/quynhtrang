-- Migration: 0002_state37_storage.sql
-- State 37: Supabase Storage Buckets & Policies

-- 1. Create or update buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('customer-assets', 'customer-assets', false, 52428800, null),
  ('approved-renders', 'approved-renders', false, 52428800, null),
  ('template-assets', 'template-assets', true, 52428800, null),
  ('sticker-library', 'sticker-library', true, 52428800, null),
  ('fonts', 'fonts', true, 52428800, null)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

-- 2. Storage RLS policies on storage.objects

-- 2.1 Public buckets: SELECT allowed for anyone
drop policy if exists "Public buckets readable by all" on storage.objects;
create policy "Public buckets readable by all"
  on storage.objects for select
  using (bucket_id in ('template-assets', 'sticker-library', 'fonts'));

-- 2.2 Private buckets: SELECT allowed only for staff
drop policy if exists "Private buckets readable by staff" on storage.objects;
create policy "Private buckets readable by staff"
  on storage.objects for select
  using (
    bucket_id in ('customer-assets', 'approved-renders')
    and public.is_staff()
  );

-- 2.3 Object mutation policies: staff only (service_role bypasses RLS automatically)
drop policy if exists "Staff manage storage objects insert" on storage.objects;
create policy "Staff manage storage objects insert"
  on storage.objects for insert
  with check (public.is_staff());

drop policy if exists "Staff manage storage objects update" on storage.objects;
create policy "Staff manage storage objects update"
  on storage.objects for update
  using (public.is_staff())
  with check (public.is_staff());

drop policy if exists "Staff manage storage objects delete" on storage.objects;
create policy "Staff manage storage objects delete"
  on storage.objects for delete
  using (public.is_staff());
