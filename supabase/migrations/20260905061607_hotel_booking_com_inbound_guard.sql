begin;

alter table public.hotel_bookings
  add column if not exists channel_room_stay_id text;

create unique index if not exists hotel_bookings_channel_reservation_room_uniq
  on public.hotel_bookings(organization_id, channel_connection_id, external_reservation_id, channel_room_stay_id)
  where channel_connection_id is not null
    and external_reservation_id is not null
    and channel_room_stay_id is not null;

create index if not exists hotel_bookings_channel_reservation_lookup_idx
  on public.hotel_bookings(organization_id, channel_connection_id, external_reservation_id);

create or replace function public.hotel_apply_channel_booking_guarded(
  p_organization_id uuid,
  p_property_id uuid,
  p_connection_id uuid,
  p_external_reservation_id text,
  p_channel_room_stay_id text,
  p_event_type text,
  p_external_room_type_id text,
  p_external_rate_plan_id text,
  p_guest_id uuid,
  p_booking_reference text,
  p_check_in_date date,
  p_check_out_date date,
  p_adults integer,
  p_children integer,
  p_total_amount numeric,
  p_currency_code text,
  p_notes text
) returns public.hotel_bookings
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_connection public.hotel_channel_connections%rowtype;
  v_mapping public.hotel_channel_mappings%rowtype;
  v_existing public.hotel_bookings%rowtype;
  v_booking public.hotel_bookings%rowtype;
  v_candidate public.hotel_rooms%rowtype;
  v_event text := upper(btrim(coalesce(p_event_type, '')));
  v_room_stay_id text := nullif(btrim(coalesce(p_channel_room_stay_id, '')), '');
  v_external_reservation_id text := nullif(btrim(coalesce(p_external_reservation_id, '')), '');
  v_date date;
  v_physical integer;
  v_occupied integer;
  v_held integer;
begin
  if v_external_reservation_id is null or v_room_stay_id is null then
    raise exception 'HOTEL_CHANNEL_RESERVATION_ID_REQUIRED' using errcode = '22023';
  end if;
  if v_event not in ('NEW','MODIFY','CANCEL') then
    raise exception 'HOTEL_CHANNEL_RESERVATION_EVENT_INVALID' using errcode = '22023';
  end if;

  select * into v_connection
  from public.hotel_channel_connections
  where id = p_connection_id
    and organization_id = p_organization_id
    and property_id = p_property_id
  for share;
  if not found then raise exception 'HOTEL_CHANNEL_CONNECTION_NOT_FOUND' using errcode = 'P0002'; end if;
  if upper(coalesce(v_connection.status,'')) <> 'ACTIVE'
     or v_connection.provider_certified is not true
     or v_connection.enabled is not true then
    raise exception 'HOTEL_CHANNEL_CONNECTION_NOT_CERTIFIED_ACTIVE' using errcode = '55000';
  end if;

  select * into v_existing
  from public.hotel_bookings
  where organization_id = p_organization_id
    and channel_connection_id = p_connection_id
    and external_reservation_id = v_external_reservation_id
    and channel_room_stay_id = v_room_stay_id
  for update;

  if v_event = 'CANCEL' then
    if not found then raise exception 'HOTEL_CHANNEL_BOOKING_NOT_FOUND_FOR_CANCEL' using errcode = 'P0002'; end if;
    if v_existing.status = 'CHECKED_IN' then
      raise exception 'HOTEL_CHANNEL_CHECKED_IN_BOOKING_CANNOT_BE_CANCELLED_AUTOMATICALLY' using errcode = '55000';
    end if;
    update public.hotel_bookings
       set status = 'CANCELLED',
           notes = nullif(trim(concat_ws(E'\n', v_existing.notes, p_notes)), ''),
           updated_at = now()
     where id = v_existing.id
     returning * into v_booking;
    return v_booking;
  end if;

  if p_check_in_date is null or p_check_out_date is null or p_check_out_date <= p_check_in_date then
    raise exception 'HOTEL_CHANNEL_STAY_DATES_INVALID' using errcode = '22023';
  end if;

  select * into v_mapping
  from public.hotel_channel_mappings
  where organization_id = p_organization_id
    and connection_id = p_connection_id
    and external_room_type_id = btrim(coalesce(p_external_room_type_id,''))
    and coalesce(external_rate_plan_id,'') = coalesce(btrim(p_external_rate_plan_id),'')
    and active = true
  order by created_at
  limit 1;
  if not found then raise exception 'HOTEL_CHANNEL_EXACT_ROOM_RATE_MAPPING_REQUIRED' using errcode = 'P0002'; end if;
  if v_mapping.local_rate_plan_id is null then raise exception 'HOTEL_CHANNEL_LOCAL_RATE_PLAN_REQUIRED' using errcode = '55000'; end if;

  if p_guest_id is not null and not exists (
    select 1 from public.hotel_guests g
    where g.organization_id = p_organization_id and g.id = p_guest_id
  ) then raise exception 'HOTEL_CHANNEL_GUEST_NOT_FOUND' using errcode = '23503'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    p_organization_id::text || ':' || p_property_id::text || ':' || v_mapping.local_room_type,
    0
  ));

  select count(*) into v_physical
  from public.hotel_rooms r
  where r.organization_id = p_organization_id
    and r.property_id = p_property_id
    and r.room_type = v_mapping.local_room_type
    and upper(coalesce(r.status,'')) <> 'OUT_OF_SERVICE';
  if v_physical <= 0 then raise exception 'HOTEL_CHANNEL_NO_PHYSICAL_ROOMS_FOR_MAPPING' using errcode = '55000'; end if;

  for v_date in select generate_series(p_check_in_date, p_check_out_date - 1, interval '1 day')::date loop
    select count(*) into v_occupied
    from public.hotel_bookings b
    join public.hotel_rooms r on r.id = b.room_id and r.organization_id = b.organization_id
    where b.organization_id = p_organization_id
      and b.property_id = p_property_id
      and r.room_type = v_mapping.local_room_type
      and b.status in ('RESERVED','CHECKED_IN')
      and (v_existing.id is null or b.id <> v_existing.id)
      and b.check_in_date <= v_date
      and b.check_out_date > v_date;

    select coalesce(sum(greatest(0, gb.allocated_rooms - (
      select count(*)
      from public.hotel_bookings pb
      join public.hotel_rooms pr on pr.id = pb.room_id and pr.organization_id = pb.organization_id
      where pb.organization_id = p_organization_id
        and pb.property_id = p_property_id
        and pb.group_id = gb.group_id
        and pr.room_type = v_mapping.local_room_type
        and pb.status in ('RESERVED','CHECKED_IN')
        and pb.check_in_date <= v_date
        and pb.check_out_date > v_date
    ))),0)::integer into v_held
    from public.hotel_group_room_blocks gb
    where gb.organization_id = p_organization_id
      and gb.property_id = p_property_id
      and gb.room_type = v_mapping.local_room_type
      and gb.stay_date = v_date
      and gb.deduct_inventory = true
      and gb.status = 'ACTIVE';

    if v_occupied + v_held >= v_physical then
      raise exception 'HOTEL_INVENTORY_CONFLICT: % inventory is occupied or protected on %', v_mapping.local_room_type, v_date;
    end if;
  end loop;

  select r.* into v_candidate
  from public.hotel_rooms r
  where r.organization_id = p_organization_id
    and r.property_id = p_property_id
    and r.room_type = v_mapping.local_room_type
    and upper(coalesce(r.status,'')) <> 'OUT_OF_SERVICE'
    and not exists (
      select 1 from public.hotel_bookings b
      where b.organization_id = p_organization_id
        and b.room_id = r.id
        and b.status in ('RESERVED','CHECKED_IN')
        and (v_existing.id is null or b.id <> v_existing.id)
        and b.check_in_date < p_check_out_date
        and b.check_out_date > p_check_in_date
    )
  order by case when v_existing.room_id = r.id then 0 else 1 end, r.room_number
  limit 1;
  if not found then raise exception 'HOTEL_INVENTORY_CONFLICT: no physical room is free for the mapped room type' using errcode = '55000'; end if;

  if v_existing.id is null then
    insert into public.hotel_bookings(
      organization_id, property_id, room_id, guest_id, rate_plan_id,
      channel_connection_id, external_reservation_id, channel_room_stay_id,
      booking_reference, check_in_date, check_out_date, adults, children, status,
      source, total_amount, paid_amount, payment_status, currency_code, notes
    ) values (
      p_organization_id, p_property_id, v_candidate.id, p_guest_id, v_mapping.local_rate_plan_id,
      p_connection_id, v_external_reservation_id, v_room_stay_id,
      nullif(trim(p_booking_reference),''), p_check_in_date, p_check_out_date,
      greatest(coalesce(p_adults,1),0), greatest(coalesce(p_children,0),0), 'RESERVED',
      upper(v_connection.provider), coalesce(p_total_amount,0), 0, 'UNPAID',
      coalesce(nullif(upper(trim(p_currency_code)),''),'THB'), nullif(trim(p_notes),'')
    ) returning * into v_booking;
  else
    if v_existing.status = 'CHECKED_IN' and (
      v_existing.room_id <> v_candidate.id
      or v_existing.check_in_date <> p_check_in_date
      or v_existing.check_out_date <> p_check_out_date
    ) then raise exception 'HOTEL_CHANNEL_CHECKED_IN_BOOKING_CANNOT_MOVE_AUTOMATICALLY' using errcode = '55000'; end if;

    update public.hotel_bookings
       set room_id = v_candidate.id,
           guest_id = coalesce(p_guest_id, v_existing.guest_id),
           rate_plan_id = v_mapping.local_rate_plan_id,
           booking_reference = coalesce(nullif(trim(p_booking_reference),''), v_existing.booking_reference),
           check_in_date = p_check_in_date,
           check_out_date = p_check_out_date,
           adults = greatest(coalesce(p_adults,1),0),
           children = greatest(coalesce(p_children,0),0),
           status = case when v_existing.status = 'CANCELLED' then 'RESERVED' else v_existing.status end,
           total_amount = coalesce(p_total_amount, v_existing.total_amount),
           currency_code = coalesce(nullif(upper(trim(p_currency_code)),''), v_existing.currency_code),
           notes = nullif(trim(concat_ws(E'\n', v_existing.notes, p_notes)), ''),
           updated_at = now()
     where id = v_existing.id
     returning * into v_booking;
  end if;

  return v_booking;
end;
$$;

revoke all on function public.hotel_apply_channel_booking_guarded(
  uuid, uuid, uuid, text, text, text, text, text, uuid, text, date, date,
  integer, integer, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.hotel_apply_channel_booking_guarded(
  uuid, uuid, uuid, text, text, text, text, text, uuid, text, date, date,
  integer, integer, numeric, text, text
) to service_role;

commit;
