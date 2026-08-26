begin;

create table if not exists public.secretary_meeting_coordinations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid null,
  requested_by_party_id uuid not null,
  owner_party_id uuid not null,
  title text not null,
  purpose text null,
  location text null,
  timezone text not null,
  candidate_slots jsonb not null default '[]'::jsonb,
  status text not null default 'COLLECTING'
    check (status in ('COLLECTING','READY_TO_BOOK','BOOKED','NEEDS_INPUT','FAILED','CANCELLED')),
  selected_slot_id text null,
  calendar_event_id uuid null references public.secretary_calendar_events(id) on delete set null,
  response_due_at timestamptz not null,
  reminder_after_minutes integer not null default 1440
    check (reminder_after_minutes between 30 and 10080),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 100 check (max_attempts between 1 and 500),
  lease_token uuid null,
  lease_expires_at timestamptz null,
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_meeting_coordinations_requested_by_fkey
    foreign key (organization_id, requested_by_party_id)
    references public.parties (organization_id, id)
    on delete restrict,
  constraint secretary_meeting_coordinations_owner_fkey
    foreign key (organization_id, owner_party_id)
    references public.parties (organization_id, id)
    on delete restrict,
  check (jsonb_typeof(candidate_slots) = 'array'),
  check (jsonb_array_length(candidate_slots) between 1 and 20),
  check (response_due_at > created_at)
);

create index if not exists secretary_meeting_coordinations_claim_idx
  on public.secretary_meeting_coordinations (status, response_due_at, created_at)
  where status in ('COLLECTING','READY_TO_BOOK');

create index if not exists secretary_meeting_coordinations_owner_idx
  on public.secretary_meeting_coordinations (organization_id, owner_party_id, status, created_at desc);

create table if not exists public.secretary_meeting_coordination_participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  coordination_id uuid not null references public.secretary_meeting_coordinations(id) on delete cascade,
  party_id uuid not null,
  required boolean not null default true,
  action_type text not null check (action_type in ('CALL','MESSAGE','EMAIL')),
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED','AWAITING','RESPONDED','AMBIGUOUS','UNAVAILABLE','TIMED_OUT','FAILED','CANCELLED')),
  follow_up_id uuid not null references public.secretary_follow_ups(id) on delete cascade,
  reminder_follow_up_id uuid null references public.secretary_follow_ups(id) on delete set null,
  clarification_follow_up_id uuid null references public.secretary_follow_ups(id) on delete set null,
  conversation_id uuid null,
  outbound_message_id uuid null,
  outbound_call_request_id uuid null,
  inbound_message_id uuid null,
  request_sent_at timestamptz null,
  response_due_at timestamptz not null,
  received_at timestamptz null,
  response_body text null,
  availability jsonb not null default '{}'::jsonb,
  extraction_confidence numeric(5,4) null
    check (extraction_confidence is null or (extraction_confidence >= 0 and extraction_confidence <= 1)),
  reminder_count integer not null default 0 check (reminder_count between 0 and 10),
  last_error text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint secretary_meeting_coordination_participant_party_fkey
    foreign key (organization_id, party_id)
    references public.parties (organization_id, id)
    on delete cascade,
  unique (coordination_id, party_id)
);

create index if not exists secretary_meeting_coordination_participants_status_idx
  on public.secretary_meeting_coordination_participants (organization_id, coordination_id, status, response_due_at);

alter table public.secretary_meeting_coordinations enable row level security;
alter table public.secretary_meeting_coordination_participants enable row level security;
revoke all on public.secretary_meeting_coordinations from anon, authenticated;
revoke all on public.secretary_meeting_coordination_participants from anon, authenticated;
grant select, insert, update, delete on public.secretary_meeting_coordinations to service_role;
grant select, insert, update, delete on public.secretary_meeting_coordination_participants to service_role;

create or replace function public.secretary_create_meeting_coordination(
  p_organization_id uuid,
  p_requested_by_party_id uuid,
  p_owner_party_id uuid,
  p_title text,
  p_timezone text,
  p_candidate_slots jsonb,
  p_participants jsonb,
  p_response_due_at timestamptz,
  p_entity_id uuid default null,
  p_purpose text default null,
  p_location text default null,
  p_reminder_after_minutes integer default 1440,
  p_max_attempts integer default 100,
  p_metadata jsonb default '{}'::jsonb
)
returns public.secretary_meeting_coordinations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_coordination public.secretary_meeting_coordinations%rowtype;
  v_participant jsonb;
  v_party_id uuid;
  v_required boolean;
  v_action_type text;
  v_instruction text;
  v_follow_up_id uuid;
begin
  if p_organization_id is null or p_requested_by_party_id is null or p_owner_party_id is null then
    raise exception 'SECRETARY_MEETING_COORDINATION_PARTY_CONTEXT_REQUIRED' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception 'SECRETARY_MEETING_COORDINATION_TITLE_REQUIRED' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_timezone, '')), '') is null then
    raise exception 'SECRETARY_MEETING_COORDINATION_TIMEZONE_REQUIRED' using errcode = '22023';
  end if;
  if jsonb_typeof(p_candidate_slots) <> 'array' or jsonb_array_length(p_candidate_slots) < 1 or jsonb_array_length(p_candidate_slots) > 20 then
    raise exception 'SECRETARY_MEETING_COORDINATION_CANDIDATE_SLOTS_INVALID' using errcode = '22023';
  end if;
  if jsonb_typeof(p_participants) <> 'array' or jsonb_array_length(p_participants) < 1 or jsonb_array_length(p_participants) > 50 then
    raise exception 'SECRETARY_MEETING_COORDINATION_PARTICIPANTS_INVALID' using errcode = '22023';
  end if;
  if p_response_due_at is null or p_response_due_at <= now() then
    raise exception 'SECRETARY_MEETING_COORDINATION_RESPONSE_DUE_INVALID' using errcode = '22023';
  end if;

  insert into public.secretary_meeting_coordinations (
    organization_id,
    entity_id,
    requested_by_party_id,
    owner_party_id,
    title,
    purpose,
    location,
    timezone,
    candidate_slots,
    status,
    response_due_at,
    reminder_after_minutes,
    max_attempts,
    metadata
  ) values (
    p_organization_id,
    p_entity_id,
    p_requested_by_party_id,
    p_owner_party_id,
    btrim(p_title),
    nullif(btrim(coalesce(p_purpose, '')), ''),
    nullif(btrim(coalesce(p_location, '')), ''),
    btrim(p_timezone),
    p_candidate_slots,
    'COLLECTING',
    p_response_due_at,
    greatest(30, least(coalesce(p_reminder_after_minutes, 1440), 10080)),
    greatest(1, least(coalesce(p_max_attempts, 100), 500)),
    coalesce(p_metadata, '{}'::jsonb) || jsonb_build_object(
      'secretary_role', 'EXECUTIVE_SECRETARY',
      'attendance_not_inferred', true,
      'availability_requires_explicit_evidence', true,
      'external_authority_used', false
    )
  ) returning * into v_coordination;

  for v_participant in select value from jsonb_array_elements(p_participants)
  loop
    begin
      v_party_id := nullif(btrim(coalesce(v_participant->>'party_id', '')), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'SECRETARY_MEETING_COORDINATION_PARTICIPANT_PARTY_INVALID' using errcode = '22023';
    end;
    if v_party_id is null then
      raise exception 'SECRETARY_MEETING_COORDINATION_PARTICIPANT_PARTY_REQUIRED' using errcode = '22023';
    end if;
    v_required := coalesce((v_participant->>'required')::boolean, true);
    v_action_type := upper(nullif(btrim(coalesce(v_participant->>'action_type', '')), ''));
    if v_action_type not in ('CALL','MESSAGE','EMAIL') then
      raise exception 'SECRETARY_MEETING_COORDINATION_PARTICIPANT_CHANNEL_INVALID' using errcode = '22023';
    end if;
    v_instruction := nullif(btrim(coalesce(v_participant->>'instruction', '')), '');
    if v_instruction is null then
      raise exception 'SECRETARY_MEETING_COORDINATION_PARTICIPANT_INSTRUCTION_REQUIRED' using errcode = '22023';
    end if;

    insert into public.secretary_follow_ups (
      organization_id,
      entity_id,
      owner_party_id,
      contact_party_id,
      action_type,
      reason,
      status,
      due_at,
      created_by_party_id,
      metadata
    ) values (
      p_organization_id,
      p_entity_id,
      p_requested_by_party_id,
      v_party_id,
      v_action_type,
      v_instruction,
      'PENDING',
      now(),
      p_requested_by_party_id,
      jsonb_build_object(
        'execution_owner', 'SECRETARY',
        'execution_ready', true,
        'execution_instruction', v_instruction,
        'secretary_meeting_coordination_id', v_coordination.id,
        'meeting_availability_request', true,
        'response_due_at', p_response_due_at,
        'external_authority_used', false
      )
    ) returning id into v_follow_up_id;

    insert into public.secretary_meeting_coordination_participants (
      organization_id,
      coordination_id,
      party_id,
      required,
      action_type,
      status,
      follow_up_id,
      response_due_at,
      metadata
    ) values (
      p_organization_id,
      v_coordination.id,
      v_party_id,
      v_required,
      v_action_type,
      'REQUESTED',
      v_follow_up_id,
      p_response_due_at,
      jsonb_build_object(
        'attendance_not_inferred', true,
        'availability_requires_explicit_evidence', true,
        'external_authority_used', false
      )
    );
  end loop;

  return v_coordination;
end;
$$;

revoke all on function public.secretary_create_meeting_coordination(
  uuid, uuid, uuid, text, text, jsonb, jsonb, timestamptz, uuid, text, text, integer, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.secretary_create_meeting_coordination(
  uuid, uuid, uuid, text, text, jsonb, jsonb, timestamptz, uuid, text, text, integer, integer, jsonb
) to service_role;

create or replace function public.claim_secretary_meeting_coordination(
  p_worker_id text,
  p_lease_seconds integer default 180
)
returns setof public.secretary_meeting_coordinations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_token uuid := gen_random_uuid();
begin
  if nullif(btrim(coalesce(p_worker_id, '')), '') is null then
    raise exception 'SECRETARY_MEETING_COORDINATION_WORKER_REQUIRED' using errcode = '22023';
  end if;

  select id into v_id
  from public.secretary_meeting_coordinations
  where status in ('COLLECTING','READY_TO_BOOK')
    and attempt_count < max_attempts
    and (lease_expires_at is null or lease_expires_at <= now())
  order by coalesce(response_due_at, created_at) asc, created_at asc
  for update skip locked
  limit 1;

  if v_id is null then
    return;
  end if;

  return query
  update public.secretary_meeting_coordinations
  set attempt_count = attempt_count + 1,
      lease_token = v_token,
      lease_expires_at = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 180), 900))),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('worker_id', p_worker_id),
      last_error = null,
      updated_at = now()
  where id = v_id
  returning *;
end;
$$;

revoke all on function public.claim_secretary_meeting_coordination(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_secretary_meeting_coordination(text, integer)
  to service_role;

create or replace function public.secretary_cancel_meeting_coordination(
  p_organization_id uuid,
  p_coordination_id uuid,
  p_cancelled_by_party_id uuid
)
returns public.secretary_meeting_coordinations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_coordination public.secretary_meeting_coordinations%rowtype;
begin
  select * into v_coordination
  from public.secretary_meeting_coordinations
  where organization_id = p_organization_id
    and id = p_coordination_id
  for update;

  if not found then
    raise exception 'SECRETARY_MEETING_COORDINATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_coordination.status = 'BOOKED' then
    raise exception 'SECRETARY_MEETING_COORDINATION_ALREADY_BOOKED_USE_CALENDAR_CHANGE' using errcode = '22023';
  end if;
  if v_coordination.status = 'CANCELLED' then
    return v_coordination;
  end if;

  update public.secretary_follow_ups f
  set status = 'CANCELLED',
      completed_at = now(),
      updated_at = now(),
      result = 'Meeting coordination cancelled before booking'
  from public.secretary_meeting_coordination_participants p
  where p.organization_id = p_organization_id
    and p.coordination_id = p_coordination_id
    and f.organization_id = p.organization_id
    and f.id in (p.follow_up_id, p.reminder_follow_up_id, p.clarification_follow_up_id)
    and f.status = 'PENDING';

  update public.secretary_meeting_coordination_participants
  set status = 'CANCELLED',
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'cancelled_at', now(),
        'cancelled_by_party_id', p_cancelled_by_party_id,
        'attendance_not_inferred', true,
        'external_authority_used', false
      )
  where organization_id = p_organization_id
    and coordination_id = p_coordination_id
    and status not in ('RESPONDED','UNAVAILABLE','TIMED_OUT','FAILED','CANCELLED');

  update public.secretary_meeting_coordinations
  set status = 'CANCELLED',
      completed_at = now(),
      lease_token = null,
      lease_expires_at = null,
      last_error = null,
      updated_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'cancelled_at', now(),
        'cancelled_by_party_id', p_cancelled_by_party_id,
        'attendance_not_inferred', true,
        'external_authority_used', false
      )
  where organization_id = p_organization_id
    and id = p_coordination_id
  returning * into v_coordination;

  return v_coordination;
end;
$$;

revoke all on function public.secretary_cancel_meeting_coordination(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.secretary_cancel_meeting_coordination(uuid, uuid, uuid)
  to service_role;

comment on table public.secretary_meeting_coordinations is
  'Durable Avantiqo Executive Secretary state for multi-party meeting scheduling. Candidate slots and participant availability are evidence-tracked; attendance is never inferred from a calendar entry.';
comment on table public.secretary_meeting_coordination_participants is
  'Per-participant scheduling evidence for Executive Secretary meeting coordination. Availability is extracted only from explicit replies or call evidence.';
comment on function public.secretary_create_meeting_coordination(uuid, uuid, uuid, text, text, jsonb, jsonb, timestamptz, uuid, text, text, integer, integer, jsonb) is
  'Atomically creates one multi-party meeting coordination and the governed Secretary follow-ups used to collect availability.';
comment on function public.claim_secretary_meeting_coordination(text, integer) is
  'Claims one active multi-party meeting coordination with SKIP LOCKED so scheduling reconciliation cannot run concurrently.';

commit;
