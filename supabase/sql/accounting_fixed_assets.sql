create table if not exists fixed_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  asset_name text not null,
  asset_category text,
  acquisition_date date not null,
  acquisition_cost numeric(14,2) default 0,
  useful_life_months integer default 60,
  salvage_value numeric(14,2) default 0,
  accumulated_depreciation numeric(14,2) default 0,
  net_book_value numeric(14,2) default 0,
  asset_status text default 'active',
  created_at timestamptz default now()
);

create table if not exists fixed_asset_depreciation (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  asset_id uuid not null,
  depreciation_date date not null,
  depreciation_amount numeric(14,2) default 0,
  accumulated_depreciation numeric(14,2) default 0,
  remaining_book_value numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists fixed_asset_disposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  asset_id uuid not null,
  disposal_date date not null,
  disposal_amount numeric(14,2) default 0,
  gain_loss_amount numeric(14,2) default 0,
  created_at timestamptz default now()
);
