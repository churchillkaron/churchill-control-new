begin;

create or replace function public.secretary_resolve_message_contact(
  p_organization_id uuid,
  p_provider text,
  p_channel_type text,
  p_external_participant_id text,
  p_external_address text default null,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_party_id uuid;
  v_lock_key bigint;
  v_provider text := lower(btrim(coalesce(p_provider, '')));
  v_channel_type text := lower(btrim(coalesce(p_channel_type, '')));
  v_participant text := btrim(coalesce(p_external_participant_id, ''));
  v_address text := btrim(coalesce(p_external_address, ''));
  v_name text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_email text;
  v_phone text;
begin
  if p_organization_id is null or v_provider = '' or v_channel_type = '' or v_participant = '' then
    raise exception 'SECRETARY_MESSAGE_CONTACT_IDENTITY_REQUIRED' using errcode = '22023';
  end if;

  v_lock_key := hashtextextended(
    p_organization_id::text || ':' || v_provider || ':' || v_channel_type || ':' || v_participant,
    0
  );
  perform pg_advisory_xact_lock(v_lock_key);

  select party_id into v_party_id
  from public.secretary_contact_channels
  where organization_id = p_organization_id
    and provider = v_provider
    and channel_type = v_channel_type
    and external_participant_id = v_participant
  limit 1;

  if v_party_id is not null then
    update public.secretary_contact_channels
    set
      external_address = coalesce(nullif(v_address, ''), external_address),
      display_name = coalesce(v_name, display_name),
      last_inbound_at = now(),
      updated_at = now()
    where organization_id = p_organization_id
      and provider = v_provider
      and channel_type = v_channel_type
      and external_participant_id = v_participant;
    return v_party_id;
  end if;

  if v_address ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    v_email := lower(v_address);
  elsif v_address ~ '^\+?[0-9][0-9 ()-]{5,}$' then
    v_phone := v_address;
  end if;

  if v_email is not null then
    select id into v_party_id
    from public.parties
    where organization_id = p_organization_id
      and lower(email) = v_email
    order by updated_at desc nulls last
    limit 1;
  elsif v_phone is not null then
    select id into v_party_id
    from public.parties
    where organization_id = p_organization_id
      and phone = v_phone
    order by updated_at desc nulls last
    limit 1;
  end if;

  if v_party_id is null then
    insert into public.parties (
      organization_id,
      party_type,
      display_name,
      email,
      phone,
      status,
      updated_at
    ) values (
      p_organization_id,
      'person',
      coalesce(v_name, nullif(v_address, ''), v_participant, 'External contact'),
      v_email,
      v_phone,
      'active',
      now()
    )
    returning id into v_party_id;
  end if;

  insert into public.secretary_contact_channels (
    organization_id,
    party_id,
    provider,
    channel_type,
    external_participant_id,
    external_address,
    display_name,
    last_inbound_at,
    metadata
  ) values (
    p_organization_id,
    v_party_id,
    v_provider,
    v_channel_type,
    v_participant,
    nullif(v_address, ''),
    v_name,
    now(),
    jsonb_build_object('source', 'secretary_message_reception')
  );

  return v_party_id;
end;
$$;

revoke all on function public.secretary_resolve_message_contact(uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.secretary_resolve_message_contact(uuid, text, text, text, text, text)
  to service_role;

comment on function public.secretary_resolve_message_contact(uuid, text, text, text, text, text) is
  'Atomically resolves one inbound written-message sender onto canonical public.parties and a Secretary channel alias. Social participant IDs are never treated as phone numbers.';

commit;
