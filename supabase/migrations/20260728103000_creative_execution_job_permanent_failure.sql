begin;

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
  permanent_failure boolean := lower(
    coalesce(coalesce(p_error, '{}'::jsonb)->>'permanent', 'false')
  ) in ('true', '1', 'yes');
begin
  update public.creative_execution_jobs
  set
    status = case
      when permanent_failure or attempt_count >= maximum_attempts then 'FAILED'
      else 'RETRY'
    end,
    error = coalesce(p_error, '{}'::jsonb),
    progress = coalesce(progress, '{}'::jsonb) || coalesce(p_progress, '{}'::jsonb),
    next_attempt_at = case
      when permanent_failure or attempt_count >= maximum_attempts then next_attempt_at
      else now() + make_interval(
        secs => greatest(0, least(coalesce(p_delay_seconds, 30), 86400))
      )
    end,
    completed_at = case
      when permanent_failure or attempt_count >= maximum_attempts then now()
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

revoke all on function public.retry_creative_execution_job(uuid, uuid, jsonb, jsonb, integer) from public;
grant execute on function public.retry_creative_execution_job(uuid, uuid, jsonb, jsonb, integer) to service_role;

notify pgrst, 'reload schema';

commit;
