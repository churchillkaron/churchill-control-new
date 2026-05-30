create table if not exists accounting_continuous_close_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  close_period text not null,
  close_status text default 'running',
  total_checks integer default 0,
  passed_checks integer default 0,
  failed_checks integer default 0,
  started_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists accounting_close_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  close_run_id uuid,
  exception_type text not null,
  severity text default 'medium',
  reference_id text,
  exception_message text,
  resolved boolean default false,
  created_at timestamptz default now()
);
