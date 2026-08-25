begin;

create or replace function public.secretary_reschedule_own_appointment(
  p_organization_id uuid,
  p_contact_party_id uuid,
  p_event_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text default null
)
returns public.secretary_calendar_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.secretary_calendar_events%rowtype;
  v_lock_key bigint;
begin
  if p_organization_id is null or p_contact_party_id is null or p_event_id is null then
    raise exception 'SECRETARY_SELF_SERVICE_APPOINTMENT_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if p_starts_at is null or p_ends_at is null or p_ends_at <= p_starts_at then
    raise exception 'SECRETARY_SELF_SERVICE_APPOINTMENT_WINDOW_INVALID' using errcode = '22023';
  end if;

  select * into v_event
  from public.secretary_calendar_events
  where organization_id = p_organization_id
    and id = p_event_id
    and contact_party_id = p_contact_party_id
    and event_type = 'APPOINTMENT'
    and status in ('TENTATIVE','CONFIRMED')
  for update;

  if not found then
    raise exception 'SECRETARY_SELF_SERVICE_APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_lock_key := hashtextextended(
    p_organization_id::text || ':' || coalesce(v_event.owner_party_id::text, 'unowned'),
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  if exists (
    select 1
    from public.secretary_calendar_events e
    where e.organization_id = p_organization_id
      and e.id <> v_event.id
      and e.status <> 'CANCELLED'
      and e.owner_party_id is not distinct from v_event.owner_party_id
      and e.starts_at < p_ends_at
      and e.ends_at > p_starts_at
  ) then
    raise exception 'SECRETARY_SELF_SERVICE_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  update public.secretary_calendar_events
  set starts_at = p_starts_at,
      ends_at = p_ends_at,
      timezone = coalesce(nullif(btrim(coalesce(p_timezone, '')), ''), timezone),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_self_service_action', 'RESCHEDULE',
        'last_self_service_action_at', now()
      ),
      updated_at = now()
  where id = v_event.id
  returning * into v_event;

  return v_event;
end;
$$;

create or replace function public.secretary_cancel_own_appointment(
  p_organization_id uuid,
  p_contact_party_id uuid,
  p_event_id uuid
)
returns public.secretary_calendar_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.secretary_calendar_events%rowtype;
begin
  if p_organization_id is null or p_contact_party_id is null or p_event_id is null then
    raise exception 'SECRETARY_SELF_SERVICE_APPOINTMENT_SCOPE_REQUIRED' using errcode = '22023';
  end if;

  update public.secretary_calendar_events
  set status = 'CANCELLED',
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'last_self_service_action', 'CANCEL',
        'last_self_service_action_at', now()
      ),
      updated_at = now()
  where organization_id = p_organization_id
    and id = p_event_id
    and contact_party_id = p_contact_party_id
    and event_type = 'APPOINTMENT'
    and status in ('TENTATIVE','CONFIRMED')
  returning * into v_event;

  if v_event.id is null then
    raise exception 'SECRETARY_SELF_SERVICE_APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return v_event;
end;
$$;

revoke all on function public.secretary_reschedule_own_appointment(uuid, uuid, uuid, timestamptz, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.secretary_cancel_own_appointment(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.secretary_reschedule_own_appointment(uuid, uuid, uuid, timestamptz, timestamptz, text)
  to service_role;
grant execute on function public.secretary_cancel_own_appointment(uuid, uuid, uuid)
  to service_role;

comment on function public.secretary_reschedule_own_appointment(uuid, uuid, uuid, timestamptz, timestamptz, text) is
  'Restricted Secretary self-service reschedule. The event must be an active APPOINTMENT owned by the exact contact; other calendar events are inaccessible.';
comment on function public.secretary_cancel_own_appointment(uuid, uuid, uuid) is
  'Restricted Secretary self-service cancellation. The event must be an active APPOINTMENT owned by the exact contact; other calendar events are inaccessible.';

commit;
