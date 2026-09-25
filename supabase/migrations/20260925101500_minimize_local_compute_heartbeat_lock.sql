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
  v_lane text;
  v_lane_attestation jsonb;
  v_lane_patch jsonb := '{}'::jsonb;
begin
  if not public.avantiqo_local_node_authorized(p_node_id, p_node_token) then
    raise exception 'AVANTIQO_LOCAL_NODE_UNAUTHORIZED';
  end if;
  if p_capabilities is null or cardinality(p_capabilities) < 1 or cardinality(p_capabilities) > 128 then
    raise exception 'AVANTIQO_LOCAL_NODE_CAPABILITIES_INVALID';
  end if;
  if exists (
    select 1
    from unnest(p_capabilities) c
    where length(btrim(c)) < 1 or length(btrim(c)) > 128
  ) then
    raise exception 'AVANTIQO_LOCAL_NODE_CAPABILITY_INVALID';
  end if;

  select array_agg(capability order by capability)
  into v_capabilities
  from (
    select distinct btrim(c) as capability
    from unnest(p_capabilities) c
  ) normalized;

  if octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 65536 then
    raise exception 'AVANTIQO_LOCAL_NODE_METADATA_TOO_LARGE';
  end if;

  v_lane := lower(btrim(coalesce(p_metadata->>'heartbeat_source_lane', '')));
  if v_lane <> '' and v_lane !~ '^[a-z0-9_-]{1,32}$' then
    raise exception 'AVANTIQO_LOCAL_NODE_HEARTBEAT_LANE_INVALID';
  end if;

  if v_lane <> '' then
    v_lane_attestation := jsonb_strip_nulls(jsonb_build_object(
      'lane', v_lane,
      'observed_at', now(),
      'worker_contract', nullif(btrim(coalesce(p_metadata->>'worker_contract', '')), ''),
      'worker_source_sha256', nullif(lower(btrim(coalesce(p_metadata->>'worker_source_sha256', ''))), ''),
      'worker', nullif(btrim(coalesce(p_metadata->>'worker', '')), ''),
      'model', nullif(btrim(coalesce(p_metadata->>'model', '')), ''),
      'local_context_tokens', p_metadata->'local_context_tokens'
    ));
    v_lane_patch := jsonb_build_object(v_lane, v_lane_attestation);
  end if;

  update public.avantiqo_local_compute_nodes
  set last_seen_at = now(),
      updated_at = now(),
      capabilities = v_capabilities,
      metadata =
        coalesce(metadata, '{}'::jsonb)
        || coalesce(p_metadata, '{}'::jsonb)
        || jsonb_build_object(
          'lane_attestations',
          coalesce(metadata->'lane_attestations', '{}'::jsonb) || v_lane_patch
        )
  where id = btrim(p_node_id);

  return found;
end;
$$;

revoke all on function public.heartbeat_avantiqo_local_compute_node(text, text, text[], jsonb) from public;
grant execute on function public.heartbeat_avantiqo_local_compute_node(text, text, text[], jsonb) to anon, authenticated, service_role;

comment on function public.heartbeat_avantiqo_local_compute_node(text, text, text[], jsonb)
is 'Authenticated Node01 heartbeat; performs one short atomic row update and preserves durable per-lane worker attestations without a pre-read row lock.';
