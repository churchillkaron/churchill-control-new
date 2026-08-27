import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  reconcileAvantiqoCalibrationBackfilledExperimentPortfolio,
} from "@/lib/intelligence/runtime/AvantiqoCalibrationBackfilledExperimentPortfolioRuntime";
import {
  AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT,
  AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoExperimentPortfolioPerformanceRuntime";

export const AVANTIQO_LONG_HORIZON_POLICY_ADAPTED_EXPERIMENT_PORTFOLIO_CONTRACT =
  "AVANTIQO_LONG_HORIZON_POLICY_ADAPTED_EXPERIMENT_PORTFOLIO_V1";

const MEMORY_TABLE = "intelligence_memories";
const SELECTION_SCOPE = "platform_learning_active_experiment_selections";
const ESTIMATE_SCOPE = "platform_learning_experiment_information_estimates";
const ACTIONABLE_FAMILIES = new Set(["SCIENTIFIC", "TRANSFER"]);
const MAX_SELECTIONS_PER_FLAGGED_FAMILY_PER_CYCLE = 1;
const ABSOLUTE_MAX_ADAPTATION_PASSES = 64;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function activeAndUnexpired(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  const validUntil = Date.parse(text(row.valid_until, 120));
  return !Number.isFinite(validUntil) || validUntil > nowMs;
}

function finiteAtLeast(value, minimum) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum;
}

function profileMaturityVerified(metadata) {
  return Boolean(
    metadata.mature_long_horizon_evidence === true &&
      finiteAtLeast(
        metadata.execution_outcome_count,
        Number(metadata.minimum_mature_executions),
      ) &&
      finiteAtLeast(
        metadata.distinct_experiment_count,
        Number(metadata.minimum_mature_distinct_experiments),
      ) &&
      finiteAtLeast(
        metadata.distinct_selection_cycle_count,
        Number(metadata.minimum_mature_selection_cycles),
      ) &&
      finiteAtLeast(
        metadata.qualified_information_outcome_count,
        Number(metadata.minimum_mature_information_outcomes),
      )
  );
}

function profilePolicy(row) {
  const metadata = object(row?.metadata);
  const family = text(metadata.candidate_family, 40).toUpperCase();
  const current = activeAndUnexpired(row);
  const contractValid =
    text(metadata.contract, 180) ===
    AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT;
  const mature = current && contractValid && profileMaturityVerified(metadata);
  const reviewRecommended = Boolean(
    mature &&
      text(metadata.status, 180) ===
        "LONG_HORIZON_SELECTION_POLICY_REVIEW_RECOMMENDED" &&
      metadata.selection_policy_review_recommended === true &&
      metadata.single_execution_can_change_selection_policy === false &&
      metadata.automatic_selection_penalty_applied === false &&
      metadata.automatic_selection_boost_applied === false &&
      metadata.separate_governed_selection_policy_integration_required === true
  );
  const repeatedInformationOverprediction = Boolean(
    reviewRecommended && metadata.repeated_information_overprediction === true,
  );
  const repeatedExecutionFailure = Boolean(
    reviewRecommended && metadata.repeated_execution_failure === true,
  );
  const repeatedRankMisordering = Boolean(
    reviewRecommended && metadata.repeated_rank_misordering === true,
  );
  const actionable = Boolean(
    ACTIONABLE_FAMILIES.has(family) &&
      (repeatedInformationOverprediction || repeatedExecutionFailure)
  );
  return {
    family,
    current,
    mature,
    review_recommended: reviewRecommended,
    actionable,
    repeated_information_overprediction: repeatedInformationOverprediction,
    repeated_execution_failure: repeatedExecutionFailure,
    repeated_rank_misordering: repeatedRankMisordering,
    rank_misordering_is_advisory_only: repeatedRankMisordering,
    execution_outcome_count: Number(metadata.execution_outcome_count) || 0,
    distinct_experiment_count: Number(metadata.distinct_experiment_count) || 0,
    distinct_selection_cycle_count:
      Number(metadata.distinct_selection_cycle_count) || 0,
    qualified_information_outcome_count:
      Number(metadata.qualified_information_outcome_count) || 0,
    profile_fingerprint: text(metadata.profile_fingerprint, 128),
    updated_at: text(row?.updated_at, 120),
  };
}

async function loadLongHorizonPolicies(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_SCOPE)
    .eq("active", true)
    .limit(100);
  if (result.error) throw result.error;

  const byFamily = new Map();
  const globalProfiles = [];
  for (const row of list(result.data)) {
    const policy = profilePolicy(row);
    if (policy.family === "GLOBAL" || !policy.family) {
      globalProfiles.push(policy);
      continue;
    }
    if (!ACTIONABLE_FAMILIES.has(policy.family)) continue;
    const previous = byFamily.get(policy.family);
    const previousMs = Date.parse(text(previous?.updated_at, 120));
    const currentMs = Date.parse(text(policy.updated_at, 120));
    if (
      !previous ||
      (Number.isFinite(currentMs) &&
        (!Number.isFinite(previousMs) || currentMs > previousMs))
    ) {
      byFamily.set(policy.family, policy);
    }
  }

  return {
    family_policies: [...byFamily.values()],
    global_profiles: globalProfiles,
  };
}

function safePassLimit(candidateCount) {
  const required =
    Math.ceil(Math.max(0, Number(candidateCount) || 0) / 3) + 2;
  return Math.max(
    2,
    Math.min(ABSOLUTE_MAX_ADAPTATION_PASSES, required),
  );
}

function excessFlaggedSelections(selectedExperiments, familyPolicies) {
  const actionableByFamily = new Map(
    list(familyPolicies)
      .filter((policy) => policy.actionable === true)
      .map((policy) => [policy.family, policy]),
  );
  const grouped = new Map();
  for (const selected of list(selectedExperiments)) {
    const family = text(selected.family, 40).toUpperCase();
    if (!actionableByFamily.has(family)) continue;
    if (!grouped.has(family)) grouped.set(family, []);
    grouped.get(family).push(selected);
  }

  const excess = [];
  for (const [family, selected] of grouped.entries()) {
    selected.sort((left, right) => Number(left.rank || 0) - Number(right.rank || 0));
    const keep = selected.slice(0, MAX_SELECTIONS_PER_FLAGGED_FAMILY_PER_CYCLE);
    const reject = selected.slice(MAX_SELECTIONS_PER_FLAGGED_FAMILY_PER_CYCLE);
    const policy = actionableByFamily.get(family);
    for (const item of reject) {
      excess.push({
        family,
        experiment_fingerprint: text(item.experiment_fingerprint, 128),
        experiment_version_fingerprint: text(
          item.experiment_version_fingerprint,
          128,
        ),
        rank: Number(item.rank || 0),
        kept_family_version_fingerprints: keep
          .map((entry) => text(entry.experiment_version_fingerprint, 128))
          .filter(Boolean),
        policy,
      });
    }
  }
  return excess;
}

async function retireLongHorizonExcessEstimateEvidence(
  organizationId,
  excessSelections,
  pass,
) {
  const nowIso = new Date().toISOString();
  let retired = 0;

  for (const excess of list(excessSelections)) {
    const version = text(excess.experiment_version_fingerprint, 128);
    if (!version) continue;
    const current = await supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,metadata")
      .eq("organization_id", organizationId)
      .eq("memory_scope", ESTIMATE_SCOPE)
      .eq("active", true)
      .eq("metadata->>experiment_version_fingerprint", version)
      .limit(1000);
    if (current.error) throw current.error;

    for (const row of list(current.data)) {
      const metadata = object(row.metadata);
      const result = await supabaseAdmin
        .from(MEMORY_TABLE)
        .update({
          active: false,
          forgotten_at: nowIso,
          updated_at: nowIso,
          metadata: {
            ...metadata,
            phase29_contract:
              AVANTIQO_LONG_HORIZON_POLICY_ADAPTED_EXPERIMENT_PORTFOLIO_CONTRACT,
            phase29_status:
              "ESTIMATE_EVIDENCE_RETIRED_TO_ENFORCE_LONG_HORIZON_FAMILY_CAP",
            phase29_candidate_family: excess.family,
            phase29_experiment_version_fingerprint: version,
            phase29_adaptation_pass: pass,
            phase29_retired_at: nowIso,
            phase29_original_numeric_estimate_values_mutated: false,
            phase29_estimate_no_longer_counts_for_current_selection: true,
            phase29_family_selection_cap:
              MAX_SELECTIONS_PER_FLAGGED_FAMILY_PER_CYCLE,
            phase29_repeated_information_overprediction:
              excess.policy?.repeated_information_overprediction === true,
            phase29_repeated_execution_failure:
              excess.policy?.repeated_execution_failure === true,
            phase29_rank_misordering_used_as_automatic_action: false,
            execution_authorized: false,
            spend_authorized: false,
            provider_execution_authorized: false,
          },
        })
        .eq("id", row.id)
        .eq("active", true)
        .select("id");
      if (result.error) throw result.error;
      if (list(result.data).length === 1) retired += 1;
    }
  }
  return retired;
}

async function retireActiveSelectionsFailClosed(organizationId, reason) {
  const nowIso = new Date().toISOString();
  const current = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata")
    .eq("organization_id", organizationId)
    .eq("memory_scope", SELECTION_SCOPE)
    .eq("active", true)
    .limit(100);
  if (current.error) throw current.error;

  let retired = 0;
  for (const row of list(current.data)) {
    const metadata = object(row.metadata);
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({
        active: false,
        forgotten_at: nowIso,
        updated_at: nowIso,
        metadata: {
          ...metadata,
          phase29_contract:
            AVANTIQO_LONG_HORIZON_POLICY_ADAPTED_EXPERIMENT_PORTFOLIO_CONTRACT,
          phase29_status: "RETIRED_FAIL_CLOSED_POLICY_ADAPTATION_DID_NOT_CONVERGE",
          phase29_reason: reason,
          phase29_retired_at: nowIso,
          selection_execution_authority_remaining: false,
        },
      })
      .eq("id", row.id)
      .eq("active", true)
      .select("id");
    if (result.error) throw result.error;
    if (list(result.data).length === 1) retired += 1;
  }
  return retired;
}

export async function reconcileAvantiqoLongHorizonPolicyAdaptedExperimentPortfolio({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract:
        AVANTIQO_LONG_HORIZON_POLICY_ADAPTED_EXPERIMENT_PORTFOLIO_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      execution_request_generation_allowed: false,
      selected_count: 0,
    };
  }

  const policies = await loadLongHorizonPolicies(organizationId);
  const actionablePolicies = policies.family_policies.filter(
    (policy) => policy.actionable === true,
  );
  const rankOnlyAdvisories = policies.family_policies.filter(
    (policy) =>
      policy.review_recommended === true &&
      policy.repeated_rank_misordering === true &&
      policy.actionable !== true,
  );

  if (persist !== true) {
    return {
      success: true,
      contract:
        AVANTIQO_LONG_HORIZON_POLICY_ADAPTED_EXPERIMENT_PORTFOLIO_CONTRACT,
      status: "DRY_RUN_NO_SELECTION_MUTATION",
      execution_request_generation_allowed: false,
      selected_count: 0,
      actionable_family_count: actionablePolicies.length,
      actionable_families: actionablePolicies.map((policy) => policy.family),
      rank_only_advisory_families: rankOnlyAdvisories.map(
        (policy) => policy.family,
      ),
      governance: {
        selection_policy_numeric_score_mutated: false,
        execution_authorized: false,
        spend_authorized: false,
        provider_execution_authorized: false,
        runpod_job_submitted: false,
        platform_knowledge_written: false,
        automatic_training_started: false,
        authorization_effect: "NONE",
      },
    };
  }

  const passes = [];
  const excludedVersions = new Set();
  let passLimit = 2;
  let finalPhase26 = null;
  let totalRetiredEstimateEvidenceCount = 0;

  for (let pass = 1; pass <= passLimit; pass += 1) {
    const phase26 =
      await reconcileAvantiqoCalibrationBackfilledExperimentPortfolio({
        persist: true,
      });
    finalPhase26 = phase26;
    if (pass === 1) passLimit = safePassLimit(phase26.candidate_count);

    if (phase26.success === false) {
      return {
        success: false,
        contract:
          AVANTIQO_LONG_HORIZON_POLICY_ADAPTED_EXPERIMENT_PORTFOLIO_CONTRACT,
        status: "PHASE26_PORTFOLIO_FAILED_CLOSED",
        stable_policy_adapted_portfolio: false,
        execution_request_generation_allowed: false,
        selected_count: 0,
        actionable_family_count: actionablePolicies.length,
        actionable_families: actionablePolicies.map((policy) => policy.family),
        rank_only_advisory_families: rankOnlyAdvisories.map(
          (policy) => policy.family,
        ),
        final_calibration_backfilled_experiment_portfolio: phase26,
        passes,
        governance: {
          selection_policy_numeric_score_mutated: false,
          execution_authorized: false,
          spend_authorized: false,
          provider_execution_authorized: false,
          runpod_job_submitted: false,
          platform_knowledge_written: false,
          automatic_training_started: false,
          authorization_effect: "NONE",
        },
      };
    }

    const excess = excessFlaggedSelections(
      phase26.selected_experiments,
      actionablePolicies,
    );
    for (const item of excess) {
      if (item.experiment_version_fingerprint) {
        excludedVersions.add(item.experiment_version_fingerprint);
      }
    }

    const retiredEstimateEvidenceCount =
      await retireLongHorizonExcessEstimateEvidence(
        organizationId,
        excess,
        pass,
      );
    totalRetiredEstimateEvidenceCount += retiredEstimateEvidenceCount;

    passes.push({
      pass,
      phase26_selected_count: Number(phase26.selected_count) || 0,
      actionable_family_count: actionablePolicies.length,
      excess_flagged_selection_count: excess.length,
      retired_estimate_evidence_count: retiredEstimateEvidenceCount,
      cumulative_excluded_experiment_version_count: excludedVersions.size,
    });

    if (excess.length === 0) {
      return {
        success: true,
        contract:
          AVANTIQO_LONG_HORIZON_POLICY_ADAPTED_EXPERIMENT_PORTFOLIO_CONTRACT,
        status: phase26.selected_count > 0
          ? "STABLE_LONG_HORIZON_POLICY_ADAPTED_PORTFOLIO_READY"
          : "NO_SAFE_EXPERIMENT_PORTFOLIO_AVAILABLE",
        stable_policy_adapted_portfolio: true,
        execution_request_generation_allowed:
          phase26.execution_request_generation_allowed === true,
        selected_count: Number(phase26.selected_count) || 0,
        selected_experiments: list(phase26.selected_experiments),
        candidate_count: Number(phase26.candidate_count) || 0,
        actionable_family_count: actionablePolicies.length,
        actionable_families: actionablePolicies.map((policy) => policy.family),
        rank_only_advisory_families: rankOnlyAdvisories.map(
          (policy) => policy.family,
        ),
        global_profile_count: policies.global_profiles.length,
        family_policies: policies.family_policies,
        excluded_experiment_version_count: excludedVersions.size,
        excluded_experiment_version_fingerprints: [...excludedVersions],
        retired_estimate_evidence_count:
          totalRetiredEstimateEvidenceCount,
        adaptation_pass_count: pass,
        adaptation_pass_limit: passLimit,
        passes,
        final_calibration_backfilled_experiment_portfolio: phase26,
        policy: {
          phase26_selector_and_calibration_guards_remain_authoritative: true,
          mature_family_evidence_required_before_adaptation: true,
          repeated_information_overprediction_can_reduce_family_influence: true,
          repeated_execution_failure_can_reduce_family_influence: true,
          repeated_rank_misordering_alone_is_advisory_only: true,
          global_profile_is_advisory_only: true,
          flagged_family_maximum_selections_per_cycle:
            MAX_SELECTIONS_PER_FLAGGED_FAMILY_PER_CYCLE,
          unsafe_family_exploration_floor_preserved: true,
          family_is_not_fully_quarantined_automatically: true,
          lower_ranked_safe_candidates_can_backfill: true,
          original_numeric_estimate_values_are_mutated: false,
          numeric_selection_scores_are_mutated: false,
          single_execution_can_change_selection_policy: false,
          automatic_selection_boost_applied: false,
          same_cycle_adaptation_is_bounded: true,
          fail_closed_on_non_convergence: true,
        },
        governance: {
          execution_authorized: false,
          spend_authorized: false,
          provider_execution_authorized: false,
          experiment_execution_performed_here: false,
          provider_called_here: false,
          wallet_write_performed_here: false,
          runpod_job_submitted: false,
          runpod_endpoint_mutated: false,
          platform_knowledge_written: false,
          reusable_platform_knowledge_created: false,
          automatic_knowledge_promotion: false,
          automatic_training_started: false,
          automatic_model_weight_mutation: false,
          selection_policy_numeric_score_mutated: false,
          authorization_effect: "NONE",
        },
      };
    }
  }

  const retiredFailClosed = await retireActiveSelectionsFailClosed(
    organizationId,
    "LONG_HORIZON_POLICY_ADAPTATION_PASS_LIMIT_REACHED",
  );
  return {
    success: false,
    contract:
      AVANTIQO_LONG_HORIZON_POLICY_ADAPTED_EXPERIMENT_PORTFOLIO_CONTRACT,
    status: "LONG_HORIZON_POLICY_ADAPTATION_DID_NOT_CONVERGE_FAIL_CLOSED",
    stable_policy_adapted_portfolio: false,
    execution_request_generation_allowed: false,
    selected_count: 0,
    actionable_family_count: actionablePolicies.length,
    actionable_families: actionablePolicies.map((policy) => policy.family),
    rank_only_advisory_families: rankOnlyAdvisories.map(
      (policy) => policy.family,
    ),
    excluded_experiment_version_count: excludedVersions.size,
    excluded_experiment_version_fingerprints: [...excludedVersions],
    retired_estimate_evidence_count: totalRetiredEstimateEvidenceCount,
    adaptation_pass_count: passes.length,
    adaptation_pass_limit: passLimit,
    fail_closed_selection_retirement_count: retiredFailClosed,
    passes,
    final_calibration_backfilled_experiment_portfolio: finalPhase26,
    governance: {
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      experiment_execution_performed_here: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      selection_policy_numeric_score_mutated: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoLongHorizonPolicyAdaptedExperimentPortfolioRuntime =
  Object.freeze({
    contract:
      AVANTIQO_LONG_HORIZON_POLICY_ADAPTED_EXPERIMENT_PORTFOLIO_CONTRACT,
    reconcile: reconcileAvantiqoLongHorizonPolicyAdaptedExperimentPortfolio,
    maximumSelectionsPerFlaggedFamilyPerCycle:
      MAX_SELECTIONS_PER_FLAGGED_FAMILY_PER_CYCLE,
    maximumAdaptationPasses: ABSOLUTE_MAX_ADAPTATION_PASSES,
  });
