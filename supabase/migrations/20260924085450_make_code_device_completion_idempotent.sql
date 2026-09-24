create or replace function public.complete_avantiqo_code_device_job(
  p_device_id uuid,
  p_device_token text,
  p_job_id uuid,
  p_result jsonb,
  p_metrics jsonb default '{}'::jsonb
)
returns public.avantiqo_code_device_jobs
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_job public.avantiqo_code_device_jobs;
begin
  if not public.avantiqo_code_device_authorized(p_device_id, p_device_token) then
    raise exception 'AVANTIQO_CODE_DEVICE_UNAUTHORIZED';
  end if;

  update public.avantiqo_code_device_jobs
  set status = 'COMPLETED',
      result = coalesce(p_result, '{}'::jsonb),
      metrics = coalesce(p_metrics, '{}'::jsonb),
      payload = '{}'::jsonb,
      completed_at = now(),
      leased_until = null,
      error_code = null,
      updated_at = now()
  where id = p_job_id
    and device_id = p_device_id
    and status = 'RUNNING'
  returning * into v_job;

  if v_job.id is not null then
    return v_job;
  end if;

  select *
  into v_job
  from public.avantiqo_code_device_jobs
  where id = p_job_id
    and device_id = p_device_id
    and status = 'COMPLETED';

  if v_job.id is null then
    raise exception 'AVANTIQO_CODE_DEVICE_JOB_NOT_OWNED_OR_RUNNING';
  end if;

  if coalesce(v_job.result, '{}'::jsonb) <> coalesce(p_result, '{}'::jsonb) then
    raise exception 'AVANTIQO_CODE_DEVICE_JOB_COMPLETION_RESULT_MISMATCH';
  end if;

  return v_job;
end;
$$;

revoke all on function public.complete_avantiqo_code_device_job(uuid, text, uuid, jsonb, jsonb) from public;
grant execute on function public.complete_avantiqo_code_device_job(uuid, text, uuid, jsonb, jsonb)
to anon, authenticated, service_role;

comment on function public.complete_avantiqo_code_device_job(uuid, text, uuid, jsonb, jsonb)
is 'Completes a device job exactly once and returns the existing completed row on identical acknowledgement replay.';
