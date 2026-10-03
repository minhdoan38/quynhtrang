-- State 43 template management schema, invariant, and constraint assertions.
-- Run after 0008_state43_template_management.sql. All fixture writes roll back.
begin;

-- 1. Verify all 8 new State 43 tables exist in public schema
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from information_schema.tables
  where table_schema = 'public'
    and table_name in (
      'template_categories',
      'template_drafts',
      'template_version_dependencies',
      'template_assets',
      'template_version_assets',
      'template_validation_runs',
      'template_operations',
      'template_legacy_targets'
    );
  if v_count <> 8 then
    raise exception 'Expected 8 State 43 tables, got %', v_count;
  end if;
end $$;

-- 2. Verify all expected columns on extended tables
do $$
declare
  v_count integer;
begin
  -- public.templates extended columns
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'templates'
    and column_name in (
      'status', 'revision', 'variant_id', 'product_mode',
      'fixed_sticker_shape', 'target_snapshot', 'category_id',
      'tags', 'sort_order', 'current_published_version_id',
      'ever_published_at', 'created_by', 'archived_at', 'archived_by'
    );
  if v_count <> 14 then
    raise exception 'Expected 14 new columns on templates, got %', v_count;
  end if;

  -- public.template_versions extended columns
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'template_versions'
    and column_name in (
      'target_snapshot', 'dependency_snapshot', 'document_schema_version',
      'preflight_snapshot', 'validation_id', 'asset_manifest',
      'thumbnail_path', 'thumbnail_checksum', 'preview_metadata',
      'published_by', 'published_at', 'revision_note'
    );
  if v_count <> 12 then
    raise exception 'Expected 12 new columns on template_versions, got %', v_count;
  end if;

  -- public.projects extended columns
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'projects'
    and column_name in (
      'source_template_id', 'source_template_version_id', 'clone_request_key'
    );
  if v_count <> 3 then
    raise exception 'Expected 3 new columns on projects, got %', v_count;
  end if;

  -- public.template_drafts columns
  select count(*) into v_count
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'template_drafts'
    and column_name = 'source_document_hash';
  if v_count <> 1 then
    raise exception 'Expected source_document_hash on template_drafts';
  end if;
end $$;

-- 3. Verify indexes exist
do $$
declare
  v_has boolean;
begin
  select exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'template_version_dependencies'
      and indexname = 'idx_template_version_deps_asset'
  ) into v_has;
  if not v_has then raise exception 'Missing idx_template_version_deps_asset'; end if;

  select exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'template_assets'
      and indexname = 'idx_template_assets_checksum'
  ) into v_has;
  if not v_has then raise exception 'Missing idx_template_assets_checksum'; end if;

  select exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'template_validation_runs'
      and indexname = 'idx_template_validation_runs_lookup'
  ) into v_has;
  if not v_has then raise exception 'Missing idx_template_validation_runs_lookup'; end if;

  select exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and tablename = 'projects'
      and indexname = 'uq_projects_owner_clone_request'
  ) into v_has;
  if not v_has then raise exception 'Missing uq_projects_owner_clone_request'; end if;
end $$;

-- 4. Verify RLS is enabled on all new tables
do $$
declare
  v_disabled_count integer;
begin
  select count(*) into v_disabled_count
  from pg_tables
  where schemaname = 'public'
    and tablename in (
      'template_categories', 'template_drafts', 'template_version_dependencies',
      'template_assets', 'template_version_assets', 'template_validation_runs',
      'template_operations', 'template_legacy_targets'
    )
    and rowsecurity = false;
  if v_disabled_count <> 0 then
    raise exception 'RLS is not enabled on % State 43 tables', v_disabled_count;
  end if;
end $$;

-- 5. Seeded categories check
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.template_categories
  where id in ('all', 'birthday', 'cute', 'floral', 'minimal', 'love', 'thanks');
  if v_count <> 7 then
    raise exception 'Expected 7 seeded categories, found %', v_count;
  end if;
end $$;

-- 6. Behavioral assertions with fixtures
do $$
declare
  v_t1 text := '43000000-0000-0000-0000-000000000001';
  v_t2 text := '43000000-0000-0000-0000-000000000002';
  v_v1 uuid := '43000000-0000-0000-0000-000000000101';
  v_v2 uuid := '43000000-0000-0000-0000-000000000102';
  v_failed boolean;
  v_val_id uuid := '43000000-0000-0000-0000-000000000201';
  v_draft_id uuid;
  v_asset_id uuid := '43000000-0000-0000-0000-000000000301';
begin
  -- Ensure base product and variants exist
  insert into public.products (id, name, active)
  values ('card', 'Thiệp', true)
  on conflict (id) do nothing;

  insert into public.product_variants (id, product_id, name, price, active)
  values ('vertical', 'card', 'Đứng', 10000, true),
         ('horizontal', 'card', 'Ngang', 10000, true)
  on conflict (id) do nothing;

  -- Insert two templates with exact product/variant targets
  insert into public.templates (id, name, status, product_id, variant_id, revision)
  values (v_t1, 'Template 1', 'published', 'card', 'vertical', 1),
         (v_t2, 'Template 2', 'published', 'card', 'horizontal', 1);

  -- Insert matching versions using migration-owner setup bypass
  set local migration.allow_version_mutation = '1';
  insert into public.template_versions (id, template_id, version, design_document)
  values (v_v1, v_t1, 1, '{"test": 1}'::jsonb),
         (v_v2, v_t2, 1, '{"test": 2}'::jsonb);
  set local migration.allow_version_mutation = '0';

  -- Ensure tested row exists first
  if not exists (select 1 from public.template_versions where id = v_v1) then
    raise exception 'Test row v1 does not exist';
  end if;
  if not exists (select 1 from public.template_versions where id = v_v2) then
    raise exception 'Test row v2 does not exist';
  end if;

  -- Test 6.1: Immutable version UPDATE must fail with SQLSTATE 'P0001' and 'IMMUTABLE_TEMPLATE_VERSION'
  begin
    update public.template_versions set design_document = '{}'::jsonb
    where id = '43000000-0000-0000-0000-000000000101';
    raise exception 'immutable version write unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'IMMUTABLE_TEMPLATE_VERSION' then raise; end if;
  end;

  -- Test 6.2: Immutable version DELETE must fail with SQLSTATE 'P0001' and 'IMMUTABLE_TEMPLATE_VERSION'
  begin
    delete from public.template_versions
    where id = '43000000-0000-0000-0000-000000000101';
    raise exception 'immutable version delete unexpectedly succeeded';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'IMMUTABLE_TEMPLATE_VERSION' then raise; end if;
  end;

  -- Test 6.3: Target mismatch pointer failure:
  -- Setting Template 1 current_published_version_id to Version 2 (which belongs to Template 2)
  -- MUST fail with foreign key violation
  v_failed := false;
  begin
    update public.templates
    set current_published_version_id = v_v2
    where id = v_t1;
  exception when foreign_key_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Cross-template version pointer unexpectedly succeeded';
  end if;

  -- Same-template version pointer MUST succeed
  update public.templates
  set current_published_version_id = v_v1
  where id = v_t1;

  -- Test 6.4: Draft uniqueness and active draft constraints
  insert into public.template_drafts (template_id, draft_revision, design_document)
  values (v_t1, 1, '{"draft": 1}'::jsonb)
  returning id into v_draft_id;

  -- Duplicate active draft on the same template MUST fail (unique template_id constraint)
  v_failed := false;
  begin
    insert into public.template_drafts (template_id, draft_revision, design_document)
    values (v_t1, 2, '{"draft": 2}'::jsonb);
  exception when unique_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Duplicate active draft insert unexpectedly succeeded';
  end if;

  -- Cross-template based_on_version_id MUST fail
  v_failed := false;
  begin
    insert into public.template_drafts (template_id, based_on_version_id, draft_revision, design_document)
    values (v_t2, v_v1, 1, '{"draft": "mismatch"}'::jsonb);
  exception when foreign_key_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Cross-template draft based_on_version unexpectedly succeeded';
  end if;

  -- Test 6.5: ever_published_at write-once
  update public.templates set ever_published_at = now() where id = v_t1;
  v_failed := false;
  begin
    update public.templates set ever_published_at = now() + interval '1 hour' where id = v_t1;
  exception when sqlstate 'P0001' then
    if sqlerrm = 'EVER_PUBLISHED_AT_WRITE_ONCE' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'Mutating ever_published_at unexpectedly succeeded';
  end if;

  -- Test 6.6: Immutable target on templates once set
  v_failed := false;
  begin
    update public.templates set variant_id = 'horizontal' where id = v_t1;
  exception when sqlstate 'P0001' then
    if sqlerrm = 'IMMUTABLE_TEMPLATE_TARGET' then
      v_failed := true;
    else
      raise;
    end if;
  end;
  if not v_failed then
    raise exception 'Mutating template target unexpectedly succeeded';
  end if;

  -- Test 6.7: template_validation_runs is append-only
  insert into public.template_validation_runs (
    id, template_id, draft_id, source_revision, lease_session_id, lease_epoch,
    source_document_hash, candidate_document_hash, target_hash,
    engine_fingerprint, expires_at
  )
  values (
    v_val_id, v_t1, v_draft_id, 1, gen_random_uuid(), 0,
    'src_hash_1', 'cand_hash_1', 'tgt_hash_1',
    'engine_fp_1', now() + interval '10 minutes'
  );

  v_failed := false;
  begin
    update public.template_validation_runs set engine_fingerprint = 'engine_fp_2' where id = v_val_id;
  exception when sqlstate 'P0001' then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Updating template_validation_runs unexpectedly succeeded';
  end if;

  v_failed := false;
  begin
    delete from public.template_validation_runs where id = v_val_id;
  exception when sqlstate 'P0001' then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Deleting from template_validation_runs unexpectedly succeeded';
  end if;

  -- Test 6.8: Normalized version dependencies and immutability
  set local migration.allow_version_mutation = '1';
  insert into public.template_version_dependencies (version_id, kind, asset_id, family_id)
  values (v_v1, 'font-face', 'font-face-1', 'font-family-1');
  set local migration.allow_version_mutation = '0';

  v_failed := false;
  begin
    update public.template_version_dependencies set family_id = 'font-family-2'
    where version_id = v_v1 and kind = 'font-face' and asset_id = 'font-face-1';
  exception when sqlstate 'P0001' then
    if sqlerrm = 'IMMUTABLE_TEMPLATE_VERSION_DEPENDENCY' then v_failed := true; else raise; end if;
  end;
  if not v_failed then
    raise exception 'Updating template_version_dependencies unexpectedly succeeded';
  end if;

  -- Test 6.9: Template version assets and immutability
  insert into public.template_assets (
    id, template_id, draft_id, storage_bucket, storage_path, checksum,
    mime_type, byte_size, upload_status, is_published
  )
  values (
    v_asset_id, v_t1, v_draft_id, 'template-drafts', 'test/asset1.png',
    'sha256_checksum_1', 'image/png', 1024, 'verified', false
  );

  set local migration.allow_version_mutation = '1';
  insert into public.template_version_assets (version_id, asset_id)
  values (v_v1, v_asset_id);
  set local migration.allow_version_mutation = '0';

  v_failed := false;
  begin
    delete from public.template_version_assets where version_id = v_v1 and asset_id = v_asset_id;
  exception when sqlstate 'P0001' then
    if sqlerrm = 'IMMUTABLE_TEMPLATE_VERSION_DEPENDENCY' then v_failed := true; else raise; end if;
  end;
  if not v_failed then
    raise exception 'Deleting template_version_assets unexpectedly succeeded';
  end if;

  -- Test 6.10: Projects provenance composite foreign key constraint
  -- Mismatched (source_template_id, source_template_version_id) MUST fail
  v_failed := false;
  begin
    insert into public.projects (product_id, variant_id, source_template_id, source_template_version_id)
    values ('card', 'vertical', v_t1, v_v2);
  exception when foreign_key_violation then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Cross-template project source provenance unexpectedly succeeded';
  end if;

  -- Matching (source_template_id, source_template_version_id) MUST succeed
  insert into public.projects (product_id, variant_id, source_template_id, source_template_version_id, clone_request_key)
  values ('card', 'vertical', v_t1, v_v1, 'req_key_1');


-- 7. Security Perimeter, Direct Write/Read Bypasses, and Event Audit Survival (State 43 Task 4)
do $$
declare
  v_cust_id uuid := '43000000-0000-0000-0000-0000000000c1'::uuid;
  v_ed_id uuid := '43000000-0000-0000-0000-0000000000e1'::uuid;
  v_adm_id uuid := '43000000-0000-0000-0000-0000000000a1'::uuid;
  v_sec_template text := '43000000-0000-0000-0000-000000000010';
  v_pub_template text := '43000000-0000-0000-0000-000000000011';
  v_sec_draft uuid := '43000000-0000-0000-0000-0000000000d1'::uuid;
  v_temp_draft uuid := '43000000-0000-0000-0000-0000000000d2'::uuid;
  v_sec_op uuid := '43000000-0000-0000-0000-000000000099'::uuid;
  v_sec_ev uuid := '43000000-0000-0000-0000-000000000088'::uuid;
  v_count integer;
  v_denied boolean;
begin
  -- 7.1 Setup test users
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (v_cust_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'state43-customer@example.com', 'password', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
    (v_ed_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'state43-editor@example.com', 'password', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now()),
    (v_adm_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'state43-admin@example.com', 'password', now(), '{"provider":"email"}'::jsonb, '{}'::jsonb, now(), now())
  on conflict (id) do nothing;

  insert into public.staff_roles (user_id, role)
  values
    (v_ed_id, 'editor'),
    (v_adm_id, 'admin')
  on conflict (user_id) do update set role = excluded.role;

  -- 7.2 Insert fixtures under postgres / admin
  insert into public.templates (id, name, status, product_id, variant_id, revision)
  values
    (v_sec_template, 'Security Draft Template', 'draft', 'card', 'vertical', 1),
    (v_pub_template, 'Security Published Template', 'published', 'card', 'vertical', 1)
  on conflict (id) do nothing;

  insert into public.template_drafts (id, template_id, draft_revision, design_document)
  values (v_sec_draft, v_sec_template, 1, '{"security": "draft_content"}'::jsonb)
  on conflict (id) do nothing;

  -- 7.3 Role tests: Anon
  set local role anon;
  set local "request.jwt.claim.sub" = '';
  set local "request.jwt.claims" = '{"role": "anon"}';

  -- Anon cannot read drafts
  select count(*) into v_count from public.template_drafts where id = v_sec_draft;
  if v_count <> 0 then raise exception 'Anon can read template drafts'; end if;

  -- Anon cannot read draft templates
  select count(*) into v_count from public.templates where id = v_sec_template and status = 'draft';
  if v_count <> 0 then raise exception 'Anon can read draft templates'; end if;

  -- Anon can read published templates
  select count(*) into v_count from public.templates where id = v_pub_template and status = 'published';
  if v_count <> 1 then raise exception 'Anon cannot read published templates'; end if;

  -- Anon direct write denied on templates
  v_denied := false;
  begin
    insert into public.templates (id, name, status) values ('anon-hack', 'Hack', 'draft');
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Anon direct template insert succeeded'; end if;

  -- Anon direct write denied on template_drafts
  v_denied := false;
  begin
    insert into public.template_drafts (template_id, draft_revision) values (v_pub_template, 1);
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Anon direct draft insert succeeded'; end if;

  -- Anon direct write denied on template_validation_runs
  v_denied := false;
  begin
    insert into public.template_validation_runs (
      template_id, draft_id, source_revision, lease_session_id, lease_epoch,
      source_document_hash, candidate_document_hash, target_hash, engine_fingerprint, expires_at
    ) values (
      v_sec_template, v_sec_draft, 1, gen_random_uuid(), 0,
      'h1', 'h2', 'h3', 'fp', now() + interval '5m'
    );
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Anon direct validation run insert succeeded'; end if;

  -- Anon direct write denied on template_operations
  v_denied := false;
  begin
    insert into public.template_operations (request_id, operation, payload_hash)
    values ('anon-op-1', 'publish', 'hash1');
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Anon direct operation insert succeeded'; end if;

  -- 7.4 Role tests: Authenticated Customer (Non-staff)
  set local role authenticated;
  set local "request.jwt.claim.sub" = '43000000-0000-0000-0000-0000000000c1';
  set local "request.jwt.claims" = '{"sub": "43000000-0000-0000-0000-0000000000c1", "role": "authenticated"}';

  -- Customer cannot read drafts
  select count(*) into v_count from public.template_drafts where id = v_sec_draft;
  if v_count <> 0 then raise exception 'Customer can read template drafts'; end if;

  -- Customer cannot read draft templates
  select count(*) into v_count from public.templates where id = v_sec_template and status = 'draft';
  if v_count <> 0 then raise exception 'Customer can read draft templates'; end if;

  -- Customer direct write denied on templates
  v_denied := false;
  begin
    insert into public.templates (id, name, status) values ('cust-hack', 'Hack', 'draft');
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Customer direct template insert succeeded'; end if;

  -- Customer direct write denied on drafts
  v_denied := false;
  begin
    insert into public.template_drafts (template_id, draft_revision) values (v_pub_template, 1);
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Customer direct draft insert succeeded'; end if;

  -- 7.5 Role tests: Authenticated Staff (Editor)
  set local role authenticated;
  set local "request.jwt.claim.sub" = '43000000-0000-0000-0000-0000000000e1';
  set local "request.jwt.claims" = '{"sub": "43000000-0000-0000-0000-0000000000e1", "role": "authenticated"}';

  -- Editor can read drafts
  select count(*) into v_count from public.template_drafts where id = v_sec_draft;
  if v_count <> 1 then raise exception 'Editor cannot read template drafts'; end if;

  -- Editor can read draft templates
  select count(*) into v_count from public.templates where id = v_sec_template and status = 'draft';
  if v_count <> 1 then raise exception 'Editor cannot read draft templates'; end if;

  -- Editor cannot direct write without service_role RPC
  v_denied := false;
  begin
    insert into public.templates (id, name, status) values ('editor-direct-hack', 'Hack', 'draft');
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Editor direct template insert unexpectedly succeeded'; end if;

  -- 7.6 Audit Survival and Immutability
  set local role postgres;

  -- Insert temporary draft to delete
  insert into public.template_drafts (id, template_id, draft_revision, design_document)
  values (v_temp_draft, v_pub_template, 1, '{"draft": "to_be_deleted"}'::jsonb);

  -- Insert audit records in template_operations and asset_events
  insert into public.template_operations (id, request_id, operation, template_id, payload_hash, status)
  values (v_sec_op, 'sec-req-op-1', 'save_draft', v_pub_template, 'hash_op_1', 'completed');

  insert into public.asset_events (id, actor_user_id, kind, target_id, event, request_id)
  values (v_sec_ev, v_ed_id, 'template', v_pub_template, 'draft_deleted', '43000000-0000-0000-0000-000000000099'::uuid);

  -- Delete the draft
  delete from public.template_drafts where id = v_temp_draft;

  -- Verify audit survived draft deletion
  select count(*) into v_count from public.template_operations where id = v_sec_op;
  if v_count <> 1 then raise exception 'Operation audit record did not survive draft deletion'; end if;

  select count(*) into v_count from public.asset_events where id = v_sec_ev;
  if v_count <> 1 then raise exception 'Asset event record did not survive draft deletion'; end if;

  -- Verify template_operations cannot be updated once completed
  v_denied := false;
  begin
    update public.template_operations set payload_hash = 'tampered_hash' where id = v_sec_op;
  exception when sqlstate 'P0001' then
    if sqlerrm = 'completed template_operations cannot be updated' then v_denied := true; else raise; end if;
  end;
  if not v_denied then raise exception 'Updating completed template_operations unexpectedly succeeded'; end if;

  -- Verify template_operations cannot be deleted
  v_denied := false;
  begin
    delete from public.template_operations where id = v_sec_op;
  exception when sqlstate 'P0001' then
    if sqlerrm = 'template_operations is append-only and cannot be deleted' then v_denied := true; else raise; end if;
  end;
  if not v_denied then raise exception 'Deleting template_operations unexpectedly succeeded'; end if;

  -- Verify asset_events cannot be updated or deleted
  v_denied := false;
  begin
    update public.asset_events set event = 'tampered' where id = v_sec_ev;
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Updating asset_events unexpectedly succeeded'; end if;

  v_denied := false;
  begin
    delete from public.asset_events where id = v_sec_ev;
  exception when others then v_denied := true;
  end;
  if not v_denied then raise exception 'Deleting asset_events unexpectedly succeeded'; end if;


  -- 8. Section 8: State 43 Task 5 RPCs (template_create, template_create_draft, template_patch_metadata)
  -- 8.1 template_create with incomplete draft allowed and idempotent replay
  declare
    v_rpc_res jsonb;
    v_rpc_res_replay jsonb;
    v_conflict_raised boolean := false;
    v_invalid_target_raised boolean := false;
    v_tmpl_id text := 't5-test-template-1';
    v_req_id text := '43000000-0000-0000-0000-0000000000c1';
    v_payload jsonb;
    v_changed_payload jsonb;
    v_old_rev bigint;
    v_new_rev bigint;
    v_before_doc jsonb;
    v_after_doc jsonb;
      v_test_ver_id uuid := '43000000-0000-0000-0000-000000000101';
  begin
    v_payload := jsonb_build_object(
      'id', v_tmpl_id,
      'name', 'State 43 Test Template',
      'productId', 'card',
      'variantId', 'horizontal',
      'categoryId', 'birthday',
      'tags', jsonb_build_array('card', 'birthday'),
      'sortOrder', 5,
      'targetSnapshot', jsonb_build_object('productId', 'card', 'variantId', 'horizontal'),
      'initialDocument', jsonb_build_object('elements', '[]'::jsonb, 'incomplete', true)
    );

    -- Create template as Editor
    v_rpc_res := public.template_create(v_ed_id, v_req_id, v_payload);
    if (v_rpc_res->>'ok')::boolean is not true then
      raise exception 'template_create failed: %', v_rpc_res;
    end if;
    if v_rpc_res->'draft' is null then
      raise exception 'template_create did not return draft';
    end if;

    -- Idempotent retry: same request ID, same actor, same payload
    v_rpc_res_replay := public.template_create(v_ed_id, v_req_id, v_payload);
    if v_rpc_res_replay <> v_rpc_res then
      raise exception 'template_create idempotent replay returned different result';
    end if;

    -- Conflict: same request ID, changed payload
    v_changed_payload := jsonb_set(v_payload, '{name}', '"Changed Template Name"');
    begin
      perform public.template_create(v_ed_id, v_req_id, v_changed_payload);
    exception when sqlstate 'P0001' then
      if sqlerrm = 'OPERATION_CONFLICT' then
        v_conflict_raised := true;
      else
        raise;
      end if;
    end;
    if not v_conflict_raised then
      raise exception 'Changed payload with same request_id did not raise OPERATION_CONFLICT';
    end if;

    -- Invalid target: missing productId
    begin
      perform public.template_create(v_ed_id, '43000000-0000-0000-0000-0000000000c2', jsonb_build_object('id', 'inv-tmpl', 'name', 'Inv'));
    exception when sqlstate 'P0001' then
      v_invalid_target_raised := true;
    end;
    if not v_invalid_target_raised then
      raise exception 'template_create with invalid target unexpectedly succeeded';
    end if;

    -- 8.2 Verify published artwork immutability during metadata patch
    -- Insert published version for fixture template
    insert into public.template_versions (id, template_id, version, design_document, published_by)
    values (v_test_ver_id, v_tmpl_id, 1, '{"version": 1, "artwork": "published_immutable"}'::jsonb, v_ed_id);

    update public.templates
    set current_published_version_id = v_test_ver_id, status = 'published', published = true
    where id = v_tmpl_id;

    -- Record before document and revision
    select design_document into v_before_doc from public.template_versions where id = v_test_ver_id;
    select revision into v_old_rev from public.templates where id = v_tmpl_id;

    -- Patch metadata as Editor
    v_rpc_res := public.template_patch_metadata(
      v_ed_id,
      '43000000-0000-0000-0000-0000000000p1',
      v_tmpl_id,
      v_old_rev,
      jsonb_build_object('name', 'Patched Template Name', 'sortOrder', 10)
    );

    select design_document into v_after_doc from public.template_versions where id = v_test_ver_id;
    select revision into v_new_rev from public.templates where id = v_tmpl_id;

    -- DB transaction assertions
    if v_before_doc is distinct from v_after_doc then
      raise exception 'metadata edit changed published artwork';
    end if;
    if v_new_rev <> v_old_rev + 1 then
      raise exception 'metadata CAS did not advance once';
    end if;

    -- CAS rejection on stale revision
    begin
      v_conflict_raised := false;
      perform public.template_patch_metadata(
        v_ed_id,
        '43000000-0000-0000-0000-0000000000p2',
        v_tmpl_id,
        v_old_rev, -- stale revision!
        jsonb_build_object('name', 'Stale Patch')
      );
    exception when sqlstate 'P0001' then
      if sqlerrm = 'REVISION_CONFLICT' then
        v_conflict_raised := true;
      else
        raise;
      end if;
    end;
    if not v_conflict_raised then
      raise exception 'Stale expected revision did not raise REVISION_CONFLICT';
    end if;

    -- 8.3 template_create_draft: existing draft returned unchanged
    v_rpc_res := public.template_create_draft(
      v_ed_id,
      '43000000-0000-0000-0000-0000000000d1',
      v_tmpl_id,
      v_new_rev,
      v_test_ver_id
    );
    if (v_rpc_res->>'ok')::boolean is not true then
      raise exception 'template_create_draft failed';
    end if;
    -- 9. Section 9: State 43 Task 6 RPCs (lease acquire, heartbeat, save, takeover, discard)
    declare
      v_sess_1 uuid := '43000000-0000-0000-0000-0000000000a1'::uuid;
      v_sess_2 uuid := '43000000-0000-0000-0000-0000000000a2'::uuid;
      v_sess_3 uuid := '43000000-0000-0000-0000-0000000000a3'::uuid;
      v_cur_draft_id uuid;
      v_lease_res jsonb;
      v_save_res jsonb;
      v_takeover_res jsonb;
      v_discard_res jsonb;
      v_check_rev bigint;
      v_ex_raised boolean;
      select id into v_cur_draft_id from public.template_drafts where template_id = v_tmpl_id;

      -- 9.1 Acquire lease as Editor (Session 1)
      v_lease_res := public.template_acquire_draft_lease(
        v_ed_id,
        '43000000-0000-0000-0000-0000000000l1',
        v_cur_draft_id,
        v_sess_1
      );
      if (v_lease_res->>'ok')::boolean is not true then
        raise exception 'template_acquire_draft_lease failed';
      end if;

      -- 9.2 Same user, different session (Session 2) denied while lease is active
      v_ex_raised := false;
      begin
        perform public.template_acquire_draft_lease(
          v_ed_id,
          '43000000-0000-0000-0000-0000000000l2',
          v_cur_draft_id,
          v_sess_2
        );
      exception when sqlstate 'P0001' then
        if sqlerrm = 'LEASE_CONFLICT: lease is currently held by another session' then
          v_ex_raised := true;
        else
          raise;
        end if;
      end;
      if not v_ex_raised then
        raise exception 'Different session acquire did not raise LEASE_CONFLICT';
      end if;

      -- 9.3 Heartbeat extends lease
      v_lease_res := public.template_heartbeat_draft_lease(
        v_ed_id,
        '43000000-0000-0000-0000-0000000000h1',
        v_cur_draft_id,
        v_sess_1,
        0 -- initial epoch
      );
      if (v_lease_res->>'ok')::boolean is not true then
        raise exception 'template_heartbeat_draft_lease failed';
      end if;

      -- 9.4 Save draft as Editor (Session 1, Epoch 0, Rev 1)
      v_save_res := public.template_save_draft(
        v_ed_id,
        '43000000-0000-0000-0000-0000000000b1',
        v_cur_draft_id,
        1, -- expectedRevision
        v_sess_1,
        0, -- epoch
        '{"elements": [{"id": "el1", "type": "text", "text": "v1"}]}'::jsonb,
        1
      );
      if (v_save_res->>'ok')::boolean is not true or (v_save_res->'value'->>'revision')::bigint <> 2 then
        raise exception 'template_save_draft failed or did not advance to revision 2: %', v_save_res;
      end if;

      -- Verify source_document_hash was updated
      if not exists (
        select 1 from public.template_drafts
        where id = v_cur_draft_id
          and source_document_hash = encode(digest('{"elements": [{"id": "el1", "type": "text", "text": "v1"}]}', 'sha256'), 'hex')
      ) then
        raise exception 'source_document_hash not properly updated after save';
      end if;

      -- 9.4b No-op save with identical document does NOT advance revision
      v_save_res := public.template_save_draft(
        v_ed_id,
        '43000000-0000-0000-0000-0000000000b1b',
        v_cur_draft_id,
        2, -- expectedRevision
        v_sess_1,
        0, -- epoch
        '{"elements": [{"id": "el1", "type": "text", "text": "v1"}]}'::jsonb,
        1
      );
      if (v_save_res->>'ok')::boolean is not true or (v_save_res->'value'->>'revision')::bigint <> 2 then
        raise exception 'No-op template_save_draft should not advance revision: %', v_save_res;
      end if;

      select draft_revision into v_check_rev from public.template_drafts where id = v_cur_draft_id;
      if v_check_rev <> 2 then
        raise exception 'Draft revision advanced on no-op save: expected 2, got %', v_check_rev;
      end if;

      -- 9.5 Stale revision save denied
      v_ex_raised := false;
      begin
        perform public.template_save_draft(
          v_ed_id,
          '43000000-0000-0000-0000-0000000000b2',
          v_cur_draft_id,
          1, -- stale revision (current is 2)
          v_sess_1,
          0,
          '{"elements": []}'::jsonb,
          1
        );
      exception when sqlstate 'P0001' then
        if sqlerrm = 'REVISION_CONFLICT' then
          v_ex_raised := true;
        else
          raise;
        end if;
      end;
      if not v_ex_raised then
        raise exception 'Stale revision save did not raise REVISION_CONFLICT';
      end if;

      -- 9.6 Save with wrong session denied
      v_ex_raised := false;
      begin
        perform public.template_save_draft(
          v_ed_id,
          '43000000-0000-0000-0000-0000000000b3',
          v_cur_draft_id,
          2,
          v_sess_2, -- wrong session
          0,
          '{"elements": []}'::jsonb,
          1
        );
      exception when sqlstate 'P0001' then
        if sqlerrm like 'LEASE_LOST%' then
          v_ex_raised := true;
        else
          raise;
        end if;
      end;
      if not v_ex_raised then
        raise exception 'Wrong session save did not raise LEASE_LOST';
      end if;

      -- 9.7 Takeover rejected while lease is still active
      v_ex_raised := false;
      begin
        perform public.template_takeover_draft(
          v_adm_id,
          '43000000-0000-0000-0000-0000000000b4',
          v_cur_draft_id,
          2,
          0,
          v_sess_3,
          'Takeover reason valid'
        );
      exception when sqlstate 'P0001' then
        if sqlerrm like 'LEASE_ACTIVE%' then
          v_ex_raised := true;
        else
          raise;
        end if;
      end;
      if not v_ex_raised then
        raise exception 'Takeover of active lease did not raise LEASE_ACTIVE';
      end if;

      -- Takeover by non-admin denied
      v_ex_raised := false;
      begin
        perform public.template_takeover_draft(
          v_ed_id, -- Editor, not Admin!
          '43000000-0000-0000-0000-0000000000b5',
          v_cur_draft_id,
          2,
          0,
          v_sess_3,
          'Editor takeover attempt'
        );
      exception when sqlstate 'P0001' then
        if sqlerrm = 'FORBIDDEN' then
          v_ex_raised := true;
        else
          raise;
        end if;
      end;
      if not v_ex_raised then
        raise exception 'Non-admin takeover did not raise FORBIDDEN';
      end if;

      -- Simulate lease expiry
      update public.template_drafts
      set lease_expires_at = clock_timestamp() - interval '1 second'
      where id = v_cur_draft_id;

      -- 9.8 Admin takeover of expired lease succeeds and advances epoch to 1
      v_takeover_res := public.template_takeover_draft(
        v_adm_id,
        '43000000-0000-0000-0000-0000000000b6',
        v_cur_draft_id,
        2,
        0, -- expected epoch 0
        v_sess_3,
        'Taking over stale abandoned editing session'
      );
      if (v_takeover_res->>'ok')::boolean is not true then
        raise exception 'template_takeover_draft failed: %', v_takeover_res;
      end if;
      if (v_takeover_res->'draft'->>'lease_epoch')::bigint <> 1 then
        raise exception 'template_takeover_draft did not increment epoch to 1';
      end if;

      -- 9.9 Old session / epoch 0 now denied on save
      v_ex_raised := false;
      begin
        perform public.template_save_draft(
          v_ed_id,
          '43000000-0000-0000-0000-0000000000b7',
          v_cur_draft_id,
          2,
          v_sess_1,
          0, -- old epoch
          '{"elements": []}'::jsonb,
          1
        );
      exception when sqlstate 'P0001' then
        if sqlerrm like 'LEASE_LOST%' then
          v_ex_raised := true;
        else
          raise;
        end if;
      end;
      if not v_ex_raised then
        raise exception 'Save with old epoch after takeover did not raise LEASE_LOST';
      end if;
      -- 9.9b Save changed document as Admin in Session 3, Epoch 1, Rev 2 with active receipt
      insert into public.template_validation_runs (
        id, template_id, draft_id, source_revision, lease_session_id, lease_epoch,
        source_document_hash, candidate_document_hash, target_hash,
        engine_fingerprint, expires_at
      ) values (
        '43000000-0000-0000-0000-0000000000r1'::uuid,
        v_tmpl_id,
        v_cur_draft_id,
        2,
        v_sess_3,
        1,
        encode(digest('{"elements": [{"id": "el1", "type": "text", "text": "v1"}]}', 'sha256'), 'hex'),
        'cand_hash',
        'target_hash',
        'engine_test',
        now() + interval '10 minutes'
      );

      v_save_res := public.template_save_draft(
        v_adm_id,
        '43000000-0000-0000-0000-0000000000b8',
        v_cur_draft_id,
        2,
        v_sess_3,
        1,
        '{"elements": [{"id": "el1", "type": "text", "text": "v2"}]}'::jsonb,
        1
      );
      if (v_save_res->>'ok')::boolean is not true or (v_save_res->'value'->>'revision')::bigint <> 3 then
        raise exception 'Changed template_save_draft failed or did not advance to revision 3: %', v_save_res;
      end if;

      -- Verify validation receipt was invalidated (expires_at <= now())
      if exists (
        select 1 from public.template_validation_runs
        where id = '43000000-0000-0000-0000-0000000000r1'::uuid
          and expires_at > now()
      ) then
        raise exception 'Validation receipt was not invalidated after changed save';
      end if;

      -- 9.10 Discard draft as Admin (current lease holder: Session 3, Epoch 1, Rev 3)
      v_discard_res := public.template_discard_draft(
        v_adm_id,
        '43000000-0000-0000-0000-0000000000d1',
        v_cur_draft_id,
        3,
        v_sess_3,
        1
      );
      if (v_discard_res->>'ok')::boolean is not true or (v_discard_res->>'discarded')::boolean is not true then
        raise exception 'template_discard_draft failed';
      end if;

      -- Draft should now be deleted
      select count(*) into v_count from public.template_drafts where id = v_cur_draft_id;
      if v_count <> 0 then
        raise exception 'Discarded draft was not deleted';
      end if;

      -- 9.11 template_cleanup_draft_asset RPC tests
      declare
        v_asset_clean_id uuid := gen_random_uuid();
        v_asset_recent_id uuid := gen_random_uuid();
        v_asset_ref_id uuid := gen_random_uuid();
        v_asset_pub_id uuid := gen_random_uuid();
        v_clean_res jsonb;
        v_test_draft_id uuid;
      begin
        -- Old unreferenced asset (48h old)
        insert into public.template_assets (
          id, template_id, storage_bucket, storage_path, checksum,
          mime_type, byte_size, upload_status, status, is_published, created_at
        ) values (
          v_asset_clean_id, v_tmpl_id, 'template-drafts', 'test/clean-old.png', 'chk-clean',
          'image/png', 1024, 'attached', 'draft', false, now() - interval '48 hours'
        );

        -- Recent asset (1h old)
        insert into public.template_assets (
          id, template_id, storage_bucket, storage_path, checksum,
          mime_type, byte_size, upload_status, status, is_published, created_at
        ) values (
          v_asset_recent_id, v_tmpl_id, 'template-drafts', 'test/recent.png', 'chk-recent',
          'image/png', 1024, 'attached', 'draft', false, now() - interval '1 hour'
        );

        -- Referenced asset (48h old but referenced in draft)
        insert into public.template_assets (
          id, template_id, storage_bucket, storage_path, checksum,
          mime_type, byte_size, upload_status, status, is_published, created_at
        ) values (
          v_asset_ref_id, v_tmpl_id, 'template-drafts', 'test/ref-old.png', 'chk-ref',
          'image/png', 1024, 'attached', 'draft', false, now() - interval '48 hours'
        );

        -- Create draft referencing v_asset_ref_id
        insert into public.template_drafts (
          template_id, based_on_version_id, design_document, document_schema_version,
          draft_revision, source_document_hash, created_by, updated_by
        ) values (
          v_tmpl_id, null, jsonb_build_object('elements', jsonb_build_array(jsonb_build_object('id', '1', 'url', '/api/templates/assets/' || v_asset_ref_id::text))), 1,
          1, 'hash-ref', v_adm_id, v_adm_id
        ) returning id into v_test_draft_id;

        -- Published asset
        insert into public.template_assets (
          id, template_id, storage_bucket, storage_path, checksum,
          mime_type, byte_size, upload_status, status, is_published, ever_published_at, created_at
        ) values (
          v_asset_pub_id, v_tmpl_id, 'template-assets', 'test/pub.png', 'chk-pub',
          'image/png', 1024, 'verified', 'published', true, now() - interval '48 hours', now() - interval '48 hours'
        );

        -- Test 1: Recent asset -> fails with TOO_RECENT
        v_clean_res := public.template_cleanup_draft_asset(v_adm_id, 'req-clean-recent', v_asset_recent_id, 24);
        if (v_clean_res->>'success')::boolean is not false or v_clean_res->>'reason' <> 'TOO_RECENT' then
          raise exception 'Expected TOO_RECENT for recent asset, got %', v_clean_res;
        end if;

        -- Test 2: Referenced asset -> fails with REFERENCED_IN_DRAFT
        v_clean_res := public.template_cleanup_draft_asset(v_adm_id, 'req-clean-ref', v_asset_ref_id, 24);
        if (v_clean_res->>'success')::boolean is not false or v_clean_res->>'reason' <> 'REFERENCED_IN_DRAFT' then
          raise exception 'Expected REFERENCED_IN_DRAFT for referenced asset, got %', v_clean_res;
        end if;

        -- Test 3: Published asset -> fails with EVER_PUBLISHED_OR_NOT_DRAFT
        v_clean_res := public.template_cleanup_draft_asset(v_adm_id, 'req-clean-pub', v_asset_pub_id, 24);
        if (v_clean_res->>'success')::boolean is not false or v_clean_res->>'reason' <> 'EVER_PUBLISHED_OR_NOT_DRAFT' then
          raise exception 'Expected EVER_PUBLISHED_OR_NOT_DRAFT for published asset, got %', v_clean_res;
        end if;

        -- Test 4: Eligible unreferenced old asset -> succeeds and deletes row
        v_clean_res := public.template_cleanup_draft_asset(v_adm_id, 'req-clean-ok', v_asset_clean_id, 24);
        if (v_clean_res->>'success')::boolean is not true or v_clean_res->>'storage_path' <> 'test/clean-old.png' then
          raise exception 'Expected success for eligible old unreferenced asset, got %', v_clean_res;
        end if;

        select count(*) into v_count from public.template_assets where id = v_asset_clean_id;
        if v_count <> 0 then
          raise exception 'Cleaned asset was not deleted from template_assets';
        end if;
      end;

      -- 11. Section 11: State 43 Task 11 RPCs (record validation run and get availability)
      declare
        v_val_res jsonb;
        v_avail_res jsonb;
        v_val_draft_id uuid;
      begin
        select id into v_val_draft_id from public.template_drafts where template_id = v_tmpl_id limit 1;

        -- 11.1 Record validation run
        v_val_res := public.template_record_validation_run(
          v_ed_id,
          v_tmpl_id,
          v_val_draft_id,
          1::bigint,
          '43000000-0000-0000-0000-0000000000a1'::uuid,
          1::bigint,
          'hash-source-1',
          'hash-candidate-1',
          'hash-target-1',
          null,
          '[]'::jsonb,
          '{}'::text[],
          '1.0.0',
          'chromium-test',
          true,
          null,
          'sha256-thumb-hex',
          '{}'::jsonb,
          now() + interval '10 minutes'
        );

        if v_val_res->>'id' is null then
          raise exception 'template_record_validation_run failed to return id';
        end if;

        -- 11.2 Check template availability on draft-only template
        v_avail_res := public.get_template_availability(v_tmpl_id);
        if (v_avail_res->>'available')::boolean is not false then
          raise exception 'Draft-only template expected available = false';
        end if;
        if not (v_avail_res::text like '%NO_PUBLISHED_VERSION%') then
          raise exception 'Expected NO_PUBLISHED_VERSION blocker, got %', v_avail_res;
        end if;
      end;

      -- 12. Section 12: State 43 Task 12 RPCs (template_publish_draft atomic transaction)
      declare
        v_p_tmpl_id text := 't12-pub-test-tmpl';
        v_p_draft_id uuid;
        v_p_val_id uuid;
        v_p_session_id uuid := '43000000-0000-0000-0000-0000000000b1'::uuid;
        v_p_pub_res jsonb;
        v_p_pub_replay jsonb;
        v_p_v1_id uuid;
        v_p_v2_id uuid;
        v_p_v1_before record;
        v_p_v1_after record;
        v_p_denied boolean;
        v_p_op_count integer;
        v_p_event_count integer;
        v_p_draft_count integer;
        v_p_tmpl record;
        v_p_new_draft_res jsonb;
        v_p_draft2_id uuid;
        v_p_val2_id uuid;
        v_p_val_exp_id uuid;
        v_p_val_warn_id uuid;
        v_p_face_id uuid := '43000000-0000-0000-0000-0000000000f1'::uuid;
        v_p_family_id text := 't12-test-font-family';
      begin
        -- Create fixture font family and published font face
        insert into public.fonts (id, family_name, published, status)
        values (v_p_family_id, 'T12 Test Family', true, 'published')
        on conflict (id) do nothing;

        insert into public.font_faces (id, family_id, postscript_name, style, weight, status)
        values (v_p_face_id, v_p_family_id, 'T12TestRegular', 'normal', 400, 'published')
        on conflict (id) do nothing;

        -- Create fixture template
        insert into public.templates (
          id, name, product_id, variant_id, status, revision, target_snapshot, created_by
        ) values (
          v_p_tmpl_id, 'Publish Test Template', 'card', 'horizontal', 'draft', 1,
          jsonb_build_object('productId', 'card', 'variantId', 'horizontal'), v_ed_id
        );

        -- Create fixture draft referencing published font face
        insert into public.template_drafts (
          template_id, based_on_version_id, design_document, document_schema_version,
          draft_revision, source_document_hash, editor_user_id, lease_session_id,
          lease_epoch, lease_expires_at, created_by, updated_by
        ) values (
          v_p_tmpl_id, null,
          jsonb_build_object(
            'productId', 'card',
            'variantId', 'horizontal',
            'elements', jsonb_build_array(
              jsonb_build_object('id', 'txt1', 'data', jsonb_build_object('fontFaceId', v_p_face_id::text, 'fontChecksum', 'chk-t12-face'))
            )
          ),
          1, 1, 'hash-pub-doc-1', v_ed_id, v_p_session_id, 1, now() + interval '10 minutes',
          v_ed_id, v_ed_id
        ) returning id into v_p_draft_id;

        -- Create valid validation run
        insert into public.template_validation_runs (
          template_id, draft_id, source_revision, lease_session_id, lease_epoch,
          source_document_hash, candidate_document_hash, target_hash,
          findings, warning_ids, validator_version, engine_fingerprint,
          customer_preview_passed, expires_at
        ) values (
          v_p_tmpl_id, v_p_draft_id, 1, v_p_session_id, 1,
          'hash-pub-doc-1', 'hash-pub-doc-1', 'hash-target-1',
          '[]'::jsonb, '{}'::text[], '1.0.0', 'test-engine',
          true, now() + interval '10 minutes'
        ) returning id into v_p_val_id;

        -- 12.1 Atomic publish of draft to version 1
        v_p_pub_res := public.template_publish_draft(
          v_ed_id,
          't12-req-pub-1',
          v_p_tmpl_id,
          v_p_draft_id,
          1::bigint,
          1::bigint,
          v_p_session_id,
          1::bigint,
          v_p_val_id,
          '{}'::text[],
          'First release'
        );

        if (v_p_pub_res->>'ok')::boolean is not true then
          raise exception 'template_publish_draft failed: %', v_p_pub_res;
        end if;

        v_p_v1_id := (v_p_pub_res->'version'->>'id')::uuid;
        if v_p_v1_id is null then
          raise exception 'Published version id is null';
        end if;

        if (v_p_pub_res->'version'->>'version')::integer <> 1 then
          raise exception 'Expected version 1, got %', v_p_pub_res->'version'->>'version';
        end if;

        -- 12.2 Verify template state updated
        select * into v_p_tmpl from public.templates where id = v_p_tmpl_id;
        if v_p_tmpl.status <> 'published' then
          raise exception 'Template status is not published';
        end if;
        if v_p_tmpl.current_published_version_id <> v_p_v1_id then
          raise exception 'Template current_published_version_id mismatch';
        end if;
        if v_p_tmpl.ever_published_at is null then
          raise exception 'Template ever_published_at was not set';
        end if;
        if v_p_tmpl.revision <> 2 then
          raise exception 'Template revision did not advance to 2';
        end if;

        -- 12.3 Verify active draft deleted
        select count(*) into v_p_draft_count from public.template_drafts where id = v_p_draft_id;
        if v_p_draft_count <> 0 then
          raise exception 'Active draft was not deleted after publish';
        end if;

        -- 12.4 Verify asset_event recorded
        select count(*) into v_p_event_count
        from public.asset_events
        where target_id = v_p_tmpl_id
          and event = 'template_published'
          and metadata_diff->>'draftId' = v_p_draft_id::text;
        if v_p_event_count <> 1 then
          raise exception 'Expected 1 template_published asset_event, got %', v_p_event_count;
        end if;

        -- 12.5 Idempotent retry: after draft is published and deleted, calling template_publish_draft
        -- with the same request_id cleanly returns original version without throwing NOT_FOUND: draft not found
        select count(*) into v_p_draft_count from public.template_drafts where id = v_p_draft_id;
        if v_p_draft_count <> 0 then
          raise exception 'Expected draft % to be deleted before replay test', v_p_draft_id;
        end if;
        v_p_pub_replay := public.template_publish_draft(
          v_ed_id,
          't12-req-pub-1',
          v_p_tmpl_id,
          v_p_draft_id,
          1::bigint,
          1::bigint,
          v_p_session_id,
          1::bigint,
          v_p_val_id,
          '{}'::text[],
          'First release'
        );

        if v_p_pub_replay <> v_p_pub_res then
          raise exception 'Idempotent replay did not return identical result';
        end if;
        if (v_p_pub_replay->'version'->>'id')::uuid <> v_p_v1_id then
          raise exception 'Idempotent replay version ID mismatch: expected %, got %',
            v_p_v1_id, v_p_pub_replay->'version'->>'id';
        end if;


        -- Verify no second event inserted on replay
        select count(*) into v_p_event_count
        from public.asset_events
        where target_id = v_p_tmpl_id
          and event = 'template_published'
          and metadata_diff->>'draftId' = v_p_draft_id::text;
        if v_p_event_count <> 1 then
          raise exception 'Replay unexpectedly duplicated asset_events';
        end if;

        -- 12.6 Replay with changed payload raises OPERATION_CONFLICT
        v_p_denied := false;
        begin
          perform public.template_publish_draft(
            v_ed_id,
            't12-req-pub-1',
            v_p_tmpl_id,
            v_p_draft_id,
            1::bigint,
            1::bigint,
            v_p_session_id,
            1::bigint,
            v_p_val_id,
            '{}'::text[],
            'Changed note'
          );
        exception when sqlstate 'P0001' then
          if sqlerrm = 'OPERATION_CONFLICT' then
            v_p_denied := true;
          end if;
        end;
        if not v_p_denied then
          raise exception 'Expected OPERATION_CONFLICT on altered payload replay';
        end if;

        -- 12.7 Stale racing publish on deleted draft fails with NOT_FOUND
        v_p_denied := false;
        begin
          perform public.template_publish_draft(
            v_ed_id,
            't12-req-pub-racing-diff-req',
            v_p_tmpl_id,
            v_p_draft_id,
            1::bigint,
            1::bigint,
            v_p_session_id,
            1::bigint,
            v_p_val_id,
            '{}'::text[],
            'First release'
          );
        exception when sqlstate 'P0001' then
          if sqlerrm like '%NOT_FOUND%' or sqlerrm like '%REVISION_CONFLICT%' then
            v_p_denied := true;
          end if;
        end;
        if not v_p_denied then
          raise exception 'Expected NOT_FOUND or REVISION_CONFLICT for racing publish on deleted draft';
        end if;

        -- 12.8 Snapshot v1 state to assert immutability
        select * into v_p_v1_before from public.template_versions where id = v_p_v1_id;

        -- Create second draft and publish v2
        v_p_new_draft_res := public.template_create_draft(
          v_ed_id,
          't12-req-create-draft-2',
          v_p_tmpl_id,
          2::bigint,
          v_p_v1_id
        );
        v_p_draft2_id := (v_p_new_draft_res->'draft'->>'id')::uuid;

        insert into public.template_validation_runs (
          template_id, draft_id, source_revision, lease_session_id, lease_epoch,
          source_document_hash, candidate_document_hash, target_hash,
          findings, warning_ids, validator_version, engine_fingerprint,
          customer_preview_passed, expires_at
        ) values (
          v_p_tmpl_id, v_p_draft2_id, 1, '00000000-0000-0000-0000-000000000000'::uuid, 0,
          'hash-doc-2', 'hash-doc-2', 'hash-target-1',
          '[]'::jsonb, '{}'::text[], '1.0.0', 'test-engine',
          true, now() + interval '10 minutes'
        ) returning id into v_p_val2_id;

        -- Acquire lease on draft 2
        perform public.template_acquire_draft_lease(
          v_ed_id,
          't12-req-lease-2',
          v_p_draft2_id,
          v_p_session_id
        );

        -- Update validation run lease to match
        update public.template_validation_runs
        set lease_session_id = v_p_session_id, lease_epoch = 1, source_document_hash = (select source_document_hash from public.template_drafts where id = v_p_draft2_id)
        where id = v_p_val2_id;

        -- Publish version 2
        v_p_pub_res := public.template_publish_draft(
          v_ed_id,
          't12-req-pub-2',
          v_p_tmpl_id,
          v_p_draft2_id,
          1::bigint,
          2::bigint,
          v_p_session_id,
          1::bigint,
          v_p_val2_id,
          '{}'::text[],
          'Second release'
        );

        if (v_p_pub_res->'version'->>'version')::integer <> 2 then
          raise exception 'Expected version 2, got %', v_p_pub_res->'version'->>'version';
        end if;

        -- 12.9 Assert Version 1 remained completely immutable
        select * into v_p_v1_after from public.template_versions where id = v_p_v1_id;
        if v_p_v1_before.design_document <> v_p_v1_after.design_document
          or v_p_v1_before.version <> v_p_v1_after.version
          or v_p_v1_before.target_snapshot <> v_p_v1_after.target_snapshot then
          raise exception 'Version 1 mutated after Version 2 publish';
        end if;

        -- 12.10 Expired receipt rejection
        v_p_new_draft_res := public.template_create_draft(
          v_ed_id,
          't12-req-create-draft-3',
          v_p_tmpl_id,
          3::bigint,
          v_p_v1_id
        );
        v_p_draft2_id := (v_p_new_draft_res->'draft'->>'id')::uuid;
        perform public.template_acquire_draft_lease(v_ed_id, 't12-req-lease-3', v_p_draft2_id, v_p_session_id);

        insert into public.template_validation_runs (
          template_id, draft_id, source_revision, lease_session_id, lease_epoch,
          source_document_hash, candidate_document_hash, target_hash,
          findings, warning_ids, validator_version, engine_fingerprint,
          customer_preview_passed, expires_at
        ) values (
          v_p_tmpl_id, v_p_draft2_id, 1, v_p_session_id, 1,
          (select source_document_hash from public.template_drafts where id = v_p_draft2_id),
          'hash-doc-exp', 'hash-target-1',
          '[]'::jsonb, '{}'::text[], '1.0.0', 'test-engine',
          true, now() - interval '1 second'
        ) returning id into v_p_val_exp_id;

        v_p_denied := false;
        begin
          perform public.template_publish_draft(
            v_ed_id,
            't12-req-pub-exp',
            v_p_tmpl_id,
            v_p_draft2_id,
            1::bigint,
            3::bigint,
            v_p_session_id,
            1::bigint,
            v_p_val_exp_id,
            '{}'::text[]
          );
        exception when sqlstate 'P0001' then
          if sqlerrm like '%expired%' then v_p_denied := true; end if;
        end;
        if not v_p_denied then raise exception 'Expected rejection for expired validation receipt'; end if;

        -- 12.11 Unacknowledged warnings rejection
        insert into public.template_validation_runs (
          template_id, draft_id, source_revision, lease_session_id, lease_epoch,
          source_document_hash, candidate_document_hash, target_hash,
          findings, warning_ids, validator_version, engine_fingerprint,
          customer_preview_passed, expires_at
        ) values (
          v_p_tmpl_id, v_p_draft2_id, 1, v_p_session_id, 1,
          (select source_document_hash from public.template_drafts where id = v_p_draft2_id),
          'hash-doc-warn', 'hash-target-1',
          '[]'::jsonb, array['WARN_CUSTOM_1'], '1.0.0', 'test-engine',
          true, now() + interval '10 minutes'
        ) returning id into v_p_val_warn_id;

        v_p_denied := false;
        begin
          perform public.template_publish_draft(
            v_ed_id,
            't12-req-pub-warn',
            v_p_tmpl_id,
            v_p_draft2_id,
            1::bigint,
            3::bigint,
            v_p_session_id,
            1::bigint,
            v_p_val_warn_id,
            '{}'::text[]
          );
        exception when sqlstate 'P0001' then
          if sqlerrm like '%UNACKNOWLEDGED_WARNINGS%' then v_p_denied := true; end if;
        end;
        if not v_p_denied then raise exception 'Expected rejection for unacknowledged warnings'; end if;

        -- 12.12 Archived font face dependency rejection
        update public.font_faces set status = 'archived' where id = v_p_face_id;

        insert into public.template_validation_runs (
          template_id, draft_id, source_revision, lease_session_id, lease_epoch,
          source_document_hash, candidate_document_hash, target_hash,
          findings, warning_ids, validator_version, engine_fingerprint,
          customer_preview_passed, expires_at
        ) values (
          v_p_tmpl_id, v_p_draft2_id, 1, v_p_session_id, 1,
          (select source_document_hash from public.template_drafts where id = v_p_draft2_id),
          'hash-doc-arch', 'hash-target-1',
          '[]'::jsonb, array['WARN_CUSTOM_1'], '1.0.0', 'test-engine',
          true, now() + interval '10 minutes'
        ) returning id into v_p_val_id;

        -- Put the archived font into the draft document
        update public.template_drafts
        set design_document = jsonb_build_object(
          'productId', 'card',
          'variantId', 'horizontal',
          'elements', jsonb_build_array(
            jsonb_build_object('id', 'txt1', 'data', jsonb_build_object('fontFaceId', v_p_face_id::text))
          )
        ),
        source_document_hash = md5('arch-doc')
        where id = v_p_draft2_id;

        update public.template_validation_runs
        set source_document_hash = md5('arch-doc')
        where id = v_p_val_id;

        v_p_denied := false;
        begin
          perform public.template_publish_draft(
            v_ed_id,
            't12-req-pub-arch',
            v_p_tmpl_id,
            v_p_draft2_id,
            1::bigint,
            3::bigint,
            v_p_session_id,
            1::bigint,
            v_p_val_id,
            array['WARN_CUSTOM_1']
          );
        exception when sqlstate 'P0001' then
          if sqlerrm like '%ARCHIVED_DEPENDENCY%' then v_p_denied := true; end if;
        end;
        if not v_p_denied then raise exception 'Expected ARCHIVED_DEPENDENCY rejection'; end if;
      end;
    end;

      -- 13. Section 13: State 43 Task 13 RPCs (Lifecycle actions)
      declare
        v_l_res jsonb;
        v_l_denied boolean;
        v_l_tmpl record;
        v_l_count integer;
        v_l_stick_id text := 'stick-life-1';
        v_l_draft_ref uuid := gen_random_uuid();
        v_l_asset_src_id uuid := gen_random_uuid();
        v_l_src_draft_id uuid := gen_random_uuid();
        v_l_dup_asset record;
        v_l_dup_draft record;
      begin
        -- 13.1 Archive published template (v_p_tmpl_id is currently at revision 3)
        v_l_res := public.template_archive(v_ed_id, 't13-req-arch-1', v_p_tmpl_id, 3::bigint);
        if (v_l_res->>'ok')::boolean is not true then
          raise exception 'template_archive failed: %', v_l_res;
        end if;
        select * into v_l_tmpl from public.templates where id = v_p_tmpl_id;
        if v_l_tmpl.status <> 'archived' or v_l_tmpl.revision <> 4 or v_l_tmpl.archived_at is null then
          raise exception 'template_archive did not set status=archived and revision=4, got status=%, rev=%', v_l_tmpl.status, v_l_tmpl.revision;
        end if;

        -- 13.2 Republish fails because font face v_p_face_id was archived in 12.12
        v_l_denied := false;
        begin
          perform public.template_republish(v_ed_id, 't13-req-repub-fail', v_p_tmpl_id, 4::bigint);
        exception when sqlstate 'P0001' then
          if sqlerrm like '%ARCHIVED_DEPENDENCY%' then v_l_denied := true; end if;
        end;
        if not v_l_denied then raise exception 'Expected ARCHIVED_DEPENDENCY on republish'; end if;

        -- Un-archive font face and republish succeeds
        update public.font_faces set status = 'published' where id = v_p_face_id;
        v_l_res := public.template_republish(v_ed_id, 't13-req-repub-ok', v_p_tmpl_id, 4::bigint);
        if (v_l_res->>'ok')::boolean is not true then
          raise exception 'template_republish failed: %', v_l_res;
        end if;
        select * into v_l_tmpl from public.templates where id = v_p_tmpl_id;
        if v_l_tmpl.status <> 'published' or v_l_tmpl.archived_at is not null or v_l_tmpl.revision <> 5 then
          raise exception 'template_republish did not set status=published and revision=5, got status=%, rev=%', v_l_tmpl.status, v_l_tmpl.revision;
        end if;

        -- 13.3 Duplicate creates independent template and draft
        v_l_res := public.template_duplicate(v_ed_id, 't13-req-dup-1', v_p_tmpl_id, 't13-dup-tmpl');
        if (v_l_res->>'ok')::boolean is not true then
          raise exception 'template_duplicate failed: %', v_l_res;
        end if;
        select * into v_l_tmpl from public.templates where id = 't13-dup-tmpl';
        if v_l_tmpl.status <> 'draft' or v_l_tmpl.current_published_version_id is not null or v_l_tmpl.ever_published_at is not null then
          raise exception 'Duplicate did not create clean draft template';
        end if;
        select count(*) into v_l_count from public.template_drafts where template_id = 't13-dup-tmpl';
        if v_l_count <> 1 then
          raise exception 'Duplicate did not create draft';
        end if;


        -- 13.3.1 Duplicate copies private draft assets, rewrites document references, and isolates duplicate
        insert into public.templates (
          id, name, slug, product_id, variant_id, product_mode, category_id,
          tags, sort_order, status, revision, target_snapshot, created_by, updated_by
        ) values (
          't13-src-draft-tmpl', 'Source Draft With Assets', 't13-src-draft-tmpl', 'card', 'horizontal',
          null, 'cat-card', array['test'], 0, 'draft', 1, jsonb_build_object('productId', 'card'), v_ed_id, v_ed_id
        );

        insert into public.template_drafts (
          id, template_id, draft_revision, source_document_hash,
          design_document, created_by, updated_by
        ) values (
          v_l_src_draft_id,
          't13-src-draft-tmpl',
          1,
          'hash-src-doc',
          jsonb_build_object(
            'productId', 'card',
            'elements', jsonb_build_array(
              jsonb_build_object(
                'id', 'el-img-1',
                'type', 'image',
                'src', 'template-asset://' || v_l_asset_src_id::text,
                'viewUrl', '/api/admin/content/templates/t13-src-draft-tmpl/assets/' || v_l_asset_src_id::text
              )
            )
          ),
          v_ed_id,
          v_ed_id
        );

        insert into public.template_assets (
          id, template_id, draft_id, storage_bucket, storage_path, checksum,
          mime_type, byte_size, upload_status, status, is_published, created_by
        ) values (
          v_l_asset_src_id,
          't13-src-draft-tmpl',
          v_l_src_draft_id,
          'template-drafts',
          't13-src-draft-tmpl/' || v_l_asset_src_id::text || '.png',
          'chk-private-draft-asset',
          'image/png',
          1024,
          'verified',
          'draft',
          false,
          v_ed_id
        );

        v_l_res := public.template_duplicate(v_ed_id, 't13-req-dup-asset-1', 't13-src-draft-tmpl', 't13-dup-asset-tmpl');
        if (v_l_res->>'ok')::boolean is not true then
          raise exception 'template_duplicate with private draft assets failed: %', v_l_res;
        end if;

        select * into v_l_dup_asset from public.template_assets where template_id = 't13-dup-asset-tmpl';
        if not found or v_l_dup_asset.id is null then
          raise exception 'Duplicated template does not have its own template_assets record';
        end if;
        if v_l_dup_asset.id = v_l_asset_src_id then
          raise exception 'Duplicated asset retained original asset ID';
        end if;
        if v_l_dup_asset.status <> 'draft' or v_l_dup_asset.is_published is not false then
          raise exception 'Duplicated asset has invalid status or is_published';
        end if;

        select * into v_l_dup_draft from public.template_drafts where template_id = 't13-dup-asset-tmpl';
        if not found then
          raise exception 'Duplicated draft not found';
        end if;
        if v_l_dup_draft.design_document::text not like '%' || v_l_dup_asset.id::text || '%' then
          raise exception 'Duplicated draft document does not reference new asset ID';
        end if;
        if v_l_dup_draft.design_document::text like '%' || v_l_asset_src_id::text || '%' then
          raise exception 'Duplicated draft document still references original asset ID';
        end if;

        -- Deleting source draft template deletes source asset but does NOT affect duplicate draft or its assets
        v_l_res := public.template_delete_draft(v_adm_id, 't13-req-del-src-asset', 't13-src-draft-tmpl');
        if (v_l_res->>'deleted')::boolean is not true then
          raise exception 'Failed to delete source draft template: %', v_l_res;
        end if;

        select count(*) into v_l_count from public.template_assets where id = v_l_asset_src_id;
        if v_l_count <> 0 then
          raise exception 'Original asset was not deleted when source draft was deleted';
        end if;

        select count(*) into v_l_count from public.template_assets where id = v_l_dup_asset.id;
        if v_l_count <> 1 then
          raise exception 'Duplicate asset was affected by source draft deletion';
        end if;

        select count(*) into v_l_count from public.template_drafts where template_id = 't13-dup-asset-tmpl';
        if v_l_count <> 1 then
          raise exception 'Duplicate draft was affected by source draft deletion';
        end if;

        -- Cleanup duplicate test template
        perform public.template_delete_draft(v_adm_id, 't13-req-del-dup-cleanup', 't13-dup-asset-tmpl');
        -- 13.4 Delete draft: Editor forbidden
        v_l_denied := false;
        begin
          perform public.template_delete_draft(v_ed_id, 't13-req-del-ed', 't13-dup-tmpl');
        exception when sqlstate 'P0001' then
          v_l_denied := true;
        end;
        if not v_l_denied then raise exception 'Expected editor to be denied template_delete_draft'; end if;

        -- Delete draft: Published template cannot be deleted
        v_l_denied := false;
        begin
          perform public.template_delete_draft(v_adm_id, 't13-req-del-pub', v_p_tmpl_id);
        exception when sqlstate 'P0001' then
          if sqlerrm like '%CANNOT_DELETE_PUBLISHED_TEMPLATE%' or sqlerrm like '%CANNOT_DELETE_TEMPLATE_WITH_VERSIONS%' then
            v_l_denied := true;
          end if;
        end;
        if not v_l_denied then raise exception 'Expected published template deletion to be rejected'; end if;

        -- Admin can delete never-published duplicate
        v_l_res := public.template_delete_draft(v_adm_id, 't13-req-del-ok', 't13-dup-tmpl');
        if (v_l_res->>'deleted')::boolean is not true then
          raise exception 'template_delete_draft failed for admin on draft: %', v_l_res;
        end if;
        select count(*) into v_l_count from public.templates where id = 't13-dup-tmpl';
        if v_l_count <> 0 then raise exception 'Template row was not deleted'; end if;
        select count(*) into v_l_count from public.template_drafts where template_id = 't13-dup-tmpl';
        if v_l_count <> 0 then raise exception 'Template draft was not deleted'; end if;

        -- 13.5 library_prepare_delete checks template_drafts and template_version_dependencies
        insert into public.sticker_assets (id, status, revision, storage_path, checksum, byte_size, width, height, mime_type, created_by, updated_by)
        values (v_l_stick_id, 'draft', 1, 'stick/test.png', 'chk-stick', 100, 100, 100, 'image/png', v_ed_id, v_ed_id);

        insert into public.template_drafts (id, template_id, draft_revision, design_document, created_by, updated_by)
        values (
          v_l_draft_ref,
          v_p_tmpl_id,
          1,
          jsonb_build_object('elements', jsonb_build_array(jsonb_build_object('data', jsonb_build_object('libraryAssetId', v_l_stick_id)))),
          v_ed_id,
          v_ed_id
        ) on conflict (template_id) do update set design_document = excluded.design_document;

        v_l_denied := false;
        begin
          perform public.library_prepare_delete(v_ed_id, '43000000-0000-0000-0000-000000000801'::uuid, 'sticker', v_l_stick_id, 1::bigint);
        exception when sqlstate 'P0001' then
          if sqlerrm = 'REFERENCED_DRAFT' then v_l_denied := true; end if;
        end;
        if not v_l_denied then raise exception 'Expected REFERENCED_DRAFT when sticker is in template_drafts'; end if;

        -- Clean up test draft
        delete from public.template_drafts where template_id = v_p_tmpl_id;
      end;
  end;
end $$;
rollback;
