create or replace function public.claim_avantiqo_local_compute_jobs(
  p_node_id text,
  p_node_token text,
  p_capabilities text[],
  p_limit integer default 1,
  p_lease_seconds integer default 300
)
returns setof public.avantiqo_local_compute_jobs
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 1), 4));
  v_lease integer := greatest(30, least(coalesce(p_lease_seconds, 300), 900));
  v_registered_capabilities text[];
begin
  if not public.avantiqo_local_node_authorized(p_node_id, p_node_token) then
    raise exception 'AVANTIQO_LOCAL_NODE_UNAUTHORIZED';
  end if;

  select capabilities into v_registered_capabilities
  from public.avantiqo_local_compute_nodes
  where id = btrim(p_node_id) and enabled = true;

  update public.avantiqo_local_compute_nodes
  set last_seen_at = now(), updated_at = now()
  where id = btrim(p_node_id);

  return query
  with requested as (
    select unnest(coalesce(p_capabilities, '{}'::text[])) as capability
  ), allowed as (
    select r.capability
    from requested r
    where r.capability = any(coalesce(v_registered_capabilities, '{}'::text[]))
  ), candidates as (
    select j.id
    from public.avantiqo_local_compute_jobs j
    where (
      (j.status = 'QUEUED' and j.available_at <= now())
      or
      (j.status = 'RUNNING' and j.leased_until is not null and j.leased_until <= now() and j.attempts < j.max_attempts)
    )
      and j.capability in (select capability from allowed)
    order by j.priority desc, j.created_at asc
    for update skip locked
    limit v_limit
  )
  update public.avantiqo_local_compute_jobs j
  set status = 'RUNNING', node_id = btrim(p_node_id), attempts = j.attempts + 1,
      started_at = coalesce(j.started_at, now()), leased_until = now() + make_interval(secs => v_lease),
      updated_at = now(), error_code = null
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

create or replace function public.heartbeat_avantiqo_local_compute_node(
  p_node_id text,
  p_node_token text,
  p_capabilities text[],
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not public.avantiqo_local_node_authorized(p_node_id, p_node_token) then
    raise exception 'AVANTIQO_LOCAL_NODE_UNAUTHORIZED';
  end if;
  if octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 65536 then
    raise exception 'AVANTIQO_LOCAL_NODE_METADATA_TOO_LARGE';
  end if;
  update public.avantiqo_local_compute_nodes
  set last_seen_at = now(), updated_at = now(), metadata = coalesce(p_metadata, metadata)
  where id = btrim(p_node_id);
  return found;
end;
$$;

revoke all on function public.claim_avantiqo_local_compute_jobs(text, text, text[], integer, integer) from public;
revoke all on function public.heartbeat_avantiqo_local_compute_node(text, text, text[], jsonb) from public;
grant execute on function public.claim_avantiqo_local_compute_jobs(text, text, text[], integer, integer) to anon, authenticated, service_role;
grant execute on function public.heartbeat_avantiqo_local_compute_node(text, text, text[], jsonb) to anon, authenticated, service_role;
