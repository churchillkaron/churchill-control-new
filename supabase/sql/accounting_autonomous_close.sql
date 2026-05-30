create table if not exists accounting_autonomous_close_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  close_period text not null,
  cycle_status text default 'pending',
  readiness_score numeric(14,2) default 0,
  total_controls integer default 0,
  passed_controls integer default 0,
  failed_controls integer default 0,
  ai_recommendation text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz default now()
);
