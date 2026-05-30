create table if not exists accounting_forecasts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  forecast_type text,
  forecast_period text,
  projected_amount numeric(14,2),
  created_at timestamptz default now()
);

create table if not exists accounting_risk_analysis (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  risk_type text,
  severity text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists fraud_detection_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  transaction_reference text,
  fraud_score numeric(5,2),
  status text,
  notes text,
  created_at timestamptz default now()
);

create table if not exists ai_finance_insights (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  insight_type text,
  title text,
  description text,
  severity text,
  created_at timestamptz default now()
);
