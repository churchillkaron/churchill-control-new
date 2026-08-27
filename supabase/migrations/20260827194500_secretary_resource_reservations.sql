begin;

create index if not exists secretary_tasks_resource_reservation_idx
  on public.secretary_tasks (
    organization_id,
    ((metadata -> 'resource_reservation_v1' ->> 'resource_key'))
  )
  where source = 'secretary_resource_reservation' and status = 'IN_PROGRESS';

create or replace function public.secretary_reserve_resource_slot(
  p_reservation_id uuid,
  p_organization_id uuid,
  p_entity_id uuid default null,
  p_owner_party_id uuid default null,
  p_canonical_owner_party_id uuid default null,
  p_calendar_event_id uuid default null,
  p_resource_key text default null,
  p_resource_name text default null,
  p_resource_type text default 'OTHER',
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_timezone text default 'UTC',
  p_purpose text default null,
  p_location text default null,
  p_capacity integer default null,
  p_evidence_id text default null,
  p_payload_sha256 text default null,
  p_reserved_at timestamptz default now(),
  p_created_by_party_id uuid default null
)
returns public.secretary_tasks
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_task public.secretary_tasks%rowtype;
  v_resource_key text;
  v_resource_type text;
  v_lock_key bigint;
  v_register jsonb;
begin
  if p_reservation_id is null then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_ID_REQUIRED' using errcode = '22023';
  end if;
  if p_organization_id is null then
    raise exception 'SECRETARY_ORGANIZATION_REQUIRED' using errcode = '22023';
  end if;
  v_resource_key := lower(nullif(btrim(coalesce(p_resource_key, '')), ''));
  if v_resource_key is null then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_RESOURCE_KEY_REQUIRED' using errcode = '22023';
  end if;
  v_resource_type := upper(coalesce(nullif(btrim(p_resource_type), ''), 'OTHER'));
  if v_resource_type not in ('ROOM','EQUIPMENT','VEHICLE','DESK','SPACE','OTHER') then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_RESOURCE_TYPE_INVALID' using errcode = '22023';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_WINDOW_INVALID' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_evidence_id, '')), '') is null then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_EVIDENCE_REQUIRED' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_payload_sha256, '')), '') is null then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_PAYLOAD_HASH_REQUIRED' using errcode = '22023';
  end if;
  if p_capacity is not null and p_capacity < 1 then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_CAPACITY_INVALID' using errcode = '22023';
  end if;
  if p_calendar_event_id is not null and not exists (
    select 1 from public.secretary_calendar_events e
    where e.id = p_calendar_event_id and e.organization_id = p_organization_id
  ) then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_CALENDAR_EVENT_NOT_FOUND' using errcode = '22023';
  end if;

  select * into v_task
  from public.secretary_tasks
  where organization_id = p_organization_id and id = p_reservation_id;

  if found then
    if v_task.source <> 'secretary_resource_reservation' then
      raise exception 'SECRETARY_RESOURCE_RESERVATION_ID_CONFLICT' using errcode = 'P0001';
    end if;
    v_register := coalesce(v_task.metadata -> 'resource_reservation_v1', '{}'::jsonb);
    if v_register -> 'history' -> 0 ->> 'evidence_id' = p_evidence_id
       and v_register -> 'history' -> 0 ->> 'payload_sha256' = p_payload_sha256 then
      return v_task;
    end if;
    raise exception 'SECRETARY_RESOURCE_RESERVATION_EVIDENCE_REUSE_CONFLICT' using errcode = 'P0001';
  end if;

  v_lock_key := hashtextextended(p_organization_id::text || ':resource:' || v_resource_key, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  if exists (
    select 1
    from public.secretary_tasks t
    where t.organization_id = p_organization_id
      and t.source = 'secretary_resource_reservation'
      and t.status = 'IN_PROGRESS'
      and t.metadata -> 'resource_reservation_v1' ->> 'state' = 'RESERVED'
      and t.metadata -> 'resource_reservation_v1' ->> 'resource_key' = v_resource_key
      and nullif(t.metadata -> 'resource_reservation_v1' ->> 'starts_at', '')::timestamptz < p_ends_at
      and nullif(t.metadata -> 'resource_reservation_v1' ->> 'ends_at', '')::timestamptz > p_starts_at
  ) then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_register := jsonb_build_object(
    'contract', 'AVANTIQO_EXECUTIVE_SECRETARY_RESOURCE_RESERVATION_V1',
    'reservation_id', p_reservation_id,
    'state', 'RESERVED',
    'version', 1,
    'resource_key', v_resource_key,
    'resource_name', nullif(btrim(coalesce(p_resource_name, '')), ''),
    'resource_type', v_resource_type,
    'starts_at', p_starts_at,
    'ends_at', p_ends_at,
    'timezone', coalesce(nullif(btrim(p_timezone), ''), 'UTC'),
    'purpose', nullif(btrim(coalesce(p_purpose, '')), ''),
    'location', nullif(btrim(coalesce(p_location, '')), ''),
    'capacity', p_capacity,
    'calendar_event_id', p_calendar_event_id,
    'canonical_owner_party_id', p_canonical_owner_party_id,
    'operational_assignee_party_id', p_owner_party_id,
    'reserved_at', p_reserved_at,
    'released_at', null,
    'release_reason', null,
    'history', jsonb_build_array(jsonb_build_object(
      'event', 'RESOURCE_RESERVED',
      'evidence_id', p_evidence_id,
      'occurred_at', p_reserved_at,
      'recorded_by_party_id', p_created_by_party_id,
      'version', 1,
      'payload_sha256', p_payload_sha256
    ))
  );

  insert into public.secretary_tasks (
    id,
    organization_id,
    entity_id,
    owner_party_id,
    contact_party_id,
    calendar_event_id,
    title,
    details,
    status,
    priority,
    due_at,
    remind_at,
    completed_at,
    source,
    created_by_party_id,
    metadata
  ) values (
    p_reservation_id,
    p_organization_id,
    p_entity_id,
    p_owner_party_id,
    null,
    p_calendar_event_id,
    'Resource reservation: ' || coalesce(nullif(btrim(coalesce(p_resource_name, '')), ''), v_resource_key),
    'Atomic internal Secretary resource time-slot reservation.',
    'IN_PROGRESS',
    'NORMAL',
    p_starts_at,
    null,
    null,
    'secretary_resource_reservation',
    p_created_by_party_id,
    jsonb_build_object(
      'resource_reservation_v1', v_register,
      'secretary_resource_reservation', true,
      'secretary_resource_reservation_contract', 'AVANTIQO_EXECUTIVE_SECRETARY_RESOURCE_RESERVATION_V1',
      'secretary_resource_reservation_state', 'RESERVED',
      'ledger_task_is_execution_work', false,
      'external_booking_performed', false,
      'calendar_event_created', false,
      'calendar_event_modified', false,
      'room_setup_performed', false,
      'purchase_performed', false,
      'payment_authority_created', false,
      'signing_authority_created', false,
      'approval_authority_delegated', false,
      'binding_authority_delegated', false,
      'platform_permissions_mutated', false,
      'provider_calls_performed', false,
      'external_authority_used', false
    )
  )
  returning * into v_task;

  return v_task;
end;
$$;

create or replace function public.secretary_change_resource_slot(
  p_organization_id uuid,
  p_reservation_id uuid,
  p_expected_version integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text default 'UTC',
  p_purpose text default null,
  p_location text default null,
  p_capacity integer default null,
  p_calendar_event_id uuid default null,
  p_evidence_id text default null,
  p_payload_sha256 text default null,
  p_changed_at timestamptz default now(),
  p_changed_by_party_id uuid default null
)
returns public.secretary_tasks
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_task public.secretary_tasks%rowtype;
  v_register jsonb;
  v_history jsonb;
  v_replay jsonb;
  v_resource_key text;
  v_lock_key bigint;
  v_next_version integer;
begin
  if p_organization_id is null or p_reservation_id is null then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_ID_REQUIRED' using errcode = '22023';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_EXPECTED_VERSION_REQUIRED' using errcode = '22023';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_WINDOW_INVALID' using errcode = '22023';
  end if;
  if p_capacity is not null and p_capacity < 1 then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_CAPACITY_INVALID' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_evidence_id, '')), '') is null or nullif(btrim(coalesce(p_payload_sha256, '')), '') is null then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_EVIDENCE_REQUIRED' using errcode = '22023';
  end if;
  if p_calendar_event_id is not null and not exists (
    select 1 from public.secretary_calendar_events e
    where e.id = p_calendar_event_id and e.organization_id = p_organization_id
  ) then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_CALENDAR_EVENT_NOT_FOUND' using errcode = '22023';
  end if;

  select * into v_task
  from public.secretary_tasks
  where organization_id = p_organization_id and id = p_reservation_id
  for update;
  if not found or v_task.source <> 'secretary_resource_reservation' then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_register := coalesce(v_task.metadata -> 'resource_reservation_v1', '{}'::jsonb);
  v_history := coalesce(v_register -> 'history', '[]'::jsonb);
  select elem into v_replay
  from jsonb_array_elements(v_history) elem
  where elem ->> 'evidence_id' = p_evidence_id
  limit 1;
  if v_replay is not null then
    if v_replay ->> 'event' = 'RESOURCE_CHANGED' and v_replay ->> 'payload_sha256' = p_payload_sha256 then
      return v_task;
    end if;
    raise exception 'SECRETARY_RESOURCE_RESERVATION_EVIDENCE_REUSE_CONFLICT' using errcode = 'P0001';
  end if;

  if coalesce((v_register ->> 'version')::integer, 0) <> p_expected_version then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_STALE_VERSION' using errcode = 'P0001';
  end if;
  if v_register ->> 'state' <> 'RESERVED' then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_STATE_INVALID:%', coalesce(v_register ->> 'state', 'UNKNOWN') using errcode = 'P0001';
  end if;

  v_resource_key := v_register ->> 'resource_key';
  v_lock_key := hashtextextended(p_organization_id::text || ':resource:' || v_resource_key, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  if exists (
    select 1
    from public.secretary_tasks t
    where t.organization_id = p_organization_id
      and t.id <> p_reservation_id
      and t.source = 'secretary_resource_reservation'
      and t.status = 'IN_PROGRESS'
      and t.metadata -> 'resource_reservation_v1' ->> 'state' = 'RESERVED'
      and t.metadata -> 'resource_reservation_v1' ->> 'resource_key' = v_resource_key
      and nullif(t.metadata -> 'resource_reservation_v1' ->> 'starts_at', '')::timestamptz < p_ends_at
      and nullif(t.metadata -> 'resource_reservation_v1' ->> 'ends_at', '')::timestamptz > p_starts_at
  ) then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  v_next_version := p_expected_version + 1;
  v_history := v_history || jsonb_build_array(jsonb_build_object(
    'event', 'RESOURCE_CHANGED',
    'evidence_id', p_evidence_id,
    'occurred_at', p_changed_at,
    'recorded_by_party_id', p_changed_by_party_id,
    'version', v_next_version,
    'payload_sha256', p_payload_sha256,
    'prior_starts_at', v_register ->> 'starts_at',
    'prior_ends_at', v_register ->> 'ends_at'
  ));
  v_register := v_register || jsonb_build_object(
    'version', v_next_version,
    'starts_at', p_starts_at,
    'ends_at', p_ends_at,
    'timezone', coalesce(nullif(btrim(p_timezone), ''), 'UTC'),
    'purpose', nullif(btrim(coalesce(p_purpose, '')), ''),
    'location', nullif(btrim(coalesce(p_location, '')), ''),
    'capacity', p_capacity,
    'calendar_event_id', p_calendar_event_id,
    'last_changed_at', p_changed_at,
    'history', v_history
  );

  update public.secretary_tasks
  set calendar_event_id = p_calendar_event_id,
      due_at = p_starts_at,
      metadata = metadata || jsonb_build_object(
        'resource_reservation_v1', v_register,
        'secretary_resource_reservation_state', 'RESERVED'
      ),
      updated_at = now()
  where organization_id = p_organization_id and id = p_reservation_id
  returning * into v_task;

  return v_task;
end;
$$;

create or replace function public.secretary_release_resource_slot(
  p_organization_id uuid,
  p_reservation_id uuid,
  p_expected_version integer,
  p_evidence_id text,
  p_payload_sha256 text,
  p_released_at timestamptz default now(),
  p_reason text default null,
  p_released_by_party_id uuid default null
)
returns public.secretary_tasks
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_task public.secretary_tasks%rowtype;
  v_register jsonb;
  v_history jsonb;
  v_replay jsonb;
  v_resource_key text;
  v_lock_key bigint;
  v_next_version integer;
begin
  if p_organization_id is null or p_reservation_id is null then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_ID_REQUIRED' using errcode = '22023';
  end if;
  if p_expected_version is null or p_expected_version < 1 then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_EXPECTED_VERSION_REQUIRED' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_evidence_id, '')), '') is null or nullif(btrim(coalesce(p_payload_sha256, '')), '') is null then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_EVIDENCE_REQUIRED' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_RELEASE_REASON_REQUIRED' using errcode = '22023';
  end if;

  select * into v_task
  from public.secretary_tasks
  where organization_id = p_organization_id and id = p_reservation_id
  for update;
  if not found or v_task.source <> 'secretary_resource_reservation' then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_register := coalesce(v_task.metadata -> 'resource_reservation_v1', '{}'::jsonb);
  v_history := coalesce(v_register -> 'history', '[]'::jsonb);
  select elem into v_replay
  from jsonb_array_elements(v_history) elem
  where elem ->> 'evidence_id' = p_evidence_id
  limit 1;
  if v_replay is not null then
    if v_replay ->> 'event' = 'RESOURCE_RELEASED' and v_replay ->> 'payload_sha256' = p_payload_sha256 then
      return v_task;
    end if;
    raise exception 'SECRETARY_RESOURCE_RESERVATION_EVIDENCE_REUSE_CONFLICT' using errcode = 'P0001';
  end if;

  if coalesce((v_register ->> 'version')::integer, 0) <> p_expected_version then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_STALE_VERSION' using errcode = 'P0001';
  end if;
  if v_register ->> 'state' <> 'RESERVED' then
    raise exception 'SECRETARY_RESOURCE_RESERVATION_STATE_INVALID:%', coalesce(v_register ->> 'state', 'UNKNOWN') using errcode = 'P0001';
  end if;

  v_resource_key := v_register ->> 'resource_key';
  v_lock_key := hashtextextended(p_organization_id::text || ':resource:' || v_resource_key, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  v_next_version := p_expected_version + 1;
  v_history := v_history || jsonb_build_array(jsonb_build_object(
    'event', 'RESOURCE_RELEASED',
    'evidence_id', p_evidence_id,
    'occurred_at', p_released_at,
    'recorded_by_party_id', p_released_by_party_id,
    'version', v_next_version,
    'payload_sha256', p_payload_sha256,
    'reason', btrim(p_reason)
  ));
  v_register := v_register || jsonb_build_object(
    'version', v_next_version,
    'state', 'RELEASED',
    'released_at', p_released_at,
    'release_reason', btrim(p_reason),
    'history', v_history
  );

  update public.secretary_tasks
  set status = 'DONE',
      completed_at = p_released_at,
      metadata = metadata || jsonb_build_object(
        'resource_reservation_v1', v_register,
        'secretary_resource_reservation_state', 'RELEASED'
      ),
      updated_at = now()
  where organization_id = p_organization_id and id = p_reservation_id
  returning * into v_task;

  return v_task;
end;
$$;

revoke all on function public.secretary_reserve_resource_slot(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz, timestamptz,
  text, text, text, integer, text, text, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.secretary_reserve_resource_slot(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz, timestamptz,
  text, text, text, integer, text, text, timestamptz, uuid
) to service_role;

revoke all on function public.secretary_change_resource_slot(
  uuid, uuid, integer, timestamptz, timestamptz, text, text, text, integer, uuid, text, text, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.secretary_change_resource_slot(
  uuid, uuid, integer, timestamptz, timestamptz, text, text, text, integer, uuid, text, text, timestamptz, uuid
) to service_role;

revoke all on function public.secretary_release_resource_slot(
  uuid, uuid, integer, text, text, timestamptz, text, uuid
) from public, anon, authenticated;
grant execute on function public.secretary_release_resource_slot(
  uuid, uuid, integer, text, text, timestamptz, text, uuid
) to service_role;

comment on function public.secretary_reserve_resource_slot(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, text, timestamptz, timestamptz,
  text, text, text, integer, text, text, timestamptz, uuid
) is 'Atomically allocates one Avantiqo Secretary internal resource slot by organization/resource advisory lock. It creates no calendar event and performs no external booking.';

comment on function public.secretary_change_resource_slot(
  uuid, uuid, integer, timestamptz, timestamptz, text, text, text, integer, uuid, text, text, timestamptz, uuid
) is 'Atomically changes the time/details of an existing internal Secretary resource reservation while preserving its resource identity and overlap protection.';

comment on function public.secretary_release_resource_slot(
  uuid, uuid, integer, text, text, timestamptz, text, uuid
) is 'Atomically releases an existing internal Secretary resource reservation. It does not cancel or modify any linked calendar event.';

commit;
