-- Atomic Hotel digital pre-arrival completion.
-- The public token is resolved server-side. This service-role-only function revalidates the
-- open session under lock, then commits guest details, explicit consent evidence and booking
-- arrival readiness together. Any booking business-day barrier failure rolls all three back.

create or replace function public.hotel_complete_pre_arrival_guarded(
  p_session_id uuid,
  p_full_name text,
  p_email text default null,
  p_phone text default null,
  p_preferred_language text default null,
  p_estimated_arrival_at timestamptz default null,
  p_marketing_consent boolean default false
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_session public.hotel_pre_arrival_sessions%rowtype;
  v_booking public.hotel_bookings%rowtype;
  v_guest public.hotel_guests%rowtype;
  v_completed_at timestamptz := now();
  v_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_language text := nullif(btrim(coalesce(p_preferred_language, '')), '');
  v_registration_data jsonb;
  v_consent_data jsonb;
begin
  if p_session_id is null then
    raise exception 'HOTEL_PREARRIVAL_SESSION_REQUIRED';
  end if;
  if v_name is null then
    raise exception 'HOTEL_PREARRIVAL_GUEST_NAME_REQUIRED';
  end if;

  select * into v_session
  from public.hotel_pre_arrival_sessions s
  where s.id = p_session_id
  for update;

  if not found then
    raise exception 'HOTEL_PREARRIVAL_SESSION_NOT_FOUND';
  end if;
  if upper(coalesce(v_session.status, '')) <> 'OPEN' then
    raise exception 'HOTEL_PREARRIVAL_SESSION_NOT_OPEN';
  end if;
  if v_session.expires_at is null or v_session.expires_at <= v_completed_at then
    raise exception 'HOTEL_PREARRIVAL_SESSION_EXPIRED';
  end if;
  if v_session.organization_id is null or v_session.booking_id is null then
    raise exception 'HOTEL_PREARRIVAL_SESSION_SCOPE_INVALID';
  end if;

  select * into v_booking
  from public.hotel_bookings b
  where b.organization_id = v_session.organization_id
    and b.id = v_session.booking_id
  for update;

  if not found then
    raise exception 'HOTEL_PREARRIVAL_BOOKING_NOT_FOUND';
  end if;
  if upper(coalesce(v_booking.status, '')) <> 'RESERVED' then
    raise exception 'HOTEL_PREARRIVAL_BOOKING_NOT_RESERVED';
  end if;
  if v_booking.guest_id is null then
    raise exception 'HOTEL_PREARRIVAL_GUEST_PROFILE_REQUIRED';
  end if;

  select * into v_guest
  from public.hotel_guests g
  where g.organization_id = v_session.organization_id
    and g.id = v_booking.guest_id
  for update;

  if not found then
    raise exception 'HOTEL_PREARRIVAL_GUEST_NOT_FOUND';
  end if;

  v_registration_data := jsonb_build_object(
    'full_name', v_name,
    'email', v_email,
    'phone', v_phone,
    'preferred_language', v_language,
    'estimated_arrival_at', p_estimated_arrival_at
  );
  v_consent_data := jsonb_build_object(
    'registration_consent', true,
    'marketing_consent', coalesce(p_marketing_consent, false),
    'completed_at', v_completed_at
  );

  update public.hotel_guests
  set full_name = v_name,
      email = v_email,
      phone = v_phone,
      preferred_language = v_language,
      marketing_consent = coalesce(p_marketing_consent, false)
  where organization_id = v_session.organization_id
    and id = v_booking.guest_id;

  if not found then
    raise exception 'HOTEL_PREARRIVAL_GUEST_CHANGED_BEFORE_COMPLETION';
  end if;

  update public.hotel_pre_arrival_sessions
  set status = 'COMPLETED',
      registration_data = v_registration_data,
      consent_data = v_consent_data,
      completed_at = v_completed_at
  where id = v_session.id
    and status = 'OPEN';

  if not found then
    raise exception 'HOTEL_PREARRIVAL_SESSION_CHANGED_BEFORE_COMPLETION';
  end if;

  update public.hotel_bookings
  set pre_arrival_status = 'COMPLETED',
      registration_status = 'COMPLETED',
      mobile_arrival_status = 'READY_FOR_FRONT_DESK',
      estimated_arrival_at = p_estimated_arrival_at,
      updated_at = v_completed_at
  where organization_id = v_session.organization_id
    and id = v_booking.id
    and status = 'RESERVED';

  if not found then
    raise exception 'HOTEL_PREARRIVAL_BOOKING_CHANGED_BEFORE_COMPLETION';
  end if;

  return jsonb_build_object(
    'organization_id', v_session.organization_id,
    'property_id', v_booking.property_id,
    'booking_id', v_booking.id,
    'guest_id', v_booking.guest_id,
    'session_id', v_session.id,
    'status', 'READY_FOR_FRONT_DESK',
    'completed_at', v_completed_at
  );
end;
$function$;

revoke all on function public.hotel_complete_pre_arrival_guarded(uuid,text,text,text,text,timestamptz,boolean) from public;
revoke all on function public.hotel_complete_pre_arrival_guarded(uuid,text,text,text,text,timestamptz,boolean) from anon;
revoke all on function public.hotel_complete_pre_arrival_guarded(uuid,text,text,text,text,timestamptz,boolean) from authenticated;
grant execute on function public.hotel_complete_pre_arrival_guarded(uuid,text,text,text,text,timestamptz,boolean) to service_role;
