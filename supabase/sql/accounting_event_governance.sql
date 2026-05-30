create table if not exists accounting_event_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  policy_name text not null,
  event_type text not null,
  approval_required boolean default false,
  max_amount numeric(14,2),
  allowed_roles jsonb,
  blocked_after_period_close boolean default true,
  created_at timestamptz default now()
);

create table if not exists accounting_event_policy_violations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  policy_id uuid,
  event_id uuid,
  violation_type text not null,
  violation_message text,
  created_at timestamptz default now()
);
