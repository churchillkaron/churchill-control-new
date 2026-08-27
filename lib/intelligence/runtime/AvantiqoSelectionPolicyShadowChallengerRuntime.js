import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT,
  AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoExperimentPortfolioPerformanceRuntime";
import {
  AVANTIQO_LONG_HORIZON_POLICY_ADAPTED_EXPERIMENT_PORTFOLIO_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoLongHorizonPolicyAdaptedExperimentPortfolioRuntime";

export const AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT =
  "AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_V1";

const ACTIVE_SELECTION_CONTRACT = "AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1";
const EXECUTION_GOVERNANCE_CONTRACT =
  "AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_V1";
const MEMORY_TABLE = "intelligence_memories";
const SELECTION_SCOPE = "platform_learning_active_experiment_selections";
const REQUEST_SCOPE = "platform_learning_experiment_execution_requests";
const OUTCOME_SCOPE = "platform_learning_experiment_portfolio_outcomes";
const SHADOW_SNAPSHOT_SCOPE =
  "platform_learning_experiment_selection_policy_shadow_snapshots";
const SHADOW_EVALUATION_SCOPE =
  "platform_learning_experiment_selection_policy_shadow_evaluations";
export const AVANTIQO_SELECTION_POLICY_SHADOW_REVIEW_SCOPE =
  "platform_learning_experiment_selection_policy_shadow_reviews";

const MAX_ROWS = 5000;
const SNAPSHOT_RETENTION_DAYS = 730;
const REVIEW_VALIDITY_DAYS = 30;
const MIN_FAMILY_CALIBRATION_OUTCOMES = 3;
const MIN_REVIEW_CYCLES = 3;
const MIN_REVIEW_PAIRS = 5;
const MIN_REVIEW_DISTINCT_EXPERIMENTS = 3;
const MIN_CHALLENGER_CORRECT_RATE = 0.67;
const MIN_CHALLENGER_RATE_ADVANTAGE = 0.15;
const DAY_MS = 24 * 60 * 60 * 1000;
const CHALLENGER_POLICY_VERSION = "EMPIRICAL_CONSERVATIVE_CALIBRATION_V1";

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

function activeAndUnexpired(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  const validUntil = Date.parse(text(row.valid_until, 120));
  return !Number.isFinite(validUntil) || validUntil > nowMs;
}

function unique(values) {
  return [...new Set(list(values).map((value) => text(value, 2000)).filter(Boolean))];
}

function clamp(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.max(minimum, Math.min(maximum, number));
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function quantile(values, q) {
  const finite = list(values)
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!finite.length) return null;
  if (finite.length === 1) return finite[0];
  const position = (finite.length - 1) * clamp(q, 0, 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return finite[lower];
  const weight = position - lower;
  return finite[lower] * (1 - weight) + finite[upper] * weight;
}

function validPerformanceProfile(row) {
  const metadata = object(row?.metadata);
  return Boolean(
    activeAndUnexpired(row) &&
      text(metadata.contract, 180) ===
        AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT &&
      metadata.mature_long_horizon_evidence === true &&
      metadata.single_execution_can_change_selection_policy === false &&
      metadata.automatic_selection_boost_applied === false &&
      metadata.automatic_selection_penalty_applied === false &&
      metadata.separate_governed_selection_policy_integration_required === true &&
      ["SCIENTIFIC", "TRANSFER"].includes(
        text(metadata.candidate_family, 40).toUpperCase(),
      )
  );
}

function validOutcome(row) {
  const metadata = object(row?.metadata);
  return Boolean(
    row?.active === true &&
      text(metadata.contract, 180) ===
        AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT &&
      text(metadata.status, 180) ===
        "OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED" &&
      metadata.selection_request_lineage_verified === true &&
      metadata.immutable_execution_receipt_verified === true &&
      metadata.information_outcome_qualified === true &&
      metadata.unexecuted_candidate_outcome_inferred === false &&
      metadata.full_counterfactual_regret_claimed === false &&
      Number.isFinite(Number(metadata.predicted_risk_adjusted_information_gain_per_cost)) &&
      Number(metadata.predicted_risk_adjusted_information_gain_per_cost) > 0 &&
      Number.isFinite(Number(metadata.realized_information_gain_per_cost)) &&
      Number(metadata.realized_information_gain_per_cost) >= 0 &&
      Boolean(text(metadata.selection_fingerprint, 128))
  );
}

function validSelection(row) {
  const metadata = object(row?.metadata);
  return Boolean(
    activeAndUnexpired(row) &&
      text(metadata.contract, 180) === ACTIVE_SELECTION_CONTRACT &&
      text(metadata.status, 180) ===
        "SELECTED_FOR_SEPARATE_GOVERNED_EXECUTION_REVIEW" &&
      metadata.selection_is_not_execution_authorization === true &&
      metadata.execution_requires_separate_governance === true &&
      metadata.execution_authorized === false &&
      metadata.provider_execution_authorized === false &&
      metadata.spend_authorized === false &&
      Number(metadata.selection_rank) > 0 &&
      Number.isFinite(Number(metadata.risk_adjusted_information_gain_per_cost)) &&
      Number(metadata.risk_adjusted_information_gain_per_cost) > 0 &&
      Number.isFinite(Number(metadata.conservative_estimated_execution_risk)) &&
      Boolean(text(metadata.selection_fingerprint, 128)) &&
      Boolean(text(metadata.selection_cycle_fingerprint, 128)) &&
      Boolean(text(metadata.experiment_fingerprint, 128)) &&
      Boolean(text(metadata.experiment_version_fingerprint, 128))
  );
}

async function loadState(organizationId) {
  const [profiles, outcomes, selections, requests, snapshots, evaluations] =
    await Promise.all([
      supabaseAdmin
        .from(MEMORY_TABLE)
        .select("id,active,valid_until,metadata,updated_at,created_at")
        .eq("organization_id", organizationId)
        .eq("memory_scope", AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_SCOPE)
        .eq("active", true)
        .limit(100),
      supabaseAdmin
        .from(MEMORY_TABLE)
        .select("id,active,valid_until,metadata,updated_at,created_at")
        .eq("organization_id", organizationId)
        .eq("memory_scope", OUTCOME_SCOPE)
        .eq("active", true)
        .limit(MAX_ROWS),
      supabaseAdmin
        .from(MEMORY_TABLE)
        .select("id,active,valid_until,metadata,updated_at,created_at")
        .eq("organization_id", organizationId)
        .eq("memory_scope", SELECTION_SCOPE)
        .eq("active", true)
        .limit(100),
      supabaseAdmin
        .from(MEMORY_TABLE)
        .select("id,active,valid_until,metadata,updated_at,created_at")
        .eq("organization_id", organizationId)
        .eq("memory_scope", REQUEST_SCOPE)
        .limit(MAX_ROWS),
      supabaseAdmin
        .from(MEMORY_TABLE)
        .select("id,active,valid_until,metadata,updated_at,created_at")
        .eq("organization_id", organizationId)
        .eq("memory_scope", SHADOW_SNAPSHOT_SCOPE)
        .eq("active", true)
        .limit(MAX_ROWS),
      supabaseAdmin
        .from(MEMORY_TABLE)
        .select("id,active,valid_until,metadata,updated_at,created_at")
        .eq("organization_id", organizationId)
        .eq("memory_scope", SHADOW_EVALUATION_SCOPE)
        .eq("active", true)
        .limit(MAX_ROWS),
    ]);
  for (const result of [profiles, outcomes, selections, requests, snapshots, evaluations]) {
    if (result.error) throw result.error;
  }
  return {
    profiles: list(profiles.data),
    outcomes: list(outcomes.data),
    selections: list(selections.data),
    requests: list(requests.data),
    snapshots: list(snapshots.data),
    evaluations: list(evaluations.data),
  };
}

function latestFamilyProfiles(rows) {
  const byFamily = new Map();
  for (const row of list(rows).filter(validPerformanceProfile)) {
    const metadata = object(row.metadata);
    const family = text(metadata.candidate_family, 40).toUpperCase();
    const previous = byFamily.get(family);
    const previousMs = Date.parse(text(previous?.updated_at, 120));
    const currentMs = Date.parse(text(row.updated_at, 120));
    if (
      !previous ||
      (Number.isFinite(currentMs) &&
        (!Number.isFinite(previousMs) || currentMs > previousMs))
    ) {
      byFamily.set(family, row);
    }
  }
  return byFamily;
}

function familyCalibration(family, profileRow, outcomeRows) {
  const profileMetadata = object(profileRow?.metadata);
  const familyOutcomes = list(outcomeRows).filter((row) => {
    const metadata = object(row.metadata);
    return Boolean(
      validOutcome(row) &&
        text(metadata.candidate_family, 40).toUpperCase() === family
    );
  });
  const ratios = familyOutcomes
    .map((row) => {
      const metadata = object(row.metadata);
      const predicted = Number(
        metadata.predicted_risk_adjusted_information_gain_per_cost,
      );
      const realized = Number(metadata.realized_information_gain_per_cost);
      if (!Number.isFinite(predicted) || predicted <= 0 || !Number.isFinite(realized)) {
        return null;
      }
      return clamp(realized / predicted, 0, 1);
    })
    .filter(Number.isFinite);

  const qualified = Boolean(
    validPerformanceProfile(profileRow) &&
      ratios.length >= MIN_FAMILY_CALIBRATION_OUTCOMES
  );
  return {
    family,
    qualified,
    outcome_count: ratios.length,
    empirical_information_calibration_factor: qualified
      ? quantile(ratios, 0.25)
      : 1,
    historical_execution_failure_rate: qualified
      ? clamp(profileMetadata.execution_failure_rate, 0, 1)
      : 0,
    profile_fingerprint: qualified
      ? text(profileMetadata.profile_fingerprint, 128)
      : null,
    factor_can_exceed_live_score: false,
  };
}

function requestAlreadyExistsForSelections(requestRows, selectionFingerprints) {
  const target = new Set(selectionFingerprints);
  return list(requestRows).some((row) => {
    const metadata = object(row.metadata);
    return Boolean(
      text(metadata.contract, 180) === EXECUTION_GOVERNANCE_CONTRACT &&
        target.has(text(metadata.selection_fingerprint, 128))
    );
  });
}

function buildProspectiveSnapshot({
  organizationId,
  portfolio,
  selections,
  requests,
  profiles,
  outcomes,
  nowIso,
}) {
  if (
    object(portfolio).contract !==
      AVANTIQO_LONG_HORIZON_POLICY_ADAPTED_EXPERIMENT_PORTFOLIO_CONTRACT ||
    portfolio?.success !== true ||
    portfolio?.stable_policy_adapted_portfolio !== true ||
    portfolio?.execution_request_generation_allowed !== true
  ) {
    return null;
  }

  const selectedVersions = new Set(
    list(portfolio.selected_experiments)
      .map((item) => text(item.experiment_version_fingerprint, 128))
      .filter(Boolean),
  );
  const current = list(selections)
    .filter(validSelection)
    .filter((row) =>
      selectedVersions.has(
        text(object(row.metadata).experiment_version_fingerprint, 128),
      ),
    );
  if (current.length < 2 || current.length !== selectedVersions.size) return null;

  const cycleFingerprints = unique(
    current.map((row) => object(row.metadata).selection_cycle_fingerprint),
  );
  if (cycleFingerprints.length !== 1) return null;

  const selectionFingerprints = current.map((row) =>
    text(object(row.metadata).selection_fingerprint, 128),
  );
  if (requestAlreadyExistsForSelections(requests, selectionFingerprints)) {
    return null;
  }

  const profileByFamily = latestFamilyProfiles(profiles);
  const calibrations = new Map();
  for (const family of ["SCIENTIFIC", "TRANSFER"]) {
    calibrations.set(
      family,
      familyCalibration(family, profileByFamily.get(family), outcomes),
    );
  }

  const entries = current.map((row) => {
    const metadata = object(row.metadata);
    const family = text(metadata.candidate_family, 40).toUpperCase();
    const calibration = calibrations.get(family) || {
      qualified: false,
      empirical_information_calibration_factor: 1,
      historical_execution_failure_rate: 0,
      outcome_count: 0,
      profile_fingerprint: null,
    };
    const liveScore = Number(metadata.risk_adjusted_information_gain_per_cost);
    const currentRisk = clamp(metadata.conservative_estimated_execution_risk, 0, 1);
    const riskReliabilityFactor = clamp(
      1 - currentRisk * calibration.historical_execution_failure_rate,
      0.25,
      1,
    );
    const empiricalCalibrationFactor = clamp(
      calibration.empirical_information_calibration_factor,
      0,
      1,
    );
    const challengerScore =
      liveScore * empiricalCalibrationFactor * riskReliabilityFactor;
    return {
      selection_fingerprint: text(metadata.selection_fingerprint, 128),
      selection_cycle_fingerprint: text(
        metadata.selection_cycle_fingerprint,
        128,
      ),
      experiment_fingerprint: text(metadata.experiment_fingerprint, 128),
      experiment_version_fingerprint: text(
        metadata.experiment_version_fingerprint,
        128,
      ),
      candidate_family: family,
      baseline_rank: Number(metadata.selection_rank),
      baseline_score: liveScore,
      conservative_estimated_execution_risk: currentRisk,
      family_calibration_evidence_qualified: calibration.qualified === true,
      family_calibration_outcome_count: Number(calibration.outcome_count) || 0,
      family_performance_profile_fingerprint: calibration.profile_fingerprint,
      empirical_information_calibration_factor: empiricalCalibrationFactor,
      risk_reliability_factor: riskReliabilityFactor,
      challenger_score: challengerScore,
      challenger_score_can_exceed_baseline: false,
    };
  });

  const challengerOrder = [...entries].sort((left, right) => {
    if (right.challenger_score !== left.challenger_score) {
      return right.challenger_score - left.challenger_score;
    }
    if (left.baseline_rank !== right.baseline_rank) {
      return left.baseline_rank - right.baseline_rank;
    }
    return left.experiment_fingerprint.localeCompare(right.experiment_fingerprint);
  });
  const challengerRankBySelection = new Map(
    challengerOrder.map((entry, index) => [entry.selection_fingerprint, index + 1]),
  );
  const candidates = entries
    .map((entry) => ({
      ...entry,
      challenger_rank: challengerRankBySelection.get(entry.selection_fingerprint),
    }))
    .sort((left, right) => left.baseline_rank - right.baseline_rank);

  const cycleFingerprint = cycleFingerprints[0];
  const snapshotFingerprint = digest(
    "selection-policy-shadow-snapshot",
    CHALLENGER_POLICY_VERSION,
    cycleFingerprint,
    candidates
      .map(
        (candidate) =>
          `${candidate.selection_fingerprint}:${candidate.challenger_rank}`,
      )
      .join("|"),
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: SHADOW_SNAPSHOT_SCOPE,
    memory_key: `selection-policy-shadow-snapshot:${snapshotFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Selection policy shadow snapshot ${cycleFingerprint.slice(0, 16)}`,
    content:
      "Prospective shadow-only challenger ranking captured before any execution request exists for the selected experiments. The challenger may conservatively reduce, but never increase, the live score using mature observed family calibration and reliability evidence. It cannot change the live selection, request, approval, execution, knowledge or training state.",
    importance: 0.94,
    confidence: 1,
    source: "selection_policy_shadow_challenger_snapshot",
    active: true,
    valid_until: plusDays(nowIso, SNAPSHOT_RETENTION_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT,
      status: "PROSPECTIVE_SHADOW_CHALLENGER_SNAPSHOT_RECORDED",
      snapshot_fingerprint: snapshotFingerprint,
      challenger_policy_version: CHALLENGER_POLICY_VERSION,
      selection_cycle_fingerprint: cycleFingerprint,
      candidate_count: candidates.length,
      candidates,
      created_before_execution_request: true,
      historical_unselected_candidates_reconstructed: false,
      historical_counterfactual_backtest_claimed: false,
      prospective_same_selected_portfolio_comparison_only: true,
      challenger_score_can_exceed_baseline: false,
      family_calibration_minimum_outcomes: MIN_FAMILY_CALIBRATION_OUTCOMES,
      live_selection_mutated: false,
      execution_request_created_here: false,
      execution_authorized: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_policy_promotion: false,
      authorization_value: "none",
      snapshot_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function uniqueSnapshots(rows) {
  const byFingerprint = new Map();
  for (const row of list(rows)) {
    const metadata = object(row?.metadata);
    const fingerprint = text(metadata.snapshot_fingerprint, 128);
    if (
      row?.active !== true ||
      text(metadata.contract, 180) !==
        AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT ||
      text(metadata.status, 180) !==
        "PROSPECTIVE_SHADOW_CHALLENGER_SNAPSHOT_RECORDED" ||
      metadata.created_before_execution_request !== true ||
      metadata.historical_unselected_candidates_reconstructed !== false ||
      metadata.historical_counterfactual_backtest_claimed !== false ||
      !fingerprint
    ) {
      continue;
    }
    byFingerprint.set(fingerprint, row);
  }
  return [...byFingerprint.values()];
}

function uniqueQualifiedOutcomeBySelection(outcomes) {
  const grouped = new Map();
  for (const row of list(outcomes).filter(validOutcome)) {
    const fingerprint = text(object(row.metadata).selection_fingerprint, 128);
    if (!grouped.has(fingerprint)) grouped.set(fingerprint, []);
    grouped.get(fingerprint).push(row);
  }
  const uniqueMap = new Map();
  for (const [fingerprint, rows] of grouped.entries()) {
    if (rows.length === 1) uniqueMap.set(fingerprint, rows[0]);
  }
  return uniqueMap;
}

function orderingCorrect(leftRank, rightRank, leftRealized, rightRealized) {
  if (leftRealized === rightRealized) return null;
  const shouldLeftWin = leftRealized > rightRealized;
  const predictsLeftWin = leftRank < rightRank;
  return shouldLeftWin === predictsLeftWin;
}

function evaluationRow({ organizationId, snapshot, outcomeBySelection, nowIso }) {
  const metadata = object(snapshot.metadata);
  const candidates = list(metadata.candidates);
  const observed = candidates
    .map((candidate) => {
      const outcome = outcomeBySelection.get(
        text(candidate.selection_fingerprint, 128),
      );
      if (!outcome) return null;
      const outcomeMetadata = object(outcome.metadata);
      const realized = Number(outcomeMetadata.realized_information_gain_per_cost);
      if (!Number.isFinite(realized)) return null;
      return {
        selection_fingerprint: text(candidate.selection_fingerprint, 128),
        experiment_fingerprint: text(candidate.experiment_fingerprint, 128),
        candidate_family: text(candidate.candidate_family, 40),
        baseline_rank: Number(candidate.baseline_rank),
        challenger_rank: Number(candidate.challenger_rank),
        realized_information_gain_per_cost: realized,
        outcome_fingerprint: text(outcomeMetadata.outcome_fingerprint, 128),
      };
    })
    .filter(Boolean);
  if (observed.length < 2) return null;

  let comparablePairs = 0;
  let baselineCorrect = 0;
  let challengerCorrect = 0;
  for (let leftIndex = 0; leftIndex < observed.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < observed.length;
      rightIndex += 1
    ) {
      const left = observed[leftIndex];
      const right = observed[rightIndex];
      const baseline = orderingCorrect(
        left.baseline_rank,
        right.baseline_rank,
        left.realized_information_gain_per_cost,
        right.realized_information_gain_per_cost,
      );
      const challenger = orderingCorrect(
        left.challenger_rank,
        right.challenger_rank,
        left.realized_information_gain_per_cost,
        right.realized_information_gain_per_cost,
      );
      if (baseline === null || challenger === null) continue;
      comparablePairs += 1;
      if (baseline) baselineCorrect += 1;
      if (challenger) challengerCorrect += 1;
    }
  }
  if (comparablePairs === 0) return null;

  const baselineRate = ratio(baselineCorrect, comparablePairs);
  const challengerRate = ratio(challengerCorrect, comparablePairs);
  const cycleWinner = challengerRate > baselineRate
    ? "CHALLENGER"
    : challengerRate < baselineRate
      ? "BASELINE"
      : "TIE";
  const evaluationFingerprint = digest(
    "selection-policy-shadow-evaluation",
    text(metadata.snapshot_fingerprint, 128),
    observed
      .map((item) => `${item.selection_fingerprint}:${item.outcome_fingerprint}`)
      .sort()
      .join("|"),
  );

  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: SHADOW_EVALUATION_SCOPE,
    memory_key: `selection-policy-shadow-evaluation:${evaluationFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Shadow policy evaluation ${text(metadata.selection_cycle_fingerprint, 128).slice(0, 16)}`,
    content:
      "Observed prospective comparison of baseline and challenger ordering for experiments that were selected under the same live portfolio and later obtained unique governed Phase 28 outcomes. Unexecuted and ambiguous outcomes are excluded. This is review evidence only and cannot promote the challenger.",
    importance: 0.96,
    confidence: 1,
    source: "selection_policy_shadow_challenger_evaluation",
    active: true,
    valid_until: plusDays(nowIso, SNAPSHOT_RETENTION_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT,
      status: "PROSPECTIVE_SHADOW_CHALLENGER_EVALUATED",
      evaluation_fingerprint: evaluationFingerprint,
      snapshot_fingerprint: text(metadata.snapshot_fingerprint, 128),
      challenger_policy_version: text(metadata.challenger_policy_version, 160),
      selection_cycle_fingerprint: text(
        metadata.selection_cycle_fingerprint,
        128,
      ),
      observed_candidate_count: observed.length,
      observed_experiment_fingerprints: unique(
        observed.map((item) => item.experiment_fingerprint),
      ),
      comparable_pair_count: comparablePairs,
      baseline_pairwise_correct_count: baselineCorrect,
      challenger_pairwise_correct_count: challengerCorrect,
      baseline_pairwise_correct_rate: baselineRate,
      challenger_pairwise_correct_rate: challengerRate,
      challenger_correct_rate_advantage: challengerRate - baselineRate,
      cycle_winner: cycleWinner,
      unique_governed_outcomes_only: true,
      unexecuted_candidate_outcome_inferred: false,
      historical_counterfactual_backtest_claimed: false,
      prospective_shadow_only: true,
      live_selection_mutated: false,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_policy_promotion: false,
      authorization_value: "none",
      evaluated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function shadowReviewRow({ organizationId, evaluations, nowIso }) {
  const valid = list(evaluations).filter((row) => {
    const metadata = object(row?.metadata);
    return Boolean(
      row?.active === true &&
        text(metadata.contract, 180) ===
          AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT &&
        text(metadata.status, 180) ===
          "PROSPECTIVE_SHADOW_CHALLENGER_EVALUATED" &&
        metadata.prospective_shadow_only === true &&
        metadata.unexecuted_candidate_outcome_inferred === false &&
        Number(metadata.comparable_pair_count) > 0
    );
  });
  const distinctCycles = unique(
    valid.map((row) => object(row.metadata).selection_cycle_fingerprint),
  );
  const distinctExperiments = unique(
    valid.flatMap((row) =>
      list(object(row.metadata).observed_experiment_fingerprints),
    ),
  );
  const pairCount = valid.reduce(
    (sum, row) => sum + Number(object(row.metadata).comparable_pair_count || 0),
    0,
  );
  const baselineCorrect = valid.reduce(
    (sum, row) =>
      sum + Number(object(row.metadata).baseline_pairwise_correct_count || 0),
    0,
  );
  const challengerCorrect = valid.reduce(
    (sum, row) =>
      sum + Number(object(row.metadata).challenger_pairwise_correct_count || 0),
    0,
  );
  const baselineRate = ratio(baselineCorrect, pairCount);
  const challengerRate = ratio(challengerCorrect, pairCount);
  const challengerWorseCycleCount = valid.filter(
    (row) => text(object(row.metadata).cycle_winner, 40) === "BASELINE",
  ).length;
  const mature = Boolean(
    distinctCycles.length >= MIN_REVIEW_CYCLES &&
      pairCount >= MIN_REVIEW_PAIRS &&
      distinctExperiments.length >= MIN_REVIEW_DISTINCT_EXPERIMENTS
  );
  const reviewCandidate = Boolean(
    mature &&
      challengerRate >= MIN_CHALLENGER_CORRECT_RATE &&
      challengerRate - baselineRate >= MIN_CHALLENGER_RATE_ADVANTAGE &&
      challengerWorseCycleCount === 0
  );
  const reviewFingerprint = digest(
    "selection-policy-shadow-review",
    CHALLENGER_POLICY_VERSION,
  );

  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_SELECTION_POLICY_SHADOW_REVIEW_SCOPE,
    memory_key: `selection-policy-shadow-review:${reviewFingerprint.slice(0, 40)}`,
    memory_type: reviewCandidate ? "lesson" : "evidence",
    subject: `Selection policy shadow review ${CHALLENGER_POLICY_VERSION}`,
    content:
      "Aggregated prospective shadow evidence comparing the current live ordering with a conservative empirical challenger. A positive result creates a human/governed review candidate only. No live policy, numeric score, execution authority, model weight, knowledge release or training behavior is changed here.",
    importance: reviewCandidate ? 0.99 : 0.9,
    confidence: mature ? 0.95 : 0.7,
    source: "selection_policy_shadow_challenger_review",
    active: true,
    valid_until: plusDays(nowIso, REVIEW_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT,
      status: reviewCandidate
        ? "SHADOW_CHALLENGER_PROMOTION_REVIEW_CANDIDATE"
        : mature
          ? "SHADOW_CHALLENGER_MATURE_NO_PROMOTION_RECOMMENDATION"
          : "SHADOW_CHALLENGER_EVIDENCE_INSUFFICIENT",
      review_fingerprint: reviewFingerprint,
      challenger_policy_version: CHALLENGER_POLICY_VERSION,
      evaluation_count: valid.length,
      distinct_selection_cycle_count: distinctCycles.length,
      comparable_pair_count: pairCount,
      distinct_experiment_count: distinctExperiments.length,
      baseline_pairwise_correct_rate: baselineRate,
      challenger_pairwise_correct_rate: challengerRate,
      challenger_correct_rate_advantage: challengerRate - baselineRate,
      challenger_worse_cycle_count: challengerWorseCycleCount,
      mature_shadow_evidence: mature,
      promotion_review_candidate: reviewCandidate,
      minimum_review_cycles: MIN_REVIEW_CYCLES,
      minimum_review_pairs: MIN_REVIEW_PAIRS,
      minimum_review_distinct_experiments: MIN_REVIEW_DISTINCT_EXPERIMENTS,
      minimum_challenger_correct_rate: MIN_CHALLENGER_CORRECT_RATE,
      minimum_challenger_rate_advantage: MIN_CHALLENGER_RATE_ADVANTAGE,
      zero_challenger_worse_cycles_required: true,
      automatic_policy_promotion: false,
      explicit_separate_policy_promotion_governance_required: true,
      live_policy_mutated: false,
      live_selection_mutated: false,
      numeric_selection_scores_mutated: false,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
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

export async function reconcileAvantiqoSelectionPolicyShadowChallenger({
  portfolio = null,
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      snapshot_created: false,
      promotion_review_candidate: false,
    };
  }

  const nowIso = new Date().toISOString();
  const state = await loadState(organizationId);
  const snapshot = buildProspectiveSnapshot({
    organizationId,
    portfolio,
    selections: state.selections,
    requests: state.requests,
    profiles: state.profiles,
    outcomes: state.outcomes,
    nowIso,
  });
  const snapshotWriteCount =
    persist && snapshot ? await writeRows([snapshot]) : 0;

  const snapshots = uniqueSnapshots([
    ...state.snapshots,
    ...(snapshot ? [snapshot] : []),
  ]);
  const outcomeBySelection = uniqueQualifiedOutcomeBySelection(state.outcomes);
  const evaluations = snapshots
    .map((row) =>
      evaluationRow({
        organizationId,
        snapshot: row,
        outcomeBySelection,
        nowIso,
      }),
    )
    .filter(Boolean);
  const evaluationWriteCount = persist ? await writeRows(evaluations) : 0;

  const review = shadowReviewRow({
    organizationId,
    evaluations: [
      ...state.evaluations,
      ...evaluations,
    ],
    nowIso,
  });
  const reviewWriteCount = persist ? await writeRows([review]) : 0;

  return {
    success: true,
    contract: AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT,
    status: snapshot
      ? "PROSPECTIVE_SHADOW_CHALLENGER_RECONCILED"
      : "SHADOW_EVALUATION_RECONCILED_NO_NEW_PROSPECTIVE_SNAPSHOT",
    challenger_policy_version: CHALLENGER_POLICY_VERSION,
    snapshot_created: Boolean(snapshot),
    snapshot_write_count: snapshotWriteCount,
    evaluated_snapshot_count: evaluations.length,
    evaluation_write_count: evaluationWriteCount,
    review_write_count: reviewWriteCount,
    promotion_review_candidate:
      review.metadata.promotion_review_candidate === true,
    review_status: review.metadata.status,
    review: {
      distinct_selection_cycle_count:
        review.metadata.distinct_selection_cycle_count,
      comparable_pair_count: review.metadata.comparable_pair_count,
      distinct_experiment_count: review.metadata.distinct_experiment_count,
      baseline_pairwise_correct_rate:
        review.metadata.baseline_pairwise_correct_rate,
      challenger_pairwise_correct_rate:
        review.metadata.challenger_pairwise_correct_rate,
      challenger_correct_rate_advantage:
        review.metadata.challenger_correct_rate_advantage,
      challenger_worse_cycle_count:
        review.metadata.challenger_worse_cycle_count,
    },
    policy: {
      prospective_snapshot_must_precede_execution_request: true,
      historical_unselected_candidates_reconstructed: false,
      historical_counterfactual_backtest_claimed: false,
      same_live_selected_portfolio_comparison_only: true,
      family_calibration_uses_observed_governed_phase28_outcomes: true,
      family_calibration_uses_lower_quartile_realized_to_predicted_ratio: true,
      challenger_score_can_exceed_baseline: false,
      minimum_family_calibration_outcomes: MIN_FAMILY_CALIBRATION_OUTCOMES,
      minimum_review_cycles: MIN_REVIEW_CYCLES,
      minimum_review_pairs: MIN_REVIEW_PAIRS,
      minimum_review_distinct_experiments: MIN_REVIEW_DISTINCT_EXPERIMENTS,
      zero_challenger_worse_cycles_required: true,
      automatic_policy_promotion: false,
      explicit_separate_policy_promotion_governance_required: true,
    },
    governance: {
      live_policy_mutated: false,
      live_selection_mutated: false,
      numeric_selection_scores_mutated: false,
      execution_request_created_here: false,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      platform_knowledge_written: false,
      reusable_platform_knowledge_created: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      automatic_policy_promotion: false,
      authorization_effect: "NONE",
    },
  };
}

export const AvantiqoSelectionPolicyShadowChallengerRuntime = Object.freeze({
  contract: AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT,
  reconcile: reconcileAvantiqoSelectionPolicyShadowChallenger,
  challengerPolicyVersion: CHALLENGER_POLICY_VERSION,
  minimumReviewCycles: MIN_REVIEW_CYCLES,
  minimumReviewPairs: MIN_REVIEW_PAIRS,
});
