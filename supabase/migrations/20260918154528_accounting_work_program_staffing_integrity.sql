begin;

create or replace function public.validate_accounting_engagement_run_staffing()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_engagement public.accounting_engagements%rowtype;
  v_profile public.accounting_client_profiles%rowtype;
  v_requires_preparer boolean := false;
  v_requires_reviewer boolean := false;
  v_requires_partner boolean := false;
begin
  select * into v_engagement
  from public.accounting_engagements
  where id = new.engagement_id
    and accounting_firm_id = new.accounting_firm_id
    and organization_id = new.organization_id
    and status = 'ACTIVE';
  if not found then
    raise exception 'ENGAGEMENT_SCOPE_MISMATCH';
  end if;

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

  if v_requires_preparer and v_profile.assigned_accountant_id is null then
    raise exception 'PREPARER_ASSIGNMENT_REQUIRED';
  end if;
  if v_requires_reviewer and v_profile.assigned_reviewer_id is null then
    raise exception 'REVIEWER_ASSIGNMENT_REQUIRED';
  end if;
  if v_requires_partner and v_profile.assigned_partner_id is null then
    raise exception 'PARTNER_ASSIGNMENT_REQUIRED';
  end if;

  if v_requires_preparer and v_requires_reviewer
     and v_profile.assigned_accountant_id = v_profile.assigned_reviewer_id then
    raise exception 'PREPARER_REVIEWER_SEGREGATION_REQUIRED';
  end if;
  if v_requires_preparer and v_requires_partner
     and v_profile.assigned_accountant_id = v_profile.assigned_partner_id then
    raise exception 'PREPARER_PARTNER_SEGREGATION_REQUIRED';
  end if;
  if v_requires_reviewer and v_requires_partner
     and v_profile.assigned_reviewer_id = v_profile.assigned_partner_id then
    raise exception 'REVIEWER_PARTNER_SEGREGATION_REQUIRED';
  end if;
  if v_requires_preparer and not exists (
    select 1
    from public.staff_accounts s
    join public.organization_users ou
      on ou.staff_account_id = s.id
     and ou.organization_id = new.accounting_firm_id
     and ou.status = 'active'
    where s.id = v_profile.assigned_accountant_id
      and s.active = true
  ) then
    raise exception 'PREPARER_NOT_ACTIVE_FIRM_MEMBER';
  end if;

  if v_requires_reviewer and not exists (
    select 1
    from public.staff_accounts s
    join public.organization_users ou
      on ou.staff_account_id = s.id
     and ou.organization_id = new.accounting_firm_id
     and ou.status = 'active'
    where s.id = v_profile.assigned_reviewer_id
      and s.active = true
  ) then
    raise exception 'REVIEWER_NOT_ACTIVE_FIRM_MEMBER';
  end if;

  if v_requires_partner and not exists (
    select 1
    from public.staff_accounts s
    join public.organization_users ou
      on ou.staff_account_id = s.id
     and ou.organization_id = new.accounting_firm_id
     and ou.status = 'active'
    where s.id = v_profile.assigned_partner_id
      and s.active = true
  ) then
    raise exception 'PARTNER_NOT_ACTIVE_FIRM_MEMBER';
  end if;

  return new;
end;
$$;

drop trigger if exists accounting_engagement_run_staffing_guard
  on public.accounting_engagement_runs;

create trigger accounting_engagement_run_staffing_guard
before insert or update of accounting_firm_id, organization_id, engagement_id, template_id
on public.accounting_engagement_runs
for each row
execute function public.validate_accounting_engagement_run_staffing();

revoke all on function public.validate_accounting_engagement_run_staffing()
  from public, anon, authenticated;
grant execute on function public.validate_accounting_engagement_run_staffing()
  to service_role;

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
  v_reassigned_open_work integer := 0;
  v_preserved_historical_work integer := 0;
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

  update public.accounting_engagement_work_items i
  set assigned_to = case i.required_role
        when 'PREPARER' then p_accountant_id
        when 'REVIEWER' then p_reviewer_id
        when 'PARTNER' then p_partner_id
        else i.assigned_to
      end,
      updated_at = now()
  where i.accounting_firm_id = p_accounting_firm_id
    and i.organization_id = v_engagement.organization_id
    and exists (
      select 1
      from public.accounting_engagement_runs r
      where r.id = i.run_id
        and r.accounting_firm_id = p_accounting_firm_id
        and r.engagement_id = p_engagement_id
    )
    and i.required_role in ('PREPARER','REVIEWER','PARTNER')
    and i.completed_at is null
    and i.status not in ('COMPLETE','SKIPPED')
    and not exists (
      select 1
      from public.finance_review_signoffs s
      where s.review_item_id = i.finance_review_item_id
        and s.revoked_at is null
    );
  get diagnostics v_reassigned_open_work = row_count;
  select count(*)::integer
    into v_preserved_historical_work
  from public.accounting_engagement_work_items i
  where i.accounting_firm_id = p_accounting_firm_id
    and i.organization_id = v_engagement.organization_id
    and exists (
      select 1
      from public.accounting_engagement_runs r
      where r.id = i.run_id
        and r.accounting_firm_id = p_accounting_firm_id
        and r.engagement_id = p_engagement_id
    )
    and i.required_role in ('PREPARER','REVIEWER','PARTNER')
    and (
      i.completed_at is not null
      or i.status in ('COMPLETE','SKIPPED')
      or exists (
        select 1
        from public.finance_review_signoffs s
        where s.review_item_id = i.finance_review_item_id
          and s.revoked_at is null
      )
    );

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
      'segregation_of_duties_enforced', true,
      'open_work_items_reassigned', v_reassigned_open_work,
      'historical_or_signed_work_items_preserved', v_preserved_historical_work
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
    'assigned_partner_name', v_partner_name,
    'open_work_items_reassigned', v_reassigned_open_work,
    'historical_or_signed_work_items_preserved', v_preserved_historical_work
  );
end;
$$;

revoke all on function public.accounting_update_client_staff_assignments(uuid,uuid,uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.accounting_update_client_staff_assignments(uuid,uuid,uuid,uuid,uuid,uuid)
  to service_role;

commit;
