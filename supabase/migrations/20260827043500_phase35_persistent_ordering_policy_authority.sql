-- Phase 35: authoritative persistent ordering-policy activation and atomic rank application.
-- This is Intelligence-only governance state. It cannot change candidate eligibility,
-- selected membership, source numeric scores, execution authority, provider state, wallet state,
-- platform knowledge, model weights, or training state.

create table if not exists public.avantiqo_intelligence_persistent_ordering_policies (
  id uuid primary key default gen_random_uuid(),
  contract text not null default 'AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_V1',
  organization_id uuid not null,
  policy_fingerprint text not null,
  release_candidate_fingerprint text not null,
  approval_fingerprint text not null,
  source_certification_fingerprint text not null,
  source_activation_fingerprint text not null,
  baseline_policy_fingerprint text not null,
  challenger_policy_version text not null,
  ordering_influence_fraction numeric not null,
  state text not null default 'ACTIVE',
  activator_fingerprint text not null,
  activation_reason text not null,
  activated_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  rollback_actor_fingerprint text,
  rollback_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avantiqo_persistent_ordering_policy_contract_check
    check (contract = 'AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_V1'),
  constraint avantiqo_persistent_ordering_policy_state_check
    check (state in ('ACTIVE', 'ROLLED_BACK', 'SUPERSEDED')),
  constraint avantiqo_persistent_ordering_policy_fingerprint_check
    check (policy_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_persistent_ordering_release_fingerprint_check
    check (release_candidate_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_persistent_ordering_approval_fingerprint_check
    check (approval_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_persistent_ordering_certification_fingerprint_check
    check (source_certification_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_persistent_ordering_source_activation_fingerprint_check
    check (source_activation_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_persistent_ordering_baseline_fingerprint_check
    check (baseline_policy_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_persistent_ordering_influence_check
    check (ordering_influence_fraction > 0 and ordering_influence_fraction <= 0.25),
  constraint avantiqo_persistent_ordering_activator_fingerprint_check
    check (activator_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_persistent_ordering_activation_reason_check
    check (length(btrim(activation_reason)) >= 12)
);

create unique index if not exists avantiqo_persistent_ordering_one_active_per_org_idx
  on public.avantiqo_intelligence_persistent_ordering_policies(organization_id)
  where state = 'ACTIVE';

create unique index if not exists avantiqo_persistent_ordering_release_once_idx
  on public.avantiqo_intelligence_persistent_ordering_policies(
    organization_id,
    release_candidate_fingerprint
  );

create unique index if not exists avantiqo_persistent_ordering_policy_fingerprint_idx
  on public.avantiqo_intelligence_persistent_ordering_policies(policy_fingerprint);

create index if not exists avantiqo_persistent_ordering_org_created_idx
  on public.avantiqo_intelligence_persistent_ordering_policies(
    organization_id,
    created_at desc
  );

create table if not exists public.avantiqo_intelligence_persistent_ordering_policy_applications (
  id uuid primary key default gen_random_uuid(),
  contract text not null default 'AVANTIQO_PERSISTENT_ORDERING_POLICY_APPLICATION_V1',
  organization_id uuid not null,
  policy_id uuid not null references public.avantiqo_intelligence_persistent_ordering_policies(id),
  policy_fingerprint text not null,
  selection_cycle_fingerprint text not null,
  shadow_snapshot_fingerprint text not null,
  challenger_policy_version text not null,
  ordering_influence_fraction numeric not null,
  state text not null default 'APPLIED',
  assignments jsonb not null,
  applied_at timestamptz not null default now(),
  rolled_back_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avantiqo_persistent_ordering_application_contract_check
    check (contract = 'AVANTIQO_PERSISTENT_ORDERING_POLICY_APPLICATION_V1'),
  constraint avantiqo_persistent_ordering_application_state_check
    check (state in ('APPLIED', 'ROLLED_BACK')),
  constraint avantiqo_persistent_ordering_application_policy_fingerprint_check
    check (policy_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_persistent_ordering_application_cycle_fingerprint_check
    check (selection_cycle_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_persistent_ordering_application_snapshot_fingerprint_check
    check (shadow_snapshot_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_persistent_ordering_application_influence_check
    check (ordering_influence_fraction > 0 and ordering_influence_fraction <= 0.25),
  constraint avantiqo_persistent_ordering_application_assignments_check
    check (jsonb_typeof(assignments) = 'array' and jsonb_array_length(assignments) >= 2)
);

create unique index if not exists avantiqo_persistent_ordering_application_cycle_once_idx
  on public.avantiqo_intelligence_persistent_ordering_policy_applications(
    organization_id,
    policy_id,
    selection_cycle_fingerprint
  );

create index if not exists avantiqo_persistent_ordering_application_policy_created_idx
  on public.avantiqo_intelligence_persistent_ordering_policy_applications(
    policy_id,
    created_at desc
  );

alter table public.avantiqo_intelligence_persistent_ordering_policies enable row level security;
alter table public.avantiqo_intelligence_persistent_ordering_policy_applications enable row level security;

revoke all on table public.avantiqo_intelligence_persistent_ordering_policies from public, anon, authenticated;
revoke all on table public.avantiqo_intelligence_persistent_ordering_policy_applications from public, anon, authenticated;
grant select, insert, update on table public.avantiqo_intelligence_persistent_ordering_policies to service_role;
grant select, insert, update on table public.avantiqo_intelligence_persistent_ordering_policy_applications to service_role;

create or replace function public.activate_avantiqo_intelligence_persistent_ordering_policy_v1(
  p_organization_id uuid,
  p_release_candidate_fingerprint text,
  p_activator_fingerprint text,
  p_activation_reason text,
  p_expected_influence_fraction numeric
)
returns public.avantiqo_intelligence_persistent_ordering_policies
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_candidate public.intelligence_memories;
  v_approval public.intelligence_memories;
  v_source_activation public.intelligence_memories;
  v_phase31_approval public.intelligence_memories;
  v_policy public.avantiqo_intelligence_persistent_ordering_policies;
  v_influence numeric;
  v_approval_fingerprint text;
  v_source_activation_fingerprint text;
  v_phase31_approval_fingerprint text;
  v_policy_fingerprint text;
begin
  if p_organization_id is null then
    raise exception 'AVANTIQO_PHASE35_ORGANIZATION_REQUIRED';
  end if;
  if lower(btrim(coalesce(p_release_candidate_fingerprint, ''))) !~ '^[a-f0-9]{32,128}$' then
    raise exception 'AVANTIQO_PHASE35_RELEASE_CANDIDATE_FINGERPRINT_INVALID';
  end if;
  if lower(btrim(coalesce(p_activator_fingerprint, ''))) !~ '^[a-f0-9]{32,128}$' then
    raise exception 'AVANTIQO_PHASE35_ACTIVATOR_FINGERPRINT_INVALID';
  end if;
  if length(btrim(coalesce(p_activation_reason, ''))) < 12 then
    raise exception 'AVANTIQO_PHASE35_ACTIVATION_REASON_REQUIRED';
  end if;
  if p_expected_influence_fraction is null
    or p_expected_influence_fraction <= 0
    or p_expected_influence_fraction > 0.25
  then
    raise exception 'AVANTIQO_PHASE35_EXPECTED_INFLUENCE_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('avantiqo_persistent_ordering_policy_v1:' || p_organization_id::text, 0)
  );

  if exists (
    select 1
    from public.avantiqo_intelligence_persistent_ordering_policies
    where organization_id = p_organization_id
      and state = 'ACTIVE'
  ) then
    raise exception 'AVANTIQO_PHASE35_ACTIVE_PERSISTENT_POLICY_ALREADY_EXISTS';
  end if;

  if exists (
    select 1
    from public.intelligence_memories
    where organization_id = p_organization_id
      and memory_scope = 'platform_learning_experiment_selection_policy_canary_activations'
      and active = true
      and (valid_until is null or valid_until > now())
      and metadata->>'contract' = 'AVANTIQO_SELECTION_POLICY_CANARY_V1'
      and metadata->>'status' = 'EXPLICIT_BOUNDED_POLICY_CANARY_ACTIVATION_RECORDED'
  ) then
    raise exception 'AVANTIQO_PHASE35_ACTIVE_PHASE32_CANARY_CONFLICT';
  end if;

  select *
  into v_candidate
  from public.intelligence_memories
  where organization_id = p_organization_id
    and memory_scope = 'platform_learning_persistent_ordering_policy_release_candidates'
    and active = true
    and (valid_until is null or valid_until > now())
    and metadata->>'release_candidate_fingerprint' = lower(btrim(p_release_candidate_fingerprint))
  order by created_at desc
  limit 1;

  if v_candidate.id is null then
    raise exception 'AVANTIQO_PHASE35_RELEASE_CANDIDATE_NOT_CURRENT';
  end if;

  if v_candidate.metadata->>'contract' <> 'AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_V1'
    or v_candidate.metadata->>'status' <> 'PERSISTENT_ORDERING_POLICY_RELEASE_CANDIDATE_READY_FOR_SEPARATE_ACTIVATION'
    or coalesce((v_candidate.metadata->>'exact_certified_influence_must_be_preserved')::boolean, false) is not true
    or coalesce((v_candidate.metadata->>'candidate_eligibility_change_allowed')::boolean, true) is not false
    or coalesce((v_candidate.metadata->>'candidate_membership_change_allowed')::boolean, true) is not false
    or coalesce((v_candidate.metadata->>'maximum_selection_count_change_allowed')::boolean, true) is not false
    or coalesce((v_candidate.metadata->>'uncertainty_group_constraint_change_allowed')::boolean, true) is not false
    or coalesce((v_candidate.metadata->>'source_numeric_score_mutation_allowed')::boolean, true) is not false
    or coalesce((v_candidate.metadata->>'full_100_percent_challenger_cutover_allowed')::boolean, true) is not false
    or coalesce((v_candidate.metadata->>'baseline_membership_selector_remains_authoritative')::boolean, false) is not true
    or coalesce((v_candidate.metadata->>'live_activation_authorized')::boolean, true) is not false
    or coalesce((v_candidate.metadata->>'live_activation_requires_separate_phase')::boolean, false) is not true
    or coalesce((v_candidate.metadata->>'exact_baseline_rollback_lineage_required')::boolean, false) is not true
  then
    raise exception 'AVANTIQO_PHASE35_RELEASE_CANDIDATE_BOUNDARY_INVALID';
  end if;

  v_influence := (v_candidate.metadata->>'exact_certified_ordering_influence_fraction')::numeric;
  if v_influence <= 0
    or v_influence > 0.25
    or v_influence <> p_expected_influence_fraction
  then
    raise exception 'AVANTIQO_PHASE35_EXACT_CERTIFIED_INFLUENCE_MISMATCH';
  end if;

  v_approval_fingerprint := lower(btrim(coalesce(v_candidate.metadata->>'approval_fingerprint', '')));
  v_source_activation_fingerprint := lower(btrim(coalesce(v_candidate.metadata->>'source_activation_fingerprint', '')));

  if v_approval_fingerprint !~ '^[a-f0-9]{32,128}$'
    or v_source_activation_fingerprint !~ '^[a-f0-9]{32,128}$'
    or lower(btrim(coalesce(v_candidate.metadata->>'source_certification_fingerprint', ''))) !~ '^[a-f0-9]{32,128}$'
    or lower(btrim(coalesce(v_candidate.metadata->>'baseline_policy_fingerprint', ''))) !~ '^[a-f0-9]{32,128}$'
  then
    raise exception 'AVANTIQO_PHASE35_RELEASE_CANDIDATE_LINEAGE_INVALID';
  end if;

  select *
  into v_approval
  from public.intelligence_memories
  where organization_id = p_organization_id
    and memory_scope = 'platform_learning_persistent_ordering_policy_promotion_approvals'
    and metadata->>'approval_fingerprint' = v_approval_fingerprint
  order by created_at desc
  limit 1;

  if v_approval.id is null
    or v_approval.metadata->>'contract' <> 'AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_V1'
    or v_approval.metadata->>'status' <> 'EXPLICIT_PERSISTENT_ORDERING_POLICY_RELEASE_CANDIDATE_APPROVAL_RECORDED'
    or coalesce((v_approval.metadata->>'independent_approver_attested')::boolean, false) is not true
    or coalesce((v_approval.metadata->>'same_actor_as_canary_activator')::boolean, true) is not false
    or coalesce((v_approval.metadata->>'same_actor_as_phase31_promotion_approver')::boolean, true) is not false
    or coalesce((v_approval.metadata->>'approval_authorizes_release_candidate_creation_only')::boolean, false) is not true
    or coalesce((v_approval.metadata->>'live_activation_authorized')::boolean, true) is not false
  then
    raise exception 'AVANTIQO_PHASE35_PHASE34_APPROVAL_LINEAGE_INVALID';
  end if;

  if lower(btrim(coalesce(v_approval.metadata->>'approver_fingerprint', ''))) = lower(btrim(p_activator_fingerprint)) then
    raise exception 'AVANTIQO_PHASE35_ACTIVATOR_MATCHES_PHASE34_APPROVER';
  end if;

  select *
  into v_source_activation
  from public.intelligence_memories
  where organization_id = p_organization_id
    and memory_scope = 'platform_learning_experiment_selection_policy_canary_activations'
    and metadata->>'activation_fingerprint' = v_source_activation_fingerprint
  order by created_at desc
  limit 1;

  if v_source_activation.id is null
    or v_source_activation.metadata->>'contract' <> 'AVANTIQO_SELECTION_POLICY_CANARY_V1'
    or lower(btrim(coalesce(v_source_activation.metadata->>'activator_fingerprint', ''))) = lower(btrim(p_activator_fingerprint))
  then
    raise exception 'AVANTIQO_PHASE35_ACTIVATOR_NOT_INDEPENDENT_FROM_CANARY';
  end if;

  v_phase31_approval_fingerprint := lower(
    btrim(coalesce(v_source_activation.metadata->>'approval_fingerprint', ''))
  );
  if v_phase31_approval_fingerprint ~ '^[a-f0-9]{32,128}$' then
    select *
    into v_phase31_approval
    from public.intelligence_memories
    where organization_id = p_organization_id
      and memory_scope = 'platform_learning_experiment_selection_policy_promotion_approvals'
      and metadata->>'approval_fingerprint' = v_phase31_approval_fingerprint
    order by created_at desc
    limit 1;

    if v_phase31_approval.id is not null
      and lower(btrim(coalesce(v_phase31_approval.metadata->>'approver_fingerprint', ''))) = lower(btrim(p_activator_fingerprint))
    then
      raise exception 'AVANTIQO_PHASE35_ACTIVATOR_MATCHES_PHASE31_APPROVER';
    end if;
  end if;

  v_policy_fingerprint := md5(
    'avantiqo-phase35|' ||
    p_organization_id::text || '|' ||
    lower(btrim(p_release_candidate_fingerprint)) || '|' ||
    lower(btrim(p_activator_fingerprint)) || '|' ||
    clock_timestamp()::text || '|' ||
    v_influence::text
  );

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
    lower(btrim(v_candidate.metadata->>'source_certification_fingerprint')),
    v_source_activation_fingerprint,
    lower(btrim(v_candidate.metadata->>'baseline_policy_fingerprint')),
    btrim(v_candidate.metadata->>'challenger_policy_version'),
    v_influence,
    'ACTIVE',
    lower(btrim(p_activator_fingerprint)),
    btrim(p_activation_reason),
    jsonb_build_object(
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
      'execution_authorized', false,
      'provider_execution_authorized', false,
      'spend_authorized', false,
      'platform_knowledge_written', false,
      'automatic_training_started', false,
      'automatic_model_weight_mutation', false
    )
  )
  returning * into v_policy;

  return v_policy;
end;
$$;

create or replace function public.apply_avantiqo_intelligence_persistent_ordering_policy_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_policy public.avantiqo_intelligence_persistent_ordering_policies;
  v_existing_application public.avantiqo_intelligence_persistent_ordering_policy_applications;
  v_snapshot public.intelligence_memories;
  v_cycle_fingerprint text;
  v_selection_count integer;
  v_min_cycle text;
  v_max_cycle text;
  v_assignments jsonb;
  v_snapshot_fingerprint text;
  v_updated_count integer;
begin
  if p_organization_id is null then
    raise exception 'AVANTIQO_PHASE35_ORGANIZATION_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('avantiqo_persistent_ordering_policy_v1:' || p_organization_id::text, 0)
  );

  select *
  into v_policy
  from public.avantiqo_intelligence_persistent_ordering_policies
  where organization_id = p_organization_id
    and state = 'ACTIVE'
  limit 1;

  if v_policy.id is null then
    return jsonb_build_object(
      'success', true,
      'status', 'NO_ACTIVE_PERSISTENT_ORDERING_POLICY',
      'application_performed', false,
      'live_policy_active', false
    );
  end if;

  select
    count(*)::integer,
    min(metadata->>'selection_cycle_fingerprint'),
    max(metadata->>'selection_cycle_fingerprint')
  into v_selection_count, v_min_cycle, v_max_cycle
  from public.intelligence_memories
  where organization_id = p_organization_id
    and memory_scope = 'platform_learning_active_experiment_selections'
    and active = true
    and (valid_until is null or valid_until > now())
    and metadata->>'contract' = 'AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1'
    and metadata->>'status' = 'SELECTED_FOR_SEPARATE_GOVERNED_EXECUTION_REVIEW'
    and coalesce((metadata->>'selection_is_not_execution_authorization')::boolean, false) is true
    and coalesce((metadata->>'execution_requires_separate_governance')::boolean, false) is true
    and coalesce((metadata->>'execution_authorized')::boolean, true) is false
    and coalesce((metadata->>'provider_execution_authorized')::boolean, true) is false
    and coalesce((metadata->>'spend_authorized')::boolean, true) is false;

  if v_selection_count < 2 then
    return jsonb_build_object(
      'success', true,
      'status', 'PERSISTENT_ORDERING_POLICY_WAITING_FOR_MULTI_SELECTION_PORTFOLIO',
      'application_performed', false,
      'live_policy_active', true,
      'policy_fingerprint', v_policy.policy_fingerprint
    );
  end if;

  if v_min_cycle is null or v_max_cycle is null or v_min_cycle <> v_max_cycle then
    raise exception 'AVANTIQO_PHASE35_ACTIVE_SELECTION_CYCLE_AMBIGUOUS';
  end if;
  v_cycle_fingerprint := v_min_cycle;

  select *
  into v_existing_application
  from public.avantiqo_intelligence_persistent_ordering_policy_applications
  where organization_id = p_organization_id
    and policy_id = v_policy.id
    and selection_cycle_fingerprint = v_cycle_fingerprint
  limit 1;

  if v_existing_application.id is not null then
    return jsonb_build_object(
      'success', true,
      'status', 'PERSISTENT_ORDERING_POLICY_ALREADY_APPLIED_TO_CURRENT_CYCLE',
      'application_performed', false,
      'live_policy_active', true,
      'policy_fingerprint', v_policy.policy_fingerprint,
      'selection_cycle_fingerprint', v_cycle_fingerprint,
      'assignments', v_existing_application.assignments
    );
  end if;

  if exists (
    select 1
    from public.intelligence_memories r
    where r.organization_id = p_organization_id
      and r.memory_scope = 'platform_learning_experiment_execution_requests'
      and r.metadata->>'contract' = 'AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_V1'
      and exists (
        select 1
        from public.intelligence_memories s
        where s.organization_id = p_organization_id
          and s.memory_scope = 'platform_learning_active_experiment_selections'
          and s.active = true
          and (s.valid_until is null or s.valid_until > now())
          and s.metadata->>'selection_cycle_fingerprint' = v_cycle_fingerprint
          and s.metadata->>'selection_fingerprint' = r.metadata->>'selection_fingerprint'
      )
  ) then
    return jsonb_build_object(
      'success', true,
      'status', 'PERSISTENT_ORDERING_POLICY_NOT_APPLIED_AFTER_EXECUTION_REQUEST_CREATION',
      'application_performed', false,
      'live_policy_active', true,
      'policy_fingerprint', v_policy.policy_fingerprint,
      'selection_cycle_fingerprint', v_cycle_fingerprint
    );
  end if;

  select *
  into v_snapshot
  from public.intelligence_memories
  where organization_id = p_organization_id
    and memory_scope = 'platform_learning_experiment_selection_policy_shadow_snapshots'
    and active = true
    and (valid_until is null or valid_until > now())
    and metadata->>'contract' = 'AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_V1'
    and metadata->>'status' = 'PROSPECTIVE_SHADOW_CHALLENGER_SNAPSHOT_RECORDED'
    and metadata->>'selection_cycle_fingerprint' = v_cycle_fingerprint
  order by created_at desc
  limit 1;

  if v_snapshot.id is null then
    return jsonb_build_object(
      'success', true,
      'status', 'PERSISTENT_ORDERING_POLICY_WAITING_FOR_PROSPECTIVE_PHASE30_SNAPSHOT',
      'application_performed', false,
      'live_policy_active', true,
      'policy_fingerprint', v_policy.policy_fingerprint,
      'selection_cycle_fingerprint', v_cycle_fingerprint
    );
  end if;

  if coalesce((v_snapshot.metadata->>'created_before_execution_request')::boolean, false) is not true
    or coalesce((v_snapshot.metadata->>'historical_unselected_candidates_reconstructed')::boolean, true) is not false
    or coalesce((v_snapshot.metadata->>'historical_counterfactual_backtest_claimed')::boolean, true) is not false
    or coalesce((v_snapshot.metadata->>'prospective_same_selected_portfolio_comparison_only')::boolean, false) is not true
    or coalesce((v_snapshot.metadata->>'challenger_score_can_exceed_baseline')::boolean, true) is not false
    or v_snapshot.metadata->>'challenger_policy_version' <> v_policy.challenger_policy_version
  then
    raise exception 'AVANTIQO_PHASE35_PHASE30_SNAPSHOT_BOUNDARY_INVALID';
  end if;

  if jsonb_typeof(v_snapshot.metadata->'candidates') <> 'array'
    or jsonb_array_length(v_snapshot.metadata->'candidates') <> v_selection_count
    or (v_snapshot.metadata->>'candidate_count')::integer <> v_selection_count
  then
    raise exception 'AVANTIQO_PHASE35_SELECTION_MEMBERSHIP_MISMATCH';
  end if;

  if exists (
    select 1
    from public.intelligence_memories s
    where s.organization_id = p_organization_id
      and s.memory_scope = 'platform_learning_active_experiment_selections'
      and s.active = true
      and (s.valid_until is null or s.valid_until > now())
      and s.metadata->>'selection_cycle_fingerprint' = v_cycle_fingerprint
      and not exists (
        select 1
        from jsonb_array_elements(v_snapshot.metadata->'candidates') candidate
        where candidate->>'selection_fingerprint' = s.metadata->>'selection_fingerprint'
      )
  ) then
    raise exception 'AVANTIQO_PHASE35_SELECTION_MEMBERSHIP_MISMATCH';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_snapshot.metadata->'candidates') candidate
    join public.intelligence_memories s
      on s.organization_id = p_organization_id
     and s.memory_scope = 'platform_learning_active_experiment_selections'
     and s.active = true
     and (s.valid_until is null or s.valid_until > now())
     and s.metadata->>'selection_cycle_fingerprint' = v_cycle_fingerprint
     and s.metadata->>'selection_fingerprint' = candidate->>'selection_fingerprint'
    where (candidate->>'baseline_rank')::integer <> (s.metadata->>'selection_rank')::integer
       or (candidate->>'baseline_score')::numeric <> (s.metadata->>'risk_adjusted_information_gain_per_cost')::numeric
       or (candidate->>'baseline_score')::numeric <= 0
       or (candidate->>'challenger_score')::numeric < 0
       or (candidate->>'challenger_score')::numeric > (candidate->>'baseline_score')::numeric
  ) then
    raise exception 'AVANTIQO_PHASE35_SNAPSHOT_SCORE_OR_RANK_LINEAGE_INVALID';
  end if;

  v_snapshot_fingerprint := lower(btrim(coalesce(v_snapshot.metadata->>'snapshot_fingerprint', '')));
  if v_snapshot_fingerprint !~ '^[a-f0-9]{32,128}$' then
    raise exception 'AVANTIQO_PHASE35_SNAPSHOT_FINGERPRINT_INVALID';
  end if;

  with candidates as (
    select
      candidate->>'selection_fingerprint' as selection_fingerprint,
      candidate->>'experiment_fingerprint' as experiment_fingerprint,
      (candidate->>'baseline_rank')::integer as baseline_rank,
      (candidate->>'baseline_score')::numeric as baseline_score,
      (candidate->>'challenger_score')::numeric as challenger_score,
      (
        (candidate->>'baseline_score')::numeric * (1 - v_policy.ordering_influence_fraction)
        +
        (candidate->>'challenger_score')::numeric * v_policy.ordering_influence_fraction
      ) as persistent_blended_score
    from jsonb_array_elements(v_snapshot.metadata->'candidates') candidate
  ), ranked as (
    select
      *,
      row_number() over (
        order by persistent_blended_score desc, baseline_rank asc, experiment_fingerprint asc
      )::integer as persistent_rank
    from candidates
  )
  select jsonb_agg(
    jsonb_build_object(
      'selection_fingerprint', selection_fingerprint,
      'experiment_fingerprint', experiment_fingerprint,
      'baseline_rank', baseline_rank,
      'persistent_rank', persistent_rank,
      'baseline_score', baseline_score,
      'challenger_score', challenger_score,
      'persistent_blended_score', persistent_blended_score,
      'ordering_influence_fraction', v_policy.ordering_influence_fraction
    )
    order by baseline_rank
  )
  into v_assignments
  from ranked;

  if v_assignments is null or jsonb_array_length(v_assignments) <> v_selection_count then
    raise exception 'AVANTIQO_PHASE35_ASSIGNMENT_BUILD_FAILED';
  end if;

  with ranks as (
    select *
    from jsonb_to_recordset(v_assignments) as assignment(
      selection_fingerprint text,
      experiment_fingerprint text,
      baseline_rank integer,
      persistent_rank integer,
      baseline_score numeric,
      challenger_score numeric,
      persistent_blended_score numeric,
      ordering_influence_fraction numeric
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
      'phase35_applied_at', now()
    ),
    updated_at = now()
  from ranks
  where s.organization_id = p_organization_id
    and s.memory_scope = 'platform_learning_active_experiment_selections'
    and s.active = true
    and (s.valid_until is null or s.valid_until > now())
    and s.metadata->>'selection_cycle_fingerprint' = v_cycle_fingerprint
    and s.metadata->>'selection_fingerprint' = ranks.selection_fingerprint;

  get diagnostics v_updated_count = row_count;
  if v_updated_count <> v_selection_count then
    raise exception 'AVANTIQO_PHASE35_ATOMIC_RANK_UPDATE_INCOMPLETE';
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
    v_cycle_fingerprint,
    v_snapshot_fingerprint,
    v_policy.challenger_policy_version,
    v_policy.ordering_influence_fraction,
    'APPLIED',
    v_assignments,
    jsonb_build_object(
      'same_selected_portfolio_only', true,
      'selected_membership_changed', false,
      'source_numeric_scores_mutated', false,
      'baseline_membership_selector_remains_authoritative', true,
      'application_preceded_execution_requests', true,
      'exact_baseline_ranks_retained_for_rollback', true,
      'atomic_database_application', true,
      'execution_authorized', false,
      'provider_execution_authorized', false,
      'spend_authorized', false,
      'platform_knowledge_written', false,
      'automatic_training_started', false
    )
  );

  return jsonb_build_object(
    'success', true,
    'status', 'PERSISTENT_ORDERING_POLICY_ATOMICALLY_APPLIED',
    'application_performed', true,
    'live_policy_active', true,
    'policy_fingerprint', v_policy.policy_fingerprint,
    'selection_cycle_fingerprint', v_cycle_fingerprint,
    'shadow_snapshot_fingerprint', v_snapshot_fingerprint,
    'ordering_influence_fraction', v_policy.ordering_influence_fraction,
    'selected_membership_changed', false,
    'source_numeric_scores_mutated', false,
    'execution_authorized', false,
    'assignments', v_assignments
  );
end;
$$;

create or replace function public.rollback_avantiqo_intelligence_persistent_ordering_policy_v1(
  p_organization_id uuid,
  p_policy_fingerprint text,
  p_rollback_actor_fingerprint text,
  p_rollback_reason text
)
returns public.avantiqo_intelligence_persistent_ordering_policies
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_policy public.avantiqo_intelligence_persistent_ordering_policies;
  v_restored_count integer;
begin
  if p_organization_id is null then
    raise exception 'AVANTIQO_PHASE35_ORGANIZATION_REQUIRED';
  end if;
  if lower(btrim(coalesce(p_policy_fingerprint, ''))) !~ '^[a-f0-9]{32,128}$' then
    raise exception 'AVANTIQO_PHASE35_POLICY_FINGERPRINT_INVALID';
  end if;
  if lower(btrim(coalesce(p_rollback_actor_fingerprint, ''))) !~ '^[a-f0-9]{32,128}$' then
    raise exception 'AVANTIQO_PHASE35_ROLLBACK_ACTOR_FINGERPRINT_INVALID';
  end if;
  if length(btrim(coalesce(p_rollback_reason, ''))) < 12 then
    raise exception 'AVANTIQO_PHASE35_ROLLBACK_REASON_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('avantiqo_persistent_ordering_policy_v1:' || p_organization_id::text, 0)
  );

  select *
  into v_policy
  from public.avantiqo_intelligence_persistent_ordering_policies
  where organization_id = p_organization_id
    and policy_fingerprint = lower(btrim(p_policy_fingerprint))
  limit 1;

  if v_policy.id is null then
    raise exception 'AVANTIQO_PHASE35_POLICY_NOT_FOUND';
  end if;

  if v_policy.state <> 'ACTIVE' then
    return v_policy;
  end if;

  update public.intelligence_memories
  set
    metadata = metadata || jsonb_build_object(
      'selection_rank', (metadata->>'phase35_baseline_rank')::integer,
      'phase35_rollback_applied', true,
      'phase35_rollback_reason', btrim(p_rollback_reason),
      'phase35_rolled_back_at', now(),
      'phase35_selected_membership_changed', false,
      'phase35_source_numeric_score_mutated', false
    ),
    updated_at = now()
  where organization_id = p_organization_id
    and memory_scope = 'platform_learning_active_experiment_selections'
    and active = true
    and (valid_until is null or valid_until > now())
    and metadata->>'phase35_policy_fingerprint' = v_policy.policy_fingerprint
    and coalesce(metadata->>'phase35_baseline_rank', '') ~ '^[0-9]+$';

  get diagnostics v_restored_count = row_count;

  update public.avantiqo_intelligence_persistent_ordering_policy_applications
  set
    state = 'ROLLED_BACK',
    rolled_back_at = coalesce(rolled_back_at, now()),
    updated_at = now(),
    metadata = metadata || jsonb_build_object(
      'rollback_reason', btrim(p_rollback_reason),
      'rollback_actor_fingerprint', lower(btrim(p_rollback_actor_fingerprint)),
      'exact_baseline_restoration_requested', true
    )
  where policy_id = v_policy.id
    and state = 'APPLIED';

  update public.avantiqo_intelligence_persistent_ordering_policies
  set
    state = 'ROLLED_BACK',
    rolled_back_at = now(),
    rollback_actor_fingerprint = lower(btrim(p_rollback_actor_fingerprint)),
    rollback_reason = btrim(p_rollback_reason),
    updated_at = now(),
    metadata = metadata || jsonb_build_object(
      'exact_baseline_restoration_performed_for_current_active_cycle', true,
      'restored_current_selection_count', v_restored_count,
      'automatic_or_explicit_rollback_recorded', true,
      'candidate_membership_changed_by_rollback', false,
      'source_numeric_scores_mutated_by_rollback', false
    )
  where id = v_policy.id
  returning * into v_policy;

  return v_policy;
end;
$$;

revoke all on function public.activate_avantiqo_intelligence_persistent_ordering_policy_v1(uuid, text, text, text, numeric) from public, anon, authenticated;
revoke all on function public.apply_avantiqo_intelligence_persistent_ordering_policy_v1(uuid) from public, anon, authenticated;
revoke all on function public.rollback_avantiqo_intelligence_persistent_ordering_policy_v1(uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.activate_avantiqo_intelligence_persistent_ordering_policy_v1(uuid, text, text, text, numeric) to service_role;
grant execute on function public.apply_avantiqo_intelligence_persistent_ordering_policy_v1(uuid) to service_role;
grant execute on function public.rollback_avantiqo_intelligence_persistent_ordering_policy_v1(uuid, text, text, text) to service_role;
