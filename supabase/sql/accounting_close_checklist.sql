create table if not exists accounting_close_checklists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  accounting_period_id uuid not null,
  checklist_item text not null,
  completed boolean default false,
  completed_at timestamptz,
  completed_by text,
  created_at timestamptz default now()
);
