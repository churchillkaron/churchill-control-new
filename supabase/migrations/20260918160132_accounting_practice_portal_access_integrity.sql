begin;

create or replace function public.accounting_staff_portal_ready(
  p_accounting_firm_id uuid,
  p_staff_id uuid
) returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_accounts s
    join public.organization_users ou
      on ou.staff_account_id = s.id
     and ou.organization_id = p_accounting_firm_id
     and ou.status = 'active'
    where s.id = p_staff_id
      and s.active = true
      and s.auth_user_id is not null
  );
$$;

revoke all on function public.accounting_staff_portal_ready(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.accounting_staff_portal_ready(uuid,uuid)
  to service_role;

create or replace function public.validate_accounting_client_profile_portal_access()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.assigned_accountant_id is not null
     and not public.accounting_staff_portal_ready(new.accounting_firm_id, new.assigned_accountant_id) then
    raise exception 'PREPARER_PORTAL_ACCESS_REQUIRED';
  end if;

  if new.assigned_reviewer_id is not null
     and not public.accounting_staff_portal_ready(new.accounting_firm_id, new.assigned_reviewer_id) then
    raise exception 'REVIEWER_PORTAL_ACCESS_REQUIRED';
  end if;

  if new.assigned_partner_id is not null
     and not public.accounting_staff_portal_ready(new.accounting_firm_id, new.assigned_partner_id) then
    raise exception 'PARTNER_PORTAL_ACCESS_REQUIRED';
  end if;
  if new.assigned_accountant_id is not null
     and new.assigned_reviewer_id is not null
     and new.assigned_accountant_id = new.assigned_reviewer_id then
    raise exception 'PREPARER_REVIEWER_SEGREGATION_REQUIRED';
  end if;

  if new.assigned_accountant_id is not null
     and new.assigned_partner_id is not null
     and new.assigned_accountant_id = new.assigned_partner_id then
    raise exception 'PREPARER_PARTNER_SEGREGATION_REQUIRED';
  end if;

  if new.assigned_reviewer_id is not null
     and new.assigned_partner_id is not null
     and new.assigned_reviewer_id = new.assigned_partner_id then
    raise exception 'REVIEWER_PARTNER_SEGREGATION_REQUIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists accounting_client_profile_portal_access_guard
  on public.accounting_client_profiles;

create trigger accounting_client_profile_portal_access_guard
before insert or update of assigned_accountant_id, assigned_reviewer_id, assigned_partner_id
on public.accounting_client_profiles
for each row
execute function public.validate_accounting_client_profile_portal_access();

revoke all on function public.validate_accounting_client_profile_portal_access()
  from public, anon, authenticated;
grant execute on function public.validate_accounting_client_profile_portal_access()
  to service_role;

create or replace function public.validate_accounting_engagement_run_portal_access()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_profile public.accounting_client_profiles%rowtype;
  v_requires_preparer boolean := false;
  v_requires_reviewer boolean := false;
  v_requires_partner boolean := false;
begin
  select
    coalesce(bool_or(required_role = 'PREPARER'), false),
    coalesce(bool_or(required_role = 'REVIEWER'), false),
    coalesce(bool_or(required_role = 'PARTNER'), false)
    into v_requires_preparer, v_requires_reviewer, v_requires_partner
  from public.accounting_work_program_template_steps
  where template_id = new.template_id
    and active = true;

  if not (v_requires_preparer or v_requires_reviewer or v_requires_partner) then
    return new;
  end if;

  select * into v_profile
  from public.accounting_client_profiles
  where accounting_firm_id = new.accounting_firm_id
    and organization_id = new.organization_id
    and status = 'ACTIVE';

  if not found then
    raise exception 'CLIENT_PROFILE_UNAVAILABLE';
  end if;

  if v_requires_preparer
     and not public.accounting_staff_portal_ready(new.accounting_firm_id, v_profile.assigned_accountant_id) then
    raise exception 'PREPARER_PORTAL_ACCESS_REQUIRED';
  end if;

  if v_requires_reviewer
     and not public.accounting_staff_portal_ready(new.accounting_firm_id, v_profile.assigned_reviewer_id) then
    raise exception 'REVIEWER_PORTAL_ACCESS_REQUIRED';
  end if;

  if v_requires_partner
     and not public.accounting_staff_portal_ready(new.accounting_firm_id, v_profile.assigned_partner_id) then
    raise exception 'PARTNER_PORTAL_ACCESS_REQUIRED';
  end if;

  return new;
end;
$$;

drop trigger if exists accounting_engagement_run_portal_access_guard
  on public.accounting_engagement_runs;

create trigger accounting_engagement_run_portal_access_guard
before insert or update of accounting_firm_id, organization_id, engagement_id, template_id
on public.accounting_engagement_runs
for each row
execute function public.validate_accounting_engagement_run_portal_access();

revoke all on function public.validate_accounting_engagement_run_portal_access()
  from public, anon, authenticated;
grant execute on function public.validate_accounting_engagement_run_portal_access()
  to service_role;

commit;
