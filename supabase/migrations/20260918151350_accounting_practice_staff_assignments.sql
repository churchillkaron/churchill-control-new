begin;

create or replace function public.accounting_update_client_staff_assignments(
  p_accounting_firm_id uuid,
  p_engagement_id uuid,
  p_accountant_id uuid,
  p_reviewer_id uuid,
  p_partner_id uuid,
  p_actor uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_engagement public.accounting_engagements%rowtype;
  v_profile public.accounting_client_profiles%rowtype;
  v_accountant_name text;
  v_reviewer_name text;
  v_partner_name text;
begin
  if p_accounting_firm_id is null then raise exception 'ACCOUNTING_FIRM_REQUIRED'; end if;
  if p_engagement_id is null then raise exception 'ENGAGEMENT_REQUIRED'; end if;
  if p_actor is null then raise exception 'ACTOR_REQUIRED'; end if;

  select * into v_engagement
  from public.accounting_engagements
  where id = p_engagement_id
    and accounting_firm_id = p_accounting_firm_id
    and status = 'ACTIVE';
  if not found then raise exception 'ENGAGEMENT_UNAVAILABLE'; end if;

  select * into v_profile
  from public.accounting_client_profiles
  where accounting_firm_id = p_accounting_firm_id
    and organization_id = v_engagement.organization_id
    and status = 'ACTIVE';
  if not found then raise exception 'CLIENT_PROFILE_UNAVAILABLE'; end if;
  if p_accountant_id is null then raise exception 'PREPARER_ASSIGNMENT_REQUIRED'; end if;
  if p_reviewer_id is null then raise exception 'REVIEWER_ASSIGNMENT_REQUIRED'; end if;
  if p_partner_id is null then raise exception 'PARTNER_ASSIGNMENT_REQUIRED'; end if;

  if p_accountant_id = p_reviewer_id
     or p_accountant_id = p_partner_id
     or p_reviewer_id = p_partner_id then
    raise exception 'SEGREGATION_OF_DUTIES_ASSIGNMENTS_REQUIRED';
  end if;

  if not exists (
    select 1 from public.staff_accounts s
    join public.organization_users ou
      on ou.staff_account_id = s.id
     and ou.organization_id = p_accounting_firm_id
     and ou.status = 'active'
    where s.id = p_accountant_id and s.active = true
  ) then raise exception 'PREPARER_NOT_ACTIVE_FIRM_MEMBER'; end if;

  if not exists (
    select 1 from public.staff_accounts s
    join public.organization_users ou
      on ou.staff_account_id = s.id
     and ou.organization_id = p_accounting_firm_id
     and ou.status = 'active'
    where s.id = p_reviewer_id and s.active = true
  ) then raise exception 'REVIEWER_NOT_ACTIVE_FIRM_MEMBER'; end if;

  if not exists (
    select 1 from public.staff_accounts s
    join public.organization_users ou
      on ou.staff_account_id = s.id
     and ou.organization_id = p_accounting_firm_id
     and ou.status = 'active'
    where s.id = p_partner_id and s.active = true
  ) then raise exception 'PARTNER_NOT_ACTIVE_FIRM_MEMBER'; end if;
  select coalesce(nullif(btrim(name), ''), nullif(btrim(email), ''), id::text)
    into v_accountant_name from public.staff_accounts where id = p_accountant_id;
  select coalesce(nullif(btrim(name), ''), nullif(btrim(email), ''), id::text)
    into v_reviewer_name from public.staff_accounts where id = p_reviewer_id;
  select coalesce(nullif(btrim(name), ''), nullif(btrim(email), ''), id::text)
    into v_partner_name from public.staff_accounts where id = p_partner_id;

  update public.accounting_client_profiles
  set assigned_accountant_id = p_accountant_id,
      assigned_accountant_name = v_accountant_name,
      assigned_reviewer_id = p_reviewer_id,
      assigned_reviewer_name = v_reviewer_name,
      assigned_partner_id = p_partner_id,
      assigned_partner_name = v_partner_name,
      updated_at = now()
  where id = v_profile.id;

  insert into public.organization_audit_logs (
    organization_id, entity_type, entity_id, action, before_data, after_data, metadata
  ) values (
    p_accounting_firm_id,
    'accounting_client_profile',
    v_profile.id::text,
    'ACCOUNTING_CLIENT_STAFF_ASSIGNMENTS_UPDATED',
    jsonb_build_object(
      'assigned_accountant_id', v_profile.assigned_accountant_id,
      'assigned_reviewer_id', v_profile.assigned_reviewer_id,
      'assigned_partner_id', v_profile.assigned_partner_id
    ),
    jsonb_build_object(
      'assigned_accountant_id', p_accountant_id,
      'assigned_reviewer_id', p_reviewer_id,
      'assigned_partner_id', p_partner_id
    ),
    jsonb_build_object(
      'engagement_id', p_engagement_id,
      'client_organization_id', v_engagement.organization_id,
      'actor', p_actor,
      'segregation_of_duties_enforced', true
    )
  );
  return jsonb_build_object(
    'status', 'UPDATED',
    'profile_id', v_profile.id,
    'engagement_id', p_engagement_id,
    'organization_id', v_engagement.organization_id,
    'assigned_accountant_id', p_accountant_id,
    'assigned_accountant_name', v_accountant_name,
    'assigned_reviewer_id', p_reviewer_id,
    'assigned_reviewer_name', v_reviewer_name,
    'assigned_partner_id', p_partner_id,
    'assigned_partner_name', v_partner_name
  );
end;
$$;

revoke all on function public.accounting_update_client_staff_assignments(uuid,uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
grant execute on function public.accounting_update_client_staff_assignments(uuid,uuid,uuid,uuid,uuid,uuid) to service_role;

commit;
