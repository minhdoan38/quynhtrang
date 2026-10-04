-- State 44 review fix: revision-checked commercial draft save and atomic publication.

create or replace function public.save_product_commercial_draft(
  p_draft_id uuid,
  p_expected_revision bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_row public.product_commercial_drafts%rowtype;
begin
  select role into v_role from public.staff_roles where user_id = v_actor;
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;
  if v_role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;
  update public.product_commercial_drafts
  set payload = p_payload, revision = revision + 1, updated_at = clock_timestamp()
  where id = p_draft_id and revision = p_expected_revision
  returning * into v_row;
  if not found then
    if exists (select 1 from public.product_commercial_drafts where id = p_draft_id) then
      return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT');
    end if;
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  end if;
  return jsonb_build_object('ok', true, 'draft', to_jsonb(v_row));
end;
$$;

create or replace function public.publish_product_commercial_config(
  p_product_id text,
  p_draft_id uuid,
  p_expected_draft_revision bigint,
  p_expected_product_revision bigint,
  p_request_id text
)
returns jsonb
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_product public.products%rowtype;
  v_draft public.product_commercial_drafts%rowtype;
  v_version_id uuid;
  v_version_number integer;
  v_rule jsonb;
  v_tier jsonb;
  v_rule_id uuid;
  v_payload jsonb;
  v_event_request uuid;
  v_variant_rules jsonb := '[]'::jsonb;
begin
  select role into v_role from public.staff_roles where user_id = v_actor;
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED');
  end if;
  if v_role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN');
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_product.revision <> p_expected_product_revision then
    return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT');
  end if;
  select * into v_draft from public.product_commercial_drafts where id = p_draft_id and product_id = p_product_id for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'NOT_FOUND'); end if;
  if v_draft.revision <> p_expected_draft_revision then
    return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT');
  end if;

  select coalesce(max(version_number), 0) + 1 into v_version_number
  from public.product_commercial_config_versions where product_id = p_product_id;
  insert into public.product_commercial_config_versions(product_id, version_number, currency, payment_policy, published_by)
  values (p_product_id, v_version_number, 'VND', coalesce(v_draft.payload->'paymentPolicy', '{"kind":"full_payment"}'::jsonb), v_actor)
  returning id into v_version_id;

  for v_rule in select value from jsonb_array_elements(coalesce(v_draft.payload->'variantRules', '[]'::jsonb)) loop
    insert into public.commercial_variant_rules(version_id, variant_id, minimum_quantity, quantity_step, maximum_quantity)
    values (
      v_version_id,
      v_rule->>'variantId',
      (v_rule->>'minimumQuantity')::integer,
      (v_rule->>'quantityStep')::integer,
      case when v_rule->>'maximumQuantity' is null or v_rule->>'maximumQuantity' = '' then null else (v_rule->>'maximumQuantity')::integer end
    ) returning id into v_rule_id;
    for v_tier in select value from jsonb_array_elements(coalesce(v_rule->'tiers', '[]'::jsonb)) loop
      insert into public.commercial_pricing_tiers(rule_id, minimum_quantity, unit_price)
      values (v_rule_id, (v_tier->>'minimumQuantity')::integer, (v_tier->>'unitPrice')::integer);
    end loop;
    v_variant_rules := v_variant_rules || jsonb_build_array(v_rule);
  end loop;

  update public.products
  set current_commercial_config_version_id = v_version_id,
      revision = revision + 1,
      updated_at = clock_timestamp()
  where id = p_product_id;
  delete from public.product_commercial_drafts where id = v_draft.id;

  begin
    v_event_request := p_request_id::uuid;
  exception when others then
    v_event_request := null;
  end;
  insert into public.asset_events(actor_user_id, request_id, kind, target_id, before_revision, after_revision, event, metadata_diff)
  values (v_actor, v_event_request, 'catalog', p_product_id, p_expected_product_revision, p_expected_product_revision + 1, 'commercial_config_published', jsonb_build_object('versionId', v_version_id, 'versionNumber', v_version_number));

  return jsonb_build_object(
    'ok', true,
    'version', jsonb_build_object('id', v_version_id, 'product_id', p_product_id, 'version_number', v_version_number, 'currency', 'VND', 'payment_policy', v_draft.payload->'paymentPolicy', 'variantRules', v_variant_rules)
  );
exception when others then
  return jsonb_build_object('ok', false, 'code', 'PUBLISH_FAILED', 'message', sqlerrm);
end;
$$;

revoke all on function public.save_product_commercial_draft(uuid, bigint, jsonb) from public, anon;
grant execute on function public.save_product_commercial_draft(uuid, bigint, jsonb) to authenticated;
revoke all on function public.publish_product_commercial_config(text, uuid, bigint, bigint, text) from public, anon;
grant execute on function public.publish_product_commercial_config(text, uuid, bigint, bigint, text) to authenticated;
