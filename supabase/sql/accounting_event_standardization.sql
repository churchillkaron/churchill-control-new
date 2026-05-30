create table if not exists accounting_event_schemas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  event_type text not null,
  schema_version text not null,
  required_fields jsonb not null,
  optional_fields jsonb,
  created_at timestamptz default now()
);

create table if not exists accounting_event_lineage (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  event_id uuid,
  source_module text,
  source_id text,
  journal_entry_id uuid,
  ledger_entry_ids jsonb,
  lineage_status text default 'linked',
  created_at timestamptz default now()
);
