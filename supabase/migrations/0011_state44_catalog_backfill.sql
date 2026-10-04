-- Migration: 0011_state44_catalog_backfill.sql
-- State 44: stable Product/Variant identities and first commercial configuration.
-- This migration preserves legacy rows and never recalculates historical order amounts.

-- The backfill is intentionally fail-closed: a missing legacy identity must be
-- repaired before publishing State 44 rather than silently creating a second one.
do $$
declare
  v_missing_products text;
  v_missing_variants text;
  v_product record;
  v_variant record;
  v_version_id uuid;
  v_rule_id uuid;
  v_existing_tier record;
  v_expected_definition text;
begin
  select string_agg(expected_id, ', ' order by expected_id)
    into v_missing_products
  from (values ('wrapping'), ('card'), ('sticker'), ('notebook')) as required(expected_id)
  where not exists (select 1 from public.products p where p.id = required.expected_id);

  if v_missing_products is not null then
    raise exception 'State 44 backfill requires existing Products: %', v_missing_products;
  end if;

  select string_agg(expected_id, ', ' order by expected_id)
    into v_missing_variants
  from (values
    ('a1'), ('a2'), ('horizontal'), ('vertical'), ('die-cut'),
    ('fixed-shape'), ('phone'), ('standard')
  ) as required(expected_id)
  where not exists (select 1 from public.product_variants v where v.id = required.expected_id);

  if v_missing_variants is not null then
    raise exception 'State 44 backfill requires existing Variants: %', v_missing_variants;
  end if;

  -- Definitions are code-owned and must agree with Task 1 exactly.
  for v_variant in
    select * from (values
      ('a1', 'wrapping', 'wrapping:a1'),
      ('a2', 'wrapping', 'wrapping:a2'),
      ('horizontal', 'card', 'card:horizontal'),
      ('vertical', 'card', 'card:vertical'),
      ('die-cut', 'sticker', 'sticker:die-cut'),
      ('fixed-shape', 'sticker', 'sticker:fixed-shape'),
      ('phone', 'sticker', 'sticker:phone'),
      ('standard', 'notebook', 'notebook:standard')
    ) as mapping(variant_id, product_id, definition_key)
  loop
    select definition_key into v_existing_tier
    from public.product_variants
    where id = v_variant.variant_id and product_id = v_variant.product_id;

    if not found then
      raise exception 'Variant % is linked to unexpected Product (expected %)',
        v_variant.variant_id, v_variant.product_id;
    end if;

    if v_existing_tier.definition_key is not null
       and v_existing_tier.definition_key <> v_variant.definition_key then
      raise exception 'Variant % already has incompatible definition_key % (expected %)',
        v_variant.variant_id, v_existing_tier.definition_key, v_variant.definition_key;
    end if;

    update public.product_variants
    set definition_key = v_variant.definition_key
    where id = v_variant.variant_id;
  end loop;

  -- One immutable v1 header per legacy Product. Existing versions are retained.
  for v_product in
    select id from public.products
    where id in ('wrapping', 'card', 'sticker', 'notebook')
    order by id
  loop
    select id into v_version_id
    from public.product_commercial_config_versions
    where product_id = v_product.id and version_number = 1;

    if v_version_id is null then
      insert into public.product_commercial_config_versions (
        product_id, version_number, currency, payment_policy
      )
      values (v_product.id, 1, 'VND', '{"kind":"full_payment"}'::jsonb)
      returning id into v_version_id;
    end if;

    for v_variant in
      select id, price
      from public.product_variants
      where product_id = v_product.id
      order by id
    loop
      select id into v_rule_id
      from public.commercial_variant_rules
      where version_id = v_version_id and variant_id = v_variant.id;

      if v_rule_id is null then
        insert into public.commercial_variant_rules (
          version_id, variant_id, minimum_quantity, quantity_step, maximum_quantity
        )
        values (v_version_id, v_variant.id, 1, 1, null)
        returning id into v_rule_id;
      else
        if not exists (
          select 1 from public.commercial_variant_rules r
          where r.id = v_rule_id
            and r.minimum_quantity = 1
            and r.quantity_step = 1
            and r.maximum_quantity is null
        ) then
          raise exception 'Existing commercial rule for %.% is not State 44 v1 shape',
            v_product.id, v_variant.id;
        end if;
      end if;

      select * into v_existing_tier
      from public.commercial_pricing_tiers
      where rule_id = v_rule_id and minimum_quantity = 1;

      if not found then
        insert into public.commercial_pricing_tiers (rule_id, minimum_quantity, unit_price)
        values (v_rule_id, 1, v_variant.price);
      elsif v_existing_tier.unit_price <> v_variant.price then
        raise exception 'Existing commercial tier for %.% has price %, legacy price is %',
          v_product.id, v_variant.id, v_existing_tier.unit_price, v_variant.price;
      end if;
    end loop;

    -- Pointer is assigned only after every v1 rule and tier has validated.
    if not exists (
      select 1
      from public.product_commercial_config_versions cv
      join public.commercial_variant_rules r on r.version_id = cv.id
      join public.commercial_pricing_tiers t on t.rule_id = r.id
      join public.product_variants pv on pv.id = r.variant_id
      where cv.id = v_version_id
        and cv.product_id = v_product.id
        and cv.version_number = 1
        and cv.currency = 'VND'
        and cv.payment_policy = '{"kind":"full_payment"}'::jsonb
        and r.minimum_quantity = 1
        and r.quantity_step = 1
        and r.maximum_quantity is null
        and t.minimum_quantity = 1
        and t.unit_price = pv.price
        and pv.product_id = v_product.id
    ) then
      raise exception 'Commercial v1 validation failed for Product %', v_product.id;
    end if;

    update public.products
    set current_commercial_config_version_id = v_version_id
    where id = v_product.id;
  end loop;
end $$;

-- Preserve metadata while recording an actionable blocker for any legacy row
-- that could not be made sellable. No production deposit amount is introduced.
update public.product_variants v
set
  status = case
    when v.active = true
      and v.definition_key is not null
      and exists (
        select 1
        from public.products p
        join public.product_commercial_config_versions cv
          on cv.id = p.current_commercial_config_version_id
        join public.commercial_variant_rules r
          on r.version_id = cv.id and r.variant_id = v.id
        join public.commercial_pricing_tiers t on t.rule_id = r.id
        where p.id = v.product_id
          and cv.version_number = 1
          and r.minimum_quantity = 1
          and r.quantity_step = 1
          and r.maximum_quantity is null
          and t.minimum_quantity = 1
          and t.unit_price = v.price
      ) then 'active'
    else 'draft'
  end,
  active = (
    v.active = true
    and v.definition_key is not null
    and exists (
      select 1
      from public.products p
      join public.product_commercial_config_versions cv
        on cv.id = p.current_commercial_config_version_id
      join public.commercial_variant_rules r
        on r.version_id = cv.id and r.variant_id = v.id
      join public.commercial_pricing_tiers t on t.rule_id = r.id
      where p.id = v.product_id
        and cv.version_number = 1
        and r.minimum_quantity = 1
        and r.quantity_step = 1
        and r.maximum_quantity is null
        and t.minimum_quantity = 1
        and t.unit_price = v.price
    )
  ),
  metadata = case
    when v.active = true and v.definition_key is not null then v.metadata - 'state44Blockers'
    else jsonb_set(
      v.metadata,
      '{state44Blockers}',
      '[{"code":"COMMERCIAL_CONFIG_INCOMPLETE","message":"Variant requires a validated State 44 commercial rule"}]'::jsonb,
      true
    )
  end
where v.id in ('a1', 'a2', 'horizontal', 'vertical', 'die-cut', 'fixed-shape', 'phone', 'standard');

update public.products p
set
  status = case
    when p.active = true
      and p.current_commercial_config_version_id is not null
      and exists (
        select 1
        from public.product_variants v
        where v.product_id = p.id and v.status = 'active'
      ) then 'active'
    else 'draft'
  end,
  active = (
    p.active = true
    and p.current_commercial_config_version_id is not null
    and exists (
      select 1 from public.product_variants v
      where v.product_id = p.id and v.status = 'active'
    )
  ),
  metadata = case
    when p.active = true
      and p.current_commercial_config_version_id is not null
      and exists (
        select 1 from public.product_variants v
        where v.product_id = p.id and v.status = 'active'
      ) then p.metadata - 'state44Blockers'
    else jsonb_set(
      p.metadata,
      '{state44Blockers}',
      '[{"code":"COMMERCIAL_CONFIG_INCOMPLETE","message":"Product requires a validated active commercial Variant rule"}]'::jsonb,
      true
    )
  end
where p.id in ('wrapping', 'card', 'sticker', 'notebook');

-- Legacy Orders remain historical snapshots. Only additive commercial/payment
-- fields are filled; total, unit_price, subtotal, currency, snapshots,
-- references, timestamps, and actors are never recomputed or replaced.
update public.orders o
set
  commercial_config_version_id = cv.id,
  payment_policy = '{"kind":"full_payment"}'::jsonb,
  amount_due_now = o.total,
  remaining_amount = 0,
  applied_tier_minimum_quantity = 1
from public.product_commercial_config_versions cv
where cv.product_id = o.product_snapshot->>'id'
  and cv.version_number = 1
  and cv.currency = 'VND'
  and o.commercial_config_version_id is null;

update public.orders
set
  payment_policy = coalesce(payment_policy, '{"kind":"full_payment"}'::jsonb),
  amount_due_now = coalesce(amount_due_now, total),
  remaining_amount = coalesce(remaining_amount, 0)
where payment_policy is null
   or amount_due_now is null
   or remaining_amount is null;

update public.order_payments
set purpose = 'full_order_payment'
where purpose is null or purpose <> 'full_order_payment';
