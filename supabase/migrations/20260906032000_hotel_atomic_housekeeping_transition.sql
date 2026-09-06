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

  -- Roomless Housekeeping work remains a generic task lifecycle. It still
  -- transitions atomically, but it cannot mutate physical room readiness.
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
    if v_task_status <> 'AWAITING_INSPECTION' then
      raise exception 'Task must be AWAITING_INSPECTION before INSPECT';
    end if;
    if v_room_status <> 'CLEAN' then
      raise exception 'Room must be CLEAN before INSPECT; current state is %', coalesce(nullif(v_room_status, ''), 'UNKNOWN');
    end if;

    if exists (
      select 1
      from public.hotel_maintenance_requests mr
      where mr.organization_id = p_organization_id
        and mr.room_id = v_task.room_id
        and upper(coalesce(mr.status, '')) not in ('RESOLVED', 'CLOSED', 'COMPLETED', 'CANCELLED')
    ) then
      raise exception 'Room still has unresolved or unclassified maintenance and cannot be released to Front Desk';
    end if;

    if exists (
      select 1
      from public.hotel_housekeeping_tasks other_task
      where other_task.organization_id = p_organization_id
        and other_task.room_id = v_task.room_id
        and other_task.id <> v_task.id
        and upper(coalesce(other_task.task_status, '')) in ('PENDING', 'IN_PROGRESS', 'AWAITING_INSPECTION')
    ) then
      raise exception 'Room still has another active Housekeeping task and cannot be released to Front Desk';
    end if;

    if exists (
      select 1
      from public.hotel_bookings booking
      where booking.organization_id = p_organization_id
        and booking.room_id = v_task.room_id
        and upper(coalesce(booking.status, '')) = 'CHECKED_IN'
    ) then
      raise exception 'Room is still assigned to an in-house stay and cannot be released to Front Desk';
    end if;

    v_next_task_status := 'COMPLETED';
    v_next_room_status := 'AVAILABLE';

  else
    raise exception 'Unsupported housekeeping action: %', coalesce(nullif(v_action, ''), 'EMPTY');
  end if;

  -- Both writes are part of this function's single database transaction. Any
  -- exception after either statement rolls the complete transition back.
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
