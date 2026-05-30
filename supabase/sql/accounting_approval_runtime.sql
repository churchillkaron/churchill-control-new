create table if not exists accounting_approval_workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  entity_type text not null,
  entity_id text not null,
  requested_by text,
  approver text,
  status text default 'pending',
  notes text,
  approved_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz default now()
);
