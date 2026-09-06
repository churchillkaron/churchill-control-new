-- Atomic Hotel checkout transition.
-- Human-readable departure readiness remains server-owned in getHotelDepartureReadiness.js.
-- This RPC revalidates the hard invariants under row locks and commits booking, room turnover,
-- and housekeeping creation as one database transaction.

create or replace function public.hotel_check_out_booking_guarded(
  p_organization_id uuid,
  p_booking_id uuid,
  p_business_date date
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_booking public.hotel_bookings%rowtype;
  v_room public.hotel_rooms%rowtype;
  v_folio public.hotel_folios%rowtype;
  v_changed_at timestamptz := now();
  v_pending_transactions integer := 0;
  v_finance_evidence_missing integer := 0;
  v_housekeeping_task_id uuid;
begin
  if p_organization_id is null or p_booking_id is null or p_business_date is null then
    raise exception 'HOTEL_CHECKOUT: organization, booking and governed business date are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || p_booking_id::text || ':checkout', 0));

  select * into v_booking
  from public.hotel_bookings b
  where b.organization_id = p_organization_id
    and b.id = p_booking_id
  for update;

  if not found then
    raise exception 'HOTEL_CHECKOUT: booking not found';
  end if;
  if upper(coalesce(v_booking.status, '')) <> 'CHECKED_IN' then
    raise exception 'HOTEL_CHECKOUT: booking is no longer checked in';
  end if;
  if v_booking.property_id is null then
    raise exception 'HOTEL_CHECKOUT: booking has no governed Hotel property';
  end if;
  if v_booking.room_id is null then
    raise exception 'HOTEL_CHECKOUT: checked-in stay has no room';
  end if;

  if v_booking.check_out_date is not null
     and v_booking.check_out_date > p_business_date
     and upper(coalesce(v_booking.early_departure_review_status, '')) <> 'CONFIRMED' then
    raise exception 'HOTEL_CHECKOUT: early departure review is not confirmed';
  end if;

  select * into v_room
  from public.hotel_rooms r
  where r.organization_id = p_organization_id
    and r.id = v_booking.room_id
  for update;

  if not found then
    raise exception 'HOTEL_CHECKOUT: assigned room not found';
  end if;
  if v_room.property_id is distinct from v_booking.property_id then
    raise exception 'HOTEL_CHECKOUT: booking and room property differ';
  end if;
  if upper(coalesce(v_room.status, '')) <> 'OCCUPIED' then
    raise exception 'HOTEL_CHECKOUT: assigned room is no longer occupied';
  end if;

  select * into v_folio
  from public.hotel_folios f
  where f.organization_id = p_organization_id
    and f.booking_id = p_booking_id
  for update;

  if found and upper(coalesce(v_folio.status, '')) = 'OPEN' then
    raise exception 'HOTEL_CHECKOUT: guest folio is still open';
  end if;

  select count(*) into v_pending_transactions
  from public.hotel_payment_transactions t
  where t.organization_id = p_organization_id
    and t.booking_id = p_booking_id
    and upper(coalesce(t.status, '')) = 'PENDING';

  if v_pending_transactions > 0 then
    raise exception 'HOTEL_CHECKOUT: settlement is still pending';
  end if;

  select count(*) into v_finance_evidence_missing
  from public.hotel_payment_transactions t
  where t.organization_id = p_organization_id
    and t.booking_id = p_booking_id
    and upper(coalesce(t.status, '')) = 'SETTLED'
    and upper(coalesce(t.processor_mode, '')) = 'AVANTIQO_GATEWAY'
    and t.finance_payment_id is null;

  if v_finance_evidence_missing > 0 then
    raise exception 'HOTEL_CHECKOUT: settled gateway transaction is missing Finance evidence';
  end if;

  update public.hotel_bookings
  set status = 'CHECKED_OUT',
      actual_check_out_at = v_changed_at,
      actual_check_out_business_date = p_business_date,
      updated_at = v_changed_at
  where organization_id = p_organization_id
    and id = p_booking_id
    and status = 'CHECKED_IN';

  if not found then
    raise exception 'HOTEL_CHECKOUT: booking state changed before checkout completed';
  end if;

  update public.hotel_rooms
  set status = 'DIRTY',
      updated_at = v_changed_at
  where organization_id = p_organization_id
    and id = v_booking.room_id
    and status = 'OCCUPIED';

  if not found then
    raise exception 'HOTEL_CHECKOUT: room state changed before turnover completed';
  end if;

  insert into public.hotel_housekeeping_tasks (
    organization_id,
    room_id,
    booking_id,
    task_type,
    task_status,
    scheduled_at,
    created_at
  ) values (
    p_organization_id,
    v_booking.room_id,
    v_booking.id,
    'CLEANING',
    'PENDING',
    v_changed_at,
    v_changed_at
  )
  returning id into v_housekeeping_task_id;

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'room_id', v_booking.room_id,
    'status', 'CHECKED_OUT',
    'room_status', 'DIRTY',
    'housekeeping_task_id', v_housekeeping_task_id,
    'actual_check_out_at', v_changed_at,
    'actual_check_out_business_date', p_business_date
  );
end;
$function$;

revoke all on function public.hotel_check_out_booking_guarded(uuid, uuid, date) from public;
revoke all on function public.hotel_check_out_booking_guarded(uuid, uuid, date) from anon;
revoke all on function public.hotel_check_out_booking_guarded(uuid, uuid, date) from authenticated;
grant execute on function public.hotel_check_out_booking_guarded(uuid, uuid, date) to service_role;
