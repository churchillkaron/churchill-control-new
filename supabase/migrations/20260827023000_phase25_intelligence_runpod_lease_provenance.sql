-- Phase 25: durable, Intelligence-only RunPod safe-lease provenance.
-- No customer data, provider execution, wallet mutation, or model-training side effect.

create table if not exists public.avantiqo_intelligence_runpod_leases (
  id uuid primary key default gen_random_uuid(),
  contract text not null default 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_V1',
  safe_lease_contract text not null default 'AVANTIQO_RUNPOD_SAFE_LEASE_V2',
  organization_id uuid not null,
  lane text not null default 'intelligence-experiment',
  endpoint_id text not null,
  endpoint_name text not null,
  owner_request_id uuid not null,
  state text not null default 'ACTIVE',
  acquired_at timestamptz not null default now(),
  last_refreshed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  released_at timestamptz,
  release_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avantiqo_intelligence_runpod_leases_contract_check
    check (contract = 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_V1'),
  constraint avantiqo_intelligence_runpod_leases_safe_contract_check
    check (safe_lease_contract = 'AVANTIQO_RUNPOD_SAFE_LEASE_V2'),
  constraint avantiqo_intelligence_runpod_leases_lane_check
    check (lane = 'intelligence-experiment'),
  constraint avantiqo_intelligence_runpod_leases_state_check
    check (state in ('ACTIVE', 'RELEASED', 'FAILED', 'EXPIRED')),
  constraint avantiqo_intelligence_runpod_leases_endpoint_id_check
    check (length(btrim(endpoint_id)) between 1 and 128),
  constraint avantiqo_intelligence_runpod_leases_endpoint_name_check
    check (length(btrim(endpoint_name)) between 1 and 200),
  constraint avantiqo_intelligence_runpod_leases_expiry_check
    check (expires_at > acquired_at)
);

create unique index if not exists avantiqo_intelligence_runpod_leases_one_active_endpoint_idx
  on public.avantiqo_intelligence_runpod_leases(endpoint_id)
  where state = 'ACTIVE';

create unique index if not exists avantiqo_intelligence_runpod_leases_one_active_owner_idx
  on public.avantiqo_intelligence_runpod_leases(owner_request_id)
  where state = 'ACTIVE';

create index if not exists avantiqo_intelligence_runpod_leases_org_created_idx
  on public.avantiqo_intelligence_runpod_leases(organization_id, created_at desc);

create index if not exists avantiqo_intelligence_runpod_leases_active_expiry_idx
  on public.avantiqo_intelligence_runpod_leases(expires_at)
  where state = 'ACTIVE';

alter table public.avantiqo_intelligence_runpod_leases enable row level security;
revoke all on table public.avantiqo_intelligence_runpod_leases from public, anon, authenticated;
grant select, insert, update, delete on table public.avantiqo_intelligence_runpod_leases to service_role;

create or replace function public.acquire_avantiqo_intelligence_runpod_lease_v1(
  p_organization_id uuid,
  p_endpoint_id text,
  p_endpoint_name text,
  p_owner_request_id uuid,
  p_ttl_seconds integer default 900
)
returns public.avantiqo_intelligence_runpod_leases
language plpgsql
security invoker
set search_path = public
as $$
declare
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

  v_ttl := greatest(60, least(coalesce(p_ttl_seconds, 900), 1800));

  perform pg_advisory_xact_lock(hashtextextended('avantiqo_intelligence_runpod_lease_v1', 0));

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
      and endpoint_id = btrim(p_endpoint_id)
  ) then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_ENDPOINT_BUSY';
  end if;

  select count(*)::integer
  into v_active_count
  from public.avantiqo_intelligence_runpod_leases
  where state = 'ACTIVE';

  if v_active_count >= 3 then
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
    'intelligence-experiment',
    btrim(p_endpoint_id),
    btrim(p_endpoint_name),
    p_owner_request_id,
    now() + make_interval(secs => v_ttl),
    jsonb_build_object(
      'claim_required', true,
      'receipt_required', true,
      'provider_call_performed', false,
      'runpod_job_submitted', false,
      'reusable_platform_knowledge', false,
      'automatic_training_effect', 'NONE'
    )
  )
  returning * into v_lease;

  return v_lease;
end;
$$;

create or replace function public.refresh_avantiqo_intelligence_runpod_lease_v1(
  p_lease_id uuid,
  p_owner_request_id uuid,
  p_ttl_seconds integer default 900
)
returns public.avantiqo_intelligence_runpod_leases
language plpgsql
security invoker
set search_path = public
as $$
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
    and state = 'ACTIVE'
    and expires_at > now()
  returning * into v_lease;

  if v_lease.id is null then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_NOT_ACTIVE';
  end if;

  return v_lease;
end;
$$;

create or replace function public.release_avantiqo_intelligence_runpod_lease_v1(
  p_lease_id uuid,
  p_owner_request_id uuid,
  p_state text default 'RELEASED',
  p_reason text default null
)
returns public.avantiqo_intelligence_runpod_leases
language plpgsql
security invoker
set search_path = public
as $$
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
    and state = 'ACTIVE'
  returning * into v_lease;

  if v_lease.id is null then
    select * into v_lease
    from public.avantiqo_intelligence_runpod_leases
    where id = p_lease_id
      and owner_request_id = p_owner_request_id;
  end if;

  if v_lease.id is null then
    raise exception 'AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_NOT_FOUND';
  end if;

  return v_lease;
end;
$$;

revoke all on function public.acquire_avantiqo_intelligence_runpod_lease_v1(uuid, text, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.refresh_avantiqo_intelligence_runpod_lease_v1(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.release_avantiqo_intelligence_runpod_lease_v1(uuid, uuid, text, text) from public, anon, authenticated;

grant execute on function public.acquire_avantiqo_intelligence_runpod_lease_v1(uuid, text, text, uuid, integer) to service_role;
grant execute on function public.refresh_avantiqo_intelligence_runpod_lease_v1(uuid, uuid, integer) to service_role;
grant execute on function public.release_avantiqo_intelligence_runpod_lease_v1(uuid, uuid, text, text) to service_role;
