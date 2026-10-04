-- State 44 catalog backfill and commercial v1 verification tests
-- Run inside transaction with automatic rollback
-- Safe for execution after 0010 and 0011 migrations

begin;

do $$
declare
  v_prod_count integer;
  v_var_count integer;
  v_conf_count integer;
  v_rule_count integer;
  v_tier_count integer;
  v_order_count integer;
  v_unmapped_variants integer;
  v_inactive_products integer;
  v_invalid_order_payments integer;
  v_order_payment_purposes integer;
begin
  -- 1. Assert all 4 canonical products exist and have active status with current commercial version
  select count(*) into v_prod_count
  from public.products
  where id in ('wrapping', 'card', 'sticker', 'notebook')
    and status = 'active'
    and active = true
    and current_commercial_config_version_id is not null;

  if v_prod_count <> 4 then
    raise exception 'Expected 4 active canonical products with commercial configs, found %', v_prod_count;
  end if;

  -- 2. Assert all 8 canonical variants exist and have active status with definition_key
  select count(*) into v_var_count
  from public.product_variants
  where id in ('a1', 'a2', 'horizontal', 'vertical', 'die-cut', 'fixed-shape', 'phone', 'standard')
    and status = 'active'
    and active = true
    and definition_key in (
      'wrapping:a1', 'wrapping:a2',
      'card:horizontal', 'card:vertical',
      'sticker:die-cut', 'sticker:fixed-shape', 'sticker:phone',
      'notebook:standard'
    );

  if v_var_count <> 8 then
    raise exception 'Expected 8 active canonical variants with valid definition_keys, found %', v_var_count;
  end if;

  -- 3. Assert definition keys match exact expected mapping
  select count(*) into v_unmapped_variants
  from (values
    ('a1', 'wrapping:a1'),
    ('a2', 'wrapping:a2'),
    ('horizontal', 'card:horizontal'),
    ('vertical', 'card:vertical'),
    ('die-cut', 'sticker:die-cut'),
    ('fixed-shape', 'sticker:fixed-shape'),
    ('phone', 'sticker:phone'),
    ('standard', 'notebook:standard')
  ) as expected(v_id, def_key)
  where not exists (
    select 1 from public.product_variants pv
    where pv.id = expected.v_id and pv.definition_key = expected.def_key
  );

  if v_unmapped_variants <> 0 then
    raise exception 'Found % variants with mismatched definition_key', v_unmapped_variants;
  end if;

  -- 4. Assert Commercial Config Version 1 exists for all 4 products with full_payment
  select count(*) into v_conf_count
  from public.product_commercial_config_versions
  where product_id in ('wrapping', 'card', 'sticker', 'notebook')
    and version_number = 1
    and currency = 'VND'
    and payment_policy = '{"kind": "full_payment"}'::jsonb;

  if v_conf_count <> 4 then
    raise exception 'Expected 4 commercial config v1 rows with full_payment, found %', v_conf_count;
  end if;

  -- 5. Assert rules and tiers exist for all 8 variants with min=1, step=1, tier=1 matching legacy variant price
  select count(*) into v_tier_count
  from public.product_commercial_config_versions cv
  join public.commercial_variant_rules r on r.version_id = cv.id
  join public.commercial_pricing_tiers t on t.rule_id = r.id
  join public.product_variants pv on pv.id = r.variant_id
  where cv.product_id in ('wrapping', 'card', 'sticker', 'notebook')
    and cv.version_number = 1
    and r.minimum_quantity = 1
    and r.quantity_step = 1
    and r.maximum_quantity is null
    and t.minimum_quantity = 1
    and t.unit_price = pv.price;

  if v_tier_count <> 8 then
    raise exception 'Expected 8 commercial tiers matching variant prices, found %', v_tier_count;
  end if;

  -- 6. Assert legacy orders have normalized commercial fields without changing totals
  select count(*) into v_order_count
  from public.orders
  where commercial_config_version_id is not null
    and payment_policy = '{"kind": "full_payment"}'::jsonb
    and amount_due_now = total
    and remaining_amount = 0
    and applied_tier_minimum_quantity = 1;

  -- If any orders exist in the database, all of them must have valid commercial snapshots
  if exists (select 1 from public.orders) then
    select count(*) into v_invalid_order_payments
    from public.orders
    where commercial_config_version_id is null
       or payment_policy is null
       or amount_due_now is null
       or remaining_amount is null
       or amount_due_now <> total
       or remaining_amount <> 0;

    if v_invalid_order_payments <> 0 then
      raise exception 'Found % legacy orders with unmigrated or corrupted commercial amounts', v_invalid_order_payments;
    end if;
  end if;

  -- 7. Assert order_payments purpose is full_order_payment for all legacy payments
  select count(*) into v_order_payment_purposes
  from public.order_payments
  where purpose is null or purpose <> 'full_order_payment';

  if v_order_payment_purposes <> 0 then
    raise exception 'Found % order payments without purpose full_order_payment', v_order_payment_purposes;
  end if;

  -- 8. Assert fail-closed blocker behavior on an incomplete variant
  -- Insert a temporary unconfigured variant and run backfill logic
  insert into public.product_variants (id, product_id, name, price, active, status, definition_key)
  values ('test-orphan-var', 'card', 'Biến thể mồ côi', 10000, true, 'draft', null);

  -- When active=true but definition_key is null or no rule exists, it must become 'draft' with state44Blockers
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
        ) then 'active'
      else 'draft'
    end,
    metadata = case
      when v.active = true and v.definition_key is not null then v.metadata - 'state44Blockers'
      else jsonb_set(
        coalesce(v.metadata, '{}'::jsonb),
        '{state44Blockers}',
        '[{"code":"COMMERCIAL_CONFIG_INCOMPLETE","message":"Variant requires a validated State 44 commercial rule"}]'::jsonb,
        true
      )
    end
  where v.id = 'test-orphan-var';

  if not exists (
    select 1 from public.product_variants
    where id = 'test-orphan-var'
      and status = 'draft'
      and metadata->'state44Blockers' is not null
  ) then
    raise exception 'Expected test-orphan-var to have status draft and state44Blockers';
  end if;

end $$;

rollback;
