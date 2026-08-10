create table public.business_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'ACTIVE',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_units_organization_code_key unique (organization_id, code),
  constraint business_units_organization_id_id_key unique (organization_id, id)
);

create index business_units_organization_name_idx
  on public.business_units (organization_id, name);

alter table public.business_units enable row level security;

revoke all on table public.business_units from public, anon, authenticated;
grant select, insert, update, delete on table public.business_units to service_role;

alter table public.business_locations
  add constraint business_locations_organization_business_unit_fkey
  foreign key (organization_id, business_unit_id)
  references public.business_units (organization_id, id)
  on delete restrict;
