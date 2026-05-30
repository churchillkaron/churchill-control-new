create table if not exists attendance_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  staff_id uuid not null,
  shift_name text,
  check_in timestamptz,
  check_out timestamptz,
  minutes_late integer default 0,
  attendance_status text default 'present',
  created_at timestamptz default now()
);

create table if not exists service_charge_distributions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  distribution_period text not null,
  total_service_charge numeric(14,2) default 0,
  foh_amount numeric(14,2) default 0,
  bar_amount numeric(14,2) default 0,
  kitchen_amount numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists labor_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  shift_name text,
  department text,
  labor_cost numeric(14,2) default 0,
  revenue numeric(14,2) default 0,
  labor_percent numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists shift_performance_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  shift_name text,
  department text,
  performance_score numeric(14,2) default 0,
  revenue_per_labor_hour numeric(14,2) default 0,
  average_ticket numeric(14,2) default 0,
  created_at timestamptz default now()
);
