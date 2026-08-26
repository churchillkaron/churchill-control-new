begin;

create or replace function public.claim_secretary_job(
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns setof public.secretary_jobs
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_token uuid := gen_random_uuid();
begin
  if nullif(btrim(coalesce(p_worker_id, '')), '') is null then
    raise exception 'SECRETARY_JOB_WORKER_REQUIRED' using errcode = '22023';
  end if;

  select id into v_id
  from public.secretary_jobs
  where status in ('QUEUED','PLANNING','ACTIVE','WAITING')
    and attempt_count < max_attempts
    and (next_action_at is null or next_action_at <= now())
    and (lease_expires_at is null or lease_expires_at <= now())
  order by coalesce(next_action_at, created_at) asc, created_at asc
  for update skip locked
  limit 1;

  if v_id is null then
    return;
  end if;

  return query
  update public.secretary_jobs
  set status = case when status = 'QUEUED' then 'PLANNING' else 'ACTIVE' end,
      attempt_count = case when status = 'WAITING' then attempt_count else attempt_count + 1 end,
      lease_token = v_token,
      lease_expires_at = now() + make_interval(secs => greatest(60, least(coalesce(p_lease_seconds, 300), 900))),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('worker_id', p_worker_id),
      last_error = null,
      updated_at = now()
  where id = v_id
  returning *;
end;
$$;

revoke all on function public.claim_secretary_job(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_secretary_job(text, integer)
  to service_role;

comment on function public.claim_secretary_job(text, integer) is
  'Claims one due Secretary job with SKIP LOCKED. Healthy WAITING wake-ups do not consume failure/execution retry budget, allowing human response windows to span days.';

commit;
