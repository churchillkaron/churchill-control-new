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
declare
  v_capabilities text[];
begin
  if not public.avantiqo_local_node_authorized(p_node_id, p_node_token) then
    raise exception 'AVANTIQO_LOCAL_NODE_UNAUTHORIZED';
  end if;
  if p_capabilities is null or cardinality(p_capabilities) < 1 or cardinality(p_capabilities) > 128 then
    raise exception 'AVANTIQO_LOCAL_NODE_CAPABILITIES_INVALID';
  end if;
  if exists (select 1 from unnest(p_capabilities) c where length(btrim(c)) < 1 or length(btrim(c)) > 128) then
    raise exception 'AVANTIQO_LOCAL_NODE_CAPABILITY_INVALID';
  end if;
  select array_agg(capability order by capability)
  into v_capabilities
  from (select distinct btrim(c) as capability from unnest(p_capabilities) c) normalized;
  if octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 65536 then
    raise exception 'AVANTIQO_LOCAL_NODE_METADATA_TOO_LARGE';
  end if;
  update public.avantiqo_local_compute_nodes
  set last_seen_at = now(),
      updated_at = now(),
      capabilities = v_capabilities,
      metadata = coalesce(p_metadata, metadata)
  where id = btrim(p_node_id);
  return found;
end;
$$;

revoke all on function public.heartbeat_avantiqo_local_compute_node(text, text, text[], jsonb) from public;
grant execute on function public.heartbeat_avantiqo_local_compute_node(text, text, text[], jsonb) to anon, authenticated, service_role;

comment on function public.heartbeat_avantiqo_local_compute_node(text, text, text[], jsonb)
is 'Authenticated Node01 heartbeat; atomically refreshes bounded capability advertisement and telemetry metadata.';
