create table if not exists fixed_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asset_name text not null,
  asset_category text,
  purchase_date date,
  purchase_cost numeric(14,2) default 0,
  useful_life_years integer default 5,
  salvage_value numeric(14,2) default 0,
  depreciation_method text default 'straight_line',
  created_at timestamptz default now()
);

create table if not exists depreciation_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  fixed_asset_id uuid references fixed_assets(id),
  depreciation_date date not null,
  depreciation_amount numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists tax_rates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  tax_name text not null,
  tax_percentage numeric(8,2) default 0,
  country text,
  created_at timestamptz default now()
);
