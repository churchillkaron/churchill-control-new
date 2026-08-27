-- AVANTIQO PHASE 46 STRESS-DISCOVERED REMEDIATION
-- A request can bind an activation interval while it is still open. If its execution
-- completes after that interval closes, the immutable request metadata legitimately
-- carries policy_activation_closed_at = null. Re-resolve the exact historical interval
-- at outcome ingress, reject any conflicting supplied close, and persist the canonical
-- observed closure in the append-only attribution ledger.

create or replace function public.avantiqo_phase45_enforce_outcome_attribution_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_meta jsonb;
  v_kind text;
  v_outcome_fp text;
  v_receipt_fp text;
  v_request_fp text;
  v_selection_fp text;
  v_binding_at timestamptz;
  v_started_at timestamptz;
  v_completed_at timestamptz;
  v_resolved jsonb;
  v_policy_id uuid;
  v_policy_fp text;
  v_generation_index bigint;
  v_generation_fp text;
  v_activation_started_at timestamptz;
  v_activation_closed_at timestamptz;
  v_resolved_activation_closed_at timestamptz;
  v_attribution_fp text;
  v_existing public.avantiqo_intelligence_policy_outcome_attributions;
begin
  if new.memory_scope <> 'platform_learning_experiment_portfolio_outcomes'
    or coalesce(new.metadata->>'contract', '') <> 'AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_V1'
    or coalesce(new.metadata->>'status', '') <> 'OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED'
  then
    return new;
  end if;

  v_meta := coalesce(new.metadata, '{}'::jsonb);
  v_kind := btrim(coalesce(v_meta->>'policy_activation_binding_kind', ''));
  v_outcome_fp := lower(btrim(coalesce(v_meta->>'outcome_fingerprint', '')));
  v_receipt_fp := lower(btrim(coalesce(v_meta->>'execution_receipt_fingerprint', '')));
  v_request_fp := lower(btrim(coalesce(v_meta->>'request_fingerprint', '')));
  v_selection_fp := lower(btrim(coalesce(v_meta->>'selection_fingerprint', '')));

  if v_outcome_fp !~ '^[a-f0-9]{32,128}$'
    or v_receipt_fp !~ '^[a-f0-9]{16,128}$'
    or v_request_fp !~ '^[a-f0-9]{16,128}$'
    or v_selection_fp !~ '^[a-f0-9]{16,128}$'
    or coalesce(v_meta->>'policy_activation_binding_contract', '') <> 'AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_ATTRIBUTION_V1'
    or coalesce(v_meta->>'policy_activation_resolution_contract', '') <> 'AVANTIQO_EXPERIMENT_POLICY_INTERVAL_RESOLUTION_V1'
    or coalesce((v_meta->>'policy_activation_binding_exact_interval_resolution')::boolean, false) is not true
    or coalesce((v_meta->>'cross_interval_policy_binding_reuse_allowed')::boolean, true) is not false
  then
    raise exception 'AVANTIQO_PHASE45_OUTCOME_BINDING_METADATA_INVALID_FAIL_CLOSED';
  end if;

  begin
    v_binding_at := (v_meta->>'policy_activation_binding_observed_at')::timestamptz;
    v_started_at := (v_meta->>'execution_started_at')::timestamptz;
    v_completed_at := (v_meta->>'execution_completed_at')::timestamptz;
  exception when others then
    raise exception 'AVANTIQO_PHASE45_OUTCOME_BINDING_TIMESTAMPS_INVALID_FAIL_CLOSED';
  end;
  if v_binding_at is null or v_started_at is null or v_completed_at is null or v_completed_at < v_started_at then
    raise exception 'AVANTIQO_PHASE45_OUTCOME_BINDING_TIMELINE_INVALID_FAIL_CLOSED';
  end if;

  v_resolved := public.resolve_avantiqo_policy_activation_interval_v1(new.organization_id, v_binding_at);
  if coalesce((v_resolved->>'success')::boolean, false) is not true
    or coalesce((v_resolved->>'exact_interval_resolution')::boolean, false) is not true
    or coalesce(v_resolved->>'attribution_kind', '') <> v_kind
  then
    raise exception 'AVANTIQO_PHASE45_OUTCOME_INTERVAL_RESOLUTION_MISMATCH_FAIL_CLOSED';
  end if;

  if v_kind = 'PERSISTENT_POLICY_INTERVAL' then
    begin
      v_policy_id := (v_meta->>'policy_id')::uuid;
      v_generation_index := (v_meta->>'activation_generation_index')::bigint;
      v_activation_started_at := (v_meta->>'policy_activation_started_at')::timestamptz;
      v_activation_closed_at := nullif(v_meta->>'policy_activation_closed_at', '')::timestamptz;
      v_resolved_activation_closed_at := nullif(v_resolved->>'activation_closed_at', '')::timestamptz;
    exception when others then
      raise exception 'AVANTIQO_PHASE45_OUTCOME_PERSISTENT_BINDING_SHAPE_INVALID_FAIL_CLOSED';
    end;
    v_policy_fp := lower(btrim(coalesce(v_meta->>'policy_fingerprint', '')));
    v_generation_fp := lower(btrim(coalesce(v_meta->>'activation_generation_fingerprint', '')));

    if v_policy_id is null
      or v_policy_fp !~ '^[a-f0-9]{32,128}$'
      or v_generation_index <= 0
      or v_generation_fp !~ '^[a-f0-9]{32,128}$'
      or v_activation_started_at is null
      or coalesce(v_resolved->>'policy_id', '') <> v_policy_id::text
      or coalesce(v_resolved->>'policy_fingerprint', '') <> v_policy_fp
      or (v_resolved->>'activation_generation_index')::bigint <> v_generation_index
      or coalesce(v_resolved->>'activation_generation_fingerprint', '') <> v_generation_fp
      or (v_resolved->>'activation_started_at')::timestamptz <> v_activation_started_at
      or (v_activation_closed_at is not null and v_activation_closed_at is distinct from v_resolved_activation_closed_at)
    then
      raise exception 'AVANTIQO_PHASE45_OUTCOME_PERSISTENT_BINDING_MISMATCH_FAIL_CLOSED';
    end if;

    -- The close time is historical interval state, not part of the authority snapshot.
    -- Canonicalize it from the exact resolver so delayed outcomes remain attributable
    -- to the generation that governed execution without accepting caller fabrication.
    v_activation_closed_at := v_resolved_activation_closed_at;
  elsif v_kind = 'NO_PERSISTENT_POLICY_INTERVAL' then
    if nullif(v_meta->>'policy_id', '') is not null
      or nullif(v_meta->>'policy_fingerprint', '') is not null
      or nullif(v_meta->>'activation_generation_index', '') is not null
      or nullif(v_meta->>'activation_generation_fingerprint', '') is not null
      or nullif(v_meta->>'policy_activation_started_at', '') is not null
      or nullif(v_meta->>'policy_activation_closed_at', '') is not null
    then
      raise exception 'AVANTIQO_PHASE45_OUTCOME_NO_POLICY_BINDING_NOT_NULL_FAIL_CLOSED';
    end if;
  else
    raise exception 'AVANTIQO_PHASE45_OUTCOME_BINDING_KIND_INVALID_FAIL_CLOSED';
  end if;

  v_resolved := public.resolve_avantiqo_policy_activation_interval_v1(new.organization_id, v_started_at);
  if coalesce((v_resolved->>'success')::boolean, false) is not true
    or coalesce(v_resolved->>'attribution_kind', '') <> v_kind
    or (v_kind = 'PERSISTENT_POLICY_INTERVAL' and coalesce(v_resolved->>'activation_generation_fingerprint', '') <> v_generation_fp)
  then
    raise exception 'AVANTIQO_PHASE45_EXECUTION_START_CROSS_INTERVAL_FAIL_CLOSED';
  end if;

  v_attribution_fp := md5(
    'avantiqo-phase45-outcome-attribution-v1|' || new.organization_id::text || '|' || new.id::text || '|' ||
    v_outcome_fp || '|' || v_receipt_fp || '|' || v_request_fp || '|' || v_selection_fp || '|' || v_kind || '|' ||
    coalesce(v_generation_fp, '') || '|' || v_binding_at::text || '|' || v_started_at::text || '|' || v_completed_at::text
  );

  select * into v_existing
  from public.avantiqo_intelligence_policy_outcome_attributions
  where organization_id = new.organization_id and outcome_memory_id = new.id
  limit 1;

  if v_existing.id is not null then
    if v_existing.outcome_fingerprint <> v_outcome_fp
      or v_existing.execution_receipt_fingerprint <> v_receipt_fp
      or v_existing.request_fingerprint <> v_request_fp
      or v_existing.selection_fingerprint <> v_selection_fp
      or v_existing.attribution_kind <> v_kind
      or v_existing.policy_id is distinct from v_policy_id
      or v_existing.policy_fingerprint is distinct from v_policy_fp
      or v_existing.activation_generation_index is distinct from v_generation_index
      or v_existing.activation_generation_fingerprint is distinct from v_generation_fp
      or v_existing.activation_started_at is distinct from v_activation_started_at
      or v_existing.activation_closed_at is distinct from v_activation_closed_at
      or v_existing.binding_observed_at <> v_binding_at
      or v_existing.execution_started_at <> v_started_at
      or v_existing.execution_completed_at <> v_completed_at
      or v_existing.attribution_fingerprint <> v_attribution_fp
    then
      raise exception 'AVANTIQO_PHASE45_OUTCOME_ATTRIBUTION_REPLAY_MISMATCH_FAIL_CLOSED';
    end if;
    return new;
  end if;

  insert into public.avantiqo_intelligence_policy_outcome_attributions (
    organization_id,outcome_memory_id,outcome_fingerprint,execution_receipt_fingerprint,request_fingerprint,
    selection_fingerprint,attribution_kind,policy_id,policy_fingerprint,activation_generation_index,
    activation_generation_fingerprint,activation_started_at,activation_closed_at,binding_observed_at,
    execution_started_at,execution_completed_at,attribution_fingerprint,metadata
  ) values (
    new.organization_id,new.id,v_outcome_fp,v_receipt_fp,v_request_fp,v_selection_fp,v_kind,v_policy_id,v_policy_fp,
    v_generation_index,v_generation_fp,v_activation_started_at,v_activation_closed_at,v_binding_at,v_started_at,
    v_completed_at,v_attribution_fp,
    jsonb_build_object(
      'contract','AVANTIQO_EXPERIMENT_OUTCOME_POLICY_INTERVAL_ATTRIBUTION_V1',
      'atomic_with_outcome_write',true,
      'exact_activation_interval_binding',true,
      'canonical_historical_closure_resolved_at_outcome_ingress',true,
      'open_binding_snapshot_may_gain_observed_historical_closure',true,
      'caller_supplied_historical_closure_is_authority',false,
      'execution_start_same_interval_verified',true,
      'completion_may_follow_interval_closure',true,
      'cross_interval_outcome_reuse_allowed',false,
      'caller_supplied_fingerprint_is_authority',false,
      'execution_authorized',false,
      'provider_execution_authorized',false,
      'spend_authorized',false,
      'platform_knowledge_written',false,
      'automatic_training_started',false,
      'automatic_model_weight_mutation',false
    )
  );
  return new;
end;
$$;

revoke all on function public.avantiqo_phase45_enforce_outcome_attribution_v1()
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase45_enforce_outcome_attribution_v1() to service_role;
