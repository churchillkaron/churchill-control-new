-- Phase 41: governed persistent-policy succession.
-- Only the exact Phase 40-tested composite may replace the current persistent policy.
-- The raw Phase 38 challenger is never promoted at 100%. The composition is flattened
-- into reproducible parameters so future cycles do not recursively depend on historical
-- application rows. Existing Phase 36 monitoring remains authoritative after succession.

create or replace function public.avantiqo_phase41_composite_score_v1(
  p_baseline_score numeric,
  p_legacy_challenger_score numeric,
  p_candidate_family text,
  p_policy_metadata jsonb,
  p_include_last_layer boolean default true
)
returns numeric
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_score numeric;
  v_legacy_influence numeric;
  v_layers jsonb;
  v_layer jsonb;
  v_layer_count integer;
  v_layer_index integer := 0;
  v_influence numeric;
  v_factor numeric;
  v_family text := upper(btrim(coalesce(p_candidate_family, 'UNSPECIFIED')));
begin
  if p_baseline_score is null or p_baseline_score <= 0
    or p_legacy_challenger_score is null or p_legacy_challenger_score < 0
  then
    raise exception 'AVANTIQO_PHASE41_COMPOSITE_SOURCE_SCORE_INVALID';
  end if;

  v_legacy_influence := (p_policy_metadata->>'legacy_phase30_influence_fraction')::numeric;
  if v_legacy_influence <= 0 or v_legacy_influence > 0.25 then
    raise exception 'AVANTIQO_PHASE41_LEGACY_INFLUENCE_INVALID';
  end if;

  v_score := p_baseline_score * (1 - v_legacy_influence)
    + p_legacy_challenger_score * v_legacy_influence;

  v_layers := coalesce(p_policy_metadata->'flattened_residual_layers', '[]'::jsonb);
  if jsonb_typeof(v_layers) <> 'array' then
    raise exception 'AVANTIQO_PHASE41_FLATTENED_LAYERS_INVALID';
  end if;
  v_layer_count := jsonb_array_length(v_layers);

  for v_layer in select value from jsonb_array_elements(v_layers)
  loop
    v_layer_index := v_layer_index + 1;
    if p_include_last_layer is false and v_layer_index = v_layer_count then
      exit;
    end if;

    v_influence := (v_layer->>'incremental_influence_fraction')::numeric;
    if v_influence <= 0 or v_influence > 0.25 then
      raise exception 'AVANTIQO_PHASE41_RESIDUAL_LAYER_INFLUENCE_INVALID';
    end if;

    v_factor := coalesce(
      (v_layer->'family_residual_calibration_factors'->>v_family)::numeric,
      (v_layer->>'global_residual_calibration_factor')::numeric
    );
    if v_factor < 0.25 or v_factor > 1 then
      raise exception 'AVANTIQO_PHASE41_RESIDUAL_LAYER_FACTOR_INVALID';
    end if;

    v_score := v_score * (1 - v_influence) + (v_score * v_factor) * v_influence;
  end loop;

  return v_score;
end;
$$;

revoke all on function public.avantiqo_phase41_composite_score_v1(numeric, numeric, text, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase41_composite_score_v1(numeric, numeric, text, jsonb, boolean)
  to service_role;

create or replace function public.activate_avantiqo_policy_successor_v1(
  p_organization_id uuid,
  p_release_candidate_fingerprint text,
  p_activator_fingerprint text,
  p_activation_reason text,
  p_expected_incremental_influence_fraction numeric
)
returns public.avantiqo_intelligence_persistent_ordering_policies
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_release public.intelligence_memories;
  v_approval public.intelligence_memories;
  v_certification public.intelligence_memories;
  v_proposal public.intelligence_memories;
  v_phase40_activation public.avantiqo_intelligence_rebased_selection_policy_canary_activations;
  v_parent public.avantiqo_intelligence_persistent_ordering_policies;
  v_successor public.avantiqo_intelligence_persistent_ordering_policies;
  v_release_metadata jsonb;
  v_approval_metadata jsonb;
  v_certification_metadata jsonb;
  v_proposal_metadata jsonb;
  v_parent_metadata jsonb;
  v_layers jsonb;
  v_new_layer jsonb;
  v_policy_fingerprint text;
  v_influence numeric;
  v_legacy_influence numeric;
  v_legacy_version text;
  v_approval_fingerprint text;
  v_certification_fingerprint text;
  v_phase40_activation_fingerprint text;
  v_proposal_fingerprint text;
  v_challenger_version text;
  v_approver_fingerprint text;
begin
  if p_organization_id is null then
    raise exception 'AVANTIQO_PHASE41_ORGANIZATION_REQUIRED';
  end if;
  if lower(btrim(coalesce(p_release_candidate_fingerprint, ''))) !~ '^[a-f0-9]{32,128}$' then
    raise exception 'AVANTIQO_PHASE41_RELEASE_FINGERPRINT_INVALID';
  end if;
  if lower(btrim(coalesce(p_activator_fingerprint, ''))) !~ '^[a-f0-9]{32,128}$' then
    raise exception 'AVANTIQO_PHASE41_ACTIVATOR_FINGERPRINT_INVALID';
  end if;
  if length(btrim(coalesce(p_activation_reason, ''))) < 12 then
    raise exception 'AVANTIQO_PHASE41_ACTIVATION_REASON_REQUIRED';
  end if;
  if p_expected_incremental_influence_fraction is null
    or p_expected_incremental_influence_fraction <= 0
    or p_expected_incremental_influence_fraction > 0.25
  then
    raise exception 'AVANTIQO_PHASE41_EXPECTED_INFLUENCE_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('avantiqo_persistent_ordering_policy_v1:' || p_organization_id::text, 0)
  );

  select * into v_parent
  from public.avantiqo_intelligence_persistent_ordering_policies
  where organization_id = p_organization_id and state = 'ACTIVE'
  limit 1;

  if v_parent.id is null then
    raise exception 'AVANTIQO_PHASE41_ACTIVE_PARENT_POLICY_REQUIRED';
  end if;
  if v_parent.contract <> 'AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_V1'
    or v_parent.policy_fingerprint !~ '^[a-f0-9]{32,128}$'
    or v_parent.activator_fingerprint !~ '^[a-f0-9]{32,128}$'
    or v_parent.ordering_influence_fraction <= 0
    or v_parent.ordering_influence_fraction > 0.25
  then
    raise exception 'AVANTIQO_PHASE41_ACTIVE_PARENT_POLICY_INVALID';
  end if;

  if exists (
    select 1 from public.avantiqo_intelligence_rebased_selection_policy_canary_activations
    where organization_id = p_organization_id and state = 'ACTIVE'
  ) then
    raise exception 'AVANTIQO_PHASE41_ACTIVE_PHASE40_CANARY_CONFLICT';
  end if;
  if exists (
    select 1 from public.intelligence_memories
    where organization_id = p_organization_id
      and memory_scope = 'platform_learning_experiment_selection_policy_canary_activations'
      and active = true
      and (valid_until is null or valid_until > now())
      and metadata->>'contract' = 'AVANTIQO_SELECTION_POLICY_CANARY_V1'
      and metadata->>'status' = 'EXPLICIT_BOUNDED_POLICY_CANARY_ACTIVATION_RECORDED'
  ) then
    raise exception 'AVANTIQO_PHASE41_ACTIVE_LEGACY_CANARY_CONFLICT';
  end if;

  select * into v_release
  from public.intelligence_memories
  where organization_id = p_organization_id
    and memory_scope = 'platform_learning_persistent_policy_succession_release_candidates'
    and active = true
    and (valid_until is null or valid_until > now())
    and metadata->>'release_candidate_fingerprint' = lower(btrim(p_release_candidate_fingerprint))
  order by created_at desc
  limit 1;

  if v_release.id is null then
    raise exception 'AVANTIQO_PHASE41_RELEASE_NOT_CURRENT';
  end if;
  v_release_metadata := v_release.metadata;
  if v_release_metadata->>'contract' <> 'AVANTIQO_PERSISTENT_POLICY_SUCCESSION_V1'
    or v_release_metadata->>'status' <> 'PERSISTENT_POLICY_SUCCESSOR_RELEASE_READY_FOR_SEPARATE_ACTIVATION'
    or coalesce((v_release_metadata->>'exact_tested_composite_only')::boolean, false) is not true
    or coalesce((v_release_metadata->>'flattened_composition_required')::boolean, false) is not true
    or coalesce((v_release_metadata->>'parent_policy_rollback_required')::boolean, false) is not true
    or coalesce((v_release_metadata->>'atomic_parent_supersession_and_successor_activation_required')::boolean, false) is not true
    or coalesce((v_release_metadata->>'phase36_regression_monitor_must_continue')::boolean, false) is not true
    or coalesce((v_release_metadata->>'release_is_not_activation')::boolean, false) is not true
    or coalesce((v_release_metadata->>'activation_requires_separate_explicit_call')::boolean, false) is not true
    or coalesce((v_release_metadata->>'raw_challenger_full_cutover_authorized')::boolean, true) is not false
    or coalesce((v_release_metadata->>'recursive_policy_stack_authorized')::boolean, true) is not false
    or coalesce((v_release_metadata->>'selected_membership_change_authorized')::boolean, true) is not false
    or coalesce((v_release_metadata->>'source_numeric_score_mutation_authorized')::boolean, true) is not false
  then
    raise exception 'AVANTIQO_PHASE41_RELEASE_BOUNDARY_INVALID';
  end if;

  if lower(btrim(coalesce(v_release_metadata->>'current_baseline_policy_fingerprint', ''))) <> v_parent.policy_fingerprint then
    raise exception 'AVANTIQO_PHASE41_PARENT_POLICY_CHANGED';
  end if;
  v_influence := (v_release_metadata->>'exact_tested_incremental_influence_fraction')::numeric;
  if v_influence <= 0 or v_influence > 0.25 or v_influence <> p_expected_incremental_influence_fraction then
    raise exception 'AVANTIQO_PHASE41_EXACT_TESTED_INFLUENCE_MISMATCH';
  end if;

  v_approval_fingerprint := lower(btrim(coalesce(v_release_metadata->>'approval_fingerprint', '')));
  v_certification_fingerprint := lower(btrim(coalesce(v_release_metadata->>'source_certification_fingerprint', '')));
  v_phase40_activation_fingerprint := lower(btrim(coalesce(v_release_metadata->>'source_phase40_activation_fingerprint', '')));
  v_proposal_fingerprint := lower(btrim(coalesce(v_release_metadata->>'source_phase38_proposal_fingerprint', '')));
  v_challenger_version := btrim(coalesce(v_release_metadata->>'successor_challenger_policy_version', ''));
  if v_approval_fingerprint !~ '^[a-f0-9]{32,128}$'
    or v_certification_fingerprint !~ '^[a-f0-9]{32,128}$'
    or v_phase40_activation_fingerprint !~ '^[a-f0-9]{32,128}$'
    or v_proposal_fingerprint !~ '^[a-f0-9]{32,128}$'
    or length(v_challenger_version) < 8
    or v_challenger_version = v_parent.challenger_policy_version
  then
    raise exception 'AVANTIQO_PHASE41_RELEASE_LINEAGE_INVALID';
  end if;

  select * into v_approval
  from public.intelligence_memories
  where organization_id = p_organization_id
    and memory_scope = 'platform_learning_persistent_policy_succession_approvals'
    and active = true
    and (valid_until is null or valid_until > now())
    and metadata->>'approval_fingerprint' = v_approval_fingerprint
  order by created_at desc
  limit 1;
  if v_approval.id is null then
    raise exception 'AVANTIQO_PHASE41_APPROVAL_NOT_CURRENT';
  end if;
  v_approval_metadata := v_approval.metadata;
  if v_approval_metadata->>'contract' <> 'AVANTIQO_PERSISTENT_POLICY_SUCCESSION_V1'
    or v_approval_metadata->>'status' <> 'EXPLICIT_PERSISTENT_POLICY_SUCCESSION_RELEASE_APPROVAL_RECORDED'
    or coalesce((v_approval_metadata->>'independent_approver_attested')::boolean, false) is not true
    or coalesce((v_approval_metadata->>'exact_tested_composite_confirmed')::boolean, false) is not true
    or coalesce((v_approval_metadata->>'flattened_composition_required')::boolean, false) is not true
    or coalesce((v_approval_metadata->>'rollback_readiness_confirmed')::boolean, false) is not true
    or coalesce((v_approval_metadata->>'approval_is_not_activation')::boolean, false) is not true
    or coalesce((v_approval_metadata->>'raw_challenger_full_cutover_authorized')::boolean, true) is not false
    or v_approval_metadata->>'current_baseline_policy_fingerprint' <> v_parent.policy_fingerprint
    or v_approval_metadata->>'source_certification_fingerprint' <> v_certification_fingerprint
  then
    raise exception 'AVANTIQO_PHASE41_APPROVAL_LINEAGE_INVALID';
  end if;
  v_approver_fingerprint := lower(btrim(coalesce(v_approval_metadata->>'approver_fingerprint', '')));
  if v_approver_fingerprint !~ '^[a-f0-9]{32,128}$'
    or v_approver_fingerprint = lower(btrim(p_activator_fingerprint))
    or lower(btrim(v_parent.activator_fingerprint)) = lower(btrim(p_activator_fingerprint))
    or lower(btrim(coalesce(v_release_metadata->>'release_actor_fingerprint', ''))) = lower(btrim(p_activator_fingerprint))
  then
    raise exception 'AVANTIQO_PHASE41_ACTIVATOR_INDEPENDENCE_REQUIRED';
  end if;

  select * into v_certification
  from public.intelligence_memories
  where organization_id = p_organization_id
    and memory_scope = 'platform_learning_rebased_selection_policy_canary_outcome_certifications'
    and active = true
    and metadata->>'certification_fingerprint' = v_certification_fingerprint
  order by created_at desc
  limit 1;
  if v_certification.id is null then
    raise exception 'AVANTIQO_PHASE41_PHASE40_CERTIFICATION_NOT_FOUND';
  end if;
  v_certification_metadata := v_certification.metadata;
  if v_certification_metadata->>'contract' <> 'AVANTIQO_REBASED_SELECTION_POLICY_CANARY_V1'
    or v_certification_metadata->>'status' <> 'REBASED_CANARY_EVIDENCE_PERSISTENT_POLICY_SUCCESSION_REVIEW_CANDIDATE'
    or coalesce((v_certification_metadata->>'persistent_policy_succession_review_candidate')::boolean, false) is not true
    or coalesce((v_certification_metadata->>'exact_current_persistent_baseline_restored')::boolean, false) is not true
    or (v_certification_metadata->>'regression_cycle_count')::integer <> 0
    or v_certification_metadata->>'current_baseline_policy_fingerprint' <> v_parent.policy_fingerprint
    or v_certification_metadata->>'activation_fingerprint' <> v_phase40_activation_fingerprint
    or v_certification_metadata->>'challenger_policy_version' <> v_challenger_version
    or (v_certification_metadata->>'canary_influence_fraction')::numeric <> v_influence
  then
    raise exception 'AVANTIQO_PHASE41_PHASE40_CERTIFICATION_INVALID';
  end if;

  select * into v_phase40_activation
  from public.avantiqo_intelligence_rebased_selection_policy_canary_activations
  where organization_id = p_organization_id
    and activation_fingerprint = v_phase40_activation_fingerprint
  limit 1;
  if v_phase40_activation.id is null
    or v_phase40_activation.state <> 'COMPLETED'
    or v_phase40_activation.current_baseline_policy_fingerprint <> v_parent.policy_fingerprint
    or v_phase40_activation.source_proposal_fingerprint <> v_proposal_fingerprint
    or v_phase40_activation.challenger_policy_version <> v_challenger_version
    or v_phase40_activation.canary_influence_fraction <> v_influence
    or coalesce((v_phase40_activation.metadata->>'exact_current_persistent_baseline_restored')::boolean, false) is not true
    or lower(btrim(v_phase40_activation.activator_fingerprint)) = lower(btrim(p_activator_fingerprint))
  then
    raise exception 'AVANTIQO_PHASE41_PHASE40_ACTIVATION_INVALID';
  end if;

  select * into v_proposal
  from public.intelligence_memories
  where organization_id = p_organization_id
    and memory_scope = 'platform_learning_rebased_selection_policy_challenger_proposals'
    and active = true
    and metadata->>'proposal_fingerprint' = v_proposal_fingerprint
  order by created_at desc
  limit 1;
  if v_proposal.id is null then
    raise exception 'AVANTIQO_PHASE41_PHASE38_PROPOSAL_NOT_FOUND';
  end if;
  v_proposal_metadata := v_proposal.metadata;
  if v_proposal_metadata->>'contract' <> 'AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_V1'
    or v_proposal_metadata->>'current_baseline_policy_fingerprint' <> v_parent.policy_fingerprint
    or v_proposal_metadata->>'challenger_policy_version' <> v_challenger_version
    or coalesce((v_proposal_metadata->>'historical_pre_activation_outcomes_used')::boolean, true) is not false
    or coalesce((v_proposal_metadata->>'unexecuted_candidate_outcomes_inferred')::boolean, true) is not false
    or coalesce((v_proposal_metadata->>'full_counterfactual_backtest_claimed')::boolean, true) is not false
    or (v_proposal_metadata->>'global_residual_calibration_factor')::numeric < 0.25
    or (v_proposal_metadata->>'global_residual_calibration_factor')::numeric > 1
    or jsonb_typeof(v_proposal_metadata->'family_residual_calibration_factors') <> 'object'
  then
    raise exception 'AVANTIQO_PHASE41_PHASE38_PROPOSAL_INVALID';
  end if;

  v_parent_metadata := coalesce(v_parent.metadata, '{}'::jsonb);
  if v_parent_metadata->>'policy_generation_kind' = 'REBASED_SUCCESSOR_COMPOSITE_V1' then
    v_legacy_influence := (v_parent_metadata->>'legacy_phase30_influence_fraction')::numeric;
    v_legacy_version := v_parent_metadata->>'legacy_phase30_challenger_policy_version';
    v_layers := coalesce(v_parent_metadata->'flattened_residual_layers', '[]'::jsonb);
  else
    v_legacy_influence := v_parent.ordering_influence_fraction;
    v_legacy_version := v_parent.challenger_policy_version;
    v_layers := '[]'::jsonb;
  end if;
  if v_legacy_influence <= 0 or v_legacy_influence > 0.25
    or length(btrim(coalesce(v_legacy_version, ''))) < 3
    or jsonb_typeof(v_layers) <> 'array'
  then
    raise exception 'AVANTIQO_PHASE41_PARENT_COMPOSITION_INVALID';
  end if;

  v_new_layer := jsonb_build_object(
    'source_proposal_fingerprint', v_proposal_fingerprint,
    'challenger_policy_version', v_challenger_version,
    'incremental_influence_fraction', v_influence,
    'global_residual_calibration_factor', (v_proposal_metadata->>'global_residual_calibration_factor')::numeric,
    'family_residual_calibration_factors', v_proposal_metadata->'family_residual_calibration_factors'
  );
  v_layers := v_layers || jsonb_build_array(v_new_layer);

  v_policy_fingerprint := md5(
    'avantiqo-phase41-successor|' || p_organization_id::text || '|' ||
    v_parent.policy_fingerprint || '|' || lower(btrim(p_release_candidate_fingerprint)) || '|' ||
    lower(btrim(p_activator_fingerprint)) || '|' || v_challenger_version || '|' || v_influence::text
  );

  -- Mark the parent as a governed supersession. The Phase 40 baseline-exit trigger is
  -- taught below to preserve the current parent ranks for this specific transition.
  update public.avantiqo_intelligence_persistent_ordering_policies
  set
    state = 'SUPERSEDED',
    updated_at = now(),
    metadata = metadata || jsonb_build_object(
      'phase41_successor_activation_in_progress', true,
      'phase41_successor_policy_fingerprint', v_policy_fingerprint,
      'phase41_superseded_at', now(),
      'phase41_exact_parent_rollback_available', true
    )
  where id = v_parent.id and state = 'ACTIVE';

  insert into public.avantiqo_intelligence_persistent_ordering_policies (
    organization_id,
    policy_fingerprint,
    release_candidate_fingerprint,
    approval_fingerprint,
    source_certification_fingerprint,
    source_activation_fingerprint,
    baseline_policy_fingerprint,
    challenger_policy_version,
    ordering_influence_fraction,
    state,
    activator_fingerprint,
    activation_reason,
    metadata
  ) values (
    p_organization_id,
    v_policy_fingerprint,
    lower(btrim(p_release_candidate_fingerprint)),
    v_approval_fingerprint,
    v_certification_fingerprint,
    v_phase40_activation_fingerprint,
    v_parent.policy_fingerprint,
    v_challenger_version,
    v_influence,
    'ACTIVE',
    lower(btrim(p_activator_fingerprint)),
    btrim(p_activation_reason),
    jsonb_build_object(
      'policy_generation_kind', 'REBASED_SUCCESSOR_COMPOSITE_V1',
      'parent_policy_fingerprint', v_parent.policy_fingerprint,
      'legacy_phase30_challenger_policy_version', v_legacy_version,
      'legacy_phase30_influence_fraction', v_legacy_influence,
      'flattened_residual_layers', v_layers,
      'flattened_residual_layer_count', jsonb_array_length(v_layers),
      'latest_phase38_proposal_fingerprint', v_proposal_fingerprint,
      'latest_incremental_influence_fraction', v_influence,
      'exact_phase40_tested_composite_promoted', true,
      'raw_challenger_full_cutover_applied', false,
      'recursive_runtime_policy_stack', false,
      'persistent_policy_scope', 'ORDERING_WITHIN_ALREADY_SELECTED_PORTFOLIO_ONLY',
      'exact_certified_influence_preserved', true,
      'candidate_eligibility_change_allowed', false,
      'candidate_membership_change_allowed', false,
      'maximum_selection_count_change_allowed', false,
      'uncertainty_group_constraint_change_allowed', false,
      'source_numeric_score_mutation_allowed', false,
      'full_100_percent_challenger_cutover_allowed', false,
      'baseline_membership_selector_remains_authoritative', true,
      'atomic_database_authority', true,
      'automatic_regression_rollback_required', true,
      'phase36_monitor_compatible', true,
      'exact_parent_policy_reactivation_on_rollback', true,
      'execution_authorized', false,
      'provider_execution_authorized', false,
      'spend_authorized', false,
      'platform_knowledge_written', false,
      'automatic_training_started', false,
      'automatic_model_weight_mutation', false
    )
  )
  returning * into v_successor;

  return v_successor;
end;
$$;

revoke all on function public.activate_avantiqo_policy_successor_v1(uuid, text, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.activate_avantiqo_policy_successor_v1(uuid, text, text, text, numeric)
  to service_role;

create or replace function public.apply_avantiqo_policy_successor_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_policy public.avantiqo_intelligence_persistent_ordering_policies;
  v_existing public.avantiqo_intelligence_persistent_ordering_policy_applications;
  v_snapshot public.intelligence_memories;
  v_selection_count integer;
  v_min_cycle text;
  v_max_cycle text;
  v_cycle text;
  v_snapshot_fingerprint text;
  v_assignments jsonb;
  v_updated_count integer;
begin
  if p_organization_id is null then
    raise exception 'AVANTIQO_PHASE41_ORGANIZATION_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('avantiqo_persistent_ordering_policy_v1:' || p_organization_id::text, 0)
  );

  select * into v_policy
  from public.avantiqo_intelligence_persistent_ordering_policies
  where organization_id = p_organization_id and state = 'ACTIVE'
  limit 1;

  if v_policy.id is null then
    return jsonb_build_object('success', true, 'status', 'NO_ACTIVE_PERSISTENT_ORDERING_POLICY', 'application_performed', false, 'live_policy_active', false);
  end if;
  if coalesce(v_policy.metadata->>'policy_generation_kind', '') <> 'REBASED_SUCCESSOR_COMPOSITE_V1' then
    return jsonb_build_object('success', true, 'status', 'ACTIVE_POLICY_IS_NOT_PHASE41_SUCCESSOR', 'application_performed', false, 'live_policy_active', true, 'policy_fingerprint', v_policy.policy_fingerprint);
  end if;
  if coalesce((v_policy.metadata->>'exact_phase40_tested_composite_promoted')::boolean, false) is not true
    or coalesce((v_policy.metadata->>'raw_challenger_full_cutover_applied')::boolean, true) is not false
    or coalesce((v_policy.metadata->>'recursive_runtime_policy_stack')::boolean, true) is not false
    or coalesce((v_policy.metadata->>'phase36_monitor_compatible')::boolean, false) is not true
    or jsonb_typeof(v_policy.metadata->'flattened_residual_layers') <> 'array'
    or jsonb_array_length(v_policy.metadata->'flattened_residual_layers') < 1
  then
    raise exception 'AVANTIQO_PHASE41_ACTIVE_SUCCESSOR_COMPOSITION_INVALID';
  end if;

  select count(*)::integer, min(metadata->>'selection_cycle_fingerprint'), max(metadata->>'selection_cycle_fingerprint')
  into v_selection_count, v_min_cycle, v_max_cycle
  from public.intelligence_memories
  where organization_id = p_organization_id
    and memory_scope = 'platform_learning_active_experiment_selections'
    and active = true
    and (valid_until is null or valid_until > now())
    and metadata->>'contract' = 'AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1'
    and metadata->>'status' = 'SELECTED_FOR_SEPARATE_GOVERNED_EXECUTION_REVIEW'
    and coalesce((metadata->>'execution_authorized')::boolean, true) is false
    and coalesce((metadata->>'provider_execution_authorized')::boolean, true) is false
    and coalesce((metadata->>'spend_authorized')::boolean, true) is false;

  if v_selection_count < 2 then
    return jsonb_build_object('success', true, 'status', 'PHASE41_SUCCESSOR_WAITING_FOR_MULTI_SELECTION_PORTFOLIO', 'application_performed', false, 'live_policy_active', true, 'policy_fingerprint', v_policy.policy_fingerprint);
  end if;
  if v_min_cycle is null or v_max_cycle is null or v_min_cycle <> v_max_cycle then
    raise exception 'AVANTIQO_PHASE41_ACTIVE_SELECTION_CYCLE_AMBIGUOUS';
  end if;
  v_cycle := v_min_cycle;

  select * into v_existing
  from public.avantiqo_intelligence_persistent_ordering_policy_applications
  where organization_id = p_organization_id and policy_id = v_policy.id and selection_cycle_fingerprint = v_cycle
  limit 1;
  if v_existing.id is not null then
    return jsonb_build_object('success', true, 'status', 'PHASE41_SUCCESSOR_ALREADY_APPLIED_TO_CURRENT_CYCLE', 'application_performed', false, 'live_policy_active', true, 'policy_fingerprint', v_policy.policy_fingerprint, 'selection_cycle_fingerprint', v_cycle, 'assignments', v_existing.assignments);
  end if;

  if exists (
    select 1 from public.intelligence_memories r
    where r.organization_id = p_organization_id
      and r.memory_scope = 'platform_learning_experiment_execution_requests'
      and r.metadata->>'contract' = 'AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_V1'
      and exists (
        select 1 from public.intelligence_memories s
        where s.organization_id = p_organization_id
          and s.memory_scope = 'platform_learning_active_experiment_selections'
          and s.active = true
          and s.metadata->>'selection_cycle_fingerprint' = v_cycle
          and s.metadata->>'selection_fingerprint' = r.metadata->>'selection_fingerprint'
      )
  ) then
    return jsonb_build_object('success', true, 'status', 'PHASE41_SUCCESSOR_NOT_APPLIED_AFTER_EXECUTION_REQUEST_CREATION', 'application_performed', false, 'live_policy_active', true, 'policy_fingerprint', v_policy.policy_fingerprint, 'selection_cycle_fingerprint', v_cycle);
  end if;

  select * into v_snapshot
  from public.intelligence_memories
  where organization_id = p_organization_id
    and memory_scope = 'platform_learning_experiment_selection_policy_shadow_snapshots'
    and active = true
    and (valid_until is null or valid_until > now())
    and metadata->>'contract' = 'AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_V1'
    and metadata->>'status' = 'PROSPECTIVE_SHADOW_CHALLENGER_SNAPSHOT_RECORDED'
    and metadata->>'selection_cycle_fingerprint' = v_cycle
  order by created_at desc
  limit 1;

  if v_snapshot.id is null then
    return jsonb_build_object('success', true, 'status', 'PHASE41_SUCCESSOR_WAITING_FOR_PROSPECTIVE_PHASE30_SNAPSHOT', 'application_performed', false, 'live_policy_active', true, 'policy_fingerprint', v_policy.policy_fingerprint, 'selection_cycle_fingerprint', v_cycle);
  end if;
  if coalesce((v_snapshot.metadata->>'created_before_execution_request')::boolean, false) is not true
    or coalesce((v_snapshot.metadata->>'prospective_same_selected_portfolio_comparison_only')::boolean, false) is not true
    or coalesce((v_snapshot.metadata->>'historical_unselected_candidates_reconstructed')::boolean, true) is not false
    or coalesce((v_snapshot.metadata->>'historical_counterfactual_backtest_claimed')::boolean, true) is not false
    or jsonb_typeof(v_snapshot.metadata->'candidates') <> 'array'
    or jsonb_array_length(v_snapshot.metadata->'candidates') <> v_selection_count
  then
    raise exception 'AVANTIQO_PHASE41_PHASE30_SNAPSHOT_BOUNDARY_INVALID';
  end if;

  v_snapshot_fingerprint := lower(btrim(coalesce(v_snapshot.metadata->>'snapshot_fingerprint', '')));
  if v_snapshot_fingerprint !~ '^[a-f0-9]{32,128}$' then
    raise exception 'AVANTIQO_PHASE41_PHASE30_SNAPSHOT_FINGERPRINT_INVALID';
  end if;

  if exists (
    select 1 from public.intelligence_memories s
    where s.organization_id = p_organization_id
      and s.memory_scope = 'platform_learning_active_experiment_selections'
      and s.active = true
      and (s.valid_until is null or s.valid_until > now())
      and s.metadata->>'selection_cycle_fingerprint' = v_cycle
      and not exists (
        select 1 from jsonb_array_elements(v_snapshot.metadata->'candidates') c
        where c->>'selection_fingerprint' = s.metadata->>'selection_fingerprint'
      )
  ) then
    raise exception 'AVANTIQO_PHASE41_SELECTION_MEMBERSHIP_MISMATCH';
  end if;

  with source as (
    select
      c->>'selection_fingerprint' as selection_fingerprint,
      c->>'experiment_fingerprint' as experiment_fingerprint,
      upper(coalesce(nullif(c->>'candidate_family', ''), 'UNSPECIFIED')) as candidate_family,
      (c->>'baseline_rank')::integer as root_baseline_rank,
      (c->>'baseline_score')::numeric as root_baseline_score,
      (c->>'challenger_score')::numeric as root_legacy_challenger_score
    from jsonb_array_elements(v_snapshot.metadata->'candidates') c
  ), scored as (
    select
      *,
      public.avantiqo_phase41_composite_score_v1(
        root_baseline_score,
        root_legacy_challenger_score,
        candidate_family,
        v_policy.metadata,
        false
      ) as parent_persistent_score,
      public.avantiqo_phase41_composite_score_v1(
        root_baseline_score,
        root_legacy_challenger_score,
        candidate_family,
        v_policy.metadata,
        true
      ) as successor_persistent_score
    from source
  ), ranked as (
    select
      *,
      row_number() over (order by parent_persistent_score desc, root_baseline_rank asc, experiment_fingerprint asc)::integer as parent_persistent_rank,
      row_number() over (order by successor_persistent_score desc, root_baseline_rank asc, experiment_fingerprint asc)::integer as successor_persistent_rank
    from scored
  )
  select jsonb_agg(
    jsonb_build_object(
      'selection_fingerprint', selection_fingerprint,
      'experiment_fingerprint', experiment_fingerprint,
      'candidate_family', candidate_family,
      'baseline_rank', parent_persistent_rank,
      'persistent_rank', successor_persistent_rank,
      'baseline_score', root_baseline_score,
      'challenger_score', root_legacy_challenger_score,
      'current_parent_persistent_score', parent_persistent_score,
      'persistent_blended_score', successor_persistent_score,
      'ordering_influence_fraction', v_policy.ordering_influence_fraction,
      'phase41_exact_tested_composite', true
    ) order by parent_persistent_rank
  ) into v_assignments
  from ranked;

  if v_assignments is null or jsonb_array_length(v_assignments) <> v_selection_count then
    raise exception 'AVANTIQO_PHASE41_ASSIGNMENT_BUILD_FAILED';
  end if;

  with ranks as (
    select * from jsonb_to_recordset(v_assignments) as a(
      selection_fingerprint text,
      experiment_fingerprint text,
      candidate_family text,
      baseline_rank integer,
      persistent_rank integer,
      baseline_score numeric,
      challenger_score numeric,
      current_parent_persistent_score numeric,
      persistent_blended_score numeric,
      ordering_influence_fraction numeric,
      phase41_exact_tested_composite boolean
    )
  )
  update public.intelligence_memories s
  set
    metadata = s.metadata || jsonb_build_object(
      'selection_rank', ranks.persistent_rank,
      'phase35_contract', 'AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_V1',
      'phase35_policy_fingerprint', v_policy.policy_fingerprint,
      'phase35_release_candidate_fingerprint', v_policy.release_candidate_fingerprint,
      'phase35_baseline_policy_fingerprint', v_policy.baseline_policy_fingerprint,
      'phase35_challenger_policy_version', v_policy.challenger_policy_version,
      'phase35_ordering_influence_fraction', v_policy.ordering_influence_fraction,
      'phase35_shadow_snapshot_fingerprint', v_snapshot_fingerprint,
      'phase35_baseline_rank', ranks.baseline_rank,
      'phase35_persistent_rank', ranks.persistent_rank,
      'phase35_persistent_blended_score', ranks.persistent_blended_score,
      'phase35_selected_membership_changed', false,
      'phase35_source_numeric_score_mutated', false,
      'phase35_execution_authorized', false,
      'phase41_contract', 'AVANTIQO_PERSISTENT_POLICY_SUCCESSION_V1',
      'phase41_status', 'EXACT_TESTED_COMPOSITE_SUCCESSOR_APPLIED',
      'phase41_parent_policy_fingerprint', v_policy.baseline_policy_fingerprint,
      'phase41_parent_persistent_rank', ranks.baseline_rank,
      'phase41_successor_persistent_rank', ranks.persistent_rank,
      'phase41_parent_persistent_score', ranks.current_parent_persistent_score,
      'phase41_successor_persistent_score', ranks.persistent_blended_score,
      'phase41_raw_challenger_full_cutover_applied', false,
      'phase41_selected_membership_changed', false,
      'phase41_source_numeric_score_mutated', false,
      'phase41_execution_authorized', false,
      'phase41_applied_at', now()
    ),
    updated_at = now()
  from ranks
  where s.organization_id = p_organization_id
    and s.memory_scope = 'platform_learning_active_experiment_selections'
    and s.active = true
    and (s.valid_until is null or s.valid_until > now())
    and s.metadata->>'selection_cycle_fingerprint' = v_cycle
    and s.metadata->>'selection_fingerprint' = ranks.selection_fingerprint;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_selection_count then
    raise exception 'AVANTIQO_PHASE41_ATOMIC_RANK_UPDATE_INCOMPLETE';
  end if;

  insert into public.avantiqo_intelligence_persistent_ordering_policy_applications (
    organization_id,
    policy_id,
    policy_fingerprint,
    selection_cycle_fingerprint,
    shadow_snapshot_fingerprint,
    challenger_policy_version,
    ordering_influence_fraction,
    state,
    assignments,
    metadata
  ) values (
    p_organization_id,
    v_policy.id,
    v_policy.policy_fingerprint,
    v_cycle,
    v_snapshot_fingerprint,
    v_policy.challenger_policy_version,
    v_policy.ordering_influence_fraction,
    'APPLIED',
    v_assignments,
    jsonb_build_object(
      'same_selected_portfolio_only', true,
      'selected_membership_changed', false,
      'source_numeric_scores_mutated', false,
      'application_preceded_execution_requests', true,
      'exact_baseline_ranks_retained_for_rollback', true,
      'atomic_database_application', true,
      'phase41_exact_tested_composite_successor', true,
      'phase41_parent_policy_fingerprint', v_policy.baseline_policy_fingerprint,
      'phase41_raw_challenger_full_cutover_applied', false,
      'phase41_recursive_runtime_policy_stack', false,
      'execution_authorized', false,
      'provider_execution_authorized', false,
      'spend_authorized', false
    )
  );

  return jsonb_build_object(
    'success', true,
    'status', 'PHASE41_PERSISTENT_POLICY_SUCCESSOR_ATOMICALLY_APPLIED',
    'application_performed', true,
    'live_policy_active', true,
    'policy_fingerprint', v_policy.policy_fingerprint,
    'parent_policy_fingerprint', v_policy.baseline_policy_fingerprint,
    'selection_cycle_fingerprint', v_cycle,
    'shadow_snapshot_fingerprint', v_snapshot_fingerprint,
    'exact_tested_composite_applied', true,
    'raw_challenger_full_cutover_applied', false,
    'selected_membership_changed', false,
    'source_numeric_scores_mutated', false,
    'execution_authorized', false,
    'assignments', v_assignments
  );
end;
$$;

revoke all on function public.apply_avantiqo_policy_successor_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.apply_avantiqo_policy_successor_v1(uuid)
  to service_role;

-- Phase 40's baseline-exit trigger must not erase the current parent ordering during
-- a governed Phase 41 ACTIVE -> SUPERSEDED transition. All other exits retain the
-- original fail-safe behavior.
create or replace function public.avantiqo_close_rebased_canary_on_persistent_baseline_exit_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.state = 'ACTIVE' and new.state <> 'ACTIVE' then
    if new.state = 'SUPERSEDED'
      and coalesce((new.metadata->>'phase41_successor_activation_in_progress')::boolean, false) is true
      and coalesce(new.metadata->>'phase41_successor_policy_fingerprint', '') ~ '^[a-f0-9]{32,128}$'
    then
      return new;
    end if;

    update public.intelligence_memories
    set
      metadata = metadata || jsonb_build_object(
        'selection_rank', (metadata->>'phase35_baseline_rank')::integer,
        'phase40_canary_rank_active', false,
        'phase40_persistent_baseline_rolled_back', true,
        'phase40_exact_current_persistent_baseline_restored', false,
        'phase40_closed_at', now(),
        'phase40_selected_membership_changed', false,
        'phase40_source_numeric_score_mutated', false
      ),
      updated_at = now()
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_active_experiment_selections'
      and active = true
      and (valid_until is null or valid_until > now())
      and metadata->>'phase35_policy_fingerprint' = new.policy_fingerprint
      and coalesce(metadata->>'phase35_baseline_rank', '') ~ '^[0-9]+$';

    update public.avantiqo_intelligence_rebased_selection_policy_canary_applications
    set
      state = 'BASELINE_POLICY_ROLLED_BACK',
      restored_at = coalesce(restored_at, now()),
      updated_at = now(),
      metadata = metadata || jsonb_build_object(
        'persistent_baseline_policy_rolled_back', true,
        'exact_pre_persistent_phase35_baseline_restored', true,
        'restored_at', now()
      )
    where policy_id = new.id and state = 'APPLIED';

    update public.avantiqo_intelligence_rebased_selection_policy_canary_activations
    set
      state = 'BASELINE_ROLLED_BACK',
      closed_at = coalesce(closed_at, now()),
      close_actor_fingerprint = coalesce(
        close_actor_fingerprint,
        new.rollback_actor_fingerprint,
        md5('avantiqo-phase40-persistent-baseline-exit')
      ),
      close_reason_code = coalesce(close_reason_code, 'CURRENT_BASELINE_NOT_ACTIVE'),
      close_reason = coalesce(
        close_reason,
        new.rollback_reason,
        'The persistent baseline exited ACTIVE; the rebased canary was closed atomically.'
      ),
      updated_at = now(),
      metadata = metadata || jsonb_build_object(
        'persistent_baseline_policy_rolled_back', true,
        'exact_pre_persistent_phase35_baseline_restored', true,
        'canary_closed_in_same_transaction_as_baseline_exit', true,
        'automatic_full_policy_promotion', false,
        'execution_authorized', false,
        'provider_execution_authorized', false,
        'spend_authorized', false
      )
    where policy_id = new.id and state = 'ACTIVE';
  end if;
  return new;
end;
$$;

revoke all on function public.avantiqo_close_rebased_canary_on_persistent_baseline_exit_v1()
  from public, anon, authenticated;
grant execute on function public.avantiqo_close_rebased_canary_on_persistent_baseline_exit_v1()
  to service_role;

-- The existing Phase 35 rollback already restores phase35_baseline_rank. Phase 41
-- applications deliberately store the parent persistent rank there. This trigger then
-- reactivates the exact superseded parent after any successor rollback, including a
-- Phase 36 automatic regression rollback.
create or replace function public.avantiqo_phase41_reactivate_parent_after_successor_rollback_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_parent public.avantiqo_intelligence_persistent_ordering_policies;
begin
  if old.state = 'ACTIVE'
    and new.state = 'ROLLED_BACK'
    and coalesce(new.metadata->>'policy_generation_kind', '') = 'REBASED_SUCCESSOR_COMPOSITE_V1'
  then
    select * into v_parent
    from public.avantiqo_intelligence_persistent_ordering_policies
    where organization_id = new.organization_id
      and policy_fingerprint = new.baseline_policy_fingerprint
    limit 1;

    if v_parent.id is null
      or v_parent.state <> 'SUPERSEDED'
      or coalesce(v_parent.metadata->>'phase41_successor_policy_fingerprint', '') <> new.policy_fingerprint
    then
      raise exception 'AVANTIQO_PHASE41_PARENT_REACTIVATION_LINEAGE_INVALID';
    end if;

    update public.avantiqo_intelligence_persistent_ordering_policies
    set
      state = 'ACTIVE',
      updated_at = now(),
      metadata = metadata || jsonb_build_object(
        'phase41_successor_activation_in_progress', false,
        'phase41_reactivated_after_successor_rollback', true,
        'phase41_reactivated_at', now(),
        'phase41_rolled_back_successor_policy_fingerprint', new.policy_fingerprint
      )
    where id = v_parent.id and state = 'SUPERSEDED';

    update public.intelligence_memories
    set
      metadata = metadata || jsonb_build_object(
        'phase41_successor_rollback_applied', true,
        'phase41_parent_policy_reactivated', true,
        'phase41_parent_policy_fingerprint', v_parent.policy_fingerprint,
        'phase41_successor_policy_fingerprint', new.policy_fingerprint,
        'phase41_rolled_back_at', now(),
        'phase41_selected_membership_changed', false,
        'phase41_source_numeric_score_mutated', false
      ),
      updated_at = now()
    where organization_id = new.organization_id
      and memory_scope = 'platform_learning_active_experiment_selections'
      and active = true
      and (valid_until is null or valid_until > now())
      and metadata->>'phase35_policy_fingerprint' = new.policy_fingerprint;
  end if;
  return new;
end;
$$;

drop trigger if exists avantiqo_phase41_reactivate_parent_after_successor_rollback_v1
  on public.avantiqo_intelligence_persistent_ordering_policies;
create trigger avantiqo_phase41_reactivate_parent_after_successor_rollback_v1
after update of state on public.avantiqo_intelligence_persistent_ordering_policies
for each row
execute function public.avantiqo_phase41_reactivate_parent_after_successor_rollback_v1();

revoke all on function public.avantiqo_phase41_reactivate_parent_after_successor_rollback_v1()
  from public, anon, authenticated;
grant execute on function public.avantiqo_phase41_reactivate_parent_after_successor_rollback_v1()
  to service_role;
