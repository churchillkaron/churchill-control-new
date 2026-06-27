create table if not exists orchestration_workflows (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_name text not null,
  workflow_type text not null,
  workflow_definition jsonb,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists orchestration_workflow_executions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  workflow_id uuid not null,
  execution_reference text,
  execution_status text default 'running',
  execution_result jsonb,
  started_at timestamptz default now(),
  completed_at timestamptz
);
