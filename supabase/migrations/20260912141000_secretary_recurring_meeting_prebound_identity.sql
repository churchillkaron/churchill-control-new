begin;

-- Prebind the recurring meeting series UUID before the atomic create RPC so an
-- ambiguous response can be resolved by the exact authoritative series read.

create or replace function public.secretary_create_recurring_meeting_series(
  p_series_id uuid,
  p_organization_id uuid,
  p_requested_by_party_id uuid,
  p_owner_party_id uuid,
  p_title text,
  p_timezone text,
  p_occurrences jsonb,
  p_participants jsonb,
  p_recurrence_rule jsonb default '{}'::jsonb,
  p_entity_id uuid default null,
  p_description text default null,
  p_location text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_series public.secretary_recurring_meeting_series%rowtype;
  v_occurrence jsonb;
  v_participant jsonb;
  v_occurrence_id uuid;
  v_event_id uuid;
  v_party_id uuid;
  v_action_type text;
  v_required boolean;
  v_index integer;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_count integer;
  v_lock_key bigint;
  v_event_ids jsonb := '[]'::jsonb;
begin
  if p_series_id is null or p_organization_id is null or p_requested_by_party_id is null or p_owner_party_id is null then
    raise exception 'SECRETARY_RECURRING_MEETING_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception 'SECRETARY_RECURRING_MEETING_TITLE_REQUIRED' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_timezone, '')), '') is null then
    raise exception 'SECRETARY_RECURRING_MEETING_TIMEZONE_REQUIRED' using errcode = '22023';
  end if;
  if jsonb_typeof(p_occurrences) <> 'array' then
    raise exception 'SECRETARY_RECURRING_MEETING_OCCURRENCES_REQUIRED' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_occurrences);
  if v_count < 2 or v_count > 104 then
    raise exception 'SECRETARY_RECURRING_MEETING_OCCURRENCE_COUNT_INVALID' using errcode = '22023';
  end if;
  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) < 1 or jsonb_array_length(p_participants) > 50 then
    raise exception 'SECRETARY_RECURRING_MEETING_PARTICIPANTS_INVALID' using errcode = '22023';
  end if;

  if exists (
    select 1
    from (
      select (value->>'occurrence_index')::integer as occurrence_index,
             (value->>'starts_at')::timestamptz as starts_at,
             (value->>'ends_at')::timestamptz as ends_at
      from jsonb_array_elements(p_occurrences)
    ) o
    where o.occurrence_index is null
       or o.occurrence_index < 1
       or o.occurrence_index > 104
       or o.starts_at is null
       or o.ends_at is null
       or o.ends_at <= o.starts_at
  ) then
    raise exception 'SECRETARY_RECURRING_MEETING_OCCURRENCE_INVALID' using errcode = '22023';
  end if;

  if (
    select count(*)
    from (
      select distinct (value->>'occurrence_index')::integer as occurrence_index
      from jsonb_array_elements(p_occurrences)
    ) d
  ) <> v_count then
    raise exception 'SECRETARY_RECURRING_MEETING_OCCURRENCE_INDEX_DUPLICATE' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_occurrences) with ordinality a(value, ordinality)
    join jsonb_array_elements(p_occurrences) with ordinality b(value, ordinality)
      on a.ordinality < b.ordinality
    where (a.value->>'starts_at')::timestamptz < (b.value->>'ends_at')::timestamptz
      and (a.value->>'ends_at')::timestamptz > (b.value->>'starts_at')::timestamptz
  ) then
    raise exception 'SECRETARY_RECURRING_MEETING_OCCURRENCES_OVERLAP' using errcode = '22023';
  end if;

  v_lock_key := hashtextextended(p_organization_id::text || ':' || p_owner_party_id::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  if exists (
    select 1
    from jsonb_array_elements(p_occurrences) o(value)
    join public.secretary_calendar_events e
      on e.organization_id = p_organization_id
     and e.owner_party_id is not distinct from p_owner_party_id
     and e.status <> 'CANCELLED'
     and e.starts_at < (o.value->>'ends_at')::timestamptz
     and e.ends_at > (o.value->>'starts_at')::timestamptz
  ) then
    raise exception 'SECRETARY_RECURRING_MEETING_CALENDAR_CONFLICT' using errcode = 'P0001';
  end if;

  insert into public.secretary_recurring_meeting_series (
    id,
    organization_id,
    entity_id,
    requested_by_party_id,
    owner_party_id,
    title,
    description,
    location,
    timezone,
    recurrence_rule,
    status,
    occurrence_count,
    first_starts_at,
    last_starts_at,
    metadata
  )
  select
    p_series_id,
    p_organization_id,
    p_entity_id,
    p_requested_by_party_id,
    p_owner_party_id,
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_location, '')), ''),
    btrim(p_timezone),
    coalesce(p_recurrence_rule, '{}'::jsonb),
    'ACTIVE',
    v_count,
    min((value->>'starts_at')::timestamptz),
    max((value->>'starts_at')::timestamptz),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'secretary_role', 'EXECUTIVE_SECRETARY',
      'recurring_meeting_series', true,
      'recurring_notification_materialized', false,
      'latest_change_kind', 'SERIES_CREATED',
      'series_change_version', 0,
      'attendance_not_inferred', true,
      'rsvp_not_inferred', true,
      'external_authority_used', false
    )
  from jsonb_array_elements(p_occurrences)
  returning * into v_series;

  for v_participant in select value from jsonb_array_elements(p_participants)
  loop
    begin
      v_party_id := nullif(btrim(coalesce(v_participant->>'party_id', '')), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'SECRETARY_RECURRING_MEETING_PARTICIPANT_INVALID' using errcode = '22023';
    end;
    if v_party_id is null then
      raise exception 'SECRETARY_RECURRING_MEETING_PARTICIPANT_REQUIRED' using errcode = '22023';
    end if;
    v_action_type := upper(nullif(btrim(coalesce(v_participant->>'action_type', '')), ''));
    if v_action_type not in ('CALL','MESSAGE','EMAIL') then
      raise exception 'SECRETARY_RECURRING_MEETING_PARTICIPANT_CHANNEL_INVALID' using errcode = '22023';
    end if;
    v_required := coalesce((v_participant->>'required')::boolean, true);

    insert into public.secretary_recurring_meeting_participants (
      organization_id,
      series_id,
      party_id,
      required,
      action_type,
      metadata
    ) values (
      p_organization_id,
      v_series.id,
      v_party_id,
      v_required,
      v_action_type,
      jsonb_build_object(
        'attendance_not_inferred', true,
        'rsvp_not_inferred', true,
        'external_authority_used', false
      )
    );
  end loop;

  for v_occurrence in
    select value
    from jsonb_array_elements(p_occurrences)
    order by (value->>'occurrence_index')::integer
  loop
    v_index := (v_occurrence->>'occurrence_index')::integer;
    v_starts_at := (v_occurrence->>'starts_at')::timestamptz;
    v_ends_at := (v_occurrence->>'ends_at')::timestamptz;
    v_occurrence_id := gen_random_uuid();
    v_event_id := gen_random_uuid();

    insert into public.secretary_calendar_events (
      id,
      organization_id,
      entity_id,
      owner_party_id,
      contact_party_id,
      title,
      description,
      event_type,
      status,
      starts_at,
      ends_at,
      timezone,
      all_day,
      location,
      recurrence,
      source,
      created_by_party_id,
      updated_by_party_id,
      metadata
    ) values (
      v_event_id,
      p_organization_id,
      p_entity_id,
      p_owner_party_id,
      null,
      btrim(p_title),
      nullif(btrim(coalesce(p_description, '')), ''),
      'MEETING',
      'CONFIRMED',
      v_starts_at,
      v_ends_at,
      btrim(p_timezone),
      false,
      nullif(btrim(coalesce(p_location, '')), ''),
      coalesce(p_recurrence_rule, '{}'::jsonb) || jsonb_build_object(
        'secretary_recurring_series_id', v_series.id,
        'occurrence_index', v_index
      ),
      'secretary_recurring_meeting',
      p_requested_by_party_id,
      p_requested_by_party_id,
      jsonb_build_object(
        'secretary_recurring_series_id', v_series.id,
        'secretary_recurring_occurrence_id', v_occurrence_id,
        'occurrence_index', v_index,
        'attendance_not_inferred', true,
        'rsvp_not_inferred', true,
        'external_authority_used', false
      )
    );

    insert into public.secretary_recurring_meeting_occurrences (
      id,
      organization_id,
      series_id,
      occurrence_index,
      calendar_event_id,
      original_starts_at,
      original_ends_at,
      current_starts_at,
      current_ends_at,
      status,
      change_version,
      metadata
    ) values (
      v_occurrence_id,
      p_organization_id,
      v_series.id,
      v_index,
      v_event_id,
      v_starts_at,
      v_ends_at,
      v_starts_at,
      v_ends_at,
      'SCHEDULED',
      0,
      jsonb_build_object(
        'recurring_notification_materialized', true,
        'attendance_not_inferred', true,
        'rsvp_not_inferred', true,
        'external_authority_used', false
      )
    );

    v_event_ids := v_event_ids || jsonb_build_array(v_event_id);
  end loop;

  return jsonb_build_object(
    'series', to_jsonb(v_series),
    'calendar_event_ids', v_event_ids,
    'occurrence_count', v_count,
    'series_created_atomically', true,
    'calendar_conflicts_checked_under_owner_lock', true,
    'attendance_not_inferred', true,
    'rsvp_not_inferred', true,
    'external_authority_used', false
  );
end;
$$;

revoke all on function public.secretary_create_recurring_meeting_series(uuid, uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.secretary_create_recurring_meeting_series(uuid, uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, uuid, text, text, jsonb) to service_role;

revoke execute on function public.secretary_create_recurring_meeting_series(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, uuid, text, text, jsonb) from service_role;
drop function public.secretary_create_recurring_meeting_series(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, uuid, text, text, jsonb);

comment on function public.secretary_create_recurring_meeting_series(uuid, uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, uuid, text, text, jsonb) is
  'Atomically creates a recurring Secretary meeting series from a caller-prebound series UUID, calendar occurrences and participant roster under the owner calendar lock.';

commit;
