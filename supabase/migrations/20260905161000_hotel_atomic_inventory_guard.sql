begin;

create or replace function public.hotel_create_booking_guarded(
  p_organization_id uuid,
  p_room_id uuid,
  p_guest_id uuid,
  p_group_id uuid,
  p_rate_plan_id uuid,
  p_booking_reference text,
  p_check_in_date date,
  p_check_out_date date,
  p_adults integer,
  p_children integer,
  p_source text,
  p_total_amount numeric,
  p_paid_amount numeric,
  p_payment_status text,
  p_currency_code text,
  p_notes text
) returns public.hotel_bookings
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_room public.hotel_rooms%rowtype;
  v_group public.hotel_groups%rowtype;
  v_booking public.hotel_bookings%rowtype;
  v_date date;
  v_physical integer;
  v_occupied integer;
  v_other_held integer;
  v_own_alloc integer;
  v_own_pickup integer;
  v_group_has_deduct boolean := false;
begin
  if p_check_in_date is null or p_check_out_date is null or p_check_out_date <= p_check_in_date then
    raise exception 'HOTEL_INVENTORY_CONFLICT: valid arrival and departure dates are required';
  end if;

  select * into v_room
  from public.hotel_rooms
  where organization_id = p_organization_id and id = p_room_id;
  if not found then raise exception 'HOTEL_INVENTORY_CONFLICT: room not found'; end if;
  if v_room.property_id is null then raise exception 'HOTEL_INVENTORY_CONFLICT: room is not bound to a property'; end if;
  if upper(coalesce(v_room.status, '')) = 'OUT_OF_SERVICE' then raise exception 'HOTEL_INVENTORY_CONFLICT: out-of-service rooms cannot be reserved'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || v_room.property_id::text || ':' || coalesce(v_room.room_type, ''), 0));

  if exists (
    select 1 from public.hotel_bookings b
    where b.organization_id = p_organization_id
      and b.room_id = p_room_id
      and b.status in ('RESERVED','CHECKED_IN')
      and b.check_in_date < p_check_out_date
      and b.check_out_date > p_check_in_date
  ) then
    raise exception 'HOTEL_INVENTORY_CONFLICT: room is no longer available for the selected dates';
  end if;

  if p_guest_id is not null and not exists (
    select 1 from public.hotel_guests g where g.organization_id = p_organization_id and g.id = p_guest_id
  ) then raise exception 'HOTEL_INVENTORY_CONFLICT: guest not found'; end if;

  if p_group_id is not null then
    select * into v_group from public.hotel_groups g where g.organization_id = p_organization_id and g.id = p_group_id;
    if not found then raise exception 'HOTEL_INVENTORY_CONFLICT: group not found'; end if;
    if v_group.property_id <> v_room.property_id then raise exception 'HOTEL_INVENTORY_CONFLICT: group and room belong to different properties'; end if;
    if upper(coalesce(v_group.status,'')) in ('CANCELLED','LOST','COMPLETED') then raise exception 'HOTEL_INVENTORY_CONFLICT: group is not open for pickup'; end if;

    select exists(
      select 1 from public.hotel_group_room_blocks gb
      where gb.organization_id = p_organization_id
        and gb.group_id = p_group_id
        and gb.property_id = v_room.property_id
        and gb.room_type = v_room.room_type
        and gb.deduct_inventory = true
        and gb.status = 'ACTIVE'
        and gb.stay_date >= p_check_in_date
        and gb.stay_date < p_check_out_date
    ) into v_group_has_deduct;
  end if;

  if p_rate_plan_id is not null and not exists (
    select 1 from public.hotel_rate_plans rp
    where rp.organization_id = p_organization_id
      and rp.id = p_rate_plan_id
      and rp.property_id = v_room.property_id
      and rp.active = true
  ) then raise exception 'HOTEL_INVENTORY_CONFLICT: active rate plan not found for this property'; end if;

  select count(*) into v_physical
  from public.hotel_rooms r
  where r.organization_id = p_organization_id
    and r.property_id = v_room.property_id
    and r.room_type = v_room.room_type
    and upper(coalesce(r.status,'')) <> 'OUT_OF_SERVICE';

  for v_date in select generate_series(p_check_in_date, p_check_out_date - 1, interval '1 day')::date loop
    select count(distinct b.room_id) into v_occupied
    from public.hotel_bookings b
    join public.hotel_rooms r on r.id = b.room_id and r.organization_id = b.organization_id
    where b.organization_id = p_organization_id
      and b.property_id = v_room.property_id
      and r.room_type = v_room.room_type
      and b.status in ('RESERVED','CHECKED_IN')
      and b.check_in_date <= v_date
      and b.check_out_date > v_date;

    select coalesce(sum(greatest(0, gb.allocated_rooms - (
      select count(*)
      from public.hotel_bookings pb
      join public.hotel_rooms pr on pr.id = pb.room_id and pr.organization_id = pb.organization_id
      where pb.organization_id = p_organization_id
        and pb.property_id = v_room.property_id
        and pb.group_id = gb.group_id
        and pr.room_type = v_room.room_type
        and pb.status in ('RESERVED','CHECKED_IN')
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
      and (p_group_id is null or gb.group_id <> p_group_id);

    if v_occupied + v_other_held >= v_physical then
      raise exception 'HOTEL_INVENTORY_CONFLICT: % inventory is protected or occupied on %', v_room.room_type, v_date;
    end if;

    if p_group_id is not null and v_group_has_deduct then
      select gb.allocated_rooms into v_own_alloc
      from public.hotel_group_room_blocks gb
      where gb.organization_id = p_organization_id
        and gb.group_id = p_group_id
        and gb.property_id = v_room.property_id
        and gb.room_type = v_room.room_type
        and gb.stay_date = v_date
        and gb.deduct_inventory = true
        and gb.status = 'ACTIVE';
      if v_own_alloc is null then raise exception 'HOTEL_INVENTORY_CONFLICT: group block does not cover the full stay'; end if;

      select count(*) into v_own_pickup
      from public.hotel_bookings pb
      join public.hotel_rooms pr on pr.id = pb.room_id and pr.organization_id = pb.organization_id
      where pb.organization_id = p_organization_id
        and pb.property_id = v_room.property_id
        and pb.group_id = p_group_id
        and pr.room_type = v_room.room_type
        and pb.status in ('RESERVED','CHECKED_IN')
        and pb.check_in_date <= v_date
        and pb.check_out_date > v_date;
      if v_own_pickup >= v_own_alloc then raise exception 'HOTEL_INVENTORY_CONFLICT: group block has no remaining % pickup on %', v_room.room_type, v_date; end if;
    end if;
  end loop;

  insert into public.hotel_bookings(
    organization_id, property_id, room_id, guest_id, group_id, rate_plan_id,
    booking_reference, check_in_date, check_out_date, adults, children, status,
    source, total_amount, paid_amount, payment_status, currency_code, notes
  ) values (
    p_organization_id, v_room.property_id, p_room_id, p_guest_id, p_group_id, p_rate_plan_id,
    p_booking_reference, p_check_in_date, p_check_out_date, greatest(coalesce(p_adults,1),0), greatest(coalesce(p_children,0),0), 'RESERVED',
    coalesce(nullif(trim(p_source),''), case when p_group_id is null then 'DIRECT' else 'GROUP' end),
    coalesce(p_total_amount,0), coalesce(p_paid_amount,0), coalesce(nullif(trim(p_payment_status),''),'UNPAID'),
    coalesce(nullif(trim(p_currency_code),''),'THB'), nullif(trim(p_notes),'')
  ) returning * into v_booking;

  return v_booking;
end;
$$;

create or replace function public.hotel_upsert_group_block_range_guarded(
  p_organization_id uuid,
  p_group_id uuid,
  p_room_type text,
  p_from date,
  p_to date,
  p_allocated_rooms integer,
  p_negotiated_rate numeric,
  p_currency_code text,
  p_deduct_inventory boolean
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_group public.hotel_groups%rowtype;
  v_date date;
  v_physical integer;
  v_occupied integer;
  v_other_held integer;
  v_own_pickup integer;
  v_days integer := 0;
begin
  if p_from is null or p_to is null or p_to <= p_from then raise exception 'HOTEL_INVENTORY_CONFLICT: valid block dates are required'; end if;
  if p_to - p_from > 370 then raise exception 'HOTEL_INVENTORY_CONFLICT: block range is too long'; end if;
  if p_allocated_rooms is null or p_allocated_rooms < 0 then raise exception 'HOTEL_INVENTORY_CONFLICT: allocated rooms must be zero or greater'; end if;
  if p_negotiated_rate is not null and p_negotiated_rate < 0 then raise exception 'HOTEL_INVENTORY_CONFLICT: negotiated rate must be zero or greater'; end if;

  select * into v_group from public.hotel_groups g where g.organization_id = p_organization_id and g.id = p_group_id;
  if not found then raise exception 'HOTEL_INVENTORY_CONFLICT: group not found'; end if;
  if upper(coalesce(v_group.status,'')) not in ('PROSPECT','TENTATIVE','CONFIRMED','IN_HOUSE') then raise exception 'HOTEL_INVENTORY_CONFLICT: group is not open for room blocks'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_organization_id::text || ':' || v_group.property_id::text || ':' || coalesce(p_room_type,''), 0));

  select count(*) into v_physical
  from public.hotel_rooms r
  where r.organization_id = p_organization_id
    and r.property_id = v_group.property_id
    and r.room_type = p_room_type
    and upper(coalesce(r.status,'')) <> 'OUT_OF_SERVICE';
  if v_physical = 0 then raise exception 'HOTEL_INVENTORY_CONFLICT: no physical rooms exist for this room type'; end if;
  if p_allocated_rooms > v_physical then raise exception 'HOTEL_INVENTORY_CONFLICT: block exceeds physical room inventory'; end if;

  for v_date in select generate_series(p_from, p_to - 1, interval '1 day')::date loop
    select count(distinct b.room_id) into v_occupied
    from public.hotel_bookings b
    join public.hotel_rooms r on r.id = b.room_id and r.organization_id = b.organization_id
    where b.organization_id = p_organization_id
      and b.property_id = v_group.property_id
      and r.room_type = p_room_type
      and b.status in ('RESERVED','CHECKED_IN')
      and b.check_in_date <= v_date
      and b.check_out_date > v_date;

    select count(*) into v_own_pickup
    from public.hotel_bookings b
    join public.hotel_rooms r on r.id = b.room_id and r.organization_id = b.organization_id
    where b.organization_id = p_organization_id
      and b.property_id = v_group.property_id
      and b.group_id = p_group_id
      and r.room_type = p_room_type
      and b.status in ('RESERVED','CHECKED_IN')
      and b.check_in_date <= v_date
      and b.check_out_date > v_date;
    if p_deduct_inventory and v_own_pickup > p_allocated_rooms then
      raise exception 'HOTEL_INVENTORY_CONFLICT: block cannot be reduced below % picked-up rooms on %', v_own_pickup, v_date;
    end if;

    select coalesce(sum(greatest(0, gb.allocated_rooms - (
      select count(*)
      from public.hotel_bookings pb
      join public.hotel_rooms pr on pr.id = pb.room_id and pr.organization_id = pb.organization_id
      where pb.organization_id = p_organization_id
        and pb.property_id = v_group.property_id
        and pb.group_id = gb.group_id
        and pr.room_type = p_room_type
        and pb.status in ('RESERVED','CHECKED_IN')
        and pb.check_in_date <= v_date
        and pb.check_out_date > v_date
    ))), 0)::integer into v_other_held
    from public.hotel_group_room_blocks gb
    where gb.organization_id = p_organization_id
      and gb.property_id = v_group.property_id
      and gb.room_type = p_room_type
      and gb.stay_date = v_date
      and gb.group_id <> p_group_id
      and gb.deduct_inventory = true
      and gb.status = 'ACTIVE';

    if p_deduct_inventory and v_occupied + v_other_held + greatest(0, p_allocated_rooms - v_own_pickup) > v_physical then
      raise exception 'HOTEL_INVENTORY_CONFLICT: block would oversell % inventory on %', p_room_type, v_date;
    end if;

    insert into public.hotel_group_room_blocks(
      organization_id, property_id, group_id, room_type, stay_date, allocated_rooms,
      negotiated_rate, currency_code, deduct_inventory, status, updated_at
    ) values (
      p_organization_id, v_group.property_id, p_group_id, p_room_type, v_date, p_allocated_rooms,
      p_negotiated_rate, coalesce(nullif(trim(p_currency_code),''),'THB'), p_deduct_inventory,
      case when p_allocated_rooms > 0 then 'ACTIVE' else 'RELEASED' end, now()
    )
    on conflict (organization_id, group_id, room_type, stay_date)
    do update set allocated_rooms = excluded.allocated_rooms,
                  negotiated_rate = excluded.negotiated_rate,
                  currency_code = excluded.currency_code,
                  deduct_inventory = excluded.deduct_inventory,
                  status = excluded.status,
                  updated_at = excluded.updated_at;
    v_days := v_days + 1;
  end loop;

  update public.hotel_groups g
  set room_block = coalesce((
    select max(daily_rooms) from (
      select stay_date, sum(allocated_rooms) as daily_rooms
      from public.hotel_group_room_blocks b
      where b.organization_id = p_organization_id and b.group_id = p_group_id and b.status = 'ACTIVE'
      group by stay_date
    ) q
  ), 0), updated_at = now()
  where g.organization_id = p_organization_id and g.id = p_group_id;

  return jsonb_build_object('days', v_days, 'physicalInventory', v_physical);
end;
$$;

revoke all on function public.hotel_create_booking_guarded(uuid,uuid,uuid,uuid,uuid,text,date,date,integer,integer,text,numeric,numeric,text,text,text) from public, anon, authenticated;
grant execute on function public.hotel_create_booking_guarded(uuid,uuid,uuid,uuid,uuid,text,date,date,integer,integer,text,numeric,numeric,text,text,text) to service_role;
revoke all on function public.hotel_upsert_group_block_range_guarded(uuid,uuid,text,date,date,integer,numeric,text,boolean) from public, anon, authenticated;
grant execute on function public.hotel_upsert_group_block_range_guarded(uuid,uuid,text,date,date,integer,numeric,text,boolean) to service_role;

commit;
