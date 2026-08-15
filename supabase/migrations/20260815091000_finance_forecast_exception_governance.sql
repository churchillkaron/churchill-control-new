create table public.finance_forecast_exception_cases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid not null references public.legal_entities(id) on delete cascade,
  exception_type text not null check (
    exception_type in (
      'MEASUREMENT_ERROR',
      'MISSING_APPROVED_FORECAST',
      'STALE_FORECAST_COVERAGE',
      'INSUFFICIENT_FINAL_HISTORY',
      'DETERIORATING_ACCURACY'
    )
  ),
  occurrence_key text not null,
  exception_severity text not null check (exception_severity in ('critical', 'warning', 'info')),
  exception_title text not null,
  exception_detail text not null,
  evidence jsonb not null default '[]'::jsonb,
  recommended_action text,
  status text not null default 'OPEN' check (status in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED')),
  assigned_to uuid,
  assigned_to_name text,
  due_date date,
  acknowledged_by uuid,
  acknowledged_by_name text,
  acknowledged_at timestamptz,
  resolved_by uuid,
  resolved_by_name text,
  resolved_at timestamptz,
  resolution_note text,
  created_by uuid,
  created_by_name text,
  updated_by uuid,
  updated_by_name text,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, occurrence_key)
);

create index finance_forecast_exception_cases_org_status_idx
  on public.finance_forecast_exception_cases (organization_id, status, updated_at desc);

create index finance_forecast_exception_cases_org_entity_idx
  on public.finance_forecast_exception_cases (organization_id, entity_id, updated_at desc);

create index finance_forecast_exception_cases_assignee_idx
  on public.finance_forecast_exception_cases (organization_id, assigned_to, status)
  where assigned_to is not null;

create index finance_forecast_exception_cases_due_idx
  on public.finance_forecast_exception_cases (organization_id, due_date, status)
  where due_date is not null and status <> 'RESOLVED';

alter table public.finance_forecast_exception_cases enable row level security;

revoke all on table public.finance_forecast_exception_cases from anon, authenticated;
grant select, insert, update, delete on table public.finance_forecast_exception_cases to service_role;

create or replace function public.finance_manage_forecast_exception_case(
  p_organization_id uuid,
  p_entity_id uuid,
  p_exception_type text,
  p_occurrence_key text,
  p_exception_severity text,
  p_exception_title text,
  p_exception_detail text,
  p_evidence jsonb,
  p_recommended_action text,
  p_action text,
  p_assigned_to uuid,
  p_assigned_to_name text,
  p_due_date date,
  p_resolution_note text,
  p_performed_by uuid,
  p_performed_by_name text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_action text := upper(trim(coalesce(p_action, '')));
  v_case public.finance_forecast_exception_cases%rowtype;
  v_old_data jsonb;
  v_new_data jsonb;
  v_action_type text;
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;
  if p_entity_id is null then
    raise exception 'entity_id required';
  end if;
  if nullif(trim(coalesce(p_occurrence_key, '')), '') is null then
    raise exception 'occurrence_key required';
  end if;
  if v_action not in ('ACKNOWLEDGE', 'ASSIGN', 'SET_DUE_DATE', 'RESOLVE') then
    raise exception 'Invalid forecast exception action';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || p_occurrence_key, 0)
  );

  select *
    into v_case
    from public.finance_forecast_exception_cases
   where organization_id = p_organization_id
     and occurrence_key = p_occurrence_key
   for update;

  if not found then
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
      created_by_name,
      updated_by,
      updated_by_name
    ) values (
      p_organization_id,
      p_entity_id,
      p_exception_type,
      p_occurrence_key,
      p_exception_severity,
      p_exception_title,
      p_exception_detail,
      coalesce(p_evidence, '[]'::jsonb),
      p_recommended_action,
      'OPEN',
      p_performed_by,
      nullif(trim(coalesce(p_performed_by_name, '')), ''),
      p_performed_by,
      nullif(trim(coalesce(p_performed_by_name, '')), '')
    )
    returning * into v_case;
  end if;

  if v_case.organization_id <> p_organization_id
     or v_case.entity_id <> p_entity_id
     or v_case.exception_type <> p_exception_type then
    raise exception 'Invalid forecast exception occurrence';
  end if;

  v_old_data := jsonb_build_object(
    'status', v_case.status,
    'assigned_to', v_case.assigned_to,
    'assigned_to_name', v_case.assigned_to_name,
    'due_date', v_case.due_date,
    'acknowledged_by', v_case.acknowledged_by,
    'acknowledged_by_name', v_case.acknowledged_by_name,
    'acknowledged_at', v_case.acknowledged_at,
    'resolved_by', v_case.resolved_by,
    'resolved_by_name', v_case.resolved_by_name,
    'resolved_at', v_case.resolved_at,
    'resolution_note', v_case.resolution_note,
    'revision', v_case.revision
  );

  if v_action = 'ACKNOWLEDGE' then
    if v_case.status = 'RESOLVED' then
      raise exception 'Resolved forecast exception cannot be acknowledged';
    end if;
    if v_case.acknowledged_at is not null then
      return to_jsonb(v_case);
    end if;

    update public.finance_forecast_exception_cases
       set status = 'ACKNOWLEDGED',
           acknowledged_by = p_performed_by,
           acknowledged_by_name = nullif(trim(coalesce(p_performed_by_name, '')), ''),
           acknowledged_at = now(),
           updated_by = p_performed_by,
           updated_by_name = nullif(trim(coalesce(p_performed_by_name, '')), ''),
           revision = revision + 1,
           updated_at = now()
     where id = v_case.id
     returning * into v_case;

    v_action_type := 'FORECAST_EXCEPTION_ACKNOWLEDGED';

  elsif v_action = 'ASSIGN' then
    if v_case.status = 'RESOLVED' then
      raise exception 'Resolved forecast exception cannot be reassigned';
    end if;
    if p_assigned_to is null then
      raise exception 'assigned_to required';
    end if;
    if nullif(trim(coalesce(p_assigned_to_name, '')), '') is null then
      raise exception 'assigned_to_name required';
    end if;
    if v_case.assigned_to is not distinct from p_assigned_to
       and v_case.assigned_to_name is not distinct from p_assigned_to_name then
      return to_jsonb(v_case);
    end if;

    update public.finance_forecast_exception_cases
       set assigned_to = p_assigned_to,
           assigned_to_name = trim(p_assigned_to_name),
           updated_by = p_performed_by,
           updated_by_name = nullif(trim(coalesce(p_performed_by_name, '')), ''),
           revision = revision + 1,
           updated_at = now()
     where id = v_case.id
     returning * into v_case;

    v_action_type := 'FORECAST_EXCEPTION_ASSIGNED';

  elsif v_action = 'SET_DUE_DATE' then
    if v_case.status = 'RESOLVED' then
      raise exception 'Resolved forecast exception due date cannot be changed';
    end if;
    if v_case.due_date is not distinct from p_due_date then
      return to_jsonb(v_case);
    end if;

    update public.finance_forecast_exception_cases
       set due_date = p_due_date,
           updated_by = p_performed_by,
           updated_by_name = nullif(trim(coalesce(p_performed_by_name, '')), ''),
           revision = revision + 1,
           updated_at = now()
     where id = v_case.id
     returning * into v_case;

    v_action_type := 'FORECAST_EXCEPTION_DUE_DATE_CHANGED';

  elsif v_action = 'RESOLVE' then
    if v_case.status = 'RESOLVED' then
      return to_jsonb(v_case);
    end if;
    if nullif(trim(coalesce(p_resolution_note, '')), '') is null then
      raise exception 'resolution_note required';
    end if;

    update public.finance_forecast_exception_cases
       set status = 'RESOLVED',
           resolved_by = p_performed_by,
           resolved_by_name = nullif(trim(coalesce(p_performed_by_name, '')), ''),
           resolved_at = now(),
           resolution_note = trim(p_resolution_note),
           updated_by = p_performed_by,
           updated_by_name = nullif(trim(coalesce(p_performed_by_name, '')), ''),
           revision = revision + 1,
           updated_at = now()
     where id = v_case.id
     returning * into v_case;

    v_action_type := 'FORECAST_EXCEPTION_RESOLVED';
  end if;

  v_new_data := jsonb_build_object(
    'status', v_case.status,
    'assigned_to', v_case.assigned_to,
    'assigned_to_name', v_case.assigned_to_name,
    'due_date', v_case.due_date,
    'acknowledged_by', v_case.acknowledged_by,
    'acknowledged_by_name', v_case.acknowledged_by_name,
    'acknowledged_at', v_case.acknowledged_at,
    'resolved_by', v_case.resolved_by,
    'resolved_by_name', v_case.resolved_by_name,
    'resolved_at', v_case.resolved_at,
    'resolution_note', v_case.resolution_note,
    'revision', v_case.revision
  );

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
    v_action_type,
    p_performed_by,
    nullif(trim(coalesce(p_performed_by_name, '')), ''),
    v_old_data,
    v_new_data,
    jsonb_build_object(
      'module', 'finance',
      'subsystem', 'forecasting',
      'legal_entity_id', p_entity_id,
      'exception_type', p_exception_type,
      'occurrence_key', p_occurrence_key,
      'exception_severity', p_exception_severity,
      'exception_title', p_exception_title,
      'control_source', 'derived_forecast_management_exception'
    ),
    p_organization_id,
    now()
  );

  return to_jsonb(v_case);
end;
$$;

revoke execute on function public.finance_manage_forecast_exception_case(
  uuid, uuid, text, text, text, text, text, jsonb, text, text,
  uuid, text, date, text, uuid, text
) from public, anon, authenticated;

grant execute on function public.finance_manage_forecast_exception_case(
  uuid, uuid, text, text, text, text, text, jsonb, text, text,
  uuid, text, date, text, uuid, text
) to service_role;
