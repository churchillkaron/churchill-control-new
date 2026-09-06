create or replace function public.provision_owned_intelligence_modal_credential(
  p_organization_id uuid,
  p_secret_payload text
)
returns table (
  credential_id uuid,
  secret_reference text,
  status text,
  operation text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_payload jsonb;
  v_token_id text;
  v_token_secret text;
  v_modal_environment text;
  v_existing public.provider_credentials%rowtype;
  v_vault_id uuid;
  v_reference text;
  v_credential_id uuid;
  v_operation text;
  v_now timestamptz := now();
begin
  if current_user <> 'service_role' then
    raise exception 'OWNED_INTELLIGENCE_CREDENTIAL_PROVISION_SERVICE_ROLE_REQUIRED'
      using errcode = '42501';
  end if;

  if p_organization_id is null then
    raise exception 'OWNED_INTELLIGENCE_CREDENTIAL_ORGANIZATION_REQUIRED';
  end if;

  if nullif(p_secret_payload, '') is null then
    raise exception 'OWNED_INTELLIGENCE_CREDENTIAL_SECRET_REQUIRED';
  end if;

  begin
    v_payload := p_secret_payload::jsonb;
  exception when others then
    raise exception 'OWNED_INTELLIGENCE_CREDENTIAL_SECRET_JSON_INVALID';
  end;

  if jsonb_typeof(v_payload) <> 'object' then
    raise exception 'OWNED_INTELLIGENCE_CREDENTIAL_SECRET_JSON_INVALID';
  end if;

  v_token_id := nullif(btrim(coalesce(v_payload ->> 'modal_token_id', '')), '');
  v_token_secret := nullif(btrim(coalesce(v_payload ->> 'modal_token_secret', '')), '');
  v_modal_environment := nullif(btrim(coalesce(v_payload ->> 'modal_environment', '')), '');

  if v_token_id is null then
    raise exception 'OWNED_INTELLIGENCE_MODAL_TOKEN_ID_REQUIRED';
  end if;

  if v_token_secret is null then
    raise exception 'OWNED_INTELLIGENCE_MODAL_TOKEN_SECRET_REQUIRED';
  end if;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'modal_token_id', v_token_id,
    'modal_token_secret', v_token_secret,
    'modal_environment', v_modal_environment
  ));

  select pc.*
  into v_existing
  from public.provider_credentials pc
  where lower(btrim(pc.provider_id)) = 'avantiqo-intelligence'
    and pc.credential_type = 'managed_modal_credentials'
    and upper(coalesce(pc.status, '')) = 'ACTIVE'
    and upper(coalesce(pc.metadata ->> 'purpose', '')) = 'AVANTIQO_OWNED_INTELLIGENCE'
    and coalesce(pc.metadata ->> 'organization_id', '') = p_organization_id::text
  order by coalesce((pc.metadata ->> 'priority')::integer, 0) desc, pc.created_at desc
  limit 1
  for update;

  if found and lower(left(coalesce(v_existing.secret_reference, ''), 6)) = 'vault:' then
    begin
      v_vault_id := btrim(substr(v_existing.secret_reference, 7))::uuid;
    exception when invalid_text_representation then
      v_vault_id := null;
    end;
  end if;

  if v_vault_id is not null
     and exists (select 1 from vault.secrets s where s.id = v_vault_id) then
    perform vault.update_secret(
      v_vault_id,
      v_payload::text,
      'avantiqo-intelligence-' || p_organization_id::text,
      'Avantiqo owned Intelligence managed Modal credential',
      null
    );
    v_reference := 'vault:' || v_vault_id::text;
    v_credential_id := v_existing.id;
    v_operation := 'UPDATED';
  else
    v_vault_id := vault.create_secret(
      v_payload::text,
      'avantiqo-intelligence-' || p_organization_id::text,
      'Avantiqo owned Intelligence managed Modal credential',
      null
    );
    v_reference := 'vault:' || v_vault_id::text;

    if found then
      update public.provider_credentials
      set secret_reference = v_reference,
          status = 'ACTIVE',
          metadata = coalesce(v_existing.metadata, '{}'::jsonb) || jsonb_build_object(
            'organization_id', p_organization_id::text,
            'purpose', 'AVANTIQO_OWNED_INTELLIGENCE',
            'enabled', true,
            'managed_by', 'AVANTIQO',
            'secret_transport', 'SUPABASE_VAULT',
            'updated_by_runtime', 'OWNED_INTELLIGENCE_CREDENTIAL_PROVISIONER_V1'
          ),
          updated_at = v_now
      where id = v_existing.id
      returning id into v_credential_id;
      v_operation := 'REBOUND';
    else
      insert into public.provider_credentials (
        provider_id,
        credential_type,
        secret_reference,
        status,
        metadata,
        created_at,
        updated_at
      ) values (
        'avantiqo-intelligence',
        'managed_modal_credentials',
        v_reference,
        'ACTIVE',
        jsonb_build_object(
          'organization_id', p_organization_id::text,
          'purpose', 'AVANTIQO_OWNED_INTELLIGENCE',
          'enabled', true,
          'managed_by', 'AVANTIQO',
          'secret_transport', 'SUPABASE_VAULT',
          'priority', 100,
          'created_by_runtime', 'OWNED_INTELLIGENCE_CREDENTIAL_PROVISIONER_V1'
        ),
        v_now,
        v_now
      )
      returning id into v_credential_id;
      v_operation := 'CREATED';
    end if;
  end if;

  update public.provider_credentials pc
  set status = 'INACTIVE',
      updated_at = v_now
  where pc.id <> v_credential_id
    and lower(btrim(pc.provider_id)) = 'avantiqo-intelligence'
    and pc.credential_type = 'managed_modal_credentials'
    and upper(coalesce(pc.status, '')) = 'ACTIVE'
    and upper(coalesce(pc.metadata ->> 'purpose', '')) = 'AVANTIQO_OWNED_INTELLIGENCE'
    and coalesce(pc.metadata ->> 'organization_id', '') = p_organization_id::text;

  if v_operation = 'UPDATED' then
    update public.provider_credentials
    set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'organization_id', p_organization_id::text,
          'purpose', 'AVANTIQO_OWNED_INTELLIGENCE',
          'enabled', true,
          'managed_by', 'AVANTIQO',
          'secret_transport', 'SUPABASE_VAULT',
          'updated_by_runtime', 'OWNED_INTELLIGENCE_CREDENTIAL_PROVISIONER_V1'
        ),
        updated_at = v_now
    where id = v_credential_id;
  end if;

  return query
  select v_credential_id, v_reference, 'ACTIVE'::text, v_operation;
end;
$$;

revoke all on function public.provision_owned_intelligence_modal_credential(uuid, text) from public;
revoke all on function public.provision_owned_intelligence_modal_credential(uuid, text) from anon;
revoke all on function public.provision_owned_intelligence_modal_credential(uuid, text) from authenticated;
grant execute on function public.provision_owned_intelligence_modal_credential(uuid, text) to service_role;
