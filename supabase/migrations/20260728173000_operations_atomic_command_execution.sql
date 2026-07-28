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
  v_create_commands constant text[] := array['create', 'record', 'report', 'raise', 'set'];
  v_update_commands constant text[] := array['update', 'correct', 'revise'];
begin
  if p_organization_id is null then
    raise exception 'organization_id required';
  end if;

  if coalesce(trim(p_capability_id), '') = '' then
    raise exception 'capability_id required';
  end if;

  if coalesce(trim(p_command), '') = '' then
    raise exception 'command required';
  end if;

  if coalesce(trim(p_command_key), '') = '' then
    raise exception 'command_key required';
  end if;

  select *
    into v_existing
    from public.operations_command_ledger
   where organization_id = p_organization_id
     and entity_id is not distinct from p_entity_id
     and command_key = p_command_key
     and status = 'completed'
   limit 1;

  if found then
    return jsonb_build_object(
      'ok', true,
      'idempotent_replay', true,
      'command_key', p_command_key,
      'command_record_id', v_existing.id,
      'result', v_existing.result,
      'record', v_existing.result
    );
  end if;

  insert into public.operations_command_ledger (
    organization_id,
    entity_id,
    period_id,
    capability_id,
    command,
    command_key,
    payload,
    status,
    started_at
  ) values (
    p_organization_id,
    p_entity_id,
    p_period_id,
    p_capability_id,
    p_command,
    p_command_key,
    coalesce(p_payload, '{}'::jsonb),
    'running',
    now()
  )
  returning * into v_command;

  v_record_id := nullif(coalesce(
    p_payload ->> 'id',
    p_payload ->> 'record_id'
  ), '')::uuid;

  v_values := coalesce(p_payload, '{}'::jsonb)
    - 'id'
    - 'record_id'
    - 'command'
    - 'command_key'
    - 'idempotency_key'
    - 'idempotencyKey'
    - 'organization_id'
    - 'organizationId'
    - 'entity_id'
    - 'entityId'
    - 'period_id'
    - 'periodId'
    - 'capability_id';

  if p_command = any(v_create_commands) then
    insert into public.operations_records (
      organization_id,
      entity_id,
      period_id,
      capability_id,
      record_type,
      code,
      name,
      description,
      status,
      priority,
      assigned_to,
      scheduled_start,
      scheduled_end,
      due_at,
      completed_at,
      last_command,
      source_domain,
      source_type,
      source_id,
      attributes,
      created_by,
      updated_by,
      created_at,
      updated_at
    ) values (
      p_organization_id,
      p_entity_id,
      p_period_id,
      p_capability_id,
      coalesce(nullif(v_values ->> 'record_type', ''), p_record_type),
      nullif(v_values ->> 'code', ''),
      nullif(v_values ->> 'name', ''),
      nullif(v_values ->> 'description', ''),
      coalesce(nullif(v_values ->> 'status', ''), 'draft'),
      nullif(v_values ->> 'priority', ''),
      nullif(v_values ->> 'assigned_to', '')::uuid,
      nullif(v_values ->> 'scheduled_start', '')::timestamptz,
      nullif(v_values ->> 'scheduled_end', '')::timestamptz,
      nullif(v_values ->> 'due_at', '')::timestamptz,
      nullif(v_values ->> 'completed_at', '')::timestamptz,
      p_command,
      nullif(v_values ->> 'source_domain', ''),
      nullif(v_values ->> 'source_type', ''),
      nullif(coalesce(v_values ->> 'source_id', v_values ->> 'sourceId'), ''),
      coalesce(v_values -> 'attributes', v_values),
      nullif(v_values ->> 'created_by', '')::uuid,
      nullif(v_values ->> 'updated_by', '')::uuid,
      now(),
      now()
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
           assigned_to = case
             when v_values ? 'assigned_to' then nullif(v_values ->> 'assigned_to', '')::uuid
             else assigned_to
           end,
           scheduled_start = case
             when v_values ? 'scheduled_start' then nullif(v_values ->> 'scheduled_start', '')::timestamptz
             else scheduled_start
           end,
           scheduled_end = case
             when v_values ? 'scheduled_end' then nullif(v_values ->> 'scheduled_end', '')::timestamptz
             else scheduled_end
           end,
           due_at = case
             when v_values ? 'due_at' then nullif(v_values ->> 'due_at', '')::timestamptz
             else due_at
           end,
           completed_at = case
             when v_values ? 'completed_at' then nullif(v_values ->> 'completed_at', '')::timestamptz
             when p_command = 'complete' then now()
             else completed_at
           end,
           status = case
             when p_command = any(v_update_commands) then coalesce(nullif(v_values ->> 'status', ''), status)
             else p_command
           end,
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

    if not found then
      raise exception 'Operations record not found in requested scope';
    end if;
  end if;

  insert into public.operations_event_outbox (
    organization_id,
    entity_id,
    period_id,
    domain,
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    status,
    occurred_at
  ) values (
    p_organization_id,
    p_entity_id,
    p_period_id,
    'operations',
    format('operations.%s.%s', p_capability_id, p_command),
    p_record_type,
    v_record.id::text,
    jsonb_build_object(
      'domain', 'operations',
      'organization_id', p_organization_id,
      'entity_id', p_entity_id,
      'period_id', p_period_id,
      'capability_id', p_capability_id,
      'command', p_command,
      'aggregate_type', p_record_type,
      'aggregate_id', v_record.id,
      'command_record_id', v_command.id,
      'record', to_jsonb(v_record),
      'occurred_at', now()
    ),
    'pending',
    now()
  );

  update public.operations_command_ledger
     set status = 'completed',
         result = to_jsonb(v_record),
         completed_at = now(),
         error = null
   where id = v_command.id
   returning * into v_command;

  return jsonb_build_object(
    'ok', true,
    'idempotent_replay', false,
    'command_key', p_command_key,
    'command_record_id', v_command.id,
    'record', to_jsonb(v_record),
    'result', to_jsonb(v_record)
  );
exception
  when unique_violation then
    select *
      into v_existing
      from public.operations_command_ledger
     where organization_id = p_organization_id
       and entity_id is not distinct from p_entity_id
       and command_key = p_command_key
       and status = 'completed'
     limit 1;

    if found then
      return jsonb_build_object(
        'ok', true,
        'idempotent_replay', true,
        'command_key', p_command_key,
        'command_record_id', v_existing.id,
        'record', v_existing.result,
        'result', v_existing.result
      );
    end if;

    raise;
end;
$$;

revoke all on function public.execute_operations_command(uuid, uuid, uuid, text, text, text, text, jsonb) from public;
grant execute on function public.execute_operations_command(uuid, uuid, uuid, text, text, text, text, jsonb) to service_role;

comment on function public.execute_operations_command(uuid, uuid, uuid, text, text, text, text, jsonb) is
  'Atomically executes an Operations command, persists the record mutation, completes the idempotency ledger and enqueues the domain event.';
