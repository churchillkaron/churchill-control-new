-- Phase 36: automatic regression monitoring for an explicitly activated Phase 35
-- persistent ordering policy. Only governed Phase 28 realized outcomes from cycles
-- actually affected by the policy may trigger automatic rollback.

create table if not exists public.avantiqo_intelligence_persistent_ordering_policy_monitor_evaluations (
  id uuid primary key default gen_random_uuid(),
  contract text not null default 'AVANTIQO_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR_V1',
  organization_id uuid not null,
  policy_id uuid not null references public.avantiqo_intelligence_persistent_ordering_policies(id),
  application_id uuid not null references public.avantiqo_intelligence_persistent_ordering_policy_applications(id),
  policy_fingerprint text not null,
  selection_cycle_fingerprint text not null,
  status text not null,
  observed_assignment_count integer not null default 0,
  informative_pair_count integer not null default 0,
  baseline_pairwise_correct_count integer not null default 0,
  persistent_pairwise_correct_count integer not null default 0,
  baseline_observed_rank_regret numeric not null default 0,
  persistent_observed_rank_regret numeric not null default 0,
  regression_detected boolean not null default false,
  lineage_ambiguity_detected boolean not null default false,
  evidence jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint avantiqo_persistent_monitor_contract_check
    check (contract = 'AVANTIQO_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR_V1'),
  constraint avantiqo_persistent_monitor_status_check
    check (status in (
      'WAITING_FOR_GOVERNED_OUTCOMES',
      'NO_RANK_CHANGED_PAIRS_OBSERVED',
      'OBSERVED_NON_REGRESSIVE_SO_FAR',
      'COMPLETE_NON_REGRESSIVE_CYCLE',
      'REGRESSION_ROLLBACK_TRIGGERED',
      'LINEAGE_AMBIGUITY_ROLLBACK_TRIGGERED'
    )),
  constraint avantiqo_persistent_monitor_policy_fingerprint_check
    check (policy_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_persistent_monitor_cycle_fingerprint_check
    check (selection_cycle_fingerprint ~ '^[a-f0-9]{32,128}$'),
  constraint avantiqo_persistent_monitor_counts_check
    check (
      observed_assignment_count >= 0
      and informative_pair_count >= 0
      and baseline_pairwise_correct_count >= 0
      and persistent_pairwise_correct_count >= 0
    ),
  constraint avantiqo_persistent_monitor_regret_check
    check (
      baseline_observed_rank_regret >= 0
      and persistent_observed_rank_regret >= 0
    )
);

create unique index if not exists avantiqo_persistent_monitor_one_evaluation_per_application_idx
  on public.avantiqo_intelligence_persistent_ordering_policy_monitor_evaluations(
    policy_id,
    application_id
  );

create index if not exists avantiqo_persistent_monitor_org_updated_idx
  on public.avantiqo_intelligence_persistent_ordering_policy_monitor_evaluations(
    organization_id,
    updated_at desc
  );

alter table public.avantiqo_intelligence_persistent_ordering_policy_monitor_evaluations
  enable row level security;

revoke all on table public.avantiqo_intelligence_persistent_ordering_policy_monitor_evaluations
  from public, anon, authenticated;
grant select, insert, update on table public.avantiqo_intelligence_persistent_ordering_policy_monitor_evaluations
  to service_role;

create or replace function public.monitor_avantiqo_intelligence_persistent_ordering_policy_v1(
  p_organization_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_policy public.avantiqo_intelligence_persistent_ordering_policies;
  v_application public.avantiqo_intelligence_persistent_ordering_policy_applications;
  v_observed_count integer;
  v_informative_pair_count integer;
  v_baseline_correct_count integer;
  v_persistent_correct_count integer;
  v_baseline_regret numeric;
  v_persistent_regret numeric;
  v_assignment_count integer;
  v_ambiguous boolean;
  v_regression boolean;
  v_complete boolean;
  v_status text;
  v_system_actor text;
  v_reason text;
begin
  if p_organization_id is null then
    raise exception 'AVANTIQO_PHASE36_ORGANIZATION_REQUIRED';
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
      'contract', 'AVANTIQO_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR_V1',
      'status', 'NO_ACTIVE_PERSISTENT_ORDERING_POLICY',
      'live_policy_active', false,
      'automatic_rollback_performed', false
    );
  end if;

  if v_policy.contract <> 'AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_V1'
    or v_policy.ordering_influence_fraction <= 0
    or v_policy.ordering_influence_fraction > 0.25
    or coalesce((v_policy.metadata->>'exact_certified_influence_preserved')::boolean, false) is not true
    or coalesce((v_policy.metadata->>'candidate_membership_change_allowed')::boolean, true) is not false
    or coalesce((v_policy.metadata->>'source_numeric_score_mutation_allowed')::boolean, true) is not false
    or coalesce((v_policy.metadata->>'baseline_membership_selector_remains_authoritative')::boolean, false) is not true
  then
    v_system_actor := md5('AVANTIQO_PHASE36_AUTOMATIC_REGRESSION_MONITOR');
    v_reason := 'Phase 36 automatic rollback: active Phase 35 policy authority lineage is invalid.';
    select * into v_policy
    from public.rollback_avantiqo_intelligence_persistent_ordering_policy_v1(
      p_organization_id,
      v_policy.policy_fingerprint,
      v_system_actor,
      v_reason
    );
    return jsonb_build_object(
      'success', true,
      'contract', 'AVANTIQO_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR_V1',
      'status', 'LINEAGE_AMBIGUITY_ROLLBACK_TRIGGERED',
      'live_policy_active', false,
      'automatic_rollback_performed', true,
      'rollback_reason', v_reason
    );
  end if;

  for v_application in
    select *
    from public.avantiqo_intelligence_persistent_ordering_policy_applications
    where organization_id = p_organization_id
      and policy_id = v_policy.id
      and state = 'APPLIED'
    order by applied_at asc
  loop
    v_ambiguous := false;
    v_regression := false;
    v_observed_count := 0;
    v_informative_pair_count := 0;
    v_baseline_correct_count := 0;
    v_persistent_correct_count := 0;
    v_baseline_regret := 0;
    v_persistent_regret := 0;
    v_assignment_count := 0;

    if v_application.contract <> 'AVANTIQO_PERSISTENT_ORDERING_POLICY_APPLICATION_V1'
      or v_application.policy_fingerprint <> v_policy.policy_fingerprint
      or v_application.challenger_policy_version <> v_policy.challenger_policy_version
      or v_application.ordering_influence_fraction <> v_policy.ordering_influence_fraction
      or jsonb_typeof(v_application.assignments) <> 'array'
      or jsonb_array_length(v_application.assignments) < 2
      or coalesce((v_application.metadata->>'same_selected_portfolio_only')::boolean, false) is not true
      or coalesce((v_application.metadata->>'selected_membership_changed')::boolean, true) is not false
      or coalesce((v_application.metadata->>'source_numeric_scores_mutated')::boolean, true) is not false
      or coalesce((v_application.metadata->>'application_preceded_execution_requests')::boolean, false) is not true
      or coalesce((v_application.metadata->>'exact_baseline_ranks_retained_for_rollback')::boolean, false) is not true
      or coalesce((v_application.metadata->>'atomic_database_application')::boolean, false) is not true
    then
      v_ambiguous := true;
    end if;

    if not v_ambiguous then
      select count(*)::integer
      into v_assignment_count
      from jsonb_array_elements(v_application.assignments);

      if exists (
        select 1
        from (
          select
            assignment->>'selection_fingerprint' as selection_fingerprint,
            count(*) as occurrence_count
          from jsonb_array_elements(v_application.assignments) assignment
          group by assignment->>'selection_fingerprint'
        ) duplicate_assignments
        where selection_fingerprint is null
           or selection_fingerprint !~ '^[a-f0-9]{32,128}$'
           or occurrence_count <> 1
      ) then
        v_ambiguous := true;
      end if;
    end if;

    if not v_ambiguous and exists (
      select 1
      from jsonb_array_elements(v_application.assignments) assignment
      where coalesce(assignment->>'experiment_fingerprint', '') !~ '^[a-f0-9]{32,128}$'
         or coalesce(assignment->>'baseline_rank', '') !~ '^[0-9]+$'
         or coalesce(assignment->>'persistent_rank', '') !~ '^[0-9]+$'
         or (assignment->>'baseline_rank')::integer <= 0
         or (assignment->>'persistent_rank')::integer <= 0
         or coalesce(assignment->>'ordering_influence_fraction', '') = ''
         or (assignment->>'ordering_influence_fraction')::numeric <> v_policy.ordering_influence_fraction
    ) then
      v_ambiguous := true;
    end if;

    if not v_ambiguous and exists (
      select 1
      from (
        select
          assignment->>'selection_fingerprint' as selection_fingerprint,
          count(outcome.id) as governed_outcome_count,
          count(outcome.id) filter (
            where outcome.metadata->>'experiment_fingerprint' <> assignment->>'experiment_fingerprint'
          ) as mismatched_experiment_count
        from jsonb_array_elements(v_application.assignments) assignment
        left join public.intelligence_memories outcome
          on outcome.organization_id = p_organization_id
         and outcome.memory_scope = 'platform_learning_experiment_portfolio_outcomes'
         and outcome.active = true
         and outcome.metadata->>'contract' = 'AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_V1'
         and outcome.metadata->>'status' = 'OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED'
         and outcome.metadata->>'selection_cycle_fingerprint' = v_application.selection_cycle_fingerprint
         and outcome.metadata->>'selection_fingerprint' = assignment->>'selection_fingerprint'
         and coalesce((outcome.metadata->>'selection_request_lineage_verified')::boolean, false) is true
         and coalesce((outcome.metadata->>'immutable_execution_receipt_verified')::boolean, false) is true
         and coalesce((outcome.metadata->>'information_outcome_qualified')::boolean, false) is true
         and coalesce((outcome.metadata->>'unexecuted_candidate_outcome_inferred')::boolean, true) is false
         and coalesce((outcome.metadata->>'full_counterfactual_regret_claimed')::boolean, true) is false
         and coalesce(outcome.metadata->>'realized_information_gain_per_cost', '') ~ '^[0-9]+([.][0-9]+)?([eE][-+]?[0-9]+)?$'
        group by assignment->>'selection_fingerprint'
      ) lineage
      where governed_outcome_count > 1
         or mismatched_experiment_count > 0
    ) then
      v_ambiguous := true;
    end if;

    if v_ambiguous then
      v_status := 'LINEAGE_AMBIGUITY_ROLLBACK_TRIGGERED';
      insert into public.avantiqo_intelligence_persistent_ordering_policy_monitor_evaluations (
        organization_id,
        policy_id,
        application_id,
        policy_fingerprint,
        selection_cycle_fingerprint,
        status,
        observed_assignment_count,
        informative_pair_count,
        baseline_pairwise_correct_count,
        persistent_pairwise_correct_count,
        baseline_observed_rank_regret,
        persistent_observed_rank_regret,
        regression_detected,
        lineage_ambiguity_detected,
        evidence,
        evaluated_at,
        updated_at
      ) values (
        p_organization_id,
        v_policy.id,
        v_application.id,
        v_policy.policy_fingerprint,
        v_application.selection_cycle_fingerprint,
        v_status,
        0,
        0,
        0,
        0,
        0,
        0,
        false,
        true,
        jsonb_build_object(
          'governed_phase28_realized_outcomes_only', true,
          'unexecuted_outcomes_inferred', false,
          'historical_counterfactual_claimed', false,
          'automatic_rollback_required', true
        ),
        now(),
        now()
      )
      on conflict (policy_id, application_id) do update
      set
        status = excluded.status,
        lineage_ambiguity_detected = true,
        evidence = excluded.evidence,
        evaluated_at = excluded.evaluated_at,
        updated_at = excluded.updated_at;

      v_system_actor := md5('AVANTIQO_PHASE36_AUTOMATIC_REGRESSION_MONITOR');
      v_reason := 'Phase 36 automatic rollback: governed persistent-ordering evidence lineage is ambiguous.';
      select * into v_policy
      from public.rollback_avantiqo_intelligence_persistent_ordering_policy_v1(
        p_organization_id,
        v_policy.policy_fingerprint,
        v_system_actor,
        v_reason
      );

      return jsonb_build_object(
        'success', true,
        'contract', 'AVANTIQO_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR_V1',
        'status', v_status,
        'live_policy_active', false,
        'automatic_rollback_performed', true,
        'selection_cycle_fingerprint', v_application.selection_cycle_fingerprint,
        'rollback_reason', v_reason
      );
    end if;

    with assignments as (
      select
        assignment->>'selection_fingerprint' as selection_fingerprint,
        assignment->>'experiment_fingerprint' as experiment_fingerprint,
        (assignment->>'baseline_rank')::integer as baseline_rank,
        (assignment->>'persistent_rank')::integer as persistent_rank
      from jsonb_array_elements(v_application.assignments) assignment
    ), governed as (
      select
        a.*,
        (o.metadata->>'realized_information_gain_per_cost')::numeric as realized_information_gain_per_cost,
        o.metadata->>'outcome_fingerprint' as outcome_fingerprint
      from assignments a
      join public.intelligence_memories o
        on o.organization_id = p_organization_id
       and o.memory_scope = 'platform_learning_experiment_portfolio_outcomes'
       and o.active = true
       and o.metadata->>'contract' = 'AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_V1'
       and o.metadata->>'status' = 'OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED'
       and o.metadata->>'selection_cycle_fingerprint' = v_application.selection_cycle_fingerprint
       and o.metadata->>'selection_fingerprint' = a.selection_fingerprint
       and o.metadata->>'experiment_fingerprint' = a.experiment_fingerprint
       and coalesce((o.metadata->>'selection_request_lineage_verified')::boolean, false) is true
       and coalesce((o.metadata->>'immutable_execution_receipt_verified')::boolean, false) is true
       and coalesce((o.metadata->>'information_outcome_qualified')::boolean, false) is true
       and coalesce((o.metadata->>'unexecuted_candidate_outcome_inferred')::boolean, true) is false
       and coalesce((o.metadata->>'full_counterfactual_regret_claimed')::boolean, true) is false
       and coalesce(o.metadata->>'realized_information_gain_per_cost', '') ~ '^[0-9]+([.][0-9]+)?([eE][-+]?[0-9]+)?$'
    ), pairs as (
      select
        left_row.selection_fingerprint as left_selection_fingerprint,
        right_row.selection_fingerprint as right_selection_fingerprint,
        left_row.realized_information_gain_per_cost as left_realized,
        right_row.realized_information_gain_per_cost as right_realized,
        left_row.baseline_rank as left_baseline_rank,
        right_row.baseline_rank as right_baseline_rank,
        left_row.persistent_rank as left_persistent_rank,
        right_row.persistent_rank as right_persistent_rank
      from governed left_row
      join governed right_row
        on left_row.selection_fingerprint < right_row.selection_fingerprint
      where left_row.realized_information_gain_per_cost <> right_row.realized_information_gain_per_cost
        and (
          (left_row.baseline_rank < right_row.baseline_rank)
          <>
          (left_row.persistent_rank < right_row.persistent_rank)
        )
    ), scored as (
      select
        *,
        case
          when left_baseline_rank < right_baseline_rank
            then (left_realized > right_realized)::integer
          else (right_realized > left_realized)::integer
        end as baseline_correct,
        case
          when left_persistent_rank < right_persistent_rank
            then (left_realized > right_realized)::integer
          else (right_realized > left_realized)::integer
        end as persistent_correct,
        case
          when left_baseline_rank < right_baseline_rank
            then greatest(0::numeric, right_realized - left_realized)
          else greatest(0::numeric, left_realized - right_realized)
        end as baseline_regret,
        case
          when left_persistent_rank < right_persistent_rank
            then greatest(0::numeric, right_realized - left_realized)
          else greatest(0::numeric, left_realized - right_realized)
        end as persistent_regret
      from pairs
    )
    select
      (select count(*)::integer from governed),
      count(*)::integer,
      coalesce(sum(baseline_correct), 0)::integer,
      coalesce(sum(persistent_correct), 0)::integer,
      coalesce(sum(baseline_regret), 0),
      coalesce(sum(persistent_regret), 0)
    into
      v_observed_count,
      v_informative_pair_count,
      v_baseline_correct_count,
      v_persistent_correct_count,
      v_baseline_regret,
      v_persistent_regret
    from scored;

    v_complete := v_observed_count = v_assignment_count;
    v_regression := Boolean(
      v_informative_pair_count > 0
      and (
        v_persistent_correct_count < v_baseline_correct_count
        or v_persistent_regret > v_baseline_regret + 0.000000000001
      )
    );

    if v_regression then
      v_status := 'REGRESSION_ROLLBACK_TRIGGERED';
    elsif v_observed_count < 2 then
      v_status := 'WAITING_FOR_GOVERNED_OUTCOMES';
    elsif v_informative_pair_count = 0 then
      v_status := 'NO_RANK_CHANGED_PAIRS_OBSERVED';
    elsif v_complete then
      v_status := 'COMPLETE_NON_REGRESSIVE_CYCLE';
    else
      v_status := 'OBSERVED_NON_REGRESSIVE_SO_FAR';
    end if;

    insert into public.avantiqo_intelligence_persistent_ordering_policy_monitor_evaluations (
      organization_id,
      policy_id,
      application_id,
      policy_fingerprint,
      selection_cycle_fingerprint,
      status,
      observed_assignment_count,
      informative_pair_count,
      baseline_pairwise_correct_count,
      persistent_pairwise_correct_count,
      baseline_observed_rank_regret,
      persistent_observed_rank_regret,
      regression_detected,
      lineage_ambiguity_detected,
      evidence,
      evaluated_at,
      updated_at
    ) values (
      p_organization_id,
      v_policy.id,
      v_application.id,
      v_policy.policy_fingerprint,
      v_application.selection_cycle_fingerprint,
      v_status,
      v_observed_count,
      v_informative_pair_count,
      v_baseline_correct_count,
      v_persistent_correct_count,
      v_baseline_regret,
      v_persistent_regret,
      v_regression,
      false,
      jsonb_build_object(
        'governed_phase28_realized_outcomes_only', true,
        'unique_outcome_per_selection_required', true,
        'rank_changed_pairs_only', true,
        'incomplete_outcomes_cause_rollback', false,
        'unexecuted_outcomes_inferred', false,
        'historical_counterfactual_claimed', false,
        'baseline_pairwise_correct_count', v_baseline_correct_count,
        'persistent_pairwise_correct_count', v_persistent_correct_count,
        'baseline_observed_rank_regret', v_baseline_regret,
        'persistent_observed_rank_regret', v_persistent_regret,
        'automatic_rollback_required_on_verified_regression', true
      ),
      now(),
      now()
    )
    on conflict (policy_id, application_id) do update
    set
      status = excluded.status,
      observed_assignment_count = excluded.observed_assignment_count,
      informative_pair_count = excluded.informative_pair_count,
      baseline_pairwise_correct_count = excluded.baseline_pairwise_correct_count,
      persistent_pairwise_correct_count = excluded.persistent_pairwise_correct_count,
      baseline_observed_rank_regret = excluded.baseline_observed_rank_regret,
      persistent_observed_rank_regret = excluded.persistent_observed_rank_regret,
      regression_detected = excluded.regression_detected,
      lineage_ambiguity_detected = excluded.lineage_ambiguity_detected,
      evidence = excluded.evidence,
      evaluated_at = excluded.evaluated_at,
      updated_at = excluded.updated_at;

    if v_regression then
      v_system_actor := md5('AVANTIQO_PHASE36_AUTOMATIC_REGRESSION_MONITOR');
      v_reason := 'Phase 36 automatic rollback: persistent ordering regressed versus retained baseline ranks on governed realized outcomes.';
      select * into v_policy
      from public.rollback_avantiqo_intelligence_persistent_ordering_policy_v1(
        p_organization_id,
        v_policy.policy_fingerprint,
        v_system_actor,
        v_reason
      );

      return jsonb_build_object(
        'success', true,
        'contract', 'AVANTIQO_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR_V1',
        'status', v_status,
        'live_policy_active', false,
        'automatic_rollback_performed', true,
        'selection_cycle_fingerprint', v_application.selection_cycle_fingerprint,
        'observed_assignment_count', v_observed_count,
        'informative_pair_count', v_informative_pair_count,
        'baseline_pairwise_correct_count', v_baseline_correct_count,
        'persistent_pairwise_correct_count', v_persistent_correct_count,
        'baseline_observed_rank_regret', v_baseline_regret,
        'persistent_observed_rank_regret', v_persistent_regret,
        'rollback_reason', v_reason
      );
    end if;
  end loop;

  return jsonb_build_object(
    'success', true,
    'contract', 'AVANTIQO_PERSISTENT_ORDERING_POLICY_REGRESSION_MONITOR_V1',
    'status', 'ACTIVE_PERSISTENT_ORDERING_POLICY_MONITORED_NO_VERIFIED_REGRESSION',
    'live_policy_active', true,
    'policy_fingerprint', v_policy.policy_fingerprint,
    'automatic_rollback_performed', false,
    'governed_phase28_realized_outcomes_only', true,
    'incomplete_outcomes_cause_rollback', false,
    'lineage_ambiguity_causes_rollback', true,
    'verified_regression_causes_rollback', true
  );
end;
$$;

revoke all on function public.monitor_avantiqo_intelligence_persistent_ordering_policy_v1(uuid)
  from public, anon, authenticated;
grant execute on function public.monitor_avantiqo_intelligence_persistent_ordering_policy_v1(uuid)
  to service_role;
