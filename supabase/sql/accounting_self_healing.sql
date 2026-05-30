create table if not exists accounting_self_healing_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  trigger_type text not null,
  reference_id text,
  detected_issue text not null,
  proposed_fix text not null,
  auto_fix_payload jsonb,
  execution_status text default 'pending_approval',
  executed_at timestamptz,
  created_at timestamptz default now()
);
