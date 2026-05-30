create table if not exists period_lock_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  accounting_period_id uuid not null,
  requested_by text,
  reason text,
  status text default 'pending',
  created_at timestamptz default now()
);

create table if not exists immutable_audit_chain (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  entity_type text,
  entity_id text,
  action_type text,
  action_data jsonb,
  created_at timestamptz default now()
);
