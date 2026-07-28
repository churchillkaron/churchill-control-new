begin;

create or replace function public.claim_creative_execution_step_v2(
  p_job_id uuid,
  p_job_lease_token uuid,
  p_requested_step_lease_token uuid,
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
  if p_requested_step_lease_token is null then
    raise exception 'requested step lease token required';
  end if;

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
        'recovered_at', now(),
        'retry_same_frame', false
      ),
      provider_call_count = greatest(provider_call_count, 1),
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
    lease_token = p_requested_step_lease_token,
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

revoke all on function public.claim_creative_execution_step_v2(uuid, uuid, uuid, text, text, text, jsonb, integer) from public;
grant execute on function public.claim_creative_execution_step_v2(uuid, uuid, uuid, text, text, text, jsonb, integer) to service_role;

notify pgrst, 'reload schema';

commit;
