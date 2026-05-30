create table if not exists financial_forecasts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  forecast_type text not null,
  forecast_period text not null,
  projected_revenue numeric(14,2) default 0,
  projected_expenses numeric(14,2) default 0,
  projected_profit numeric(14,2) default 0,
  confidence_score numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists financial_forecast_scenarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  scenario_name text not null,
  revenue_change_percent numeric(14,2) default 0,
  expense_change_percent numeric(14,2) default 0,
  projected_profit_impact numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists executive_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  decision_type text not null,
  decision_priority text default 'medium',
  recommendation text not null,
  projected_financial_impact numeric(14,2) default 0,
  decision_status text default 'recommended',
  created_at timestamptz default now()
);
