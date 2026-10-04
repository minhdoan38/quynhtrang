-- Run with psql after migrations; fixture changes always roll back.
begin;
insert into auth.users(id, email) values
 ('46000000-0000-0000-0000-000000000001', 'catalog-admin@test.invalid'),
 ('46000000-0000-0000-0000-000000000002', 'catalog-editor@test.invalid'),
 ('46000000-0000-0000-0000-000000000003', 'catalog-customer@test.invalid');
insert into public.staff_roles(user_id, role) values
 ('46000000-0000-0000-0000-000000000001', 'admin'),
 ('46000000-0000-0000-0000-000000000002', 'editor');
insert into public.products(id, slug, name, product_type, status, active, revision)
 values ('catalog-ui-test', 'catalog-ui-test', 'Test', 'card', 'draft', false, 1);
set local role authenticated;
do $$
declare v_actor text; v_result jsonb; v_draft uuid;
begin
  foreach v_actor in array array['46000000-0000-0000-0000-000000000002', '46000000-0000-0000-0000-000000000003'] loop
    perform set_config('request.jwt.claim.sub', v_actor, true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text, true);
    foreach v_result in array array[
      public.catalog_update_product_metadata('catalog-ui-test', 1, '{"name":"bad"}'),
      public.catalog_enable_variant('card', 'card:horizontal', 1),
      public.catalog_open_commercial_draft('catalog-ui-test'),
      public.catalog_set_product_status('catalog-ui-test', 'active', 1),
      public.catalog_set_variant_status('horizontal', 'archived', 1),
      public.save_product_commercial_draft('46000000-0000-0000-0000-000000000099', 1, '{}'),
      public.publish_product_commercial_config('catalog-ui-test', '46000000-0000-0000-0000-000000000099', 1, 1, 'request')
    ] loop
      if v_result->>'code' is distinct from 'FORBIDDEN' then raise exception 'Unauthorized direct RPC accepted: %', v_result; end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claim.sub', '46000000-0000-0000-0000-000000000001', true);
  perform set_config('request.jwt.claims', '{"sub":"46000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
  v_result := public.catalog_update_product_metadata('catalog-ui-test', 1, '{"name":"Updated","sortOrder":2}');
  if v_result->>'ok' is distinct from 'true' then raise exception 'Admin metadata failed: %', v_result; end if;
  v_result := public.catalog_update_product_metadata('catalog-ui-test', 1, '{"name":"Stale"}');
  if v_result->>'code' is distinct from 'REVISION_CONFLICT' then raise exception 'Stale metadata overwrite: %', v_result; end if;
  v_result := public.catalog_update_product_metadata('catalog-ui-test', 2, '{"definitionKey":"card:vertical"}');
  if v_result->>'code' is distinct from 'INVALID_INPUT' then raise exception 'Structural metadata accepted: %', v_result; end if;
  v_result := public.catalog_open_commercial_draft('catalog-ui-test');
  if v_result->>'ok' is distinct from 'true' then raise exception 'Draft create failed: %', v_result; end if;
  v_draft := (v_result->'draft'->>'id')::uuid;
  v_result := public.catalog_open_commercial_draft('catalog-ui-test');
  if (v_result->'draft'->>'id')::uuid <> v_draft then raise exception 'Multiple drafts created'; end if;
end;
$$;
rollback;
