-- AVANTIQO PHASE 45 EXECUTION LINEAGE ENFORCEMENT
-- Database-authoritative propagation and stale-generation rejection across
-- request -> approval -> claim -> receipt -> portfolio outcome.

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
    'policy_activation_binding_observed_at', p_observed_at,
    'policy_activation_binding_exact_interval_resolution', true,
    'policy_activation_binding_is_execution_authority', false,
    'cross_interval_policy_binding_reuse_allowed', false
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
      and nullif(p_metadata->>'activation_generation_fingerprint', '') is null;
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

create or replace function public.avantiqo_phase45_enforce_execution_lineage_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_meta jsonb := coalesce(new.metadata, '{}'::jsonb);
  v_source public.intelligence_memories;
  v_request public.intelligence_memories;
  v_receipt public.intelligence_memories;
  v_resolution jsonb;
  v_binding jsonb;
  v_event_at timestamptz;
  v_source_count integer;
  v_request_fp text;
  v_receipt_fp text;
  v_claim_fp text;
  v_approval_fp text;
  v_scope text := coalesce(new.memory_scope, '');
begin
  -- New execution requests acquire one immutable policy-interval identity. Replays may
  -- refresh ordinary request fields only while that exact interval remains current.
  if v_scope = 'platform_learning_experiment_execution_requests'
    and coalesce(v_meta->>'contract', '') = 'AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_V1'
  then
    begin
      v_event_at := coalesce(nullif(v_meta->>'requested_at', '')::timestamptz, now());
    exception when others then
      raise exception 'AVANTIQO_PHASE45_REQUEST_BINDING_TIME_INVALID_FAIL_CLOSED';
    end;
    v_resolution := public.resolve_avantiqo_policy_activation_interval_v1(
      new.organization_id, v_event_at
    );

    if tg_op = 'UPDATE'
      and nullif(old.metadata->>'policy_activation_binding_kind', '') is not null
    then
      if public.avantiqo_phase45_assert_binding_matches_v1(old.metadata, v_resolution) is not true then
        raise exception 'AVANTIQO_PHASE45_STALE_EXECUTION_REQUEST_REBIND_FORBIDDEN';
      end if;
      v_binding := old.metadata - array[
        'contract','status','request_fingerprint','selection_fingerprint',
        'selection_cycle_fingerprint','selection_rank','candidate_family',
        'experiment_fingerprint','experiment_version_fingerprint',
        'uncertainty_target_fingerprint','transfer_fingerprint','synthesis_fingerprint',
        'conservative_estimated_cost_units','conservative_estimated_execution_risk',
        'risk_adjusted_information_gain_per_cost','selection_is_advisory_only',
        'explicit_independent_approval_required','approval_must_bind_exact_experiment_version',
        'approval_must_expire_with_selection','one_time_execution_claim_required_after_approval',
        'direct_execution_from_request_forbidden','execution_mode_unresolved_until_explicit_approval',
        'execution_authorized','provider_execution_authorized','supplier_spend_authorized',
        'wallet_reservation_performed','runpod_job_submitted','runpod_endpoint_mutated',
        'runpod_safe_lease_required_if_gpu','runpod_safe_lease_contract',
        'experiment_execution_performed_here','result_fabricated','reusable_platform_knowledge',
        'automatic_knowledge_promotion','automatic_training_effect','authorization_value',
        'customer_private_content_allowed','raw_reasoning_persisted','requested_at'
      ];
      -- Keep only the Phase45 binding keys from OLD.
      v_binding := jsonb_build_object(
        'policy_activation_binding_contract', old.metadata->'policy_activation_binding_contract',
        'policy_activation_resolution_contract', old.metadata->'policy_activation_resolution_contract',
        'policy_activation_binding_kind', old.metadata->'policy_activation_binding_kind',
        'policy_activation_binding_persistent_policy_present', old.metadata->'policy_activation_binding_persistent_policy_present',
        'policy_id', old.metadata->'policy_id',
        'policy_fingerprint', old.metadata->'policy_fingerprint',
        'activation_generation_index', old.metadata->'activation_generation_index',
        'activation_generation_fingerprint', old.metadata->'activation_generation_fingerprint',
        'policy_activation_started_at', old.metadata->'policy_activation_started_at',
        'policy_activation_closed_at', old.metadata->'policy_activation_closed_at',
        'policy_activation_binding_observed_at', old.metadata->'policy_activation_binding_observed_at',
        'policy_activation_binding_exact_interval_resolution', old.metadata->'policy_activation_binding_exact_interval_resolution',
        'policy_activation_binding_is_execution_authority', false,
        'cross_interval_policy_binding_reuse_allowed', false
      );
    else
      v_binding := public.avantiqo_phase45_binding_metadata_v1(v_resolution, v_event_at);
    end if;

    new.metadata := v_meta || v_binding;
    return new;
  end if;

  -- Approval must still be in the exact interval that created its request.
  if v_scope = 'platform_learning_experiment_execution_approvals'
    and coalesce(v_meta->>'contract', '') = 'AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_V1'
  then
    v_request_fp := lower(btrim(coalesce(v_meta->>'request_fingerprint', '')));
    select count(*)::integer into v_source_count
    from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_requests'
      and lower(btrim(coalesce(metadata->>'request_fingerprint', ''))) = v_request_fp;
    if v_request_fp !~ '^[a-f0-9]{16,128}$' or v_source_count <> 1 then
      raise exception 'AVANTIQO_PHASE45_APPROVAL_REQUEST_LINEAGE_AMBIGUOUS_FAIL_CLOSED';
    end if;
    select * into v_source from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_requests'
      and lower(btrim(coalesce(metadata->>'request_fingerprint', ''))) = v_request_fp
    limit 1;
    v_resolution := public.resolve_avantiqo_policy_activation_interval_v1(
      new.organization_id, now()
    );
    if public.avantiqo_phase45_assert_binding_matches_v1(v_source.metadata, v_resolution) is not true then
      raise exception 'AVANTIQO_PHASE45_STALE_REQUEST_APPROVAL_FORBIDDEN';
    end if;
    new.metadata := v_meta || jsonb_build_object(
      'policy_activation_binding_contract', v_source.metadata->'policy_activation_binding_contract',
      'policy_activation_resolution_contract', v_source.metadata->'policy_activation_resolution_contract',
      'policy_activation_binding_kind', v_source.metadata->'policy_activation_binding_kind',
      'policy_activation_binding_persistent_policy_present', v_source.metadata->'policy_activation_binding_persistent_policy_present',
      'policy_id', v_source.metadata->'policy_id',
      'policy_fingerprint', v_source.metadata->'policy_fingerprint',
      'activation_generation_index', v_source.metadata->'activation_generation_index',
      'activation_generation_fingerprint', v_source.metadata->'activation_generation_fingerprint',
      'policy_activation_started_at', v_source.metadata->'policy_activation_started_at',
      'policy_activation_closed_at', v_source.metadata->'policy_activation_closed_at',
      'policy_activation_binding_observed_at', v_source.metadata->'policy_activation_binding_observed_at',
      'policy_activation_binding_exact_interval_resolution', true,
      'policy_activation_binding_is_execution_authority', false,
      'cross_interval_policy_binding_reuse_allowed', false
    );
    return new;
  end if;

  -- Claim creation and claim consumption both require the approval's exact interval to
  -- still be current. This closes the stale approval -> claim -> execution race.
  if v_scope = 'platform_learning_experiment_execution_claims'
    and coalesce(v_meta->>'contract', '') = 'AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_V1'
  then
    v_approval_fp := lower(btrim(coalesce(v_meta->>'approval_fingerprint', '')));
    select count(*)::integer into v_source_count
    from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_approvals'
      and lower(btrim(coalesce(metadata->>'approval_fingerprint', ''))) = v_approval_fp;
    if v_approval_fp !~ '^[a-f0-9]{16,128}$' or v_source_count <> 1 then
      raise exception 'AVANTIQO_PHASE45_CLAIM_APPROVAL_LINEAGE_AMBIGUOUS_FAIL_CLOSED';
    end if;
    select * into v_source from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_approvals'
      and lower(btrim(coalesce(metadata->>'approval_fingerprint', ''))) = v_approval_fp
    limit 1;
    v_resolution := public.resolve_avantiqo_policy_activation_interval_v1(
      new.organization_id, now()
    );
    if public.avantiqo_phase45_assert_binding_matches_v1(v_source.metadata, v_resolution) is not true then
      raise exception 'AVANTIQO_PHASE45_STALE_APPROVAL_CLAIM_FORBIDDEN';
    end if;
    if tg_op = 'UPDATE'
      and coalesce(old.metadata->>'status', '') = 'READY_FOR_SINGLE_EXECUTION_CONSUMPTION'
      and coalesce(v_meta->>'status', '') = 'CONSUMED_SINGLE_EXECUTION_CLAIM'
      and public.avantiqo_phase45_assert_binding_matches_v1(old.metadata, v_resolution) is not true
    then
      raise exception 'AVANTIQO_PHASE45_STALE_CLAIM_CONSUMPTION_FORBIDDEN';
    end if;
    new.metadata := v_meta || jsonb_build_object(
      'policy_activation_binding_contract', v_source.metadata->'policy_activation_binding_contract',
      'policy_activation_resolution_contract', v_source.metadata->'policy_activation_resolution_contract',
      'policy_activation_binding_kind', v_source.metadata->'policy_activation_binding_kind',
      'policy_activation_binding_persistent_policy_present', v_source.metadata->'policy_activation_binding_persistent_policy_present',
      'policy_id', v_source.metadata->'policy_id',
      'policy_fingerprint', v_source.metadata->'policy_fingerprint',
      'activation_generation_index', v_source.metadata->'activation_generation_index',
      'activation_generation_fingerprint', v_source.metadata->'activation_generation_fingerprint',
      'policy_activation_started_at', v_source.metadata->'policy_activation_started_at',
      'policy_activation_closed_at', v_source.metadata->'policy_activation_closed_at',
      'policy_activation_binding_observed_at', v_source.metadata->'policy_activation_binding_observed_at',
      'policy_activation_binding_exact_interval_resolution', true,
      'policy_activation_binding_is_execution_authority', false,
      'cross_interval_policy_binding_reuse_allowed', false
    );
    return new;
  end if;

  -- A receipt may complete later, but its execution start must be inside the same exact
  -- activation interval carried by the consumed claim.
  if v_scope = 'platform_learning_experiment_execution_receipts'
    and coalesce(v_meta->>'contract', '') = 'AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_V1'
  then
    v_claim_fp := lower(btrim(coalesce(v_meta->>'claim_fingerprint', '')));
    select count(*)::integer into v_source_count
    from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_claims'
      and lower(btrim(coalesce(metadata->>'claim_fingerprint', ''))) = v_claim_fp;
    if v_claim_fp !~ '^[a-f0-9]{16,128}$' or v_source_count <> 1 then
      raise exception 'AVANTIQO_PHASE45_RECEIPT_CLAIM_LINEAGE_AMBIGUOUS_FAIL_CLOSED';
    end if;
    select * into v_source from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_claims'
      and lower(btrim(coalesce(metadata->>'claim_fingerprint', ''))) = v_claim_fp
    limit 1;
    begin
      v_event_at := (v_meta->>'execution_started_at')::timestamptz;
    exception when others then
      raise exception 'AVANTIQO_PHASE45_RECEIPT_EXECUTION_START_INVALID_FAIL_CLOSED';
    end;
    v_resolution := public.resolve_avantiqo_policy_activation_interval_v1(
      new.organization_id, v_event_at
    );
    if public.avantiqo_phase45_assert_binding_matches_v1(v_source.metadata, v_resolution) is not true then
      raise exception 'AVANTIQO_PHASE45_EXECUTION_START_CROSS_INTERVAL_FORBIDDEN';
    end if;
    new.metadata := v_meta || jsonb_build_object(
      'policy_activation_binding_contract', v_source.metadata->'policy_activation_binding_contract',
      'policy_activation_resolution_contract', v_source.metadata->'policy_activation_resolution_contract',
      'policy_activation_binding_kind', v_source.metadata->'policy_activation_binding_kind',
      'policy_activation_binding_persistent_policy_present', v_source.metadata->'policy_activation_binding_persistent_policy_present',
      'policy_id', v_source.metadata->'policy_id',
      'policy_fingerprint', v_source.metadata->'policy_fingerprint',
      'activation_generation_index', v_source.metadata->'activation_generation_index',
      'activation_generation_fingerprint', v_source.metadata->'activation_generation_fingerprint',
      'policy_activation_started_at', v_source.metadata->'policy_activation_started_at',
      'policy_activation_closed_at', v_source.metadata->'policy_activation_closed_at',
      'policy_activation_binding_observed_at', v_source.metadata->'policy_activation_binding_observed_at',
      'policy_activation_binding_exact_interval_resolution', true,
      'policy_activation_binding_is_execution_authority', false,
      'cross_interval_policy_binding_reuse_allowed', false
    );
    return new;
  end if;

  -- Portfolio outcomes inherit the exact request/receipt lineage. The Phase45 AFTER
  -- trigger atomically appends the immutable attribution ledger after these fields exist.
  if v_scope = 'platform_learning_experiment_portfolio_outcomes'
    and coalesce(v_meta->>'contract', '') = 'AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_V1'
    and coalesce(v_meta->>'status', '') = 'OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED'
  then
    v_request_fp := lower(btrim(coalesce(v_meta->>'request_fingerprint', '')));
    v_receipt_fp := lower(btrim(coalesce(v_meta->>'execution_receipt_fingerprint', '')));

    select count(*)::integer into v_source_count from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_requests'
      and lower(btrim(coalesce(metadata->>'request_fingerprint', ''))) = v_request_fp;
    if v_source_count <> 1 then
      raise exception 'AVANTIQO_PHASE45_OUTCOME_REQUEST_LINEAGE_AMBIGUOUS_FAIL_CLOSED';
    end if;
    select * into v_request from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_requests'
      and lower(btrim(coalesce(metadata->>'request_fingerprint', ''))) = v_request_fp limit 1;

    select count(*)::integer into v_source_count from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_receipts'
      and lower(btrim(coalesce(metadata->>'execution_receipt_fingerprint', ''))) = v_receipt_fp;
    if v_source_count <> 1 then
      raise exception 'AVANTIQO_PHASE45_OUTCOME_RECEIPT_LINEAGE_AMBIGUOUS_FAIL_CLOSED';
    end if;
    select * into v_receipt from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_receipts'
      and lower(btrim(coalesce(metadata->>'execution_receipt_fingerprint', ''))) = v_receipt_fp limit 1;

    if coalesce(v_request.metadata->>'policy_activation_binding_kind', '')
        <> coalesce(v_receipt.metadata->>'policy_activation_binding_kind', '')
      or coalesce(v_request.metadata->>'activation_generation_fingerprint', '')
        <> coalesce(v_receipt.metadata->>'activation_generation_fingerprint', '')
      or coalesce(v_request.metadata->>'selection_fingerprint', '')
        <> coalesce(v_receipt.metadata->>'selection_fingerprint', '')
    then
      raise exception 'AVANTIQO_PHASE45_OUTCOME_REQUEST_RECEIPT_BINDING_MISMATCH_FAIL_CLOSED';
    end if;

    new.metadata := v_meta || jsonb_build_object(
      'policy_activation_binding_contract', v_request.metadata->'policy_activation_binding_contract',
      'policy_activation_resolution_contract', v_request.metadata->'policy_activation_resolution_contract',
      'policy_activation_binding_kind', v_request.metadata->'policy_activation_binding_kind',
      'policy_activation_binding_persistent_policy_present', v_request.metadata->'policy_activation_binding_persistent_policy_present',
      'policy_id', v_request.metadata->'policy_id',
      'policy_fingerprint', v_request.metadata->'policy_fingerprint',
      'activation_generation_index', v_request.metadata->'activation_generation_index',
      'activation_generation_fingerprint', v_request.metadata->'activation_generation_fingerprint',
      'policy_activation_started_at', v_request.metadata->'policy_activation_started_at',
      'policy_activation_closed_at', v_request.metadata->'policy_activation_closed_at',
      'policy_activation_binding_observed_at', v_request.metadata->'policy_activation_binding_observed_at',
      'policy_activation_binding_exact_interval_resolution', true,
      'policy_activation_binding_is_execution_authority', false,
      'cross_interval_policy_binding_reuse_allowed', false,
      'execution_started_at', v_receipt.metadata->'execution_started_at',
      'execution_completed_at', v_receipt.metadata->'execution_completed_at',
      'outcome_policy_activation_interval_attributed', true
    );
    return new;
  end if;

  return new;
end;
$$;

revoke all on function public.avantiqo_phase45_enforce_execution_lineage_v1()
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase45_enforce_execution_lineage_v1()
  to service_role;

drop trigger if exists avantiqo_phase45_execution_lineage_v1
  on public.intelligence_memories;
create trigger avantiqo_phase45_execution_lineage_v1
before insert or update of metadata on public.intelligence_memories
for each row execute function public.avantiqo_phase45_enforce_execution_lineage_v1();
