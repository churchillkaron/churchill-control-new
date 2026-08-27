import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoExperimentPortfolioPerformanceRuntime";
import {
  AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
  AVANTIQO_SELECTION_POLICY_CANARY_ACTIVATION_SCOPE,
  AVANTIQO_SELECTION_POLICY_CANARY_APPLICATION_SCOPE,
  AVANTIQO_SELECTION_POLICY_CANARY_ROLLBACK_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoSelectionPolicyCanaryRuntime";

export const AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_CONTRACT =
  "AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_V1";
export const AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_SCOPE =
  "platform_learning_experiment_selection_policy_canary_outcome_certifications";

const MEMORY_TABLE = "intelligence_memories";
const OUTCOME_SCOPE = "platform_learning_experiment_portfolio_outcomes";
const MAX_ROWS = 5000;
const CERTIFICATION_VALIDITY_DAYS = 30;
const RETENTION_DAYS = 730;
const MIN_FULL_PROMOTION_EVALUATED_CYCLES = 3;
const MIN_FULL_PROMOTION_RANK_CHANGED_CYCLES = 2;
const MIN_FULL_PROMOTION_COMPARABLE_PAIRS = 5;
const MIN_FULL_PROMOTION_DISTINCT_EXPERIMENTS = 3;
const MIN_FULL_PROMOTION_CANARY_CORRECT_RATE = 0.67;
const MIN_FULL_PROMOTION_CANARY_RATE_ADVANTAGE = 0.1;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function plusDays(value, days) {
  return new Date(Date.parse(value) + days * DAY_MS).toISOString();
}

function unique(values) {
  return [...new Set(list(values).map((value) => text(value, 2000)).filter(Boolean))];
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function validApplication(row) {
  const metadata = object(row?.metadata);
  return Boolean(
    row?.active === true &&
      text(metadata.contract, 180) === AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT &&
      text(metadata.status, 180) === "BOUNDED_CANARY_RANK_APPLICATION_RECORDED" &&
      metadata.same_selected_portfolio_only === true &&
      metadata.selected_membership_changed === false &&
      metadata.source_numeric_scores_mutated === false &&
      metadata.source_score_increase_applied === false &&
      metadata.application_preceded_execution_requests === true &&
      metadata.exact_baseline_ranks_retained_for_rollback === true &&
      metadata.full_policy_cutover_applied === false &&
      Boolean(text(metadata.activation_fingerprint, 128)) &&
      Boolean(text(metadata.selection_cycle_fingerprint, 128)) &&
      list(metadata.assignments).length >= 2
  );
}

function validOutcome(row) {
  const metadata = object(row?.metadata);
  return Boolean(
    row?.active === true &&
      text(metadata.contract, 180) === AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT &&
      text(metadata.status, 180) === "OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED" &&
      metadata.selection_request_lineage_verified === true &&
      metadata.immutable_execution_receipt_verified === true &&
      metadata.information_outcome_qualified === true &&
      metadata.unexecuted_candidate_outcome_inferred === false &&
      metadata.full_counterfactual_regret_claimed === false &&
      Number.isFinite(Number(metadata.realized_information_gain_per_cost)) &&
      Number(metadata.realized_information_gain_per_cost) >= 0 &&
      Boolean(text(metadata.selection_fingerprint, 128)) &&
      Boolean(text(metadata.selection_cycle_fingerprint, 128)) &&
      Boolean(text(metadata.experiment_fingerprint, 128)) &&
      Boolean(text(metadata.outcome_fingerprint, 128))
  );
}

function validActivation(row) {
  const metadata = object(row?.metadata);
  const cycleLimit = Number(metadata.canary_cycle_limit);
  return Boolean(
    text(metadata.contract, 180) === AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT &&
      Boolean(text(metadata.activation_fingerprint, 128)) &&
      Boolean(text(metadata.release_candidate_fingerprint, 128)) &&
      Boolean(text(metadata.baseline_policy_fingerprint, 128)) &&
      Boolean(text(metadata.rollback_plan_fingerprint, 128)) &&
      metadata.same_selected_portfolio_only === true &&
      metadata.selected_membership_change_authorized === false &&
      metadata.source_score_increase_authorized === false &&
      metadata.full_policy_cutover_authorized === false &&
      metadata.automatic_regression_rollback_required === true &&
      Number.isInteger(cycleLimit) &&
      cycleLimit >= 1 &&
      cycleLimit <= 3
  );
}

function validCloseEvidence(row) {
  const metadata = object(row?.metadata);
  return Boolean(
    row?.active === true &&
      text(metadata.contract, 180) === AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT &&
      [
        "CANARY_COMPLETED_BASELINE_RESTORATION_RECORDED",
        "CANARY_ROLLBACK_TO_BASELINE_RECORDED",
      ].includes(text(metadata.status, 180)) &&
      metadata.exact_baseline_restored === true &&
      metadata.selected_membership_changed === false &&
      metadata.source_numeric_scores_mutated === false &&
      metadata.automatic_full_policy_promotion === false &&
      Boolean(text(metadata.activation_fingerprint, 128)) &&
      Boolean(text(metadata.baseline_policy_fingerprint, 128))
  );
}

async function loadState(organizationId) {
  const scopes = [
    AVANTIQO_SELECTION_POLICY_CANARY_ACTIVATION_SCOPE,
    AVANTIQO_SELECTION_POLICY_CANARY_APPLICATION_SCOPE,
    AVANTIQO_SELECTION_POLICY_CANARY_ROLLBACK_SCOPE,
    OUTCOME_SCOPE,
  ];
  const results = await Promise.all(
    scopes.map((scope) =>
      supabaseAdmin
        .from(MEMORY_TABLE)
        .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
        .eq("organization_id", organizationId)
        .eq("memory_scope", scope)
        .limit(MAX_ROWS),
    ),
  );
  for (const result of results) {
    if (result.error) throw result.error;
  }
  return {
    activations: list(results[0].data),
    applications: list(results[1].data),
    closeEvidence: list(results[2].data),
    outcomes: list(results[3].data),
  };
}

function outcomeIndex(rows) {
  const byKey = new Map();
  for (const row of list(rows).filter(validOutcome)) {
    const metadata = object(row.metadata);
    const key = `${text(metadata.selection_cycle_fingerprint, 128)}:${text(
      metadata.selection_fingerprint,
      128,
    )}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push(row);
  }
  return byKey;
}

function pairCorrect(leftRank, rightRank, leftRealized, rightRealized) {
  if (leftRealized === rightRealized || leftRank === rightRank) return null;
  return (leftRank < rightRank) === (leftRealized > rightRealized);
}

function evaluateApplication(application, outcomesByKey) {
  const metadata = object(application.metadata);
  const cycle = text(metadata.selection_cycle_fingerprint, 128);
  const assignments = list(metadata.assignments);
  const observed = [];
  let ambiguousOutcomeCount = 0;

  for (const assignment of assignments) {
    const selectionFingerprint = text(assignment.selection_fingerprint, 128);
    const rows = outcomesByKey.get(`${cycle}:${selectionFingerprint}`) || [];
    if (rows.length !== 1) {
      if (rows.length > 1) ambiguousOutcomeCount += 1;
      continue;
    }
    const outcomeMetadata = object(rows[0].metadata);
    const baselineRank = Number(assignment.baseline_rank);
    const canaryRank = Number(assignment.canary_rank);
    const realized = Number(outcomeMetadata.realized_information_gain_per_cost);
    if (
      !Number.isInteger(baselineRank) ||
      baselineRank < 1 ||
      !Number.isInteger(canaryRank) ||
      canaryRank < 1 ||
      !Number.isFinite(realized) ||
      realized < 0
    ) {
      continue;
    }
    observed.push({
      selection_fingerprint: selectionFingerprint,
      experiment_fingerprint: text(assignment.experiment_fingerprint, 128),
      baseline_rank: baselineRank,
      canary_rank: canaryRank,
      realized_information_gain_per_cost: realized,
      outcome_fingerprint: text(outcomeMetadata.outcome_fingerprint, 128),
    });
  }

  let comparablePairs = 0;
  let baselineCorrect = 0;
  let canaryCorrect = 0;
  for (let leftIndex = 0; leftIndex < observed.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < observed.length; rightIndex += 1) {
      const left = observed[leftIndex];
      const right = observed[rightIndex];
      const baseline = pairCorrect(
        left.baseline_rank,
        right.baseline_rank,
        left.realized_information_gain_per_cost,
        right.realized_information_gain_per_cost,
      );
      const canary = pairCorrect(
        left.canary_rank,
        right.canary_rank,
        left.realized_information_gain_per_cost,
        right.realized_information_gain_per_cost,
      );
      if (baseline === null || canary === null) continue;
      comparablePairs += 1;
      if (baseline) baselineCorrect += 1;
      if (canary) canaryCorrect += 1;
    }
  }

  const baselineRate = ratio(baselineCorrect, comparablePairs);
  const canaryRate = ratio(canaryCorrect, comparablePairs);
  return {
    application_fingerprint: text(metadata.application_fingerprint, 128),
    selection_cycle_fingerprint: cycle,
    rank_changed: metadata.rank_changed === true,
    assignment_count: assignments.length,
    observed_assignment_count: observed.length,
    ambiguous_outcome_count: ambiguousOutcomeCount,
    complete_observation:
      ambiguousOutcomeCount === 0 && observed.length === assignments.length,
    comparable_pair_count: comparablePairs,
    baseline_pairwise_correct_count: baselineCorrect,
    canary_pairwise_correct_count: canaryCorrect,
    baseline_pairwise_correct_rate: baselineRate,
    canary_pairwise_correct_rate: canaryRate,
    canary_correct_rate_advantage: canaryRate - baselineRate,
    cycle_result:
      comparablePairs === 0
        ? "NO_COMPARABLE_OUTCOME_PAIRS"
        : canaryRate > baselineRate
          ? "CANARY_OUTPERFORMED_BASELINE"
          : canaryRate < baselineRate
            ? "CANARY_REGRESSED_VS_BASELINE"
            : "CANARY_TIED_BASELINE",
    observed_experiment_fingerprints: unique(
      observed.map((item) => item.experiment_fingerprint),
    ),
    observed_outcome_fingerprints: unique(
      observed.map((item) => item.outcome_fingerprint),
    ),
  };
}

function latestCloseEvidence(rows, activationFingerprint) {
  return list(rows)
    .filter(validCloseEvidence)
    .filter(
      (row) =>
        text(object(row.metadata).activation_fingerprint, 128) === activationFingerprint,
    )
    .sort((left, right) => {
      const rightMs = Date.parse(text(right.updated_at, 120)) || 0;
      const leftMs = Date.parse(text(left.updated_at, 120)) || 0;
      return rightMs - leftMs;
    })[0] || null;
}

function certificationRow({
  organizationId,
  activation,
  applications,
  closeEvidence,
  outcomesByKey,
  nowIso,
}) {
  const activationMetadata = object(activation.metadata);
  const activationFingerprint = text(activationMetadata.activation_fingerprint, 128);
  const baselinePolicyFingerprint = text(
    activationMetadata.baseline_policy_fingerprint,
    128,
  );
  const closeMetadata = object(closeEvidence?.metadata);
  const relevantApplications = list(applications)
    .filter(validApplication)
    .filter(
      (row) =>
        text(object(row.metadata).activation_fingerprint, 128) === activationFingerprint,
    );
  const cycleEvaluations = relevantApplications.map((application) =>
    evaluateApplication(application, outcomesByKey),
  );
  const distinctCycles = unique(
    cycleEvaluations.map((item) => item.selection_cycle_fingerprint),
  );
  const distinctExperiments = unique(
    cycleEvaluations.flatMap((item) => item.observed_experiment_fingerprints),
  );
  const completeCycleEvaluations = cycleEvaluations.filter(
    (item) => item.complete_observation && item.comparable_pair_count > 0,
  );
  const comparablePairCount = completeCycleEvaluations.reduce(
    (sum, item) => sum + item.comparable_pair_count,
    0,
  );
  const baselineCorrectCount = completeCycleEvaluations.reduce(
    (sum, item) => sum + item.baseline_pairwise_correct_count,
    0,
  );
  const canaryCorrectCount = completeCycleEvaluations.reduce(
    (sum, item) => sum + item.canary_pairwise_correct_count,
    0,
  );
  const baselineRate = ratio(baselineCorrectCount, comparablePairCount);
  const canaryRate = ratio(canaryCorrectCount, comparablePairCount);
  const regressionCycleCount = completeCycleEvaluations.filter(
    (item) => item.cycle_result === "CANARY_REGRESSED_VS_BASELINE",
  ).length;
  const rankChangedCycleCount = cycleEvaluations.filter(
    (item) => item.rank_changed === true,
  ).length;
  const cycleLimit = Number(activationMetadata.canary_cycle_limit);
  const exactBaselineRestored = Boolean(
    closeEvidence &&
      closeMetadata.exact_baseline_restored === true &&
      text(closeMetadata.baseline_policy_fingerprint, 128) === baselinePolicyFingerprint
  );
  const cleanCycleLimitCompletion = Boolean(
    exactBaselineRestored &&
      text(closeMetadata.status, 180) ===
        "CANARY_COMPLETED_BASELINE_RESTORATION_RECORDED" &&
      text(closeMetadata.reason_code, 180) === "CANARY_CYCLE_LIMIT_COMPLETE"
  );
  const terminatedEarly = Boolean(
    closeEvidence && !cleanCycleLimitCompletion
  );
  const allApprovedCyclesApplied = Boolean(
    Number.isInteger(cycleLimit) && distinctCycles.length === cycleLimit
  );
  const allAppliedCyclesFullyObserved = Boolean(
    cycleEvaluations.length === distinctCycles.length &&
      completeCycleEvaluations.length === distinctCycles.length
  );
  const mature = Boolean(
    cleanCycleLimitCompletion &&
      allApprovedCyclesApplied &&
      allAppliedCyclesFullyObserved &&
      completeCycleEvaluations.length >= MIN_FULL_PROMOTION_EVALUATED_CYCLES &&
      rankChangedCycleCount >= MIN_FULL_PROMOTION_RANK_CHANGED_CYCLES &&
      comparablePairCount >= MIN_FULL_PROMOTION_COMPARABLE_PAIRS &&
      distinctExperiments.length >= MIN_FULL_PROMOTION_DISTINCT_EXPERIMENTS
  );
  const promotionReviewCandidate = Boolean(
    mature &&
      regressionCycleCount === 0 &&
      canaryRate >= MIN_FULL_PROMOTION_CANARY_CORRECT_RATE &&
      canaryRate - baselineRate >= MIN_FULL_PROMOTION_CANARY_RATE_ADVANTAGE
  );
  const status = terminatedEarly
    ? "CANARY_TERMINATED_NO_FULL_POLICY_PROMOTION_REVIEW"
    : promotionReviewCandidate
      ? "CANARY_EVIDENCE_FULL_POLICY_PROMOTION_REVIEW_CANDIDATE"
      : mature
        ? "MATURE_CANARY_EVIDENCE_NO_FULL_POLICY_PROMOTION_RECOMMENDATION"
        : "CANARY_OUTCOME_EVIDENCE_INSUFFICIENT";
  const certificationFingerprint = digest(
    "selection-policy-canary-outcome-certification",
    activationFingerprint,
    text(closeMetadata.rollback_fingerprint, 128) || "open",
    cycleEvaluations
      .map(
        (item) =>
          `${item.application_fingerprint}:${item.observed_outcome_fingerprints
            .slice()
            .sort()
            .join(",")}`,
      )
      .sort()
      .join("|"),
  );

  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_SCOPE,
    memory_key: `selection-policy-canary-outcome-certification:${activationFingerprint.slice(0, 40)}`,
    memory_type: promotionReviewCandidate ? "lesson" : "evidence",
    subject: `Selection policy canary outcome certification ${activationFingerprint.slice(0, 16)}`,
    content:
      "Receipt-backed certification of the actual Phase 32 canary ranks against governed realized information outcomes. Full-policy promotion is never automatic: only a clean, fully observed, non-regressing multi-cycle canary can become a separate governance review candidate.",
    importance: promotionReviewCandidate ? 1 : 0.95,
    confidence: mature ? 0.98 : 0.82,
    source: "selection_policy_canary_outcome_certification",
    active: true,
    valid_until: plusDays(nowIso, CERTIFICATION_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_CONTRACT,
      status,
      certification_fingerprint: certificationFingerprint,
      activation_fingerprint: activationFingerprint,
      release_candidate_fingerprint: text(
        activationMetadata.release_candidate_fingerprint,
        128,
      ),
      challenger_policy_version: text(activationMetadata.challenger_policy_version, 160),
      baseline_policy_fingerprint: baselinePolicyFingerprint,
      rollback_plan_fingerprint: text(
        activationMetadata.rollback_plan_fingerprint,
        128,
      ),
      close_evidence_fingerprint: text(closeMetadata.rollback_fingerprint, 128) || null,
      clean_cycle_limit_completion: cleanCycleLimitCompletion,
      canary_terminated_early: terminatedEarly,
      exact_baseline_restored: exactBaselineRestored,
      approved_canary_cycle_limit: cycleLimit,
      applied_distinct_cycle_count: distinctCycles.length,
      fully_observed_cycle_count: completeCycleEvaluations.length,
      all_approved_cycles_applied: allApprovedCyclesApplied,
      all_applied_cycles_fully_observed: allAppliedCyclesFullyObserved,
      rank_changed_cycle_count: rankChangedCycleCount,
      regression_cycle_count: regressionCycleCount,
      comparable_pair_count: comparablePairCount,
      distinct_experiment_count: distinctExperiments.length,
      baseline_pairwise_correct_count: baselineCorrectCount,
      canary_pairwise_correct_count: canaryCorrectCount,
      baseline_pairwise_correct_rate: baselineRate,
      canary_pairwise_correct_rate: canaryRate,
      canary_correct_rate_advantage: canaryRate - baselineRate,
      mature_canary_outcome_evidence: mature,
      full_policy_promotion_review_candidate: promotionReviewCandidate,
      minimum_full_promotion_evaluated_cycles:
        MIN_FULL_PROMOTION_EVALUATED_CYCLES,
      minimum_full_promotion_rank_changed_cycles:
        MIN_FULL_PROMOTION_RANK_CHANGED_CYCLES,
      minimum_full_promotion_comparable_pairs:
        MIN_FULL_PROMOTION_COMPARABLE_PAIRS,
      minimum_full_promotion_distinct_experiments:
        MIN_FULL_PROMOTION_DISTINCT_EXPERIMENTS,
      minimum_full_promotion_canary_correct_rate:
        MIN_FULL_PROMOTION_CANARY_CORRECT_RATE,
      minimum_full_promotion_canary_rate_advantage:
        MIN_FULL_PROMOTION_CANARY_RATE_ADVANTAGE,
      zero_regression_cycles_required: true,
      actual_canary_ranks_evaluated: true,
      theoretical_full_challenger_ranks_used_as_canary_outcome: false,
      governed_phase28_realized_outcomes_only: true,
      unique_selection_cycle_outcome_binding_required: true,
      unexecuted_candidate_outcome_inferred: false,
      historical_counterfactual_backtest_claimed: false,
      automatic_full_policy_promotion: false,
      separate_full_policy_promotion_governance_required: true,
      live_policy_mutated: false,
      live_selection_mutated: false,
      source_numeric_scores_mutated: false,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      authorization_value: "none",
      cycle_evaluations: cycleEvaluations,
      reconciled_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function writeRows(rows) {
  if (!rows.length) return 0;
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, {
      onConflict: "organization_id,memory_scope,memory_key",
    })
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length;
}

export async function reconcileAvantiqoSelectionPolicyCanaryOutcomeCertification({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      certification_count: 0,
      full_policy_promotion_review_candidate_count: 0,
    };
  }

  const nowIso = new Date().toISOString();
  const state = await loadState(organizationId);
  const outcomesByKey = outcomeIndex(state.outcomes);
  const activations = state.activations.filter(validActivation);
  const rows = activations.map((activation) => {
    const activationFingerprint = text(
      object(activation.metadata).activation_fingerprint,
      128,
    );
    return certificationRow({
      organizationId,
      activation,
      applications: state.applications,
      closeEvidence: latestCloseEvidence(
        state.closeEvidence,
        activationFingerprint,
      ),
      outcomesByKey,
      nowIso,
    });
  });
  const writeCount = persist ? await writeRows(rows) : 0;
  const reviewCandidates = rows.filter(
    (row) => object(row.metadata).full_policy_promotion_review_candidate === true,
  );

  return {
    success: true,
    contract: AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_CONTRACT,
    status: reviewCandidates.length
      ? "FULL_POLICY_PROMOTION_REVIEW_CANDIDATES_READY"
      : rows.length
        ? "CANARY_OUTCOME_CERTIFICATIONS_RECONCILED"
        : "NO_POLICY_CANARY_ACTIVATIONS_TO_CERTIFY",
    certification_count: rows.length,
    certification_write_count: writeCount,
    full_policy_promotion_review_candidate_count: reviewCandidates.length,
    certifications: rows.map((row) => ({
      activation_fingerprint: row.metadata.activation_fingerprint,
      status: row.metadata.status,
      mature_canary_outcome_evidence:
        row.metadata.mature_canary_outcome_evidence,
      full_policy_promotion_review_candidate:
        row.metadata.full_policy_promotion_review_candidate,
      applied_distinct_cycle_count: row.metadata.applied_distinct_cycle_count,
      fully_observed_cycle_count: row.metadata.fully_observed_cycle_count,
      regression_cycle_count: row.metadata.regression_cycle_count,
      comparable_pair_count: row.metadata.comparable_pair_count,
      canary_pairwise_correct_rate: row.metadata.canary_pairwise_correct_rate,
      canary_correct_rate_advantage:
        row.metadata.canary_correct_rate_advantage,
    })),
    policy: {
      minimum_full_promotion_evaluated_cycles:
        MIN_FULL_PROMOTION_EVALUATED_CYCLES,
      minimum_full_promotion_rank_changed_cycles:
        MIN_FULL_PROMOTION_RANK_CHANGED_CYCLES,
      minimum_full_promotion_comparable_pairs:
        MIN_FULL_PROMOTION_COMPARABLE_PAIRS,
      minimum_full_promotion_distinct_experiments:
        MIN_FULL_PROMOTION_DISTINCT_EXPERIMENTS,
      zero_regression_cycles_required: true,
      clean_cycle_limit_completion_required: true,
      exact_baseline_restoration_required: true,
      every_applied_cycle_must_be_fully_observed: true,
      actual_canary_ranks_only: true,
      governed_phase28_realized_outcomes_only: true,
      automatic_full_policy_promotion: false,
      separate_full_policy_promotion_governance_required: true,
    },
    governance: {
      live_policy_mutated: false,
      live_selection_mutated: false,
      source_numeric_scores_mutated: false,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      platform_knowledge_written: false,
      reusable_platform_knowledge_created: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_full_policy_promotion: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoSelectionPolicyCanaryOutcomeCertificationRuntime = Object.freeze({
  contract: AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_CONTRACT,
  reconcile: reconcileAvantiqoSelectionPolicyCanaryOutcomeCertification,
  minimumFullPromotionEvaluatedCycles: MIN_FULL_PROMOTION_EVALUATED_CYCLES,
  minimumFullPromotionComparablePairs: MIN_FULL_PROMOTION_COMPARABLE_PAIRS,
});
