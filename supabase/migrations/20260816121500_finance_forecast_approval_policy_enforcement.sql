alter table public.finance_forecast_scenario_versions
  add column if not exists approval_override boolean not null default false,
  add column if not exists approval_override_reason text;

alter table public.finance_forecast_scenario_versions
  drop constraint if exists finance_forecast_scenario_versions_override_reason_check;

alter table public.finance_forecast_scenario_versions
  add constraint finance_forecast_scenario_versions_override_reason_check
  check (
    (approval_override = false and approval_override_reason is null)
    or
    (approval_override = true and nullif(btrim(approval_override_reason), '') is not null)
  );

alter table public.finance_forecast_scenario_versions
  drop constraint if exists finance_forecast_scenario_versions_approved_ready_check;

alter table public.finance_forecast_scenario_versions
  add constraint finance_forecast_scenario_versions_approved_ready_check
  check (
    status <> 'APPROVED'
    or forecast_ready = true
    or approval_override = true
  );

alter table public.finance_forecast_scenario_versions
  drop constraint if exists finance_forecast_scenario_versions_approved_budget_check;

alter table public.finance_forecast_scenario_versions
  add constraint finance_forecast_scenario_versions_approved_budget_check
  check (
    status <> 'APPROVED'
    or scenario_kind <> 'SCENARIOS_VS_BUDGET'
    or (budget_available = true and budget_complete = true)
    or approval_override = true
  );

create or replace function public.finance_apply_forecast_scenario_version_approval(
  p_organization_id uuid,
  p_version_id uuid,
  p_approved_by uuid,
  p_performed_by_name text,
  p_approval_override boolean,
  p_override_reason text
)
returns setof public.finance_forecast_scenario_versions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_target public.finance_forecast_scenario_versions%rowtype;
  v_previous public.finance_forecast_scenario_versions%rowtype;
  v_approved public.finance_forecast_scenario_versions%rowtype;
  v_scope_key text;
  v_actor_name text;
  v_now timestamptz := now();
  v_override boolean := coalesce(p_approval_override, false);
  v_override_reason text := nullif(btrim(coalesce(p_override_reason, '')), '');
  v_policy_blockers jsonb := '[]'::jsonb;
  v_blocker_text text;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;
  if p_version_id is null then
    raise exception 'version_id required';
  end if;
  if p_approved_by is null then
    raise exception 'approved_by required';
  end if;

  v_actor_name := coalesce(nullif(btrim(p_performed_by_name), ''), 'Authenticated User');

  select * into v_target
  from public.finance_forecast_scenario_versions
  where id = p_version_id
    and organization_id = p_organization_id
  for update;

  if not found then
    raise exception 'Forecast scenario version not found';
  end if;

  if v_target.status = 'SUPERSEDED' then
    raise exception 'Superseded forecast scenario version cannot be approved';
  end if;

  if v_target.status = 'APPROVED' then
    if v_override and v_target.approval_override is not true then
      raise exception 'Forecast scenario version is already approved without override';
    end if;
    return query select * from public.finance_forecast_scenario_versions where id = v_target.id;
    return;
  end if;

  if v_target.forecast_ready is not true then
    v_policy_blockers := v_policy_blockers || jsonb_build_array('FORECAST_NOT_READY');
  end if;

  if v_target.scenario_kind = 'SCENARIOS_VS_BUDGET' then
    if v_target.budget_available is not true then
      v_policy_blockers := v_policy_blockers || jsonb_build_array('BUDGET_UNAVAILABLE');
    elsif v_target.budget_complete is not true then
      v_policy_blockers := v_policy_blockers || jsonb_build_array('BUDGET_INCOMPLETE');
    end if;
  end if;

  select string_agg(value, ', ') into v_blocker_text
  from jsonb_array_elements_text(v_policy_blockers);

  if jsonb_array_length(v_policy_blockers) > 0 and not v_override then
    raise exception 'Forecast approval blocked: %', coalesce(v_blocker_text, 'approval policy not satisfied');
  end if;

  if v_override then
    if jsonb_array_length(v_policy_blockers) = 0 then
      raise exception 'Forecast approval override not applicable: approval policy is already satisfied';
    end if;
    if v_override_reason is null then
      raise exception 'approval override reason required';
    end if;
  end if;

  v_scope_key := concat_ws(':', v_target.organization_id::text, v_target.entity_id::text, v_target.period_id::text, v_target.scenario_kind);
  perform pg_advisory_xact_lock(hashtextextended(v_scope_key, 0));

  select * into v_previous
  from public.finance_forecast_scenario_versions
  where organization_id = v_target.organization_id
    and entity_id = v_target.entity_id
    and period_id = v_target.period_id
    and scenario_kind = v_target.scenario_kind
    and status = 'APPROVED'
    and id <> v_target.id
  limit 1
  for update;

  if v_previous.id is not null then
    update public.finance_forecast_scenario_versions
    set status = 'SUPERSEDED', superseded_at = v_now, updated_at = v_now
    where id = v_previous.id;

    insert into public.audit_logs (
      organization_id, entity_type, entity_id, action_type, performed_by, performed_by_name, old_data, new_data, metadata
    ) values (
      v_previous.organization_id, 'forecast_scenario_version', v_previous.id, 'FORECAST_SCENARIO_VERSION_SUPERSEDED',
      p_approved_by, v_actor_name,
      jsonb_build_object('status', v_previous.status, 'approved_by', v_previous.approved_by, 'approved_at', v_previous.approved_at, 'superseded_at', v_previous.superseded_at, 'approval_override', v_previous.approval_override, 'approval_override_reason', v_previous.approval_override_reason),
      jsonb_build_object('status', 'SUPERSEDED', 'approved_by', v_previous.approved_by, 'approved_at', v_previous.approved_at, 'superseded_at', v_now, 'approval_override', v_previous.approval_override, 'approval_override_reason', v_previous.approval_override_reason),
      jsonb_build_object('moduleName', 'finance', 'subsystem', 'forecasting', 'organization_id', v_previous.organization_id, 'entity_id', v_previous.entity_id, 'period_id', v_previous.period_id, 'scenario_kind', v_previous.scenario_kind, 'version_number', v_previous.version_number, 'superseded_by_version_id', v_target.id)
    );
  end if;

  update public.finance_forecast_scenario_versions
  set status = 'APPROVED',
      approved_by = p_approved_by,
      approved_at = v_now,
      superseded_at = null,
      approval_override = v_override,
      approval_override_reason = case when v_override then v_override_reason else null end,
      updated_at = v_now
  where id = v_target.id
  returning * into v_approved;

  insert into public.audit_logs (
    organization_id, entity_type, entity_id, action_type, performed_by, performed_by_name, old_data, new_data, metadata
  ) values (
    v_approved.organization_id, 'forecast_scenario_version', v_approved.id, 'FORECAST_SCENARIO_VERSION_APPROVED',
    p_approved_by, v_actor_name,
    jsonb_build_object('status', v_target.status, 'approved_by', v_target.approved_by, 'approved_at', v_target.approved_at, 'superseded_at', v_target.superseded_at, 'approval_override', v_target.approval_override, 'approval_override_reason', v_target.approval_override_reason),
    jsonb_build_object('status', v_approved.status, 'approved_by', v_approved.approved_by, 'approved_at', v_approved.approved_at, 'superseded_at', v_approved.superseded_at, 'approval_override', v_approved.approval_override, 'approval_override_reason', v_approved.approval_override_reason),
    jsonb_build_object('moduleName', 'finance', 'subsystem', 'forecasting', 'organization_id', v_approved.organization_id, 'entity_id', v_approved.entity_id, 'period_id', v_approved.period_id, 'scenario_kind', v_approved.scenario_kind, 'version_number', v_approved.version_number, 'previous_approved_version_id', v_previous.id, 'approval_policy_blockers', v_policy_blockers, 'approval_override', v_override, 'approval_override_reason', case when v_override then v_override_reason else null end)
  );

  if v_override then
    insert into public.audit_logs (
      organization_id, entity_type, entity_id, action_type, performed_by, performed_by_name, old_data, new_data, metadata
    ) values (
      v_approved.organization_id, 'forecast_scenario_version', v_approved.id, 'FORECAST_SCENARIO_VERSION_APPROVAL_OVERRIDE',
      p_approved_by, v_actor_name, null,
      jsonb_build_object('approval_override', true, 'approval_override_reason', v_override_reason, 'approval_policy_blockers', v_policy_blockers, 'approved_at', v_approved.approved_at),
      jsonb_build_object('moduleName', 'finance', 'subsystem', 'forecasting', 'organization_id', v_approved.organization_id, 'entity_id', v_approved.entity_id, 'period_id', v_approved.period_id, 'scenario_kind', v_approved.scenario_kind, 'version_number', v_approved.version_number, 'approval_policy_blockers', v_policy_blockers)
    );
  end if;

  return next v_approved;
end;
$$;

create or replace function public.finance_approve_forecast_scenario_version(
  p_organization_id uuid,
  p_version_id uuid,
  p_approved_by uuid,
  p_performed_by_name text
)
returns setof public.finance_forecast_scenario_versions
language sql
security invoker
set search_path = public, pg_temp
as $$
  select * from public.finance_apply_forecast_scenario_version_approval(
    p_organization_id, p_version_id, p_approved_by, p_performed_by_name, false, null
  );
$$;

create or replace function public.finance_override_forecast_scenario_version_approval(
  p_organization_id uuid,
  p_version_id uuid,
  p_approved_by uuid,
  p_performed_by_name text,
  p_override_reason text
)
returns setof public.finance_forecast_scenario_versions
language sql
security invoker
set search_path = public, pg_temp
as $$
  select * from public.finance_apply_forecast_scenario_version_approval(
    p_organization_id, p_version_id, p_approved_by, p_performed_by_name, true, p_override_reason
  );
$$;

revoke execute on function public.finance_apply_forecast_scenario_version_approval(uuid, uuid, uuid, text, boolean, text) from public, anon, authenticated;
revoke execute on function public.finance_approve_forecast_scenario_version(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.finance_override_forecast_scenario_version_approval(uuid, uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function public.finance_apply_forecast_scenario_version_approval(uuid, uuid, uuid, text, boolean, text) to service_role;
grant execute on function public.finance_approve_forecast_scenario_version(uuid, uuid, uuid, text) to service_role;
grant execute on function public.finance_override_forecast_scenario_version_approval(uuid, uuid, uuid, text, text) to service_role;
