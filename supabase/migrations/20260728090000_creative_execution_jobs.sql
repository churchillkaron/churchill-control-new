begin;

create table if not exists public.creative_execution_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  creative_project_id uuid,
  job_type text not null,
  idempotency_key text not null,
  status text not null default 'QUEUED',
  priority integer not null default 100,
  payload jsonb not null default '{}'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  result jsonb,
  error jsonb,
  attempt_count integer not null default 0,
  maximum_attempts integer not null default 20,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creative_execution_jobs_status_check check (
    status in ('QUEUED', 'RUNNING', 'RETRY', 'COMPLETED', 'FAILED', 'CANCELLED')
  ),
  constraint creative_execution_jobs_attempts_check check (
    attempt_count >= 0 and maximum_attempts > 0
  ),
  constraint creative_execution_jobs_identity_unique unique (
    organization_id,
    idempotency_key
  )
);

create index if not exists creative_execution_jobs_claim_idx
  on public.creative_execution_jobs (
    status,
    next_attempt_at,
    priority,
    created_at
  );

create index if not exists creative_execution_jobs_project_idx
  on public.creative_execution_jobs (
    organization_id,
    creative_project_id,
    created_at desc
  );

alter table public.creative_execution_jobs enable row level security;

revoke all on public.creative_execution_jobs from anon, authenticated;
grant all on public.creative_execution_jobs to service_role;

create or replace function public.requeue_expired_creative_execution_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.creative_execution_jobs
  set
    status = case
      when attempt_count >= maximum_attempts then 'FAILED'
      else 'RETRY'
    end,
    error = coalesce(error, '{}'::jsonb) || jsonb_build_object(
      'code', 'EXECUTION_LEASE_EXPIRED',
      'recovered_at', now()
    ),
    next_attempt_at = case
      when attempt_count >= maximum_attempts then next_attempt_at
      else now()
    end,
    lease_token = null,
    lease_owner = null,
    lease_expires_at = null,
    completed_at = case
      when attempt_count >= maximum_attempts then now()
      else completed_at
    end,
    updated_at = now()
  where status = 'RUNNING'
    and lease_expires_at is not null
    and lease_expires_at <= now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.claim_creative_execution_job(
  p_worker_id text,
  p_job_types text[] default null,
  p_lease_seconds integer default 120
)
returns public.creative_execution_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.creative_execution_jobs;
begin
  if coalesce(trim(p_worker_id), '') = '' then
    raise exception 'worker id required';
  end if;

  perform public.requeue_expired_creative_execution_jobs();

  select *
  into claimed
  from public.creative_execution_jobs
  where status in ('QUEUED', 'RETRY')
    and next_attempt_at <= now()
    and attempt_count < maximum_attempts
    and (
      p_job_types is null
      or cardinality(p_job_types) = 0
      or job_type = any(p_job_types)
    )
  order by priority asc, created_at asc
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.creative_execution_jobs
  set
    status = 'RUNNING',
    attempt_count = attempt_count + 1,
    lease_token = gen_random_uuid(),
    lease_owner = p_worker_id,
    lease_expires_at = now() + make_interval(
      secs => greatest(30, least(coalesce(p_lease_seconds, 120), 3600))
    ),
    started_at = coalesce(started_at, now()),
    updated_at = now()
  where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$$;

create or replace function public.heartbeat_creative_execution_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_progress jsonb default '{}'::jsonb,
  p_lease_seconds integer default 120
)
returns public.creative_execution_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_job public.creative_execution_jobs;
begin
  update public.creative_execution_jobs
  set
    progress = coalesce(progress, '{}'::jsonb) || coalesce(p_progress, '{}'::jsonb),
    lease_expires_at = now() + make_interval(
      secs => greatest(30, least(coalesce(p_lease_seconds, 120), 3600))
    ),
    updated_at = now()
  where id = p_job_id
    and status = 'RUNNING'
    and lease_token = p_lease_token
    and lease_expires_at > now()
  returning * into updated_job;

  if not found then
    raise exception 'CREATIVE_EXECUTION_JOB_LEASE_INVALID';
  end if;

  return updated_job;
end;
$$;

create or replace function public.yield_creative_execution_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_progress jsonb default '{}'::jsonb,
  p_delay_seconds integer default 0
)
returns public.creative_execution_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_job public.creative_execution_jobs;
begin
  update public.creative_execution_jobs
  set
    status = 'QUEUED',
    progress = coalesce(progress, '{}'::jsonb) || coalesce(p_progress, '{}'::jsonb),
    next_attempt_at = now() + make_interval(
      secs => greatest(0, least(coalesce(p_delay_seconds, 0), 86400))
    ),
    lease_token = null,
    lease_owner = null,
    lease_expires_at = null,
    updated_at = now()
  where id = p_job_id
    and status = 'RUNNING'
    and lease_token = p_lease_token
  returning * into updated_job;

  if not found then
    raise exception 'CREATIVE_EXECUTION_JOB_LEASE_INVALID';
  end if;

  return updated_job;
end;
$$;

create or replace function public.complete_creative_execution_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_result jsonb default '{}'::jsonb,
  p_progress jsonb default '{}'::jsonb
)
returns public.creative_execution_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_job public.creative_execution_jobs;
begin
  update public.creative_execution_jobs
  set
    status = 'COMPLETED',
    result = coalesce(p_result, '{}'::jsonb),
    progress = coalesce(progress, '{}'::jsonb) || coalesce(p_progress, '{}'::jsonb),
    error = null,
    completed_at = now(),
    lease_token = null,
    lease_owner = null,
    lease_expires_at = null,
    updated_at = now()
  where id = p_job_id
    and status = 'RUNNING'
    and lease_token = p_lease_token
  returning * into updated_job;

  if not found then
    raise exception 'CREATIVE_EXECUTION_JOB_LEASE_INVALID';
  end if;

  return updated_job;
end;
$$;

create or replace function public.retry_creative_execution_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error jsonb default '{}'::jsonb,
  p_progress jsonb default '{}'::jsonb,
  p_delay_seconds integer default 30
)
returns public.creative_execution_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_job public.creative_execution_jobs;
begin
  update public.creative_execution_jobs
  set
    status = case
      when attempt_count >= maximum_attempts then 'FAILED'
      else 'RETRY'
    end,
    error = coalesce(p_error, '{}'::jsonb),
    progress = coalesce(progress, '{}'::jsonb) || coalesce(p_progress, '{}'::jsonb),
    next_attempt_at = case
      when attempt_count >= maximum_attempts then next_attempt_at
      else now() + make_interval(
        secs => greatest(0, least(coalesce(p_delay_seconds, 30), 86400))
      )
    end,
    completed_at = case
      when attempt_count >= maximum_attempts then now()
      else completed_at
    end,
    lease_token = null,
    lease_owner = null,
    lease_expires_at = null,
    updated_at = now()
  where id = p_job_id
    and status = 'RUNNING'
    and lease_token = p_lease_token
  returning * into updated_job;

  if not found then
    raise exception 'CREATIVE_EXECUTION_JOB_LEASE_INVALID';
  end if;

  return updated_job;
end;
$$;

revoke all on function public.requeue_expired_creative_execution_jobs() from public;
revoke all on function public.claim_creative_execution_job(text, text[], integer) from public;
revoke all on function public.heartbeat_creative_execution_job(uuid, uuid, jsonb, integer) from public;
revoke all on function public.yield_creative_execution_job(uuid, uuid, jsonb, integer) from public;
revoke all on function public.complete_creative_execution_job(uuid, uuid, jsonb, jsonb) from public;
revoke all on function public.retry_creative_execution_job(uuid, uuid, jsonb, jsonb, integer) from public;

grant execute on function public.requeue_expired_creative_execution_jobs() to service_role;
grant execute on function public.claim_creative_execution_job(text, text[], integer) to service_role;
grant execute on function public.heartbeat_creative_execution_job(uuid, uuid, jsonb, integer) to service_role;
grant execute on function public.yield_creative_execution_job(uuid, uuid, jsonb, integer) to service_role;
grant execute on function public.complete_creative_execution_job(uuid, uuid, jsonb, jsonb) to service_role;
grant execute on function public.retry_creative_execution_job(uuid, uuid, jsonb, jsonb, integer) to service_role;

notify pgrst, 'reload schema';

commit;
