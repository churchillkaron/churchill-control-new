pwd
te or replace function public.renew_avantiqo_local_compute_job_lease(
  p_node_id text,
  p_node_token text,
  p_job_id uuid,
  p_lease_seconds integer default 900
)
returns public.avantiqo_local_compute_jobs
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_job public.avantiqo_local_compute_jobs;
  v_lease integer := greatest(60, least(coalesce(p_lease_seconds, 900), 1800));
begin
  if not public.avantiqo_local_node_authorized(p_node_id, p_node_token) then
    raise exception 'AVANTIQO_LOCAL_NODE_UNAUTHORIZED';
  end if;

  update public.avantiqo_local_compute_jobs
  set leased_until = now() + make_interval(secs => v_lease),
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
$function$;

revoke all on function public.renew_avantiqo_local_compute_job_lease(text,text,uuid,integer) from public;
grant execute on function public.renew_avantiqo_local_compute_job_lease(text,text,uuid,integer) to anon;
grant execute on function public.renew_avantiqo_local_compute_job_lease(text,text,uuid,integer) to authenticated;
grant execute on function public.renew_avantiqo_local_compute_job_lease(text,text,uuid,integer) to service_role;
