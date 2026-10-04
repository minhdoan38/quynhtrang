-- Migration: 0010_state44_catalog_commercial.sql
-- State 44: Product Catalog, Variant Lifecycle, Immutable Commercial Versions, Drafts, Quotes & Order Snapshots

-- 1. Extend products table with lifecycle, revision, and placeholder for current commercial config version
alter table public.products
  add column if not exists status text not null default 'draft',
  add column if not exists revision bigint not null default 1,
  add column if not exists current_commercial_config_version_id uuid null;

alter table public.products drop constraint if exists products_status_check;
alter table public.products add constraint products_status_check check (status in ('draft', 'active', 'archived'));

create index if not exists idx_products_status on public.products(status);

-- 2. Extend product_variants table with lifecycle, definition_key, and revision
alter table public.product_variants
  add column if not exists status text not null default 'draft',
  add column if not exists definition_key text null,
  add column if not exists revision bigint not null default 1;

alter table public.product_variants drop constraint if exists product_variants_status_check;
alter table public.product_variants add constraint product_variants_status_check check (status in ('draft', 'active', 'archived'));

alter table public.product_variants drop constraint if exists product_variants_definition_key_check;
alter table public.product_variants add constraint product_variants_definition_key_check
  check (
    definition_key is null or definition_key in (
      'wrapping:a1',
      'wrapping:a2',
      'card:horizontal',
      'card:vertical',
      'sticker:die-cut',
      'sticker:fixed-shape',
      'sticker:phone',
      'notebook:standard'
    )
  );

create index if not exists idx_product_variants_status on public.product_variants(status);
create index if not exists idx_product_variants_definition_key on public.product_variants(definition_key);

-- 3. Product Commercial Config Versions Table (Immutable header)
create table if not exists public.product_commercial_config_versions (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete restrict,
  version_number integer not null check (version_number >= 1),
  currency text not null default 'VND' check (currency = 'VND'),
  payment_policy jsonb not null,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  constraint uq_product_commercial_config_versions_version unique (product_id, version_number),
  constraint uq_product_commercial_config_versions_product_id_id unique (product_id, id),
  constraint product_commercial_payment_policy_check check (
    jsonb_typeof(payment_policy) = 'object'
    and payment_policy ? 'kind'
    and (
      (payment_policy->>'kind' = 'full_payment')
      or (
        payment_policy->>'kind' = 'fixed_deposit'
        and (payment_policy->>'depositAmount') ~ '^[0-9]+$'
        and (payment_policy->>'depositAmount')::numeric >= 0
      )
    )
  )
);

create index if not exists idx_product_commercial_config_versions_product
  on public.product_commercial_config_versions(product_id, version_number desc);

-- Link products.current_commercial_config_version_id via composite same-product foreign key
alter table public.products drop constraint if exists fk_products_current_commercial_config_version;
alter table public.products add constraint fk_products_current_commercial_config_version
  foreign key (id, current_commercial_config_version_id)
  references public.product_commercial_config_versions(product_id, id)
  on delete restrict;

-- 4. Commercial Variant Rules Table (Lattice & step bounds)
create table if not exists public.commercial_variant_rules (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.product_commercial_config_versions(id) on delete restrict,
  variant_id text not null,
  minimum_quantity integer not null check (minimum_quantity >= 1),
  quantity_step integer not null check (quantity_step >= 1),
  maximum_quantity integer null check (maximum_quantity is null or maximum_quantity >= minimum_quantity),
  created_at timestamptz not null default clock_timestamp(),
  constraint uq_commercial_variant_rules_version_variant unique (version_id, variant_id)
);

create index if not exists idx_commercial_variant_rules_version
  on public.commercial_variant_rules(version_id);
create index if not exists idx_commercial_variant_rules_variant
  on public.commercial_variant_rules(variant_id);

-- 5. Commercial Pricing Tiers Table (Strictly positive integer thresholds & unit prices)
create table if not exists public.commercial_pricing_tiers (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.commercial_variant_rules(id) on delete restrict,
  minimum_quantity integer not null check (minimum_quantity >= 1),
  unit_price integer not null check (unit_price > 0),
  created_at timestamptz not null default clock_timestamp(),
  constraint uq_commercial_pricing_tiers_rule_quantity unique (rule_id, minimum_quantity)
);

create index if not exists idx_commercial_pricing_tiers_rule
  on public.commercial_pricing_tiers(rule_id, minimum_quantity asc);

-- 6. Product Commercial Drafts Table (One open draft per product)
create table if not exists public.product_commercial_drafts (
  id uuid primary key default gen_random_uuid(),
  product_id text not null unique references public.products(id) on delete cascade,
  base_version_id uuid null,
  revision bigint not null default 1 check (revision >= 1),
  payload jsonb not null default '{}'::jsonb,
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint fk_product_commercial_drafts_base_version
    foreign key (product_id, base_version_id)
    references public.product_commercial_config_versions(product_id, id)
    on delete set null
);

create index if not exists idx_product_commercial_drafts_author
  on public.product_commercial_drafts(author_id);

drop trigger if exists trigger_product_commercial_drafts_updated_at on public.product_commercial_drafts;
create trigger trigger_product_commercial_drafts_updated_at
  before update on public.product_commercial_drafts
  for each row execute function public.set_updated_at();

-- 7. Price Quotes Table (Short-lived server-authoritative checkout quote)
create table if not exists public.price_quotes (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete restrict,
  variant_id text not null,
  commercial_config_version_id uuid not null references public.product_commercial_config_versions(id) on delete restrict,
  quantity integer not null check (quantity >= 1),
  calculation jsonb not null,
  checkout_key_hash text not null,
  expires_at timestamptz not null,
  consumed_order_id uuid null references public.orders(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  constraint fk_price_quotes_product_variant
    foreign key (product_id, variant_id)
    references public.product_variants(product_id, id)
    on delete restrict,
  constraint fk_price_quotes_version_rule
    foreign key (commercial_config_version_id, variant_id)
    references public.commercial_variant_rules(version_id, variant_id)
    on delete restrict
);

create index if not exists idx_price_quotes_lookup
  on public.price_quotes(product_id, variant_id, expires_at desc);
create index if not exists idx_price_quotes_consumed_order
  on public.price_quotes(consumed_order_id) where consumed_order_id is not null;
create index if not exists idx_price_quotes_checkout_key
  on public.price_quotes(checkout_key_hash);

-- 8. Order Snapshot Columns (Preserving total, unit_price, subtotal, snapshots)
alter table public.orders
  add column if not exists commercial_config_version_id uuid null references public.product_commercial_config_versions(id) on delete restrict,
  add column if not exists payment_policy jsonb null,
  add column if not exists deposit_amount integer null check (deposit_amount is null or deposit_amount >= 0),
  add column if not exists amount_due_now integer null check (amount_due_now is null or amount_due_now >= 0),
  add column if not exists remaining_amount integer null check (remaining_amount is null or remaining_amount >= 0),
  add column if not exists applied_tier_minimum_quantity integer null check (applied_tier_minimum_quantity is null or applied_tier_minimum_quantity >= 1);

create index if not exists idx_orders_commercial_version
  on public.orders(commercial_config_version_id);

-- 9. Extend order_payments table with purpose and update uniqueness safely
alter table public.order_payments
  add column if not exists purpose text not null default 'full_order_payment';

-- Update all existing rows explicitly to full_order_payment before adding constraint
update public.order_payments
set purpose = 'full_order_payment'
where purpose is null or purpose <> 'full_order_payment';

alter table public.order_payments drop constraint if exists order_payments_purpose_check;
alter table public.order_payments add constraint order_payments_purpose_check
  check (purpose in ('checkout_deposit', 'full_order_payment'));

-- Replace one-row-per-order unique constraint with composite (order_id, purpose)
alter table public.order_payments drop constraint if exists uq_order_payments_order_purpose;
alter table public.order_payments add constraint uq_order_payments_order_purpose unique (order_id, purpose);

alter table public.order_payments drop constraint if exists order_payments_order_id_key;

create index if not exists idx_order_payments_order_purpose
  on public.order_payments(order_id, purpose);

-- 10. Immutability Triggers for Published Commercial Versions, Rules, and Tiers
create or replace function public.reject_commercial_version_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_setting('migration.allow_commercial_mutation', true) = '1' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  raise exception 'IMMUTABLE_COMMERCIAL_VERSION' using errcode = 'P0001';
end;
$$;

drop trigger if exists trigger_reject_commercial_version_mutation on public.product_commercial_config_versions;
create trigger trigger_reject_commercial_version_mutation
  before update or delete on public.product_commercial_config_versions
  for each row execute function public.reject_commercial_version_mutation();

create or replace function public.reject_commercial_rule_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_setting('migration.allow_commercial_mutation', true) = '1' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  raise exception 'IMMUTABLE_COMMERCIAL_RULE' using errcode = 'P0001';
end;
$$;

drop trigger if exists trigger_reject_commercial_rule_mutation on public.commercial_variant_rules;
create trigger trigger_reject_commercial_rule_mutation
  before update or delete on public.commercial_variant_rules
  for each row execute function public.reject_commercial_rule_mutation();

create or replace function public.reject_commercial_tier_mutation()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_setting('migration.allow_commercial_mutation', true) = '1' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  raise exception 'IMMUTABLE_COMMERCIAL_TIER' using errcode = 'P0001';
end;
$$;

drop trigger if exists trigger_reject_commercial_tier_mutation on public.commercial_pricing_tiers;
create trigger trigger_reject_commercial_tier_mutation
  before update or delete on public.commercial_pricing_tiers
  for each row execute function public.reject_commercial_tier_mutation();

-- 11. Structural Immutability Trigger for Products and Product Variants
create or replace function public.enforce_product_structural_immutability()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_has_history boolean;
begin
  if current_setting('migration.allow_commercial_mutation', true) = '1' then
    return new;
  end if;

  if tg_table_name = 'products' then
    -- Check if product has sold orders, projects, or templates
    select exists (
      select 1 from public.orders o
      where o.product_snapshot->>'id' = old.id
      union all
      select 1 from public.projects p
      where p.product_id = old.id
      union all
      select 1 from public.templates t
      where t.product_id = old.id
    ) into v_has_history;

    if v_has_history then
      -- Structural identity (id, product_type) cannot be changed once referenced in history
      if new.id is distinct from old.id or new.product_type is distinct from old.product_type then
        raise exception 'IMMUTABLE_PRODUCT_STRUCTURAL_IDENTITY' using errcode = 'P0001';
      end if;
    end if;
  elsif tg_table_name = 'product_variants' then
    select exists (
      select 1 from public.orders o
      where o.variant_snapshot->>'id' = old.id
         or o.product_snapshot->>'variantId' = old.id
      union all
      select 1 from public.projects p
      where p.variant_id = old.id
      union all
      select 1 from public.templates t
      where t.variant_id = old.id
    ) into v_has_history;

    if v_has_history then
      -- Structural identity (id, product_id, definition_key) cannot be changed once referenced
      if new.id is distinct from old.id
        or new.product_id is distinct from old.product_id
        or (old.definition_key is not null and new.definition_key is distinct from old.definition_key) then
        raise exception 'IMMUTABLE_VARIANT_STRUCTURAL_IDENTITY' using errcode = 'P0001';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trigger_products_structural_immutability on public.products;
create trigger trigger_products_structural_immutability
  before update on public.products
  for each row execute function public.enforce_product_structural_immutability();

drop trigger if exists trigger_product_variants_structural_immutability on public.product_variants;
create trigger trigger_product_variants_structural_immutability
  before update on public.product_variants
  for each row execute function public.enforce_product_structural_immutability();

-- 12. Row Level Security & Access Grants
alter table public.product_commercial_config_versions enable row level security;
alter table public.commercial_variant_rules enable row level security;
alter table public.commercial_pricing_tiers enable row level security;
alter table public.product_commercial_drafts enable row level security;
alter table public.price_quotes enable row level security;

-- Revoke all direct writes by default
revoke insert, update, delete on table
  public.products,
  public.product_variants,
  public.product_commercial_config_versions,
  public.commercial_variant_rules,
  public.commercial_pricing_tiers,
  public.product_commercial_drafts,
  public.price_quotes
from public, anon, authenticated;

-- Public / Anonymous projection policies
-- Products: Anon and customer read sellable products (active with active current version)
drop policy if exists "Allow read active products" on public.products;
create policy "Allow read active products"
  on public.products for select
  using (
    status = 'active'
    or active = true
    or public.is_staff('editor')
  );

drop policy if exists "Allow read active product variants" on public.product_variants;
create policy "Allow read active product variants"
  on public.product_variants for select
  using (
    status = 'active'
    or active = true
    or public.is_staff('editor')
  );

-- Commercial config versions: Anon reads current published version of active products or staff reads all
drop policy if exists "Read current commercial config versions or staff" on public.product_commercial_config_versions;
create policy "Read current commercial config versions or staff"
  on public.product_commercial_config_versions for select
  using (
    public.is_staff('editor')
    or exists (
      select 1 from public.products p
      where p.current_commercial_config_version_id = product_commercial_config_versions.id
        and (p.status = 'active' or p.active = true)
    )
  );

-- Variant rules: Anon reads rules of visible commercial versions
drop policy if exists "Read commercial variant rules for visible versions" on public.commercial_variant_rules;
create policy "Read commercial variant rules for visible versions"
  on public.commercial_variant_rules for select
  using (
    public.is_staff('editor')
    or exists (
      select 1 from public.product_commercial_config_versions v
      join public.products p on p.current_commercial_config_version_id = v.id
      where v.id = commercial_variant_rules.version_id
        and (p.status = 'active' or p.active = true)
    )
  );

-- Pricing tiers: Anon reads tiers for visible rules
drop policy if exists "Read commercial pricing tiers for visible rules" on public.commercial_pricing_tiers;
create policy "Read commercial pricing tiers for visible rules"
  on public.commercial_pricing_tiers for select
  using (
    public.is_staff('editor')
    or exists (
      select 1 from public.commercial_variant_rules r
      join public.product_commercial_config_versions v on v.id = r.version_id
      join public.products p on p.current_commercial_config_version_id = v.id
      where r.id = commercial_pricing_tiers.rule_id
        and (p.status = 'active' or p.active = true)
    )
  );

-- Commercial drafts: Strictly staff editor/admin (Editor reads operationally permitted, anon denied)
drop policy if exists "Staff read commercial drafts" on public.product_commercial_drafts;
create policy "Staff read commercial drafts"
  on public.product_commercial_drafts for select
  using (public.is_staff('editor'));

-- Price quotes: Anon and authenticated read unexpired or owned quotes
drop policy if exists "Read price quotes" on public.price_quotes;
create policy "Read price quotes"
  on public.price_quotes for select
  using (
    public.is_staff('editor')
    or expires_at > clock_timestamp()
  );

-- Explicit SELECT grants
grant select on table
  public.products,
  public.product_variants,
  public.product_commercial_config_versions,
  public.commercial_variant_rules,
  public.commercial_pricing_tiers,
  public.product_commercial_drafts,
  public.price_quotes
to anon, authenticated;

-- Revoke drafts from anon explicitly
revoke select on table public.product_commercial_drafts from anon;

-- 13. Admin Controlled RPCs (catalog_set_status, validate_definition_key)
create or replace function public.catalog_set_product_status(
  p_product_id text,
  p_status text,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_product record;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập');
  end if;

  select role into v_role from public.staff_roles where user_id = v_actor;
  if v_role is null or v_role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Chỉ quản trị viên mới có quyền thay đổi trạng thái sản phẩm');
  end if;

  if p_status not in ('draft', 'active', 'archived') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Trạng thái không hợp lệ');
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Không tìm thấy sản phẩm');
  end if;

  if p_expected_revision is not null and v_product.revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT', 'message', 'Phiên bản chỉnh sửa đã thay đổi');
  end if;

  -- Activation validation gate
  if p_status = 'active' then
    if v_product.current_commercial_config_version_id is null then
      return jsonb_build_object('ok', false, 'code', 'MISSING_COMMERCIAL_CONFIG', 'message', 'Sản phẩm chưa có cấu hình thương mại');
    end if;
    -- Require at least one active variant with valid definition_key
    if not exists (
      select 1 from public.product_variants
      where product_id = p_product_id
        and status = 'active'
        and definition_key is not null
    ) then
      return jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_VARIANTS', 'message', 'Sản phẩm phải có ít nhất một biến thể đang kích hoạt với definition_key hợp lệ');
    end if;
  end if;

  update public.products
  set
    status = p_status,
    active = (p_status = 'active'),
    revision = v_product.revision + 1,
    updated_at = clock_timestamp()
  where id = p_product_id;

  return jsonb_build_object(
    'ok', true,
    'productId', p_product_id,
    'status', p_status,
    'revision', v_product.revision + 1
  );
end;
$$;

create or replace function public.catalog_set_variant_status(
  p_variant_id text,
  p_status text,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_variant record;
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED', 'message', 'Yêu cầu đăng nhập');
  end if;

  select role into v_role from public.staff_roles where user_id = v_actor;
  if v_role is null or v_role <> 'admin' then
    return jsonb_build_object('ok', false, 'code', 'FORBIDDEN', 'message', 'Chỉ quản trị viên mới có quyền thay đổi trạng thái biến thể');
  end if;

  if p_status not in ('draft', 'active', 'archived') then
    return jsonb_build_object('ok', false, 'code', 'INVALID_STATUS', 'message', 'Trạng thái không hợp lệ');
  end if;

  select * into v_variant from public.product_variants where id = p_variant_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'NOT_FOUND', 'message', 'Không tìm thấy biến thể');
  end if;

  if p_expected_revision is not null and v_variant.revision <> p_expected_revision then
    return jsonb_build_object('ok', false, 'code', 'REVISION_CONFLICT', 'message', 'Phiên bản chỉnh sửa đã thay đổi');
  end if;

  -- Activation gate: definition_key must be present and known
  if p_status = 'active' then
    if v_variant.definition_key is null then
      return jsonb_build_object('ok', false, 'code', 'MISSING_DEFINITION_KEY', 'message', 'Biến thể chưa được gắn definition_key');
    end if;

    if v_variant.definition_key not in (
      'wrapping:a1',
      'wrapping:a2',
      'card:horizontal',
      'card:vertical',
      'sticker:die-cut',
      'sticker:fixed-shape',
      'sticker:phone',
      'notebook:standard'
    ) then
      return jsonb_build_object('ok', false, 'code', 'UNKNOWN_DEFINITION_KEY', 'message', 'Definition_key không thuộc danh mục hỗ trợ');
    end if;
  end if;

  update public.product_variants
  set
    status = p_status,
    active = (p_status = 'active'),
    revision = v_variant.revision + 1,
    updated_at = clock_timestamp()
  where id = p_variant_id;

  return jsonb_build_object(
    'ok', true,
    'variantId', p_variant_id,
    'status', p_status,
    'revision', v_variant.revision + 1
  );
end;
$$;

revoke all on function public.catalog_set_product_status(text, text, bigint) from public, anon;
grant execute on function public.catalog_set_product_status(text, text, bigint) to authenticated;

revoke all on function public.catalog_set_variant_status(text, text, bigint) from public, anon;
grant execute on function public.catalog_set_variant_status(text, text, bigint) to authenticated;
