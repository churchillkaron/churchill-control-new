create table if not exists cashflow_forecasts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  forecast_period text not null,
  projected_inflow numeric(14,2) default 0,
  projected_outflow numeric(14,2) default 0,
  projected_net_cashflow numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists liquidity_analysis (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  current_ratio numeric(14,4) default 0,
  quick_ratio numeric(14,4) default 0,
  cash_ratio numeric(14,4) default 0,
  working_capital numeric(14,2) default 0,
  created_at timestamptz default now()
);
