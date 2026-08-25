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
    now() + interval '10 seconds',
    jsonb_build_object(
      'provider', coalesce(new.provider, c.provider),
      'channel_type', coalesce(new.channel_type, c.channel_type),
      'participant_id', c.external_participant_id,
      'participant_address', c.external_participant_address,
      'participant_name', c.external_participant_name,
      'caller_authority', 'RESTRICTED_PUBLIC_SECRETARY',
      'attachment_settle_delay_seconds', 10,
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

comment on function public.enqueue_secretary_live_inbound_message() is
  'Queues every future live normalized inbound Communications message for Avantiqo Secretary after a short attachment-settle delay, excluding historical/import/backfill messages.';

commit;
