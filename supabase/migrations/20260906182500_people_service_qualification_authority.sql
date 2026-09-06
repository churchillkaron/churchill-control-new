create table if not exists public.people_qualification_catalog (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  code text not null,
  name text not null,
  description text,
  status text not null default 'active' check (status in ('active','inactive','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (organization_id, code)
);

create table if not exists public.staff_qualifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  staff_id uuid not null,
  qualification_id uuid not null references public.people_qualification_catalog(id) on delete restrict,
  status text not null default 'active' check (status in ('active','suspended','expired','revoked')),
  valid_from date,
  valid_until date,
  evidence_reference text,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  unique (organization_id, staff_id, qualification_id)
);

alter table public.service_execution_templates
  add column if not exists required_qualification_codes jsonb not null default '[]'::jsonb;

create index if not exists people_qualification_catalog_org_status_idx
  on public.people_qualification_catalog (organization_id, status, code);

create index if not exists staff_qualifications_org_staff_status_idx
  on public.staff_qualifications (organization_id, staff_id, status);

alter table public.people_qualification_catalog enable row level security;
alter table public.staff_qualifications enable row level security;

revoke all on table public.people_qualification_catalog from public, anon, authenticated;
revoke all on table public.staff_qualifications from public, anon, authenticated;
grant select, insert, update, delete on table public.people_qualification_catalog to service_role;
grant select, insert, update, delete on table public.staff_qualifications to service_role;

comment on table public.people_qualification_catalog is
  'People-owned qualification definitions. Operations and Service Management may consume but must not authoritatively redefine these qualifications.';

comment on table public.staff_qualifications is
  'People-owned evidence that a staff member currently holds an organization qualification, with validity and verification metadata.';

comment on column public.service_execution_templates.required_qualification_codes is
  'Qualification codes required to execute this service template. People remains authoritative for whether the assigned staff member holds them.';
