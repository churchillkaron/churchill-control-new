create or replace function public.store_provider_credential_vault_secret(
  p_provider_id text,
  p_organization_id uuid,
  p_secret text,
  p_name text default null,
  p_description text default null
)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_vault_id uuid;
  v_provider_id text := lower(btrim(coalesce(p_provider_id, '')));
  v_name text;
begin
  if current_user <> 'service_role' then
    raise exception 'PROVIDER_CREDENTIAL_SECRET_STORE_SERVICE_ROLE_REQUIRED'
      using errcode = '42501';
  end if;

  if v_provider_id = '' then
    raise exception 'PROVIDER_CREDENTIAL_PROVIDER_REQUIRED';
  end if;
  if p_organization_id is null then
    raise exception 'PROVIDER_CREDENTIAL_ORGANIZATION_REQUIRED';
  end if;
  if nullif(p_secret, '') is null then
    raise exception 'PROVIDER_CREDENTIAL_SECRET_REQUIRED';
  end if;
  v_name := coalesce(
    nullif(btrim(p_name), ''),
    v_provider_id || '-' || p_organization_id::text || '-' || gen_random_uuid()::text
  );

  select vault.create_secret(
    p_secret,
    v_name,
    nullif(btrim(coalesce(p_description, '')), ''),
    null
  )
  into v_vault_id;

  if v_vault_id is null then
    raise exception 'PROVIDER_CREDENTIAL_VAULT_STORE_FAILED';
  end if;

  return 'vault:' || v_vault_id::text;
end;
$$;

revoke all on function public.store_provider_credential_vault_secret(text, uuid, text, text, text) from public;
revoke all on function public.store_provider_credential_vault_secret(text, uuid, text, text, text) from anon;
revoke all on function public.store_provider_credential_vault_secret(text, uuid, text, text, text) from authenticated;
grant execute on function public.store_provider_credential_vault_secret(text, uuid, text, text, text) to service_role;

do $$
declare
  v_row record;
  v_vault_id uuid;
begin
  for v_row in
    select id, secret_reference, metadata
    from public.provider_credentials
    where provider_id = 'meta'
      and status = 'ACTIVE'
      and coalesce(secret_reference, '') <> ''
      and lower(secret_reference) not like 'vault:%'
      and lower(secret_reference) not like 'env:%'
  loop
    select vault.create_secret(
      v_row.secret_reference,
      'meta-credential-' || v_row.id::text,
      'Migrated Avantiqo Meta provider credential',
      null
    )
    into v_vault_id;

    update public.provider_credentials
    set secret_reference = 'vault:' || v_vault_id::text,
        updated_at = now()
    where id = v_row.id;
  end loop;
end;
$$;
