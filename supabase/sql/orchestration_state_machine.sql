create table if not exists orchestration_state_transitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  previous_state text,
  next_state text,
  transition_action text,
  transitioned_by text,
  created_at timestamptz default now()
);

create table if not exists orchestration_state_rules (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  current_state text not null,
  allowed_next_state text not null,
  created_at timestamptz default now()
);
