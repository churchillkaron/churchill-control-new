create table if not exists inventory_cost_layers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  item_id text not null,
  layer_type text not null,
  source_event_id text,
  quantity_remaining numeric(14,4) default 0,
  unit_cost numeric(14,4) default 0,
  total_cost numeric(14,2) default 0,
  received_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists inventory_valuation_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  item_id text not null,
  valuation_method text not null,
  total_quantity numeric(14,4) default 0,
  total_value numeric(14,2) default 0,
  average_cost numeric(14,4) default 0,
  snapshot_date timestamptz default now()
);
