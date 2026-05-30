create table if not exists executive_kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  total_revenue numeric(14,2) default 0,
  total_cogs numeric(14,2) default 0,
  total_labor numeric(14,2) default 0,
  gross_profit numeric(14,2) default 0,
  net_profit numeric(14,2) default 0,
  net_margin numeric(14,2) default 0,
  inventory_value numeric(14,2) default 0,
  waste_value numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists executive_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  alert_type text not null,
  severity text default 'medium',
  alert_message text not null,
  resolved boolean default false,
  created_at timestamptz default now()
);

create table if not exists entity_profitability_rankings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  entity_name text not null,
  revenue numeric(14,2) default 0,
  net_profit numeric(14,2) default 0,
  margin numeric(14,2) default 0,
  ranking_position integer,
  created_at timestamptz default now()
);
