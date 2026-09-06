create or replace function public.operations_lifecycle_target_status(
  p_lifecycle text,
  p_current_status text,
  p_command text
)
returns text
language plpgsql
immutable
as $$
declare
  v_lifecycle text := coalesce(nullif(trim(p_lifecycle), ''), 'master');
  v_status text := lower(coalesce(nullif(trim(p_current_status), ''), 'draft'));
  v_command text := lower(coalesce(nullif(trim(p_command), ''), ''));
begin
  v_status := case v_status
    when 'create' then 'draft'
    when 'record' then 'recorded'
    when 'start' then 'in_progress'
    when 'complete' then 'completed'
    when 'cancel' then 'cancelled'
    when 'reopen' then 'reopened'
    when 'activate' then 'active'
    when 'deactivate' then 'inactive'
    when 'archive' then 'archived'
    when 'submit' then 'submitted'
    when 'approve' then 'approved'
    when 'publish' then 'published'
    when 'revise' then 'revised'
    when 'assess' then 'assessed'
    when 'assign' then 'assigned'
    when 'resolve' then 'resolved'
    when 'close' then 'closed'
    when 'validate' then 'validated'
    when 'reject' then 'rejected'
    when 'supersede' then 'superseded'
    when 'void' then 'voided'
    else v_status
  end;

  if v_lifecycle = 'master' then
    if v_command = 'update' and v_status in ('draft', 'active', 'inactive') then return v_status; end if;
    if v_command = 'activate' and v_status in ('draft', 'inactive') then return 'active'; end if;
    if v_command = 'deactivate' and v_status = 'active' then return 'inactive'; end if;
    if v_command = 'archive' and v_status in ('draft', 'active', 'inactive') then return 'archived'; end if;
  elsif v_lifecycle = 'document' then
    if v_command = 'update' and v_status in ('draft', 'reopened') then return v_status; end if;
    if v_command = 'submit' and v_status in ('draft', 'reopened') then return 'submitted'; end if;
    if v_command = 'approve' and v_status = 'submitted' then return 'approved'; end if;
    if v_command = 'cancel' and v_status in ('draft', 'submitted', 'reopened') then return 'cancelled'; end if;
    if v_command = 'reopen' and v_status = 'cancelled' then return 'reopened'; end if;
  elsif v_lifecycle = 'execution' then
    if v_command = 'reschedule' and v_status in ('draft', 'assigned', 'released') then return v_status; end if;
    if v_command = 'assign' and v_status in ('draft', 'reopened') then return 'assigned'; end if;
    if v_command = 'release' and v_status = 'assigned' then return 'released'; end if;
    if v_command = 'start' and v_status in ('assigned', 'released', 'paused') then return 'in_progress'; end if;
    if v_command = 'pause' and v_status = 'in_progress' then return 'paused'; end if;
    if v_command = 'complete' and v_status = 'in_progress' then return 'completed'; end if;
    if v_command = 'cancel' and v_status in ('draft', 'assigned', 'released', 'in_progress', 'paused', 'reopened') then return 'cancelled'; end if;
    if v_command = 'reopen' and v_status in ('cancelled', 'completed') then return 'reopened'; end if;
  elsif v_lifecycle = 'planning' then
    if v_command = 'update' and v_status in ('draft', 'revised') then return v_status; end if;
    if v_command = 'publish' and v_status in ('draft', 'revised') then return 'published'; end if;
    if v_command = 'revise' and v_status = 'published' then return 'revised'; end if;
    if v_command = 'cancel' and v_status in ('draft', 'revised', 'published') then return 'cancelled'; end if;
    if v_command = 'archive' and v_status in ('cancelled', 'published') then return 'archived'; end if;
  elsif v_lifecycle = 'control' then
    if v_command = 'assess' and v_status in ('open', 'reopened') then return 'assessed'; end if;
    if v_command = 'assign' and v_status in ('open', 'assessed', 'reopened') then return 'assigned'; end if;
    if v_command = 'resolve' and v_status in ('assessed', 'assigned') then return 'resolved'; end if;
    if v_command = 'close' and v_status = 'resolved' then return 'closed'; end if;
    if v_command = 'reopen' and v_status in ('resolved', 'closed') then return 'reopened'; end if;
  elsif v_lifecycle = 'evidence' then
    if v_command = 'validate' and v_status = 'recorded' then return 'validated'; end if;
    if v_command = 'reject' and v_status = 'recorded' then return 'rejected'; end if;
    if v_command = 'supersede' and v_status in ('recorded', 'validated', 'rejected') then return 'superseded'; end if;
    if v_command = 'void' and v_status in ('recorded', 'validated', 'rejected') then return 'voided'; end if;
  end if;

  raise exception 'Invalid Operations lifecycle transition: %.% from %', v_lifecycle, v_command, v_status;
end;
$$;

create or replace function public.reschedule_service_visit_atomic(
  p_organization_id uuid,
  p_occurrence_id uuid,
  p_scheduled_start timestamptz,
  p_scheduled_end timestamptz,
  p_reason text,
  p_actor_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_occurrence public.service_plan_occurrences%rowtype;
  v_work_order public.operations_records%rowtype;
  v_command public.operations_command_ledger%rowtype;
  v_existing public.operations_command_ledger%rowtype;
  v_command_key text;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_change jsonb;
  v_occurrence_attributes jsonb;
  v_work_order_attributes jsonb;
  v_result jsonb;
begin
  if p_organization_id is null then raise exception 'organization_id required'; end if;
  if p_occurrence_id is null then raise exception 'occurrence_id required'; end if;
  if p_scheduled_start is null or p_scheduled_end is null then raise exception 'new appointment start and end are required'; end if;
  if p_scheduled_end <= p_scheduled_start then raise exception 'appointment end must be after start'; end if;
  if v_reason is null then raise exception 'reschedule reason required'; end if;
  if coalesce(trim(p_idempotency_key), '') = '' then raise exception 'idempotency_key required'; end if;

  select * into v_occurrence
    from public.service_plan_occurrences
   where organization_id = p_organization_id
     and id = p_occurrence_id
   for update;

  if not found then raise exception 'service occurrence not found'; end if;
  if v_occurrence.status <> 'generated' then
    raise exception 'only generated service visits can be rescheduled; occurrence status is %', v_occurrence.status;
  end if;
  if v_occurrence.work_order_id is null then raise exception 'service occurrence has no work order'; end if;

  select * into v_work_order
    from public.operations_records
   where organization_id = p_organization_id
     and id = v_occurrence.work_order_id
     and capability_id = 'work-orders'
     and source_domain = 'service-management'
   for update;

  if not found then raise exception 'service work order not found'; end if;
  if v_occurrence.entity_id is distinct from v_work_order.entity_id then
    raise exception 'service occurrence and work order entity scopes do not match';
  end if;
  if v_work_order.source_type not in ('service-plan-occurrence', 'service-follow-up-work-request') then
    raise exception 'unsupported service work order source type: %', coalesce(v_work_order.source_type, 'null');
  end if;
  if v_work_order.status not in ('draft', 'assigned', 'released') then
    raise exception 'service visit cannot be rescheduled after execution has started; work order status is %', v_work_order.status;
  end if;
  if v_work_order.source_type = 'service-plan-occurrence'
     and v_work_order.source_id is distinct from v_occurrence.id::text then
    raise exception 'service occurrence and work order lineage do not match';
  end if;

  v_command_key := concat('service-visit-reschedule:', p_occurrence_id::text, ':', trim(p_idempotency_key));

  select * into v_existing
    from public.operations_command_ledger
   where organization_id = p_organization_id
     and entity_id is not distinct from v_work_order.entity_id
     and command_key = v_command_key
     and status = 'completed'
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'idempotent_replay', true,
      'command_key', v_command_key,
      'command_record_id', v_existing.id,
      'result', v_existing.result
    );
  end if;

  insert into public.operations_command_ledger (
    organization_id, entity_id, period_id, capability_id, command, command_key, payload, status, started_at
  ) values (
    p_organization_id,
    v_work_order.entity_id,
    v_work_order.period_id,
    'work-orders',
    'reschedule',
    v_command_key,
    jsonb_build_object(
      'occurrence_id', p_occurrence_id,
      'work_order_id', v_work_order.id,
      'scheduled_start', p_scheduled_start,
      'scheduled_end', p_scheduled_end,
      'reason', v_reason,
      'actor_id', p_actor_id
    ),
    'running',
    now()
  ) returning * into v_command;

  v_change := jsonb_build_object(
    'schema_version', 1,
    'previous_scheduled_start', v_work_order.scheduled_start,
    'previous_scheduled_end', v_work_order.scheduled_end,
    'scheduled_start', p_scheduled_start,
    'scheduled_end', p_scheduled_end,
    'reason', v_reason,
    'actor_id', p_actor_id,
    'rescheduled_at', now()
  );

  v_occurrence_attributes := jsonb_set(
    coalesce(v_occurrence.attributes, '{}'::jsonb),
    '{service_delivery}',
    coalesce(v_occurrence.attributes -> 'service_delivery', '{}'::jsonb)
      || jsonb_build_object(
        'current_scheduled_start', p_scheduled_start,
        'current_scheduled_end', p_scheduled_end
      ),
    true
  ) || jsonb_build_object(
    'last_reschedule', v_change,
    'reschedule_history', coalesce(v_occurrence.attributes -> 'reschedule_history', '[]'::jsonb) || jsonb_build_array(v_change)
  );

  update public.service_plan_occurrences
     set attributes = v_occurrence_attributes,
         updated_at = now()
   where id = v_occurrence.id
     and organization_id = p_organization_id
   returning * into v_occurrence;

  v_work_order_attributes := jsonb_set(
    coalesce(v_work_order.attributes, '{}'::jsonb),
    '{service_delivery}',
    coalesce(v_work_order.attributes -> 'service_delivery', '{}'::jsonb)
      || jsonb_build_object(
        'current_scheduled_start', p_scheduled_start,
        'current_scheduled_end', p_scheduled_end
      ),
    true
  ) || jsonb_build_object(
    'last_reschedule', v_change,
    'reschedule_history', coalesce(v_work_order.attributes -> 'reschedule_history', '[]'::jsonb) || jsonb_build_array(v_change)
  );

  update public.operations_records
     set scheduled_start = p_scheduled_start,
         scheduled_end = p_scheduled_end,
         due_at = p_scheduled_end,
         attributes = v_work_order_attributes,
         last_command = 'reschedule',
         updated_by = coalesce(p_actor_id, updated_by),
         updated_at = now()
   where id = v_work_order.id
     and organization_id = p_organization_id
   returning * into v_work_order;

  insert into public.operations_event_outbox (
    organization_id, entity_id, period_id, domain, event_type, aggregate_type, aggregate_id, payload, status, occurred_at
  ) values (
    p_organization_id,
    v_work_order.entity_id,
    v_work_order.period_id,
    'operations',
    'operations.work-orders.rescheduled',
    v_work_order.record_type,
    v_work_order.id::text,
    jsonb_build_object(
      'domain', 'operations',
      'organization_id', p_organization_id,
      'entity_id', v_work_order.entity_id,
      'period_id', v_work_order.period_id,
      'capability_id', 'work-orders',
      'command', 'reschedule',
      'aggregate_type', v_work_order.record_type,
      'aggregate_id', v_work_order.id,
      'command_record_id', v_command.id,
      'occurrence_id', v_occurrence.id,
      'change', v_change,
      'record', to_jsonb(v_work_order),
      'occurred_at', now()
    ),
    'pending',
    now()
  );

  v_result := jsonb_build_object(
    'occurrence', to_jsonb(v_occurrence),
    'work_order', to_jsonb(v_work_order),
    'change', v_change
  );

  update public.operations_command_ledger
     set status = 'completed',
         result = v_result,
         completed_at = now(),
         error = null
   where id = v_command.id
   returning * into v_command;

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'command_key', v_command_key,
    'command_record_id', v_command.id,
    'result', v_result
  );
end;
$$;

revoke all on function public.reschedule_service_visit_atomic(uuid, uuid, timestamptz, timestamptz, text, uuid, text) from public, anon, authenticated;
grant execute on function public.reschedule_service_visit_atomic(uuid, uuid, timestamptz, timestamptz, text, uuid, text) to service_role;

comment on function public.reschedule_service_visit_atomic(uuid, uuid, timestamptz, timestamptz, text, uuid, text) is
  'Atomically reschedules the executable appointment for an unstarted Service Management occurrence while preserving immutable recurrence identity and Operations audit/outbox truth.';
