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
      and upper(coalesce(ou.role, '')) in ('OWNER','SUPER_ADMIN','MANAGER','PLATFORM_OWNER')
  );
$$;

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
      and upper(coalesce(ou.role, '')) in ('OWNER','SUPER_ADMIN','MANAGER','ACCOUNTING','PLATFORM_OWNER')
  );
$$;

revoke execute on function public.can_manage_organization(uuid) from public, anon;
grant execute on function public.can_manage_organization(uuid) to authenticated, service_role;
revoke execute on function public.can_read_organization_payroll(uuid) from public, anon;
grant execute on function public.can_read_organization_payroll(uuid) to authenticated, service_role;

revoke insert, update, delete, truncate, references, trigger
on table public.staff_accounts
from anon, authenticated;

revoke select on table public.staff_accounts from anon;
grant select on table public.staff_accounts to authenticated;

drop policy if exists "Public upload uploads bucket" on storage.objects;
drop policy if exists "Authenticated upload uploads bucket" on storage.objects;
