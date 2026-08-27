import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT =
  "AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_V1";

const EXECUTION_GOVERNANCE_CONTRACT =
  "AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_V1";
const EXECUTION_RECEIPT_CONTRACT = "AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_V1";
const ESTIMATOR_CALIBRATION_CONTRACT =
  "AVANTIQO_EXPERIMENT_ESTIMATOR_CALIBRATION_V1";

const MEMORY_TABLE = "intelligence_memories";
const REQUEST_SCOPE = "platform_learning_experiment_execution_requests";
const RECEIPT_SCOPE = "platform_learning_experiment_execution_receipts";
const OUTCOME_ASSESSMENT_SCOPE =
  "platform_learning_experiment_information_outcome_assessments";
const OUTCOME_SCOPE = "platform_learning_experiment_portfolio_outcomes";
export const AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_SCOPE =
  "platform_learning_experiment_portfolio_performance_profiles";

const MAX_ROWS = 5000;
const LOOKBACK_DAYS = 365;
const OUTCOME_RETENTION_DAYS = 730;
const PROFILE_VALIDITY_DAYS = 30;
const MIN_INDEPENDENT_ASSESSORS = 2;
const MIN_ASSESSMENT_METHODS = 2;
const MIN_MATURE_EXECUTIONS = 5;
const MIN_MATURE_DISTINCT_EXPERIMENTS = 3;
const MIN_MATURE_SELECTION_CYCLES = 3;
const MIN_MATURE_INFORMATION_OUTCOMES = 3;
const MIN_RANK_COMPARISONS = 3;
const OVERPREDICTION_REVIEW_RATE = 0.67;
const OVERPREDICTION_REVIEW_MEAN_FRACTION = 0.35;
const EXECUTION_FAILURE_REVIEW_RATE = 0.4;
const RANK_ERROR_REVIEW_RATE = 0.67;
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

function mean(values) {
  const finite = list(values).map(Number).filter(Number.isFinite);
  if (!finite.length) return 0;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function quantile(values, q) {
  const finite = list(values).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length) return null;
  if (finite.length === 1) return finite[0];
  const boundedQ = Math.max(0, Math.min(1, Number(q) || 0));
  const position = (finite.length - 1) * boundedQ;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return finite[lower];
  const weight = position - lower;
  return finite[lower] * (1 - weight) + finite[upper] * weight;
}

function requestEligible(row) {
  const metadata = object(row?.metadata);
  return Boolean(
    text(metadata.contract, 180) === EXECUTION_GOVERNANCE_CONTRACT &&
      text(metadata.status, 180) ===
        "AWAITING_EXPLICIT_EXPERIMENT_EXECUTION_APPROVAL" &&
      metadata.selection_is_advisory_only === true &&
      metadata.explicit_independent_approval_required === true &&
      metadata.execution_authorized === false &&
      metadata.provider_execution_authorized === false &&
      Boolean(text(metadata.selection_fingerprint, 128)) &&
      Boolean(text(metadata.selection_cycle_fingerprint, 128)) &&
      Boolean(text(metadata.experiment_fingerprint, 128)) &&
      Boolean(text(metadata.experiment_version_fingerprint, 128))
  );
}

function receiptEligible(row, nowMs = Date.now()) {
  const metadata = object(row?.metadata);
  const completedAtMs = Date.parse(text(metadata.execution_completed_at, 120));
  return Boolean(
    row?.active === true &&
      text(metadata.contract, 180) === EXECUTION_RECEIPT_CONTRACT &&
      text(metadata.status, 180) === "IMMUTABLE_EXECUTION_RECEIPT_RECORDED" &&
      metadata.immutable_provenance_record === true &&
      metadata.exact_claim_binding_verified === true &&
      metadata.exact_experiment_version_binding_verified === true &&
      metadata.external_execution_evidence_verified === true &&
      metadata.caller_supplied_fingerprint_is_authority === false &&
      metadata.receipt_authorizes_execution === false &&
      Boolean(text(metadata.selection_fingerprint, 128)) &&
      Boolean(text(metadata.execution_receipt_fingerprint, 128)) &&
      Number.isFinite(completedAtMs) &&
      completedAtMs >= nowMs - LOOKBACK_DAYS * DAY_MS &&
      completedAtMs <= nowMs + 5 * 60 * 1000
  );
}

function assessmentEligible(row) {
  const metadata = object(row?.metadata);
  return Boolean(
    row?.active === true &&
      text(metadata.contract, 180) === ESTIMATOR_CALIBRATION_CONTRACT &&
      text(metadata.status, 180) ===
        "INDEPENDENT_INFORMATION_OUTCOME_ASSESSMENT_RECORDED" &&
      metadata.independent_assessor_attested === true &&
      metadata.governed_result_evidence_verified === true &&
      metadata.assessment_is_not_ground_truth_by_itself === true &&
      metadata.customer_private_content_used === false &&
      metadata.customer_identifiers_used === false &&
      Boolean(text(metadata.execution_receipt_fingerprint, 128)) &&
      Boolean(text(metadata.assessor_fingerprint, 128)) &&
      Boolean(text(metadata.assessment_method_fingerprint, 128)) &&
      Number.isFinite(Number(metadata.observed_information_gain_bits)) &&
      Number(metadata.observed_information_gain_bits) >= 0
  );
}

function qualifiedInformationOutcome(rows) {
  const deduped = [];
  const assessmentFingerprints = new Set();
  for (const row of list(rows)) {
    if (!assessmentEligible(row)) continue;
    const metadata = object(row.metadata);
    const assessmentFingerprint = text(metadata.assessment_fingerprint, 128);
    if (!assessmentFingerprint || assessmentFingerprints.has(assessmentFingerprint)) continue;
    assessmentFingerprints.add(assessmentFingerprint);
    deduped.push(row);
  }

  const assessorFingerprints = unique(
    deduped.map((row) => object(row.metadata).assessor_fingerprint),
  );
  const methodFingerprints = unique(
    deduped.map((row) => object(row.metadata).assessment_method_fingerprint),
  );
  const qualified = Boolean(
    assessorFingerprints.length >= MIN_INDEPENDENT_ASSESSORS &&
      methodFingerprints.length >= MIN_ASSESSMENT_METHODS
  );
  const values = deduped
    .map((row) => Number(object(row.metadata).observed_information_gain_bits))
    .filter(Number.isFinite);

  return {
    qualified,
    assessment_count: deduped.length,
    independent_assessor_count: assessorFingerprints.length,
    assessment_method_count: methodFingerprints.length,
    conservative_observed_information_gain_bits:
      qualified && values.length ? Math.min(...values) : null,
    assessment_fingerprints: [...assessmentFingerprints],
  };
}

async function loadState(organizationId) {
  const [requests, receipts, assessments] = await Promise.all([
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", REQUEST_SCOPE)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", RECEIPT_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", OUTCOME_ASSESSMENT_SCOPE)
      .eq("active", true)
      .limit(MAX_ROWS),
  ]);
  if (requests.error) throw requests.error;
  if (receipts.error) throw receipts.error;
  if (assessments.error) throw assessments.error;
  return {
    requests: list(requests.data),
    receipts: list(receipts.data),
    assessments: list(assessments.data),
  };
}

function outcomeRow({ organizationId, request, receipt, assessments, nowIso }) {
  const requestMetadata = object(request.metadata);
  const receiptMetadata = object(receipt.metadata);
  if (!requestEligible(request) || !receiptEligible(receipt, Date.parse(nowIso))) {
    return null;
  }

  const selectionFingerprint = text(requestMetadata.selection_fingerprint, 128);
  if (
    text(receiptMetadata.selection_fingerprint, 128) !== selectionFingerprint ||
    text(receiptMetadata.experiment_fingerprint, 128) !==
      text(requestMetadata.experiment_fingerprint, 128) ||
    text(receiptMetadata.experiment_version_fingerprint, 128) !==
      text(requestMetadata.experiment_version_fingerprint, 128)
  ) {
    return null;
  }

  const receiptFingerprint = text(
    receiptMetadata.execution_receipt_fingerprint,
    128,
  );
  const relevantAssessments = list(assessments).filter(
    (row) =>
      text(object(row.metadata).execution_receipt_fingerprint, 128) ===
      receiptFingerprint,
  );
  const informationOutcome = qualifiedInformationOutcome(relevantAssessments);
  const executionStatus = text(receiptMetadata.execution_status, 80).toUpperCase();
  const actualCostUnits = Number(receiptMetadata.actual_cost_units);
  if (!Number.isFinite(actualCostUnits) || actualCostUnits < 0) return null;

  const predictedInformationGainPerCost = Number(
    requestMetadata.risk_adjusted_information_gain_per_cost,
  );
  const observedInformationGain =
    informationOutcome.conservative_observed_information_gain_bits;
  const realizedInformationGainPerCost =
    executionStatus === "COMPLETED" &&
    informationOutcome.qualified &&
    Number.isFinite(observedInformationGain) &&
    actualCostUnits > 0
      ? observedInformationGain / actualCostUnits
      : null;
  const informationGainPerCostOverpredictionFraction =
    Number.isFinite(predictedInformationGainPerCost) &&
    predictedInformationGainPerCost > 0 &&
    Number.isFinite(realizedInformationGainPerCost)
      ? Math.min(
          1,
          Math.max(
            0,
            (predictedInformationGainPerCost - realizedInformationGainPerCost) /
              predictedInformationGainPerCost,
          ),
        )
      : null;

  const startedAtMs = Date.parse(text(receiptMetadata.execution_started_at, 120));
  const completedAtMs = Date.parse(text(receiptMetadata.execution_completed_at, 120));
  const durationMinutes =
    Number.isFinite(startedAtMs) &&
    Number.isFinite(completedAtMs) &&
    completedAtMs >= startedAtMs
      ? (completedAtMs - startedAtMs) / 60000
      : null;

  const outcomeFingerprint = digest(
    "experiment-portfolio-outcome",
    receiptFingerprint,
    selectionFingerprint,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: OUTCOME_SCOPE,
    memory_key: `experiment-portfolio-outcome:${outcomeFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Experiment portfolio outcome ${receiptFingerprint.slice(0, 16)}`,
    content:
      "Observed portfolio-performance evidence joined from the governed execution request, immutable execution receipt and independent method-diverse post-result uncertainty assessments. It measures observed performance only; it does not infer outcomes for unexecuted candidates or claim full counterfactual regret.",
    importance: 0.94,
    confidence: informationOutcome.qualified ? 0.96 : 0.82,
    source: "experiment_portfolio_performance_outcome",
    active: true,
    valid_until: plusDays(
      text(receiptMetadata.execution_completed_at, 120),
      OUTCOME_RETENTION_DAYS,
    ),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT,
      status: "OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED",
      outcome_fingerprint: outcomeFingerprint,
      request_contract: EXECUTION_GOVERNANCE_CONTRACT,
      receipt_contract: EXECUTION_RECEIPT_CONTRACT,
      assessment_contract: ESTIMATOR_CALIBRATION_CONTRACT,
      request_fingerprint: text(requestMetadata.request_fingerprint, 128),
      selection_fingerprint: selectionFingerprint,
      selection_cycle_fingerprint: text(
        requestMetadata.selection_cycle_fingerprint,
        128,
      ),
      selection_rank: Number(requestMetadata.selection_rank || 0),
      candidate_family: text(requestMetadata.candidate_family, 40),
      experiment_fingerprint: text(requestMetadata.experiment_fingerprint, 128),
      experiment_version_fingerprint: text(
        requestMetadata.experiment_version_fingerprint,
        128,
      ),
      execution_receipt_fingerprint: receiptFingerprint,
      execution_mode: text(receiptMetadata.execution_mode, 80),
      execution_status: executionStatus,
      execution_failed: executionStatus !== "COMPLETED",
      actual_cost_units: actualCostUnits,
      zero_cost_execution: actualCostUnits === 0,
      execution_duration_minutes: durationMinutes,
      predicted_risk_adjusted_information_gain_per_cost:
        Number.isFinite(predictedInformationGainPerCost)
          ? predictedInformationGainPerCost
          : null,
      information_outcome_qualified: informationOutcome.qualified,
      information_outcome_assessment_count:
        informationOutcome.assessment_count,
      information_outcome_independent_assessor_count:
        informationOutcome.independent_assessor_count,
      information_outcome_assessment_method_count:
        informationOutcome.assessment_method_count,
      information_outcome_assessment_fingerprints:
        informationOutcome.assessment_fingerprints,
      conservative_observed_information_gain_bits:
        informationOutcome.qualified ? observedInformationGain : null,
      realized_information_gain_per_cost: realizedInformationGainPerCost,
      information_gain_per_cost_overprediction_fraction:
        informationGainPerCostOverpredictionFraction,
      selection_request_lineage_verified: true,
      immutable_execution_receipt_verified: true,
      qualified_information_requires_independent_assessors: true,
      qualified_information_requires_method_diversity: true,
      minimum_independent_assessors: MIN_INDEPENDENT_ASSESSORS,
      minimum_assessment_methods: MIN_ASSESSMENT_METHODS,
      unexecuted_candidate_outcome_inferred: false,
      full_counterfactual_regret_claimed: false,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      runpod_job_submitted: false,
      wallet_write_performed_here: false,
      platform_knowledge_written: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      authorization_value: "none",
      observed_at: text(receiptMetadata.execution_completed_at, 120),
      reconciled_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function pairwiseRankEvidence(outcomes) {
  const byCycle = new Map();
  for (const row of list(outcomes)) {
    const metadata = object(row.metadata);
    if (
      metadata.information_outcome_qualified !== true ||
      !Number.isFinite(Number(metadata.realized_information_gain_per_cost)) ||
      Number(metadata.selection_rank) <= 0
    ) {
      continue;
    }
    const cycle = text(metadata.selection_cycle_fingerprint, 128);
    if (!cycle) continue;
    if (!byCycle.has(cycle)) byCycle.set(cycle, []);
    byCycle.get(cycle).push(row);
  }

  let comparisonCount = 0;
  let errorCount = 0;
  const observedRegrets = [];
  let comparisonCycleCount = 0;

  for (const rows of byCycle.values()) {
    if (rows.length < 2) continue;
    let cycleCompared = false;
    for (let i = 0; i < rows.length; i += 1) {
      for (let j = i + 1; j < rows.length; j += 1) {
        const left = object(rows[i].metadata);
        const right = object(rows[j].metadata);
        if (Number(left.selection_rank) === Number(right.selection_rank)) continue;
        const predictedBetter =
          Number(left.selection_rank) < Number(right.selection_rank) ? left : right;
        const predictedWorse = predictedBetter === left ? right : left;
        const betterRealized = Number(
          predictedBetter.realized_information_gain_per_cost,
        );
        const worseRealized = Number(
          predictedWorse.realized_information_gain_per_cost,
        );
        if (!Number.isFinite(betterRealized) || !Number.isFinite(worseRealized)) {
          continue;
        }
        comparisonCount += 1;
        cycleCompared = true;
        const regret = Math.max(0, worseRealized - betterRealized);
        if (regret > 0) errorCount += 1;
        observedRegrets.push(regret);
      }
    }
    if (cycleCompared) comparisonCycleCount += 1;
  }

  return {
    comparison_count: comparisonCount,
    comparison_cycle_count: comparisonCycleCount,
    rank_error_count: errorCount,
    rank_error_rate: ratio(errorCount, comparisonCount),
    mean_observed_within_portfolio_rank_regret: mean(observedRegrets),
    maximum_observed_within_portfolio_rank_regret:
      observedRegrets.length ? Math.max(...observedRegrets) : 0,
  };
}

function performanceProfileRow({ organizationId, cohortKey, outcomes, nowIso }) {
  const metadataRows = list(outcomes).map((row) => object(row.metadata));
  const eventCount = metadataRows.length;
  const distinctExperimentCount = unique(
    metadataRows.map((metadata) => metadata.experiment_fingerprint),
  ).length;
  const distinctSelectionCycleCount = unique(
    metadataRows.map((metadata) => metadata.selection_cycle_fingerprint),
  ).length;
  const failureRows = metadataRows.filter(
    (metadata) => metadata.execution_failed === true,
  );
  const completedRows = metadataRows.filter(
    (metadata) => text(metadata.execution_status, 80) === "COMPLETED",
  );
  const informationRows = metadataRows.filter(
    (metadata) =>
      metadata.information_outcome_qualified === true &&
      Number.isFinite(Number(metadata.conservative_observed_information_gain_bits)),
  );
  const positiveCostInformationRows = informationRows.filter(
    (metadata) =>
      Number(metadata.actual_cost_units) > 0 &&
      Number.isFinite(Number(metadata.realized_information_gain_per_cost)),
  );
  const comparablePredictionRows = positiveCostInformationRows.filter(
    (metadata) =>
      Number.isFinite(
        Number(metadata.predicted_risk_adjusted_information_gain_per_cost),
      ) &&
      Number(metadata.predicted_risk_adjusted_information_gain_per_cost) > 0 &&
      Number.isFinite(
        Number(metadata.information_gain_per_cost_overprediction_fraction),
      ),
  );
  const overpredictionRows = comparablePredictionRows.filter(
    (metadata) =>
      Number(metadata.information_gain_per_cost_overprediction_fraction) > 0,
  );

  const failureRate = ratio(failureRows.length, eventCount);
  const overpredictionRate = ratio(
    overpredictionRows.length,
    comparablePredictionRows.length,
  );
  const meanOverpredictionFraction = mean(
    comparablePredictionRows.map(
      (metadata) => metadata.information_gain_per_cost_overprediction_fraction,
    ),
  );
  const rankEvidence = pairwiseRankEvidence(outcomes);

  const mature = Boolean(
    eventCount >= MIN_MATURE_EXECUTIONS &&
      distinctExperimentCount >= MIN_MATURE_DISTINCT_EXPERIMENTS &&
      distinctSelectionCycleCount >= MIN_MATURE_SELECTION_CYCLES &&
      informationRows.length >= MIN_MATURE_INFORMATION_OUTCOMES
  );
  const repeatedInformationOverprediction = Boolean(
    mature &&
      comparablePredictionRows.length >= MIN_MATURE_INFORMATION_OUTCOMES &&
      overpredictionRate >= OVERPREDICTION_REVIEW_RATE &&
      meanOverpredictionFraction >= OVERPREDICTION_REVIEW_MEAN_FRACTION
  );
  const repeatedExecutionFailure = Boolean(
    mature && failureRate >= EXECUTION_FAILURE_REVIEW_RATE
  );
  const repeatedRankMisordering = Boolean(
    mature &&
      rankEvidence.comparison_count >= MIN_RANK_COMPARISONS &&
      rankEvidence.rank_error_rate >= RANK_ERROR_REVIEW_RATE
  );
  const reviewRecommended = Boolean(
    repeatedInformationOverprediction ||
      repeatedExecutionFailure ||
      repeatedRankMisordering
  );
  const status = !mature
    ? "PORTFOLIO_PERFORMANCE_EVIDENCE_INSUFFICIENT"
    : reviewRecommended
      ? "LONG_HORIZON_SELECTION_POLICY_REVIEW_RECOMMENDED"
      : "MATURE_LONG_HORIZON_PORTFOLIO_PERFORMANCE_ACCEPTABLE";
  const profileFingerprint = digest(
    "experiment-portfolio-performance-profile",
    cohortKey,
  );

  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_SCOPE,
    memory_key: `experiment-portfolio-performance:${profileFingerprint.slice(0, 40)}`,
    memory_type: reviewRecommended ? "lesson" : "evidence",
    subject: `Experiment portfolio performance ${cohortKey}`,
    content:
      "Trailing-window observed performance profile for the experiment-selection portfolio. It evaluates execution reliability, independently assessed information value, realized positive-cost information gain per cost, prediction optimism and within-selected-portfolio rank ordering. It cannot infer outcomes for unexecuted candidates and cannot alter selection policy by itself.",
    importance: reviewRecommended ? 0.99 : 0.9,
    confidence: mature ? 0.95 : 0.7,
    source: "experiment_portfolio_performance_profile",
    active: true,
    valid_until: plusDays(nowIso, PROFILE_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT,
      status,
      profile_fingerprint: profileFingerprint,
      cohort_key: cohortKey,
      candidate_family: cohortKey === "GLOBAL" ? null : cohortKey,
      lookback_days: LOOKBACK_DAYS,
      execution_outcome_count: eventCount,
      completed_execution_count: completedRows.length,
      failed_or_cancelled_execution_count: failureRows.length,
      execution_failure_rate: failureRate,
      distinct_experiment_count: distinctExperimentCount,
      distinct_selection_cycle_count: distinctSelectionCycleCount,
      qualified_information_outcome_count: informationRows.length,
      positive_cost_information_outcome_count:
        positiveCostInformationRows.length,
      zero_cost_information_outcome_count:
        informationRows.length - positiveCostInformationRows.length,
      conservative_observed_information_gain_bits_lower_quartile: quantile(
        informationRows.map(
          (metadata) => metadata.conservative_observed_information_gain_bits,
        ),
        0.25,
      ),
      conservative_observed_information_gain_bits_median: quantile(
        informationRows.map(
          (metadata) => metadata.conservative_observed_information_gain_bits,
        ),
        0.5,
      ),
      realized_information_gain_per_cost_lower_quartile: quantile(
        positiveCostInformationRows.map(
          (metadata) => metadata.realized_information_gain_per_cost,
        ),
        0.25,
      ),
      realized_information_gain_per_cost_median: quantile(
        positiveCostInformationRows.map(
          (metadata) => metadata.realized_information_gain_per_cost,
        ),
        0.5,
      ),
      comparable_prediction_count: comparablePredictionRows.length,
      information_gain_per_cost_overprediction_count:
        overpredictionRows.length,
      information_gain_per_cost_overprediction_rate: overpredictionRate,
      mean_information_gain_per_cost_overprediction_fraction:
        meanOverpredictionFraction,
      observed_rank_comparison_count: rankEvidence.comparison_count,
      observed_rank_comparison_cycle_count:
        rankEvidence.comparison_cycle_count,
      observed_rank_error_count: rankEvidence.rank_error_count,
      observed_rank_error_rate: rankEvidence.rank_error_rate,
      mean_observed_within_portfolio_rank_regret:
        rankEvidence.mean_observed_within_portfolio_rank_regret,
      maximum_observed_within_portfolio_rank_regret:
        rankEvidence.maximum_observed_within_portfolio_rank_regret,
      mature_long_horizon_evidence: mature,
      repeated_information_overprediction: repeatedInformationOverprediction,
      repeated_execution_failure: repeatedExecutionFailure,
      repeated_rank_misordering: repeatedRankMisordering,
      selection_policy_review_recommended: reviewRecommended,
      minimum_mature_executions: MIN_MATURE_EXECUTIONS,
      minimum_mature_distinct_experiments:
        MIN_MATURE_DISTINCT_EXPERIMENTS,
      minimum_mature_selection_cycles: MIN_MATURE_SELECTION_CYCLES,
      minimum_mature_information_outcomes:
        MIN_MATURE_INFORMATION_OUTCOMES,
      minimum_rank_comparisons: MIN_RANK_COMPARISONS,
      observed_within_portfolio_rank_regret_is_not_full_counterfactual_regret: true,
      unexecuted_candidate_outcome_inferred: false,
      single_execution_can_change_selection_policy: false,
      automatic_selection_penalty_applied: false,
      automatic_selection_boost_applied: false,
      separate_governed_selection_policy_integration_required: true,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      runpod_job_submitted: false,
      wallet_write_performed_here: false,
      platform_knowledge_written: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      authorization_value: "none",
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

export async function reconcileAvantiqoExperimentPortfolioPerformance({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      outcome_count: 0,
      profile_count: 0,
      selection_policy_mutated: false,
    };
  }

  const nowIso = new Date().toISOString();
  const state = await loadState(organizationId);
  const requestBySelection = new Map();
  for (const request of state.requests.filter(requestEligible)) {
    const selectionFingerprint = text(
      object(request.metadata).selection_fingerprint,
      128,
    );
    if (selectionFingerprint && !requestBySelection.has(selectionFingerprint)) {
      requestBySelection.set(selectionFingerprint, request);
    }
  }

  const outcomes = [];
  for (const receipt of state.receipts.filter((row) =>
    receiptEligible(row, Date.parse(nowIso)),
  )) {
    const selectionFingerprint = text(
      object(receipt.metadata).selection_fingerprint,
      128,
    );
    const request = requestBySelection.get(selectionFingerprint);
    if (!request) continue;
    const row = outcomeRow({
      organizationId,
      request,
      receipt,
      assessments: state.assessments,
      nowIso,
    });
    if (row) outcomes.push(row);
  }

  const outcomeWriteCount = persist ? await writeRows(outcomes) : 0;
  const cohorts = new Map([["GLOBAL", outcomes]]);
  for (const row of outcomes) {
    const family = text(object(row.metadata).candidate_family, 40) || "UNKNOWN";
    if (!cohorts.has(family)) cohorts.set(family, []);
    cohorts.get(family).push(row);
  }

  const profiles = [...cohorts.entries()].map(([cohortKey, rows]) =>
    performanceProfileRow({
      organizationId,
      cohortKey,
      outcomes: rows,
      nowIso,
    }),
  );
  const profileWriteCount = persist ? await writeRows(profiles) : 0;

  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT,
    status: outcomes.length
      ? "LONG_HORIZON_PORTFOLIO_PERFORMANCE_RECONCILED"
      : "NO_GOVERNED_EXECUTION_OUTCOMES_AVAILABLE",
    lookback_days: LOOKBACK_DAYS,
    outcome_count: outcomes.length,
    qualified_information_outcome_count: outcomes.filter(
      (row) => object(row.metadata).information_outcome_qualified === true,
    ).length,
    outcome_write_count: outcomeWriteCount,
    profile_count: profiles.length,
    profile_write_count: profileWriteCount,
    profiles: profiles.map((row) => ({
      cohort_key: row.metadata.cohort_key,
      status: row.metadata.status,
      mature_long_horizon_evidence:
        row.metadata.mature_long_horizon_evidence,
      execution_outcome_count: row.metadata.execution_outcome_count,
      qualified_information_outcome_count:
        row.metadata.qualified_information_outcome_count,
      execution_failure_rate: row.metadata.execution_failure_rate,
      information_gain_per_cost_overprediction_rate:
        row.metadata.information_gain_per_cost_overprediction_rate,
      observed_rank_error_rate: row.metadata.observed_rank_error_rate,
      selection_policy_review_recommended:
        row.metadata.selection_policy_review_recommended,
    })),
    policy: {
      observed_outcomes_only: true,
      unexecuted_candidate_outcomes_inferred: false,
      full_counterfactual_regret_claimed: false,
      within_selected_portfolio_rank_regret_only: true,
      independent_method_diverse_information_assessment_required: true,
      single_execution_can_change_selection_policy: false,
      automatic_selection_penalty_applied: false,
      automatic_selection_boost_applied: false,
      separate_governed_selection_policy_integration_required: true,
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
      selection_policy_mutated: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoExperimentPortfolioPerformanceRuntime = Object.freeze({
  contract: AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT,
  reconcile: reconcileAvantiqoExperimentPortfolioPerformance,
  lookbackDays: LOOKBACK_DAYS,
  minimumMatureExecutions: MIN_MATURE_EXECUTIONS,
});
