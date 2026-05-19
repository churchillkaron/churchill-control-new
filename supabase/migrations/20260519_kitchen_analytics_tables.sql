create table if not exists public.kitchen_ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  recommendations jsonb,
  generated_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists public.kitchen_predictive_alerts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  alerts jsonb,
  created_at timestamptz default now()
);

create table if not exists public.kitchen_daily_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  report_date date,
  total_tickets numeric default 0,
  total_items numeric default 0,
  completed_items numeric default 0,
  served_items numeric default 0,
  returned_items numeric default 0,
  rejected_items numeric default 0,
  cancelled_items numeric default 0,
  voided_items numeric default 0,
  average_prep_minutes numeric default 0,
  kitchen_score numeric default 0,
  kitchen_rating text,
  station_summary jsonb,
  created_at timestamptz default now()
);

create table if not exists public.kitchen_monthly_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  report_month numeric,
  report_year numeric,
  total_items numeric default 0,
  completed_items numeric default 0,
  served_items numeric default 0,
  returned_items numeric default 0,
  rejected_items numeric default 0,
  urgent_items numeric default 0,
  average_prep_minutes numeric default 0,
  kitchen_score numeric default 0,
  monthly_rating text,
  service_charge_level text,
  chef_performance jsonb,
  created_at timestamptz default now()
);

create table if not exists public.kitchen_payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  report_month numeric,
  report_year numeric,
  payroll_adjustments jsonb,
  created_at timestamptz default now()
);

create table if not exists public.kitchen_ownership_matrix (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  start_date timestamptz,
  end_date timestamptz,
  ownership_matrix jsonb,
  created_at timestamptz default now()
);

create table if not exists public.kitchen_disciplinary_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  start_date timestamptz,
  end_date timestamptz,
  disciplinary_report jsonb,
  created_at timestamptz default now()
);

create table if not exists public.kitchen_termination_risk_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  start_date timestamptz,
  end_date timestamptz,
  termination_report jsonb,
  created_at timestamptz default now()
);

create table if not exists public.kitchen_promotion_eligibility (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  start_date timestamptz,
  end_date timestamptz,
  promotion_report jsonb,
  created_at timestamptz default now()
);

create table if not exists public.kitchen_succession_planning (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  start_date timestamptz,
  end_date timestamptz,
  succession_report jsonb,
  created_at timestamptz default now()
);

create table if not exists public.kitchen_culture_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  start_date timestamptz,
  end_date timestamptz,
  culture_report jsonb,
  created_at timestamptz default now()
);

create table if not exists public.kitchen_psychological_stability (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  start_date timestamptz,
  end_date timestamptz,
  stability_report jsonb,
  created_at timestamptz default now()
);

create table if not exists public.kitchen_burnout_risk (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  start_date timestamptz,
  end_date timestamptz,
  burnout_report jsonb,
  created_at timestamptz default now()
);

create table if not exists public.kitchen_executive_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  start_date timestamptz,
  end_date timestamptz,
  total_items numeric default 0,
  completed_items numeric default 0,
  served_items numeric default 0,
  returned_items numeric default 0,
  rejected_items numeric default 0,
  cancelled_items numeric default 0,
  operational_score numeric default 0,
  service_charge_projection text,
  executive_decision text,
  executive_message text,
  created_at timestamptz default now()
);

create index if not exists idx_kitchen_daily_reports_tenant
on public.kitchen_daily_reports (tenant_id, report_date);

create index if not exists idx_kitchen_monthly_reports_tenant
on public.kitchen_monthly_reports (tenant_id, report_year, report_month);

create index if not exists idx_kitchen_payroll_adjustments_tenant
on public.kitchen_payroll_adjustments (tenant_id, report_year, report_month);

create index if not exists idx_kitchen_executive_reports_tenant
on public.kitchen_executive_reports (tenant_id);

create index if not exists idx_kitchen_predictive_alerts_tenant
on public.kitchen_predictive_alerts (tenant_id);

create index if not exists idx_kitchen_ai_recommendations_tenant
on public.kitchen_ai_recommendations (tenant_id);
