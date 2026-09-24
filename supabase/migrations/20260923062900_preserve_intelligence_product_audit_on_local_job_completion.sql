begin;

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
as $function$
declare
  v_job public.avantiqo_local_compute_jobs;
begin
  if not public.avantiqo_local_node_authorized(p_node_id, p_node_token) then
    raise exception 'AVANTIQO_LOCAL_NODE_UNAUTHORIZED';
  end if;

  update public.avantiqo_local_compute_jobs
  set
    status = 'COMPLETED',
    result = jsonb_strip_nulls(
      coalesce(p_result, '{}'::jsonb)
      || jsonb_build_object(
        'intelligence_product',
          nullif(payload ->> 'intelligence_product', ''),
        'intelligence_contract',
          nullif(payload ->> 'intelligence_contract', ''),
        'interactive_code',
          payload #> '{metadata,interactive_code}'
      )
    ),
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
$function$;

commit;
