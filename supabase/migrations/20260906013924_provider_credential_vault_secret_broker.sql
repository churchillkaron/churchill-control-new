create or replace function public.resolve_provider_credential_vault_secret(
  p_credential_id uuid,
  p_provider_id text,
  p_organization_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  v_reference text;
  v_provider_id text;
  v_status text;
  v_metadata jsonb;
  v_scoped_organization_id text;
  v_vault_id uuid;
  v_secret text;
  v_request_role text;
begin
  v_request_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  if v_request_role <> 'service_role' then
    raise exception 'PROVIDER_CREDENTIAL_SECRET_BROKER_SERVICE_ROLE_REQUIRED'
      using errcode = '42501';
  end if;

  if p_credential_id is null then
    raise exception 'PROVIDER_CREDENTIAL_ID_REQUIRED';
  end if;

  if nullif(btrim(p_provider_id), '') is null then
    raise exception 'PROVIDER_CREDENTIAL_PROVIDER_REQUIRED';
  end if;

  select
    pc.secret_reference,
    pc.provider_id,
    pc.status,
    pc.metadata
  into
    v_reference,
    v_provider_id,
    v_status,
    v_metadata
  from public.provider_credentials pc
  where pc.id = p_credential_id;

  if not found then
    raise exception 'PROVIDER_CREDENTIAL_NOT_FOUND';
  end if;

  if upper(coalesce(v_status, '')) <> 'ACTIVE' then
    raise exception 'PROVIDER_CREDENTIAL_NOT_ACTIVE';
  end if;

  if lower(btrim(coalesce(v_provider_id, ''))) <> lower(btrim(p_provider_id)) then
    raise exception 'PROVIDER_CREDENTIAL_PROVIDER_MISMATCH';
  end if;

  v_scoped_organization_id := nullif(btrim(coalesce(v_metadata ->> 'organization_id', '')), '');
  if v_scoped_organization_id is not null then
    if p_organization_id is null or v_scoped_organization_id <> p_organization_id::text then
      raise exception 'PROVIDER_CREDENTIAL_ORGANIZATION_MISMATCH'
        using errcode = '42501';
    end if;
  end if;

  if lower(left(coalesce(v_reference, ''), 6)) <> 'vault:' then
    raise exception 'PROVIDER_CREDENTIAL_VAULT_REFERENCE_REQUIRED';
  end if;

  begin
    v_vault_id := btrim(substr(v_reference, 7))::uuid;
  exception when invalid_text_representation then
    raise exception 'PROVIDER_CREDENTIAL_VAULT_REFERENCE_INVALID';
  end;

  if v_vault_id is null then
    raise exception 'PROVIDER_CREDENTIAL_VAULT_REFERENCE_INVALID';
  end if;

  select ds.decrypted_secret
  into v_secret
  from vault.decrypted_secrets ds
  where ds.id = v_vault_id;

  if not found or nullif(v_secret, '') is null then
    raise exception 'PROVIDER_CREDENTIAL_VAULT_SECRET_UNAVAILABLE';
  end if;

  return v_secret;
end;
$$;

revoke all on function public.resolve_provider_credential_vault_secret(uuid, text, uuid) from public;
revoke all on function public.resolve_provider_credential_vault_secret(uuid, text, uuid) from anon;
revoke all on function public.resolve_provider_credential_vault_secret(uuid, text, uuid) from authenticated;
grant execute on function public.resolve_provider_credential_vault_secret(uuid, text, uuid) to service_role;
