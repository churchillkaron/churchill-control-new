create table if not exists public.supplier_portal_accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text,
  business_name text,
  phone text,
  website text,
  business_organization_id uuid references public.organizations(id) on delete set null,
  storefront_enabled boolean not null default false,
  shop_discoverable boolean not null default false,
  shop_verified boolean not null default false,
  business_linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_portal_account_members (
  id uuid primary key default gen_random_uuid(),
  supplier_account_id uuid not null references public.supplier_portal_accounts(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'OWNER' check (role in ('OWNER','ADMIN','MEMBER')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUSPENDED','REVOKED')),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (supplier_account_id, auth_user_id)
);

create unique index if not exists supplier_portal_account_members_default_user_idx
  on public.supplier_portal_account_members(auth_user_id)
  where is_default = true and status = 'ACTIVE';

create table if not exists public.supplier_portal_account_relationships (
  id uuid primary key default gen_random_uuid(),
  supplier_account_id uuid not null references public.supplier_portal_accounts(id) on delete cascade,
  supplier_portal_access_id uuid not null unique references public.supplier_portal_access(id) on delete cascade,
  attached_by_auth_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (supplier_account_id, supplier_portal_access_id)
);

create table if not exists public.supplier_storefronts (
  id uuid primary key default gen_random_uuid(),
  supplier_account_id uuid not null unique references public.supplier_portal_accounts(id) on delete cascade,
  slug text not null unique,
  name text not null,
  headline text,
  description text,
  currency_code text not null default 'THB',
  status text not null default 'DRAFT' check (status in ('DRAFT','PUBLISHED','PAUSED')),
  allow_public_browse boolean not null default false,
  allow_customer_orders boolean not null default true,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.supplier_storefront_products (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references public.supplier_storefronts(id) on delete cascade,
  sku text,
  name text not null,
  description text,
  category text,
  uom text,
  base_price numeric(18,4) not null default 0 check (base_price >= 0),
  currency_code text not null default 'THB',
  minimum_order_quantity numeric(18,4) not null default 1 check (minimum_order_quantity > 0),
  lead_time_days integer not null default 0 check (lead_time_days >= 0),
  business_inventory_item_id uuid references public.inventory_items(id) on delete set null,
  business_sync_enabled boolean not null default false,
  last_business_sync_at timestamptz,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storefront_id, sku)
);

create table if not exists public.supplier_storefront_relationships (
  id uuid primary key default gen_random_uuid(),
  storefront_id uuid not null references public.supplier_storefronts(id) on delete cascade,
  supplier_portal_access_id uuid not null unique references public.supplier_portal_access(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_profile_id uuid not null references public.supplier_profiles(id) on delete cascade,
  supplier_party_id uuid not null references public.parties(id) on delete cascade,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','PAUSED','REVOKED')),
  customer_visible boolean not null default true,
  order_enabled boolean not null default true,
  pricing_mode text not null default 'BASE_PRICE' check (pricing_mode in ('BASE_PRICE','CUSTOM')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storefront_id, organization_id, supplier_profile_id)
);

create table if not exists public.supplier_storefront_product_terms (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.supplier_storefront_relationships(id) on delete cascade,
  product_id uuid not null references public.supplier_storefront_products(id) on delete cascade,
  customer_price numeric(18,4) check (customer_price is null or customer_price >= 0),
  currency_code text,
  minimum_order_quantity numeric(18,4) check (minimum_order_quantity is null or minimum_order_quantity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (relationship_id, product_id)
);

create table if not exists public.supplier_network_connection_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_account_id uuid not null references public.supplier_portal_accounts(id) on delete cascade,
  requested_by_auth_user_id uuid,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','DECLINED','CANCELLED')),
  buyer_note text,
  supplier_note text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, supplier_account_id)
);

create table if not exists public.supplier_network_customer_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  supplier_account_id uuid not null references public.supplier_portal_accounts(id) on delete cascade,
  supplier_party_id uuid not null references public.parties(id) on delete cascade,
  supplier_profile_id uuid not null references public.supplier_profiles(id) on delete cascade,
  supplier_portal_access_id uuid not null references public.supplier_portal_access(id) on delete cascade,
  connection_request_id uuid references public.supplier_network_connection_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, supplier_account_id),
  unique (supplier_portal_access_id)
);

create index if not exists supplier_storefront_products_storefront_idx
  on public.supplier_storefront_products(storefront_id, is_active, sort_order);
create unique index if not exists supplier_storefront_products_business_item_idx
  on public.supplier_storefront_products(storefront_id, business_inventory_item_id)
  where business_inventory_item_id is not null;
create index if not exists supplier_storefront_relationships_storefront_idx
  on public.supplier_storefront_relationships(storefront_id, status);
create index if not exists supplier_storefront_relationships_org_idx
  on public.supplier_storefront_relationships(organization_id, supplier_profile_id);
alter table public.supplier_portal_accounts enable row level security;
alter table public.supplier_portal_account_members enable row level security;
alter table public.supplier_portal_account_relationships enable row level security;
alter table public.supplier_storefronts enable row level security;
alter table public.supplier_storefront_products enable row level security;
alter table public.supplier_storefront_relationships enable row level security;
alter table public.supplier_storefront_product_terms enable row level security;
alter table public.supplier_network_connection_requests enable row level security;
alter table public.supplier_network_customer_links enable row level security;

revoke all on table public.supplier_portal_accounts from anon, authenticated;
revoke all on table public.supplier_portal_account_members from anon, authenticated;
revoke all on table public.supplier_portal_account_relationships from anon, authenticated;
revoke all on table public.supplier_storefronts from anon, authenticated;
revoke all on table public.supplier_storefront_products from anon, authenticated;
revoke all on table public.supplier_storefront_relationships from anon, authenticated;
revoke all on table public.supplier_storefront_product_terms from anon, authenticated;
revoke all on table public.supplier_network_connection_requests from anon, authenticated;
revoke all on table public.supplier_network_customer_links from anon, authenticated;

grant select, insert, update, delete on table public.supplier_portal_accounts to service_role;
grant select, insert, update, delete on table public.supplier_portal_account_members to service_role;
grant select, insert, update, delete on table public.supplier_portal_account_relationships to service_role;
grant select, insert, update, delete on table public.supplier_storefronts to service_role;
grant select, insert, update, delete on table public.supplier_storefront_products to service_role;
grant select, insert, update, delete on table public.supplier_storefront_relationships to service_role;
grant select, insert, update, delete on table public.supplier_storefront_product_terms to service_role;
grant select, insert, update, delete on table public.supplier_network_connection_requests to service_role;
grant select, insert, update, delete on table public.supplier_network_customer_links to service_role;

comment on table public.supplier_portal_accounts is
  'Supplier Network business profile. Login identities attach through supplier_portal_account_members; this profile may optionally link to an Avantiqo business organization.';
comment on table public.supplier_storefronts is
  'Supplier-owned customer-facing storefront managed through Supplier Portal.';
comment on table public.supplier_storefront_relationships is
  'Explicit bridge from one supplier storefront to one accepted customer-scoped supplier portal relationship.';