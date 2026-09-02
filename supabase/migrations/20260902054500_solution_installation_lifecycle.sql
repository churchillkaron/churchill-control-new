begin;

alter table public.workspace_templates
  add column if not exists solution_version text not null default '1.0',
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists route text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.workspace_templates drop constraint if exists workspace_templates_status_check;
alter table public.workspace_templates add constraint workspace_templates_status_check
  check (status in ('DRAFT','ACTIVE','DEPRECATED','ARCHIVED'));

create table if not exists public.organization_solutions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  entity_id uuid references public.legal_entities(id) on delete cascade,
  template_id uuid not null references public.workspace_templates(id) on delete restrict,
  status text not null default 'INSTALLED',
  installed_version text not null,
  configuration jsonb not null default '{}'::jsonb,
  installed_by uuid references public.staff_accounts(id) on delete set null,
  installed_at timestamptz not null default now(),
  activated_at timestamptz,
  disabled_at timestamptz,
  last_readiness_check_at timestamptz,
  readiness_status text not null default 'UNKNOWN',
  readiness_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_solutions_status_check
    check (status in ('INSTALLING','INSTALLED','ACTIVE','DISABLED','REMOVED')),
  constraint organization_solutions_readiness_check
    check (readiness_status in ('UNKNOWN','READY','NEEDS_ATTENTION','BLOCKED'))
);

create unique index if not exists organization_solutions_org_template_unique
  on public.organization_solutions (organization_id, template_id)
  where entity_id is null and status <> 'REMOVED';

create unique index if not exists organization_solutions_entity_template_unique
  on public.organization_solutions (organization_id, entity_id, template_id)
  where entity_id is not null and status <> 'REMOVED';

create index if not exists organization_solutions_lookup_idx
  on public.organization_solutions (organization_id, entity_id, status, readiness_status, updated_at desc);

alter table public.organization_solutions enable row level security;

comment on table public.organization_solutions is
  'Organization/entity installation state for workspace-template solution packs. Core business logic remains in owning ERP domains and organization_modules remains the canonical module enablement state.';

commit;
