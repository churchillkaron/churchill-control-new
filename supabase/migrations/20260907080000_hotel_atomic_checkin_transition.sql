-- Atomic Hotel check-in transition.
-- Human-readable arrival readiness remains server-owned in getHotelArrivalReadiness.js.
-- This RPC independently revalidates the hard arrival invariants while holding the same
-- property-day authority used by Day Close, then commits booking and room state together.

alter table public.hotel_bookings
  add column if not exists actual_check_in_at timestamptz,
  add column if not exists actual_check_in_business_date date;

comment on column public.hotel_bookings.actual_check_in_at is
  'Authoritative timestamp when the governed Hotel check-in transaction committed.';
comment on column public.hotel_bookings.actual_check_in_business_date is
  'Governed property business date on which the Hotel check-in transaction committed.';

create index if not exists hotel_bookings_actual_check_in_business_date_idx
  on public.hotel_bookings(organization_id, property_id, actual_check_in_business_date)
  where actual_check_in_business_date is not null;

create or replace function public.hotel_check_in_booking_guarded(
  p_organization_id uuid,
  p_booking_id uuid,
  p_business_date date
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_initial_booking public.hotel_bookings%rowtype;
  v_booking public.hotel_bookings%rowtype;
  v_room public.hotel_rooms%rowtype;
  v_changed_at timestamptz := now();
  v_current_business_date date;
  v_deposit_required numeric := 0;
  v_paid_amount numeric := 0;
begin
  if p_organization_id is null or p_booking_id is null or p_business_date is null then
    raise exception 'HOTEL_CHECKIN: organization, booking and governed business date are required';
  end if;

  -- Resolve property before taking the property-day lock, then re-read the booking under
  -- row lock after authority is acquired. This preserves one lock order with Day Close.
  select * into v_initial_booking
  from public.hotel_bookings b
  where b.organization_id = p_organization_id
    and b.id = p_booking_id;

  if not found then
    raise exception 'HOTEL_CHECKIN: booking not found';
  end if;
  if v_initial_booking.property_id is null then
    raise exception 'HOTEL_CHECKIN: booking has no governed Hotel property';
  end if;

  v_current_business_date := public.hotel_current_business_date_guarded(
    p_organization_id,
    v_initial_booking.property_id,
    v_changed_at
  );
  if v_current_business_date is distinct from p_business_date then
    raise exception 'HOTEL_CHECKIN: property business date changed before check-in completed';
  end if;

  perform public.hotel_assert_business_day_open(
    p_organization_id,
    v_initial_booking.property_id,
    p_business_date
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_organization_id::text || ':' || p_booking_id::text || ':checkin',
      0
    )
  );

  select * into v_booking
  from public.hotel_bookings b
  where b.organization_id = p_organization_id
    and b.id = p_booking_id
  for update;

  if not found then
    raise exception 'HOTEL_CHECKIN: booking not found after acquiring authority';
  end if;
  if v_booking.property_id is distinct from v_initial_booking.property_id then
    raise exception 'HOTEL_CHECKIN: booking property changed before check-in completed';
  end if;
  if upper(coalesce(v_booking.status, '')) <> 'RESERVED' then
    raise exception 'HOTEL_CHECKIN: booking is no longer reserved';
  end if;
  if v_booking.room_id is null then
    raise exception 'HOTEL_CHECKIN: a room must be assigned before check-in';
  end if;
  if v_booking.guest_id is null then
    raise exception 'HOTEL_CHECKIN: a governed guest profile is required before check-in';
  end if;
  if v_booking.check_in_date is null then
    raise exception 'HOTEL_CHECKIN: booking has no scheduled arrival date';
  end if;
  if v_booking.check_in_date > p_business_date then
    raise exception 'HOTEL_CHECKIN: scheduled arrival date is in a future property business day';
  end if;

  perform 1
  from public.hotel_guests g
  where g.organization_id = p_organization_id
    and g.id = v_booking.guest_id
  for key share;
  if not found then
    raise exception 'HOTEL_CHECKIN: governed guest profile no longer exists';
  end if;

  v_deposit_required := greatest(coalesce(v_booking.deposit_required, 0), 0);
  v_paid_amount := greatest(coalesce(v_booking.paid_amount, 0), 0);
  if v_deposit_required - v_paid_amount > 0.005 then
    raise exception 'HOTEL_CHECKIN: required deposit is still outstanding';
  end if;

  select * into v_room
  from public.hotel_rooms r
  where r.organization_id = p_organization_id
    and r.id = v_booking.room_id
  for update;

  if not found then
    raise exception 'HOTEL_CHECKIN: assigned room not found';
  end if;
  if v_room.property_id is distinct from v_booking.property_id then
    raise exception 'HOTEL_CHECKIN: booking and room property differ';
  end if;
  if upper(coalesce(v_room.status, '')) <> 'AVAILABLE' then
    raise exception 'HOTEL_CHECKIN: assigned room is no longer available';
  end if;

  update public.hotel_bookings
  set status = 'CHECKED_IN',
      actual_check_in_at = v_changed_at,
      actual_check_in_business_date = p_business_date,
      updated_at = v_changed_at
  where organization_id = p_organization_id
    and id = p_booking_id
    and status = 'RESERVED';

  if not found then
    raise exception 'HOTEL_CHECKIN: booking state changed before check-in completed';
  end if;

  update public.hotel_rooms
  set status = 'OCCUPIED',
      updated_at = v_changed_at
  where organization_id = p_organization_id
    and id = v_booking.room_id
    and status = 'AVAILABLE';

  if not found then
    raise exception 'HOTEL_CHECKIN: room readiness changed before check-in completed';
  end if;

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'room_id', v_booking.room_id,
    'status', 'CHECKED_IN',
    'room_status', 'OCCUPIED',
    'actual_check_in_at', v_changed_at,
    'actual_check_in_business_date', p_business_date
  );
end;
$function$;

revoke all on function public.hotel_check_in_booking_guarded(uuid, uuid, date) from public;
revoke all on function public.hotel_check_in_booking_guarded(uuid, uuid, date) from anon;
revoke all on function public.hotel_check_in_booking_guarded(uuid, uuid, date) from authenticated;
grant execute on function public.hotel_check_in_booking_guarded(uuid, uuid, date) to service_role;
