begin;

create unique index if not exists hotel_channel_mappings_active_external_uniq
  on public.hotel_channel_mappings(
    organization_id,
    connection_id,
    external_room_type_id,
    coalesce(external_rate_plan_id, '')
  )
  where active = true;

create or replace function public.hotel_apply_channel_reservation_guarded(
  p_organization_id uuid,
  p_property_id uuid,
  p_connection_id uuid,
  p_external_reservation_id text,
  p_event_type text,
  p_guest_id uuid,
  p_booking_reference text,
  p_currency_code text,
  p_notes text,
  p_rooms jsonb
) returns setof public.hotel_bookings
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_event text := upper(btrim(coalesce(p_event_type, '')));
  v_room jsonb;
  v_booking public.hotel_bookings%rowtype;
  v_existing public.hotel_bookings%rowtype;
  v_room_count integer := 0;
begin
  if v_event not in ('NEW','MODIFY','CANCEL') then
    raise exception 'HOTEL_CHANNEL_RESERVATION_EVENT_INVALID' using errcode = '22023';
  end if;

  if v_event = 'CANCEL' and (p_rooms is null or jsonb_typeof(p_rooms) <> 'array' or jsonb_array_length(p_rooms) = 0) then
    for v_existing in
      select *
      from public.hotel_bookings
      where organization_id = p_organization_id
        and property_id = p_property_id
        and channel_connection_id = p_connection_id
        and external_reservation_id = btrim(p_external_reservation_id)
      order by created_at, id
    loop
      select * into v_booking
      from public.hotel_apply_channel_booking_guarded(
        p_organization_id,
        p_property_id,
        p_connection_id,
        p_external_reservation_id,
        v_existing.channel_room_stay_id,
        'CANCEL',
        '',
        '',
        p_guest_id,
        p_booking_reference,
        null,
        null,
        null,
        null,
        null,
        p_currency_code,
        p_notes
      );
      v_room_count := v_room_count + 1;
      return next v_booking;
    end loop;
    if v_room_count = 0 then
      raise exception 'HOTEL_CHANNEL_BOOKING_NOT_FOUND_FOR_CANCEL' using errcode = 'P0002';
    end if;
    return;
  end if;

  if p_rooms is null or jsonb_typeof(p_rooms) <> 'array' or jsonb_array_length(p_rooms) = 0 then
    raise exception 'HOTEL_CHANNEL_RESERVATION_ROOMS_REQUIRED' using errcode = '22023';
  end if;

  for v_room in select value from jsonb_array_elements(p_rooms)
  loop
    if nullif(btrim(coalesce(v_room->>'channel_room_stay_id','')), '') is null then
      raise exception 'HOTEL_CHANNEL_ROOM_STAY_ID_REQUIRED' using errcode = '22023';
    end if;

    select * into v_booking
    from public.hotel_apply_channel_booking_guarded(
      p_organization_id,
      p_property_id,
      p_connection_id,
      p_external_reservation_id,
      v_room->>'channel_room_stay_id',
      v_event,
      v_room->>'external_room_type_id',
      v_room->>'external_rate_plan_id',
      p_guest_id,
      p_booking_reference,
      nullif(v_room->>'check_in_date','')::date,
      nullif(v_room->>'check_out_date','')::date,
      nullif(v_room->>'adults','')::integer,
      nullif(v_room->>'children','')::integer,
      nullif(v_room->>'amount','')::numeric,
      coalesce(nullif(v_room->>'currency_code',''), p_currency_code),
      p_notes
    );
    v_room_count := v_room_count + 1;
    return next v_booking;
  end loop;

  if v_room_count = 0 then
    raise exception 'HOTEL_CHANNEL_RESERVATION_ROOMS_REQUIRED' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.hotel_apply_channel_reservation_guarded(
  uuid, uuid, uuid, text, text, uuid, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.hotel_apply_channel_reservation_guarded(
  uuid, uuid, uuid, text, text, uuid, text, text, text, jsonb
) to service_role;

commit;
