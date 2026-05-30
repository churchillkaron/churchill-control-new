create table if not exists budgeting_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  budget_name text not null,
  budget_period text not null,
  department text,
  planned_revenue numeric(14,2) default 0,
  planned_expenses numeric(14,2) default 0,
  planned_profit numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists budgeting_variances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  budget_id uuid not null,
  actual_revenue numeric(14,2) default 0,
  actual_expenses numeric(14,2) default 0,
  revenue_variance numeric(14,2) default 0,
  expense_variance numeric(14,2) default 0,
  profit_variance numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists financial_forecasts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  forecast_period text not null,
  projected_revenue numeric(14,2) default 0,
  projected_expenses numeric(14,2) default 0,
  projected_profit numeric(14,2) default 0,
  forecast_confidence numeric(14,2) default 0,
  created_at timestamptz default now()
);
