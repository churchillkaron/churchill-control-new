-- AVANTIQO PHASE 45 NO-POLICY EPOCH HARDENING
-- A no-active-policy period is not a timeless state. Bind it to the latest activation
-- generation watermark so an intervening activation/closure can never make stale
-- execution authority appear valid again.

create or replace function public.resolve_avantiqo_policy_activation_interval_v1(
  p_organization_id uuid,
  p_event_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_integrity jsonb;
  v_match_count integer;
  v_generation public.avantiqo_intelligence_policy_activation_generations;
  v_closed_at timestamptz;
  v_watermark_index bigint;
  v_watermark_fingerprint text;
begin
  if p_organization_id is null or p_event_at is null then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_V1',
      'status', 'ORGANIZATION_AND_EVENT_TIME_REQUIRED_FAIL_CLOSED',
      'exact_interval_resolution', false
    );
  end if;

  v_integrity := public.verify_avantiqo_policy_activation_intervals_v1(p_organization_id);
  if coalesce((v_integrity->>'success')::boolean, false) is not true
    or coalesce((v_integrity->>'historical_interval_attribution_allowed')::boolean, false) is not true
  then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_V1',
      'status', 'POLICY_ACTIVATION_INTERVAL_INTEGRITY_FAIL_CLOSED',
      'exact_interval_resolution', false,
      'activation_interval_integrity', v_integrity
    );
  end if;

  select g.activation_generation_index, g.activation_generation_fingerprint
    into v_watermark_index, v_watermark_fingerprint
  from public.avantiqo_intelligence_policy_activation_generations g
  where g.organization_id = p_organization_id
    and g.activated_at <= p_event_at
  order by g.activation_generation_index desc
  limit 1;

  select count(*)::integer into v_match_count
  from public.avantiqo_intelligence_policy_activation_generations g
  left join public.avantiqo_intelligence_policy_activation_closures c
    on c.organization_id = g.organization_id
   and c.activation_generation_fingerprint = g.activation_generation_fingerprint
  where g.organization_id = p_organization_id
    and g.activated_at <= p_event_at
    and (c.closed_at is null or p_event_at < c.closed_at);

  if v_match_count > 1 then
    return jsonb_build_object(
      'success', false,
      'contract', 'AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_V1',
      'status', 'POLICY_ACTIVATION_INTERVAL_AMBIGUOUS_FAIL_CLOSED',
      'exact_interval_resolution', false
    );
  end if;

  if v_match_count = 0 then
    return jsonb_build_object(
      'success', true,
      'contract', 'AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_V1',
      'status', 'NO_PERSISTENT_POLICY_INTERVAL_AT_EVENT',
      'attribution_kind', 'NO_PERSISTENT_POLICY_INTERVAL',
      'persistent_policy_interval_present', false,
      'activation_history_watermark_index', v_watermark_index,
      'activation_history_watermark_fingerprint', v_watermark_fingerprint,
      'event_at', p_event_at,
      'exact_interval_resolution', true
    );
  end if;

  select g.* into v_generation
  from public.avantiqo_intelligence_policy_activation_generations g
  left join public.avantiqo_intelligence_policy_activation_closures c
    on c.organization_id = g.organization_id
   and c.activation_generation_fingerprint = g.activation_generation_fingerprint
  where g.organization_id = p_organization_id
    and g.activated_at <= p_event_at
    and (c.closed_at is null or p_event_at < c.closed_at)
  limit 1;

  select c.closed_at into v_closed_at
  from public.avantiqo_intelligence_policy_activation_generations g
  left join public.avantiqo_intelligence_policy_activation_closures c
    on c.organization_id = g.organization_id
   and c.activation_generation_fingerprint = g.activation_generation_fingerprint
  where g.organization_id = p_organization_id
    and g.activation_generation_fingerprint = v_generation.activation_generation_fingerprint
  limit 1;

  return jsonb_build_object(
    'success', true,
    'contract', 'AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_V1',
    'status', 'PERSISTENT_POLICY_INTERVAL_RESOLVED',
    'attribution_kind', 'PERSISTENT_POLICY_INTERVAL',
    'persistent_policy_interval_present', true,
    'policy_id', v_generation.policy_id,
    'policy_fingerprint', v_generation.policy_fingerprint,
    'activation_generation_index', v_generation.activation_generation_index,
    'activation_generation_fingerprint', v_generation.activation_generation_fingerprint,
    'activation_started_at', v_generation.activated_at,
    'activation_closed_at', v_closed_at,
    'activation_history_watermark_index', v_watermark_index,
    'activation_history_watermark_fingerprint', v_watermark_fingerprint,
    'event_at', p_event_at,
    'exact_interval_resolution', true
  );
end;
$$;

revoke all on function public.resolve_avantiqo_policy_activation_interval_v1(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.resolve_avantiqo_policy_activation_interval_v1(uuid, timestamptz)
  to service_role;

create or replace function public.avantiqo_phase45_binding_metadata_v1(
  p_resolution jsonb,
  p_observed_at timestamptz
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_kind text;
begin
  if coalesce((p_resolution->>'success')::boolean, false) is not true
    or coalesce((p_resolution->>'exact_interval_resolution')::boolean, false) is not true
  then
    raise exception 'AVANTIQO_PHASE45_POLICY_INTERVAL_RESOLUTION_FAILED_CLOSED';
  end if;

  v_kind := btrim(coalesce(p_resolution->>'attribution_kind', ''));
  if v_kind not in ('PERSISTENT_POLICY_INTERVAL', 'NO_PERSISTENT_POLICY_INTERVAL') then
    raise exception 'AVANTIQO_PHASE45_POLICY_INTERVAL_KIND_INVALID_FAIL_CLOSED';
  end if;

  return jsonb_build_object(
    'policy_activation_binding_contract',
      'AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_ATTRIBUTION_V1',
    'policy_activation_resolution_contract',
      'AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_V1',
    'policy_activation_binding_kind', v_kind,
    'policy_activation_binding_persistent_policy_present',
      v_kind = 'PERSISTENT_POLICY_INTERVAL',
    'policy_id', case when v_kind = 'PERSISTENT_POLICY_INTERVAL'
      then p_resolution->>'policy_id' else null end,
    'policy_fingerprint', case when v_kind = 'PERSISTENT_POLICY_INTERVAL'
      then p_resolution->>'policy_fingerprint' else null end,
    'activation_generation_index', case when v_kind = 'PERSISTENT_POLICY_INTERVAL'
      then (p_resolution->>'activation_generation_index')::bigint else null end,
    'activation_generation_fingerprint', case when v_kind = 'PERSISTENT_POLICY_INTERVAL'
      then p_resolution->>'activation_generation_fingerprint' else null end,
    'policy_activation_started_at', case when v_kind = 'PERSISTENT_POLICY_INTERVAL'
      then p_resolution->>'activation_started_at' else null end,
    'policy_activation_closed_at', case when v_kind = 'PERSISTENT_POLICY_INTERVAL'
      then p_resolution->>'activation_closed_at' else null end,
    'policy_activation_history_watermark_index',
      case when nullif(p_resolution->>'activation_history_watermark_index', '') is null
        then null else (p_resolution->>'activation_history_watermark_index')::bigint end,
    'policy_activation_history_watermark_fingerprint',
      nullif(p_resolution->>'activation_history_watermark_fingerprint', ''),
    'policy_activation_binding_observed_at', p_observed_at,
    'policy_activation_binding_exact_interval_resolution', true,
    'policy_activation_binding_is_execution_authority', false,
    'cross_interval_policy_binding_reuse_allowed', false,
    'no_policy_epoch_reentry_allowed', false
  );
end;
$$;

revoke all on function public.avantiqo_phase45_binding_metadata_v1(jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase45_binding_metadata_v1(jsonb, timestamptz)
  to service_role;

create or replace function public.avantiqo_phase45_assert_binding_matches_v1(
  p_metadata jsonb,
  p_resolution jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_kind text;
  v_actual_kind text;
begin
  if coalesce((p_resolution->>'success')::boolean, false) is not true
    or coalesce((p_resolution->>'exact_interval_resolution')::boolean, false) is not true
  then
    return false;
  end if;

  v_kind := btrim(coalesce(p_metadata->>'policy_activation_binding_kind', ''));
  v_actual_kind := btrim(coalesce(p_resolution->>'attribution_kind', ''));
  if v_kind = '' or v_kind <> v_actual_kind then
    return false;
  end if;

  if v_kind = 'NO_PERSISTENT_POLICY_INTERVAL' then
    return nullif(p_metadata->>'policy_id', '') is null
      and nullif(p_metadata->>'policy_fingerprint', '') is null
      and nullif(p_metadata->>'activation_generation_index', '') is null
      and nullif(p_metadata->>'activation_generation_fingerprint', '') is null
      and coalesce(p_metadata->>'policy_activation_history_watermark_index', '')
        = coalesce(p_resolution->>'activation_history_watermark_index', '')
      and lower(btrim(coalesce(p_metadata->>'policy_activation_history_watermark_fingerprint', '')))
        = lower(btrim(coalesce(p_resolution->>'activation_history_watermark_fingerprint', '')))
      and coalesce((p_metadata->>'no_policy_epoch_reentry_allowed')::boolean, true) is false;
  end if;

  if v_kind <> 'PERSISTENT_POLICY_INTERVAL' then
    return false;
  end if;

  return coalesce(p_metadata->>'policy_id', '') = coalesce(p_resolution->>'policy_id', '')
    and lower(btrim(coalesce(p_metadata->>'policy_fingerprint', '')))
      = lower(btrim(coalesce(p_resolution->>'policy_fingerprint', '')))
    and coalesce(p_metadata->>'activation_generation_index', '')
      = coalesce(p_resolution->>'activation_generation_index', '')
    and lower(btrim(coalesce(p_metadata->>'activation_generation_fingerprint', '')))
      = lower(btrim(coalesce(p_resolution->>'activation_generation_fingerprint', '')))
    and coalesce(p_metadata->>'policy_activation_started_at', '')::timestamptz
      = coalesce(p_resolution->>'activation_started_at', '')::timestamptz;
exception when others then
  return false;
end;
$$;

revoke all on function public.avantiqo_phase45_assert_binding_matches_v1(jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase45_assert_binding_matches_v1(jsonb, jsonb)
  to service_role;
