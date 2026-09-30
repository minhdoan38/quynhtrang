-- Migration: 0001_state37_core.sql
-- State 37: Supabase Backend Retrofit & Admin Orders Inbox

-- 1. Helper extensions
create extension if not exists "pgcrypto";

-- 2. Sequence & function for public order code generation
create sequence if not exists public.order_code_seq;

create or replace function public.generate_public_order_code()
returns text
language plpgsql
as $$
declare
  seq_val bigint;
  date_part text;
begin
  seq_val := nextval('public.order_code_seq');
  date_part := to_char(clock_timestamp(), 'YYMMDD');
  return 'QT' || date_part || '-' || lpad(seq_val::text, 4, '0');
end;
$$;

-- 3. Core tables
create table if not exists public.staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id text primary key,
  slug text not null unique,
  name text not null,
  product_type text not null,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_variants (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  name text not null,
  price integer not null check (price >= 0),
  metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.templates (
  id text primary key,
  product_id text references public.products(id) on delete set null,
  slug text unique,
  name text not null,
  published boolean not null default true,
  thumbnail_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id text not null references public.templates(id) on delete cascade,
  version integer not null,
  design_document jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint uq_template_version unique (template_id, version)
);

create table if not exists public.fonts (
  id text primary key,
  family_name text not null,
  google_font text,
  storage_path text,
  published boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sticker_assets (
  id text primary key,
  category text not null,
  tags text[] not null default '{}',
  storage_path text not null,
  thumbnail_path text,
  published boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete set null,
  guest_key_hash text,
  product_id text not null references public.products(id),
  variant_id text,
  status text not null default 'editing',
  current_working_revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  kind text not null,
  storage_bucket text not null,
  storage_path text not null unique,
  original_name text,
  mime_type text,
  byte_size integer,
  pixel_width integer,
  pixel_height integer,
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.design_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version_number integer not null,
  source text not null default 'customizer',
  design_document jsonb not null default '{}'::jsonb,
  product_snapshot jsonb not null default '{}'::jsonb,
  preflight_snapshot jsonb not null default '{}'::jsonb,
  preflight_revision text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint uq_project_version unique (project_id, version_number)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  public_order_code text not null unique default public.generate_public_order_code(),
  project_id uuid references public.projects(id) on delete set null,
  approved_design_version_id uuid references public.design_versions(id) on delete set null,
  product_snapshot jsonb not null default '{}'::jsonb,
  variant_snapshot jsonb not null default '{}'::jsonb,
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  subtotal integer not null check (subtotal >= 0),
  total integer not null check (total >= 0),
  currency text not null default 'VND',
  customer_full_name text not null,
  customer_phone text not null,
  customer_phone_normalized text not null,
  shipping_address text,
  payment_status text not null default 'pending_payment' check (payment_status in ('pending_payment', 'payment_reported', 'paid', 'payment_failed', 'cancelled')),
  design_status text not null default 'awaiting_review' check (design_status in ('awaiting_review', 'ready', 'editing', 'approved', 'needs_changes')),
  fulfillment_status text not null default 'unprocessed' check (fulfillment_status in ('unprocessed', 'ready_for_production', 'in_production', 'completed', 'cancelled')),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  provider text not null,
  amount integer not null check (amount >= 0),
  currency text not null default 'VND',
  reference text not null,
  qr_payload text,
  status text not null default 'pending_payment' check (status in ('pending_payment', 'payment_reported', 'paid', 'payment_failed', 'cancelled')),
  customer_reported_at timestamptz,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_role text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.guest_order_access (
  order_id uuid primary key references public.orders(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- 4. Order code trigger (fallback if code is empty)
create or replace function public.set_public_order_code()
returns trigger
language plpgsql
as $$
begin
  if new.public_order_code is null or new.public_order_code = '' then
    new.public_order_code := public.generate_public_order_code();
  end if;
  return new;
end;
$$;

drop trigger if exists trigger_set_public_order_code on public.orders;
create trigger trigger_set_public_order_code
  before insert on public.orders
  for each row
  execute function public.set_public_order_code();

-- 5. Updated_at trigger function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trigger_staff_roles_updated_at before update on public.staff_roles for each row execute function public.set_updated_at();
create trigger trigger_products_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger trigger_product_variants_updated_at before update on public.product_variants for each row execute function public.set_updated_at();
create trigger trigger_templates_updated_at before update on public.templates for each row execute function public.set_updated_at();
create trigger trigger_fonts_updated_at before update on public.fonts for each row execute function public.set_updated_at();
create trigger trigger_sticker_assets_updated_at before update on public.sticker_assets for each row execute function public.set_updated_at();
create trigger trigger_projects_updated_at before update on public.projects for each row execute function public.set_updated_at();
create trigger trigger_assets_updated_at before update on public.assets for each row execute function public.set_updated_at();
create trigger trigger_orders_updated_at before update on public.orders for each row execute function public.set_updated_at();
create trigger trigger_order_payments_updated_at before update on public.order_payments for each row execute function public.set_updated_at();

-- 6. Indexes
create index if not exists idx_orders_created_at on public.orders (created_at desc);
create index if not exists idx_orders_payment_status on public.orders (payment_status);
create index if not exists idx_orders_design_status on public.orders (design_status);
create index if not exists idx_orders_fulfillment_status on public.orders (fulfillment_status);
create index if not exists idx_orders_customer_phone_norm on public.orders (customer_phone_normalized);
create index if not exists idx_orders_project_id on public.orders (project_id);
create index if not exists idx_order_payments_order_id on public.order_payments (order_id);
create index if not exists idx_order_payments_status on public.order_payments (status);
create index if not exists idx_order_events_order_id_created on public.order_events (order_id, created_at desc);
create index if not exists idx_staff_roles_role on public.staff_roles (role);
create index if not exists idx_projects_owner_user on public.projects (owner_user_id);
create index if not exists idx_projects_created_at on public.projects (created_at desc);
create index if not exists idx_design_versions_project on public.design_versions (project_id);
create index if not exists idx_assets_project on public.assets (project_id);
create index if not exists idx_product_variants_product on public.product_variants (product_id);
create index if not exists idx_templates_product on public.templates (product_id);
create index if not exists idx_templates_published on public.templates (published);
create index if not exists idx_products_active on public.products (active);
create index if not exists idx_fonts_published on public.fonts (published);
create index if not exists idx_sticker_assets_published on public.sticker_assets (published);

-- 7. Staff check security function
create or replace function public.is_staff(required_role text default null)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.staff_roles sr
    where sr.user_id = auth.uid()
      and (
        required_role is null
        or sr.role = required_role
        or (required_role = 'editor' and sr.role in ('admin', 'editor'))
      )
  );
$$;

-- 8. Enable RLS on ALL tables
alter table public.staff_roles enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.templates enable row level security;
alter table public.template_versions enable row level security;
alter table public.fonts enable row level security;
alter table public.sticker_assets enable row level security;
alter table public.projects enable row level security;
alter table public.assets enable row level security;
alter table public.design_versions enable row level security;
alter table public.orders enable row level security;
alter table public.order_payments enable row level security;
alter table public.order_events enable row level security;
alter table public.guest_order_access enable row level security;

-- 9. Grants configuration
revoke all on table
  public.staff_roles,
  public.products,
  public.product_variants,
  public.templates,
  public.template_versions,
  public.fonts,
  public.sticker_assets,
  public.projects,
  public.assets,
  public.design_versions,
  public.orders,
  public.order_payments,
  public.order_events,
  public.guest_order_access
from public, anon, authenticated;

-- Allow anon and authenticated to read active/published catalog data
grant select on table
  public.products,
  public.product_variants,
  public.templates,
  public.template_versions,
  public.fonts,
  public.sticker_assets
to anon, authenticated;

-- Allow authenticated users to interact with staff & operational surfaces
grant select on table
  public.staff_roles,
  public.projects,
  public.assets,
  public.design_versions,
  public.orders,
  public.order_payments,
  public.order_events,
  public.guest_order_access
to authenticated;

grant insert, update, delete on table
  public.staff_roles,
  public.products,
  public.product_variants,
  public.templates,
  public.template_versions,
  public.fonts,
  public.sticker_assets,
  public.projects,
  public.assets,
  public.design_versions,
  public.orders,
  public.order_payments,
  public.order_events,
  public.guest_order_access
to authenticated;

grant usage on sequence public.order_code_seq to anon, authenticated;
grant execute on function public.is_staff(text) to anon, authenticated;
grant execute on function public.generate_public_order_code() to anon, authenticated;

-- 10. RLS Policies

-- 10.1 Products & variants (public catalog read)
create policy "Allow read active products"
  on public.products for select
  using (active = true or public.is_staff());

create policy "Allow admin manage products"
  on public.products for all
  using (public.is_staff('admin'))
  with check (public.is_staff('admin'));

create policy "Allow read active product variants"
  on public.product_variants for select
  using (active = true or public.is_staff());

create policy "Allow admin manage product variants"
  on public.product_variants for all
  using (public.is_staff('admin'))
  with check (public.is_staff('admin'));

-- 10.2 Templates & versions
create policy "Allow read published templates"
  on public.templates for select
  using (published = true or public.is_staff());

create policy "Allow staff manage templates"
  on public.templates for all
  using (public.is_staff('editor'))
  with check (public.is_staff('editor'));

create policy "Allow read published template versions"
  on public.template_versions for select
  using (
    exists (
      select 1 from public.templates t
      where t.id = template_versions.template_id
        and (t.published = true or public.is_staff())
    )
  );

create policy "Allow staff manage template versions"
  on public.template_versions for all
  using (public.is_staff('editor'))
  with check (public.is_staff('editor'));

-- 10.3 Fonts
create policy "Allow read published fonts"
  on public.fonts for select
  using (published = true or public.is_staff());

create policy "Allow admin manage fonts"
  on public.fonts for all
  using (public.is_staff('admin'))
  with check (public.is_staff('admin'));

-- 10.4 Sticker assets
create policy "Allow read published sticker assets"
  on public.sticker_assets for select
  using (published = true or public.is_staff());

create policy "Allow staff manage sticker assets"
  on public.sticker_assets for all
  using (public.is_staff('editor'))
  with check (public.is_staff('editor'));

-- 10.5 Staff roles
create policy "Allow staff view staff_roles"
  on public.staff_roles for select
  using (public.is_staff());

create policy "Allow admin manage staff_roles"
  on public.staff_roles for all
  using (public.is_staff('admin'))
  with check (public.is_staff('admin'));

-- 10.6 Projects
create policy "Allow read projects"
  on public.projects for select
  using (
    public.is_staff()
    or (auth.uid() is not null and owner_user_id = auth.uid())
  );

create policy "Allow manage projects"
  on public.projects for all
  using (
    public.is_staff()
    or (auth.uid() is not null and owner_user_id = auth.uid())
  )
  with check (
    public.is_staff()
    or (auth.uid() is not null and owner_user_id = auth.uid())
  );

-- 10.7 Assets
create policy "Allow staff read assets"
  on public.assets for select
  using (public.is_staff());

create policy "Allow staff manage assets"
  on public.assets for all
  using (public.is_staff())
  with check (public.is_staff());

-- 10.8 Design versions
create policy "Allow staff read design versions"
  on public.design_versions for select
  using (public.is_staff());

create policy "Allow staff manage design versions"
  on public.design_versions for all
  using (public.is_staff())
  with check (public.is_staff());

-- 10.9 Orders
create policy "Allow staff read orders"
  on public.orders for select
  using (public.is_staff());

create policy "Allow admin update orders"
  on public.orders for update
  using (public.is_staff('admin'))
  with check (public.is_staff('admin'));

-- 10.10 Order payments
create policy "Allow staff read order payments"
  on public.order_payments for select
  using (public.is_staff());

create policy "Allow admin insert order payments"
  on public.order_payments for insert
  with check (public.is_staff('admin'));

create policy "Allow admin update order payments"
  on public.order_payments for update
  using (public.is_staff('admin'))
  with check (public.is_staff('admin'));

-- 10.11 Order events
create policy "Allow staff read order events"
  on public.order_events for select
  using (public.is_staff());

create policy "Allow staff insert order events"
  on public.order_events for insert
  with check (public.is_staff());

-- 10.12 Guest order access
create policy "Allow staff manage guest access"
  on public.guest_order_access for all
  using (public.is_staff())
  with check (public.is_staff());
