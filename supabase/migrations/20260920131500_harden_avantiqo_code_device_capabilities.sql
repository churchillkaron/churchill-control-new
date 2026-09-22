create or replace function public.pair_avantiqo_code_device(
  p_pairing_code text,
  p_display_name text,
  p_platform text,
  p_capabilities text[] default '{}',
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
  v_pair public.avantiqo_code_device_pairings;
  v_token text := encode(extensions.gen_random_bytes(32),'hex');
  v_device public.avantiqo_code_devices;
begin
  select * into v_pair from public.avantiqo_code_device_pairings
  where pairing_hash=encode(extensions.digest(coalesce(p_pairing_code,''),'sha256'),'hex')
    and used_at is null and expires_at > now()
  for update;
  if v_pair.id is null then raise exception 'AVANTIQO_CODE_DEVICE_PAIRING_INVALID_OR_EXPIRED'; end if;
  insert into public.avantiqo_code_devices(organization_id,display_name,platform,token_hash,capabilities,allowed_roots,metadata,created_by)
  values(
    v_pair.organization_id,
    left(btrim(p_display_name),160),
    left(coalesce(nullif(btrim(p_platform),''),'unknown'),80),
    encode(extensions.digest(v_token,'sha256'),'hex'),
    v_pair.requested_capabilities,
    v_pair.allowed_roots,
    coalesce(p_metadata,'{}'::jsonb),
    v_pair.created_by
  )
  returning * into v_device;
  update public.avantiqo_code_device_pairings set used_at=now() where id=v_pair.id;
  return jsonb_build_object('device_id',v_device.id,'device_token',v_token,'organization_id',v_device.organization_id,'allowed_roots',v_device.allowed_roots,'capabilities',v_device.capabilities);
end; $$;

create or replace function public.heartbeat_avantiqo_code_device(
  p_device_id uuid,
  p_device_token text,
  p_capabilities text[],
  p_metadata jsonb default '{}'::jsonb
) returns boolean
language plpgsql security definer set search_path=public,extensions as $$
begin
  if not public.avantiqo_code_device_authorized(p_device_id,p_device_token) then raise exception 'AVANTIQO_CODE_DEVICE_UNAUTHORIZED'; end if;
  update public.avantiqo_code_devices
  set last_seen_at=now(),updated_at=now(),metadata=coalesce(p_metadata,metadata)
  where id=p_device_id;
  return found;
end; $$;

comment on function public.pair_avantiqo_code_device(text,text,text,text[],jsonb)
  is 'Pairs a Code Device with server-authorized capabilities only; agent-supplied capabilities cannot expand authority.';
comment on function public.heartbeat_avantiqo_code_device(uuid,text,text[],jsonb)
  is 'Refreshes device liveness and metadata without allowing heartbeat payloads to expand capabilities.';
