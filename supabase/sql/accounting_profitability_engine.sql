create table if not exists cogs_journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  reference_type text,
  reference_id text,
  inventory_value numeric(14,2) default 0,
  cogs_value numeric(14,2) default 0,
  posted_at timestamptz default now()
);

create table if not exists profitability_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  reference_type text,
  reference_id text,
  revenue numeric(14,2) default 0,
  cogs numeric(14,2) default 0,
  labor_cost numeric(14,2) default 0,
  overhead_cost numeric(14,2) default 0,
  gross_profit numeric(14,2) default 0,
  net_profit numeric(14,2) default 0,
  net_margin numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists waste_analysis (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  item_id uuid,
  waste_quantity numeric(14,4) default 0,
  waste_value numeric(14,2) default 0,
  waste_reason text,
  created_at timestamptz default now()
);
