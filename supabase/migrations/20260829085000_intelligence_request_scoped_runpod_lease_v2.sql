begin;

alter table public.avantiqo_intelligence_runpod_leases
  drop constraint if exists avantiqo_intelligence_runpod_leases_lane_check;

alter table public.avantiqo_intelligence_runpod_leases
  add constraint avantiqo_intelligence_runpod_leases_lane_check
  check (lane in ('intelligence-experiment', 'intelligence-fast', 'intelligence-deep'));

create unique index if not exists avantiqo_intelligence_runpod_leases_active_lane_uidx
  on public.avantiqo_intelligence_runpod_leases (lane)
  where state = 'ACTIVE';

create or replace function public.acquire_avantiqo_intelligence_runpod_lease_v2(
  p_organization_id uuid,
  p_lane text,
  p_endpoint_id text,
  p_endpoint_name text,
  p_owner_request_id uuid,
  p_ttl_seconds integer default 900
)
returns public.avantiqo_intelligence_runpod_leases
language plpgsql
set search_path to 'public'
as $function$
declare
  v_lane text;
  v_expected_endpoint_name text;
  v_ttl integer;
  v_active_count integer;
  v_lease public.avantiqo_intelligence_runpod_leases;
begin
  if p_organization_id is null then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_ORGANIZATION_REQUIRED';
  end if;
  if p_owner_request_id is null then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_OWNER_REQUIRED';
  end if;
  if btrim(coalesce(p_endpoint_id, '')) = '' or btrim(coalesce(p_endpoint_name, '')) = '' then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_ENDPOINT_REQUIRED';
  end if;

  v_lane := lower(btrim(coalesce(p_lane, '')));
  if v_lane not in ('intelligence-fast', 'intelligence-deep') then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_LANE_INVALID';
  end if;

  v_expected_endpoint_name := case v_lane
    when 'intelligence-fast' then 'avantiqo-intelligence-fast-v1'
    when 'intelligence-deep' then 'avantiqo-intelligence-v1'
    else null
  end;

  if btrim(p_endpoint_name) <> v_expected_endpoint_name then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_ENDPOINT_NAME_MISMATCH';
  end if;

  v_ttl := greatest(60, least(coalesce(p_ttl_seconds, 900), 1800));

  perform pg_advisory_xact_lock(hashtextextended('avantiqo_intelligence_runpod_lease_v2', 0));

  update public.avantiqo_intelligence_runpod_leases
  set
    state = 'EXPIRED',
    released_at = coalesce(released_at, now()),
    release_reason = coalesce(release_reason, 'TTL_EXPIRED'),
    updated_at = now()
  where state = 'ACTIVE'
    and expires_at <= now();

  select *
  into v_lease
  from public.avantiqo_intelligence_runpod_leases
  where owner_request_id = p_owner_request_id
    and state = 'ACTIVE'
  limit 1;

  if v_lease.id is not null then
    if v_lease.organization_id <> p_organization_id
      or v_lease.lane <> v_lane
      or v_lease.endpoint_id <> btrim(p_endpoint_id)
      or v_lease.endpoint_name <> btrim(p_endpoint_name)
    then
      raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_OWNER_COLLISION';
    end if;
    return v_lease;
  end if;

  if exists (
    select 1
    from public.avantiqo_intelligence_runpod_leases
    where state = 'ACTIVE'
      and lane = v_lane
  ) then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_LANE_BUSY';
  end if;

  if exists (
    select 1
    from public.avantiqo_intelligence_runpod_leases
    where state = 'ACTIVE'
      and endpoint_id = btrim(p_endpoint_id)
  ) then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_ENDPOINT_BUSY';
  end if;

  select count(*)::integer
  into v_active_count
  from public.avantiqo_intelligence_runpod_leases
  where state = 'ACTIVE'
    and lane in ('intelligence-fast', 'intelligence-deep');

  if v_active_count >= 2 then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_PARALLEL_LIMIT';
  end if;

  insert into public.avantiqo_intelligence_runpod_leases (
    organization_id,
    lane,
    endpoint_id,
    endpoint_name,
    owner_request_id,
    expires_at,
    metadata
  ) values (
    p_organization_id,
    v_lane,
    btrim(p_endpoint_id),
    btrim(p_endpoint_name),
    p_owner_request_id,
    now() + make_interval(secs => v_ttl),
    jsonb_build_object(
      'lease_version', 2,
      'request_scoped', true,
      'owned_only_required', true,
      'external_fallback_allowed', false,
      'provider_call_performed', false,
      'runpod_job_submitted', false
    )
  )
  returning * into v_lease;

  return v_lease;
end;
$function$;

create or replace function public.refresh_avantiqo_intelligence_runpod_lease_v2(
  p_lease_id uuid,
  p_owner_request_id uuid,
  p_ttl_seconds integer default 900
)
returns public.avantiqo_intelligence_runpod_leases
language plpgsql
set search_path to 'public'
as $function$
declare
  v_ttl integer;
  v_lease public.avantiqo_intelligence_runpod_leases;
begin
  if p_lease_id is null or p_owner_request_id is null then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_IDENTITY_REQUIRED';
  end if;

  v_ttl := greatest(60, least(coalesce(p_ttl_seconds, 900), 1800));

  update public.avantiqo_intelligence_runpod_leases
  set
    expires_at = now() + make_interval(secs => v_ttl),
    last_refreshed_at = now(),
    updated_at = now()
  where id = p_lease_id
    and owner_request_id = p_owner_request_id
    and lane in ('intelligence-fast', 'intelligence-deep')
    and state = 'ACTIVE'
    and expires_at > now()
  returning * into v_lease;

  if v_lease.id is null then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_NOT_ACTIVE';
  end if;

  return v_lease;
end;
$function$;

create or replace function public.release_avantiqo_intelligence_runpod_lease_v2(
  p_lease_id uuid,
  p_owner_request_id uuid,
  p_state text default 'RELEASED',
  p_reason text default null
)
returns public.avantiqo_intelligence_runpod_leases
language plpgsql
set search_path to 'public'
as $function$
declare
  v_state text;
  v_lease public.avantiqo_intelligence_runpod_leases;
begin
  if p_lease_id is null or p_owner_request_id is null then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_IDENTITY_REQUIRED';
  end if;

  v_state := upper(btrim(coalesce(p_state, 'RELEASED')));
  if v_state not in ('RELEASED', 'FAILED', 'EXPIRED') then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_RELEASE_STATE_INVALID';
  end if;

  update public.avantiqo_intelligence_runpod_leases
  set
    state = v_state,
    released_at = coalesce(released_at, now()),
    release_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    updated_at = now()
  where id = p_lease_id
    and owner_request_id = p_owner_request_id
    and lane in ('intelligence-fast', 'intelligence-deep')
    and state = 'ACTIVE'
  returning * into v_lease;

  if v_lease.id is null then
    select * into v_lease
    from public.avantiqo_intelligence_runpod_leases
    where id = p_lease_id
      and owner_request_id = p_owner_request_id
      and lane in ('intelligence-fast', 'intelligence-deep');
  end if;

  if v_lease.id is null then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_NOT_FOUND';
  end if;

  return v_lease;
end;
$function$;

revoke all on function public.acquire_avantiqo_intelligence_runpod_lease_v2(uuid,text,text,text,uuid,integer) from public, anon, authenticated;
revoke all on function public.refresh_avantiqo_intelligence_runpod_lease_v2(uuid,uuid,integer) from public, anon, authenticated;
revoke all on function public.release_avantiqo_intelligence_runpod_lease_v2(uuid,uuid,text,text) from public, anon, authenticated;

grant execute on function public.acquire_avantiqo_intelligence_runpod_lease_v2(uuid,text,text,text,uuid,integer) to service_role;
grant execute on function public.refresh_avantiqo_intelligence_runpod_lease_v2(uuid,uuid,integer) to service_role;
grant execute on function public.release_avantiqo_intelligence_runpod_lease_v2(uuid,uuid,text,text) to service_role;

commit;
