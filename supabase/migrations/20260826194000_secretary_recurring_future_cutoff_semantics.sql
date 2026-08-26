begin;

create or replace function public.secretary_cancel_recurring_meeting_future(
  p_organization_id uuid,
  p_series_id uuid,
  p_changed_by_party_id uuid,
  p_from timestamptz,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_series public.secretary_recurring_meeting_series%rowtype;
  v_lock_key bigint;
  v_version integer;
  v_cancelled_count integer;
  v_remaining_active integer;
  v_series_status text;
begin
  if p_organization_id is null or p_series_id is null or p_changed_by_party_id is null or p_from is null then
    raise exception 'SECRETARY_RECURRING_MEETING_CANCEL_FUTURE_SCOPE_REQUIRED' using errcode = '22023';
  end if;

  select * into v_series
  from public.secretary_recurring_meeting_series
  where organization_id = p_organization_id and id = p_series_id
  for update;
  if not found then
    raise exception 'SECRETARY_RECURRING_MEETING_SERIES_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_series.status <> 'ACTIVE' then
    raise exception 'SECRETARY_RECURRING_MEETING_SERIES_NOT_ACTIVE' using errcode = '22023';
  end if;

  v_lock_key := hashtextextended(p_organization_id::text || ':' || v_series.owner_party_id::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  update public.secretary_follow_ups
  set status = 'CANCELLED',
      completed_at = now(),
      updated_at = now(),
      result = 'Superseded by recurring meeting future-series cancellation'
  where organization_id = p_organization_id
    and status = 'PENDING'
    and metadata->>'secretary_recurring_series_id' = p_series_id::text
    and metadata @> '{"recurring_meeting_notification":true}'::jsonb;

  update public.secretary_calendar_events e
  set status = 'CANCELLED',
      updated_by_party_id = p_changed_by_party_id,
      updated_at = now(),
      metadata = coalesce(e.metadata, '{}'::jsonb) || jsonb_build_object(
        'recurring_occurrence_last_change', 'CANCEL_FUTURE',
        'recurring_series_cancelled_from', p_from,
        'recurring_series_cancel_reason', nullif(btrim(coalesce(p_reason, '')), ''),
        'attendance_not_inferred', true,
        'rsvp_not_inferred', true,
        'external_authority_used', false
      )
  from public.secretary_recurring_meeting_occurrences o
  where o.organization_id = p_organization_id
    and o.series_id = p_series_id
    and o.calendar_event_id = e.id
    and o.status in ('SCHEDULED','MOVED')
    and o.current_starts_at >= p_from;

  update public.secretary_recurring_meeting_occurrences
  set status = 'CANCELLED',
      change_version = change_version + 1,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'latest_change_kind', 'CANCEL_FUTURE',
        'latest_change_at', now(),
        'latest_change_by_party_id', p_changed_by_party_id,
        'cancelled_from', p_from,
        'cancel_reason', nullif(btrim(coalesce(p_reason, '')), ''),
        'recurring_notification_materialized', true,
        'attendance_not_inferred', true,
        'rsvp_not_inferred', true,
        'external_authority_used', false
      )
  where organization_id = p_organization_id
    and series_id = p_series_id
    and status in ('SCHEDULED','MOVED')
    and current_starts_at >= p_from;
  get diagnostics v_cancelled_count = row_count;

  if v_cancelled_count < 1 then
    raise exception 'SECRETARY_RECURRING_MEETING_NO_FUTURE_OCCURRENCES' using errcode = '22023';
  end if;

  select count(*) into v_remaining_active
  from public.secretary_recurring_meeting_occurrences
  where organization_id = p_organization_id
    and series_id = p_series_id
    and status in ('SCHEDULED','MOVED');

  v_series_status := case when v_remaining_active > 0 then 'ACTIVE' else 'CANCELLED' end;
  v_version := case
    when coalesce(v_series.metadata->>'series_change_version', '') ~ '^[0-9]+$'
      then (v_series.metadata->>'series_change_version')::integer + 1
    else 1
  end;

  update public.secretary_recurring_meeting_series
  set status = v_series_status,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'latest_change_kind', 'CANCEL_FUTURE',
        'series_change_version', v_version,
        'latest_change_at', now(),
        'latest_change_by_party_id', p_changed_by_party_id,
        'cancelled_from', p_from,
        'cancel_reason', nullif(btrim(coalesce(p_reason, '')), ''),
        'cancelled_future_occurrence_count', v_cancelled_count,
        'remaining_active_pre_cutoff_occurrence_count', v_remaining_active,
        'pre_cutoff_occurrences_remain_editable', (v_remaining_active > 0),
        'recurring_notification_materialized', false,
        'recurring_notification_last_error', null,
        'attendance_not_inferred', true,
        'rsvp_not_inferred', true,
        'external_authority_used', false
      )
  where organization_id = p_organization_id and id = p_series_id
  returning * into v_series;

  return jsonb_build_object(
    'series', to_jsonb(v_series),
    'change_kind', 'CANCEL_FUTURE',
    'change_version', v_version,
    'cancelled_future_occurrence_count', v_cancelled_count,
    'remaining_active_pre_cutoff_occurrence_count', v_remaining_active,
    'pre_cutoff_occurrences_remain_editable', (v_remaining_active > 0),
    'cancelled_from', p_from,
    'reason', nullif(btrim(coalesce(p_reason, '')), ''),
    'past_occurrences_preserved', true,
    'attendance_not_inferred', true,
    'rsvp_not_inferred', true,
    'external_authority_used', false
  );
end;
$$;

revoke all on function public.secretary_cancel_recurring_meeting_future(
  uuid, uuid, uuid, timestamptz, text
) from public, anon, authenticated;
grant execute on function public.secretary_cancel_recurring_meeting_future(
  uuid, uuid, uuid, timestamptz, text
) to service_role;

comment on function public.secretary_cancel_recurring_meeting_future(uuid, uuid, uuid, timestamptz, text) is
  'Cancels active occurrences at or after an explicit cutoff while preserving past and pre-cutoff active occurrences. The series remains ACTIVE while any pre-cutoff occurrence remains editable.';

commit;
