-- Migration: 0022_state45_integrity_constraints.sql
-- State 45: database-enforced integrity and immutable pointer checks.
-- Existing rows are not rewritten. Foreign keys added NOT VALID still enforce new writes.
-- Legacy duplicate drafts and duplicate pricing tiers are safely quarantined prior to creating unique indexes.

create table if not exists public.state45_integrity_quarantine (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  quarantined_id text not null,
  keeper_id text null,
  row_data jsonb not null,
  reason text not null,
  created_at timestamptz not null default clock_timestamp()
);

alter table public.state45_integrity_quarantine enable row level security;
revoke all on public.state45_integrity_quarantine from public, anon;
grant select on public.state45_integrity_quarantine to authenticated;

-- Pre-migration deduplication and quarantine check
do $$
declare
  v_dup record;
begin
  -- 1. Deduplicate active design revision drafts: keep newest, mark older as discarded.
  for v_dup in
    with ranked as (
      select
        id,
        order_id,
        to_jsonb(public.design_revision_drafts.*) as row_data,
        first_value(id) over (
          partition by order_id
          order by updated_at desc, id desc
        ) as keeper_id,
        row_number() over (
          partition by order_id
          order by updated_at desc, id desc
        ) as rn
      from public.design_revision_drafts
      where status in ('editing', 'ready_for_review')
    )
    select id, keeper_id, row_data
    from ranked
    where rn > 1
  loop
    insert into public.state45_integrity_quarantine (table_name, quarantined_id, keeper_id, row_data, reason)
    values ('design_revision_drafts', v_dup.id::text, v_dup.keeper_id::text, v_dup.row_data, 'duplicate_active_order_draft');

    update public.design_revision_drafts
    set status = 'discarded',
        reason = substring(reason || ' [quarantined duplicate]' from 1 for 500),
        updated_at = clock_timestamp()
    where id = v_dup.id;
  end loop;

  -- 2. Quarantine duplicate template drafts and reparent mutable assets.
  for v_dup in
    with ranked as (
      select
        id,
        template_id,
        to_jsonb(public.template_drafts.*) as row_data,
        first_value(id) over (
          partition by template_id
          order by updated_at desc, id desc
        ) as keeper_id,
        row_number() over (
          partition by template_id
          order by updated_at desc, id desc
        ) as rn
      from public.template_drafts
    )
    select id, keeper_id, row_data
    from ranked
    where rn > 1
  loop
    insert into public.state45_integrity_quarantine (table_name, quarantined_id, keeper_id, row_data, reason)
    values ('template_drafts', v_dup.id::text, v_dup.keeper_id::text, v_dup.row_data, 'duplicate_template_draft');

    update public.template_assets
    set draft_id = v_dup.keeper_id
    where draft_id = v_dup.id;

    delete from public.template_drafts
    where id = v_dup.id
      and not exists (
        select 1
        from public.template_validation_runs
        where draft_id = v_dup.id
      );

    insert into public.templates (id, name, status)
    select concat('quarantined-draft-', v_dup.id::text), 'Quarantined', 'archived'
    where exists (
      select 1
      from public.template_validation_runs
      where draft_id = v_dup.id
    )
    on conflict do nothing;

    update public.template_drafts
    set template_id = concat('quarantined-draft-', v_dup.id::text),
        based_on_version_id = null
    where id = v_dup.id
      and exists (
        select 1
        from public.template_validation_runs
        where draft_id = v_dup.id
      );
  end loop;

  -- 3. Deduplicate product commercial drafts: keep newest, delete duplicate.
  for v_dup in
    with ranked as (
      select
        id,
        product_id,
        to_jsonb(public.product_commercial_drafts.*) as row_data,
        first_value(id) over (
          partition by product_id
          order by updated_at desc, id desc
        ) as keeper_id,
        row_number() over (
          partition by product_id
          order by updated_at desc, id desc
        ) as rn
      from public.product_commercial_drafts
    )
    select id, keeper_id, row_data
    from ranked
    where rn > 1
  loop
    insert into public.state45_integrity_quarantine (table_name, quarantined_id, keeper_id, row_data, reason)
    values ('product_commercial_drafts', v_dup.id::text, v_dup.keeper_id::text, v_dup.row_data, 'duplicate_product_commercial_draft');

    delete from public.product_commercial_drafts
    where id = v_dup.id;
  end loop;

  -- 4. Deduplicate commercial pricing tiers: keep newest, delete duplicate.
  set local migration.allow_commercial_mutation = '1';

  for v_dup in
    with ranked as (
      select
        id,
        rule_id,
        minimum_quantity,
        to_jsonb(public.commercial_pricing_tiers.*) as row_data,
        first_value(id) over (
          partition by rule_id, minimum_quantity
          order by created_at desc, id desc
        ) as keeper_id,
        row_number() over (
          partition by rule_id, minimum_quantity
          order by created_at desc, id desc
        ) as rn
      from public.commercial_pricing_tiers
    )
    select id, keeper_id, row_data
    from ranked
    where rn > 1
  loop
    insert into public.state45_integrity_quarantine (table_name, quarantined_id, keeper_id, row_data, reason)
    values ('commercial_pricing_tiers', v_dup.id::text, v_dup.keeper_id::text, v_dup.row_data, 'duplicate_pricing_tier');

    delete from public.commercial_pricing_tiers
    where id = v_dup.id;
  end loop;
end
$$;

-- Active design revision drafts: one editing/review draft per order.
create unique index if not exists design_revision_drafts_one_active_order
  on public.design_revision_drafts(order_id)
  where status in ('editing', 'ready_for_review');

-- Draft tables represent one open draft row per template/product.
create unique index if not exists template_drafts_one_active_template
  on public.template_drafts(template_id);

create unique index if not exists product_commercial_drafts_one_active_product
  on public.product_commercial_drafts(product_id);

-- A rule cannot have two tiers starting at the same quantity.
create unique index if not exists commercial_pricing_tiers_rule_minimum_quantity
  on public.commercial_pricing_tiers(rule_id, minimum_quantity);
-- Composite parent key lets foreign keys prove that pointers belong to same project/product.
create unique index if not exists design_versions_project_id_id_key
  on public.design_versions(project_id, id);

-- Products.current_commercial_config_version_id must belong to that product.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.products'::regclass
      and contype = 'f'
      and pg_get_constraintdef(oid) like 'FOREIGN KEY (id, current_commercial_config_version_id)%'
  ) then
    alter table public.products
      add constraint fk_products_current_commercial_config_version_state45
      foreign key (id, current_commercial_config_version_id)
      references public.product_commercial_config_versions(product_id, id)
      on delete restrict;
  end if;
exception
  when duplicate_object then null;
end
$$;

-- Orders may only point at versions from their own project. NOT VALID keeps deployment
-- forward-compatible with any pre-existing invalid legacy pointers.
do $$
begin
  alter table public.orders
    add constraint orders_customer_design_version_project_fk_state45
    foreign key (project_id, customer_approved_design_version_id)
    references public.design_versions(project_id, id)
    on delete restrict
    not valid;
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  alter table public.orders
    add constraint orders_production_design_version_project_fk_state45
    foreign key (project_id, production_design_version_id)
    references public.design_versions(project_id, id)
    on delete restrict
    not valid;
exception
  when duplicate_object then null;
end
$$;
