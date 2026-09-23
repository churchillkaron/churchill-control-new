create or replace function public.extend_avantiqo_local_compute_job_lease(
  p_node_id text,
  p_node_token text,
  p_job_id uuid,
  p_lease_seconds integer default 900,
  p_progress jsonb default '{}'::jsonb
)
returns public.avantiqo_local_compute_jobs
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_job public.avantiqo_local_compute_jobs;
  v_lease integer := greatest(60, least(coalesce(p_lease_seconds, 900), 3600));
begin
  if not public.avantiqo_local_node_authorized(p_node_id, p_node_token) then
    raise exception 'AVANTIQO_LOCAL_NODE_UNAUTHORIZED';
  end if;
  if octet_length(coalesce(p_progress, '{}'::jsonb)::text) > 32768 then
    raise exception 'AVANTIQO_LOCAL_TRAINING_PROGRESS_TOO_LARGE';
  end if;
  update public.avantiqo_local_compute_jobs
  set
    leased_until = now() + make_interval(secs => v_lease),
    metrics = coalesce(metrics, '{}'::jsonb) || jsonb_build_object('progress', coalesce(p_progress, '{}'::jsonb)),
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

revoke all on function public.extend_avantiqo_local_compute_job_lease(text,text,uuid,integer,jsonb) from public;
grant execute on function public.extend_avantiqo_local_compute_job_lease(text,text,uuid,integer,jsonb) to anon, authenticated, service_role;
comment on function public.extend_avantiqo_local_compute_job_lease(text,text,uuid,integer,jsonb)
is 'Renews an owned local compute job lease for bounded long-running workloads such as local model training.';
