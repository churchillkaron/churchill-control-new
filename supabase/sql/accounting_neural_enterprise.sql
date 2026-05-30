create table if not exists neural_enterprise_memory (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  memory_type text not null,
  source_reference text,
  learned_pattern jsonb,
  confidence_score numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists neural_enterprise_evolution (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  evolution_type text not null,
  previous_score numeric(14,2) default 0,
  new_score numeric(14,2) default 0,
  improvement numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists neural_enterprise_state (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  enterprise_state text default 'learning',
  intelligence_level numeric(14,2) default 0,
  autonomy_level numeric(14,2) default 0,
  optimization_level numeric(14,2) default 0,
  strategic_level numeric(14,2) default 0,
  created_at timestamptz default now()
);
