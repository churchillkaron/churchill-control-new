create table if not exists public.service_execution_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid,
  code text not null,
  name text not null,
  description text,
  industry_key text not null default 'generic-service',
  version integer not null default 1 check (version > 0),
  status text not null default 'active' check (status in ('draft','active','retired','archived')),
  field_schema jsonb not null default '[]'::jsonb,
  evidence_requirements jsonb not null default '{}'::jsonb,
  completion_rules jsonb not null default '{}'::jsonb,
  instructions text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code, version)
);

create index if not exists service_execution_templates_org_industry_idx
  on public.service_execution_templates (organization_id, industry_key, status, name);

create index if not exists service_execution_templates_org_code_idx
  on public.service_execution_templates (organization_id, code, version desc);

alter table public.service_execution_templates enable row level security;
revoke all on table public.service_execution_templates from anon, authenticated;
grant all on table public.service_execution_templates to service_role;

comment on table public.service_execution_templates is
  'Versioned, industry-configurable service execution protocols. Scheduling core treats field_schema and evidence rules as data and never hardcodes industry forms.';
comment on column public.service_execution_templates.field_schema is
  'Ordered dynamic field definitions rendered during service execution.';
