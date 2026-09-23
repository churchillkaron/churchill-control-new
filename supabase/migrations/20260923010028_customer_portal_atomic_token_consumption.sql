begin;

create or replace function public.consume_customer_portal_access_token_atomic(
  p_token_hash text,
  p_session_token_hash text,
  p_session_expires_at timestamptz
)
returns table (
  outcome text,
  session_id uuid,
  organization_id uuid,
  party_id uuid,
  session_expires_at timestamptz,
  session_created_at timestamptz,
  link_id uuid,
  purpose text,
  source_type text,
  source_id text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_link public.customer_portal_access_links%rowtype;
  v_session public.customer_portal_sessions%rowtype;
  v_now timestamptz := now();
begin
  if p_token_hash is null or char_length(p_token_hash) <> 64 then
    raise exception 'CUSTOMER_PORTAL_TOKEN_HASH_INVALID';
  end if;
  if p_session_token_hash is null or char_length(p_session_token_hash) <> 64 then
    raise exception 'CUSTOMER_PORTAL_SESSION_HASH_INVALID';
  end if;
  if p_session_expires_at is null
     or p_session_expires_at <= v_now
     or p_session_expires_at > v_now + interval '31 days' then
    raise exception 'CUSTOMER_PORTAL_SESSION_EXPIRY_INVALID';
  end if;

  select *
  into v_link
  from public.customer_portal_access_links
  where token_hash = p_token_hash
  for update;

  if not found then
    return query
    select 'NOT_FOUND'::text, null::uuid, null::uuid, null::uuid,
           null::timestamptz, null::timestamptz, null::uuid,
           null::text, null::text, null::text;
    return;
  end if;

  if v_link.revoked_at is not null then
    return query
    select 'REVOKED'::text, null::uuid, v_link.organization_id, v_link.party_id,
           null::timestamptz, null::timestamptz, v_link.id,
           v_link.purpose, v_link.source_type, v_link.source_id;
    return;
  end if;

  if v_link.consumed_at is not null then
    return query
    select 'USED'::text, null::uuid, v_link.organization_id, v_link.party_id,
           null::timestamptz, null::timestamptz, v_link.id,
           v_link.purpose, v_link.source_type, v_link.source_id;
    return;
  end if;

  if v_link.expires_at <= v_now then
    return query
    select 'EXPIRED'::text, null::uuid, v_link.organization_id, v_link.party_id,
           null::timestamptz, null::timestamptz, v_link.id,
           v_link.purpose, v_link.source_type, v_link.source_id;
    return;
  end if;

  update public.customer_portal_access_links
  set consumed_at = v_now
  where id = v_link.id
    and consumed_at is null
    and revoked_at is null
    and expires_at > v_now;

  if not found then
    raise exception 'CUSTOMER_PORTAL_LINK_CONSUME_CONFLICT';
  end if;

  insert into public.customer_portal_sessions (
    organization_id,
    party_id,
    session_token_hash,
    expires_at,
    last_seen_at
  ) values (
    v_link.organization_id,
    v_link.party_id,
    p_session_token_hash,
    p_session_expires_at,
    v_now
  )
  returning * into v_session;

  return query
  select 'SUCCESS'::text,
         v_session.id,
         v_session.organization_id,
         v_session.party_id,
         v_session.expires_at,
         v_session.created_at,
         v_link.id,
         v_link.purpose,
         v_link.source_type,
         v_link.source_id;
end;
$$;

revoke all on function public.consume_customer_portal_access_token_atomic(text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.consume_customer_portal_access_token_atomic(text,text,timestamptz)
  to service_role;

commit;
