create table if not exists regulatory_reporting_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  report_type text not null,
  reporting_period text not null,
  report_status text default 'generated',
  total_revenue numeric(14,2) default 0,
  total_tax numeric(14,2) default 0,
  net_profit numeric(14,2) default 0,
  generated_at timestamptz default now()
);

create table if not exists regulatory_filing_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  report_run_id uuid,
  filing_authority text not null,
  filing_reference text,
  filing_status text default 'pending',
  submitted_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists compliance_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  compliance_area text not null,
  compliance_score numeric(14,2) default 0,
  total_violations integer default 0,
  created_at timestamptz default now()
);
