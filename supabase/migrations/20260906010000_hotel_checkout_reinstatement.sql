alter table public.hotel_bookings
  add column if not exists actual_check_out_business_date date;

create table if not exists public.hotel_booking_reinstatements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  booking_id uuid not null references public.hotel_bookings(id) on delete restrict,
  original_room_id uuid references public.hotel_rooms(id) on delete set null,
  reinstated_room_id uuid references public.hotel_rooms(id) on delete set null,
  business_date date not null,
  reason text not null,
  previous_actual_check_out_at timestamptz,
  created_at timestamptz not null default now(),
  constraint hotel_booking_reinstatement_reason_length check (char_length(btrim(reason)) between 8 and 1000)
);

create index if not exists hotel_booking_reinstatements_booking_idx
  on public.hotel_booking_reinstatements (organization_id, booking_id, created_at desc);

alter table public.hotel_booking_reinstatements enable row level security;

create policy "hotel_booking_reinstatements_org_read"
  on public.hotel_booking_reinstatements
  for select
  using (
    exists (
      select 1
      from public.organization_users ou
      join public.staff_accounts sa on sa.id = ou.staff_account_id
      where ou.organization_id = hotel_booking_reinstatements.organization_id
        and upper(coalesce(ou.status, 'ACTIVE')) = 'ACTIVE'
        and coalesce(sa.auth_user_id, sa.user_id) = auth.uid()
        and coalesce(sa.active, true) = true
    )
  );

create or replace function public.hotel_reinstate_checkout(
  p_organization_id uuid,
  p_booking_id uuid,
  p_room_id uuid,
  p_business_date date,
  p_reason text
)
returns public.hotel_bookings
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_booking public.hotel_bookings%rowtype;
  v_room public.hotel_rooms%rowtype;
  v_result public.hotel_bookings%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_active_turnover_count integer := 0;
  v_pending_turnover_id uuid;
begin
  if p_room_id is null then raise exception 'A governed room is required for reinstatement'; end if;
  if p_business_date is null then raise exception 'Current property business date is required'; end if;
  if char_length(v_reason) < 8 or char_length(v_reason) > 1000 then
    raise exception 'Reinstatement reason must be between 8 and 1000 characters';
  end if;

  select * into v_booking
  from public.hotel_bookings
  where id = p_booking_id
    and organization_id = p_organization_id
  for update;

  if not found then raise exception 'Hotel booking not found'; end if;
  if upper(coalesce(v_booking.status, '')) <> 'CHECKED_OUT' then
    raise exception 'Only a checked-out stay can be reinstated';
  end if;
  if v_booking.property_id is null then raise exception 'Booking has no governed Hotel property'; end if;
  if v_booking.actual_check_out_business_date is null then
    raise exception 'Checkout has no durable business-date evidence and cannot be reinstated automatically';
  end if;
  if v_booking.actual_check_out_business_date <> p_business_date then
    raise exception 'Checkout can be reinstated only on the same property business day';
  end if;

  if exists (
    select 1 from public.hotel_night_audits na
    where na.organization_id = p_organization_id
      and na.property_id = v_booking.property_id
      and na.business_date = p_business_date
      and upper(coalesce(na.status, '')) = 'CLOSED'
  ) then
    raise exception 'The checkout business day is already closed';
  end if;

  select * into v_room
  from public.hotel_rooms
  where id = p_room_id
    and organization_id = p_organization_id
    and property_id = v_booking.property_id
  for update;
  if not found then raise exception 'Selected room is not part of this Hotel property'; end if;

  if p_room_id = v_booking.room_id then
    if upper(coalesce(v_room.status, '')) not in ('DIRTY', 'AVAILABLE') then
      raise exception 'Original room is no longer safely recoverable';
    end if;

    select count(*) into v_active_turnover_count
    from public.hotel_housekeeping_tasks ht
    where ht.organization_id = p_organization_id
      and ht.room_id = p_room_id
      and ht.booking_id = p_booking_id
      and upper(coalesce(ht.task_type, '')) = 'CLEANING'
      and upper(coalesce(ht.task_status, '')) in ('IN_PROGRESS', 'AWAITING_INSPECTION');
    if v_active_turnover_count > 0 then
      raise exception 'Housekeeping has already started on the original room';
    end if;

    select id into v_pending_turnover_id
    from public.hotel_housekeeping_tasks ht
    where ht.organization_id = p_organization_id
      and ht.room_id = p_room_id
      and ht.booking_id = p_booking_id
      and upper(coalesce(ht.task_type, '')) = 'CLEANING'
      and upper(coalesce(ht.task_status, '')) = 'PENDING'
    order by created_at desc
    limit 1
    for update;
  else
    if upper(coalesce(v_room.status, '')) <> 'AVAILABLE' then
      raise exception 'Replacement room must be AVAILABLE';
    end if;
  end if;

  if exists (
    select 1
    from public.hotel_bookings other
    where other.organization_id = p_organization_id
      and other.property_id = v_booking.property_id
      and other.room_id = p_room_id
      and other.id <> p_booking_id
      and upper(coalesce(other.status, '')) in ('RESERVED', 'CHECKED_IN')
      and other.check_out_date > p_business_date
      and (
        other.check_in_date < v_booking.check_out_date
        or (v_booking.check_out_date <= p_business_date and other.check_in_date <= p_business_date)
      )
  ) then
    raise exception 'Selected room conflicts with another active or same-day arriving stay';
  end if;

  update public.hotel_rooms
  set status = 'OCCUPIED', updated_at = now()
  where id = p_room_id
    and organization_id = p_organization_id;

  if v_pending_turnover_id is not null then
    update public.hotel_housekeeping_tasks
    set task_status = 'CANCELLED',
        updated_at = now(),
        notes = concat_ws(E'\n', nullif(notes, ''), 'Cancelled automatically: guest stay reinstated before cleaning began.')
    where id = v_pending_turnover_id
      and organization_id = p_organization_id
      and task_status = 'PENDING';
  end if;

  update public.hotel_bookings
  set status = 'CHECKED_IN',
      room_id = p_room_id,
      updated_at = now()
  where id = p_booking_id
    and organization_id = p_organization_id
    and status = 'CHECKED_OUT'
  returning * into v_result;

  if not found then raise exception 'Booking state changed before reinstatement completed'; end if;

  insert into public.hotel_booking_reinstatements (
    organization_id, property_id, booking_id, original_room_id, reinstated_room_id,
    business_date, reason, previous_actual_check_out_at
  ) values (
    p_organization_id, v_booking.property_id, p_booking_id, v_booking.room_id, p_room_id,
    p_business_date, v_reason, v_booking.actual_check_out_at
  );

  return v_result;
end;
$$;

comment on function public.hotel_reinstate_checkout(uuid, uuid, uuid, date, text) is
  'Atomically reinstates a same-business-day mistaken Hotel checkout without changing folio, payment, charge, booked departure, or original checkout history.';
