-- State 44 Task 6: admin-only metadata and supported variant operations.
-- SECURITY DEFINER is required because authenticated direct table writes are revoked.
-- Every entry point checks auth.uid() and rejects missing/non-admin staff roles.
create or replace function public.catalog_update_product_metadata(
  p_product_id text,
  p_expected_revision bigint,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_product public.products%rowtype;
  v_metadata jsonb;
  v_name text;
begin
  select role into v_role from public.staff_roles where user_id = auth.uid();
  if auth.uid() is null then return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED'); end if;
  if v_role is distinct from 'admin' then return jsonb_build_object('ok', false, 'code', 'FORBIDDEN'); end if;
  if p_expected_revision is null or p_expected_revision < 1 or jsonb_typeof(p_patch) is distinct from 'object'
    or p_patch = '{}'::jsonb or exists (select 1 from jsonb_object_keys(p_patch) k where k not in ('name','description','thumbnail','sortOrder'))
    or (p_patch ? 'name' and (jsonb_typeof(p_patch->'name') <> 'string' or length(trim(p_patch->>'name')) not between 1 and 200))
    or (p_patch ? 'description' and (jsonb_typeof(p_patch->'description') <> 'string' or length(p_patch->>'description') > 5000))
    or (p_patch ? 'sortOrder' and (jsonb_typeof(p_patch->'sortOrder') <> 'number' or (p_patch->>'sortOrder') !~ '^-?[0-9]+$'))
    or (p_patch ? 'thumbnail' and p_patch->'thumbnail' <> 'null'::jsonb and (jsonb_typeof(p_patch->'thumbnail') <> 'string' or length(p_patch->>'thumbnail') > 2048 or (p_patch->>'thumbnail' <> '' and p_patch->>'thumbnail' !~ '^(https://[^/]+|/[^/])'))) then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
  end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_product.revision <> p_expected_revision then return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT'); end if;
  v_name := case when p_patch ? 'name' then nullif(trim(p_patch->>'name'), '') else v_product.name end;
  if v_name is null then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT'); end if;
  v_metadata := v_product.metadata;
  if p_patch ? 'description' then v_metadata := jsonb_set(v_metadata, '{description}', to_jsonb(p_patch->>'description'), true); end if;
  if p_patch ? 'thumbnail' then v_metadata := jsonb_set(v_metadata, '{thumbnail}', p_patch->'thumbnail', true); end if;
  if p_patch ? 'sortOrder' then v_metadata := jsonb_set(v_metadata, '{sortOrder}', to_jsonb((p_patch->>'sortOrder')::integer), true); end if;
  update public.products set name = v_name, metadata = v_metadata, revision = revision + 1, updated_at = clock_timestamp() where id = p_product_id;
  return jsonb_build_object('ok', true, 'productId', p_product_id, 'revision', v_product.revision + 1, 'status', v_product.status);
exception when others then
  return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT');
end;
$$;

create or replace function public.catalog_enable_variant(
  p_product_id text,
  p_definition_key text,
  p_expected_product_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role text;
  v_product public.products%rowtype;
  v_variant public.product_variants%rowtype;
  v_variant_id text := split_part(lower(trim(p_definition_key)), ':', 2);
  v_product_id text := split_part(lower(trim(p_definition_key)), ':', 1);
begin
  select role into v_role from public.staff_roles where user_id = auth.uid();
  if auth.uid() is null then return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED'); end if;
  if v_role is distinct from 'admin' then return jsonb_build_object('ok', false, 'code', 'FORBIDDEN'); end if;
  if p_expected_product_revision is null or p_expected_product_revision < 1 or p_definition_key is null then return jsonb_build_object('ok', false, 'code', 'INVALID_INPUT'); end if;
  if v_product_id <> p_product_id or p_definition_key not in ('wrapping:a1','wrapping:a2','card:horizontal','card:vertical','sticker:die-cut','sticker:fixed-shape','sticker:phone','notebook:standard') then return jsonb_build_object('ok', false, 'code', 'UNKNOWN_DEFINITION_KEY'); end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_product.revision <> p_expected_product_revision then return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT'); end if;
  if exists (select 1 from public.product_variants where id = v_variant_id) then return jsonb_build_object('ok', false, 'code', 'ALREADY_CONFIGURED'); end if;
  insert into public.product_variants(id, product_id, name, price, active, status, definition_key) values (v_variant_id, p_product_id, initcap(replace(v_variant_id, '-', ' ')), 0, false, 'draft', p_definition_key) returning * into v_variant;
  update public.products set revision = revision + 1, updated_at = clock_timestamp() where id = p_product_id;
  return jsonb_build_object('ok', true, 'productId', p_product_id, 'variantId', v_variant.id, 'status', v_variant.status, 'revision', v_product.revision + 1);
exception when others then
  return jsonb_build_object('ok', false, 'code', 'ENABLE_VARIANT_FAILED');
end;
$$;
revoke all on function public.catalog_update_product_metadata(text, bigint, jsonb) from public, anon;
grant execute on function public.catalog_update_product_metadata(text, bigint, jsonb) to authenticated;
revoke all on function public.catalog_enable_variant(text, text, bigint) from public, anon;
grant execute on function public.catalog_enable_variant(text, text, bigint) to authenticated;

create or replace function public.catalog_open_commercial_draft(p_product_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_role text;
  v_product public.products%rowtype;
  v_draft public.product_commercial_drafts%rowtype;
  v_payload jsonb;
begin
  select role into v_role from public.staff_roles where user_id = auth.uid();
  if auth.uid() is null then return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED'); end if;
  if v_role is distinct from 'admin' then return jsonb_build_object('ok', false, 'code', 'FORBIDDEN'); end if;
  select * into v_product from public.products where id = p_product_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  select * into v_draft from public.product_commercial_drafts where product_id = p_product_id;
  if found then return jsonb_build_object('ok', true, 'draft', to_jsonb(v_draft)); end if;
  select jsonb_build_object('currency', v.currency, 'paymentPolicy', v.payment_policy, 'variantRules',
    coalesce((select jsonb_agg(jsonb_build_object('variantId', r.variant_id, 'minimumQuantity', r.minimum_quantity,
      'quantityStep', r.quantity_step, 'maximumQuantity', r.maximum_quantity, 'tiers',
      coalesce((select jsonb_agg(jsonb_build_object('minimumQuantity', t.minimum_quantity, 'unitPrice', t.unit_price) order by t.minimum_quantity)
        from public.commercial_pricing_tiers t where t.rule_id = r.id), '[]'::jsonb)) order by r.variant_id)
      from public.commercial_variant_rules r where r.version_id = v.id), '[]'::jsonb)) into v_payload
    from public.product_commercial_config_versions v where v.id = v_product.current_commercial_config_version_id;
  insert into public.product_commercial_drafts(product_id, base_version_id, payload, author_id)
    values (p_product_id, v_product.current_commercial_config_version_id,
      coalesce(v_payload, '{"currency":"VND","paymentPolicy":{"kind":"full_payment"},"variantRules":[]}'::jsonb), auth.uid())
    returning * into v_draft;
  return jsonb_build_object('ok', true, 'draft', to_jsonb(v_draft));
end;
$$;
revoke all on function public.catalog_open_commercial_draft(text) from public, anon;
grant execute on function public.catalog_open_commercial_draft(text) to authenticated;

-- Repair nullable role guards in prior commercial RPCs without changing signatures.
do $$
declare v_signature text; v_definition text;
begin
  foreach v_signature in array array['public.save_product_commercial_draft(uuid,bigint,jsonb)', 'public.publish_product_commercial_config(text,uuid,bigint,bigint,text)'] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    v_definition := replace(v_definition, 'if v_role <> ''admin'' then', 'if v_role is distinct from ''admin'' then');
    execute v_definition;
  end loop;
end;
$$;
