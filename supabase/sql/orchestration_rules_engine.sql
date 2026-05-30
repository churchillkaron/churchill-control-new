create table if not exists orchestration_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  rule_name text not null,
  entity_type text not null,
  trigger_event text not null,
  condition_definition jsonb,
  action_definition jsonb,
  active boolean default true,
  created_at timestamptz default now()
);

create table if not exists orchestration_rule_executions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  rule_id uuid not null,
  trigger_event text,
  execution_result text,
  execution_payload jsonb,
  created_at timestamptz default now()
);
