begin;

create or replace function public.customer_portal_create_access_link_atomic(
  p_organization_id uuid,
  p_party_id uuid,
  p_token_hash text,
  p_source_type text,
  p_source_id text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_type text := nullif(upper(btrim(coalesce(p_source_type, ''))), '');
  v_source_id text := nullif(btrim(coalesce(p_source_id, '')), '');
  v_link public.customer_portal_access_links%rowtype;
  v_now timestamptz := now();
  v_lock_key text;
begin
  if p_organization_id is null or p_party_id is null then
    raise exception 'CUSTOMER_PORTAL_SCOPE_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_token_hash, '')), '') is null then
    raise exception 'CUSTOMER_PORTAL_TOKEN_HASH_REQUIRED';
  end if;
  if p_expires_at is null or p_expires_at <= v_now then
    raise exception 'CUSTOMER_PORTAL_ACCESS_EXPIRY_INVALID';
  end if;
  if (v_source_type is null) <> (v_source_id is null) then
    raise exception 'CUSTOMER_PORTAL_SOURCE_PAIR_REQUIRED';
  end if;

  perform 1
  from public.parties party
  where party.organization_id = p_organization_id
    and party.id = p_party_id
    and lower(coalesce(party.status, 'active')) <> 'archived';
  if not found then
    raise exception 'CUSTOMER_PORTAL_PARTY_NOT_FOUND';
  end if;

  v_lock_key := p_organization_id::text || ':customer-portal-access:' || p_party_id::text || ':'
    || coalesce(v_source_type, 'GENERIC') || ':' || coalesce(v_source_id, 'GENERIC');
  perform pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

  if v_source_type is not null then
    update public.customer_portal_access_links link
    set revoked_at = v_now
    where link.organization_id = p_organization_id
      and link.party_id = p_party_id
      and link.purpose = 'PORTAL_ACCESS'
      and link.source_type = v_source_type
      and link.source_id = v_source_id
      and link.consumed_at is null
      and link.revoked_at is null;
  end if;

  insert into public.customer_portal_access_links (
    organization_id,
    party_id,
    token_hash,
    purpose,
    source_type,
    source_id,
    expires_at
  ) values (
    p_organization_id,
    p_party_id,
    btrim(p_token_hash),
    'PORTAL_ACCESS',
    v_source_type,
    v_source_id,
    p_expires_at
  )
  returning * into v_link;

  return jsonb_build_object(
    'id', v_link.id,
    'expires_at', v_link.expires_at,
    'source_type', v_link.source_type,
    'source_id', v_link.source_id
  );
end;
$$;

revoke all on function public.customer_portal_create_access_link_atomic(uuid, uuid, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.customer_portal_create_access_link_atomic(uuid, uuid, text, text, text, timestamptz)
  to service_role;

comment on function public.customer_portal_create_access_link_atomic(uuid, uuid, text, text, text, timestamptz) is
  'Atomically rotates and creates a single live customer portal invitation for one Party/source scope. Service-role only.';

commit;
