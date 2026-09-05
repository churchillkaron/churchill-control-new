-- Governed in-house stay extension. Extends inventory only; pricing remains an explicit Hotel/folio decision.
create or replace function public.hotel_extend_checked_in_stay_guarded(
  p_organization_id uuid,
  p_booking_id uuid,
  p_new_check_out_date date
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_booking public.hotel_bookings%rowtype;
  v_room public.hotel_rooms%rowtype;
  v_group public.hotel_groups%rowtype;
  v_date date;
  v_physical integer;
  v_occupied integer;
  v_other_held integer;
  v_own_alloc integer;
  v_own_pickup integer;
  v_group_has_deduct boolean := false;
  v_old_check_out_date date;
begin
  if p_organization_id is null or p_booking_id is null or p_new_check_out_date is null then
    raise exception 'HOTEL_STAY_EXTENSION: organization, booking and new departure date are required';
  end if;

  select * into v_booking
  from public.hotel_bookings b
  where b.organization_id = p_organization_id
    and b.id = p_booking_id
  for update;

  if not found then raise exception 'HOTEL_STAY_EXTENSION: booking not found'; end if;
  if upper(coalesce(v_booking.status, '')) <> 'CHECKED_IN' then
    raise exception 'HOTEL_STAY_EXTENSION: only a checked-in stay can be extended';
  end if;
  if v_booking.room_id is null then raise exception 'HOTEL_STAY_EXTENSION: checked-in stay has no room'; end if;
  if v_booking.check_out_date is null then raise exception 'HOTEL_STAY_EXTENSION: current departure date is missing'; end if;
  if p_new_check_out_date <= v_booking.check_out_date then
    raise exception 'HOTEL_STAY_EXTENSION: new departure date must be after the current departure date';
  end if;

  v_old_check_out_date := v_booking.check_out_date;

  select * into v_room
  from public.hotel_rooms r
  where r.organization_id = p_organization_id
    and r.id = v_booking.room_id
  for update;

  if not found then raise exception 'HOTEL_STAY_EXTENSION: occupied room not found'; end if;
  if v_room.property_id is distinct from v_booking.property_id then
    raise exception 'HOTEL_STAY_EXTENSION: booking and room property differ';
  end if;
  if upper(coalesce(v_room.status, '')) <> 'OCCUPIED' then
    raise exception 'HOTEL_STAY_EXTENSION: assigned room must remain OCCUPIED while extending an in-house stay';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_organization_id::text || ':' || v_room.property_id::text || ':' || coalesce(v_room.room_type, ''), 0)
  );

  if exists (
    select 1
    from public.hotel_bookings b
    where b.organization_id = p_organization_id
      and b.id <> v_booking.id
      and b.room_id = v_booking.room_id
      and b.status in ('RESERVED', 'CHECKED_IN')
      and b.check_in_date < p_new_check_out_date
      and b.check_out_date > v_old_check_out_date
  ) then
    raise exception 'HOTEL_INVENTORY_CONFLICT: assigned room is committed to another stay during the extension';
  end if;

  if v_booking.group_id is not null then
    select * into v_group
    from public.hotel_groups g
    where g.organization_id = p_organization_id
      and g.id = v_booking.group_id;
    if not found then raise exception 'HOTEL_INVENTORY_CONFLICT: group not found'; end if;
    if v_group.property_id <> v_room.property_id then raise exception 'HOTEL_INVENTORY_CONFLICT: group and room belong to different properties'; end if;
    if upper(coalesce(v_group.status, '')) in ('CANCELLED', 'LOST', 'COMPLETED') then
      raise exception 'HOTEL_INVENTORY_CONFLICT: group is not open for pickup';
    end if;

    select exists(
      select 1
      from public.hotel_group_room_blocks gb
      where gb.organization_id = p_organization_id
        and gb.group_id = v_booking.group_id
        and gb.property_id = v_room.property_id
        and gb.room_type = v_room.room_type
        and gb.deduct_inventory = true
        and gb.status = 'ACTIVE'
        and gb.stay_date >= v_old_check_out_date
        and gb.stay_date < p_new_check_out_date
    ) into v_group_has_deduct;
  end if;

  select count(*) into v_physical
  from public.hotel_rooms r
  where r.organization_id = p_organization_id
    and r.property_id = v_room.property_id
    and r.room_type = v_room.room_type
    and upper(coalesce(r.status, '')) <> 'OUT_OF_SERVICE';

  for v_date in
    select generate_series(v_old_check_out_date, p_new_check_out_date - 1, interval '1 day')::date
  loop
    select count(distinct b.room_id) into v_occupied
    from public.hotel_bookings b
    join public.hotel_rooms r on r.id = b.room_id and r.organization_id = b.organization_id
    where b.organization_id = p_organization_id
      and b.id <> v_booking.id
      and b.property_id = v_room.property_id
      and r.room_type = v_room.room_type
      and b.status in ('RESERVED', 'CHECKED_IN')
      and b.check_in_date <= v_date
      and b.check_out_date > v_date;

    select coalesce(sum(greatest(0, gb.allocated_rooms - (
      select count(*)
      from public.hotel_bookings pb
      join public.hotel_rooms pr on pr.id = pb.room_id and pr.organization_id = pb.organization_id
      where pb.organization_id = p_organization_id
        and pb.id <> v_booking.id
        and pb.property_id = v_room.property_id
        and pb.group_id = gb.group_id
        and pr.room_type = v_room.room_type
        and pb.status in ('RESERVED', 'CHECKED_IN')
        and pb.check_in_date <= v_date
        and pb.check_out_date > v_date
    ))), 0)::integer into v_other_held
    from public.hotel_group_room_blocks gb
    where gb.organization_id = p_organization_id
      and gb.property_id = v_room.property_id
      and gb.room_type = v_room.room_type
      and gb.stay_date = v_date
      and gb.deduct_inventory = true
      and gb.status = 'ACTIVE'
      and (v_booking.group_id is null or gb.group_id <> v_booking.group_id);

    if v_occupied + v_other_held >= v_physical then
      raise exception 'HOTEL_INVENTORY_CONFLICT: % inventory is protected or occupied on %', v_room.room_type, v_date;
    end if;

    if v_booking.group_id is not null and v_group_has_deduct then
      select gb.allocated_rooms into v_own_alloc
      from public.hotel_group_room_blocks gb
      where gb.organization_id = p_organization_id
        and gb.group_id = v_booking.group_id
        and gb.property_id = v_room.property_id
        and gb.room_type = v_room.room_type
        and gb.stay_date = v_date
        and gb.deduct_inventory = true
        and gb.status = 'ACTIVE';

      if v_own_alloc is null then
        raise exception 'HOTEL_INVENTORY_CONFLICT: group block does not cover the full extension';
      end if;

      select count(*) into v_own_pickup
      from public.hotel_bookings pb
      join public.hotel_rooms pr on pr.id = pb.room_id and pr.organization_id = pb.organization_id
      where pb.organization_id = p_organization_id
        and pb.id <> v_booking.id
        and pb.property_id = v_room.property_id
        and pb.group_id = v_booking.group_id
        and pr.room_type = v_room.room_type
        and pb.status in ('RESERVED', 'CHECKED_IN')
        and pb.check_in_date <= v_date
        and pb.check_out_date > v_date;

      if v_own_pickup >= v_own_alloc then
        raise exception 'HOTEL_INVENTORY_CONFLICT: group block has no remaining % pickup on %', v_room.room_type, v_date;
      end if;
    end if;
  end loop;

  update public.hotel_bookings
  set check_out_date = p_new_check_out_date,
      updated_at = now()
  where organization_id = p_organization_id
    and id = v_booking.id
    and status = 'CHECKED_IN'
    and room_id = v_booking.room_id
    and check_out_date = v_old_check_out_date;

  if not found then
    raise exception 'HOTEL_STAY_EXTENSION: stay changed before extension completed';
  end if;

  return jsonb_build_object(
    'booking_id', v_booking.id,
    'room_id', v_booking.room_id,
    'old_check_out_date', v_old_check_out_date,
    'new_check_out_date', p_new_check_out_date,
    'pricing_changed', false,
    'pricing_review_required', true
  );
end;
$function$;
