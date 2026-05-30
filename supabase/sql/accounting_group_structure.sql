create table if not exists legal_entities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  entity_name text not null,
  entity_code text,
  country text,
  base_currency text,
  created_at timestamptz default now()
);

create table if not exists ownership_structures (
  id uuid primary key default gen_random_uuid(),
  parent_entity_id uuid,
  child_entity_id uuid,
  ownership_percentage numeric(8,2),
  created_at timestamptz default now()
);

create table if not exists elimination_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  elimination_type text,
  source_entity text,
  target_entity text,
  amount numeric(14,2),
  created_at timestamptz default now()
);
