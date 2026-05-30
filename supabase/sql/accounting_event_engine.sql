create table if not exists accounting_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  event_type text not null,
  source_module text not null,
  source_id text,
  description text,
  amount numeric(14,2) default 0,
  tax_amount numeric(14,2) default 0,
  metadata jsonb,
  journal_entry_id uuid,
  status text default 'posted',
  created_at timestamptz default now()
);

create index if not exists idx_accounting_events_tenant
on accounting_events(tenant_id);

create index if not exists idx_accounting_events_type
on accounting_events(event_type);
