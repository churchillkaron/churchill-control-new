create table public.teams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  status text not null default 'ACTIVE',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_organization_code_key unique (organization_id, code),
  constraint teams_organization_id_id_key unique (organization_id, id)
);

create index teams_organization_name_idx
  on public.teams (organization_id, name);

alter table public.teams enable row level security;

revoke all on table public.teams from public, anon, authenticated;
grant select, insert, update, delete on table public.teams to service_role;

alter table public.assignments
  add constraint assignments_organization_team_fkey
  foreign key (organization_id, assigned_team_id)
  references public.teams (organization_id, id)
  on delete restrict;
