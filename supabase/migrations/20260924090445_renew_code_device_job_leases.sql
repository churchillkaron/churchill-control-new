create or replace function public.claim_avantiqo_code_device_jobs(
  p_device_id uuid,
  p_device_token text,
  p_limit integer default 1,
  p_lease_seconds integer default 1800
)
returns setof public.avantiqo_code_device_jobs
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 1), 1));
  v_lease integer := greatest(60, least(coalesce(p_lease_seconds, 1800), 1800));
begin
  if not public.avantiqo_code_device_authorized(p_device_id, p_device_token) then
    raise exception 'AVANTIQO_CODE_DEVICE_UNAUTHORIZED';
  end if;

  update public.avantiqo_code_devices
  set last_seen_at = now(),
      updated_at = now()
  where id = p_device_id;

  return query
  with candidates as (
    select j.id
    from public.avantiqo_code_device_jobs j
    where j.device_id = p_device_id
      and (
        (j.status = 'QUEUED' and j.available_at <= now())
        or (
          j.status = 'RUNNING'
          and j.leased_until <= now()
          and j.attempts < j.max_attempts
        )
      )
    order by j.priority desc, j.created_at asc
    for update skip locked
    limit v_limit
  )
  update public.avantiqo_code_device_jobs j
  set status = 'RUNNING',
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

create or replace function public.renew_avantiqo_code_device_job_lease(
  p_device_id uuid,
  p_device_token text,
  p_job_id uuid,
  p_lease_seconds integer default 1800
)
returns public.avantiqo_code_device_jobs
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_job public.avantiqo_code_device_jobs;
  v_lease integer := greatest(60, least(coalesce(p_lease_seconds, 1800), 1800));
begin
  if not public.avantiqo_code_device_authorized(p_device_id, p_device_token) then
    raise exception 'AVANTIQO_CODE_DEVICE_UNAUTHORIZED';
  end if;

  update public.avantiqo_code_device_jobs
  set leased_until = now() + make_interval(secs => v_lease),
      updated_at = now()
  where id = p_job_id
    and device_id = p_device_id
    and status = 'RUNNING'
  returning * into v_job;

  if v_job.id is null then
    raise exception 'AVANTIQO_CODE_DEVICE_JOB_NOT_OWNED_OR_RUNNING';
  end if;

  return v_job;
end;
$$;

revoke all on function public.claim_avantiqo_code_device_jobs(uuid, text, integer, integer) from public;
revoke all on function public.renew_avantiqo_code_device_job_lease(uuid, text, uuid, integer) from public;

grant execute on function public.claim_avantiqo_code_device_jobs(uuid, text, integer, integer)
to anon, authenticated, service_role;
grant execute on function public.renew_avantiqo_code_device_job_lease(uuid, text, uuid, integer)
to anon, authenticated, service_role;

comment on function public.claim_avantiqo_code_device_jobs(uuid, text, integer, integer)
is 'Claims exactly one Code device job with a bounded 30-minute renewable lease.';
comment on function public.renew_avantiqo_code_device_job_lease(uuid, text, uuid, integer)
is 'Renews the exclusive lease for one running Code device job so long verification commands cannot be reclaimed concurrently.';
