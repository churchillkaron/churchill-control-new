begin;

-- Add caller-owned evidence to meeting coordination transitions without
-- duplicating the existing atomic scheduling/cancellation implementations.
-- The wrappers execute the legacy mutation and persist evidence in the same
-- PostgreSQL transaction, so evidence existence is authoritative proof that
-- the underlying transition committed.

create or replace function public.secretary_cancel_meeting_coordination(
  p_organization_id uuid,
  p_coordination_id uuid,
  p_cancelled_by_party_id uuid,
  p_evidence_id text
)
returns public.secretary_meeting_coordinations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_coordination public.secretary_meeting_coordinations%rowtype;
  v_history jsonb;
  v_existing jsonb;
begin
  if nullif(btrim(coalesce(p_evidence_id, '')), '') is null then
    raise exception 'SECRETARY_MEETING_COORDINATION_EVIDENCE_REQUIRED' using errcode = '22023';
  end if;

  select * into v_coordination
  from public.secretary_meeting_coordinations
  where organization_id = p_organization_id and id = p_coordination_id
  for update;
  if not found then
    raise exception 'SECRETARY_MEETING_COORDINATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_history := case
    when jsonb_typeof(v_coordination.metadata->'meeting_transition_evidence_history') = 'array'
      then v_coordination.metadata->'meeting_transition_evidence_history'
    else '[]'::jsonb
  end;
  select value into v_existing
  from jsonb_array_elements(v_history)
  where value->>'evidence_id' = p_evidence_id
  limit 1;

  if v_existing is not null then
    if v_existing->>'kind' <> 'CANCEL_COORDINATION' then
      raise exception 'SECRETARY_MEETING_TRANSITION_EVIDENCE_REUSE_CONFLICT' using errcode = '22023';
    end if;
    if v_coordination.status <> 'CANCELLED' then
      raise exception 'SECRETARY_MEETING_TRANSITION_EVIDENCE_STATE_CONFLICT' using errcode = '22023';
    end if;
    return v_coordination;
  end if;

  if v_coordination.status = 'CANCELLED' then
    raise exception 'SECRETARY_MEETING_COORDINATION_CANCELLED_WITHOUT_MATCHING_EVIDENCE' using errcode = '22023';
  end if;

  v_coordination := public.secretary_cancel_meeting_coordination(
    p_organization_id,
    p_coordination_id,
    p_cancelled_by_party_id
  );
  v_history := case
    when jsonb_typeof(v_coordination.metadata->'meeting_transition_evidence_history') = 'array'
      then v_coordination.metadata->'meeting_transition_evidence_history'
    else '[]'::jsonb
  end;

  update public.secretary_meeting_coordinations
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'meeting_transition_evidence_history', v_history || jsonb_build_array(jsonb_build_object(
          'kind', 'CANCEL_COORDINATION',
          'evidence_id', p_evidence_id,
          'recorded_at', now(),
          'changed_by_party_id', p_cancelled_by_party_id
        )),
        'latest_transition_evidence_kind', 'CANCEL_COORDINATION',
        'latest_transition_evidence_id', p_evidence_id
      ),
      updated_at = now()
  where organization_id = p_organization_id and id = p_coordination_id
  returning * into v_coordination;

  return v_coordination;
end;
$$;

create or replace function public.secretary_reschedule_booked_meeting_coordination(
  p_organization_id uuid,
  p_coordination_id uuid,
  p_changed_by_party_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_evidence_id text,
  p_timezone text default null,
  p_location text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_coordination public.secretary_meeting_coordinations%rowtype;
  v_event public.secretary_calendar_events%rowtype;
  v_result jsonb;
  v_history jsonb;
  v_existing jsonb;
  v_version integer;
begin
  if nullif(btrim(coalesce(p_evidence_id, '')), '') is null then
    raise exception 'SECRETARY_BOOKED_MEETING_EVIDENCE_REQUIRED' using errcode = '22023';
  end if;

  select * into v_coordination
  from public.secretary_meeting_coordinations
  where organization_id = p_organization_id and id = p_coordination_id
  for update;
  if not found then
    raise exception 'SECRETARY_MEETING_COORDINATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_history := case
    when jsonb_typeof(v_coordination.metadata->'meeting_transition_evidence_history') = 'array'
      then v_coordination.metadata->'meeting_transition_evidence_history'
    else '[]'::jsonb
  end;
  select value into v_existing
  from jsonb_array_elements(v_history)
  where value->>'evidence_id' = p_evidence_id
  limit 1;

  if v_existing is not null then
    if v_existing->>'kind' <> 'RESCHEDULE_BOOKED' then
      raise exception 'SECRETARY_MEETING_TRANSITION_EVIDENCE_REUSE_CONFLICT' using errcode = '22023';
    end if;
    select * into v_event from public.secretary_calendar_events
      where organization_id = p_organization_id and id = v_coordination.calendar_event_id;
    return jsonb_build_object(
      'coordination', to_jsonb(v_coordination),
      'calendar_event', to_jsonb(v_event),
      'change_version', (v_existing->>'change_version')::integer,
      'change_kind', 'RESCHEDULE',
      'previous_schedule', v_existing->'previous_schedule',
      'current_schedule', v_existing->'current_schedule',
      'transition_evidence_id', p_evidence_id,
      'transition_replay_safe', true,
      'attendance_not_inferred', true,
      'rsvp_not_inferred', true,
      'external_authority_used', false
    );
  end if;

  v_result := public.secretary_reschedule_booked_meeting_coordination(
    p_organization_id,
    p_coordination_id,
    p_changed_by_party_id,
    p_starts_at,
    p_ends_at,
    p_timezone,
    p_location
  );
  v_version := (v_result->>'change_version')::integer;

  select * into v_coordination
  from public.secretary_meeting_coordinations
  where organization_id = p_organization_id and id = p_coordination_id
  for update;
  v_history := case
    when jsonb_typeof(v_coordination.metadata->'meeting_transition_evidence_history') = 'array'
      then v_coordination.metadata->'meeting_transition_evidence_history'
    else '[]'::jsonb
  end;

  update public.secretary_meeting_coordinations
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'meeting_transition_evidence_history', v_history || jsonb_build_array(jsonb_build_object(
          'kind', 'RESCHEDULE_BOOKED',
          'evidence_id', p_evidence_id,
          'change_version', v_version,
          'recorded_at', now(),
          'changed_by_party_id', p_changed_by_party_id,
          'previous_schedule', v_result->'previous_schedule',
          'current_schedule', v_result->'current_schedule'
        )),
        'latest_transition_evidence_kind', 'RESCHEDULE_BOOKED',
        'latest_transition_evidence_id', p_evidence_id
      ),
      updated_at = now()
  where organization_id = p_organization_id and id = p_coordination_id
  returning * into v_coordination;

  v_result := jsonb_set(v_result, '{coordination}', to_jsonb(v_coordination), true)
    || jsonb_build_object('transition_evidence_id', p_evidence_id, 'transition_replay_safe', false);
  return v_result;
end;
$$;

create or replace function public.secretary_cancel_booked_meeting_coordination(
  p_organization_id uuid,
  p_coordination_id uuid,
  p_changed_by_party_id uuid,
  p_evidence_id text,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_coordination public.secretary_meeting_coordinations%rowtype;
  v_event public.secretary_calendar_events%rowtype;
  v_result jsonb;
  v_history jsonb;
  v_existing jsonb;
  v_version integer;
begin
  if nullif(btrim(coalesce(p_evidence_id, '')), '') is null then
    raise exception 'SECRETARY_BOOKED_MEETING_EVIDENCE_REQUIRED' using errcode = '22023';
  end if;

  select * into v_coordination
  from public.secretary_meeting_coordinations
  where organization_id = p_organization_id and id = p_coordination_id
  for update;
  if not found then
    raise exception 'SECRETARY_MEETING_COORDINATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_history := case
    when jsonb_typeof(v_coordination.metadata->'meeting_transition_evidence_history') = 'array'
      then v_coordination.metadata->'meeting_transition_evidence_history'
    else '[]'::jsonb
  end;
  select value into v_existing
  from jsonb_array_elements(v_history)
  where value->>'evidence_id' = p_evidence_id
  limit 1;

  if v_existing is not null then
    if v_existing->>'kind' <> 'CANCEL_BOOKED' then
      raise exception 'SECRETARY_MEETING_TRANSITION_EVIDENCE_REUSE_CONFLICT' using errcode = '22023';
    end if;
    select * into v_event from public.secretary_calendar_events
      where organization_id = p_organization_id and id = v_coordination.calendar_event_id;
    return jsonb_build_object(
      'coordination', to_jsonb(v_coordination),
      'calendar_event', to_jsonb(v_event),
      'change_version', (v_existing->>'change_version')::integer,
      'change_kind', 'CANCEL',
      'previous_schedule', v_existing->'previous_schedule',
      'cancellation_reason', v_existing->>'reason',
      'transition_evidence_id', p_evidence_id,
      'transition_replay_safe', true,
      'attendance_not_inferred', true,
      'rsvp_not_inferred', true,
      'external_authority_used', false
    );
  end if;

  if v_coordination.status = 'CANCELLED' then
    raise exception 'SECRETARY_BOOKED_MEETING_CANCELLED_WITHOUT_MATCHING_EVIDENCE' using errcode = '22023';
  end if;

  v_result := public.secretary_cancel_booked_meeting_coordination(
    p_organization_id,
    p_coordination_id,
    p_changed_by_party_id,
    p_reason
  );
  v_version := (v_result->>'change_version')::integer;

  select * into v_coordination
  from public.secretary_meeting_coordinations
  where organization_id = p_organization_id and id = p_coordination_id
  for update;
  v_history := case
    when jsonb_typeof(v_coordination.metadata->'meeting_transition_evidence_history') = 'array'
      then v_coordination.metadata->'meeting_transition_evidence_history'
    else '[]'::jsonb
  end;

  update public.secretary_meeting_coordinations
  set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'meeting_transition_evidence_history', v_history || jsonb_build_array(jsonb_build_object(
          'kind', 'CANCEL_BOOKED',
          'evidence_id', p_evidence_id,
          'change_version', v_version,
          'recorded_at', now(),
          'changed_by_party_id', p_changed_by_party_id,
          'previous_schedule', v_result->'previous_schedule',
          'reason', v_result->>'cancellation_reason'
        )),
        'latest_transition_evidence_kind', 'CANCEL_BOOKED',
        'latest_transition_evidence_id', p_evidence_id
      ),
      updated_at = now()
  where organization_id = p_organization_id and id = p_coordination_id
  returning * into v_coordination;

  v_result := jsonb_set(v_result, '{coordination}', to_jsonb(v_coordination), true)
    || jsonb_build_object('transition_evidence_id', p_evidence_id, 'transition_replay_safe', false);
  return v_result;
end;
$$;

revoke all on function public.secretary_cancel_meeting_coordination(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.secretary_reschedule_booked_meeting_coordination(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) from public, anon, authenticated;
revoke all on function public.secretary_cancel_booked_meeting_coordination(uuid, uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function public.secretary_cancel_meeting_coordination(uuid, uuid, uuid, text) to service_role;
grant execute on function public.secretary_reschedule_booked_meeting_coordination(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) to service_role;
grant execute on function public.secretary_cancel_booked_meeting_coordination(uuid, uuid, uuid, text, text) to service_role;

comment on function public.secretary_cancel_meeting_coordination(uuid, uuid, uuid, text) is
  'Evidence-bound atomic cancellation for an unbooked Secretary meeting coordination. The caller evidence is committed in the same transaction as participant and follow-up cancellation.';
comment on function public.secretary_reschedule_booked_meeting_coordination(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text) is
  'Evidence-bound wrapper around the atomic booked-meeting reschedule. Persists exact caller evidence in the same transaction for authoritative ambiguous-write recovery.';
comment on function public.secretary_cancel_booked_meeting_coordination(uuid, uuid, uuid, text, text) is
  'Evidence-bound wrapper around the atomic booked-meeting cancellation. Persists exact caller evidence in the same transaction for authoritative ambiguous-write recovery.';

commit;
