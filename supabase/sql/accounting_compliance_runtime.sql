create table if not exists compliance_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  compliance_type text not null,
  status text default 'passed',
  findings jsonb,
  created_at timestamptz default now()
);
