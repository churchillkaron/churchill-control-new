create or replace function public.persist_intelligence_assistant_turn(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_party_id uuid,
  p_source text,
  p_content text,
  p_decision jsonb default '{}'::jsonb,
  p_evidence jsonb default '{}'::jsonb,
  p_execution jsonb default '{}'::jsonb,
  p_navigation jsonb default '{}'::jsonb,
  p_agreement_state jsonb default '{}'::jsonb,
  p_project_state jsonb default '{}'::jsonb,
  p_title text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_conversation public.intelligence_conversations;
  v_turn public.intelligence_turns;
begin
  if p_organization_id is null or p_conversation_id is null or p_party_id is null then
    raise exception 'INTELLIGENCE_CONVERSATION_SCOPE_REQUIRED' using errcode = '22023';
  end if;

  if nullif(btrim(coalesce(p_content, '')), '') is null then
    raise exception 'INTELLIGENCE_TURN_CONTENT_REQUIRED' using errcode = '22023';
  end if;

  update public.intelligence_conversations
  set
    agreement_state = coalesce(p_agreement_state, '{}'::jsonb),
    project_state = coalesce(p_project_state, '{}'::jsonb),
    title = case
      when nullif(btrim(coalesce(p_title, '')), '') is not null
        then btrim(p_title)
      else title
    end,
    last_message_at = v_now,
    updated_at = v_now
  where organization_id = p_organization_id
    and id = p_conversation_id
    and party_id = p_party_id
  returning * into v_conversation;

  if not found then
    raise exception 'INTELLIGENCE_CONVERSATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.intelligence_turns (
    organization_id,
    conversation_id,
    party_id,
    role,
    source,
    content,
    decision,
    evidence,
    execution,
    navigation
  ) values (
    p_organization_id,
    p_conversation_id,
    p_party_id,
    'assistant',
    coalesce(nullif(btrim(coalesce(p_source, '')), ''), 'text'),
    btrim(p_content),
    coalesce(p_decision, '{}'::jsonb),
    coalesce(p_evidence, '{}'::jsonb),
    coalesce(p_execution, '{}'::jsonb),
    coalesce(p_navigation, '{}'::jsonb)
  )
  returning * into v_turn;

  return jsonb_build_object(
    'conversation', to_jsonb(v_conversation),
    'turn', jsonb_build_object(
      'id', v_turn.id,
      'created_at', v_turn.created_at
    )
  );
end;
$$;

revoke all on function public.persist_intelligence_assistant_turn(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text
) from public;
revoke all on function public.persist_intelligence_assistant_turn(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text
) from anon;
revoke all on function public.persist_intelligence_assistant_turn(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text
) from authenticated;
grant execute on function public.persist_intelligence_assistant_turn(
  uuid, uuid, uuid, text, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text
) to service_role;
