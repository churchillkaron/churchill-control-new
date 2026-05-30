create table if not exists ai_operating_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  cycle_type text not null,
  ai_status text default 'running',
  strategic_score numeric(14,2) default 0,
  financial_score numeric(14,2) default 0,
  operational_score numeric(14,2) default 0,
  optimization_score numeric(14,2) default 0,
  overall_score numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists ai_executive_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  decision_category text not null,
  decision_title text not null,
  ai_reasoning text,
  projected_impact numeric(14,2) default 0,
  execution_priority text default 'medium',
  decision_status text default 'recommended',
  created_at timestamptz default now()
);

create table if not exists ai_optimization_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  optimization_type text not null,
  target_area text,
  expected_improvement numeric(14,2) default 0,
  execution_status text default 'planned',
  created_at timestamptz default now()
);
