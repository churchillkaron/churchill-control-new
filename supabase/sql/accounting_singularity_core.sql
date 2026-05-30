create table if not exists singularity_core_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  singularity_state text default 'emerging',
  enterprise_intelligence numeric(14,2) default 0,
  enterprise_autonomy numeric(14,2) default 0,
  enterprise_prediction numeric(14,2) default 0,
  enterprise_adaptation numeric(14,2) default 0,
  singularity_score numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists enterprise_consciousness (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  consciousness_type text not null,
  awareness_level numeric(14,2) default 0,
  reasoning_depth numeric(14,2) default 0,
  strategic_alignment numeric(14,2) default 0,
  created_at timestamptz default now()
);

create table if not exists meta_learning_cycles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  learning_type text not null,
  previous_accuracy numeric(14,2) default 0,
  current_accuracy numeric(14,2) default 0,
  learning_improvement numeric(14,2) default 0,
  created_at timestamptz default now()
);
