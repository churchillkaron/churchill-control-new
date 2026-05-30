create table if not exists accounting_dimensions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  dimension_type text not null,
  dimension_code text not null,
  dimension_name text not null,
  is_active boolean default true,
  created_at timestamptz default now()
);

create table if not exists journal_line_dimensions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  journal_line_id uuid not null,
  dimension_id uuid not null,
  created_at timestamptz default now()
);

create index if not exists idx_dimension_tenant
on accounting_dimensions(tenant_id);

create index if not exists idx_journal_dimension_tenant
on journal_line_dimensions(tenant_id);
