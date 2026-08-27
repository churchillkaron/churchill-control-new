-- AVANTIQO PHASE 45 BINDING PROPAGATION HARDENING
-- Carry the complete policy/no-policy epoch identity through every execution artifact.

create or replace function public.avantiqo_phase45_copy_binding_metadata_v1(
  p_metadata jsonb
)
returns jsonb
language sql
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'policy_activation_binding_contract', p_metadata->'policy_activation_binding_contract',
    'policy_activation_resolution_contract', p_metadata->'policy_activation_resolution_contract',
    'policy_activation_binding_kind', p_metadata->'policy_activation_binding_kind',
    'policy_activation_binding_persistent_policy_present', p_metadata->'policy_activation_binding_persistent_policy_present',
    'policy_id', p_metadata->'policy_id',
    'policy_fingerprint', p_metadata->'policy_fingerprint',
    'activation_generation_index', p_metadata->'activation_generation_index',
    'activation_generation_fingerprint', p_metadata->'activation_generation_fingerprint',
    'policy_activation_started_at', p_metadata->'policy_activation_started_at',
    'policy_activation_closed_at', p_metadata->'policy_activation_closed_at',
    'policy_activation_history_watermark_index', p_metadata->'policy_activation_history_watermark_index',
    'policy_activation_history_watermark_fingerprint', p_metadata->'policy_activation_history_watermark_fingerprint',
    'policy_activation_binding_observed_at', p_metadata->'policy_activation_binding_observed_at',
    'policy_activation_binding_exact_interval_resolution', true,
    'policy_activation_binding_is_execution_authority', false,
    'cross_interval_policy_binding_reuse_allowed', false,
    'no_policy_epoch_reentry_allowed', false
  );
$$;

revoke all on function public.avantiqo_phase45_copy_binding_metadata_v1(jsonb)
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase45_copy_binding_metadata_v1(jsonb)
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
  if v_scope = 'platform_learning_experiment_execution_requests'
    and coalesce(v_meta->>'contract', '') = 'AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_V1'
  then
    if tg_op = 'UPDATE'
      and nullif(old.metadata->>'policy_activation_binding_kind', '') is not null
    then
      v_resolution := public.resolve_avantiqo_policy_activation_interval_v1(
        new.organization_id,
        now()
      );
      if public.avantiqo_phase45_assert_binding_matches_v1(old.metadata, v_resolution) is not true then
        raise exception 'AVANTIQO_PHASE45_STALE_EXECUTION_REQUEST_REBIND_FORBIDDEN';
      end if;
      v_binding := public.avantiqo_phase45_copy_binding_metadata_v1(old.metadata);
    else
      begin
        v_event_at := coalesce(nullif(v_meta->>'requested_at', '')::timestamptz, now());
      exception when others then
        raise exception 'AVANTIQO_PHASE45_REQUEST_BINDING_TIME_INVALID_FAIL_CLOSED';
      end;
      v_resolution := public.resolve_avantiqo_policy_activation_interval_v1(
        new.organization_id,
        v_event_at
      );
      v_binding := public.avantiqo_phase45_binding_metadata_v1(v_resolution, v_event_at);
    end if;
    new.metadata := v_meta || v_binding;
    return new;
  end if;

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
    select * into v_source
    from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_requests'
      and lower(btrim(coalesce(metadata->>'request_fingerprint', ''))) = v_request_fp
    limit 1;
    v_resolution := public.resolve_avantiqo_policy_activation_interval_v1(
      new.organization_id,
      now()
    );
    if public.avantiqo_phase45_assert_binding_matches_v1(v_source.metadata, v_resolution) is not true then
      raise exception 'AVANTIQO_PHASE45_STALE_REQUEST_APPROVAL_FORBIDDEN';
    end if;
    new.metadata := v_meta || public.avantiqo_phase45_copy_binding_metadata_v1(v_source.metadata);
    return new;
  end if;

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
    select * into v_source
    from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_approvals'
      and lower(btrim(coalesce(metadata->>'approval_fingerprint', ''))) = v_approval_fp
    limit 1;
    v_resolution := public.resolve_avantiqo_policy_activation_interval_v1(
      new.organization_id,
      now()
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
    new.metadata := v_meta || public.avantiqo_phase45_copy_binding_metadata_v1(v_source.metadata);
    return new;
  end if;

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
    select * into v_source
    from public.intelligence_memories
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
      new.organization_id,
      v_event_at
    );
    if public.avantiqo_phase45_assert_binding_matches_v1(v_source.metadata, v_resolution) is not true then
      raise exception 'AVANTIQO_PHASE45_EXECUTION_START_CROSS_INTERVAL_FORBIDDEN';
    end if;
    new.metadata := v_meta || public.avantiqo_phase45_copy_binding_metadata_v1(v_source.metadata);
    return new;
  end if;

  if v_scope = 'platform_learning_experiment_portfolio_outcomes'
    and coalesce(v_meta->>'contract', '') = 'AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_V1'
    and coalesce(v_meta->>'status', '') = 'OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED'
  then
    v_request_fp := lower(btrim(coalesce(v_meta->>'request_fingerprint', '')));
    v_receipt_fp := lower(btrim(coalesce(v_meta->>'execution_receipt_fingerprint', '')));

    select count(*)::integer into v_source_count
    from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_requests'
      and lower(btrim(coalesce(metadata->>'request_fingerprint', ''))) = v_request_fp;
    if v_source_count <> 1 then
      raise exception 'AVANTIQO_PHASE45_OUTCOME_REQUEST_LINEAGE_AMBIGUOUS_FAIL_CLOSED';
    end if;
    select * into v_request
    from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_requests'
      and lower(btrim(coalesce(metadata->>'request_fingerprint', ''))) = v_request_fp
    limit 1;

    select count(*)::integer into v_source_count
    from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_receipts'
      and lower(btrim(coalesce(metadata->>'execution_receipt_fingerprint', ''))) = v_receipt_fp;
    if v_source_count <> 1 then
      raise exception 'AVANTIQO_PHASE45_OUTCOME_RECEIPT_LINEAGE_AMBIGUOUS_FAIL_CLOSED';
    end if;
    select * into v_receipt
    from public.intelligence_memories
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_experiment_execution_receipts'
      and lower(btrim(coalesce(metadata->>'execution_receipt_fingerprint', ''))) = v_receipt_fp
    limit 1;

    if coalesce(v_request.metadata->>'policy_activation_binding_kind', '')
        <> coalesce(v_receipt.metadata->>'policy_activation_binding_kind', '')
      or coalesce(v_request.metadata->>'activation_generation_fingerprint', '')
        <> coalesce(v_receipt.metadata->>'activation_generation_fingerprint', '')
      or coalesce(v_request.metadata->>'policy_activation_history_watermark_index', '')
        <> coalesce(v_receipt.metadata->>'policy_activation_history_watermark_index', '')
      or coalesce(v_request.metadata->>'policy_activation_history_watermark_fingerprint', '')
        <> coalesce(v_receipt.metadata->>'policy_activation_history_watermark_fingerprint', '')
      or coalesce(v_request.metadata->>'selection_fingerprint', '')
        <> coalesce(v_receipt.metadata->>'selection_fingerprint', '')
    then
      raise exception 'AVANTIQO_PHASE45_OUTCOME_REQUEST_RECEIPT_BINDING_MISMATCH_FAIL_CLOSED';
    end if;

    new.metadata := v_meta
      || public.avantiqo_phase45_copy_binding_metadata_v1(v_request.metadata)
      || jsonb_build_object(
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
