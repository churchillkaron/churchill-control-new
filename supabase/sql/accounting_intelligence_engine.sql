create table if not exists accounting_recommendations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  recommendation_type text not null,
  priority text default 'medium',
  title text not null,
  recommendation text not null,
  expected_impact text,
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists autonomous_finance_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  action_type text not null,
  action_payload jsonb,
  execution_status text default 'pending',
  execution_result jsonb,
  created_at timestamptz default now()
);
