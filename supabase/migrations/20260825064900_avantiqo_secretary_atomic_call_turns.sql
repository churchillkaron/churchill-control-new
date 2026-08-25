begin;

create or replace function public.secretary_append_call_turn(
  p_organization_id uuid,
  p_call_id uuid,
  p_speaker text,
  p_transcript text,
  p_language text default null,
  p_intent text default null,
  p_decision jsonb default '{}'::jsonb,
  p_metadata jsonb default '{}'::jsonb,
  p_started_at timestamptz default null,
  p_ended_at timestamptz default null
)
returns public.secretary_call_turns
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_turn public.secretary_call_turns%rowtype;
  v_sequence integer;
  v_lock_key bigint;
begin
  if p_organization_id is null or p_call_id is null then
    raise exception 'SECRETARY_CALL_TURN_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if upper(coalesce(p_speaker, '')) not in ('CALLER','SECRETARY','SYSTEM') then
    raise exception 'SECRETARY_CALL_TURN_SPEAKER_INVALID' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_transcript, '')), '') is null then
    raise exception 'SECRETARY_CALL_TURN_TRANSCRIPT_REQUIRED' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.secretary_calls c
    where c.id = p_call_id and c.organization_id = p_organization_id
  ) then
    raise exception 'SECRETARY_CALL_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_lock_key := hashtextextended(p_organization_id::text || ':' || p_call_id::text, 0);
  perform pg_advisory_xact_lock(v_lock_key);

  select coalesce(max(t.sequence_number), 0) + 1
    into v_sequence
  from public.secretary_call_turns t
  where t.organization_id = p_organization_id
    and t.call_id = p_call_id;

  insert into public.secretary_call_turns (
    organization_id,
    call_id,
    sequence_number,
    speaker,
    transcript,
    language,
    intent,
    decision,
    metadata,
    raw_audio_persisted,
    started_at,
    ended_at
  ) values (
    p_organization_id,
    p_call_id,
    v_sequence,
    upper(p_speaker),
    btrim(p_transcript),
    nullif(btrim(coalesce(p_language, '')), ''),
    nullif(btrim(coalesce(p_intent, '')), ''),
    coalesce(p_decision, '{}'::jsonb),
    coalesce(p_metadata, '{}'::jsonb),
    false,
    p_started_at,
    p_ended_at
  )
  returning * into v_turn;

  return v_turn;
end;
$$;

revoke all on function public.secretary_append_call_turn(
  uuid, uuid, text, text, text, text, jsonb, jsonb, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.secretary_append_call_turn(
  uuid, uuid, text, text, text, text, jsonb, jsonb, timestamptz, timestamptz
) to service_role;

comment on function public.secretary_append_call_turn(
  uuid, uuid, text, text, text, text, jsonb, jsonb, timestamptz, timestamptz
) is
  'Atomically appends one Avantiqo Secretary call turn with per-call serialization and server-owned sequence allocation. Raw audio remains non-persistent.';

commit;
