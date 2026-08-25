begin;

alter table public.secretary_calendar_events
  add column if not exists self_service_reference uuid;

update public.secretary_calendar_events
set self_service_reference = gen_random_uuid()
where self_service_reference is null;

alter table public.secretary_calendar_events
  alter column self_service_reference set default gen_random_uuid(),
  alter column self_service_reference set not null;

create unique index if not exists secretary_calendar_events_self_service_reference_uidx
  on public.secretary_calendar_events (organization_id, self_service_reference);

create or replace function public.secretary_reschedule_own_appointment_ref(
  p_organization_id uuid,
  p_contact_party_id uuid,
  p_self_service_reference uuid,
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
  v_event_id uuid;
begin
  select id into v_event_id
  from public.secretary_calendar_events
  where organization_id = p_organization_id
    and contact_party_id = p_contact_party_id
    and self_service_reference = p_self_service_reference
    and event_type = 'APPOINTMENT'
    and status in ('TENTATIVE','CONFIRMED')
  limit 1;

  if v_event_id is null then
    raise exception 'SECRETARY_SELF_SERVICE_APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return public.secretary_reschedule_own_appointment(
    p_organization_id,
    p_contact_party_id,
    v_event_id,
    p_starts_at,
    p_ends_at,
    p_timezone
  );
end;
$$;

create or replace function public.secretary_cancel_own_appointment_ref(
  p_organization_id uuid,
  p_contact_party_id uuid,
  p_self_service_reference uuid
)
returns public.secretary_calendar_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  select id into v_event_id
  from public.secretary_calendar_events
  where organization_id = p_organization_id
    and contact_party_id = p_contact_party_id
    and self_service_reference = p_self_service_reference
    and event_type = 'APPOINTMENT'
    and status in ('TENTATIVE','CONFIRMED')
  limit 1;

  if v_event_id is null then
    raise exception 'SECRETARY_SELF_SERVICE_APPOINTMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  return public.secretary_cancel_own_appointment(
    p_organization_id,
    p_contact_party_id,
    v_event_id
  );
end;
$$;

revoke all on function public.secretary_reschedule_own_appointment_ref(uuid, uuid, uuid, timestamptz, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.secretary_cancel_own_appointment_ref(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.secretary_reschedule_own_appointment_ref(uuid, uuid, uuid, timestamptz, timestamptz, text)
  to service_role;
grant execute on function public.secretary_cancel_own_appointment_ref(uuid, uuid, uuid)
  to service_role;

comment on column public.secretary_calendar_events.self_service_reference is
  'Opaque public-safe appointment reference for restricted contact self-service. Internal event IDs remain private.';

commit;
