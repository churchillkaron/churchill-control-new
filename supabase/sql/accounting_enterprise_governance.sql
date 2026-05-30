create table if not exists treasury_positions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  bank_account text,
  currency text,
  balance numeric(14,2),
  created_at timestamptz default now()
);

create table if not exists covenant_checks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  covenant_name text,
  threshold_value numeric(14,2),
  actual_value numeric(14,2),
  status text,
  created_at timestamptz default now()
);

create table if not exists esg_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  reporting_period text,
  environmental_score numeric(8,2),
  social_score numeric(8,2),
  governance_score numeric(8,2),
  created_at timestamptz default now()
);

create table if not exists capital_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  investment_name text,
  projected_roi numeric(8,2),
  investment_amount numeric(14,2),
  payback_period_months integer,
  created_at timestamptz default now()
);
