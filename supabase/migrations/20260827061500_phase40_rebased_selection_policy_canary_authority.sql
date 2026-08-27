-- Phase 40: authoritative rebased selection-policy canary activation, atomic application,
-- exact rollback to the active persistent-policy baseline, and persistent-baseline exit interlock.
-- Intelligence-only governance. Candidate membership, source numeric scores, execution authority,
-- providers, wallet, RunPod, platform knowledge, training and model weights remain outside this authority.

create table if not exists public.avantiqo_intelligence_rebased_selection_policy_canary_activations (
  id uuid primary key default gen_random_uuid(),
  contract text not null default 'AVANTIQO_REBASED_SELECTION_POLICY_CANARY_AUTHORITY_V1',
  organization_id uuid not null,
  policy_id uuid not null references public.avantiqo_intelligence_persistent_ordering_policies(id),
  activation_fingerprint text not null,
  current_baseline_policy_fingerprint text not null,
  release_candidate_fingerprint text not null,
  approval_fingerprint text not null,
  source_review_fingerprint text not null,
  source_proposal_fingerprint text not null,
  source_research_epoch_fingerprint text not null,
  rollback_plan_fingerprint text not null,
  challenger_policy_version text not null,
  canary_influence_fraction numeric not null,
  cycle_limit integer not null,
  state text not null default 'ACTIVE',
  activator_fingerprint text not null,
  activation_reason text not null,
  activated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  closed_at timestamptz,
  close_actor_fingerprint text,
  close_reason_code text,
  close_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avantiqo_rebased_canary_activation_contract_check
    check (contract = 'AVANTIQO_REBASED_SELECTION_POLICY_CANARY_AUTHORITY_V1'),
  constraint avantiqo_rebased_canary_activation_state_check
    check (state in ('ACTIVE', 'COMPLETED', 'ROLLED_BACK', 'BASELINE_ROLLED_BACK')),
  constraint avantiqo_rebased_canary_activation_fingerprint_check
    check (activation_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_rebased_canary_activation_baseline_fingerprint_check
    check (current_baseline_policy_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_rebased_canary_activation_release_fingerprint_check
    check (release_candidate_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_rebased_canary_activation_approval_fingerprint_check
    check (approval_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_rebased_canary_activation_review_fingerprint_check
    check (source_review_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_rebased_canary_activation_proposal_fingerprint_check
    check (source_proposal_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_rebased_canary_activation_epoch_fingerprint_check
    check (source_research_epoch_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_rebased_canary_activation_rollback_fingerprint_check
    check (rollback_plan_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_rebased_canary_activation_influence_check
    check (canary_influence_fraction > 0 and canary_influence_fraction <= 0.25),
  constraint avantiqo_rebased_canary_activation_cycle_limit_check
    check (cycle_limit between 1 and 3),
  constraint avantiqo_rebased_canary_activation_activator_check
    check (activator_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_rebased_canary_activation_reason_check
    check (length(btrim(activation_reason)) >= 12),
  constraint avantiqo_rebased_canary_activation_expiry_check
    check (expires_at > activated_at)
);

create unique index if not exists avantiqo_rebased_canary_one_active_per_org_idx
  on public.avantiqo_intelligence_rebased_selection_policy_canary_activations(organization_id)
  where state = 'ACTIVE';

create unique index if not exists avantiqo_rebased_canary_activation_fingerprint_idx
  on public.avantiqo_intelligence_rebased_selection_policy_canary_activations(activation_fingerprint);

create unique index if not exists avantiqo_rebased_canary_release_once_idx
  on public.avantiqo_intelligence_rebased_selection_policy_canary_activations(
    organization_id,
    release_candidate_fingerprint
  );

create index if not exists avantiqo_rebased_canary_policy_created_idx
  on public.avantiqo_intelligence_rebased_selection_policy_canary_activations(
    policy_id,
    created_at desc
  );

create table if not exists public.avantiqo_intelligence_rebased_selection_policy_canary_applications (
  id uuid primary key default gen_random_uuid(),
  contract text not null default 'AVANTIQO_REBASED_SELECTION_POLICY_CANARY_APPLICATION_V1',
  organization_id uuid not null,
  activation_id uuid not null references public.avantiqo_intelligence_rebased_selection_policy_canary_activations(id),
  policy_id uuid not null references public.avantiqo_intelligence_persistent_ordering_policies(id),
  application_fingerprint text not null,
  current_baseline_policy_fingerprint text not null,
  selection_cycle_fingerprint text not null,
  phase35_application_id uuid not null references public.avantiqo_intelligence_persistent_ordering_policy_applications(id),
  phase38_snapshot_fingerprint text not null,
  challenger_policy_version text not null,
  canary_influence_fraction numeric not null,
  state text not null default 'APPLIED',
  assignments jsonb not null,
  applied_at timestamptz not null default now(),
  restored_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avantiqo_rebased_canary_application_contract_check
    check (contract = 'AVANTIQO_REBASED_SELECTION_POLICY_CANARY_APPLICATION_V1'),
  constraint avantiqo_rebased_canary_application_state_check
    check (state in ('APPLIED', 'BASELINE_RESTORED', 'BASELINE_POLICY_ROLLED_BACK')),
  constraint avantiqo_rebased_canary_application_fingerprint_check
    check (application_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_rebased_canary_application_baseline_fingerprint_check
    check (current_baseline_policy_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_rebased_canary_application_cycle_fingerprint_check
    check (selection_cycle_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_rebased_canary_application_snapshot_fingerprint_check
    check (phase38_snapshot_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_rebased_canary_application_influence_check
    check (canary_influence_fraction > 0 and canary_influence_fraction <= 0.25),
  constraint avantiqo_rebased_canary_application_assignments_check
    check (jsonb_typeof(assignments) = 'array' and jsonb_array_length(assignments) >= 2)
);

create unique index if not exists avantiqo_rebased_canary_application_fingerprint_idx
  on public.avantiqo_intelligence_rebased_selection_policy_canary_applications(application_fingerprint);

create unique index if not exists avantiqo_rebased_canary_application_cycle_once_idx
  on public.avantiqo_intelligence_rebased_selection_policy_canary_applications(
    organization_id,
    activation_id,
    selection_cycle_fingerprint
  );

create index if not exists avantiqo_rebased_canary_application_activation_created_idx
  on public.avantiqo_intelligence_rebased_selection_policy_canary_applications(
    activation_id,
    created_at desc
  );

alter table public.avantiqo_intelligence_rebased_selection_policy_canary_activations enable row level security;
alter table public.avantiqo_intelligence_rebased_selection_policy_canary_applications enable row level security;

revoke all on table public.avantiqo_intelligence_rebased_selection_policy_canary_activations from public, anon, authenticated;
revoke all on table public.avantiqo_intelligence_rebased_selection_policy_canary_applications from public, anon, authenticated;
grant select, insert, update on table public.avantiqo_intelligence_rebased_selection_policy_canary_activations to service_role;
grant select, insert, update on table public.avantiqo_intelligence_rebased_selection_policy_canary_applications to service_role;

create or replace function public.activate_avantiqo_intelligence_rebased_selection_policy_canary_v1(
  p_organization_id uuid,
  p_release_candidate_fingerprint text,
  p_activator_fingerprint text,
  p_activation_reason text,
  p_expected_canary_influence_fraction numeric,
  p_expected_cycle_limit integer
)
returns public.avantiqo_intelligence_rebased_selection_policy_canary_activations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_candidate public.intelligence_memories;
  v_approval public.intelligence_memories;
  v_policy public.avantiqo_intelligence_persistent_ordering_policies;
  v_activation public.avantiqo_intelligence_rebased_selection_policy_canary_activations;
  v_approval_fingerprint text;
  v_approver_fingerprint text;
  v_influence numeric;
  v_cycle_limit integer;
  v_activation_fingerprint text;
  v_expires_at timestamptz;
begin
  if p_organization_id is null then
    raise exception 'AVANTIQO_PHASE40_ORGANIZATION_REQUIRED';
  end if;
  if lower(btrim(coalesce(p_release_candidate_fingerprint, ''))) !~ '^[a-f0-9]{32,128}$' then
    raise exception 'AVANTIQO_PHASE40_RELEASE_CANDIDATE_FINGERPRINT_INVALID';
  end if;
  if lower(btrim(coalesce(p_activator_fingerprint, ''))) !~ '^[a-f0-9]{32,128}$' then
    raise exception 'AVANTIQO_PHASE40_ACTIVATOR_FINGERPRINT_INVALID';
  end if;
  if length(btrim(coalesce(p_activation_reason, ''))) < 12 then
    raise exception 'AVANTIQO_PHASE40_ACTIVATION_REASON_REQUIRED';
  end if;
  if p_expected_canary_influence_fraction is null
    or p_expected_canary_influence_fraction <= 0
    or p_expected_canary_influence_fraction > 0.25
  then
    raise exception 'AVANTIQO_PHASE40_EXPECTED_CANARY_INFLUENCE_INVALID';
  end if;
  if p_expected_cycle_limit is null or p_expected_cycle_limit < 1 or p_expected_cycle_limit > 3 then
    raise exception 'AVANTIQO_PHASE40_EXPECTED_CYCLE_LIMIT_INVALID';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('avantiqo_persistent_ordering_policy_v1:' || p_organization_id::text, 0)
  );

  if exists (
    select 1
    from public.avantiqo_intelligence_rebased_selection_policy_canary_activations
    where organization_id = p_organization_id
      and state = 'ACTIVE'
  ) then
    raise exception 'AVANTIQO_PHASE40_ACTIVE_REBASED_CANARY_ALREADY_EXISTS';
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
    raise exception 'AVANTIQO_PHASE40_ACTIVE_LEGACY_PHASE32_CANARY_CONFLICT';
  end if;

  select *
  into v_policy
  from public.avantiqo_intelligence_persistent_ordering_policies
  where organization_id = p_organization_id
    and state = 'ACTIVE'
  limit 1;

  if v_policy.id is null then
    raise exception 'AVANTIQO_PHASE40_ACTIVE_PERSISTENT_BASELINE_REQUIRED';
  end if;

  select *
  into v_candidate
  from public.intelligence_memories
  where organization_id = p_organization_id
    and memory_scope = 'platform_learning_rebased_selection_policy_canary_release_candidates'
    and active = true
    and (valid_until is null or valid_until > now())
    and metadata->>'release_candidate_fingerprint' = lower(btrim(p_release_candidate_fingerprint))
  order by created_at desc
  limit 1;

  if v_candidate.id is null then
    raise exception 'AVANTIQO_PHASE40_RELEASE_CANDIDATE_NOT_CURRENT';
  end if;

  if v_candidate.metadata->>'contract' <> 'AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_V1'
    or v_candidate.metadata->>'status' <> 'REBASED_CANARY_RELEASE_CANDIDATE_READY_FOR_SEPARATE_ACTIVATION'
    or coalesce((v_candidate.metadata->>'release_candidate_is_not_activation')::boolean, false) is not true
    or coalesce((v_candidate.metadata->>'activation_requires_separate_phase40_call')::boolean, false) is not true
    or coalesce((v_candidate.metadata->>'application_requires_separate_phase40_runtime')::boolean, false) is not true
    or coalesce((v_candidate.metadata->>'exact_current_baseline_rollback_required')::boolean, false) is not true
    or coalesce((v_candidate.metadata->>'current_baseline_must_remain_active_at_activation')::boolean, false) is not true
    or coalesce((v_candidate.metadata->>'canary_influence_is_incremental_relative_to_current_persistent_baseline')::boolean, false) is not true
    or coalesce((v_candidate.metadata->>'current_persistent_policy_is_not_replaced_by_release_candidate')::boolean, false) is not true
    or coalesce((v_candidate.metadata->>'same_selected_portfolio_only')::boolean, false) is not true
    or coalesce((v_candidate.metadata->>'full_100_percent_challenger_cutover_allowed')::boolean, true) is not false
    or coalesce((v_candidate.metadata->>'selected_membership_change_authorized')::boolean, true) is not false
    or coalesce((v_candidate.metadata->>'source_numeric_score_mutation_authorized')::boolean, true) is not false
    or coalesce((v_candidate.metadata->>'live_ordering_mutation_authorized')::boolean, true) is not false
  then
    raise exception 'AVANTIQO_PHASE40_RELEASE_CANDIDATE_BOUNDARY_INVALID';
  end if;

  if lower(btrim(coalesce(v_candidate.metadata->>'current_baseline_policy_fingerprint', ''))) <> v_policy.policy_fingerprint
    or btrim(coalesce(v_candidate.metadata->>'current_baseline_policy_version', '')) <> v_policy.challenger_policy_version
    or (v_candidate.metadata->>'current_baseline_policy_ordering_influence_fraction')::numeric <> v_policy.ordering_influence_fraction
  then
    raise exception 'AVANTIQO_PHASE40_RELEASE_CANDIDATE_BASELINE_CHANGED';
  end if;

  v_influence := (v_candidate.metadata->>'approved_canary_influence_fraction')::numeric;
  v_cycle_limit := (v_candidate.metadata->>'approved_canary_cycles')::integer;
  if v_influence <= 0
    or v_influence > 0.25
    or v_influence <> p_expected_canary_influence_fraction
    or v_cycle_limit < 1
    or v_cycle_limit > 3
    or v_cycle_limit <> p_expected_cycle_limit
  then
    raise exception 'AVANTIQO_PHASE40_RELEASE_CANDIDATE_EXACT_BOUND_MISMATCH';
  end if;

  v_approval_fingerprint := lower(btrim(coalesce(v_candidate.metadata->>'approval_fingerprint', '')));
  if v_approval_fingerprint !~ '^[a-f0-9]{32,128}$'
    or lower(btrim(coalesce(v_candidate.metadata->>'source_review_fingerprint', ''))) !~ '^[a-f0-9]{32,128}$'
    or lower(btrim(coalesce(v_candidate.metadata->>'source_proposal_fingerprint', ''))) !~ '^[a-f0-9]{32,128}$'
    or lower(btrim(coalesce(v_candidate.metadata->>'source_research_epoch_fingerprint', ''))) !~ '^[a-f0-9]{32,128}$'
    or lower(btrim(coalesce(v_candidate.metadata->>'rollback_plan_fingerprint', ''))) !~ '^[a-f0-9]{32,128}$'
  then
    raise exception 'AVANTIQO_PHASE40_RELEASE_CANDIDATE_LINEAGE_INVALID';
  end if;

  select *
  into v_approval
  from public.intelligence_memories
  where organization_id = p_organization_id
    and memory_scope = 'platform_learning_rebased_selection_policy_promotion_approvals'
    and active = true
    and (valid_until is null or valid_until > now())
    and metadata->>'approval_fingerprint' = v_approval_fingerprint
  order by created_at desc
  limit 1;

  if v_approval.id is null
    or v_approval.metadata->>'contract' <> 'AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_V1'
    or v_approval.metadata->>'status' <> 'EXPLICIT_REBASED_POLICY_CANARY_RELEASE_APPROVAL_RECORDED'
    or coalesce((v_approval.metadata->>'independent_approver_attested')::boolean, false) is not true
    or coalesce((v_approval.metadata->>'same_actor_as_phase38_evidence_generator')::boolean, true) is not false
    or coalesce((v_approval.metadata->>'same_actor_as_current_baseline_activator')::boolean, true) is not false
    or coalesce((v_approval.metadata->>'immutable_actor_independence_verified')::boolean, false) is not true
    or coalesce((v_approval.metadata->>'approval_is_not_activation')::boolean, false) is not true
    or coalesce((v_approval.metadata->>'canary_activation_requires_separate_phase')::boolean, false) is not true
    or lower(btrim(coalesce(v_approval.metadata->>'current_baseline_policy_fingerprint', ''))) <> v_policy.policy_fingerprint
    or btrim(coalesce(v_approval.metadata->>'challenger_policy_version', '')) <> btrim(v_candidate.metadata->>'challenger_policy_version')
    or (v_approval.metadata->>'approved_canary_influence_fraction')::numeric <> v_influence
    or (v_approval.metadata->>'approved_canary_cycles')::integer <> v_cycle_limit
  then
    raise exception 'AVANTIQO_PHASE40_APPROVAL_LINEAGE_INVALID';
  end if;

  v_approver_fingerprint := lower(btrim(coalesce(v_approval.metadata->>'approver_fingerprint', '')));
  if v_approver_fingerprint !~ '^[a-f0-9]{32,128}$'
    or v_approver_fingerprint = lower(btrim(p_activator_fingerprint))
    or lower(btrim(v_policy.activator_fingerprint)) = lower(btrim(p_activator_fingerprint))
  then
    raise exception 'AVANTIQO_PHASE40_ACTIVATOR_INDEPENDENCE_REQUIRED';
  end if;

  v_activation_fingerprint := md5(
    'avantiqo-phase40|' ||
    p_organization_id::text || '|' ||
    lower(btrim(p_release_candidate_fingerprint)) || '|' ||
    lower(btrim(p_activator_fingerprint)) || '|' ||
    clock_timestamp()::text
  );
  v_expires_at := now() + interval '7 days';

  insert into public.avantiqo_intelligence_rebased_selection_policy_canary_activations (
    organization_id,
    policy_id,
    activation_fingerprint,
    current_baseline_policy_fingerprint,
    release_candidate_fingerprint,
    approval_fingerprint,
    source_review_fingerprint,
    source_proposal_fingerprint,
    source_research_epoch_fingerprint,
    rollback_plan_fingerprint,
    challenger_policy_version,
    canary_influence_fraction,
    cycle_limit,
    state,
    activator_fingerprint,
    activation_reason,
    expires_at,
    metadata
  ) values (
    p_organization_id,
    v_policy.id,
    v_activation_fingerprint,
    v_policy.policy_fingerprint,
    lower(btrim(p_release_candidate_fingerprint)),
    v_approval_fingerprint,
    lower(btrim(v_candidate.metadata->>'source_review_fingerprint')),
    lower(btrim(v_candidate.metadata->>'source_proposal_fingerprint')),
    lower(btrim(v_candidate.metadata->>'source_research_epoch_fingerprint')),
    lower(btrim(v_candidate.metadata->>'rollback_plan_fingerprint')),
    btrim(v_candidate.metadata->>'challenger_policy_version'),
    v_influence,
    v_cycle_limit,
    'ACTIVE',
    lower(btrim(p_activator_fingerprint)),
    btrim(p_activation_reason),
    v_expires_at,
    jsonb_build_object(
      'canary_scope', 'ORDERING_WITHIN_ALREADY_SELECTED_PORTFOLIO_ONLY',
      'current_persistent_policy_is_baseline', true,
      'canary_influence_is_incremental_relative_to_current_persistent_baseline', true,
      'exact_current_persistent_baseline_ranks_retained_for_rollback', true,
      'same_selected_portfolio_only', true,
      'selected_membership_change_authorized', false,
      'source_numeric_score_mutation_authorized', false,
      'full_100_percent_challenger_cutover_allowed', false,
      'automatic_regression_rollback_required', true,
      'atomic_database_application_required', true,
      'execution_authorized', false,
      'provider_execution_authorized', false,
      'spend_authorized', false,
      'provider_called_here', false,
      'wallet_write_performed_here', false,
      'runpod_job_submitted', false,
      'platform_knowledge_written', false,
      'automatic_training_started', false,
      'automatic_model_weight_mutation', false
    )
  )
  returning * into v_activation;

  return v_activation;
end;
$$;

create or replace function public.close_avantiqo_intelligence_rebased_selection_policy_canary_v1(
  p_organization_id uuid,
  p_activation_fingerprint text,
  p_close_actor_fingerprint text,
  p_close_reason_code text,
  p_close_reason text
)
returns public.avantiqo_intelligence_rebased_selection_policy_canary_activations
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_activation public.avantiqo_intelligence_rebased_selection_policy_canary_activations;
  v_policy public.avantiqo_intelligence_persistent_ordering_policies;
  v_state text;
  v_restored_count integer := 0;
begin
  if p_organization_id is null then
    raise exception 'AVANTIQO_PHASE40_ORGANIZATION_REQUIRED';
  end if;
  if lower(btrim(coalesce(p_activation_fingerprint, ''))) !~ '^[a-f0-9]{32,128}$' then
    raise exception 'AVANTIQO_PHASE40_ACTIVATION_FINGERPRINT_INVALID';
  end if;
  if lower(btrim(coalesce(p_close_actor_fingerprint, ''))) !~ '^[a-f0-9]{32,128}$' then
    raise exception 'AVANTIQO_PHASE40_CLOSE_ACTOR_FINGERPRINT_INVALID';
  end if;
  if btrim(coalesce(p_close_reason_code, '')) not in (
    'EXPLICIT_GOVERNED_ROLLBACK',
    'GOVERNED_CANARY_REGRESSION_DETECTED',
    'GOVERNED_CANARY_LINEAGE_AMBIGUITY',
    'CANARY_CYCLE_LIMIT_COMPLETE',
    'ACTIVATION_EXPIRED',
    'CURRENT_BASELINE_NOT_ACTIVE'
  ) then
    raise exception 'AVANTIQO_PHASE40_CLOSE_REASON_CODE_INVALID';
  end if;
  if length(btrim(coalesce(p_close_reason, ''))) < 12 then
    raise exception 'AVANTIQO_PHASE40_CLOSE_REASON_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('avantiqo_persistent_ordering_policy_v1:' || p_organization_id::text, 0)
  );

  select *
  into v_activation
  from public.avantiqo_intelligence_rebased_selection_policy_canary_activations
  where organization_id = p_organization_id
    and activation_fingerprint = lower(btrim(p_activation_fingerprint))
  limit 1;

  if v_activation.id is null then
    raise exception 'AVANTIQO_PHASE40_ACTIVATION_NOT_FOUND';
  end if;
  if v_activation.state <> 'ACTIVE' then
    return v_activation;
  end if;

  select *
  into v_policy
  from public.avantiqo_intelligence_persistent_ordering_policies
  where id = v_activation.policy_id
    and organization_id = p_organization_id
    and policy_fingerprint = v_activation.current_baseline_policy_fingerprint
    and state = 'ACTIVE'
  limit 1;

  if v_policy.id is not null then
    update public.intelligence_memories
    set
      metadata = metadata || jsonb_build_object(
        'selection_rank', (metadata->>'phase40_current_persistent_baseline_rank')::integer,
        'phase40_canary_rank_active', false,
        'phase40_exact_current_persistent_baseline_restored', true,
        'phase40_close_reason_code', btrim(p_close_reason_code),
        'phase40_close_reason', btrim(p_close_reason),
        'phase40_closed_at', now(),
        'phase40_selected_membership_changed', false,
        'phase40_source_numeric_score_mutated', false
      ),
      updated_at = now()
    where organization_id = p_organization_id
      and memory_scope = 'platform_learning_active_experiment_selections'
      and active = true
      and (valid_until is null or valid_until > now())
      and metadata->>'phase40_canary_activation_fingerprint' = v_activation.activation_fingerprint
      and metadata->>'phase40_current_baseline_policy_fingerprint' = v_activation.current_baseline_policy_fingerprint
      and coalesce(metadata->>'phase40_current_persistent_baseline_rank', '') ~ '^[0-9]+$';

    get diagnostics v_restored_count = row_count;

    update public.avantiqo_intelligence_rebased_selection_policy_canary_applications
    set
      state = 'BASELINE_RESTORED',
      restored_at = coalesce(restored_at, now()),
      updated_at = now(),
      metadata = metadata || jsonb_build_object(
        'exact_current_persistent_baseline_restored', true,
        'close_reason_code', btrim(p_close_reason_code),
        'close_reason', btrim(p_close_reason),
        'restored_at', now()
      )
    where activation_id = v_activation.id
      and state = 'APPLIED';

    v_state := case
      when btrim(p_close_reason_code) = 'CANARY_CYCLE_LIMIT_COMPLETE' then 'COMPLETED'
      else 'ROLLED_BACK'
    end;
  else
    if exists (
      select 1
      from public.intelligence_memories
      where organization_id = p_organization_id
        and memory_scope = 'platform_learning_active_experiment_selections'
        and active = true
        and (valid_until is null or valid_until > now())
        and metadata->>'phase40_canary_activation_fingerprint' = v_activation.activation_fingerprint
        and coalesce((metadata->>'phase40_canary_rank_active')::boolean, false) is true
    ) then
      raise exception 'AVANTIQO_PHASE40_BASELINE_MISSING_WITH_ACTIVE_CANARY_RANKS_FAIL_CLOSED';
    end if;

    update public.avantiqo_intelligence_rebased_selection_policy_canary_applications
    set
      state = 'BASELINE_POLICY_ROLLED_BACK',
      restored_at = coalesce(restored_at, now()),
      updated_at = now(),
      metadata = metadata || jsonb_build_object(
        'persistent_baseline_policy_rolled_back', true,
        'close_reason_code', btrim(p_close_reason_code),
        'close_reason', btrim(p_close_reason),
        'restored_at', now()
      )
    where activation_id = v_activation.id
      and state = 'APPLIED';

    v_state := 'BASELINE_ROLLED_BACK';
  end if;

  update public.avantiqo_intelligence_rebased_selection_policy_canary_activations
  set
    state = v_state,
    closed_at = now(),
    close_actor_fingerprint = lower(btrim(p_close_actor_fingerprint)),
    close_reason_code = btrim(p_close_reason_code),
    close_reason = btrim(p_close_reason),
    updated_at = now(),
    metadata = metadata || jsonb_build_object(
      'exact_current_persistent_baseline_restored', v_policy.id is not null,
      'persistent_baseline_policy_still_active_at_close', v_policy.id is not null,
      'restored_current_selection_count', v_restored_count,
      'selected_membership_changed_by_close', false,
      'source_numeric_scores_mutated_by_close', false,
      'automatic_full_policy_promotion', false,
      'execution_authorized', false,
      'provider_execution_authorized', false,
      'spend_authorized', false
    )
  where id = v_activation.id
  returning * into v_activation;

  return v_activation;
end;
$$;

create or replace function public.apply_avantiqo_intelligence_rebased_selection_policy_canary_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_activation public.avantiqo_intelligence_rebased_selection_policy_canary_activations;
  v_policy public.avantiqo_intelligence_persistent_ordering_policies;
  v_phase35_application public.avantiqo_intelligence_persistent_ordering_policy_applications;
  v_existing_application public.avantiqo_intelligence_rebased_selection_policy_canary_applications;
  v_snapshot public.intelligence_memories;
  v_selection_count integer;
  v_min_cycle text;
  v_max_cycle text;
  v_cycle_fingerprint text;
  v_snapshot_fingerprint text;
  v_application_fingerprint text;
  v_application_count integer;
  v_assignments jsonb;
  v_updated_count integer;
begin
  if p_organization_id is null then
    raise exception 'AVANTIQO_PHASE40_ORGANIZATION_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('avantiqo_persistent_ordering_policy_v1:' || p_organization_id::text, 0)
  );

  select *
  into v_activation
  from public.avantiqo_intelligence_rebased_selection_policy_canary_activations
  where organization_id = p_organization_id
    and state = 'ACTIVE'
  limit 1;

  if v_activation.id is null then
    return jsonb_build_object(
      'success', true,
      'status', 'NO_ACTIVE_REBASED_SELECTION_POLICY_CANARY',
      'application_performed', false,
      'canary_active', false,
      'execution_authorized', false
    );
  end if;

  if v_activation.expires_at <= now() then
    return jsonb_build_object(
      'success', true,
      'status', 'REBASED_CANARY_ACTIVATION_EXPIRED_REQUIRES_CLOSE',
      'application_performed', false,
      'canary_active', true,
      'activation_fingerprint', v_activation.activation_fingerprint,
      'execution_authorized', false
    );
  end if;

  select *
  into v_policy
  from public.avantiqo_intelligence_persistent_ordering_policies
  where id = v_activation.policy_id
    and organization_id = p_organization_id
    and policy_fingerprint = v_activation.current_baseline_policy_fingerprint
    and state = 'ACTIVE'
  limit 1;

  if v_policy.id is null then
    return jsonb_build_object(
      'success', true,
      'status', 'CURRENT_PERSISTENT_BASELINE_NOT_ACTIVE_REQUIRES_CLOSE',
      'application_performed', false,
      'canary_active', true,
      'activation_fingerprint', v_activation.activation_fingerprint,
      'execution_authorized', false
    );
  end if;

  select count(*)::integer
  into v_application_count
  from public.avantiqo_intelligence_rebased_selection_policy_canary_applications
  where activation_id = v_activation.id;

  if v_application_count >= v_activation.cycle_limit then
    return jsonb_build_object(
      'success', true,
      'status', 'REBASED_CANARY_CYCLE_LIMIT_REACHED_AWAITING_CLOSE',
      'application_performed', false,
      'canary_active', true,
      'activation_fingerprint', v_activation.activation_fingerprint,
      'applied_cycle_count', v_application_count,
      'cycle_limit', v_activation.cycle_limit,
      'execution_authorized', false
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
      'status', 'REBASED_CANARY_WAITING_FOR_MULTI_SELECTION_PORTFOLIO',
      'application_performed', false,
      'canary_active', true,
      'activation_fingerprint', v_activation.activation_fingerprint,
      'execution_authorized', false
    );
  end if;

  if v_min_cycle is null or v_max_cycle is null or v_min_cycle <> v_max_cycle then
    raise exception 'AVANTIQO_PHASE40_ACTIVE_SELECTION_CYCLE_AMBIGUOUS';
  end if;
  v_cycle_fingerprint := v_min_cycle;

  select *
  into v_existing_application
  from public.avantiqo_intelligence_rebased_selection_policy_canary_applications
  where organization_id = p_organization_id
    and activation_id = v_activation.id
    and selection_cycle_fingerprint = v_cycle_fingerprint
  limit 1;

  if v_existing_application.id is not null then
    return jsonb_build_object(
      'success', true,
      'status', 'REBASED_CANARY_ALREADY_APPLIED_TO_CURRENT_CYCLE',
      'application_performed', false,
      'canary_active', true,
      'activation_fingerprint', v_activation.activation_fingerprint,
      'selection_cycle_fingerprint', v_cycle_fingerprint,
      'assignments', v_existing_application.assignments,
      'execution_authorized', false
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
      'status', 'REBASED_CANARY_NOT_APPLIED_AFTER_EXECUTION_REQUEST_CREATION',
      'application_performed', false,
      'canary_active', true,
      'activation_fingerprint', v_activation.activation_fingerprint,
      'selection_cycle_fingerprint', v_cycle_fingerprint,
      'execution_authorized', false
    );
  end if;

  select *
  into v_phase35_application
  from public.avantiqo_intelligence_persistent_ordering_policy_applications
  where organization_id = p_organization_id
    and policy_id = v_policy.id
    and selection_cycle_fingerprint = v_cycle_fingerprint
    and state = 'APPLIED'
  limit 1;

  if v_phase35_application.id is null then
    return jsonb_build_object(
      'success', true,
      'status', 'REBASED_CANARY_WAITING_FOR_CURRENT_PERSISTENT_BASELINE_APPLICATION',
      'application_performed', false,
      'canary_active', true,
      'activation_fingerprint', v_activation.activation_fingerprint,
      'selection_cycle_fingerprint', v_cycle_fingerprint,
      'execution_authorized', false
    );
  end if;

  select *
  into v_snapshot
  from public.intelligence_memories
  where organization_id = p_organization_id
    and memory_scope = 'platform_learning_rebased_selection_policy_challenger_snapshots'
    and active = true
    and (valid_until is null or valid_until > now())
    and metadata->>'contract' = 'AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_V1'
    and metadata->>'status' = 'PROSPECTIVE_REBASED_CHALLENGER_SNAPSHOT_RECORDED'
    and metadata->>'selection_cycle_fingerprint' = v_cycle_fingerprint
    and metadata->>'proposal_fingerprint' = v_activation.source_proposal_fingerprint
    and metadata->>'current_baseline_policy_fingerprint' = v_activation.current_baseline_policy_fingerprint
    and metadata->>'challenger_policy_version' = v_activation.challenger_policy_version
  order by created_at desc
  limit 1;

  if v_snapshot.id is null then
    return jsonb_build_object(
      'success', true,
      'status', 'REBASED_CANARY_WAITING_FOR_PROSPECTIVE_PHASE38_SNAPSHOT',
      'application_performed', false,
      'canary_active', true,
      'activation_fingerprint', v_activation.activation_fingerprint,
      'selection_cycle_fingerprint', v_cycle_fingerprint,
      'execution_authorized', false
    );
  end if;

  if coalesce((v_snapshot.metadata->>'captured_after_current_persistent_policy_application')::boolean, false) is not true
    or coalesce((v_snapshot.metadata->>'created_before_execution_request')::boolean, false) is not true
    or coalesce((v_snapshot.metadata->>'prospective_same_selected_portfolio_comparison_only')::boolean, false) is not true
    or coalesce((v_snapshot.metadata->>'historical_pre_activation_outcomes_used')::boolean, true) is not false
    or coalesce((v_snapshot.metadata->>'historical_unselected_candidates_reconstructed')::boolean, true) is not false
    or coalesce((v_snapshot.metadata->>'full_counterfactual_backtest_claimed')::boolean, true) is not false
    or coalesce((v_snapshot.metadata->>'challenger_score_can_exceed_current_persistent_baseline')::boolean, true) is not false
  then
    raise exception 'AVANTIQO_PHASE40_PHASE38_SNAPSHOT_BOUNDARY_INVALID';
  end if;

  if jsonb_typeof(v_snapshot.metadata->'candidates') <> 'array'
    or jsonb_array_length(v_snapshot.metadata->'candidates') <> v_selection_count
    or (v_snapshot.metadata->>'candidate_count')::integer <> v_selection_count
    or jsonb_typeof(v_phase35_application.assignments) <> 'array'
    or jsonb_array_length(v_phase35_application.assignments) <> v_selection_count
  then
    raise exception 'AVANTIQO_PHASE40_SELECTION_MEMBERSHIP_MISMATCH';
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
    raise exception 'AVANTIQO_PHASE40_SELECTION_MEMBERSHIP_MISMATCH';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_snapshot.metadata->'candidates') candidate
    join jsonb_array_elements(v_phase35_application.assignments) baseline
      on baseline->>'selection_fingerprint' = candidate->>'selection_fingerprint'
    join public.intelligence_memories s
      on s.organization_id = p_organization_id
     and s.memory_scope = 'platform_learning_active_experiment_selections'
     and s.active = true
     and (s.valid_until is null or s.valid_until > now())
     and s.metadata->>'selection_cycle_fingerprint' = v_cycle_fingerprint
     and s.metadata->>'selection_fingerprint' = candidate->>'selection_fingerprint'
    where (candidate->>'current_persistent_baseline_rank')::integer <> (baseline->>'persistent_rank')::integer
       or (candidate->>'current_persistent_baseline_score')::numeric <> (baseline->>'persistent_blended_score')::numeric
       or (candidate->>'current_persistent_baseline_rank')::integer <> (s.metadata->>'selection_rank')::integer
       or s.metadata->>'phase35_policy_fingerprint' <> v_activation.current_baseline_policy_fingerprint
       or (candidate->>'rebased_challenger_score')::numeric < 0
       or (candidate->>'rebased_challenger_score')::numeric > (candidate->>'current_persistent_baseline_score')::numeric
  ) then
    raise exception 'AVANTIQO_PHASE40_PHASE38_TO_PHASE35_BASELINE_LINEAGE_INVALID';
  end if;

  v_snapshot_fingerprint := lower(btrim(coalesce(v_snapshot.metadata->>'snapshot_fingerprint', '')));
  if v_snapshot_fingerprint !~ '^[a-f0-9]{32,128}$' then
    raise exception 'AVANTIQO_PHASE40_SNAPSHOT_FINGERPRINT_INVALID';
  end if;

  with candidates as (
    select
      candidate->>'selection_fingerprint' as selection_fingerprint,
      candidate->>'experiment_fingerprint' as experiment_fingerprint,
      (candidate->>'current_persistent_baseline_rank')::integer as current_persistent_baseline_rank,
      (candidate->>'current_persistent_baseline_score')::numeric as current_persistent_baseline_score,
      (candidate->>'rebased_challenger_rank')::integer as rebased_challenger_rank,
      (candidate->>'rebased_challenger_score')::numeric as rebased_challenger_score,
      (
        (candidate->>'current_persistent_baseline_score')::numeric * (1 - v_activation.canary_influence_fraction)
        +
        (candidate->>'rebased_challenger_score')::numeric * v_activation.canary_influence_fraction
      ) as canary_blended_score
    from jsonb_array_elements(v_snapshot.metadata->'candidates') candidate
  ), ranked as (
    select
      *,
      row_number() over (
        order by canary_blended_score desc, current_persistent_baseline_rank asc, experiment_fingerprint asc
      )::integer as canary_rank
    from candidates
  )
  select jsonb_agg(
    jsonb_build_object(
      'selection_fingerprint', selection_fingerprint,
      'experiment_fingerprint', experiment_fingerprint,
      'current_persistent_baseline_rank', current_persistent_baseline_rank,
      'current_persistent_baseline_score', current_persistent_baseline_score,
      'rebased_challenger_rank', rebased_challenger_rank,
      'rebased_challenger_score', rebased_challenger_score,
      'canary_rank', canary_rank,
      'canary_blended_score', canary_blended_score,
      'canary_influence_fraction', v_activation.canary_influence_fraction
    )
    order by current_persistent_baseline_rank
  )
  into v_assignments
  from ranked;

  if v_assignments is null or jsonb_array_length(v_assignments) <> v_selection_count then
    raise exception 'AVANTIQO_PHASE40_ASSIGNMENT_BUILD_FAILED';
  end if;

  with ranks as (
    select *
    from jsonb_to_recordset(v_assignments) as assignment(
      selection_fingerprint text,
      experiment_fingerprint text,
      current_persistent_baseline_rank integer,
      current_persistent_baseline_score numeric,
      rebased_challenger_rank integer,
      rebased_challenger_score numeric,
      canary_rank integer,
      canary_blended_score numeric,
      canary_influence_fraction numeric
    )
  )
  update public.intelligence_memories s
  set
    metadata = s.metadata || jsonb_build_object(
      'selection_rank', ranks.canary_rank,
      'phase40_contract', 'AVANTIQO_REBASED_SELECTION_POLICY_CANARY_AUTHORITY_V1',
      'phase40_status', 'BOUNDED_REBASED_CANARY_RANK_APPLIED',
      'phase40_canary_activation_fingerprint', v_activation.activation_fingerprint,
      'phase40_release_candidate_fingerprint', v_activation.release_candidate_fingerprint,
      'phase40_current_baseline_policy_fingerprint', v_activation.current_baseline_policy_fingerprint,
      'phase40_challenger_policy_version', v_activation.challenger_policy_version,
      'phase40_phase38_snapshot_fingerprint', v_snapshot_fingerprint,
      'phase40_current_persistent_baseline_rank', ranks.current_persistent_baseline_rank,
      'phase40_canary_rank', ranks.canary_rank,
      'phase40_canary_influence_fraction', v_activation.canary_influence_fraction,
      'phase40_canary_blended_score', ranks.canary_blended_score,
      'phase40_canary_rank_active', true,
      'phase40_selected_membership_changed', false,
      'phase40_source_numeric_score_mutated', false,
      'phase40_source_score_increase_applied', false,
      'phase40_execution_authorized', false,
      'phase40_applied_at', now()
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
    raise exception 'AVANTIQO_PHASE40_ATOMIC_RANK_UPDATE_INCOMPLETE';
  end if;

  v_application_fingerprint := md5(
    'avantiqo-phase40-application|' ||
    v_activation.activation_fingerprint || '|' ||
    v_cycle_fingerprint || '|' ||
    v_snapshot_fingerprint
  );

  insert into public.avantiqo_intelligence_rebased_selection_policy_canary_applications (
    organization_id,
    activation_id,
    policy_id,
    application_fingerprint,
    current_baseline_policy_fingerprint,
    selection_cycle_fingerprint,
    phase35_application_id,
    phase38_snapshot_fingerprint,
    challenger_policy_version,
    canary_influence_fraction,
    state,
    assignments,
    metadata
  ) values (
    p_organization_id,
    v_activation.id,
    v_policy.id,
    v_application_fingerprint,
    v_activation.current_baseline_policy_fingerprint,
    v_cycle_fingerprint,
    v_phase35_application.id,
    v_snapshot_fingerprint,
    v_activation.challenger_policy_version,
    v_activation.canary_influence_fraction,
    'APPLIED',
    v_assignments,
    jsonb_build_object(
      'same_selected_portfolio_only', true,
      'selected_membership_changed', false,
      'source_numeric_scores_mutated', false,
      'source_score_increase_applied', false,
      'application_preceded_execution_requests', true,
      'exact_current_persistent_baseline_ranks_retained_for_rollback', true,
      'current_persistent_policy_remains_authoritative_baseline', true,
      'canary_influence_is_incremental_relative_to_current_persistent_baseline', true,
      'full_100_percent_challenger_cutover_applied', false,
      'atomic_database_application', true,
      'execution_authorized', false,
      'provider_execution_authorized', false,
      'spend_authorized', false,
      'provider_called_here', false,
      'wallet_write_performed_here', false,
      'runpod_job_submitted', false,
      'platform_knowledge_written', false,
      'automatic_training_started', false,
      'automatic_model_weight_mutation', false
    )
  );

  return jsonb_build_object(
    'success', true,
    'status', 'REBASED_SELECTION_POLICY_CANARY_ATOMICALLY_APPLIED',
    'application_performed', true,
    'canary_active', true,
    'activation_fingerprint', v_activation.activation_fingerprint,
    'application_fingerprint', v_application_fingerprint,
    'selection_cycle_fingerprint', v_cycle_fingerprint,
    'phase38_snapshot_fingerprint', v_snapshot_fingerprint,
    'canary_influence_fraction', v_activation.canary_influence_fraction,
    'selected_membership_changed', false,
    'source_numeric_scores_mutated', false,
    'execution_authorized', false,
    'assignments', v_assignments
  );
end;
$$;

-- If the persistent baseline exits ACTIVE for any reason, the rebased canary cannot survive it.
-- Restore the original Phase 35 baseline ranks and close Phase 40 inside the same transaction.
create or replace function public.avantiqo_close_rebased_canary_on_persistent_baseline_exit_v1()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.state = 'ACTIVE' and new.state <> 'ACTIVE' then
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
    where policy_id = new.id
      and state = 'APPLIED';

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
    where policy_id = new.id
      and state = 'ACTIVE';
  end if;

  return new;
end;
$$;

drop trigger if exists avantiqo_rebased_canary_persistent_baseline_exit_v1
  on public.avantiqo_intelligence_persistent_ordering_policies;

create trigger avantiqo_rebased_canary_persistent_baseline_exit_v1
after update of state on public.avantiqo_intelligence_persistent_ordering_policies
for each row
execute function public.avantiqo_close_rebased_canary_on_persistent_baseline_exit_v1();

revoke all on function public.activate_avantiqo_intelligence_rebased_selection_policy_canary_v1(uuid, text, text, text, numeric, integer) from public, anon, authenticated;
revoke all on function public.apply_avantiqo_intelligence_rebased_selection_policy_canary_v1(uuid) from public, anon, authenticated;
revoke all on function public.close_avantiqo_intelligence_rebased_selection_policy_canary_v1(uuid, text, text, text, text) from public, anon, authenticated;
revoke all on function public.avantiqo_close_rebased_canary_on_persistent_baseline_exit_v1() from public, anon, authenticated;

grant execute on function public.activate_avantiqo_intelligence_rebased_selection_policy_canary_v1(uuid, text, text, text, numeric, integer) to service_role;
grant execute on function public.apply_avantiqo_intelligence_rebased_selection_policy_canary_v1(uuid) to service_role;
grant execute on function public.close_avantiqo_intelligence_rebased_selection_policy_canary_v1(uuid, text, text, text, text) to service_role;
grant execute on function public.avantiqo_close_rebased_canary_on_persistent_baseline_exit_v1() to service_role;
