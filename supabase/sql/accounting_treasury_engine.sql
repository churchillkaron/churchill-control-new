create table if not exists treasury_cash_forecasts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  forecast_period text not null,
  opening_cash numeric(14,2) default 0,
  projected_inflows numeric(14,2) default 0,
  projected_outflows numeric(14,2) default 0,
  projected_closing_cash numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists treasury_liquidity_risks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  risk_level text default 'low',
  liquidity_ratio numeric(14,4) default 0,
  projected_shortfall numeric(14,2) default 0,
  notes text,
  created_at timestamptz default now()
);
