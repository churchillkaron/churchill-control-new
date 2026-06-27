create table if not exists stock_count_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  count_name text not null,
  count_status text default 'open',
  counted_by text,
  finalized boolean default false,
  created_at timestamptz default now()
);

create table if not exists stock_count_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  session_id uuid not null,
  item_id uuid not null,
  theoretical_quantity numeric(14,4) default 0,
  actual_quantity numeric(14,4) default 0,
  variance_quantity numeric(14,4) default 0,
  variance_value numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists inventory_variance_analysis (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  item_id uuid not null,
  variance_type text,
  variance_quantity numeric(14,4) default 0,
  variance_value numeric(14,2) default 0,
  risk_level text default 'low',
  created_at timestamptz default now()
);
