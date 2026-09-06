create or replace function public.hotel_assign_booking_room_guarded(
  p_organization_id uuid,
  p_booking_id uuid,
  p_room_id uuid,
  p_require_ready boolean default false,
  p_reason text default null
)
returns public.hotel_bookings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.hotel_bookings%rowtype;
  v_room public.hotel_rooms%rowtype;
  v_previous_room_id uuid;
  v_party_size integer;
  v_now timestamptz := now();
  v_task_date date := current_date;
  v_property_timezone text;
  v_cutoff_minutes integer;
  v_operational_configured_at timestamptz;
  v_property_local timestamp;
  v_business_date date;
  v_wall_minutes integer;
  v_require_ready boolean := coalesce(p_require_ready, false);
begin
  select *
  into v_booking
  from public.hotel_bookings
  where organization_id = p_organization_id
    and id = p_booking_id
  for update;

  if not found then
    raise exception 'Booking not found';
  end if;

  if upper(coalesce(v_booking.status, '')) not in ('RESERVED', 'CHECKED_IN') then
    raise exception 'Only reserved or in-house stays can receive a room assignment';
  end if;

  if v_booking.property_id is null then
    raise exception 'Booking property required before room assignment';
  end if;

  if v_booking.check_in_date is null
     or v_booking.check_out_date is null
     or v_booking.check_out_date <= v_booking.check_in_date then
    raise exception 'Booking stay dates are invalid for room assignment';
  end if;

  select p.time_zone, p.business_day_cutoff_minutes, p.operational_day_configured_at
  into v_property_timezone, v_cutoff_minutes, v_operational_configured_at
  from public.hotel_properties p
  where p.organization_id = p_organization_id
    and p.id = v_booking.property_id;

  if upper(coalesce(v_booking.status, '')) = 'CHECKED_IN' then
    v_require_ready := true;
  elsif upper(coalesce(v_booking.status, '')) = 'RESERVED'
    and nullif(btrim(coalesce(v_property_timezone, '')), '') is not null
    and v_cutoff_minutes between 0 and 720
    and v_operational_configured_at is not null then
    begin
      v_property_local := timezone(v_property_timezone, v_now);
    exception when others then
      v_property_local := null;
    end;
    if v_property_local is not null then
      v_wall_minutes := extract(hour from v_property_local)::integer * 60 + extract(minute from v_property_local)::integer;
      v_business_date := v_property_local::date;
      if v_wall_minutes < v_cutoff_minutes then
        v_business_date := v_business_date - 1;
      end if;
      if v_booking.check_in_date <= v_business_date then
        v_require_ready := true;
      end if;
    end if;
  end if;

  select *
  into v_room
  from public.hotel_rooms
  where organization_id = p_organization_id
    and id = p_room_id
  for update;

  if not found then
    raise exception 'Target room not found';
  end if;

  if v_room.property_id is distinct from v_booking.property_id then
    raise exception 'Target room belongs to another property';
  end if;

  v_party_size := greatest(coalesce(v_booking.adults, 0) + coalesce(v_booking.children, 0), 1);
  if coalesce(v_room.max_guests, 0) < v_party_size then
    raise exception 'Target room capacity is insufficient for this stay';
  end if;

  if upper(coalesce(v_room.status, '')) = 'OUT_OF_SERVICE' then
    raise exception 'Target room is out of service';
  end if;

  if exists (
    select 1
    from public.hotel_maintenance_requests mr
    where mr.organization_id = p_organization_id
      and mr.room_id = p_room_id
      and upper(coalesce(mr.status, '')) not in ('RESOLVED', 'CLOSED', 'COMPLETED', 'CANCELLED')
  ) then
    raise exception 'Target room has unresolved maintenance work';
  end if;

  if exists (
    select 1
    from public.hotel_bookings other_booking
    where other_booking.organization_id = p_organization_id
      and other_booking.property_id = v_booking.property_id
      and other_booking.room_id = p_room_id
      and other_booking.id <> v_booking.id
      and upper(coalesce(other_booking.status, '')) in ('RESERVED', 'CHECKED_IN')
      and (
        other_booking.check_in_date is null
        or other_booking.check_out_date is null
        or (
          other_booking.check_in_date < v_booking.check_out_date
          and other_booking.check_out_date > v_booking.check_in_date
        )
      )
  ) then
    raise exception 'Target room is already committed to an overlapping stay';
  end if;

  if v_require_ready then
    if upper(coalesce(v_room.status, '')) <> 'AVAILABLE' then
      raise exception 'Target room is not physically ready for an arrival due now';
    end if;

    if exists (
      select 1
      from public.hotel_housekeeping_tasks ht
      where ht.organization_id = p_organization_id
        and ht.room_id = p_room_id
        and upper(coalesce(ht.task_status, '')) in ('PENDING', 'IN_PROGRESS', 'AWAITING_INSPECTION')
    ) then
      raise exception 'Target room still has active Housekeeping work';
    end if;
  end if;

  if v_booking.room_id = p_room_id then
    return v_booking;
  end if;

  v_previous_room_id := v_booking.room_id;

  if upper(coalesce(v_booking.status, '')) = 'CHECKED_IN' then
    update public.hotel_rooms
    set status = 'OCCUPIED', updated_at = v_now
    where organization_id = p_organization_id
      and id = p_room_id
      and status = v_room.status;

    if not found then
      raise exception 'Target room readiness changed during assignment';
    end if;

    if v_previous_room_id is not null then
      update public.hotel_rooms
      set status = 'DIRTY', updated_at = v_now
      where organization_id = p_organization_id
        and id = v_previous_room_id
        and upper(coalesce(status, '')) = 'OCCUPIED';

      insert into public.hotel_housekeeping_tasks (
        organization_id,
        room_id,
        task_status,
        priority,
        task_date,
        notes,
        created_at,
        updated_at
      ) values (
        p_organization_id,
        v_previous_room_id,
        'PENDING',
        'HIGH',
        coalesce(v_business_date, v_task_date),
        'Room turnover after in-house room move.',
        v_now,
        v_now
      );
    end if;
  end if;

  update public.hotel_bookings
  set room_id = p_room_id,
      updated_at = v_now
  where organization_id = p_organization_id
    and id = v_booking.id
  returning * into v_booking;

  insert into public.hotel_room_moves (
    organization_id,
    booking_id,
    from_room_id,
    to_room_id,
    reason
  ) values (
    p_organization_id,
    v_booking.id,
    v_previous_room_id,
    p_room_id,
    nullif(btrim(coalesce(p_reason, '')), '')
  );

  return v_booking;
end;
$$;

revoke all on function public.hotel_assign_booking_room_guarded(uuid, uuid, uuid, boolean, text) from public;
revoke all on function public.hotel_assign_booking_room_guarded(uuid, uuid, uuid, boolean, text) from anon;
revoke all on function public.hotel_assign_booking_room_guarded(uuid, uuid, uuid, boolean, text) from authenticated;
grant execute on function public.hotel_assign_booking_room_guarded(uuid, uuid, uuid, boolean, text) to service_role;
