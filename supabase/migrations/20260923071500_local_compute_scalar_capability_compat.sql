create or replace function public.claim_avantiqo_local_compute_jobs(
  p_node_id text,
  p_node_token text,
  p_capabilities text,
  p_limit integer default 1,
  p_lease_seconds integer default 300
)
returns setof public.avantiqo_local_compute_jobs
language sql
security invoker
set search_path = public
as $$
  select *
  from public.claim_avantiqo_local_compute_jobs(
    p_node_id,
    p_node_token,
    array[p_capabilities]::text[],
    p_limit,
    p_lease_seconds
  );
$$;

revoke all on function public.claim_avantiqo_local_compute_jobs(text, text, text, integer, integer) from public;
grant execute on function public.claim_avantiqo_local_compute_jobs(text, text, text, integer, integer) to anon, authenticated, service_role;

comment on function public.claim_avantiqo_local_compute_jobs(text, text, text, integer, integer)
is 'Backward-compatible scalar capability wrapper for local compute workers. Wraps one capability into text[] and delegates to the canonical array RPC.';
