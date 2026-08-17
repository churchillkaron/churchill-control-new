alter table public.finance_forecast_exception_cases
  drop constraint if exists finance_forecast_exception_cases_exception_type_check;

alter table public.finance_forecast_exception_cases
  add constraint finance_forecast_exception_cases_exception_type_check
  check (
    exception_type in (
      'MEASUREMENT_ERROR',
      'MISSING_APPROVED_FORECAST',
      'STALE_FORECAST_COVERAGE',
      'INSUFFICIENT_FINAL_HISTORY',
      'DETERIORATING_ACCURACY',
      'APPROVAL_OVERRIDE_REVIEW'
    )
  );

create or replace function public.finance_open_forecast_override_review_case()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_occurrence_key text;
  v_case_id uuid;
  v_policy_blockers jsonb := '[]'::jsonb;
begin
  if new.approval_override is not true
     or new.status not in ('APPROVED', 'SUPERSEDED') then
    return new;
  end if;

  if new.forecast_ready is not true then
    v_policy_blockers := v_policy_blockers || jsonb_build_array('FORECAST_NOT_READY');
  end if;

  if new.scenario_kind = 'SCENARIOS_VS_BUDGET' then
    if new.budget_available is not true then
      v_policy_blockers := v_policy_blockers || jsonb_build_array('BUDGET_UNAVAILABLE');
    elsif new.budget_complete is not true then
      v_policy_blockers := v_policy_blockers || jsonb_build_array('BUDGET_INCOMPLETE');
    end if;
  end if;

  v_occurrence_key := concat_ws(
    ':',
    new.entity_id::text,
    'APPROVAL_OVERRIDE_REVIEW',
    new.id::text
  );

  insert into public.finance_forecast_exception_cases (
    organization_id,
    entity_id,
    exception_type,
    occurrence_key,
    exception_severity,
    exception_title,
    exception_detail,
    evidence,
    recommended_action,
    status,
    created_by,
    updated_by
  ) values (
    new.organization_id,
    new.entity_id,
    'APPROVAL_OVERRIDE_REVIEW',
    v_occurrence_key,
    'warning',
    'Exceptional forecast approval requires governance review',
    format(
      'Forecast version v%s (%s) was approved by exceptional override and remains a governed exception until review evidence is resolved.',
      new.version_number,
      new.scenario_kind
    ),
    jsonb_build_array(
      format('Forecast version: v%s %s', new.version_number, new.scenario_kind),
      format('Override reason: %s', new.approval_override_reason),
      format('Overridden blockers: %s', v_policy_blockers::text),
      format('Approved at: %s', coalesce(new.approved_at::text, 'Recorded approval timestamp unavailable'))
    ),
    'Assign an accountable Finance reviewer, set the review due date under organization policy, acknowledge the exception, and resolve it with documented review evidence.',
    'OPEN',
    new.approved_by,
    new.approved_by
  )
  on conflict (organization_id, occurrence_key) do nothing
  returning id into v_case_id;

  if v_case_id is not null then
    insert into public.audit_logs (
      organization_id,
      entity_type,
      entity_id,
      action_type,
      performed_by,
      performed_by_name,
      old_data,
      new_data,
      metadata,
      created_at
    ) values (
      new.organization_id,
      'forecast_exception_case',
      v_case_id,
      'FORECAST_OVERRIDE_REVIEW_OPENED',
      new.approved_by,
      null,
      null,
      jsonb_build_object(
        'status', 'OPEN',
        'exception_type', 'APPROVAL_OVERRIDE_REVIEW',
        'occurrence_key', v_occurrence_key
      ),
      jsonb_build_object(
        'moduleName', 'finance',
        'subsystem', 'forecasting',
        'control_source', 'forecast_approval_override',
        'forecast_version_id', new.id,
        'legal_entity_id', new.entity_id,
        'period_id', new.period_id,
        'scenario_kind', new.scenario_kind,
        'version_number', new.version_number,
        'approval_override_reason', new.approval_override_reason,
        'approval_policy_blockers', v_policy_blockers
      ),
      now()
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.finance_open_forecast_override_review_case()
  from public, anon, authenticated;
grant execute on function public.finance_open_forecast_override_review_case()
  to service_role;

drop trigger if exists finance_forecast_override_review_case_trigger
  on public.finance_forecast_scenario_versions;

create trigger finance_forecast_override_review_case_trigger
after insert or update of status, approval_override, approval_override_reason
on public.finance_forecast_scenario_versions
for each row
when (
  new.approval_override is true
  and new.status in ('APPROVED', 'SUPERSEDED')
)
execute function public.finance_open_forecast_override_review_case();

with source as (
  select
    version.id as version_id,
    version.organization_id,
    version.entity_id,
    version.period_id,
    version.scenario_kind,
    version.version_number,
    version.approval_override_reason,
    version.approved_by,
    version.approved_at,
    concat_ws(
      ':',
      version.entity_id::text,
      'APPROVAL_OVERRIDE_REVIEW',
      version.id::text
    ) as occurrence_key,
    (
      select coalesce(jsonb_agg(blocker), '[]'::jsonb)
      from (
        values
          (case when version.forecast_ready is not true then 'FORECAST_NOT_READY'::text end),
          (case
            when version.scenario_kind = 'SCENARIOS_VS_BUDGET'
             and version.budget_available is not true
            then 'BUDGET_UNAVAILABLE'::text
           end),
          (case
            when version.scenario_kind = 'SCENARIOS_VS_BUDGET'
             and version.budget_available is true
             and version.budget_complete is not true
            then 'BUDGET_INCOMPLETE'::text
           end)
      ) as blockers(blocker)
      where blocker is not null
    ) as approval_policy_blockers
  from public.finance_forecast_scenario_versions version
  where version.approval_override is true
    and version.status in ('APPROVED', 'SUPERSEDED')
), inserted as (
  insert into public.finance_forecast_exception_cases (
    organization_id,
    entity_id,
    exception_type,
    occurrence_key,
    exception_severity,
    exception_title,
    exception_detail,
    evidence,
    recommended_action,
    status,
    created_by,
    updated_by
  )
  select
    source.organization_id,
    source.entity_id,
    'APPROVAL_OVERRIDE_REVIEW',
    source.occurrence_key,
    'warning',
    'Exceptional forecast approval requires governance review',
    format(
      'Forecast version v%s (%s) was approved by exceptional override and remains a governed exception until review evidence is resolved.',
      source.version_number,
      source.scenario_kind
    ),
    jsonb_build_array(
      format('Forecast version: v%s %s', source.version_number, source.scenario_kind),
      format('Override reason: %s', source.approval_override_reason),
      format('Overridden blockers: %s', source.approval_policy_blockers::text),
      format('Approved at: %s', coalesce(source.approved_at::text, 'Recorded approval timestamp unavailable'))
    ),
    'Assign an accountable Finance reviewer, set the review due date under organization policy, acknowledge the exception, and resolve it with documented review evidence.',
    'OPEN',
    source.approved_by,
    source.approved_by
  from source
  on conflict (organization_id, occurrence_key) do nothing
  returning id, organization_id, occurrence_key, created_by
)
insert into public.audit_logs (
  organization_id,
  entity_type,
  entity_id,
  action_type,
  performed_by,
  performed_by_name,
  old_data,
  new_data,
  metadata,
  created_at
)
select
  inserted.organization_id,
  'forecast_exception_case',
  inserted.id,
  'FORECAST_OVERRIDE_REVIEW_OPENED',
  inserted.created_by,
  null,
  null,
  jsonb_build_object(
    'status', 'OPEN',
    'exception_type', 'APPROVAL_OVERRIDE_REVIEW',
    'occurrence_key', inserted.occurrence_key
  ),
  jsonb_build_object(
    'moduleName', 'finance',
    'subsystem', 'forecasting',
    'control_source', 'forecast_approval_override_backfill',
    'forecast_version_id', source.version_id,
    'legal_entity_id', source.entity_id,
    'period_id', source.period_id,
    'scenario_kind', source.scenario_kind,
    'version_number', source.version_number,
    'approval_override_reason', source.approval_override_reason,
    'approval_policy_blockers', source.approval_policy_blockers
  ),
  now()
from inserted
join source
  on source.organization_id = inserted.organization_id
 and source.occurrence_key = inserted.occurrence_key;
