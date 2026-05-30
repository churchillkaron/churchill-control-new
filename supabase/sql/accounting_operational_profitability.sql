create table if not exists labor_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  department text,
  labor_hours numeric(14,2) default 0,
  labor_cost numeric(14,2) default 0,
  revenue_generated numeric(14,2) default 0,
  labor_percentage numeric(14,4) default 0,
  created_at timestamptz default now()
);

create table if not exists operational_variances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  variance_type text not null,
  reference_id text,
  expected_amount numeric(14,2) default 0,
  actual_amount numeric(14,2) default 0,
  variance_amount numeric(14,2) default 0,
  variance_percentage numeric(14,4) default 0,
  created_at timestamptz default now()
);
