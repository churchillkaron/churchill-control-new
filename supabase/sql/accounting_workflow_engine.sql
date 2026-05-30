create table if not exists accounting_workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  workflow_name text not null,
  workflow_type text not null,
  status text default 'completed',
  started_at timestamptz default now(),
  completed_at timestamptz,
  result jsonb
);
