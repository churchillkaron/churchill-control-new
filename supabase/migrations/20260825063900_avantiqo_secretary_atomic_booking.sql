begin;

create or replace function public.secretary_book_calendar_event(
  p_organization_id uuid,
  p_entity_id uuid default null,
  p_owner_party_id uuid default null,
  p_contact_party_id uuid default null,
  p_title text default 'Appointment',
  p_description text default null,
  p_event_type text default 'APPOINTMENT',
  p_status text default 'CONFIRMED',
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_timezone text default 'UTC',
  p_all_day boolean default false,
  p_location text default null,
  p_source text default 'secretary',
  p_created_by_party_id uuid default null,
  p_updated_by_party_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.secretary_calendar_events
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_event public.secretary_calendar_events%rowtype;
  v_lock_key bigint;
begin
  if p_organization_id is null then
    raise exception 'SECRETARY_ORGANIZATION_REQUIRED' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception 'SECRETARY_CALENDAR_TITLE_REQUIRED' using errcode = '22023';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'SECRETARY_CALENDAR_WINDOW_INVALID' using errcode = '22023';
  end if;

  v_lock_key := hashtextextended(
    p_organization_id::text || ':' || coalesce(p_owner_party_id::text, 'shared'),
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  if exists (
    select 1
    from public.secretary_calendar_events e
    where e.organization_id = p_organization_id
      and e.status <> 'CANCELLED'
      and (
        (p_owner_party_id is null and e.owner_party_id is null)
        or e.owner_party_id = p_owner_party_id
      )
      and e.starts_at < p_ends_at
      and e.ends_at > p_starts_at
  ) then
    raise exception 'SECRETARY_CALENDAR_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  insert into public.secretary_calendar_events (
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
    p_organization_id,
    p_entity_id,
    p_owner_party_id,
    p_contact_party_id,
    btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''),
    upper(coalesce(nullif(btrim(p_event_type), ''), 'APPOINTMENT')),
    upper(coalesce(nullif(btrim(p_status), ''), 'CONFIRMED')),
    p_starts_at,
    p_ends_at,
    coalesce(nullif(btrim(p_timezone), ''), 'UTC'),
    coalesce(p_all_day, false),
    nullif(btrim(coalesce(p_location, '')), ''),
    '{}'::jsonb,
    coalesce(nullif(btrim(p_source), ''), 'secretary'),
    p_created_by_party_id,
    p_updated_by_party_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_event;

  return v_event;
end;
$$;

revoke all on function public.secretary_book_calendar_event(
  uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, timestamptz,
  text, boolean, text, text, uuid, uuid, jsonb
) from public, anon, authenticated;

grant execute on function public.secretary_book_calendar_event(
  uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, timestamptz,
  text, boolean, text, text, uuid, uuid, jsonb
) to service_role;

comment on function public.secretary_book_calendar_event(
  uuid, uuid, uuid, uuid, text, text, text, text, timestamptz, timestamptz,
  text, boolean, text, text, uuid, uuid, jsonb
) is
  'Avantiqo-owned atomic Secretary booking. Serializes bookings per organization/owner and rejects overlapping active events without relying on any external calendar authority.';

commit;
