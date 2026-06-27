create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  item_id uuid not null,
  movement_type text not null,
  quantity numeric(14,4) not null default 0,
  unit_cost numeric(14,4) default 0,
  total_cost numeric(14,2) default 0,
  reference_type text,
  reference_id text,
  movement_date timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists inventory_stock_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  item_id uuid not null,
  quantity_on_hand numeric(14,4) default 0,
  inventory_value numeric(14,2) default 0,
  weighted_average_cost numeric(14,4) default 0,
  updated_at timestamptz default now()
);

create table if not exists inventory_reconciliation_variances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  item_id uuid not null,
  theoretical_quantity numeric(14,4) default 0,
  actual_quantity numeric(14,4) default 0,
  variance_quantity numeric(14,4) default 0,
  variance_value numeric(14,2) default 0,
  reconciliation_date timestamptz default now()
);
