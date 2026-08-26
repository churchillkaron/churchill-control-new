begin;

create or replace function public.secretary_reschedule_booked_meeting_coordination(
  p_organization_id uuid,
  p_coordination_id uuid,
  p_changed_by_party_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
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
  v_lock_key bigint;
  v_change_version integer;
  v_new_slot_id text;
  v_timezone text;
  v_location text;
  v_previous_schedule jsonb;
  v_current_schedule jsonb;
  v_history jsonb;
  v_candidate_slots jsonb;
  v_selected_count integer;
begin
  if p_organization_id is null or p_coordination_id is null or p_changed_by_party_id is null then
    raise exception 'SECRETARY_BOOKED_MEETING_CHANGE_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'SECRETARY_BOOKED_MEETING_RESCHEDULE_WINDOW_INVALID' using errcode = '22023';
  end if;

  select * into v_coordination
  from public.secretary_meeting_coordinations
  where organization_id = p_organization_id
    and id = p_coordination_id
  for update;

  if not found then
    raise exception 'SECRETARY_MEETING_COORDINATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_coordination.status <> 'BOOKED' or v_coordination.calendar_event_id is null then
    raise exception 'SECRETARY_BOOKED_MEETING_RESCHEDULE_REQUIRES_BOOKED_COORDINATION' using errcode = '22023';
  end if;

  select * into v_event
  from public.secretary_calendar_events
  where organization_id = p_organization_id
    and id = v_coordination.calendar_event_id
    and event_type = 'MEETING'
    and status in ('TENTATIVE','CONFIRMED')
  for update;

  if not found then
    raise exception 'SECRETARY_BOOKED_MEETING_CALENDAR_EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_lock_key := hashtextextended(
    p_organization_id::text || ':' || coalesce(v_coordination.owner_party_id::text, 'shared'),
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  if exists (
    select 1
    from public.secretary_calendar_events e
    where e.organization_id = p_organization_id
      and e.id <> v_event.id
      and e.status <> 'CANCELLED'
      and e.owner_party_id is not distinct from v_coordination.owner_party_id
      and e.starts_at < p_ends_at
      and e.ends_at > p_starts_at
  ) then
    raise exception 'SECRETARY_BOOKED_MEETING_RESCHEDULE_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  select count(*) into v_selected_count
  from jsonb_array_elements(v_coordination.candidate_slots) as slot(value)
  where slot.value->>'id' = v_coordination.selected_slot_id;

  if v_selected_count <> 1 then
    raise exception 'SECRETARY_BOOKED_MEETING_SELECTED_SLOT_EVIDENCE_INVALID' using errcode = '22023';
  end if;

  v_change_version := case
    when coalesce(v_coordination.metadata->>'schedule_change_version', '') ~ '^[0-9]+$'
      then (v_coordination.metadata->>'schedule_change_version')::integer + 1
    else 1
  end;
  v_new_slot_id := 'schedule-change-' || v_change_version::text;
  v_timezone := coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), v_event.timezone, v_coordination.timezone);
  v_location := case
    when p_location is null then v_event.location
    else nullif(btrim(p_location), '')
  end;

  v_previous_schedule := jsonb_build_object(
    'starts_at', v_event.starts_at,
    'ends_at', v_event.ends_at,
    'timezone', v_event.timezone,
    'location', v_event.location,
    'selected_slot_id', v_coordination.selected_slot_id
  );
  v_current_schedule := jsonb_build_object(
    'starts_at', p_starts_at,
    'ends_at', p_ends_at,
    'timezone', v_timezone,
    'location', v_location,
    'selected_slot_id', v_new_slot_id
  );
  v_history := case
    when jsonb_typeof(v_coordination.metadata->'schedule_change_history') = 'array'
      then v_coordination.metadata->'schedule_change_history'
    else '[]'::jsonb
  end;

  select jsonb_agg(
    case
      when slot.value->>'id' = v_coordination.selected_slot_id then jsonb_build_object(
        'id', v_new_slot_id,
        'starts_at', p_starts_at,
        'ends_at', p_ends_at,
        'timezone', v_timezone,
        'label', 'Rescheduled option ' || v_change_version::text
      )
      else slot.value
    end
    order by slot.ordinality
  )
  into v_candidate_slots
  from jsonb_array_elements(v_coordination.candidate_slots) with ordinality as slot(value, ordinality);

  update public.secretary_follow_ups
  set status = 'CANCELLED',
      completed_at = now(),
      updated_at = now(),
      result = 'Superseded by a newer booked meeting schedule'
  where organization_id = p_organization_id
    and status = 'PENDING'
    and metadata->>'secretary_meeting_coordination_id' = p_coordination_id::text
    and (
      metadata @> '{"meeting_booking_notification":true}'::jsonb
      or metadata @> '{"meeting_schedule_change_notification":true}'::jsonb
    );

  update public.secretary_calendar_events
  set starts_at = p_starts_at,
      ends_at = p_ends_at,
      timezone = v_timezone,
      location = v_location,
      updated_by_party_id = p_changed_by_party_id,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_secretary_meeting_change', 'RESCHEDULE',
        'last_secretary_meeting_change_at', now(),
        'last_secretary_meeting_change_by_party_id', p_changed_by_party_id,
        'schedule_change_version', v_change_version,
        'previous_schedule', v_previous_schedule,
        'current_schedule', v_current_schedule,
        'attendance_not_inferred', true,
        'rsvp_not_inferred', true,
        'external_authority_used', false
      )
  where organization_id = p_organization_id
    and id = v_event.id
  returning * into v_event;

  update public.secretary_meeting_coordinations
  set candidate_slots = v_candidate_slots,
      selected_slot_id = v_new_slot_id,
      timezone = v_timezone,
      location = v_location,
      lease_token = null,
      lease_expires_at = null,
      last_error = null,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'schedule_change_version', v_change_version,
        'latest_schedule_change_kind', 'RESCHEDULE',
        'latest_schedule_change_at', now(),
        'latest_schedule_change_by_party_id', p_changed_by_party_id,
        'previous_schedule', v_previous_schedule,
        'current_schedule', v_current_schedule,
        'schedule_change_history', v_history || jsonb_build_array(jsonb_build_object(
          'version', v_change_version,
          'kind', 'RESCHEDULE',
          'changed_at', now(),
          'changed_by_party_id', p_changed_by_party_id,
          'previous_schedule', v_previous_schedule,
          'current_schedule', v_current_schedule
        )),
        'meeting_change_notifications_materialized', false,
        'meeting_change_notification_last_error', null,
        'meeting_change_notifications_include_all_participants', true,
        'attendance_not_inferred', true,
        'rsvp_not_inferred', true,
        'external_authority_used', false
      )
  where organization_id = p_organization_id
    and id = p_coordination_id
  returning * into v_coordination;

  return jsonb_build_object(
    'coordination', to_jsonb(v_coordination),
    'calendar_event', to_jsonb(v_event),
    'change_version', v_change_version,
    'change_kind', 'RESCHEDULE',
    'previous_schedule', v_previous_schedule,
    'current_schedule', v_current_schedule,
    'stale_pending_notifications_cancelled', true,
    'attendance_not_inferred', true,
    'rsvp_not_inferred', true,
    'external_authority_used', false
  );
end;
$$;

create or replace function public.secretary_cancel_booked_meeting_coordination(
  p_organization_id uuid,
  p_coordination_id uuid,
  p_changed_by_party_id uuid,
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
  v_change_version integer;
  v_previous_schedule jsonb;
  v_history jsonb;
begin
  if p_organization_id is null or p_coordination_id is null or p_changed_by_party_id is null then
    raise exception 'SECRETARY_BOOKED_MEETING_CHANGE_SCOPE_REQUIRED' using errcode = '22023';
  end if;

  select * into v_coordination
  from public.secretary_meeting_coordinations
  where organization_id = p_organization_id
    and id = p_coordination_id
  for update;

  if not found then
    raise exception 'SECRETARY_MEETING_COORDINATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_coordination.status <> 'BOOKED' or v_coordination.calendar_event_id is null then
    raise exception 'SECRETARY_BOOKED_MEETING_CANCEL_REQUIRES_BOOKED_COORDINATION' using errcode = '22023';
  end if;

  select * into v_event
  from public.secretary_calendar_events
  where organization_id = p_organization_id
    and id = v_coordination.calendar_event_id
    and event_type = 'MEETING'
    and status in ('TENTATIVE','CONFIRMED')
  for update;

  if not found then
    raise exception 'SECRETARY_BOOKED_MEETING_CALENDAR_EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_change_version := case
    when coalesce(v_coordination.metadata->>'schedule_change_version', '') ~ '^[0-9]+$'
      then (v_coordination.metadata->>'schedule_change_version')::integer + 1
    else 1
  end;
  v_previous_schedule := jsonb_build_object(
    'starts_at', v_event.starts_at,
    'ends_at', v_event.ends_at,
    'timezone', v_event.timezone,
    'location', v_event.location,
    'selected_slot_id', v_coordination.selected_slot_id
  );
  v_history := case
    when jsonb_typeof(v_coordination.metadata->'schedule_change_history') = 'array'
      then v_coordination.metadata->'schedule_change_history'
    else '[]'::jsonb
  end;

  update public.secretary_follow_ups
  set status = 'CANCELLED',
      completed_at = now(),
      updated_at = now(),
      result = 'Superseded by booked meeting cancellation'
  where organization_id = p_organization_id
    and status = 'PENDING'
    and metadata->>'secretary_meeting_coordination_id' = p_coordination_id::text
    and (
      metadata @> '{"meeting_booking_notification":true}'::jsonb
      or metadata @> '{"meeting_schedule_change_notification":true}'::jsonb
    );

  update public.secretary_calendar_events
  set status = 'CANCELLED',
      updated_by_party_id = p_changed_by_party_id,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_secretary_meeting_change', 'CANCEL',
        'last_secretary_meeting_change_at', now(),
        'last_secretary_meeting_change_by_party_id', p_changed_by_party_id,
        'schedule_change_version', v_change_version,
        'previous_schedule', v_previous_schedule,
        'cancellation_reason', nullif(btrim(coalesce(p_reason, '')), ''),
        'attendance_not_inferred', true,
        'rsvp_not_inferred', true,
        'external_authority_used', false
      )
  where organization_id = p_organization_id
    and id = v_event.id
  returning * into v_event;

  update public.secretary_meeting_coordinations
  set status = 'CANCELLED',
      completed_at = now(),
      lease_token = null,
      lease_expires_at = null,
      last_error = null,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'schedule_change_version', v_change_version,
        'latest_schedule_change_kind', 'CANCEL',
        'latest_schedule_change_at', now(),
        'latest_schedule_change_by_party_id', p_changed_by_party_id,
        'previous_schedule', v_previous_schedule,
        'cancellation_reason', nullif(btrim(coalesce(p_reason, '')), ''),
        'cancelled_after_booking', true,
        'schedule_change_history', v_history || jsonb_build_array(jsonb_build_object(
          'version', v_change_version,
          'kind', 'CANCEL',
          'changed_at', now(),
          'changed_by_party_id', p_changed_by_party_id,
          'previous_schedule', v_previous_schedule,
          'reason', nullif(btrim(coalesce(p_reason, '')), '')
        )),
        'meeting_change_notifications_materialized', false,
        'meeting_change_notification_last_error', null,
        'meeting_change_notifications_include_all_participants', true,
        'attendance_not_inferred', true,
        'rsvp_not_inferred', true,
        'external_authority_used', false
      )
  where organization_id = p_organization_id
    and id = p_coordination_id
  returning * into v_coordination;

  return jsonb_build_object(
    'coordination', to_jsonb(v_coordination),
    'calendar_event', to_jsonb(v_event),
    'change_version', v_change_version,
    'change_kind', 'CANCEL',
    'previous_schedule', v_previous_schedule,
    'cancellation_reason', nullif(btrim(coalesce(p_reason, '')), ''),
    'stale_pending_notifications_cancelled', true,
    'attendance_not_inferred', true,
    'rsvp_not_inferred', true,
    'external_authority_used', false
  );
end;
$$;

revoke all on function public.secretary_reschedule_booked_meeting_coordination(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text
) from public, anon, authenticated;
revoke all on function public.secretary_cancel_booked_meeting_coordination(
  uuid, uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.secretary_reschedule_booked_meeting_coordination(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text
) to service_role;
grant execute on function public.secretary_cancel_booked_meeting_coordination(
  uuid, uuid, uuid, text
) to service_role;

comment on function public.secretary_reschedule_booked_meeting_coordination(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text
) is
  'Atomic executive-driven reschedule for an already-booked Secretary multi-party meeting. Locks the owner calendar, rejects overlaps, preserves schedule history, and marks participant notifications for Secretary-owned materialization.';
comment on function public.secretary_cancel_booked_meeting_coordination(
  uuid, uuid, uuid, text
) is
  'Atomic executive-driven cancellation for an already-booked Secretary multi-party meeting. Cancels the native calendar event, preserves history, and marks all-participant cancellation notifications for Secretary-owned materialization.';

commit;
