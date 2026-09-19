begin;

-- Replace the original RPC with a caller-prebound coordination identity so an
-- ambiguous response can be verified by exact authoritative ID without replay.
drop function if exists public.secretary_create_meeting_coordination(
  uuid, uuid, uuid, text, text, jsonb, jsonb, timestamptz, uuid, text, text, integer, integer, jsonb
);

create or replace function public.secretary_create_meeting_coordination(
  p_coordination_id uuid,
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
  if p_coordination_id is null then
    raise exception 'SECRETARY_MEETING_COORDINATION_ID_REQUIRED' using errcode = '22023';
  end if;
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
    id, organization_id, entity_id, requested_by_party_id, owner_party_id,
    title, purpose, location, timezone, candidate_slots, status,
    response_due_at, reminder_after_minutes, max_attempts, metadata
  ) values (
    p_coordination_id, p_organization_id, p_entity_id, p_requested_by_party_id, p_owner_party_id,
    btrim(p_title), nullif(btrim(coalesce(p_purpose, '')), ''),
    nullif(btrim(coalesce(p_location, '')), ''), btrim(p_timezone), p_candidate_slots,
    'COLLECTING', p_response_due_at,
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
      organization_id, entity_id, owner_party_id, contact_party_id, action_type,
      reason, status, due_at, created_by_party_id, metadata
    ) values (
      p_organization_id, p_entity_id, p_requested_by_party_id, v_party_id, v_action_type,
      v_instruction, 'PENDING', now(), p_requested_by_party_id,
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
      organization_id, coordination_id, party_id, required, action_type,
      status, follow_up_id, response_due_at, metadata
    ) values (
      p_organization_id, v_coordination.id, v_party_id, v_required, v_action_type,
      'REQUESTED', v_follow_up_id, p_response_due_at,
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
  uuid, uuid, uuid, uuid, text, text, jsonb, jsonb, timestamptz, uuid, text, text, integer, integer, jsonb
) from public, anon, authenticated;
grant execute on function public.secretary_create_meeting_coordination(
  uuid, uuid, uuid, uuid, text, text, jsonb, jsonb, timestamptz, uuid, text, text, integer, integer, jsonb
) to service_role;

comment on function public.secretary_create_meeting_coordination(
  uuid, uuid, uuid, uuid, text, text, jsonb, jsonb, timestamptz, uuid, text, text, integer, integer, jsonb
) is 'Atomically creates one Secretary meeting coordination and participant outreach using a caller-prebound coordination UUID for exact ambiguous-write recovery.';

commit;
