create extension if not exists pgcrypto with schema extensions;

create table if not exists public.avantiqo_local_compute_nodes (
  id text primary key,
  display_name text not null,
  token_hash text not null,
  enabled boolean not null default true,
  capabilities text[] not null default '{}',
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avantiqo_local_compute_nodes_id_check check (length(btrim(id)) between 1 and 120),
  constraint avantiqo_local_compute_nodes_token_hash_check check (token_hash ~ '^[0-9a-f]{64}$')
);

create table if not exists public.avantiqo_local_compute_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  usage_id text,
  capability text not null,
  lane text not null default 'utility',
  workload text not null,
  model text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  metrics jsonb not null default '{}'::jsonb,
  status text not null default 'QUEUED',
  priority integer not null default 0,
  node_id text references public.avantiqo_local_compute_nodes(id) on delete set null,
  attempts integer not null default 0,
  max_attempts integer not null default 2,
  available_at timestamptz not null default now(),
  leased_until timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avantiqo_local_compute_jobs_status_check check (status in ('QUEUED','RUNNING','COMPLETED','FAILED','CANCELLED')),
  constraint avantiqo_local_compute_jobs_attempts_check check (attempts >= 0 and max_attempts between 1 and 10),
  constraint avantiqo_local_compute_jobs_capability_check check (length(btrim(capability)) between 1 and 200),
  constraint avantiqo_local_compute_jobs_workload_check check (length(btrim(workload)) between 1 and 120)
);

create index if not exists avantiqo_local_compute_jobs_claim_idx
  on public.avantiqo_local_compute_jobs(status, available_at, priority desc, created_at)
  where status in ('QUEUED','RUNNING');
create index if not exists avantiqo_local_compute_jobs_org_created_idx
  on public.avantiqo_local_compute_jobs(organization_id, created_at desc);
create index if not exists avantiqo_local_compute_jobs_usage_idx
  on public.avantiqo_local_compute_jobs(usage_id)
  where usage_id is not null;

alter table public.avantiqo_local_compute_nodes enable row level security;
alter table public.avantiqo_local_compute_jobs enable row level security;
revoke all on table public.avantiqo_local_compute_nodes from public, anon, authenticated;
revoke all on table public.avantiqo_local_compute_jobs from public, anon, authenticated;
grant select, insert, update, delete on table public.avantiqo_local_compute_nodes to service_role;
grant select, insert, update, delete on table public.avantiqo_local_compute_jobs to service_role;

create or replace function public.avantiqo_local_node_authorized(p_node_id text, p_node_token text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.avantiqo_local_compute_nodes n
    where n.id = btrim(p_node_id)
      and n.enabled = true
      and n.token_hash = encode(extensions.digest(coalesce(p_node_token, ''), 'sha256'), 'hex')
  );
$$;

create or replace function public.claim_avantiqo_local_compute_jobs(
  p_node_id text,
  p_node_token text,
  p_capabilities text[],
  p_limit integer default 1,
  p_lease_seconds integer default 300
)
returns setof public.avantiqo_local_compute_jobs
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 1), 4));
  v_lease integer := greatest(30, least(coalesce(p_lease_seconds, 300), 900));
begin
  if not public.avantiqo_local_node_authorized(p_node_id, p_node_token) then
    raise exception 'AVANTIQO_LOCAL_NODE_UNAUTHORIZED';
  end if;

  update public.avantiqo_local_compute_nodes
  set last_seen_at = now(), updated_at = now(), capabilities = coalesce(p_capabilities, capabilities)
  where id = btrim(p_node_id);

  return query
  with candidates as (
    select j.id
    from public.avantiqo_local_compute_jobs j
    where (
      (j.status = 'QUEUED' and j.available_at <= now())
      or
      (j.status = 'RUNNING' and j.leased_until is not null and j.leased_until <= now() and j.attempts < j.max_attempts)
    )
      and (coalesce(array_length(p_capabilities, 1), 0) = 0 or j.capability = any(p_capabilities))
    order by j.priority desc, j.created_at asc
    for update skip locked
    limit v_limit
  )
  update public.avantiqo_local_compute_jobs j
  set
    status = 'RUNNING',
    node_id = btrim(p_node_id),
    attempts = j.attempts + 1,
    started_at = coalesce(j.started_at, now()),
    leased_until = now() + make_interval(secs => v_lease),
    updated_at = now(),
    error_code = null
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

create or replace function public.heartbeat_avantiqo_local_compute_node(
  p_node_id text,
  p_node_token text,
  p_capabilities text[],
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.avantiqo_local_node_authorized(p_node_id, p_node_token) then
    raise exception 'AVANTIQO_LOCAL_NODE_UNAUTHORIZED';
  end if;
  update public.avantiqo_local_compute_nodes
  set last_seen_at = now(), updated_at = now(), capabilities = coalesce(p_capabilities, capabilities), metadata = coalesce(p_metadata, metadata)
  where id = btrim(p_node_id);
  return found;
end;
$$;

create or replace function public.complete_avantiqo_local_compute_job(
  p_node_id text,
  p_node_token text,
  p_job_id uuid,
  p_result jsonb,
  p_metrics jsonb default '{}'::jsonb
)
returns public.avantiqo_local_compute_jobs
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_job public.avantiqo_local_compute_jobs;
begin
  if not public.avantiqo_local_node_authorized(p_node_id, p_node_token) then
    raise exception 'AVANTIQO_LOCAL_NODE_UNAUTHORIZED';
  end if;
  update public.avantiqo_local_compute_jobs
  set
    status = 'COMPLETED',
    result = coalesce(p_result, '{}'::jsonb),
    metrics = coalesce(p_metrics, '{}'::jsonb),
    payload = '{}'::jsonb,
    completed_at = now(),
    leased_until = null,
    error_code = null,
    updated_at = now()
  where id = p_job_id
    and status = 'RUNNING'
    and node_id = btrim(p_node_id)
  returning * into v_job;
  if v_job.id is null then
    raise exception 'AVANTIQO_LOCAL_JOB_NOT_OWNED_OR_RUNNING';
  end if;
  return v_job;
end;
$$;

create or replace function public.fail_avantiqo_local_compute_job(
  p_node_id text,
  p_node_token text,
  p_job_id uuid,
  p_error_code text,
  p_retryable boolean default true
)
returns public.avantiqo_local_compute_jobs
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_job public.avantiqo_local_compute_jobs;
begin
  if not public.avantiqo_local_node_authorized(p_node_id, p_node_token) then
    raise exception 'AVANTIQO_LOCAL_NODE_UNAUTHORIZED';
  end if;

  update public.avantiqo_local_compute_jobs
  set
    status = case when p_retryable and attempts < max_attempts then 'QUEUED' else 'FAILED' end,
    available_at = case when p_retryable and attempts < max_attempts then now() + interval '5 seconds' else available_at end,
    payload = case when p_retryable and attempts < max_attempts then payload else '{}'::jsonb end,
    leased_until = null,
    completed_at = case when p_retryable and attempts < max_attempts then null else now() end,
    error_code = left(coalesce(nullif(btrim(p_error_code), ''), 'AVANTIQO_LOCAL_JOB_FAILED'), 500),
    updated_at = now()
  where id = p_job_id
    and status = 'RUNNING'
    and node_id = btrim(p_node_id)
  returning * into v_job;
  if v_job.id is null then
    raise exception 'AVANTIQO_LOCAL_JOB_NOT_OWNED_OR_RUNNING';
  end if;
  return v_job;
end;
$$;

revoke all on function public.avantiqo_local_node_authorized(text, text) from public, anon, authenticated;
revoke all on function public.claim_avantiqo_local_compute_jobs(text, text, text[], integer, integer) from public;
revoke all on function public.heartbeat_avantiqo_local_compute_node(text, text, text[], jsonb) from public;
revoke all on function public.complete_avantiqo_local_compute_job(text, text, uuid, jsonb, jsonb) from public;
revoke all on function public.fail_avantiqo_local_compute_job(text, text, uuid, text, boolean) from public;
grant execute on function public.claim_avantiqo_local_compute_jobs(text, text, text[], integer, integer) to anon, authenticated, service_role;
grant execute on function public.heartbeat_avantiqo_local_compute_node(text, text, text[], jsonb) to anon, authenticated, service_role;
grant execute on function public.complete_avantiqo_local_compute_job(text, text, uuid, jsonb, jsonb) to anon, authenticated, service_role;
grant execute on function public.fail_avantiqo_local_compute_job(text, text, uuid, text, boolean) to anon, authenticated, service_role;

comment on table public.avantiqo_local_compute_jobs is 'Durable Avantiqo-owned local compute queue. Payload is purged on terminal settlement.';
comment on function public.claim_avantiqo_local_compute_jobs(text, text, text[], integer, integer) is 'Claims bounded local compute work for an authenticated Avantiqo node using SKIP LOCKED leases.';
