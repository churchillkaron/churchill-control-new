begin;

create or replace function public.enqueue_secretary_live_inbound_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source text := upper(coalesce(new.metadata->>'source', ''));
begin
  if upper(coalesce(new.direction, '')) <> 'INBOUND' then
    return new;
  end if;

  if v_source in ('PROVIDER_HISTORY_SYNC','IMPORT','BACKFILL','MIGRATION') then
    return new;
  end if;

  insert into public.secretary_message_reception_requests (
    organization_id,
    conversation_id,
    inbound_message_id,
    contact_party_id,
    status,
    available_at,
    metadata
  )
  select
    new.organization_id,
    new.conversation_id,
    new.id,
    c.customer_party_id,
    'PENDING',
    now(),
    jsonb_build_object(
      'provider', coalesce(new.provider, c.provider),
      'channel_type', coalesce(new.channel_type, c.channel_type),
      'participant_id', c.external_participant_id,
      'participant_address', c.external_participant_address,
      'participant_name', c.external_participant_name,
      'caller_authority', 'RESTRICTED_PUBLIC_SECRETARY',
      'external_authority_used', false
    )
  from public.communication_conversations c
  where c.id = new.conversation_id
    and c.organization_id = new.organization_id
  on conflict (organization_id, inbound_message_id) do nothing;

  return new;
end;
$$;

revoke all on function public.enqueue_secretary_live_inbound_message() from public, anon, authenticated;

drop trigger if exists communication_messages_secretary_live_inbound on public.communication_messages;
create trigger communication_messages_secretary_live_inbound
after insert on public.communication_messages
for each row
execute function public.enqueue_secretary_live_inbound_message();

comment on function public.enqueue_secretary_live_inbound_message() is
  'Queues every future live normalized inbound Communications message for the Avantiqo-owned restricted Secretary, while excluding historical/import/backfill messages.';

commit;
