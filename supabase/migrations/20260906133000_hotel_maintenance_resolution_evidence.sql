create table if not exists public.hotel_maintenance_resolution_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  request_id uuid not null references public.hotel_maintenance_requests(id) on delete cascade,
  room_id uuid references public.hotel_rooms(id) on delete set null,
  technician_staff_account_id uuid,
  action text not null check (action in ('START', 'RESOLVE', 'REOPEN')),
  outcome_code text,
  resolution_notes text,
  evidence_reference text,
  created_at timestamptz not null default now(),
  constraint hotel_maintenance_resolution_outcome_check
    check (action <> 'RESOLVE' or nullif(btrim(outcome_code), '') is not null),
  constraint hotel_maintenance_resolution_notes_check
    check (action = 'START' or nullif(btrim(resolution_notes), '') is not null)
);

create index if not exists hotel_maintenance_resolution_events_request_created_idx
  on public.hotel_maintenance_resolution_events (request_id, created_at desc);
create index if not exists hotel_maintenance_resolution_events_room_created_idx
  on public.hotel_maintenance_resolution_events (organization_id, room_id, created_at desc);

alter table public.hotel_maintenance_resolution_events enable row level security;
revoke all on table public.hotel_maintenance_resolution_events from public;
revoke all on table public.hotel_maintenance_resolution_events from anon;
revoke all on table public.hotel_maintenance_resolution_events from authenticated;
grant select, insert on table public.hotel_maintenance_resolution_events to service_role;

create or replace function public.hotel_transition_maintenance_request(
  p_organization_id uuid,
  p_request_id uuid,
  p_action text,
  p_outcome_code text,
  p_resolution_notes text,
  p_evidence_reference text,
  p_technician_staff_account_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_request public.hotel_maintenance_requests%rowtype;
  v_action text := upper(btrim(coalesce(p_action, '')));
  v_outcome text := upper(btrim(coalesce(p_outcome_code, '')));
  v_notes text := nullif(btrim(coalesce(p_resolution_notes, '')), '');
  v_evidence text := nullif(btrim(coalesce(p_evidence_reference, '')), '');
  v_current text;
  v_now timestamptz := now();
  v_event_id uuid;
  v_reinspection_required boolean := false;
  v_is_safety_critical boolean := false;
begin
  if v_action not in ('START', 'RESOLVE', 'REOPEN') then
    raise exception 'Unsupported maintenance request action';
  end if;

  select *
  into v_request
  from public.hotel_maintenance_requests
  where organization_id = p_organization_id
    and id = p_request_id
  for update;

  if not found then
    raise exception 'Maintenance request not found for this organization';
  end if;

  v_current := upper(coalesce(v_request.status, ''));
  v_is_safety_critical := upper(coalesce(v_request.priority, '')) = 'CRITICAL'
    or upper(coalesce(v_request.issue_title, '')) like '%SAFETY%'
    or upper(coalesce(v_request.issue_description, '')) like '%SAFETY%';

  if v_action = 'START' then
    if v_current <> 'OPEN' then
      raise exception 'Maintenance request must be OPEN before START';
    end if;

    update public.hotel_maintenance_requests
    set status = 'IN_PROGRESS',
        updated_at = v_now
    where organization_id = p_organization_id
      and id = p_request_id
    returning * into v_request;

  elsif v_action = 'RESOLVE' then
    if v_current <> 'IN_PROGRESS' then
      raise exception 'Maintenance request must be IN_PROGRESS before RESOLVE';
    end if;
    if v_outcome not in ('REPAIRED', 'REPLACED', 'RESET_ADJUSTED', 'CLEANED_CLEARED', 'NO_FAULT_FOUND', 'OTHER') then
      raise exception 'Maintenance resolution outcome is required';
    end if;
    if v_notes is null then
      raise exception 'Maintenance resolution notes are required';
    end if;
    if v_is_safety_critical and v_evidence is null then
      raise exception 'Critical or safety maintenance resolution requires evidence reference';
    end if;

    update public.hotel_maintenance_requests
    set status = 'RESOLVED',
        resolved_at = v_now,
        updated_at = v_now
    where organization_id = p_organization_id
      and id = p_request_id
    returning * into v_request;

  else
    if v_current <> 'RESOLVED' then
      raise exception 'Only a RESOLVED maintenance request can be reopened';
    end if;
    if v_notes is null then
      raise exception 'Maintenance reopen reason is required';
    end if;

    update public.hotel_maintenance_requests
    set status = 'OPEN',
        resolved_at = null,
        updated_at = v_now
    where organization_id = p_organization_id
      and id = p_request_id
    returning * into v_request;
  end if;

  if v_request.room_id is not null then
    select exists (
      select 1
      from public.hotel_housekeeping_tasks ht
      where ht.organization_id = p_organization_id
        and ht.room_id = v_request.room_id
        and upper(coalesce(ht.task_status, '')) = 'AWAITING_INSPECTION'
    ) into v_reinspection_required;
  end if;

  insert into public.hotel_maintenance_resolution_events (
    organization_id,
    request_id,
    room_id,
    technician_staff_account_id,
    action,
    outcome_code,
    resolution_notes,
    evidence_reference,
    created_at
  ) values (
    p_organization_id,
    v_request.id,
    v_request.room_id,
    p_technician_staff_account_id,
    v_action,
    case when v_action = 'RESOLVE' then v_outcome else null end,
    v_notes,
    v_evidence,
    v_now
  )
  returning id into v_event_id;

  return jsonb_build_object(
    'request', to_jsonb(v_request),
    'event_id', v_event_id,
    'action', v_action,
    'housekeeping_reinspection_required', v_reinspection_required,
    'room_status_unchanged', true
  );
end;
$$;

revoke all on function public.hotel_transition_maintenance_request(uuid, uuid, text, text, text, text, uuid) from public;
revoke all on function public.hotel_transition_maintenance_request(uuid, uuid, text, text, text, text, uuid) from anon;
revoke all on function public.hotel_transition_maintenance_request(uuid, uuid, text, text, text, text, uuid) from authenticated;
grant execute on function public.hotel_transition_maintenance_request(uuid, uuid, text, text, text, text, uuid) to service_role;
