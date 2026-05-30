create table if not exists accounting_kpi_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  current_ratio numeric(14,4) default 0,
  quick_ratio numeric(14,4) default 0,
  gross_margin numeric(14,4) default 0,
  net_margin numeric(14,4) default 0,
  operating_cashflow numeric(14,2) default 0,
  working_capital numeric(14,2) default 0,
  created_at timestamptz default now()
);
