create table if not exists orchestration_execution_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  orchestration_type text not null,
  reference_id text,
  execution_status text default 'running',
  execution_steps jsonb,
  started_at timestamptz default now(),
  completed_at timestamptz
);
