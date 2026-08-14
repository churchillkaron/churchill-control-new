create or replace function public.load_or_create_intelligence_conversation_memory(
  p_organization_id uuid,
  p_party_id uuid,
  p_entity_id uuid default null,
  p_period_id uuid default null,
  p_user_id uuid default null,
  p_conversation_key text default 'primary'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_key text := coalesce(nullif(btrim(coalesce(p_conversation_key, '')), ''), 'primary');
  v_conversation public.intelligence_conversations;
  v_turns jsonb := '[]'::jsonb;
begin
  if p_organization_id is null then
    raise exception 'INTELLIGENCE_ORGANIZATION_REQUIRED' using errcode = '22023';
  end if;

  if p_party_id is null then
    raise exception 'INTELLIGENCE_PARTY_REQUIRED' using errcode = '22023';
  end if;

  select c.*
    into v_conversation
  from public.intelligence_conversations c
  where c.organization_id = p_organization_id
    and c.party_id = p_party_id
    and c.conversation_key = v_key;

  if not found then
    insert into public.intelligence_conversations (
      organization_id,
      party_id,
      entity_id,
      period_id,
      conversation_key,
      status,
      agreement_state,
      project_state,
      created_by_user_id
    ) values (
      p_organization_id,
      p_party_id,
      p_entity_id,
      p_period_id,
      v_key,
      'ACTIVE',
      '{}'::jsonb,
      '{}'::jsonb,
      p_user_id
    )
    on conflict (organization_id, party_id, conversation_key) do nothing
    returning * into v_conversation;

    if v_conversation.id is null then
      select c.*
        into v_conversation
      from public.intelligence_conversations c
      where c.organization_id = p_organization_id
        and c.party_id = p_party_id
        and c.conversation_key = v_key;
    end if;
  end if;

  if v_conversation.id is null then
    raise exception 'INTELLIGENCE_CONVERSATION_LOAD_FAILED' using errcode = 'P0002';
  end if;

  if v_conversation.entity_id is distinct from p_entity_id
     or v_conversation.period_id is distinct from p_period_id then
    update public.intelligence_conversations
    set
      entity_id = p_entity_id,
      period_id = p_period_id,
      updated_at = now()
    where id = v_conversation.id
      and organization_id = p_organization_id
      and party_id = p_party_id
    returning * into v_conversation;
  end if;

  select coalesce(jsonb_agg(to_jsonb(t) order by t.created_at desc), '[]'::jsonb)
    into v_turns
  from (
    select role, content, created_at
    from public.intelligence_turns
    where organization_id = p_organization_id
      and conversation_id = v_conversation.id
    order by created_at desc
    limit 24
  ) t;

  return jsonb_build_object(
    'conversation', to_jsonb(v_conversation),
    'turns', v_turns
  );
end;
$$;

revoke all on function public.load_or_create_intelligence_conversation_memory(
  uuid, uuid, uuid, uuid, uuid, text
) from public;
revoke all on function public.load_or_create_intelligence_conversation_memory(
  uuid, uuid, uuid, uuid, uuid, text
) from anon;
revoke all on function public.load_or_create_intelligence_conversation_memory(
  uuid, uuid, uuid, uuid, uuid, text
) from authenticated;
grant execute on function public.load_or_create_intelligence_conversation_memory(
  uuid, uuid, uuid, uuid, uuid, text
) to service_role;
