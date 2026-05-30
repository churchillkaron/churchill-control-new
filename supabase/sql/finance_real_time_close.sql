create table if not exists real_time_close_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  close_date date not null,
  close_status text default 'running',
  revenue_locked boolean default false,
  inventory_locked boolean default false,
  payroll_locked boolean default false,
  accounting_locked boolean default false,
  finalized boolean default false,
  created_at timestamptz default now()
);

create table if not exists real_time_close_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  close_cycle_id uuid,
  module_name text not null,
  severity text default 'medium',
  exception_message text not null,
  resolved boolean default false,
  created_at timestamptz default now()
);

create table if not exists real_time_close_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  close_cycle_id uuid,
  approved_by text,
  approval_role text,
  approval_status text default 'approved',
  created_at timestamptz default now()
);
