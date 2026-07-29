with privileged_memberships as (
  select distinct
    ou.organization_id,
    sa.auth_user_id as user_id
  from public.organization_users ou
  join public.staff_accounts sa
    on sa.id = ou.staff_account_id
  where sa.auth_user_id is not null
    and upper(replace(replace(coalesce(ou.role, sa.role, ''), ' ', '_'), '-', '_')) in (
      'OWNER',
      'ORGANIZATION_OWNER',
      'ORG_OWNER',
      'PLATFORM_OWNER',
      'SUPER_ADMIN',
      'ADMIN',
      'ADMINISTRATOR',
      'ORGANIZATION_ADMIN',
      'ORG_ADMIN'
    )
    and coalesce(lower(ou.status), 'active') not in (
      'inactive',
      'disabled',
      'suspended',
      'terminated',
      'archived',
      'revoked'
    )
    and sa.active is distinct from false

  union

  select distinct
    sa.active_organization_id as organization_id,
    sa.auth_user_id as user_id
  from public.staff_accounts sa
  where sa.active_organization_id is not null
    and sa.auth_user_id is not null
    and upper(replace(replace(coalesce(sa.role, ''), ' ', '_'), '-', '_')) in (
      'OWNER',
      'ORGANIZATION_OWNER',
      'ORG_OWNER',
      'PLATFORM_OWNER',
      'SUPER_ADMIN',
      'ADMIN',
      'ADMINISTRATOR',
      'ORGANIZATION_ADMIN',
      'ORG_ADMIN'
    )
    and sa.active is distinct from false
)
insert into public.operations_roles (
  organization_id,
  role_code,
  role_name,
  description,
  is_system,
  is_active
)
select distinct
  privileged_memberships.organization_id,
  'OPERATIONS_ADMIN',
  'Operations Administrator',
  'Administer Operations security, configuration, execution, controls, audit and event recovery.',
  true,
  true
from privileged_memberships
where privileged_memberships.organization_id is not null
on conflict (organization_id, role_code)
do update set
  role_name = excluded.role_name,
  description = excluded.description,
  is_system = true,
  is_active = true,
  updated_at = now();

insert into public.operations_role_permissions (
  organization_id,
  role_id,
  permission_key
)
select
  role.organization_id,
  role.id,
  'operations.*'
from public.operations_roles role
where role.role_code = 'OPERATIONS_ADMIN'
  and role.is_active = true
on conflict (organization_id, role_id, permission_key)
do nothing;

with privileged_memberships as (
  select distinct
    ou.organization_id,
    sa.auth_user_id as user_id
  from public.organization_users ou
  join public.staff_accounts sa
    on sa.id = ou.staff_account_id
  where sa.auth_user_id is not null
    and upper(replace(replace(coalesce(ou.role, sa.role, ''), ' ', '_'), '-', '_')) in (
      'OWNER',
      'ORGANIZATION_OWNER',
      'ORG_OWNER',
      'PLATFORM_OWNER',
      'SUPER_ADMIN',
      'ADMIN',
      'ADMINISTRATOR',
      'ORGANIZATION_ADMIN',
      'ORG_ADMIN'
    )
    and coalesce(lower(ou.status), 'active') not in (
      'inactive',
      'disabled',
      'suspended',
      'terminated',
      'archived',
      'revoked'
    )
    and sa.active is distinct from false

  union

  select distinct
    sa.active_organization_id as organization_id,
    sa.auth_user_id as user_id
  from public.staff_accounts sa
  where sa.active_organization_id is not null
    and sa.auth_user_id is not null
    and upper(replace(replace(coalesce(sa.role, ''), ' ', '_'), '-', '_')) in (
      'OWNER',
      'ORGANIZATION_OWNER',
      'ORG_OWNER',
      'PLATFORM_OWNER',
      'SUPER_ADMIN',
      'ADMIN',
      'ADMINISTRATOR',
      'ORGANIZATION_ADMIN',
      'ORG_ADMIN'
    )
    and sa.active is distinct from false
)
insert into public.user_operations_roles (
  organization_id,
  user_id,
  role_id,
  assigned_by,
  assigned_at,
  revoked_at
)
select
  privileged_memberships.organization_id,
  privileged_memberships.user_id,
  role.id,
  privileged_memberships.user_id,
  now(),
  null
from privileged_memberships
join public.operations_roles role
  on role.organization_id = privileged_memberships.organization_id
 and role.role_code = 'OPERATIONS_ADMIN'
 and role.is_active = true
where privileged_memberships.organization_id is not null
  and privileged_memberships.user_id is not null
on conflict (organization_id, user_id, role_id)
do update set
  revoked_at = null,
  assigned_by = excluded.assigned_by,
  assigned_at = excluded.assigned_at;

comment on table public.user_operations_roles is
  'Organisation-scoped Operations role assignments. Existing organisation owners and administrators are backfilled as Operations administrators.';
