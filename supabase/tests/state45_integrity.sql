-- State 45 database integrity verification.
-- Run against isolated migrated/seeded Supabase; all writes roll back.
begin;

do $$
declare
  v_order_id uuid;
  v_project_id uuid;
  v_base_design_version_id uuid;
  v_expected_design_version_id uuid;
  v_template_id text;
  v_product_id text;
  v_rule_id uuid;
  v_existing_template_draft uuid;
  v_existing_product_draft uuid;
  v_other_project_id uuid;
  v_other_design_version_id uuid;
  v_failed boolean;
begin
  -- Active staff draft: second editing row for same order must fail.
  select order_id, project_id, base_design_version_id, expected_production_design_version_id
    into v_order_id, v_project_id, v_base_design_version_id, v_expected_design_version_id
  from public.design_revision_drafts
  where status in ('editing', 'ready_for_review')
  limit 1;
  if v_order_id is null then
    raise exception 'Integrity fixture missing active design_revision_drafts row';
  end if;

  v_failed := false;
  begin
    insert into public.design_revision_drafts (
      order_id, project_id, base_design_version_id, expected_production_design_version_id,
      document, reason, status, created_by, editor_user_id, prior_design_status
    )
    select order_id, project_id, base_design_version_id, expected_production_design_version_id,
      document, 'State 45 duplicate draft', 'editing', created_by, editor_user_id, prior_design_status
    from public.design_revision_drafts
    where order_id = v_order_id and status in ('editing', 'ready_for_review')
    limit 1;
    raise exception 'duplicate active design draft unexpectedly succeeded';
  exception when unique_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'duplicate active design draft was not rejected'; end if;

  -- Template draft: one active draft per template.
  select id into v_template_id from public.templates limit 1;
  if v_template_id is null then raise exception 'Integrity fixture missing template'; end if;
  select id into v_existing_template_draft from public.template_drafts where template_id = v_template_id;
  if v_existing_template_draft is null then
    insert into public.template_drafts (template_id, design_document)
    values (v_template_id, '{}'::jsonb)
    returning id into v_existing_template_draft;
  end if;

  v_failed := false;
  begin
    insert into public.template_drafts (template_id, design_document)
    values (v_template_id, '{}'::jsonb);
    raise exception 'duplicate active template draft unexpectedly succeeded';
  exception when unique_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'duplicate active template draft was not rejected'; end if;

  -- Commercial draft: one active draft per product.
  select id into v_product_id from public.products limit 1;
  if v_product_id is null then raise exception 'Integrity fixture missing product'; end if;
  select id into v_existing_product_draft from public.product_commercial_drafts where product_id = v_product_id;
  if v_existing_product_draft is null then
    insert into public.product_commercial_drafts (product_id, payload)
    values (v_product_id, '{}'::jsonb)
    returning id into v_existing_product_draft;
  end if;

  v_failed := false;
  begin
    insert into public.product_commercial_drafts (product_id, payload)
    values (v_product_id, '{}'::jsonb);
    raise exception 'duplicate active commercial draft unexpectedly succeeded';
  exception when unique_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'duplicate active commercial draft was not rejected'; end if;

  -- Pricing tier starts must be unique within a rule.
  select rule_id into v_rule_id from public.commercial_pricing_tiers limit 1;
  if v_rule_id is null then raise exception 'Integrity fixture missing commercial pricing tier'; end if;
  v_failed := false;
  begin
    insert into public.commercial_pricing_tiers (rule_id, minimum_quantity, unit_price)
    select rule_id, minimum_quantity, unit_price
    from public.commercial_pricing_tiers
    where rule_id = v_rule_id
    limit 1;
    raise exception 'duplicate pricing tier minimum unexpectedly succeeded';
  exception when unique_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'duplicate pricing tier minimum was not rejected'; end if;

  -- Products.current_commercial_config_version_id cannot point to an invalid / nonexistent commercial version.
  v_failed := false;
  begin
    update public.products
    set current_commercial_config_version_id = gen_random_uuid()
    where id = v_product_id;
    raise exception 'invalid current commercial config version unexpectedly accepted';
  exception when foreign_key_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'invalid current commercial config version was not rejected'; end if;

  -- Orders cannot point to a design version that does not exist.
  select id, project_id into v_order_id, v_project_id
  from public.orders
  where project_id is not null
  limit 1;
  if v_order_id is null then raise exception 'Integrity fixture missing order with project_id'; end if;

  v_failed := false;
  begin
    update public.orders
    set production_design_version_id = gen_random_uuid()
    where id = v_order_id;
    raise exception 'nonexistent order design version unexpectedly accepted';
  exception when foreign_key_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'nonexistent order design version was not rejected'; end if;

  -- Cross-project FK rejection: update public.orders with mismatched project_id and production_design_version_id.
  select p.id, dv.id into v_other_project_id, v_other_design_version_id
  from public.projects p
  join public.design_versions dv on dv.project_id = p.id
  where p.id <> v_project_id
  limit 1;

  if v_other_project_id is null then
    insert into public.projects (product_id, status)
    values (v_product_id, 'editing')
    returning id into v_other_project_id;

    insert into public.design_versions (project_id, version_number, source, design_document)
    values (v_other_project_id, 1, 'customizer', '{}'::jsonb)
    returning id into v_other_design_version_id;
  end if;

  v_failed := false;
  begin
    update public.orders
    set project_id = v_project_id,
        production_design_version_id = v_other_design_version_id
    where id = v_order_id;
    raise exception 'cross-project order design version unexpectedly accepted';
  exception when foreign_key_violation then
    v_failed := true;
  end;
  if not v_failed then raise exception 'cross-project order design version was not rejected'; end if;
end;
$$;

rollback;
