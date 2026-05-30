create table if not exists cost_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  allocation_type text,
  source_department text,
  target_department text,
  allocation_amount numeric(14,2),
  created_at timestamptz default now()
);

create table if not exists scenario_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  scenario_name text,
  projected_revenue numeric(14,2),
  projected_expenses numeric(14,2),
  projected_profit numeric(14,2),
  created_at timestamptz default now()
);

create table if not exists board_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  report_period text,
  executive_summary text,
  revenue numeric(14,2),
  expenses numeric(14,2),
  profit numeric(14,2),
  created_at timestamptz default now()
);
