begin;

create or replace function public.secretary_reserve_message_reply(
  p_request_id uuid,
  p_body text,
  p_subject text default null
)
returns public.communication_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.secretary_message_reception_requests%rowtype;
  v_conversation public.communication_conversations%rowtype;
  v_message public.communication_messages%rowtype;
begin
  if p_request_id is null then
    raise exception 'SECRETARY_MESSAGE_REQUEST_REQUIRED' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_body, '')), '') is null then
    raise exception 'SECRETARY_MESSAGE_REPLY_BODY_REQUIRED' using errcode = '22023';
  end if;

  select * into v_request
  from public.secretary_message_reception_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'SECRETARY_MESSAGE_REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_request.response_message_id is not null then
    select * into v_message
    from public.communication_messages
    where organization_id = v_request.organization_id
      and id = v_request.response_message_id;
    if not found then
      raise exception 'SECRETARY_MESSAGE_RESERVED_REPLY_NOT_FOUND' using errcode = 'P0002';
    end if;
    return v_message;
  end if;

  select * into v_conversation
  from public.communication_conversations
  where organization_id = v_request.organization_id
    and id = v_request.conversation_id;

  if not found or upper(coalesce(v_conversation.status, '')) <> 'OPEN' then
    raise exception 'SECRETARY_MESSAGE_CONVERSATION_NOT_OPEN' using errcode = 'P0001';
  end if;

  insert into public.communication_messages (
    organization_id,
    conversation_id,
    connection_id,
    provider,
    channel_type,
    direction,
    message_type,
    recipient_address,
    subject,
    body,
    status,
    sent_by_party_id,
    metadata
  ) values (
    v_request.organization_id,
    v_conversation.id,
    v_conversation.connection_id,
    v_conversation.provider,
    v_conversation.channel_type,
    'OUTBOUND',
    'TEXT',
    coalesce(v_conversation.external_participant_address, v_conversation.external_participant_id),
    coalesce(nullif(btrim(coalesce(p_subject, '')), ''), v_conversation.subject),
    btrim(p_body),
    'QUEUED',
    null,
    jsonb_build_object(
      'source', 'AVANTIQO_SECRETARY',
      'secretary_reception_request_id', v_request.id,
      'restricted_public_secretary', true,
      'delivery_authorized', true,
      'external_authority_used', false
    )
  )
  returning * into v_message;

  update public.secretary_message_reception_requests
  set response_message_id = v_message.id,
      updated_at = now()
  where id = v_request.id;

  update public.communication_conversations
  set last_message_at = now(),
      last_outbound_at = now(),
      updated_at = now()
  where organization_id = v_request.organization_id
    and id = v_request.conversation_id;

  return v_message;
end;
$$;

revoke all on function public.secretary_reserve_message_reply(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.secretary_reserve_message_reply(uuid, text, text)
  to service_role;

create unique index if not exists communication_messages_secretary_reception_reply_uidx
  on public.communication_messages ((metadata->>'secretary_reception_request_id'))
  where direction = 'OUTBOUND'
    and metadata ? 'secretary_reception_request_id';

comment on function public.secretary_reserve_message_reply(uuid, text, text) is
  'Atomically reserves at most one canonical Communications outbound reply per Secretary reception request. Retries reuse the same message, preventing duplicate replies after worker crashes.';

commit;
