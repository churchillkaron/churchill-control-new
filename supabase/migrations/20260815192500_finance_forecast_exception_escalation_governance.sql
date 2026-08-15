alter table public.finance_forecast_exception_cases
  add column if not exists escalation_level text not null default 'NONE',
  add column if not exists escalation_reason text,
  add column if not exists escalation_changed_at timestamptz,
  add column if not exists escalation_revision bigint not null default 0;

alter table public.finance_forecast_exception_cases
  drop constraint if exists finance_forecast_exception_cases_escalation_level_check;

alter table public.finance_forecast_exception_cases
  add constraint finance_forecast_exception_cases_escalation_level_check
  check (escalation_level in ('NONE', 'ATTENTION', 'ESCALATED', 'CRITICAL'));

create index if not exists finance_forecast_exception_cases_escalation_idx
  on public.finance_forecast_exception_cases (
    organization_id,
    escalation_level,
    status,
    due_date,
    updated_at desc
  );

create or replace function public.finance_sync_forecast_exception_escalations(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_case public.finance_forecast_exception_cases%rowtype;
  v_target_level text;
  v_target_reason text;
  v_changed integer := 0;
  v_evaluated integer := 0;
  v_none integer := 0;
  v_attention integer := 0;
  v_escalated integer := 0;
  v_critical integer := 0;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  for v_case in
    select *
      from public.finance_forecast_exception_cases
     where organization_id = p_organization_id
     order by created_at, id
     for update
  loop
    v_evaluated := v_evaluated + 1;

    if v_case.status = 'RESOLVED' then
      v_target_level := 'NONE';
      v_target_reason := 'RESOLVED';
    elsif v_case.due_date is not null
      and v_case.due_date < current_date
      and v_case.assigned_to is null then
      v_target_level := 'CRITICAL';
      v_target_reason := 'OVERDUE_UNASSIGNED';
    elsif v_case.due_date is not null
      and v_case.due_date < current_date then
      v_target_level := 'ESCALATED';
      v_target_reason := 'OVERDUE';
    elsif v_case.assigned_to is null
      and v_case.due_date = current_date then
      v_target_level := 'ATTENTION';
      v_target_reason := 'UNASSIGNED_DUE_TODAY';
    elsif v_case.assigned_to is null then
      v_target_level := 'ATTENTION';
      v_target_reason := 'UNASSIGNED';
    elsif v_case.due_date = current_date then
      v_target_level := 'ATTENTION';
      v_target_reason := 'DUE_TODAY';
    else
      v_target_level := 'NONE';
      v_target_reason := null;
    end if;

    if v_target_level = 'NONE' then
      v_none := v_none + 1;
    elsif v_target_level = 'ATTENTION' then
      v_attention := v_attention + 1;
    elsif v_target_level = 'ESCALATED' then
      v_escalated := v_escalated + 1;
    elsif v_target_level = 'CRITICAL' then
      v_critical := v_critical + 1;
    end if;

    if v_case.escalation_level is distinct from v_target_level
       or v_case.escalation_reason is distinct from v_target_reason then
      insert into public.audit_logs (
        entity_type,
        entity_id,
        action_type,
        performed_by,
        performed_by_name,
        old_data,
        new_data,
        metadata,
        organization_id,
        created_at
      ) values (
        'forecast_exception_case',
        v_case.id,
        'FORECAST_EXCEPTION_ESCALATION_CHANGED',
        null,
        'Forecast Governance Engine',
        jsonb_build_object(
          'escalation_level', v_case.escalation_level,
          'escalation_reason', v_case.escalation_reason,
          'escalation_revision', v_case.escalation_revision
        ),
        jsonb_build_object(
          'escalation_level', v_target_level,
          'escalation_reason', v_target_reason,
          'escalation_revision', v_case.escalation_revision + 1
        ),
        jsonb_build_object(
          'module', 'finance',
          'subsystem', 'forecasting',
          'automation_source', 'forecast_exception_escalation_evaluator',
          'legal_entity_id', v_case.entity_id,
          'exception_type', v_case.exception_type,
          'occurrence_key', v_case.occurrence_key,
          'case_status', v_case.status,
          'assigned', v_case.assigned_to is not null,
          'due_date', v_case.due_date,
          'evaluation_date', current_date
        ),
        p_organization_id,
        now()
      );

      update public.finance_forecast_exception_cases
         set escalation_level = v_target_level,
             escalation_reason = v_target_reason,
             escalation_changed_at = now(),
             escalation_revision = escalation_revision + 1,
             revision = revision + 1,
             updated_at = now(),
             updated_by = null,
             updated_by_name = 'Forecast Governance Engine'
       where id = v_case.id;

      v_changed := v_changed + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'organization_id', p_organization_id,
    'evaluation_date', current_date,
    'evaluated', v_evaluated,
    'changed', v_changed,
    'levels', jsonb_build_object(
      'NONE', v_none,
      'ATTENTION', v_attention,
      'ESCALATED', v_escalated,
      'CRITICAL', v_critical
    )
  );
end;
$$;

revoke execute on function public.finance_sync_forecast_exception_escalations(uuid)
  from public, anon, authenticated;

grant execute on function public.finance_sync_forecast_exception_escalations(uuid)
  to service_role;
