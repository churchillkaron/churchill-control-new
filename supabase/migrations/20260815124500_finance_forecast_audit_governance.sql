create or replace function public.finance_create_forecast_scenario_version_draft(
  p_organization_id uuid,
  p_entity_id uuid,
  p_period_id uuid,
  p_scenario_kind text,
  p_assumptions jsonb,
  p_result_snapshot jsonb,
  p_forecast_ready boolean,
  p_budget_available boolean,
  p_budget_complete boolean,
  p_currency_code text,
  p_source_generated_at timestamptz,
  p_created_by uuid,
  p_performed_by_name text
)
returns setof public.finance_forecast_scenario_versions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_version public.finance_forecast_scenario_versions%rowtype;
  v_actor_name text;
begin
  v_actor_name := coalesce(nullif(btrim(p_performed_by_name), ''), 'Authenticated User');

  insert into public.finance_forecast_scenario_versions (
    organization_id,
    entity_id,
    period_id,
    scenario_kind,
    status,
    assumptions,
    result_snapshot,
    forecast_ready,
    budget_available,
    budget_complete,
    currency_code,
    source_generated_at,
    created_by
  )
  values (
    p_organization_id,
    p_entity_id,
    p_period_id,
    p_scenario_kind,
    'DRAFT',
    p_assumptions,
    p_result_snapshot,
    coalesce(p_forecast_ready, false),
    p_budget_available,
    p_budget_complete,
    p_currency_code,
    p_source_generated_at,
    p_created_by
  )
  returning * into v_version;

  insert into public.audit_logs (
    organization_id,
    entity_type,
    entity_id,
    action_type,
    performed_by,
    performed_by_name,
    old_data,
    new_data,
    metadata
  )
  values (
    v_version.organization_id,
    'forecast_scenario_version',
    v_version.id,
    'FORECAST_SCENARIO_VERSION_DRAFT_CREATED',
    p_created_by,
    v_actor_name,
    null,
    jsonb_build_object(
      'id', v_version.id,
      'version_number', v_version.version_number,
      'status', v_version.status,
      'scenario_kind', v_version.scenario_kind,
      'forecast_ready', v_version.forecast_ready,
      'budget_available', v_version.budget_available,
      'budget_complete', v_version.budget_complete,
      'currency_code', v_version.currency_code,
      'source_generated_at', v_version.source_generated_at,
      'assumptions', v_version.assumptions
    ),
    jsonb_build_object(
      'moduleName', 'finance',
      'subsystem', 'forecasting',
      'organization_id', v_version.organization_id,
      'entity_id', v_version.entity_id,
      'period_id', v_version.period_id,
      'scenario_kind', v_version.scenario_kind,
      'version_number', v_version.version_number
    )
  );

  return query
    select *
    from public.finance_forecast_scenario_versions
    where id = v_version.id;
end;
$$;

revoke all on function public.finance_create_forecast_scenario_version_draft(
  uuid, uuid, uuid, text, jsonb, jsonb, boolean, boolean, boolean, text, timestamptz, uuid, text
) from public, anon, authenticated;
grant execute on function public.finance_create_forecast_scenario_version_draft(
  uuid, uuid, uuid, text, jsonb, jsonb, boolean, boolean, boolean, text, timestamptz, uuid, text
) to service_role;

drop function if exists public.finance_approve_forecast_scenario_version(uuid, uuid, uuid);

create function public.finance_approve_forecast_scenario_version(
  p_organization_id uuid,
  p_version_id uuid,
  p_approved_by uuid,
  p_performed_by_name text
)
returns setof public.finance_forecast_scenario_versions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_target public.finance_forecast_scenario_versions%rowtype;
  v_previous public.finance_forecast_scenario_versions%rowtype;
  v_approved public.finance_forecast_scenario_versions%rowtype;
  v_scope_key text;
  v_actor_name text;
  v_now timestamptz := now();
begin
  v_actor_name := coalesce(nullif(btrim(p_performed_by_name), ''), 'Authenticated User');

  select *
  into v_target
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
    return query
      select *
      from public.finance_forecast_scenario_versions
      where id = v_target.id;
    return;
  end if;

  v_scope_key := concat_ws(
    ':',
    v_target.organization_id::text,
    v_target.entity_id::text,
    v_target.period_id::text,
    v_target.scenario_kind
  );

  perform pg_advisory_xact_lock(hashtextextended(v_scope_key, 0));

  select *
  into v_previous
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
    set status = 'SUPERSEDED',
        superseded_at = v_now,
        updated_at = v_now
    where id = v_previous.id;

    insert into public.audit_logs (
      organization_id,
      entity_type,
      entity_id,
      action_type,
      performed_by,
      performed_by_name,
      old_data,
      new_data,
      metadata
    )
    values (
      v_previous.organization_id,
      'forecast_scenario_version',
      v_previous.id,
      'FORECAST_SCENARIO_VERSION_SUPERSEDED',
      p_approved_by,
      v_actor_name,
      jsonb_build_object(
        'status', v_previous.status,
        'approved_by', v_previous.approved_by,
        'approved_at', v_previous.approved_at,
        'superseded_at', v_previous.superseded_at
      ),
      jsonb_build_object(
        'status', 'SUPERSEDED',
        'approved_by', v_previous.approved_by,
        'approved_at', v_previous.approved_at,
        'superseded_at', v_now
      ),
      jsonb_build_object(
        'moduleName', 'finance',
        'subsystem', 'forecasting',
        'organization_id', v_previous.organization_id,
        'entity_id', v_previous.entity_id,
        'period_id', v_previous.period_id,
        'scenario_kind', v_previous.scenario_kind,
        'version_number', v_previous.version_number,
        'superseded_by_version_id', v_target.id
      )
    );
  end if;

  update public.finance_forecast_scenario_versions
  set status = 'APPROVED',
      approved_by = p_approved_by,
      approved_at = v_now,
      superseded_at = null,
      updated_at = v_now
  where id = v_target.id
  returning * into v_approved;

  insert into public.audit_logs (
    organization_id,
    entity_type,
    entity_id,
    action_type,
    performed_by,
    performed_by_name,
    old_data,
    new_data,
    metadata
  )
  values (
    v_approved.organization_id,
    'forecast_scenario_version',
    v_approved.id,
    'FORECAST_SCENARIO_VERSION_APPROVED',
    p_approved_by,
    v_actor_name,
    jsonb_build_object(
      'status', v_target.status,
      'approved_by', v_target.approved_by,
      'approved_at', v_target.approved_at,
      'superseded_at', v_target.superseded_at
    ),
    jsonb_build_object(
      'status', v_approved.status,
      'approved_by', v_approved.approved_by,
      'approved_at', v_approved.approved_at,
      'superseded_at', v_approved.superseded_at
    ),
    jsonb_build_object(
      'moduleName', 'finance',
      'subsystem', 'forecasting',
      'organization_id', v_approved.organization_id,
      'entity_id', v_approved.entity_id,
      'period_id', v_approved.period_id,
      'scenario_kind', v_approved.scenario_kind,
      'version_number', v_approved.version_number,
      'previous_approved_version_id', v_previous.id
    )
  );

  return next v_approved;
end;
$$;

revoke all on function public.finance_approve_forecast_scenario_version(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.finance_approve_forecast_scenario_version(uuid, uuid, uuid, text)
  to service_role;
