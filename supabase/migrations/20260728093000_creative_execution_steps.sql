begin;

create table if not exists public.creative_execution_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  creative_project_id uuid,
  job_id uuid not null references public.creative_execution_jobs(id) on delete cascade,
  step_key text not null,
  step_type text not null,
  status text not null default 'PENDING',
  input_fingerprint text not null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error jsonb,
  usage_ids jsonb not null default '[]'::jsonb,
  provider_call_count integer not null default 0,
  attempt_count integer not null default 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creative_execution_steps_status_check check (
    status in ('PENDING', 'RUNNING', 'COMPLETED', 'AMBIGUOUS', 'FAILED')
  ),
  constraint creative_execution_steps_counts_check check (
    provider_call_count >= 0 and attempt_count >= 0
  ),
  constraint creative_execution_steps_identity_unique unique (
    job_id,
    step_key
  )
);

create index if not exists creative_execution_steps_job_idx
  on public.creative_execution_steps (job_id, created_at asc);

create index if not exists creative_execution_steps_project_idx
  on public.creative_execution_steps (
    organization_id,
    creative_project_id,
    status,
    created_at asc
  );

alter table public.creative_execution_steps enable row level security;

revoke all on public.creative_execution_steps from anon, authenticated;
grant all on public.creative_execution_steps to service_role;

create or replace function public.claim_creative_execution_step(
  p_job_id uuid,
  p_job_lease_token uuid,
  p_step_key text,
  p_step_type text,
  p_input_fingerprint text,
  p_payload jsonb default '{}'::jsonb,
  p_lease_seconds integer default 300
)
returns public.creative_execution_steps
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_job public.creative_execution_jobs;
  claimed public.creative_execution_steps;
begin
  select * into parent_job
  from public.creative_execution_jobs
  where id = p_job_id
  for update;

  if not found
    or parent_job.status <> 'RUNNING'
    or parent_job.lease_token is distinct from p_job_lease_token
    or parent_job.lease_expires_at is null
    or parent_job.lease_expires_at <= now()
  then
    raise exception 'CREATIVE_EXECUTION_JOB_LEASE_INVALID';
  end if;

  if coalesce(trim(p_step_key), '') = '' then
    raise exception 'step key required';
  end if;
  if coalesce(trim(p_step_type), '') = '' then
    raise exception 'step type required';
  end if;
  if coalesce(trim(p_input_fingerprint), '') = '' then
    raise exception 'input fingerprint required';
  end if;

  insert into public.creative_execution_steps (
    organization_id,
    creative_project_id,
    job_id,
    step_key,
    step_type,
    status,
    input_fingerprint,
    payload
  ) values (
    parent_job.organization_id,
    parent_job.creative_project_id,
    parent_job.id,
    p_step_key,
    p_step_type,
    'PENDING',
    p_input_fingerprint,
    coalesce(p_payload, '{}'::jsonb)
  )
  on conflict (job_id, step_key) do nothing;

  select * into claimed
  from public.creative_execution_steps
  where job_id = p_job_id
    and step_key = p_step_key
  for update;

  if claimed.input_fingerprint <> p_input_fingerprint then
    raise exception 'CREATIVE_EXECUTION_STEP_INPUT_MISMATCH';
  end if;

  if claimed.status in ('COMPLETED', 'AMBIGUOUS') then
    return claimed;
  end if;

  if claimed.status = 'RUNNING' then
    if claimed.lease_expires_at is not null
      and claimed.lease_expires_at > now()
    then
      return claimed;
    end if;

    update public.creative_execution_steps
    set
      status = 'AMBIGUOUS',
      error = coalesce(error, '{}'::jsonb) || jsonb_build_object(
        'code', 'EXECUTION_STEP_LEASE_EXPIRED',
        'recovered_at', now()
      ),
      lease_token = null,
      lease_expires_at = null,
      completed_at = now(),
      updated_at = now()
    where id = claimed.id
    returning * into claimed;

    return claimed;
  end if;

  update public.creative_execution_steps
  set
    status = 'RUNNING',
    attempt_count = attempt_count + 1,
    lease_token = gen_random_uuid(),
    lease_expires_at = now() + make_interval(
      secs => greatest(30, least(coalesce(p_lease_seconds, 300), 3600))
    ),
    started_at = coalesce(started_at, now()),
    payload = coalesce(payload, '{}'::jsonb) || coalesce(p_payload, '{}'::jsonb),
    updated_at = now()
  where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$$;

create or replace function public.complete_creative_execution_step(
  p_step_id uuid,
  p_step_lease_token uuid,
  p_result jsonb default '{}'::jsonb,
  p_usage_ids jsonb default '[]'::jsonb,
  p_provider_call_count integer default 0
)
returns public.creative_execution_steps
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_step public.creative_execution_steps;
begin
  update public.creative_execution_steps
  set
    status = 'COMPLETED',
    result = coalesce(p_result, '{}'::jsonb),
    error = null,
    usage_ids = coalesce(p_usage_ids, '[]'::jsonb),
    provider_call_count = greatest(0, coalesce(p_provider_call_count, 0)),
    completed_at = now(),
    lease_token = null,
    lease_expires_at = null,
    updated_at = now()
  where id = p_step_id
    and status = 'RUNNING'
    and lease_token = p_step_lease_token
  returning * into updated_step;

  if not found then
    raise exception 'CREATIVE_EXECUTION_STEP_LEASE_INVALID';
  end if;

  return updated_step;
end;
$$;

create or replace function public.mark_creative_execution_step_ambiguous(
  p_step_id uuid,
  p_step_lease_token uuid,
  p_result jsonb default '{}'::jsonb,
  p_error jsonb default '{}'::jsonb,
  p_usage_ids jsonb default '[]'::jsonb,
  p_provider_call_count integer default 0
)
returns public.creative_execution_steps
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_step public.creative_execution_steps;
begin
  update public.creative_execution_steps
  set
    status = 'AMBIGUOUS',
    result = coalesce(p_result, '{}'::jsonb),
    error = coalesce(p_error, '{}'::jsonb),
    usage_ids = coalesce(p_usage_ids, '[]'::jsonb),
    provider_call_count = greatest(0, coalesce(p_provider_call_count, 0)),
    completed_at = now(),
    lease_token = null,
    lease_expires_at = null,
    updated_at = now()
  where id = p_step_id
    and (
      (status = 'RUNNING' and lease_token = p_step_lease_token)
      or status = 'AMBIGUOUS'
    )
  returning * into updated_step;

  if not found then
    raise exception 'CREATIVE_EXECUTION_STEP_LEASE_INVALID';
  end if;

  return updated_step;
end;
$$;

create or replace function public.fail_creative_execution_step(
  p_step_id uuid,
  p_step_lease_token uuid,
  p_error jsonb default '{}'::jsonb
)
returns public.creative_execution_steps
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_step public.creative_execution_steps;
begin
  update public.creative_execution_steps
  set
    status = 'FAILED',
    error = coalesce(p_error, '{}'::jsonb),
    lease_token = null,
    lease_expires_at = null,
    updated_at = now()
  where id = p_step_id
    and status = 'RUNNING'
    and lease_token = p_step_lease_token
  returning * into updated_step;

  if not found then
    raise exception 'CREATIVE_EXECUTION_STEP_LEASE_INVALID';
  end if;

  return updated_step;
end;
$$;

revoke all on function public.claim_creative_execution_step(uuid, uuid, text, text, text, jsonb, integer) from public;
revoke all on function public.complete_creative_execution_step(uuid, uuid, jsonb, jsonb, integer) from public;
revoke all on function public.mark_creative_execution_step_ambiguous(uuid, uuid, jsonb, jsonb, jsonb, integer) from public;
revoke all on function public.fail_creative_execution_step(uuid, uuid, jsonb) from public;

grant execute on function public.claim_creative_execution_step(uuid, uuid, text, text, text, jsonb, integer) to service_role;
grant execute on function public.complete_creative_execution_step(uuid, uuid, jsonb, jsonb, integer) to service_role;
grant execute on function public.mark_creative_execution_step_ambiguous(uuid, uuid, jsonb, jsonb, jsonb, integer) to service_role;
grant execute on function public.fail_creative_execution_step(uuid, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';

commit;
