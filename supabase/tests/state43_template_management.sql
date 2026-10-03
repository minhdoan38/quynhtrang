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
    v_test_ver_id uuid := '43000000-0000-0000-0000-0000000000v1';
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
  end;
end $$;

rollback;
