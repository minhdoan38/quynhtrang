-- Migration: 0022_state45_integrity_constraints.sql
-- State 45: database-enforced integrity and immutable pointer checks.
-- Existing rows are not rewritten. Foreign keys added NOT VALID still enforce new writes.

-- Active design revision drafts: one editing/review draft per order.
create unique index if not exists design_revision_drafts_one_active_order
  on public.design_revision_drafts(order_id)
  where status in ('editing', 'ready_for_review');

-- Draft tables currently represent one open draft row; partial predicates preserve that
-- invariant while allowing future closed rows if lifecycle status is introduced.
create unique index if not exists template_drafts_one_active_template
  on public.template_drafts(template_id)
  where id is not null;

create unique index if not exists product_commercial_drafts_one_active_product
  on public.product_commercial_drafts(product_id)
  where id is not null;

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
