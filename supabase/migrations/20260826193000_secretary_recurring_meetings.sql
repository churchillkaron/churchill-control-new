begin;

create table if not exists public.secretary_recurring_meeting_series (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid null,
  requested_by_party_id uuid not null,
  owner_party_id uuid not null,
  title text not null,
  description text null,
  location text null,
  timezone text not null,
  recurrence_rule jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','CANCELLED','COMPLETED')),
  occurrence_count integer not null check (occurrence_count between 2 and 104),
  first_starts_at timestamptz not null,
  last_starts_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_recurring_meeting_series_requester_fkey
    foreign key (organization_id, requested_by_party_id)
    references public.parties (organization_id, id)
    on delete restrict,
  constraint secretary_recurring_meeting_series_owner_fkey
    foreign key (organization_id, owner_party_id)
    references public.parties (organization_id, id)
    on delete restrict,
  check (last_starts_at >= first_starts_at)
);

create index if not exists secretary_recurring_meeting_series_owner_idx
  on public.secretary_recurring_meeting_series (organization_id, owner_party_id, status, first_starts_at);
create index if not exists secretary_recurring_meeting_series_notification_repair_idx
  on public.secretary_recurring_meeting_series (status, updated_at)
  where (metadata->>'recurring_notification_materialized') = 'false';

create table if not exists public.secretary_recurring_meeting_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  series_id uuid not null references public.secretary_recurring_meeting_series(id) on delete cascade,
  party_id uuid not null,
  required boolean not null default true,
  action_type text not null check (action_type in ('CALL','MESSAGE','EMAIL')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_recurring_meeting_participant_party_fkey
    foreign key (organization_id, party_id)
    references public.parties (organization_id, id)
    on delete cascade,
  unique (series_id, party_id)
);

create index if not exists secretary_recurring_meeting_participants_series_idx
  on public.secretary_recurring_meeting_participants (organization_id, series_id, created_at);

create table if not exists public.secretary_recurring_meeting_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  series_id uuid not null references public.secretary_recurring_meeting_series(id) on delete cascade,
  occurrence_index integer not null check (occurrence_index between 1 and 104),
  calendar_event_id uuid not null references public.secretary_calendar_events(id) on delete restrict,
  original_starts_at timestamptz not null,
  original_ends_at timestamptz not null,
  current_starts_at timestamptz not null,
  current_ends_at timestamptz not null,
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED','MOVED','SKIPPED','CANCELLED','COMPLETED')),
  change_version integer not null default 0 check (change_version >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (series_id, occurrence_index),
  unique (calendar_event_id),
  check (original_ends_at > original_starts_at),
  check (current_ends_at > current_starts_at)
);

create index if not exists secretary_recurring_meeting_occurrences_series_idx
  on public.secretary_recurring_meeting_occurrences (organization_id, series_id, occurrence_index);
create index if not exists secretary_recurring_meeting_occurrences_upcoming_idx
  on public.secretary_recurring_meeting_occurrences (organization_id, current_starts_at, status)
  where status in ('SCHEDULED','MOVED');
create index if not exists secretary_recurring_meeting_occurrence_notification_repair_idx
  on public.secretary_recurring_meeting_occurrences (status, updated_at)
  where (metadata->>'recurring_notification_materialized') = 'false';

alter table public.secretary_recurring_meeting_series enable row level security;
alter table public.secretary_recurring_meeting_participants enable row level security;
alter table public.secretary_recurring_meeting_occurrences enable row level security;

revoke all on public.secretary_recurring_meeting_series from anon, authenticated;
revoke all on public.secretary_recurring_meeting_participants from anon, authenticated;
revoke all on public.secretary_recurring_meeting_occurrences from anon, authenticated;

grant select, insert, update, delete on public.secretary_recurring_meeting_series to service_role;
grant select, insert, update, delete on public.secretary_recurring_meeting_participants to service_role;
grant select, insert, update, delete on public.secretary_recurring_meeting_occurrences to service_role;

create or replace function public.secretary_create_recurring_meeting_series(
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
  if p_organization_id is null or p_requested_by_party_id is null or p_owner_party_id is null then
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

create or replace function public.secretary_move_recurring_meeting_occurrence(
  p_organization_id uuid,
  p_occurrence_id uuid,
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
  v_occurrence public.secretary_recurring_meeting_occurrences%rowtype;
  v_series public.secretary_recurring_meeting_series%rowtype;
  v_event public.secretary_calendar_events%rowtype;
  v_lock_key bigint;
  v_version integer;
  v_timezone text;
  v_location text;
  v_history jsonb;
  v_previous jsonb;
begin
  if p_organization_id is null or p_occurrence_id is null or p_changed_by_party_id is null then
    raise exception 'SECRETARY_RECURRING_MEETING_CHANGE_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'SECRETARY_RECURRING_MEETING_MOVE_WINDOW_INVALID' using errcode = '22023';
  end if;

  select * into v_occurrence
  from public.secretary_recurring_meeting_occurrences
  where organization_id = p_organization_id and id = p_occurrence_id
  for update;
  if not found then
    raise exception 'SECRETARY_RECURRING_MEETING_OCCURRENCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_occurrence.status not in ('SCHEDULED','MOVED') then
    raise exception 'SECRETARY_RECURRING_MEETING_OCCURRENCE_NOT_MOVABLE' using errcode = '22023';
  end if;

  select * into v_series
  from public.secretary_recurring_meeting_series
  where organization_id = p_organization_id and id = v_occurrence.series_id
  for update;
  if not found or v_series.status <> 'ACTIVE' then
    raise exception 'SECRETARY_RECURRING_MEETING_SERIES_NOT_ACTIVE' using errcode = '22023';
  end if;

  select * into v_event
  from public.secretary_calendar_events
  where organization_id = p_organization_id
    and id = v_occurrence.calendar_event_id
    and status <> 'CANCELLED'
  for update;
  if not found then
    raise exception 'SECRETARY_RECURRING_MEETING_CALENDAR_EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_lock_key := hashtextextended(p_organization_id::text || ':' || v_series.owner_party_id::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  if exists (
    select 1
    from public.secretary_calendar_events e
    where e.organization_id = p_organization_id
      and e.id <> v_event.id
      and e.owner_party_id is not distinct from v_series.owner_party_id
      and e.status <> 'CANCELLED'
      and e.starts_at < p_ends_at
      and e.ends_at > p_starts_at
  ) then
    raise exception 'SECRETARY_RECURRING_MEETING_MOVE_CONFLICT' using errcode = 'P0001';
  end if;

  v_version := v_occurrence.change_version + 1;
  v_timezone := coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), v_event.timezone, v_series.timezone);
  v_location := case when p_location is null then v_event.location else nullif(btrim(p_location), '') end;
  v_previous := jsonb_build_object(
    'starts_at', v_occurrence.current_starts_at,
    'ends_at', v_occurrence.current_ends_at,
    'timezone', v_event.timezone,
    'location', v_event.location
  );
  v_history := case
    when jsonb_typeof(v_occurrence.metadata->'change_history') = 'array' then v_occurrence.metadata->'change_history'
    else '[]'::jsonb
  end;

  update public.secretary_follow_ups
  set status = 'CANCELLED',
      completed_at = now(),
      updated_at = now(),
      result = 'Superseded by newer recurring meeting occurrence change'
  where organization_id = p_organization_id
    and status = 'PENDING'
    and metadata->>'secretary_recurring_occurrence_id' = p_occurrence_id::text
    and metadata @> '{"recurring_meeting_change_notification":true}'::jsonb;

  update public.secretary_calendar_events
  set starts_at = p_starts_at,
      ends_at = p_ends_at,
      timezone = v_timezone,
      location = v_location,
      updated_by_party_id = p_changed_by_party_id,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'recurring_occurrence_last_change', 'MOVE',
        'recurring_occurrence_change_version', v_version,
        'recurring_occurrence_previous_schedule', v_previous,
        'attendance_not_inferred', true,
        'rsvp_not_inferred', true,
        'external_authority_used', false
      )
  where organization_id = p_organization_id and id = v_event.id
  returning * into v_event;

  update public.secretary_recurring_meeting_occurrences
  set current_starts_at = p_starts_at,
      current_ends_at = p_ends_at,
      status = 'MOVED',
      change_version = v_version,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'latest_change_kind', 'MOVE',
        'latest_change_version', v_version,
        'latest_change_at', now(),
        'latest_change_by_party_id', p_changed_by_party_id,
        'previous_schedule', v_previous,
        'current_schedule', jsonb_build_object(
          'starts_at', p_starts_at,
          'ends_at', p_ends_at,
          'timezone', v_timezone,
          'location', v_location
        ),
        'change_history', v_history || jsonb_build_array(jsonb_build_object(
          'version', v_version,
          'kind', 'MOVE',
          'changed_at', now(),
          'changed_by_party_id', p_changed_by_party_id,
          'previous_schedule', v_previous,
          'current_schedule', jsonb_build_object(
            'starts_at', p_starts_at,
            'ends_at', p_ends_at,
            'timezone', v_timezone,
            'location', v_location
          )
        )),
        'recurring_notification_materialized', false,
        'recurring_notification_last_error', null,
        'attendance_not_inferred', true,
        'rsvp_not_inferred', true,
        'external_authority_used', false
      )
  where organization_id = p_organization_id and id = p_occurrence_id
  returning * into v_occurrence;

  return jsonb_build_object(
    'series', to_jsonb(v_series),
    'occurrence', to_jsonb(v_occurrence),
    'calendar_event', to_jsonb(v_event),
    'change_kind', 'MOVE',
    'change_version', v_version,
    'attendance_not_inferred', true,
    'rsvp_not_inferred', true,
    'external_authority_used', false
  );
end;
$$;

create or replace function public.secretary_skip_recurring_meeting_occurrence(
  p_organization_id uuid,
  p_occurrence_id uuid,
  p_changed_by_party_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_occurrence public.secretary_recurring_meeting_occurrences%rowtype;
  v_series public.secretary_recurring_meeting_series%rowtype;
  v_event public.secretary_calendar_events%rowtype;
  v_version integer;
  v_history jsonb;
begin
  if p_organization_id is null or p_occurrence_id is null or p_changed_by_party_id is null then
    raise exception 'SECRETARY_RECURRING_MEETING_CHANGE_SCOPE_REQUIRED' using errcode = '22023';
  end if;

  select * into v_occurrence
  from public.secretary_recurring_meeting_occurrences
  where organization_id = p_organization_id and id = p_occurrence_id
  for update;
  if not found then
    raise exception 'SECRETARY_RECURRING_MEETING_OCCURRENCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_occurrence.status not in ('SCHEDULED','MOVED') then
    raise exception 'SECRETARY_RECURRING_MEETING_OCCURRENCE_NOT_SKIPPABLE' using errcode = '22023';
  end if;

  select * into v_series
  from public.secretary_recurring_meeting_series
  where organization_id = p_organization_id and id = v_occurrence.series_id
  for update;
  if not found or v_series.status <> 'ACTIVE' then
    raise exception 'SECRETARY_RECURRING_MEETING_SERIES_NOT_ACTIVE' using errcode = '22023';
  end if;

  select * into v_event
  from public.secretary_calendar_events
  where organization_id = p_organization_id and id = v_occurrence.calendar_event_id
  for update;
  if not found then
    raise exception 'SECRETARY_RECURRING_MEETING_CALENDAR_EVENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_version := v_occurrence.change_version + 1;
  v_history := case
    when jsonb_typeof(v_occurrence.metadata->'change_history') = 'array' then v_occurrence.metadata->'change_history'
    else '[]'::jsonb
  end;

  update public.secretary_follow_ups
  set status = 'CANCELLED',
      completed_at = now(),
      updated_at = now(),
      result = 'Superseded by recurring meeting occurrence skip'
  where organization_id = p_organization_id
    and status = 'PENDING'
    and metadata->>'secretary_recurring_occurrence_id' = p_occurrence_id::text
    and metadata @> '{"recurring_meeting_change_notification":true}'::jsonb;

  update public.secretary_calendar_events
  set status = 'CANCELLED',
      updated_by_party_id = p_changed_by_party_id,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'recurring_occurrence_last_change', 'SKIP',
        'recurring_occurrence_change_version', v_version,
        'recurring_occurrence_skip_reason', nullif(btrim(coalesce(p_reason, '')), ''),
        'attendance_not_inferred', true,
        'rsvp_not_inferred', true,
        'external_authority_used', false
      )
  where organization_id = p_organization_id and id = v_event.id
  returning * into v_event;

  update public.secretary_recurring_meeting_occurrences
  set status = 'SKIPPED',
      change_version = v_version,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'latest_change_kind', 'SKIP',
        'latest_change_version', v_version,
        'latest_change_at', now(),
        'latest_change_by_party_id', p_changed_by_party_id,
        'skip_reason', nullif(btrim(coalesce(p_reason, '')), ''),
        'change_history', v_history || jsonb_build_array(jsonb_build_object(
          'version', v_version,
          'kind', 'SKIP',
          'changed_at', now(),
          'changed_by_party_id', p_changed_by_party_id,
          'reason', nullif(btrim(coalesce(p_reason, '')), '')
        )),
        'recurring_notification_materialized', false,
        'recurring_notification_last_error', null,
        'attendance_not_inferred', true,
        'rsvp_not_inferred', true,
        'external_authority_used', false
      )
  where organization_id = p_organization_id and id = p_occurrence_id
  returning * into v_occurrence;

  return jsonb_build_object(
    'series', to_jsonb(v_series),
    'occurrence', to_jsonb(v_occurrence),
    'calendar_event', to_jsonb(v_event),
    'change_kind', 'SKIP',
    'change_version', v_version,
    'reason', nullif(btrim(coalesce(p_reason, '')), ''),
    'attendance_not_inferred', true,
    'rsvp_not_inferred', true,
    'external_authority_used', false
  );
end;
$$;

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

  v_version := case
    when coalesce(v_series.metadata->>'series_change_version', '') ~ '^[0-9]+$'
      then (v_series.metadata->>'series_change_version')::integer + 1
    else 1
  end;

  update public.secretary_recurring_meeting_series
  set status = 'CANCELLED',
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'latest_change_kind', 'CANCEL_FUTURE',
        'series_change_version', v_version,
        'latest_change_at', now(),
        'latest_change_by_party_id', p_changed_by_party_id,
        'cancelled_from', p_from,
        'cancel_reason', nullif(btrim(coalesce(p_reason, '')), ''),
        'cancelled_future_occurrence_count', v_cancelled_count,
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
    'cancelled_from', p_from,
    'reason', nullif(btrim(coalesce(p_reason, '')), ''),
    'past_occurrences_preserved', true,
    'attendance_not_inferred', true,
    'rsvp_not_inferred', true,
    'external_authority_used', false
  );
end;
$$;

revoke all on function public.secretary_create_recurring_meeting_series(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, uuid, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.secretary_move_recurring_meeting_occurrence(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text
) from public, anon, authenticated;
revoke all on function public.secretary_skip_recurring_meeting_occurrence(
  uuid, uuid, uuid, text
) from public, anon, authenticated;
revoke all on function public.secretary_cancel_recurring_meeting_future(
  uuid, uuid, uuid, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.secretary_create_recurring_meeting_series(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, uuid, text, text, jsonb
) to service_role;
grant execute on function public.secretary_move_recurring_meeting_occurrence(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text
) to service_role;
grant execute on function public.secretary_skip_recurring_meeting_occurrence(
  uuid, uuid, uuid, text
) to service_role;
grant execute on function public.secretary_cancel_recurring_meeting_future(
  uuid, uuid, uuid, timestamptz, text
) to service_role;

comment on table public.secretary_recurring_meeting_series is
  'Avantiqo-owned recurring executive meeting series. The series is durable Secretary state; individual canonical calendar events remain authoritative for occupied time.';
comment on table public.secretary_recurring_meeting_participants is
  'Persistent participant/channel roster for one recurring Secretary meeting series. Presence in the roster is not RSVP or attendance evidence.';
comment on table public.secretary_recurring_meeting_occurrences is
  'Materialized recurring meeting occurrence lifecycle linked one-to-one to native Secretary calendar events, preserving original schedule and change history.';
comment on function public.secretary_create_recurring_meeting_series(uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, uuid, text, text, jsonb) is
  'Atomically creates a finite recurring Secretary meeting series under one owner-calendar advisory lock, rejecting existing or internal schedule overlaps.';
comment on function public.secretary_move_recurring_meeting_occurrence(uuid, uuid, uuid, timestamptz, timestamptz, text, text) is
  'Moves exactly one recurring meeting occurrence under the owner-calendar lock without changing the rest of the series.';
comment on function public.secretary_skip_recurring_meeting_occurrence(uuid, uuid, uuid, text) is
  'Skips exactly one recurring meeting occurrence while preserving its historical row and cancelling only its canonical calendar event.';
comment on function public.secretary_cancel_recurring_meeting_future(uuid, uuid, uuid, timestamptz, text) is
  'Cancels active occurrences at or after an explicit cutoff while preserving past occurrences and their evidence.';

commit;
