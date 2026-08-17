begin;

create or replace function public.finance_enforce_forecast_override_review_closure()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.exception_type = 'APPROVAL_OVERRIDE_REVIEW'
     and new.status = 'RESOLVED'
     and old.status is distinct from 'RESOLVED' then
    if new.assigned_to is null then
      raise exception 'Assign the override review before resolving it';
    end if;

    if new.acknowledged_at is null or new.acknowledged_by is null then
      raise exception 'Acknowledge the override review before resolving it';
    end if;

    if nullif(btrim(coalesce(new.resolution_note, '')), '') is null then
      raise exception 'resolution_note required';
    end if;

    if new.resolved_at is null or new.resolved_by is null then
      raise exception 'Override review resolution actor and timestamp required';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.finance_enforce_forecast_override_review_closure() from public;
revoke all on function public.finance_enforce_forecast_override_review_closure() from anon;
revoke all on function public.finance_enforce_forecast_override_review_closure() from authenticated;
grant execute on function public.finance_enforce_forecast_override_review_closure() to service_role;

drop trigger if exists finance_forecast_override_review_closure_guard
  on public.finance_forecast_exception_cases;

create trigger finance_forecast_override_review_closure_guard
before update on public.finance_forecast_exception_cases
for each row
execute function public.finance_enforce_forecast_override_review_closure();

create unique index if not exists finance_override_review_closure_audit_unique
  on public.audit_logs (entity_id)
  where entity_type = 'forecast_exception_case'
    and action_type = 'FORECAST_OVERRIDE_REVIEW_CLOSED';

create or replace function public.finance_record_forecast_override_review_closure()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.exception_type = 'APPROVAL_OVERRIDE_REVIEW'
     and new.status = 'RESOLVED'
     and old.status is distinct from 'RESOLVED' then
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
      new.id,
      'FORECAST_OVERRIDE_REVIEW_CLOSED',
      new.resolved_by,
      new.resolved_by_name,
      jsonb_build_object(
        'status', old.status,
        'assigned_to', old.assigned_to,
        'assigned_to_name', old.assigned_to_name,
        'acknowledged_by', old.acknowledged_by,
        'acknowledged_by_name', old.acknowledged_by_name,
        'acknowledged_at', old.acknowledged_at,
        'resolution_note', old.resolution_note,
        'revision', old.revision
      ),
      jsonb_build_object(
        'status', new.status,
        'assigned_to', new.assigned_to,
        'assigned_to_name', new.assigned_to_name,
        'acknowledged_by', new.acknowledged_by,
        'acknowledged_by_name', new.acknowledged_by_name,
        'acknowledged_at', new.acknowledged_at,
        'resolved_by', new.resolved_by,
        'resolved_by_name', new.resolved_by_name,
        'resolved_at', new.resolved_at,
        'resolution_note', new.resolution_note,
        'escalation_level', new.escalation_level,
        'escalation_reason', new.escalation_reason,
        'escalation_revision', new.escalation_revision,
        'review_evidence', coalesce(new.evidence, '[]'::jsonb),
        'revision', new.revision
      ),
      jsonb_build_object(
        'module', 'finance',
        'subsystem', 'forecasting',
        'control_source', 'forecast_override_review_closure',
        'legal_entity_id', new.entity_id,
        'exception_type', new.exception_type,
        'occurrence_key', new.occurrence_key,
        'review_case_id', new.id,
        'review_revision', new.revision
      ),
      new.organization_id,
      coalesce(new.resolved_at, now())
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.finance_record_forecast_override_review_closure() from public;
revoke all on function public.finance_record_forecast_override_review_closure() from anon;
revoke all on function public.finance_record_forecast_override_review_closure() from authenticated;
grant execute on function public.finance_record_forecast_override_review_closure() to service_role;

drop trigger if exists finance_forecast_override_review_closure_audit
  on public.finance_forecast_exception_cases;

create trigger finance_forecast_override_review_closure_audit
after update on public.finance_forecast_exception_cases
for each row
execute function public.finance_record_forecast_override_review_closure();

create or replace function public.finance_protect_forecast_override_review_closure_audit()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  raise exception 'Forecast override review closure audit records are protected from update or delete';
end;
$$;

revoke all on function public.finance_protect_forecast_override_review_closure_audit() from public;
revoke all on function public.finance_protect_forecast_override_review_closure_audit() from anon;
revoke all on function public.finance_protect_forecast_override_review_closure_audit() from authenticated;
grant execute on function public.finance_protect_forecast_override_review_closure_audit() to service_role;

drop trigger if exists finance_forecast_override_review_closure_audit_protection
  on public.audit_logs;

create trigger finance_forecast_override_review_closure_audit_protection
before update or delete on public.audit_logs
for each row
when (
  old.entity_type = 'forecast_exception_case'
  and old.action_type = 'FORECAST_OVERRIDE_REVIEW_CLOSED'
)
execute function public.finance_protect_forecast_override_review_closure_audit();

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
)
select
  'forecast_exception_case',
  c.id,
  'FORECAST_OVERRIDE_REVIEW_CLOSED',
  c.resolved_by,
  c.resolved_by_name,
  jsonb_build_object('status', 'ACKNOWLEDGED'),
  jsonb_build_object(
    'status', c.status,
    'assigned_to', c.assigned_to,
    'assigned_to_name', c.assigned_to_name,
    'acknowledged_by', c.acknowledged_by,
    'acknowledged_by_name', c.acknowledged_by_name,
    'acknowledged_at', c.acknowledged_at,
    'resolved_by', c.resolved_by,
    'resolved_by_name', c.resolved_by_name,
    'resolved_at', c.resolved_at,
    'resolution_note', c.resolution_note,
    'escalation_level', c.escalation_level,
    'escalation_reason', c.escalation_reason,
    'escalation_revision', c.escalation_revision,
    'review_evidence', coalesce(c.evidence, '[]'::jsonb),
    'revision', c.revision
  ),
  jsonb_build_object(
    'module', 'finance',
    'subsystem', 'forecasting',
    'control_source', 'forecast_override_review_closure_backfill',
    'legal_entity_id', c.entity_id,
    'exception_type', c.exception_type,
    'occurrence_key', c.occurrence_key,
    'review_case_id', c.id,
    'review_revision', c.revision
  ),
  c.organization_id,
  c.resolved_at
from public.finance_forecast_exception_cases c
where c.exception_type = 'APPROVAL_OVERRIDE_REVIEW'
  and c.status = 'RESOLVED'
  and c.assigned_to is not null
  and c.acknowledged_by is not null
  and c.acknowledged_at is not null
  and c.resolved_by is not null
  and c.resolved_at is not null
  and nullif(btrim(coalesce(c.resolution_note, '')), '') is not null
on conflict do nothing;

commit;
