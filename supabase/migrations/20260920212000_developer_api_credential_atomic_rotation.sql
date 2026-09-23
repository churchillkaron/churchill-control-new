begin;

create or replace function public.rotate_developer_api_credential(
  p_organization_id uuid,
  p_old_credential_id uuid,
  p_environment_id uuid,
  p_name text,
  p_token_prefix text,
  p_token_hash text,
  p_token_last_four text,
  p_scopes text[],
  p_expires_at timestamptz,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_id uuid;
begin
  if not exists (
    select 1
    from public.developer_api_credentials
    where id = p_old_credential_id
      and organization_id = p_organization_id
      and environment_id = p_environment_id
      and status = 'ACTIVE'
      and revoked_at is null
  ) then
    raise exception 'DEVELOPER_CREDENTIAL_NOT_ROTATABLE';
  end if;

  update public.developer_api_credentials
  set status = 'REVOKED',
      revoked_at = now()
  where id = p_old_credential_id
    and organization_id = p_organization_id;

  insert into public.developer_api_credentials(
    organization_id,
    environment_id,
    name,
    token_prefix,
    token_hash,
    token_last_four,
    scopes,
    status,
    expires_at,
    created_by
  )
  values (
    p_organization_id,
    p_environment_id,
    p_name,
    p_token_prefix,
    p_token_hash,
    p_token_last_four,
    coalesce(p_scopes, '{}'::text[]),
    'ACTIVE',
    p_expires_at,
    p_created_by
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

revoke all on function public.rotate_developer_api_credential(uuid,uuid,uuid,text,text,text,text,text[],timestamptz,uuid) from public;
revoke all on function public.rotate_developer_api_credential(uuid,uuid,uuid,text,text,text,text,text[],timestamptz,uuid) from anon;
revoke all on function public.rotate_developer_api_credential(uuid,uuid,uuid,text,text,text,text,text[],timestamptz,uuid) from authenticated;
grant execute on function public.rotate_developer_api_credential(uuid,uuid,uuid,text,text,text,text,text[],timestamptz,uuid) to service_role;

commit;
