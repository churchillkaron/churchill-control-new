create or replace function public.operations_lifecycle_initial_status(
  p_lifecycle text,
  p_command text default null
)
returns text
language sql
immutable
as $$
  select case lower(coalesce(nullif(trim(p_command), ''), ''))
    when 'record' then 'recorded'
    when 'report' then 'open'
    when 'raise' then 'open'
    when 'configure' then 'inactive'
    when 'prepare' then 'prepared'
    when 'issue' then 'issued'
    when 'open' then 'open'
    when 'dispatch' then 'dispatched'
    else case coalesce(nullif(trim(p_lifecycle), ''), 'master')
      when 'control' then 'open'
      when 'evidence' then 'recorded'
      else 'draft'
    end
  end;
$$;

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
  elsif v_lifecycle = 'commerce' then
    if v_command = 'configure' and v_status in ('draft', 'inactive', 'active') then return 'inactive'; end if;
    if v_command = 'activate' and v_status in ('draft', 'inactive') then return 'active'; end if;
    if v_command = 'deactivate' and v_status = 'active' then return 'inactive'; end if;
    if v_command = 'update' and v_status in ('draft', 'reopened', 'submitted') then return v_status; end if;
    if v_command = 'submit' and v_status in ('draft', 'reopened') then return 'submitted'; end if;
    if v_command = 'cancel' and v_status in ('draft', 'submitted', 'reopened', 'prepared', 'allocated', 'authorized', 'dispatched', 'held', 'released') then return 'cancelled'; end if;
    if v_command = 'reopen' and v_status in ('cancelled', 'closed') then return 'reopened'; end if;
    if v_command = 'allocate' and v_status = 'prepared' then return 'allocated'; end if;
    if v_command = 'authorize' and v_status in ('prepared', 'allocated') then return 'authorized'; end if;
    if v_command = 'capture' and v_status in ('prepared', 'allocated', 'authorized') then return 'captured'; end if;
    if v_command = 'void' and v_status in ('prepared', 'allocated', 'authorized', 'issued', 'delivered') then return 'voided'; end if;
    if v_command = 'refund' and v_status = 'captured' then return 'refunded'; end if;
    if v_command = 'reissue' and v_status in ('issued', 'delivered', 'voided') then return 'issued'; end if;
    if v_command = 'deliver' and v_status = 'issued' then return 'delivered'; end if;
    if v_command = 'record' and v_status in ('open', 'counted', 'reconciled') then return v_status; end if;
    if v_command = 'count' and v_status = 'open' then return 'counted'; end if;
    if v_command = 'reconcile' and v_status in ('open', 'counted') then return 'reconciled'; end if;
    if v_command = 'close' and v_status in ('open', 'counted', 'reconciled') then return 'closed'; end if;
    if v_command = 'redispatch' and v_status in ('dispatched', 'held', 'released') then return 'dispatched'; end if;
    if v_command = 'hold' and v_status in ('dispatched', 'released') then return 'held'; end if;
    if v_command = 'release' and v_status in ('held', 'dispatched') then return 'released'; end if;
  end if;

  raise exception 'Invalid Operations lifecycle transition: %.% from %', v_lifecycle, v_command, v_status;
end;
$$;

create or replace function public.guard_operations_record_lifecycle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lifecycle text;
  v_command text;
begin
  v_lifecycle := coalesce(
    nullif(new.attributes ->> '_operations_lifecycle', ''),
    case when tg_op = 'UPDATE' then nullif(old.attributes ->> '_operations_lifecycle', '') else null end,
    'master'
  );
  v_command := lower(coalesce(nullif(new.last_command, ''), ''));

  if tg_op = 'INSERT' then
    if v_command not in ('create', 'record', 'report', 'raise', 'set', 'configure', 'prepare', 'issue', 'open', 'dispatch') then
      raise exception 'Invalid Operations create command: %', v_command;
    end if;

    new.status := public.operations_lifecycle_initial_status(v_lifecycle, v_command);
    return new;
  end if;

  if v_command = '' then
    raise exception 'Operations lifecycle mutation requires last_command';
  end if;

  new.status := public.operations_lifecycle_target_status(
    v_lifecycle,
    old.status,
    v_command
  );

  if new.status = 'completed' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'completed' and v_command = 'reopen' then
    new.completed_at := null;
  end if;

  return new;
end;
$$;

create or replace function public.execute_operations_command(
  p_organization_id uuid,
  p_entity_id uuid,
  p_period_id uuid,
  p_capability_id text,
  p_record_type text,
  p_command text,
  p_command_key text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing public.operations_command_ledger%rowtype;
  v_command public.operations_command_ledger%rowtype;
  v_record public.operations_records%rowtype;
  v_record_id uuid;
  v_values jsonb;
  v_create_commands constant text[] := array['create', 'record', 'report', 'raise', 'set', 'configure', 'prepare', 'issue', 'open', 'dispatch'];
  v_update_commands constant text[] := array['update', 'correct', 'revise'];
begin
  if p_organization_id is null then raise exception 'organization_id required'; end if;
  if coalesce(trim(p_capability_id), '') = '' then raise exception 'capability_id required'; end if;
  if coalesce(trim(p_command), '') = '' then raise exception 'command required'; end if;
  if coalesce(trim(p_command_key), '') = '' then raise exception 'command_key required'; end if;

  select * into v_existing
    from public.operations_command_ledger
   where organization_id = p_organization_id
     and entity_id is not distinct from p_entity_id
     and command_key = p_command_key
     and status = 'completed'
   limit 1;

  if found then
    return jsonb_build_object('ok', true, 'idempotent_replay', true, 'command_key', p_command_key, 'command_record_id', v_existing.id, 'result', v_existing.result, 'record', v_existing.result);
  end if;

  insert into public.operations_command_ledger (
    organization_id, entity_id, period_id, capability_id, command,
    command_key, payload, status, started_at
  ) values (
    p_organization_id, p_entity_id, p_period_id, p_capability_id, p_command,
    p_command_key, coalesce(p_payload, '{}'::jsonb), 'running', now()
  ) returning * into v_command;

  v_record_id := nullif(coalesce(p_payload ->> 'id', p_payload ->> 'record_id'), '')::uuid;
  v_values := coalesce(p_payload, '{}'::jsonb)
    - 'id' - 'record_id' - 'command' - 'command_key' - 'idempotency_key'
    - 'idempotencyKey' - 'organization_id' - 'organizationId'
    - 'entity_id' - 'entityId' - 'period_id' - 'periodId' - 'capability_id';

  if p_command = any(v_create_commands) then
    insert into public.operations_records (
      organization_id, entity_id, period_id, capability_id, record_type,
      code, name, description, status, priority, assigned_to,
      scheduled_start, scheduled_end, due_at, completed_at, last_command,
      source_domain, source_type, source_id, attributes,
      created_by, updated_by, created_at, updated_at
    ) values (
      p_organization_id, p_entity_id, p_period_id, p_capability_id,
      coalesce(nullif(v_values ->> 'record_type', ''), p_record_type),
      nullif(v_values ->> 'code', ''), nullif(v_values ->> 'name', ''),
      nullif(v_values ->> 'description', ''),
      public.operations_lifecycle_initial_status(
        coalesce(v_values -> 'attributes' ->> '_operations_lifecycle', 'master'),
        p_command
      ),
      nullif(v_values ->> 'priority', ''), nullif(v_values ->> 'assigned_to', '')::uuid,
      nullif(v_values ->> 'scheduled_start', '')::timestamptz,
      nullif(v_values ->> 'scheduled_end', '')::timestamptz,
      nullif(v_values ->> 'due_at', '')::timestamptz,
      nullif(v_values ->> 'completed_at', '')::timestamptz,
      p_command,
      nullif(v_values ->> 'source_domain', ''), nullif(v_values ->> 'source_type', ''),
      nullif(coalesce(v_values ->> 'source_id', v_values ->> 'sourceId'), ''),
      coalesce(v_values -> 'attributes', v_values),
      nullif(v_values ->> 'created_by', '')::uuid,
      nullif(v_values ->> 'updated_by', '')::uuid,
      now(), now()
    ) returning * into v_record;
  else
    if v_record_id is null then
      raise exception 'Operations command %.% requires id or record_id', p_capability_id, p_command;
    end if;

    update public.operations_records
       set code = coalesce(nullif(v_values ->> 'code', ''), code),
           name = coalesce(nullif(v_values ->> 'name', ''), name),
           description = coalesce(nullif(v_values ->> 'description', ''), description),
           priority = coalesce(nullif(v_values ->> 'priority', ''), priority),
           assigned_to = case when v_values ? 'assigned_to' then nullif(v_values ->> 'assigned_to', '')::uuid else assigned_to end,
           scheduled_start = case when v_values ? 'scheduled_start' then nullif(v_values ->> 'scheduled_start', '')::timestamptz else scheduled_start end,
           scheduled_end = case when v_values ? 'scheduled_end' then nullif(v_values ->> 'scheduled_end', '')::timestamptz else scheduled_end end,
           due_at = case when v_values ? 'due_at' then nullif(v_values ->> 'due_at', '')::timestamptz else due_at end,
           completed_at = case when v_values ? 'completed_at' then nullif(v_values ->> 'completed_at', '')::timestamptz when p_command = 'complete' then now() else completed_at end,
           status = case when p_command = any(v_update_commands) then coalesce(nullif(v_values ->> 'status', ''), status) else p_command end,
           last_command = p_command,
           attributes = coalesce(attributes, '{}'::jsonb) || coalesce(v_values -> 'attributes', '{}'::jsonb),
           updated_by = coalesce(nullif(v_values ->> 'updated_by', '')::uuid, updated_by),
           updated_at = now()
     where id = v_record_id
       and organization_id = p_organization_id
       and entity_id is not distinct from p_entity_id
       and period_id is not distinct from p_period_id
       and capability_id = p_capability_id
     returning * into v_record;

    if not found then raise exception 'Operations record not found in requested scope'; end if;
  end if;

  insert into public.operations_event_outbox (
    organization_id, entity_id, period_id, domain, event_type,
    aggregate_type, aggregate_id, payload, status, occurred_at
  ) values (
    p_organization_id, p_entity_id, p_period_id, 'operations',
    format('operations.%s.%s', p_capability_id, p_command),
    p_record_type, v_record.id::text,
    jsonb_build_object(
      'domain', 'operations', 'organization_id', p_organization_id,
      'entity_id', p_entity_id, 'period_id', p_period_id,
      'capability_id', p_capability_id, 'command', p_command,
      'aggregate_type', p_record_type, 'aggregate_id', v_record.id,
      'command_record_id', v_command.id, 'record', to_jsonb(v_record),
      'occurred_at', now()
    ),
    'pending', now()
  );

  update public.operations_command_ledger
     set status = 'completed', result = to_jsonb(v_record),
         completed_at = now(), error = null
   where id = v_command.id
   returning * into v_command;

  return jsonb_build_object('ok', true, 'idempotent_replay', false, 'command_key', p_command_key, 'command_record_id', v_command.id, 'record', to_jsonb(v_record), 'result', to_jsonb(v_record));
exception
  when unique_violation then
    select * into v_existing
      from public.operations_command_ledger
     where organization_id = p_organization_id
       and entity_id is not distinct from p_entity_id
       and command_key = p_command_key
       and status = 'completed'
     limit 1;

    if found then
      return jsonb_build_object('ok', true, 'idempotent_replay', true, 'command_key', p_command_key, 'command_record_id', v_existing.id, 'record', v_existing.result, 'result', v_existing.result);
    end if;
    raise;
end;
$$;

revoke all on function public.execute_operations_command(uuid, uuid, uuid, text, text, text, text, jsonb) from public;
grant execute on function public.execute_operations_command(uuid, uuid, uuid, text, text, text, text, jsonb) to service_role;

comment on function public.operations_lifecycle_initial_status(text, text) is
  'Returns the command-aware initial state for canonical industry-neutral Operations records.';
comment on function public.operations_lifecycle_target_status(text, text, text) is
  'Returns governed target states for canonical Operations, including commerce execution.';
