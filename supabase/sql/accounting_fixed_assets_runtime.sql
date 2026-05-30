create table if not exists fixed_asset_register (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asset_code text not null,
  asset_name text not null,
  asset_category text,
  acquisition_date date not null,
  acquisition_cost numeric(14,2) default 0,
  useful_life_months integer default 60,
  salvage_value numeric(14,2) default 0,
  depreciation_method text default 'straight_line',
  accumulated_depreciation numeric(14,2) default 0,
  carrying_value numeric(14,2) default 0,
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists fixed_asset_depreciation_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asset_id uuid not null,
  depreciation_date date not null,
  depreciation_amount numeric(14,2) default 0,
  journal_entry_id uuid,
  created_at timestamptz default now()
);
