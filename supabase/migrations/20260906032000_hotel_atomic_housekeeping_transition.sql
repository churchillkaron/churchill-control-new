create or replace function public.hotel_transition_housekeeping_task(
  p_organization_id uuid,
  p_task_id uuid,
  p_action text
)
returns public.hotel_housekeeping_tasks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task public.hotel_housekeeping_tasks%rowtype;
  v_room public.hotel_rooms%rowtype;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_task_status text;
  v_room_status text;
  v_next_task_status text;
  v_next_room_status text;
  v_now timestamptz := now();
begin
  select *
  into v_task
  from public.hotel_housekeeping_tasks
  where organization_id = p_organization_id
    and id = p_task_id
  for update;

  if not found then
    raise exception 'Housekeeping task not found for this organization';
  end if;

  v_task_status := upper(coalesce(v_task.task_status, ''));

  if v_task.room_id is null then
    if v_action = 'START' then
      if v_task_status <> 'PENDING' then
        raise exception 'Task must be PENDING before START';
      end if;
      v_next_task_status := 'IN_PROGRESS';
    elsif v_action = 'COMPLETE' then
      if v_task_status <> 'IN_PROGRESS' then
        raise exception 'Task must be IN_PROGRESS before COMPLETE';
      end if;
      v_next_task_status := 'COMPLETED';
    elsif v_action = 'INSPECT' then
      raise exception 'Use governed Housekeeping inspection outcome';
    else
      raise exception 'Unsupported housekeeping action: %', coalesce(nullif(v_action, ''), 'EMPTY');
    end if;

    update public.hotel_housekeeping_tasks
    set task_status = v_next_task_status,
        completed_at = case when v_next_task_status = 'COMPLETED' then v_now else null end,
        updated_at = v_now
    where organization_id = p_organization_id
      and id = p_task_id
    returning * into v_task;

    return v_task;
  end if;

  select *
  into v_room
  from public.hotel_rooms
  where organization_id = p_organization_id
    and id = v_task.room_id
  for update;

  if not found then
    raise exception 'Housekeeping room was not found for this organization';
  end if;

  v_room_status := upper(coalesce(v_room.status, ''));

  if v_action = 'START' then
    if v_task_status <> 'PENDING' then
      raise exception 'Task must be PENDING before START';
    end if;
    if v_room_status <> 'DIRTY' then
      raise exception 'Room must be DIRTY before START; current state is %', coalesce(nullif(v_room_status, ''), 'UNKNOWN');
    end if;
    v_next_task_status := 'IN_PROGRESS';
    v_next_room_status := 'CLEANING';

  elsif v_action = 'COMPLETE' then
    if v_task_status <> 'IN_PROGRESS' then
      raise exception 'Task must be IN_PROGRESS before COMPLETE';
    end if;
    if v_room_status not in ('CLEANING', 'DIRTY') then
      raise exception 'Room must be CLEANING or DIRTY before COMPLETE; current state is %', coalesce(nullif(v_room_status, ''), 'UNKNOWN');
    end if;
    v_next_task_status := 'AWAITING_INSPECTION';
    v_next_room_status := 'CLEAN';

  elsif v_action = 'INSPECT' then
    raise exception 'Use governed Housekeeping inspection outcome';

  else
    raise exception 'Unsupported housekeeping action: %', coalesce(nullif(v_action, ''), 'EMPTY');
  end if;

  update public.hotel_rooms
  set status = v_next_room_status,
      updated_at = v_now
  where organization_id = p_organization_id
    and id = v_room.id;

  update public.hotel_housekeeping_tasks
  set task_status = v_next_task_status,
      completed_at = case when v_next_task_status = 'COMPLETED' then v_now else null end,
      updated_at = v_now
  where organization_id = p_organization_id
    and id = v_task.id
  returning * into v_task;

  return v_task;
end;
$$;

revoke all on function public.hotel_transition_housekeeping_task(uuid, uuid, text) from public;
revoke all on function public.hotel_transition_housekeeping_task(uuid, uuid, text) from anon;
revoke all on function public.hotel_transition_housekeeping_task(uuid, uuid, text) from authenticated;
grant execute on function public.hotel_transition_housekeeping_task(uuid, uuid, text) to service_role;

create or replace function public.hotel_restore_housekeeping_work_for_arrival(
  p_organization_id uuid,
  p_booking_id uuid
)
returns public.hotel_housekeeping_tasks
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.hotel_bookings%rowtype;
  v_room public.hotel_rooms%rowtype;
  v_task public.hotel_housekeeping_tasks%rowtype;
  v_room_status text;
  v_task_status text;
  v_now timestamptz := now();
  v_property_timezone text;
  v_cutoff_minutes integer;
  v_operational_configured_at timestamptz;
  v_property_local timestamp;
  v_business_date date;
  v_wall_minutes integer;
begin
  select *
  into v_booking
  from public.hotel_bookings
  where organization_id = p_organization_id
    and id = p_booking_id
  for update;

  if not found then
    raise exception 'Arrival booking not found';
  end if;

  if upper(coalesce(v_booking.status, '')) <> 'RESERVED' then
    raise exception 'Housekeeping recovery is only available for a reserved arrival';
  end if;

  if v_booking.property_id is null or v_booking.room_id is null then
    raise exception 'Arrival must have an assigned property room before Housekeeping recovery';
  end if;

  select p.time_zone, p.business_day_cutoff_minutes, p.operational_day_configured_at
  into v_property_timezone, v_cutoff_minutes, v_operational_configured_at
  from public.hotel_properties p
  where p.organization_id = p_organization_id
    and p.id = v_booking.property_id;

  if nullif(btrim(coalesce(v_property_timezone, '')), '') is null
     or v_cutoff_minutes is null
     or v_cutoff_minutes < 0
     or v_cutoff_minutes > 720
     or v_operational_configured_at is null then
    raise exception 'Property operational day must be configured before Housekeeping recovery';
  end if;

  begin
    v_property_local := timezone(v_property_timezone, v_now);
  exception when others then
    raise exception 'Property operational day timezone is invalid';
  end;

  v_wall_minutes := extract(hour from v_property_local)::integer * 60 + extract(minute from v_property_local)::integer;
  v_business_date := v_property_local::date;
  if v_wall_minutes < v_cutoff_minutes then
    v_business_date := v_business_date - 1;
  end if;

  if v_booking.check_in_date is null or v_booking.check_in_date > v_business_date then
    raise exception 'Arrival is not due on the property business day';
  end if;

  select *
  into v_room
  from public.hotel_rooms
  where organization_id = p_organization_id
    and id = v_booking.room_id
    and property_id = v_booking.property_id
  for update;

  if not found then
    raise exception 'Assigned room was not found for this arrival';
  end if;

  v_room_status := upper(coalesce(v_room.status, ''));
  if v_room_status not in ('DIRTY', 'CLEANING', 'CLEAN') then
    raise exception 'Assigned room state does not require Housekeeping recovery';
  end if;

  if exists (
    select 1
    from public.hotel_maintenance_requests mr
    where mr.organization_id = p_organization_id
      and mr.room_id = v_room.id
      and upper(coalesce(mr.status, '')) not in ('RESOLVED', 'CLOSED', 'COMPLETED', 'CANCELLED')
  ) then
    raise exception 'Maintenance now owns this room-readiness blocker';
  end if;

  select *
  into v_task
  from public.hotel_housekeeping_tasks ht
  where ht.organization_id = p_organization_id
    and ht.room_id = v_room.id
    and upper(coalesce(ht.task_status, '')) in ('PENDING', 'IN_PROGRESS', 'AWAITING_INSPECTION')
  order by
    case upper(coalesce(ht.task_status, ''))
      when 'AWAITING_INSPECTION' then 0
      when 'IN_PROGRESS' then 1
      else 2
    end,
    ht.updated_at desc nulls last
  limit 1;

  if found then
    return v_task;
  end if;

  v_task_status := case v_room_status
    when 'DIRTY' then 'PENDING'
    when 'CLEANING' then 'IN_PROGRESS'
    when 'CLEAN' then 'AWAITING_INSPECTION'
  end;

  insert into public.hotel_housekeeping_tasks (
    organization_id,
    room_id,
    assigned_to,
    task_status,
    priority,
    task_date,
    notes,
    completed_at,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    v_room.id,
    null,
    v_task_status,
    'HIGH',
    v_business_date,
    'Recovered from physical room state for due arrival ' || coalesce(nullif(v_booking.booking_reference, ''), v_booking.id::text) || '.',
    null,
    v_now,
    v_now
  )
  returning * into v_task;

  return v_task;
end;
$$;

revoke all on function public.hotel_restore_housekeeping_work_for_arrival(uuid, uuid) from public;
revoke all on function public.hotel_restore_housekeeping_work_for_arrival(uuid, uuid) from anon;
revoke all on function public.hotel_restore_housekeeping_work_for_arrival(uuid, uuid) from authenticated;
grant execute on function public.hotel_restore_housekeeping_work_for_arrival(uuid, uuid) to service_role;

create table if not exists public.hotel_housekeeping_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  task_id uuid not null references public.hotel_housekeeping_tasks(id) on delete cascade,
  room_id uuid not null references public.hotel_rooms(id) on delete restrict,
  inspector_staff_account_id uuid,
  outcome text not null check (outcome in ('PASS', 'RECLEAN', 'MAINTENANCE')),
  reason_code text,
  notes text,
  maintenance_request_id uuid references public.hotel_maintenance_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint hotel_housekeeping_inspection_failure_reason_check
    check (outcome = 'PASS' or nullif(btrim(reason_code), '') is not null)
);

create index if not exists hotel_housekeeping_inspections_task_created_idx
  on public.hotel_housekeeping_inspections (task_id, created_at desc);
create index if not exists hotel_housekeeping_inspections_room_created_idx
  on public.hotel_housekeeping_inspections (organization_id, room_id, created_at desc);

alter table public.hotel_housekeeping_inspections enable row level security;
revoke all on table public.hotel_housekeeping_inspections from public;
revoke all on table public.hotel_housekeeping_inspections from anon;
revoke all on table public.hotel_housekeeping_inspections from authenticated;
grant select, insert on table public.hotel_housekeeping_inspections to service_role;

create or replace function public.hotel_inspect_housekeeping_task(
  p_organization_id uuid,
  p_task_id uuid,
  p_outcome text,
  p_reason_code text,
  p_notes text,
  p_maintenance_priority text,
  p_inspector_staff_account_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task public.hotel_housekeeping_tasks%rowtype;
  v_room public.hotel_rooms%rowtype;
  v_outcome text := upper(btrim(coalesce(p_outcome, '')));
  v_reason text := upper(btrim(coalesce(p_reason_code, '')));
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_priority text := upper(btrim(coalesce(nullif(p_maintenance_priority, ''), 'HIGH')));
  v_now timestamptz := now();
  v_maintenance_request_id uuid;
  v_inspection_id uuid;
  v_issue_title text;
begin
  if v_outcome not in ('PASS', 'RECLEAN', 'MAINTENANCE') then
    raise exception 'Unsupported Housekeeping inspection outcome';
  end if;
  if v_outcome <> 'PASS' and v_reason = '' then
    raise exception 'Inspection failure reason is required';
  end if;
  if v_outcome = 'MAINTENANCE' and v_priority not in ('NORMAL', 'HIGH', 'URGENT') then
    raise exception 'Maintenance inspection priority must be NORMAL, HIGH or URGENT';
  end if;

  select *
  into v_task
  from public.hotel_housekeeping_tasks
  where organization_id = p_organization_id
    and id = p_task_id
  for update;

  if not found then
    raise exception 'Housekeeping task not found for this organization';
  end if;
  if v_task.room_id is null then
    raise exception 'Room inspection requires a room-linked Housekeeping task';
  end if;
  if upper(coalesce(v_task.task_status, '')) <> 'AWAITING_INSPECTION' then
    raise exception 'Task must be AWAITING_INSPECTION before inspection outcome';
  end if;

  select *
  into v_room
  from public.hotel_rooms
  where organization_id = p_organization_id
    and id = v_task.room_id
  for update;

  if not found then
    raise exception 'Housekeeping room was not found for this organization';
  end if;
  if upper(coalesce(v_room.status, '')) <> 'CLEAN' then
    raise exception 'Room must be CLEAN before inspection outcome';
  end if;

  if v_outcome = 'PASS' then
    if exists (
      select 1
      from public.hotel_maintenance_requests mr
      where mr.organization_id = p_organization_id
        and mr.room_id = v_task.room_id
        and upper(coalesce(mr.status, '')) not in ('RESOLVED', 'CLOSED', 'COMPLETED', 'CANCELLED')
    ) then
      raise exception 'Room still has unresolved maintenance and cannot pass inspection';
    end if;

    if exists (
      select 1
      from public.hotel_housekeeping_tasks other_task
      where other_task.organization_id = p_organization_id
        and other_task.room_id = v_task.room_id
        and other_task.id <> v_task.id
        and upper(coalesce(other_task.task_status, '')) in ('PENDING', 'IN_PROGRESS', 'AWAITING_INSPECTION')
    ) then
      raise exception 'Room still has another active Housekeeping task and cannot pass inspection';
    end if;

    if exists (
      select 1
      from public.hotel_bookings booking
      where booking.organization_id = p_organization_id
        and booking.room_id = v_task.room_id
        and upper(coalesce(booking.status, '')) = 'CHECKED_IN'
    ) then
      raise exception 'Room is still assigned to an in-house stay and cannot pass inspection';
    end if;

    update public.hotel_rooms
    set status = 'AVAILABLE', updated_at = v_now
    where organization_id = p_organization_id and id = v_room.id;

    update public.hotel_housekeeping_tasks
    set task_status = 'COMPLETED', completed_at = v_now, updated_at = v_now
    where organization_id = p_organization_id and id = v_task.id
    returning * into v_task;

  elsif v_outcome = 'RECLEAN' then
    update public.hotel_rooms
    set status = 'DIRTY', updated_at = v_now
    where organization_id = p_organization_id and id = v_room.id;

    update public.hotel_housekeeping_tasks
    set task_status = 'PENDING', completed_at = null, updated_at = v_now
    where organization_id = p_organization_id and id = v_task.id
    returning * into v_task;

  else
    select mr.id
    into v_maintenance_request_id
    from public.hotel_maintenance_requests mr
    where mr.organization_id = p_organization_id
      and mr.room_id = v_task.room_id
      and upper(coalesce(mr.status, '')) not in ('RESOLVED', 'CLOSED', 'COMPLETED', 'CANCELLED')
    order by mr.created_at asc nulls last
    limit 1
    for update;

    if v_maintenance_request_id is null then
      v_issue_title := case v_reason
        when 'PLUMBING' then 'Housekeeping inspection: plumbing defect'
        when 'ELECTRICAL' then 'Housekeeping inspection: electrical defect'
        when 'HVAC' then 'Housekeeping inspection: HVAC defect'
        when 'FIXTURE' then 'Housekeeping inspection: fixture defect'
        when 'SAFETY' then 'Housekeeping inspection: safety defect'
        when 'DAMAGE' then 'Housekeeping inspection: room damage'
        else 'Housekeeping inspection: maintenance defect'
      end;

      insert into public.hotel_maintenance_requests (
        organization_id,
        room_id,
        reported_by,
        issue_title,
        issue_description,
        priority,
        status,
        created_at,
        updated_at
      ) values (
        p_organization_id,
        v_task.room_id,
        p_inspector_staff_account_id,
        v_issue_title,
        coalesce(v_notes, 'Defect identified during Housekeeping inspection. Reason: ' || v_reason || '.'),
        v_priority,
        'OPEN',
        v_now,
        v_now
      )
      returning id into v_maintenance_request_id;
    end if;

    -- Keep the room CLEAN but blocked and keep this QC task awaiting inspection.
    -- Maintenance owns the physical defect now; after repair, Housekeeping must
    -- explicitly re-inspect before the room can become AVAILABLE.
    update public.hotel_housekeeping_tasks
    set completed_at = null, updated_at = v_now
    where organization_id = p_organization_id and id = v_task.id
    returning * into v_task;
  end if;

  insert into public.hotel_housekeeping_inspections (
    organization_id,
    task_id,
    room_id,
    inspector_staff_account_id,
    outcome,
    reason_code,
    notes,
    maintenance_request_id,
    created_at
  ) values (
    p_organization_id,
    v_task.id,
    v_task.room_id,
    p_inspector_staff_account_id,
    v_outcome,
    nullif(v_reason, ''),
    v_notes,
    v_maintenance_request_id,
    v_now
  )
  returning id into v_inspection_id;

  return jsonb_build_object(
    'task', to_jsonb(v_task),
    'inspection_id', v_inspection_id,
    'outcome', v_outcome,
    'maintenance_request_id', v_maintenance_request_id
  );
end;
$$;

revoke all on function public.hotel_inspect_housekeeping_task(uuid, uuid, text, text, text, text, uuid) from public;
revoke all on function public.hotel_inspect_housekeeping_task(uuid, uuid, text, text, text, text, uuid) from anon;
revoke all on function public.hotel_inspect_housekeeping_task(uuid, uuid, text, text, text, text, uuid) from authenticated;
grant execute on function public.hotel_inspect_housekeeping_task(uuid, uuid, text, text, text, text, uuid) to service_role;
