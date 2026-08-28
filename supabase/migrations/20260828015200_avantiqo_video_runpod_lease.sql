-- Durable, server-only Video RunPod production lease.
-- Keeps customer Video work safe across horizontally scaled web instances while
-- preserving the canonical 0/0 -> leased 0/1 -> 0/0 RunPod lifecycle.

create table if not exists public.avantiqo_video_runpod_leases (
  id uuid primary key default gen_random_uuid(),
  contract text not null default 'AVANTIQO_RUNPOD_SAFE_LEASE_V2',
  lane text not null,
  endpoint_id text not null,
  endpoint_name text not null,
  organization_id uuid not null,
  owner_request_id uuid not null,
  state text not null default 'ACTIVE',
  acquired_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  release_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avantiqo_video_runpod_leases_contract_check
    check (contract = 'AVANTIQO_RUNPOD_SAFE_LEASE_V2'),
  constraint avantiqo_video_runpod_leases_lane_check
    check (lane in ('cinema-production')),
  constraint avantiqo_video_runpod_leases_state_check
    check (state in ('ACTIVE', 'RELEASED', 'FAILED', 'EXPIRED')),
  constraint avantiqo_video_runpod_leases_endpoint_id_check
    check (length(btrim(endpoint_id)) between 1 and 128),
  constraint avantiqo_video_runpod_leases_endpoint_name_check
    check (length(btrim(endpoint_name)) between 1 and 160),
  constraint avantiqo_video_runpod_leases_expiry_check
    check (expires_at > acquired_at)
);

create unique index if not exists avantiqo_video_runpod_leases_one_active_endpoint_idx
  on public.avantiqo_video_runpod_leases(endpoint_id)
  where state = 'ACTIVE';

create unique index if not exists avantiqo_video_runpod_leases_one_active_lane_idx
  on public.avantiqo_video_runpod_leases(lane)
  where state = 'ACTIVE';

create index if not exists avantiqo_video_runpod_leases_active_expiry_idx
  on public.avantiqo_video_runpod_leases(expires_at)
  where state = 'ACTIVE';

create index if not exists avantiqo_video_runpod_leases_org_created_idx
  on public.avantiqo_video_runpod_leases(organization_id, created_at desc);

alter table public.avantiqo_video_runpod_leases enable row level security;
revoke all on table public.avantiqo_video_runpod_leases from public, anon, authenticated;
grant select, insert, update, delete on table public.avantiqo_video_runpod_leases to service_role;

create or replace function public.acquire_avantiqo_video_runpod_lease_v2(
  p_organization_id uuid,
  p_lane text,
  p_endpoint_id text,
  p_endpoint_name text,
  p_owner_request_id uuid,
  p_ttl_seconds integer default 900
)
returns public.avantiqo_video_runpod_leases
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ttl integer;
  v_active_count integer;
  v_lease public.avantiqo_video_runpod_leases;
begin
  if p_organization_id is null then
    raise exception 'AVANTIQO_VIDEO_RUNPOD_LEASE_ORGANIZATION_REQUIRED';
  end if;
  if p_owner_request_id is null then
    raise exception 'AVANTIQO_VIDEO_RUNPOD_LEASE_OWNER_REQUIRED';
  end if;
  if p_lane <> 'cinema-production' then
    raise exception 'AVANTIQO_VIDEO_RUNPOD_LEASE_LANE_INVALID';
  end if;
  if btrim(coalesce(p_endpoint_id, '')) = '' or btrim(coalesce(p_endpoint_name, '')) = '' then
    raise exception 'AVANTIQO_VIDEO_RUNPOD_LEASE_ENDPOINT_REQUIRED';
  end if;
  if p_endpoint_name <> 'avantiqo-cinema-production-v1' then
    raise exception 'AVANTIQO_VIDEO_RUNPOD_LEASE_ENDPOINT_NAME_INVALID';
  end if;

  v_ttl := greatest(60, least(coalesce(p_ttl_seconds, 900), 1800));

  perform pg_advisory_xact_lock(hashtextextended('avantiqo_video_runpod_safe_lease_v2', 0));

  update public.avantiqo_video_runpod_leases
  set
    state = 'EXPIRED',
    released_at = coalesce(released_at, now()),
    release_reason = coalesce(release_reason, 'TTL_EXPIRED'),
    updated_at = now()
  where state = 'ACTIVE'
    and expires_at <= now();

  if exists (
    select 1
    from public.avantiqo_video_runpod_leases
    where state = 'ACTIVE'
      and endpoint_id = p_endpoint_id
  ) then
    raise exception 'AVANTIQO_VIDEO_RUNPOD_LEASE_ENDPOINT_BUSY';
  end if;

  if exists (
    select 1
    from public.avantiqo_video_runpod_leases
    where state = 'ACTIVE'
      and lane = p_lane
  ) then
    raise exception 'AVANTIQO_VIDEO_RUNPOD_LEASE_LANE_BUSY';
  end if;

  select count(*)::integer
  into v_active_count
  from public.avantiqo_video_runpod_leases
  where state = 'ACTIVE';

  if v_active_count >= 1 then
    raise exception 'AVANTIQO_VIDEO_RUNPOD_LEASE_PARALLEL_LIMIT';
  end if;

  insert into public.avantiqo_video_runpod_leases (
    lane,
    endpoint_id,
    endpoint_name,
    organization_id,
    owner_request_id,
    expires_at
  )
  values (
    p_lane,
    btrim(p_endpoint_id),
    btrim(p_endpoint_name),
    p_organization_id,
    p_owner_request_id,
    now() + make_interval(secs => v_ttl)
  )
  returning * into v_lease;

  return v_lease;
end;
$$;

create or replace function public.refresh_avantiqo_video_runpod_lease_v2(
  p_lease_id uuid,
  p_owner_request_id uuid,
  p_ttl_seconds integer default 900
)
returns public.avantiqo_video_runpod_leases
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_ttl integer;
  v_lease public.avantiqo_video_runpod_leases;
begin
  if p_lease_id is null or p_owner_request_id is null then
    raise exception 'AVANTIQO_VIDEO_RUNPOD_LEASE_IDENTITY_REQUIRED';
  end if;

  v_ttl := greatest(60, least(coalesce(p_ttl_seconds, 900), 1800));

  update public.avantiqo_video_runpod_leases
  set
    expires_at = now() + make_interval(secs => v_ttl),
    updated_at = now()
  where id = p_lease_id
    and owner_request_id = p_owner_request_id
    and state = 'ACTIVE'
    and expires_at > now()
  returning * into v_lease;

  if v_lease.id is null then
    raise exception 'AVANTIQO_VIDEO_RUNPOD_LEASE_NOT_ACTIVE';
  end if;

  return v_lease;
end;
$$;

create or replace function public.release_avantiqo_video_runpod_lease_v2(
  p_lease_id uuid,
  p_owner_request_id uuid,
  p_state text default 'RELEASED',
  p_reason text default null
)
returns public.avantiqo_video_runpod_leases
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_state text;
  v_lease public.avantiqo_video_runpod_leases;
begin
  if p_lease_id is null or p_owner_request_id is null then
    raise exception 'AVANTIQO_VIDEO_RUNPOD_LEASE_IDENTITY_REQUIRED';
  end if;

  v_state := upper(btrim(coalesce(p_state, 'RELEASED')));
  if v_state not in ('RELEASED', 'FAILED', 'EXPIRED') then
    raise exception 'AVANTIQO_VIDEO_RUNPOD_LEASE_RELEASE_STATE_INVALID';
  end if;

  update public.avantiqo_video_runpod_leases
  set
    state = v_state,
    released_at = coalesce(released_at, now()),
    release_reason = nullif(btrim(coalesce(p_reason, '')), ''),
    updated_at = now()
  where id = p_lease_id
    and owner_request_id = p_owner_request_id
    and state = 'ACTIVE'
  returning * into v_lease;

  if v_lease.id is null then
    select * into v_lease
    from public.avantiqo_video_runpod_leases
    where id = p_lease_id
      and owner_request_id = p_owner_request_id;
  end if;

  if v_lease.id is null then
    raise exception 'AVANTIQO_VIDEO_RUNPOD_LEASE_NOT_FOUND';
  end if;

  return v_lease;
end;
$$;

revoke all on function public.acquire_avantiqo_video_runpod_lease_v2(uuid, text, text, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.refresh_avantiqo_video_runpod_lease_v2(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_avantiqo_video_runpod_lease_v2(uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function public.acquire_avantiqo_video_runpod_lease_v2(uuid, text, text, text, uuid, integer) to service_role;
grant execute on function public.refresh_avantiqo_video_runpod_lease_v2(uuid, uuid, integer) to service_role;
grant execute on function public.release_avantiqo_video_runpod_lease_v2(uuid, uuid, text, text) to service_role;
