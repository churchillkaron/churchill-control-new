create table if not exists accounting_domain_registry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  domain_name text not null,
  allowed_event_types jsonb not null,
  forbidden_tables jsonb,
  created_at timestamptz default now()
);

create table if not exists accounting_domain_violations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  domain_name text not null,
  violation_type text not null,
  source_reference text,
  violation_details jsonb,
  created_at timestamptz default now()
);
