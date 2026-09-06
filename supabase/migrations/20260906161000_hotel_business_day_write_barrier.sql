-- Hotel property-day closure authority.
--
-- Day Close and every mutation that can change the live close preflight share the same
-- transaction-scoped advisory lock. A mutation that reaches the lock first commits before
-- Day Close re-reads truth; Day Close that reaches it first closes the day and the waiting
-- mutation then fails closed. Realtime remains invalidation only and has no authority here.

create or replace function public.hotel_business_date_from_settings(
  p_time_zone text,
  p_cutoff_minutes integer,
  p_configured_at timestamptz,
  p_at timestamptz default now()
)
returns date
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_local timestamp without time zone;
  v_business_date date;
  v_minutes integer;
begin
  if nullif(btrim(coalesce(p_time_zone, '')), '') is null
     or p_cutoff_minutes is null
     or p_configured_at is null then
    return null;
  end if;

  if p_cutoff_minutes < 0 or p_cutoff_minutes > 720 then
    return null;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_timezone_names z
    where z.name = p_time_zone
  ) then
    return null;
  end if;

  v_local := pg_catalog.timezone(p_time_zone, p_at);
  v_business_date := v_local::date;
  v_minutes := extract(hour from v_local)::integer * 60 + extract(minute from v_local)::integer;

  if v_minutes < p_cutoff_minutes then
    v_business_date := v_business_date - 1;
  end if;

  return v_business_date;
end;
$function$;

create or replace function public.hotel_current_business_date(
  p_organization_id uuid,
  p_property_id uuid,
  p_at timestamptz default now()
)
returns date
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_property public.hotel_properties%rowtype;
begin
  select * into v_property
  from public.hotel_properties p
  where p.organization_id = p_organization_id
    and p.id = p_property_id;

  if not found then
    raise exception 'HOTEL_BUSINESS_DAY: property not found';
  end if;

  return public.hotel_business_date_from_settings(
    v_property.time_zone,
    v_property.business_day_cutoff_minutes,
    v_property.operational_day_configured_at,
    p_at
  );
end;
$function$;

create or replace function public.hotel_current_business_date_guarded(
  p_organization_id uuid,
  p_property_id uuid,
  p_at timestamptz default now()
)
returns date
language plpgsql
stable
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_business_date date;
begin
  v_business_date := public.hotel_current_business_date(p_organization_id, p_property_id, p_at);
  if v_business_date is null then
    raise exception 'HOTEL_BUSINESS_DAY_UNCONFIGURED: property timezone and day cutoff must be explicitly governed';
  end if;
  return v_business_date;
end;
$function$;

create or replace function public.hotel_lock_business_day(
  p_organization_id uuid,
  p_property_id uuid,
  p_business_date date
)
returns void
language plpgsql
volatile
security invoker
set search_path to 'public', 'pg_temp'
as $function$
begin
  if p_organization_id is null or p_property_id is null or p_business_date is null then
    raise exception 'HOTEL_BUSINESS_DAY: organization, property and business date are required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'hotel-business-day:' || p_organization_id::text || ':' || p_property_id::text || ':' || p_business_date::text,
      0
    )
  );
end;
$function$;

create or replace function public.hotel_assert_business_day_open(
  p_organization_id uuid,
  p_property_id uuid,
  p_business_date date
)
returns void
language plpgsql
volatile
security invoker
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.hotel_lock_business_day(p_organization_id, p_property_id, p_business_date);

  if exists (
    select 1
    from public.hotel_night_audits a
    where a.organization_id = p_organization_id
      and a.property_id = p_property_id
      and a.business_date = p_business_date
      and upper(coalesce(a.status, '')) = 'CLOSED'
  ) then
    raise exception 'HOTEL_BUSINESS_DAY_CLOSED: % is already closed for this property; use a governed correction path', p_business_date;
  end if;
end;
$function$;

-- Booking mutations are the primary arrival/departure source truth. Only rows that can
-- change the current Day Close preflight participate, so future reservations remain usable
-- after today's property day is closed.
create or replace function public.hotel_booking_business_day_barrier()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_business_date date;
  v_impacts boolean;
begin
  if tg_op <> 'INSERT' and old.property_id is not null then
    v_business_date := public.hotel_current_business_date(old.organization_id, old.property_id, now());
    if v_business_date is not null then
      v_impacts :=
        (upper(coalesce(old.status, '')) = 'RESERVED' and old.check_in_date is not null and old.check_in_date <= v_business_date)
        or (upper(coalesce(old.status, '')) = 'CHECKED_IN' and old.check_out_date is not null and old.check_out_date <= v_business_date)
        or (upper(coalesce(old.status, '')) = 'CHECKED_OUT' and coalesce(old.actual_check_out_business_date, old.check_out_date) = v_business_date);
      if v_impacts then
        perform public.hotel_assert_business_day_open(old.organization_id, old.property_id, v_business_date);
      end if;
    end if;
  end if;

  if tg_op <> 'DELETE' and new.property_id is not null then
    v_business_date := public.hotel_current_business_date(new.organization_id, new.property_id, now());
    if v_business_date is not null then
      if tg_op = 'UPDATE'
         and upper(coalesce(old.status, '')) = 'CHECKED_IN'
         and upper(coalesce(new.status, '')) = 'CHECKED_OUT'
         and new.actual_check_out_business_date is distinct from v_business_date then
        raise exception 'HOTEL_CHECKOUT: actual checkout business date does not match the governed property day';
      end if;

      v_impacts :=
        (upper(coalesce(new.status, '')) = 'RESERVED' and new.check_in_date is not null and new.check_in_date <= v_business_date)
        or (upper(coalesce(new.status, '')) = 'CHECKED_IN' and new.check_out_date is not null and new.check_out_date <= v_business_date)
        or (upper(coalesce(new.status, '')) = 'CHECKED_OUT' and coalesce(new.actual_check_out_business_date, new.check_out_date) = v_business_date);
      if v_impacts then
        perform public.hotel_assert_business_day_open(new.organization_id, new.property_id, v_business_date);
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists hotel_bookings_business_day_barrier on public.hotel_bookings;
create trigger hotel_bookings_business_day_barrier
before insert or update or delete on public.hotel_bookings
for each row execute function public.hotel_booking_business_day_barrier();

-- A departure folio becomes historical source truth when a guest checks out on the current
-- property day. Once that day closes, direct folio mutation is rejected rather than silently
-- rewriting the evidence Night Audit certified.
create or replace function public.hotel_folio_business_day_barrier()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_booking_id uuid;
  v_organization_id uuid;
  v_property_id uuid;
  v_booking public.hotel_bookings%rowtype;
  v_business_date date;
begin
  if tg_op = 'DELETE' then
    v_booking_id := old.booking_id;
    v_organization_id := old.organization_id;
    v_property_id := old.property_id;
  else
    v_booking_id := new.booking_id;
    v_organization_id := new.organization_id;
    v_property_id := new.property_id;
  end if;

  if v_booking_id is null or v_organization_id is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  select * into v_booking
  from public.hotel_bookings b
  where b.organization_id = v_organization_id
    and b.id = v_booking_id;

  if found then
    v_property_id := coalesce(v_property_id, v_booking.property_id);
    if v_property_id is not null then
      v_business_date := public.hotel_current_business_date(v_organization_id, v_property_id, now());
      if v_business_date is not null
         and upper(coalesce(v_booking.status, '')) = 'CHECKED_OUT'
         and coalesce(v_booking.actual_check_out_business_date, v_booking.check_out_date) = v_business_date then
        perform public.hotel_assert_business_day_open(v_organization_id, v_property_id, v_business_date);
      end if;
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

drop trigger if exists hotel_folios_business_day_barrier on public.hotel_folios;
create trigger hotel_folios_business_day_barrier
before insert or update or delete on public.hotel_folios
for each row execute function public.hotel_folio_business_day_barrier();

-- Operational-day settings themselves cannot jump away from a day after that day has been
-- certified closed. A later governed correction mechanism can be explicit and evidenced;
-- raw settings mutation is not that mechanism.
create or replace function public.hotel_property_operational_day_barrier()
returns trigger
language plpgsql
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_old_date date;
  v_new_date date;
begin
  if old.time_zone is not distinct from new.time_zone
     and old.business_day_cutoff_minutes is not distinct from new.business_day_cutoff_minutes
     and old.operational_day_configured_at is not distinct from new.operational_day_configured_at then
    return new;
  end if;

  v_old_date := public.hotel_business_date_from_settings(
    old.time_zone,
    old.business_day_cutoff_minutes,
    old.operational_day_configured_at,
    now()
  );
  if v_old_date is not null then
    perform public.hotel_assert_business_day_open(old.organization_id, old.id, v_old_date);
  end if;

  v_new_date := public.hotel_business_date_from_settings(
    new.time_zone,
    new.business_day_cutoff_minutes,
    new.operational_day_configured_at,
    now()
  );
  if v_new_date is not null and v_new_date is distinct from v_old_date then
    perform public.hotel_assert_business_day_open(new.organization_id, new.id, v_new_date);
  end if;

  return new;
end;
$function$;

drop trigger if exists hotel_properties_operational_day_barrier on public.hotel_properties;
create trigger hotel_properties_operational_day_barrier
before update of time_zone, business_day_cutoff_minutes, operational_day_configured_at on public.hotel_properties
for each row execute function public.hotel_property_operational_day_barrier();

-- Final Day Close authority. The UI preflight remains useful for human-readable work, but
-- this function independently re-reads every hard blocker while holding the same property-day
-- lock as the source mutations above. No preflight result supplied by the client is trusted.
create or replace function public.hotel_close_business_day_guarded(
  p_organization_id uuid,
  p_property_id uuid,
  p_expected_business_date date,
  p_control_summary jsonb default '{}'::jsonb,
  p_closed_by_staff_account_id uuid default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_business_date date;
  v_locked_business_date date;
  v_overdue_arrivals integer := 0;
  v_overdue_departures integer := 0;
  v_open_departure_folios integer := 0;
  v_channel_warnings integer := 0;
  v_now timestamptz := now();
  v_audit public.hotel_night_audits%rowtype;
  v_database_guard jsonb;
begin
  if p_organization_id is null or p_property_id is null or p_expected_business_date is null then
    raise exception 'HOTEL_DAY_CLOSE: organization, property and expected business date are required';
  end if;

  v_business_date := public.hotel_current_business_date_guarded(p_organization_id, p_property_id, v_now);
  if v_business_date is distinct from p_expected_business_date then
    raise exception 'HOTEL_DAY_CLOSE_DATE_MISMATCH: property day is %, not %', v_business_date, p_expected_business_date;
  end if;

  perform public.hotel_lock_business_day(p_organization_id, p_property_id, v_business_date);

  -- Re-read after acquiring the lock. If a settings transaction won the race, use neither
  -- the stale preflight nor the stale date supplied by the server.
  v_locked_business_date := public.hotel_current_business_date_guarded(p_organization_id, p_property_id, v_now);
  if v_locked_business_date is distinct from v_business_date
     or v_locked_business_date is distinct from p_expected_business_date then
    raise exception 'HOTEL_DAY_CLOSE_DATE_MISMATCH: property day changed while close was waiting for authority';
  end if;

  select * into v_audit
  from public.hotel_night_audits a
  where a.organization_id = p_organization_id
    and a.property_id = p_property_id
    and a.business_date = v_business_date
  for update;

  if found and upper(coalesce(v_audit.status, '')) = 'CLOSED' then
    return jsonb_build_object(
      'audit', to_jsonb(v_audit),
      'already_closed', true,
      'business_date', v_business_date
    );
  end if;

  select count(*) into v_overdue_arrivals
  from public.hotel_bookings b
  where b.organization_id = p_organization_id
    and b.property_id = p_property_id
    and upper(coalesce(b.status, '')) = 'RESERVED'
    and b.check_in_date is not null
    and b.check_in_date <= v_business_date;

  select count(*) into v_overdue_departures
  from public.hotel_bookings b
  where b.organization_id = p_organization_id
    and b.property_id = p_property_id
    and upper(coalesce(b.status, '')) = 'CHECKED_IN'
    and b.check_out_date is not null
    and b.check_out_date <= v_business_date;

  select count(*) into v_open_departure_folios
  from public.hotel_folios f
  join public.hotel_bookings b
    on b.organization_id = f.organization_id
   and b.id = f.booking_id
  where f.organization_id = p_organization_id
    and f.property_id = p_property_id
    and upper(coalesce(f.status, '')) = 'OPEN'
    and upper(coalesce(b.status, '')) = 'CHECKED_OUT'
    and b.check_out_date is not null
    and b.check_out_date <= v_business_date;

  if v_overdue_arrivals > 0 or v_overdue_departures > 0 or v_open_departure_folios > 0 then
    raise exception 'HOTEL_DAY_CLOSE_BLOCKED: unresolved arrivals %, unresolved departures %, open departure folios %',
      v_overdue_arrivals, v_overdue_departures, v_open_departure_folios;
  end if;

  select count(*) into v_channel_warnings
  from public.hotel_channel_sync_jobs j
  where j.organization_id = p_organization_id
    and j.property_id = p_property_id
    and upper(coalesce(j.status, '')) in ('FAILED', 'RETRY_REQUIRED');

  v_database_guard := jsonb_build_object(
    'business_date', v_business_date,
    'closed_under_business_day_lock', true,
    'checked_at', v_now,
    'overdue_arrivals', v_overdue_arrivals,
    'overdue_departures', v_overdue_departures,
    'open_departure_folios', v_open_departure_folios,
    'channel_warnings', v_channel_warnings
  );

  insert into public.hotel_night_audits (
    organization_id,
    property_id,
    business_date,
    status,
    control_summary,
    closed_by,
    closed_at,
    updated_at
  ) values (
    p_organization_id,
    p_property_id,
    v_business_date,
    'CLOSED',
    coalesce(p_control_summary, '{}'::jsonb) || jsonb_build_object('database_guard', v_database_guard),
    p_closed_by_staff_account_id,
    v_now,
    v_now
  )
  on conflict (organization_id, property_id, business_date)
  do update set
    status = 'CLOSED',
    control_summary = excluded.control_summary,
    closed_by = excluded.closed_by,
    closed_at = excluded.closed_at,
    updated_at = excluded.updated_at
  returning * into v_audit;

  return jsonb_build_object(
    'audit', to_jsonb(v_audit),
    'already_closed', false,
    'business_date', v_business_date,
    'database_guard', v_database_guard
  );
end;
$function$;

-- These routines are server authority. Browsers may read governed Hotel projections through
-- existing RLS, but they cannot call the write barrier or Day Close authority directly.
revoke all on function public.hotel_business_date_from_settings(text, integer, timestamptz, timestamptz) from public;
revoke all on function public.hotel_business_date_from_settings(text, integer, timestamptz, timestamptz) from anon;
revoke all on function public.hotel_business_date_from_settings(text, integer, timestamptz, timestamptz) from authenticated;
grant execute on function public.hotel_business_date_from_settings(text, integer, timestamptz, timestamptz) to service_role;

revoke all on function public.hotel_current_business_date(uuid, uuid, timestamptz) from public;
revoke all on function public.hotel_current_business_date(uuid, uuid, timestamptz) from anon;
revoke all on function public.hotel_current_business_date(uuid, uuid, timestamptz) from authenticated;
grant execute on function public.hotel_current_business_date(uuid, uuid, timestamptz) to service_role;

revoke all on function public.hotel_current_business_date_guarded(uuid, uuid, timestamptz) from public;
revoke all on function public.hotel_current_business_date_guarded(uuid, uuid, timestamptz) from anon;
revoke all on function public.hotel_current_business_date_guarded(uuid, uuid, timestamptz) from authenticated;
grant execute on function public.hotel_current_business_date_guarded(uuid, uuid, timestamptz) to service_role;

revoke all on function public.hotel_lock_business_day(uuid, uuid, date) from public;
revoke all on function public.hotel_lock_business_day(uuid, uuid, date) from anon;
revoke all on function public.hotel_lock_business_day(uuid, uuid, date) from authenticated;
grant execute on function public.hotel_lock_business_day(uuid, uuid, date) to service_role;

revoke all on function public.hotel_assert_business_day_open(uuid, uuid, date) from public;
revoke all on function public.hotel_assert_business_day_open(uuid, uuid, date) from anon;
revoke all on function public.hotel_assert_business_day_open(uuid, uuid, date) from authenticated;
grant execute on function public.hotel_assert_business_day_open(uuid, uuid, date) to service_role;

revoke all on function public.hotel_close_business_day_guarded(uuid, uuid, date, jsonb, uuid) from public;
revoke all on function public.hotel_close_business_day_guarded(uuid, uuid, date, jsonb, uuid) from anon;
revoke all on function public.hotel_close_business_day_guarded(uuid, uuid, date, jsonb, uuid) from authenticated;
grant execute on function public.hotel_close_business_day_guarded(uuid, uuid, date, jsonb, uuid) to service_role;
