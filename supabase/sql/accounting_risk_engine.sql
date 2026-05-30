create table if not exists accounting_anomalies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  anomaly_type text not null,
  severity text default 'medium',
  reference_id text,
  expected_value numeric(14,2),
  actual_value numeric(14,2),
  variance numeric(14,2),
  notes text,
  created_at timestamptz default now()
);

create table if not exists accounting_risk_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  operational_risk numeric(14,2) default 0,
  liquidity_risk numeric(14,2) default 0,
  accounting_risk numeric(14,2) default 0,
  fraud_risk numeric(14,2) default 0,
  overall_risk numeric(14,2) default 0,
  created_at timestamptz default now()
);
