create table if not exists accounting_scheduler_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  job_name text not null,
  job_type text not null,
  cron_expression text,
  last_run_at timestamptz,
  next_run_at timestamptz,
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists accounting_scheduler_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid not null,
  job_id uuid,
  execution_status text,
  execution_result jsonb,
  executed_at timestamptz default now()
);
