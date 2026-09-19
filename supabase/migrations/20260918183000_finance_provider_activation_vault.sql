begin;

create or replace function public.provision_finance_provider_credential(
  p_organization_id uuid,
  p_provider_id text,
  p_credential_type text,
  p_secret_payload jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns table (
  credential_id uuid,
  provider_id text,
  credential_type text,
  status text,
  operation text
)
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  v_role text;
  v_provider text := lower(btrim(coalesce(p_provider_id, '')));
  v_type text := lower(btrim(coalesce(p_credential_type, '')));
  v_purpose text;
  v_expected_type text;
  v_existing public.provider_credentials%rowtype;
  v_vault_id uuid;
  v_reference text;
  v_credential_id uuid;
  v_operation text;
  v_now timestamptz := now();
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  v_role := coalesce(current_setting('request.jwt.claim.role', true), '');
  if v_role <> 'service_role' then
    raise exception 'FINANCE_PROVIDER_PROVISION_SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_organization_id is null then raise exception 'FINANCE_PROVIDER_ORGANIZATION_REQUIRED'; end if;
  if v_provider not in ('brankas_statement','certified_etax_rest','netbay_invoicechain','inet_etax') then
    raise exception 'FINANCE_PROVIDER_UNSUPPORTED:%', v_provider;
  end if;
  if p_secret_payload is null or p_secret_payload = '{}'::jsonb then
    raise exception 'FINANCE_PROVIDER_SECRET_REQUIRED';
  end if;

  if v_provider = 'brankas_statement' then
    v_expected_type := 'finance_bank_feed_api';
    v_purpose := 'FINANCE_BANK_FEED';
  else
    v_expected_type := 'finance_etax_provider';
    v_purpose := 'FINANCE_ETAX_PROVIDER';
  end if;
  if v_type <> v_expected_type then
    raise exception 'FINANCE_PROVIDER_CREDENTIAL_TYPE_MISMATCH';
  end if;

  if v_metadata ?| array['api_key','access_token','password','secret','server_key','private_key','client_secret'] then
    raise exception 'FINANCE_PROVIDER_SECRET_METADATA_FORBIDDEN';
  end if;
  v_metadata := v_metadata || jsonb_build_object(
    'organization_id', p_organization_id::text,
    'purpose', v_purpose,
    'enabled', true,
    'managed_by', 'AVANTIQO',
    'secret_transport', 'SUPABASE_VAULT'
  );

  select pc.* into v_existing
  from public.provider_credentials pc
  where lower(btrim(pc.provider_id)) = v_provider
    and pc.credential_type = v_expected_type
    and coalesce(pc.metadata->>'organization_id','') = p_organization_id::text
    and upper(coalesce(pc.status,'')) = 'ACTIVE'
  order by pc.updated_at desc, pc.created_at desc
  limit 1
  for update;

  if found and lower(left(coalesce(v_existing.secret_reference,''),6)) = 'vault:' then
    begin
      v_vault_id := btrim(substr(v_existing.secret_reference,7))::uuid;
    exception when invalid_text_representation then
      v_vault_id := null;
    end;
  end if;

  if v_vault_id is not null and exists (select 1 from vault.secrets s where s.id = v_vault_id) then
    perform vault.update_secret(
      v_vault_id,
      p_secret_payload::text,
      'finance-' || replace(v_provider,'_','-') || '-' || p_organization_id::text,
      'Avantiqo Finance managed provider credential',
      null
    );
    v_reference := 'vault:' || v_vault_id::text;
    v_credential_id := v_existing.id;
    update public.provider_credentials
      set metadata = v_metadata,
          status = 'ACTIVE',
          updated_at = v_now
      where id = v_credential_id;
    v_operation := 'UPDATED';
  else
    v_vault_id := vault.create_secret(
      p_secret_payload::text,
      'finance-' || replace(v_provider,'_','-') || '-' || p_organization_id::text,
      'Avantiqo Finance managed provider credential',
      null
    );
    v_reference := 'vault:' || v_vault_id::text;
    if found then
      update public.provider_credentials
        set secret_reference = v_reference,
            metadata = v_metadata,
            status = 'ACTIVE',
            updated_at = v_now
        where id = v_existing.id
        returning id into v_credential_id;
      v_operation := 'REBOUND';
    else
      insert into public.provider_credentials (
        provider_id, credential_type, secret_reference, status, metadata, created_at, updated_at
      ) values (
        v_provider, v_expected_type, v_reference, 'ACTIVE', v_metadata, v_now, v_now
      ) returning id into v_credential_id;
      v_operation := 'CREATED';
    end if;
  end if;

  update public.provider_credentials pc
  set status = 'INACTIVE', updated_at = v_now
  where pc.id <> v_credential_id
    and lower(btrim(pc.provider_id)) = v_provider
    and pc.credential_type = v_expected_type
    and coalesce(pc.metadata->>'organization_id','') = p_organization_id::text
    and upper(coalesce(pc.status,'')) = 'ACTIVE';

  return query select v_credential_id, v_provider, v_expected_type, 'ACTIVE'::text, v_operation;
end;
$$;

revoke all on function public.provision_finance_provider_credential(uuid,text,text,jsonb,jsonb) from public;
revoke all on function public.provision_finance_provider_credential(uuid,text,text,jsonb,jsonb) from anon;
revoke all on function public.provision_finance_provider_credential(uuid,text,text,jsonb,jsonb) from authenticated;
grant execute on function public.provision_finance_provider_credential(uuid,text,text,jsonb,jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
