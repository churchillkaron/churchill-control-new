begin;

create unique index if not exists communication_messages_secretary_appointment_notification_uidx
  on public.communication_messages ((metadata->>'secretary_appointment_notification_id'))
  where direction = 'OUTBOUND'
    and metadata ? 'secretary_appointment_notification_id';

create or replace function public.secretary_reserve_appointment_notification_message(
  p_notification_id uuid,
  p_conversation_id uuid,
  p_body text,
  p_subject text default null
)
returns public.communication_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification public.secretary_appointment_notifications%rowtype;
  v_conversation public.communication_conversations%rowtype;
  v_message public.communication_messages%rowtype;
begin
  if p_notification_id is null or p_conversation_id is null then
    raise exception 'SECRETARY_APPOINTMENT_NOTIFICATION_SCOPE_REQUIRED' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_body, '')), '') is null then
    raise exception 'SECRETARY_APPOINTMENT_NOTIFICATION_BODY_REQUIRED' using errcode = '22023';
  end if;

  select * into v_notification
  from public.secretary_appointment_notifications
  where id = p_notification_id
  for update;
  if not found then
    raise exception 'SECRETARY_APPOINTMENT_NOTIFICATION_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_notification.message_id is not null then
    select * into v_message
    from public.communication_messages
    where organization_id = v_notification.organization_id
      and id = v_notification.message_id;
    if not found then
      raise exception 'SECRETARY_APPOINTMENT_NOTIFICATION_MESSAGE_NOT_FOUND' using errcode = 'P0002';
    end if;
    return v_message;
  end if;

  select * into v_conversation
  from public.communication_conversations
  where organization_id = v_notification.organization_id
    and id = p_conversation_id
    and customer_party_id = v_notification.contact_party_id
    and upper(coalesce(status, '')) = 'OPEN';
  if not found then
    raise exception 'SECRETARY_APPOINTMENT_NOTIFICATION_CONVERSATION_UNAVAILABLE' using errcode = 'P0002';
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
    v_notification.organization_id,
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
      'secretary_appointment_notification_id', v_notification.id,
      'notification_kind', v_notification.notification_kind,
      'calendar_event_id', v_notification.calendar_event_id,
      'restricted_public_secretary', true,
      'delivery_authorized', true,
      'external_authority_used', false
    )
  )
  returning * into v_message;

  update public.secretary_appointment_notifications
  set conversation_id = v_conversation.id,
      message_id = v_message.id,
      updated_at = now()
  where id = v_notification.id;

  update public.communication_conversations
  set last_message_at = now(),
      last_outbound_at = now(),
      updated_at = now()
  where organization_id = v_notification.organization_id
    and id = v_conversation.id;

  return v_message;
end;
$$;

revoke all on function public.secretary_reserve_appointment_notification_message(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.secretary_reserve_appointment_notification_message(uuid, uuid, text, text)
  to service_role;

comment on function public.secretary_reserve_appointment_notification_message(uuid, uuid, text, text) is
  'Reserves at most one canonical Communications outbound message for each Secretary appointment notification, preventing duplicate confirmations/reminders on worker replay.';

commit;
