create table if not exists public.operations_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  role_code text not null,
  role_name text not null,
  description text null,
  is_system boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, role_code)
);

create table if not exists public.operations_role_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  role_id uuid not null references public.operations_roles(id) on delete cascade,
  permission_key text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, role_id, permission_key)
);

create table if not exists public.user_operations_roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  user_id uuid not null,
  role_id uuid not null references public.operations_roles(id) on delete cascade,
  assigned_by uuid null,
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz null,
  unique (organization_id, user_id, role_id)
);

create index if not exists operations_roles_org_active_idx
  on public.operations_roles (organization_id, is_active, role_code);

create index if not exists operations_role_permissions_lookup_idx
  on public.operations_role_permissions (organization_id, role_id, permission_key);

create index if not exists user_operations_roles_user_idx
  on public.user_operations_roles (organization_id, user_id, revoked_at)
  where revoked_at is null;

create or replace function public.touch_operations_role_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists operations_roles_touch_updated_at on public.operations_roles;
create trigger operations_roles_touch_updated_at
before update on public.operations_roles
for each row
execute function public.touch_operations_role_updated_at();

revoke all on table public.operations_roles from anon, authenticated;
revoke all on table public.operations_role_permissions from anon, authenticated;
revoke all on table public.user_operations_roles from anon, authenticated;

grant select, insert, update on table public.operations_roles to service_role;
grant select, insert, update, delete on table public.operations_role_permissions to service_role;
grant select, insert, update, delete on table public.user_operations_roles to service_role;

comment on table public.operations_roles is
  'Organisation-scoped Operations role definitions. Canonical system roles are provisioned by the Operations security repository.';

comment on table public.operations_role_permissions is
  'Permission keys granted to organisation-scoped Operations roles.';

comment on table public.user_operations_roles is
  'Organisation-scoped assignments of Operations roles to authenticated users.';
