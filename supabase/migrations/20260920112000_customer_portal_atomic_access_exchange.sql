begin;

create or replace function public.customer_portal_exchange_access_token_atomic(
  p_token_hash text,
  p_session_token_hash text,
  p_session_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link public.customer_portal_access_links%rowtype;
  v_session public.customer_portal_sessions%rowtype;
  v_now timestamptz := now();
begin
  if nullif(btrim(coalesce(p_token_hash, '')), '') is null then
    raise exception 'CUSTOMER_PORTAL_ACCESS_TOKEN_HASH_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_session_token_hash, '')), '') is null then
    raise exception 'CUSTOMER_PORTAL_SESSION_TOKEN_HASH_REQUIRED';
  end if;
  if p_session_expires_at is null or p_session_expires_at <= v_now then
    raise exception 'CUSTOMER_PORTAL_SESSION_EXPIRY_INVALID';
  end if;

  select link.*
  into v_link
  from public.customer_portal_access_links link
  where link.token_hash = btrim(p_token_hash)
    and link.purpose = 'PORTAL_ACCESS'
  for update;

  if not found
     or v_link.consumed_at is not null
     or v_link.revoked_at is not null
     or v_link.expires_at <= v_now then
    raise exception 'CUSTOMER_PORTAL_ACCESS_INVALID';
  end if;

  update public.customer_portal_access_links link
  set consumed_at = v_now
  where link.id = v_link.id
    and link.consumed_at is null
    and link.revoked_at is null
    and link.expires_at > v_now;

  if not found then
    raise exception 'CUSTOMER_PORTAL_ACCESS_INVALID';
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
    btrim(p_session_token_hash),
    p_session_expires_at,
    v_now
  )
  returning * into v_session;

  return jsonb_build_object(
    'session', to_jsonb(v_session),
    'access_link_id', v_link.id,
    'source_type', v_link.source_type,
    'source_id', v_link.source_id
  );
end;
$$;

revoke all on function public.customer_portal_exchange_access_token_atomic(text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.customer_portal_exchange_access_token_atomic(text, text, timestamptz)
  to service_role;

comment on function public.customer_portal_exchange_access_token_atomic(text, text, timestamptz) is
  'Atomically consumes one valid customer portal access link and creates exactly one Party-scoped portal session. Service-role only.';

commit;
