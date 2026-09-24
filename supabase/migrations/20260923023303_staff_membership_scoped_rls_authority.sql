begin;

create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_accounts sa
    join public.organization_users ou
      on ou.staff_account_id = sa.id
     and ou.organization_id = target_organization_id
     and ou.status = 'active'
    where sa.auth_user_id = auth.uid()
      and coalesce(sa.active, true) = true
      and upper(coalesce(ou.role, '')) in ('OWNER', 'ORGANIZATION_OWNER', 'ORG_OWNER', 'PLATFORM_OWNER', 'SUPER_ADMIN', 'MANAGER')
  );
$$;

revoke all on function public.can_manage_organization(uuid) from public, anon;
grant execute on function public.can_manage_organization(uuid) to authenticated, service_role;

revoke all on function public.current_staff_account_id() from public, anon;
grant execute on function public.current_staff_account_id() to authenticated, service_role;


create or replace function public.can_read_organization_payroll(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_accounts sa
    join public.organization_users ou
      on ou.staff_account_id = sa.id
     and ou.organization_id = target_organization_id
     and ou.status = 'active'
    where sa.auth_user_id = auth.uid()
      and coalesce(sa.active, true) = true
      and upper(coalesce(ou.role, '')) in ('OWNER', 'ORGANIZATION_OWNER', 'ORG_OWNER', 'PLATFORM_OWNER', 'SUPER_ADMIN', 'MANAGER', 'ACCOUNTING')
  );
$$;

revoke all on function public.can_read_organization_payroll(uuid) from public, anon;
grant execute on function public.can_read_organization_payroll(uuid) to authenticated, service_role;

create or replace function public.same_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_accounts sa
    join public.organization_users ou
      on ou.staff_account_id = sa.id
     and ou.organization_id = target_organization_id
     and ou.status = 'active'
    where sa.auth_user_id = auth.uid()
      and coalesce(sa.active, true) = true
  );
$$;

revoke all on function public.same_organization(uuid) from public, anon;
grant execute on function public.same_organization(uuid) to authenticated, service_role;


drop policy if exists staff_accounts_manage on public.staff_accounts;

revoke all on table public.staff_accounts from anon;
revoke insert, update, delete on table public.staff_accounts from authenticated;
grant select on table public.staff_accounts to authenticated;
grant select, insert, update, delete on table public.staff_accounts to service_role;

commit;
