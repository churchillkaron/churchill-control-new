import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoExperimentPortfolioPerformanceRuntime";

export const AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT =
  "AVANTIQO_REBASED_SELECTION_POLICY_CANARY_V1";
export const AVANTIQO_REBASED_SELECTION_POLICY_CANARY_MONITOR_SCOPE =
  "platform_learning_rebased_selection_policy_canary_monitor_evaluations";
export const AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CERTIFICATION_SCOPE =
  "platform_learning_rebased_selection_policy_canary_outcome_certifications";

const MEMORY_TABLE = "intelligence_memories";
const ACTIVATION_VIEW = "avantiqo_rebased_policy_canary_activations";
const APPLICATION_VIEW = "avantiqo_rebased_policy_canary_applications";
const ACTIVATE_RPC = "activate_avantiqo_rebased_policy_canary_v1";
const APPLY_RPC = "apply_avantiqo_rebased_policy_canary_v1";
const CLOSE_RPC = "close_avantiqo_rebased_policy_canary_v1";
const AUTHORITY_CONTRACT = "AVANTIQO_REBASED_SELECTION_POLICY_CANARY_AUTHORITY_V1";
const APPLICATION_CONTRACT = "AVANTIQO_REBASED_SELECTION_POLICY_CANARY_APPLICATION_V1";
const OUTCOME_SCOPE = "platform_learning_experiment_portfolio_outcomes";
const MAX_ROWS = 5000;
const RETENTION_DAYS = 730;
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_CERTIFIED_CYCLES = 3;
const MIN_RANK_CHANGED_CYCLES = 2;
const MIN_COMPARABLE_PAIRS = 5;
const MIN_DISTINCT_EXPERIMENTS = 3;
const MIN_CANARY_CORRECT_RATE = 0.67;
const MIN_CANARY_RATE_ADVANTAGE = 0.1;
const SYSTEM_MONITOR_ACTOR_FINGERPRINT = digest(
  "avantiqo-phase40-system-monitor-actor-v1",
);

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

function validFingerprint(value) {
  return /^[a-f0-9]{32,128}$/.test(text(value, 128).toLowerCase());
}

function requireFingerprint(value, code) {
  const fingerprint = text(value, 128).toLowerCase();
  if (!validFingerprint(fingerprint)) {
    throw new Error(`${AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT}_${code}_INVALID`);
  }
  return fingerprint;
}

function requireReason(value, code) {
  const reason = text(value, 4000);
  if (reason.length < 12) {
    throw new Error(`${AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT}_${code}_REQUIRED`);
  }
  return reason;
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function unique(values) {
  return [...new Set(list(values).map((value) => text(value, 256)).filter(Boolean))];
}

async function loadActivations(organizationId, states = null) {
  let query = supabaseAdmin
    .from(ACTIVATION_VIEW)
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (Array.isArray(states) && states.length) query = query.in("state", states);
  const result = await query;
  if (result.error) throw result.error;
  return list(result.data);
}

async function loadApplications(organizationId, activationId) {
  const result = await supabaseAdmin
    .from(APPLICATION_VIEW)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("activation_id", activationId)
    .order("applied_at", { ascending: true })
    .limit(100);
  if (result.error) throw result.error;
  return list(result.data);
}

async function loadOutcomes(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,active,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", OUTCOME_SCOPE)
    .eq("active", true)
    .limit(MAX_ROWS);
  if (result.error) throw result.error;
  return list(result.data);
}

function qualifiedOutcome(row) {
  const metadata = object(row?.metadata);
  return Boolean(
    row?.active === true &&
      text(metadata.contract, 180) ===
        AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_CONTRACT &&
      text(metadata.status, 180) === "OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED" &&
      metadata.selection_request_lineage_verified === true &&
      metadata.immutable_execution_receipt_verified === true &&
      metadata.information_outcome_qualified === true &&
      metadata.unexecuted_candidate_outcome_inferred === false &&
      metadata.full_counterfactual_regret_claimed === false &&
      validFingerprint(metadata.selection_fingerprint) &&
      validFingerprint(metadata.selection_cycle_fingerprint) &&
      validFingerprint(metadata.experiment_fingerprint) &&
      validFingerprint(metadata.outcome_fingerprint) &&
      Number.isFinite(Number(metadata.realized_information_gain_per_cost)) &&
      Number(metadata.realized_information_gain_per_cost) >= 0
  );
}

function outcomeIndex(rows) {
  const index = new Map();
  for (const row of list(rows).filter(qualifiedOutcome)) {
    const metadata = object(row.metadata);
    const key = `${text(metadata.selection_cycle_fingerprint, 128)}:${text(
      metadata.selection_fingerprint,
      128,
    )}`;
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(row);
  }
  return index;
}

function validApplication(row) {
  const metadata = object(row?.metadata);
  return Boolean(
    row &&
      row.contract === APPLICATION_CONTRACT &&
      validFingerprint(row.application_fingerprint) &&
      validFingerprint(row.current_baseline_policy_fingerprint) &&
      validFingerprint(row.selection_cycle_fingerprint) &&
      validFingerprint(row.phase38_snapshot_fingerprint) &&
      Number(row.canary_influence_fraction) > 0 &&
      Number(row.canary_influence_fraction) <= 0.25 &&
      Array.isArray(row.assignments) &&
      row.assignments.length >= 2 &&
      metadata.same_selected_portfolio_only === true &&
      metadata.selected_membership_changed === false &&
      metadata.source_numeric_scores_mutated === false &&
      metadata.source_score_increase_applied === false &&
      metadata.application_preceded_execution_requests === true &&
      metadata.exact_current_persistent_baseline_ranks_retained_for_rollback === true &&
      metadata.current_persistent_policy_remains_authoritative_baseline === true &&
      metadata.canary_influence_is_incremental_relative_to_current_persistent_baseline === true &&
      metadata.full_100_percent_challenger_cutover_applied === false &&
      metadata.atomic_database_application === true
  );
}

function evaluateApplication(application, outcomesByKey) {
  if (!validApplication(application)) {
    return {
      application_fingerprint: text(application?.application_fingerprint, 128),
      selection_cycle_fingerprint: text(application?.selection_cycle_fingerprint, 128),
      lineage_ambiguity_detected: true,
      complete_governed_outcome_set: false,
      comparable_rank_changed_pair_count: 0,
      cycle_winner: "AMBIGUOUS",
      observed: [],
    };
  }

  const cycle = text(application.selection_cycle_fingerprint, 128);
  const assignments = list(application.assignments);
  const observed = [];
  let lineageAmbiguous = false;
  for (const assignment of assignments) {
    const selectionFingerprint = text(assignment.selection_fingerprint, 128);
    const experimentFingerprint = text(assignment.experiment_fingerprint, 128);
    const rows = outcomesByKey.get(`${cycle}:${selectionFingerprint}`) || [];
    if (rows.length > 1) {
      lineageAmbiguous = true;
      continue;
    }
    if (rows.length !== 1) continue;
    const outcomeMetadata = object(rows[0].metadata);
    if (text(outcomeMetadata.experiment_fingerprint, 128) !== experimentFingerprint) {
      lineageAmbiguous = true;
      continue;
    }
    const baselineRank = Number(assignment.current_persistent_baseline_rank);
    const canaryRank = Number(assignment.canary_rank);
    const realized = Number(outcomeMetadata.realized_information_gain_per_cost);
    if (
      !Number.isInteger(baselineRank) ||
      baselineRank < 1 ||
      !Number.isInteger(canaryRank) ||
      canaryRank < 1 ||
      !Number.isFinite(realized) ||
      realized < 0 ||
      !validFingerprint(selectionFingerprint) ||
      !validFingerprint(experimentFingerprint)
    ) {
      lineageAmbiguous = true;
      continue;
    }
    observed.push({
      selection_fingerprint: selectionFingerprint,
      experiment_fingerprint: experimentFingerprint,
      current_persistent_baseline_rank: baselineRank,
      canary_rank: canaryRank,
      realized_information_gain_per_cost: realized,
      outcome_fingerprint: text(outcomeMetadata.outcome_fingerprint, 128),
    });
  }

  let comparablePairs = 0;
  let baselineCorrect = 0;
  let canaryCorrect = 0;
  let baselineRegret = 0;
  let canaryRegret = 0;
  for (let leftIndex = 0; leftIndex < observed.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < observed.length; rightIndex += 1) {
      const left = observed[leftIndex];
      const right = observed[rightIndex];
      if (left.realized_information_gain_per_cost === right.realized_information_gain_per_cost) {
        continue;
      }
      const baselineLeftWins =
        left.current_persistent_baseline_rank < right.current_persistent_baseline_rank;
      const canaryLeftWins = left.canary_rank < right.canary_rank;
      if (baselineLeftWins === canaryLeftWins) continue;
      const realizedLeftWins =
        left.realized_information_gain_per_cost > right.realized_information_gain_per_cost;
      comparablePairs += 1;
      if (baselineLeftWins === realizedLeftWins) baselineCorrect += 1;
      if (canaryLeftWins === realizedLeftWins) canaryCorrect += 1;
      if (baselineLeftWins !== realizedLeftWins) {
        baselineRegret += Math.abs(
          left.realized_information_gain_per_cost - right.realized_information_gain_per_cost,
        );
      }
      if (canaryLeftWins !== realizedLeftWins) {
        canaryRegret += Math.abs(
          left.realized_information_gain_per_cost - right.realized_information_gain_per_cost,
        );
      }
    }
  }

  const complete = observed.length === assignments.length && !lineageAmbiguous;
  const cycleWinner =
    comparablePairs === 0
      ? "NO_COMPARABLE_RANK_CHANGED_PAIRS"
      : canaryCorrect > baselineCorrect
        ? "CANARY"
        : canaryCorrect < baselineCorrect
          ? "CURRENT_PERSISTENT_BASELINE"
          : canaryRegret < baselineRegret
            ? "CANARY"
            : canaryRegret > baselineRegret
              ? "CURRENT_PERSISTENT_BASELINE"
              : "TIE";

  return {
    application_fingerprint: text(application.application_fingerprint, 128),
    selection_cycle_fingerprint: cycle,
    phase38_snapshot_fingerprint: text(application.phase38_snapshot_fingerprint, 128),
    lineage_ambiguity_detected: lineageAmbiguous,
    complete_governed_outcome_set: complete,
    assignment_count: assignments.length,
    observed_assignment_count: observed.length,
    rank_changed: assignments.some(
      (assignment) =>
        Number(assignment.current_persistent_baseline_rank) !== Number(assignment.canary_rank),
    ),
    comparable_rank_changed_pair_count: comparablePairs,
    current_persistent_baseline_pairwise_correct_count: baselineCorrect,
    canary_pairwise_correct_count: canaryCorrect,
    current_persistent_baseline_pairwise_correct_rate: ratio(baselineCorrect, comparablePairs),
    canary_pairwise_correct_rate: ratio(canaryCorrect, comparablePairs),
    current_persistent_baseline_observed_rank_regret: baselineRegret,
    canary_observed_rank_regret: canaryRegret,
    cycle_winner: cycleWinner,
    observed,
    unexecuted_candidate_outcomes_inferred: false,
    full_counterfactual_regret_claimed: false,
  };
}

function monitorRow(organizationId, activation, application, evaluation, nowIso) {
  const fingerprint = digest(
    "phase40-rebased-canary-monitor",
    activation.activation_fingerprint,
    application.application_fingerprint,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_MONITOR_SCOPE,
    memory_key: `rebased-canary-monitor:${fingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Rebased canary monitor ${text(application.selection_cycle_fingerprint, 128).slice(0, 16)}`,
    content:
      "Authoritative Phase 40 canary monitoring evaluation using only qualified governed Phase 28 outcomes for the exact canary-applied selected portfolio. Only pairs whose ordering differs from the current persistent baseline are informative.",
    importance: 1,
    confidence: evaluation.lineage_ambiguity_detected ? 0 : 1,
    source: "rebased_selection_policy_canary_monitor",
    active: true,
    valid_until: plusDays(nowIso, RETENTION_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      status: evaluation.lineage_ambiguity_detected
        ? "REBASED_CANARY_LINEAGE_AMBIGUITY_DETECTED"
        : evaluation.complete_governed_outcome_set
          ? "REBASED_CANARY_COMPLETE_GOVERNED_CYCLE_EVALUATION"
          : "REBASED_CANARY_WAITING_FOR_COMPLETE_GOVERNED_OUTCOMES",
      monitor_fingerprint: fingerprint,
      activation_fingerprint: activation.activation_fingerprint,
      application_fingerprint: application.application_fingerprint,
      current_baseline_policy_fingerprint: activation.current_baseline_policy_fingerprint,
      challenger_policy_version: activation.challenger_policy_version,
      ...evaluation,
      governed_phase28_outcomes_only: true,
      authoritative_monitor_evaluation_per_application: true,
      incomplete_outcomes_trigger_regression_rollback: false,
      selected_membership_change_authorized: false,
      source_numeric_score_mutation_authorized: false,
      automatic_policy_succession: false,
      execution_authorized: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      evaluated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function upsertMemoryRows(rows) {
  if (!rows.length) return 0;
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length;
}

async function closeActivation({ organizationId, activation, reasonCode, reason }) {
  const result = await supabaseAdmin.rpc(CLOSE_RPC, {
    p_organization_id: organizationId,
    p_activation_fingerprint: activation.activation_fingerprint,
    p_close_actor_fingerprint: SYSTEM_MONITOR_ACTOR_FINGERPRINT,
    p_close_reason_code: reasonCode,
    p_close_reason: reason,
  });
  if (result.error) throw result.error;
  return result.data;
}

export async function recordAvantiqoRebasedSelectionPolicyCanaryActivation({
  release_candidate_fingerprint,
  activator_fingerprint,
  activation_reason,
  canary_influence_fraction,
  canary_cycles,
  explicit_activation_review_completed = false,
  rollback_readiness_confirmed = false,
  same_actor_as_phase39_approver = true,
  same_actor_as_current_baseline_activator = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }
  const releaseFingerprint = requireFingerprint(
    release_candidate_fingerprint,
    "RELEASE_CANDIDATE_FINGERPRINT",
  );
  const activatorFingerprint = requireFingerprint(activator_fingerprint, "ACTIVATOR_FINGERPRINT");
  const reason = requireReason(activation_reason, "ACTIVATION_REASON");
  const influence = Number(canary_influence_fraction);
  const cycles = Number(canary_cycles);
  if (!Number.isFinite(influence) || influence <= 0 || influence > 0.25) {
    throw new Error(`${AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT}_CANARY_INFLUENCE_INVALID`);
  }
  if (!Number.isInteger(cycles) || cycles < 1 || cycles > 3) {
    throw new Error(`${AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT}_CANARY_CYCLES_INVALID`);
  }
  if (explicit_activation_review_completed !== true || rollback_readiness_confirmed !== true) {
    throw new Error(`${AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT}_ACTIVATION_AND_ROLLBACK_REVIEW_REQUIRED`);
  }
  if (same_actor_as_phase39_approver !== false || same_actor_as_current_baseline_activator !== false) {
    throw new Error(`${AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT}_ACTIVATOR_INDEPENDENCE_ATTESTATION_REQUIRED`);
  }

  const result = await supabaseAdmin.rpc(ACTIVATE_RPC, {
    p_organization_id: organizationId,
    p_release_candidate_fingerprint: releaseFingerprint,
    p_activator_fingerprint: activatorFingerprint,
    p_activation_reason: reason,
    p_expected_canary_influence_fraction: influence,
    p_expected_cycle_limit: cycles,
  });
  if (result.error) throw result.error;
  return {
    success: true,
    contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
    status: "EXPLICIT_REBASED_CANARY_ACTIVATION_RECORDED",
    activation: result.data,
    automatic_activation: false,
    execution_authorized: false,
  };
}

export async function rollbackAvantiqoRebasedSelectionPolicyCanary({
  activation_fingerprint,
  rollback_actor_fingerprint,
  rollback_reason,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }
  const activationFingerprint = requireFingerprint(activation_fingerprint, "ACTIVATION_FINGERPRINT");
  const actorFingerprint = requireFingerprint(rollback_actor_fingerprint, "ROLLBACK_ACTOR_FINGERPRINT");
  const reason = requireReason(rollback_reason, "ROLLBACK_REASON");
  const result = await supabaseAdmin.rpc(CLOSE_RPC, {
    p_organization_id: organizationId,
    p_activation_fingerprint: activationFingerprint,
    p_close_actor_fingerprint: actorFingerprint,
    p_close_reason_code: "EXPLICIT_GOVERNED_ROLLBACK",
    p_close_reason: reason,
  });
  if (result.error) throw result.error;
  return {
    success: true,
    contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
    status: "EXPLICIT_REBASED_CANARY_ROLLBACK_APPLIED",
    activation: result.data,
    execution_authorized: false,
  };
}

function certificationRow({ organizationId, activation, applications, evaluations, nowIso }) {
  const complete = evaluations.filter(
    (evaluation) =>
      evaluation.complete_governed_outcome_set === true &&
      evaluation.lineage_ambiguity_detected === false,
  );
  const distinctCycles = unique(complete.map((item) => item.selection_cycle_fingerprint));
  const distinctExperiments = unique(
    complete.flatMap((item) => item.observed.map((observed) => observed.experiment_fingerprint)),
  );
  const comparablePairs = complete.reduce(
    (sum, item) => sum + Number(item.comparable_rank_changed_pair_count || 0),
    0,
  );
  const baselineCorrect = complete.reduce(
    (sum, item) => sum + Number(item.current_persistent_baseline_pairwise_correct_count || 0),
    0,
  );
  const canaryCorrect = complete.reduce(
    (sum, item) => sum + Number(item.canary_pairwise_correct_count || 0),
    0,
  );
  const baselineRegret = complete.reduce(
    (sum, item) => sum + Number(item.current_persistent_baseline_observed_rank_regret || 0),
    0,
  );
  const canaryRegret = complete.reduce(
    (sum, item) => sum + Number(item.canary_observed_rank_regret || 0),
    0,
  );
  const regressionCycles = complete.filter(
    (item) => item.cycle_winner === "CURRENT_PERSISTENT_BASELINE",
  ).length;
  const rankChangedCycles = complete.filter((item) => item.rank_changed === true).length;
  const baselineRate = ratio(baselineCorrect, comparablePairs);
  const canaryRate = ratio(canaryCorrect, comparablePairs);
  const advantage = canaryRate - baselineRate;
  const exactBaselineRestored = Boolean(
    activation.state === "COMPLETED" &&
      object(activation.metadata).exact_current_persistent_baseline_restored === true,
  );
  const allApprovedCyclesApplied = Boolean(
    Number.isInteger(Number(activation.cycle_limit)) &&
      applications.length === Number(activation.cycle_limit) &&
      distinctCycles.length === Number(activation.cycle_limit),
  );
  const allAppliedCyclesFullyObserved =
    complete.length === applications.length &&
    evaluations.length === applications.length;
  const mature = Boolean(
    exactBaselineRestored &&
      allApprovedCyclesApplied &&
      allAppliedCyclesFullyObserved &&
      distinctCycles.length >= MIN_CERTIFIED_CYCLES &&
      rankChangedCycles >= MIN_RANK_CHANGED_CYCLES &&
      comparablePairs >= MIN_COMPARABLE_PAIRS &&
      distinctExperiments.length >= MIN_DISTINCT_EXPERIMENTS
  );
  const successionReviewCandidate = Boolean(
    mature &&
      regressionCycles === 0 &&
      canaryRate >= MIN_CANARY_CORRECT_RATE &&
      advantage >= MIN_CANARY_RATE_ADVANTAGE &&
      canaryRegret <= baselineRegret
  );
  const status =
    activation.state !== "COMPLETED"
      ? "REBASED_CANARY_TERMINATED_NO_PERSISTENT_POLICY_SUCCESSION_REVIEW"
      : successionReviewCandidate
        ? "REBASED_CANARY_EVIDENCE_PERSISTENT_POLICY_SUCCESSION_REVIEW_CANDIDATE"
        : "REBASED_CANARY_COMPLETED_EVIDENCE_INSUFFICIENT_FOR_SUCCESSION_REVIEW";
  const certificationFingerprint = digest(
    "phase40-rebased-canary-certification",
    activation.activation_fingerprint,
    applications.map((row) => row.application_fingerprint).sort().join("|"),
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CERTIFICATION_SCOPE,
    memory_key: `rebased-canary-certification:${activation.activation_fingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Rebased canary certification ${activation.activation_fingerprint.slice(0, 16)}`,
    content:
      "Phase 40 certification compares the bounded rebased canary only against the exact current persistent-policy baseline using complete governed outcomes. A mature positive result is a persistent-policy succession review candidate only and grants no automatic activation or promotion authority.",
    importance: 1,
    confidence: evaluations.some((item) => item.lineage_ambiguity_detected) ? 0 : 1,
    source: "rebased_selection_policy_canary_outcome_certification",
    active: true,
    valid_until: plusDays(nowIso, RETENTION_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      status,
      certification_fingerprint: certificationFingerprint,
      activation_fingerprint: activation.activation_fingerprint,
      current_baseline_policy_fingerprint: activation.current_baseline_policy_fingerprint,
      challenger_policy_version: activation.challenger_policy_version,
      canary_influence_fraction: Number(activation.canary_influence_fraction),
      approved_cycle_limit: Number(activation.cycle_limit),
      evaluated_cycle_count: distinctCycles.length,
      rank_changed_cycle_count: rankChangedCycles,
      comparable_rank_changed_pair_count: comparablePairs,
      distinct_experiment_count: distinctExperiments.length,
      current_persistent_baseline_pairwise_correct_rate: baselineRate,
      canary_pairwise_correct_rate: canaryRate,
      canary_correct_rate_advantage: advantage,
      current_persistent_baseline_observed_rank_regret: baselineRegret,
      canary_observed_rank_regret: canaryRegret,
      regression_cycle_count: regressionCycles,
      exact_current_persistent_baseline_restored: exactBaselineRestored,
      all_approved_cycles_applied: allApprovedCyclesApplied,
      all_applied_cycles_fully_observed: allAppliedCyclesFullyObserved,
      minimum_evaluated_cycles: MIN_CERTIFIED_CYCLES,
      minimum_rank_changed_cycles: MIN_RANK_CHANGED_CYCLES,
      minimum_comparable_pairs: MIN_COMPARABLE_PAIRS,
      minimum_distinct_experiments: MIN_DISTINCT_EXPERIMENTS,
      minimum_canary_correct_rate: MIN_CANARY_CORRECT_RATE,
      minimum_canary_rate_advantage: MIN_CANARY_RATE_ADVANTAGE,
      zero_regression_cycles_required: true,
      no_higher_observed_rank_regret_required: true,
      persistent_policy_succession_review_candidate: successionReviewCandidate,
      policy_succession_authorized: false,
      persistent_policy_replacement_authorized: false,
      automatic_policy_succession: false,
      automatic_policy_promotion: false,
      automatic_policy_activation: false,
      selected_membership_change_authorized: false,
      source_numeric_score_mutation_authorized: false,
      execution_authorized: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      unexecuted_candidate_outcomes_inferred: false,
      full_counterfactual_regret_claimed: false,
      certified_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function reconcileClosedCertifications(organizationId, outcomesByKey, persist) {
  const activations = await loadActivations(organizationId, [
    "COMPLETED",
    "ROLLED_BACK",
    "BASELINE_ROLLED_BACK",
  ]);
  const rows = [];
  for (const activation of activations) {
    const applications = await loadApplications(organizationId, activation.id);
    const evaluations = applications.map((application) =>
      evaluateApplication(application, outcomesByKey),
    );
    rows.push(
      certificationRow({
        organizationId,
        activation,
        applications,
        evaluations,
        nowIso: new Date().toISOString(),
      }),
    );
  }
  const writeCount = persist ? await upsertMemoryRows(rows) : 0;
  return {
    certification_count: rows.length,
    certification_write_count: writeCount,
    succession_review_candidate_count: rows.filter(
      (row) => object(row.metadata).persistent_policy_succession_review_candidate === true,
    ).length,
  };
}

export async function reconcileAvantiqoRebasedSelectionPolicyCanary({ persist = true } = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      canary_active: false,
      execution_request_generation_allowed: true,
    };
  }

  const outcomes = await loadOutcomes(organizationId);
  const outcomesByKey = outcomeIndex(outcomes);
  const activations = await loadActivations(organizationId, ["ACTIVE"]);
  if (activations.length > 1) {
    return {
      success: false,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      status: "MULTIPLE_ACTIVE_REBASED_CANARIES_FAIL_CLOSED",
      canary_active: true,
      execution_request_generation_allowed: false,
    };
  }
  if (activations.length === 0) {
    const certification = await reconcileClosedCertifications(
      organizationId,
      outcomesByKey,
      persist,
    );
    return {
      success: true,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      status: "NO_ACTIVE_REBASED_SELECTION_POLICY_CANARY",
      canary_active: false,
      execution_request_generation_allowed: true,
      ...certification,
      automatic_activation: false,
      automatic_policy_succession: false,
    };
  }

  const activation = activations[0];
  if (
    activation.contract !== AUTHORITY_CONTRACT ||
    !validFingerprint(activation.activation_fingerprint) ||
    !validFingerprint(activation.current_baseline_policy_fingerprint) ||
    !validFingerprint(activation.release_candidate_fingerprint) ||
    !validFingerprint(activation.approval_fingerprint) ||
    Number(activation.canary_influence_fraction) <= 0 ||
    Number(activation.canary_influence_fraction) > 0.25 ||
    !Number.isInteger(Number(activation.cycle_limit)) ||
    Number(activation.cycle_limit) < 1 ||
    Number(activation.cycle_limit) > 3
  ) {
    return {
      success: false,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      status: "ACTIVE_REBASED_CANARY_AUTHORITY_INVALID_FAIL_CLOSED",
      canary_active: true,
      execution_request_generation_allowed: false,
    };
  }

  const expiresAtMs = Date.parse(text(activation.expires_at, 120));
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
    if (persist) {
      await closeActivation({
        organizationId,
        activation,
        reasonCode: "ACTIVATION_EXPIRED",
        reason: "The bounded Phase 40 canary activation expired before further application.",
      });
    }
    return {
      success: true,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      status: "EXPIRED_REBASED_CANARY_CLOSED_TO_CURRENT_PERSISTENT_BASELINE",
      canary_active: false,
      execution_request_generation_allowed: true,
      automatic_activation: false,
    };
  }

  const applications = await loadApplications(organizationId, activation.id);
  const evaluations = applications.map((application) =>
    evaluateApplication(application, outcomesByKey),
  );
  const nowIso = new Date().toISOString();
  const monitorRows = applications.map((application, index) =>
    monitorRow(organizationId, activation, application, evaluations[index], nowIso),
  );
  const monitorWriteCount = persist ? await upsertMemoryRows(monitorRows) : 0;

  const ambiguous = evaluations.find((item) => item.lineage_ambiguity_detected === true);
  if (ambiguous) {
    if (persist) {
      await closeActivation({
        organizationId,
        activation,
        reasonCode: "GOVERNED_CANARY_LINEAGE_AMBIGUITY",
        reason:
          "Qualified Phase 28 outcomes or application lineage were ambiguous; the Phase 40 canary was rolled back fail closed.",
      });
    }
    return {
      success: false,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      status: "REBASED_CANARY_LINEAGE_AMBIGUITY_ROLLED_BACK_FAIL_CLOSED",
      canary_active: false,
      monitor_write_count: monitorWriteCount,
      execution_request_generation_allowed: false,
    };
  }

  const regression = evaluations.find(
    (item) =>
      item.complete_governed_outcome_set === true &&
      item.cycle_winner === "CURRENT_PERSISTENT_BASELINE",
  );
  if (regression) {
    if (persist) {
      await closeActivation({
        organizationId,
        activation,
        reasonCode: "GOVERNED_CANARY_REGRESSION_DETECTED",
        reason:
          "Complete governed outcomes showed the exact current persistent baseline outperformed the Phase 40 canary ordering.",
      });
    }
    return {
      success: true,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      status: "REBASED_CANARY_VERIFIED_REGRESSION_ROLLBACK_APPLIED",
      canary_active: false,
      monitor_write_count: monitorWriteCount,
      execution_request_generation_allowed: true,
      automatic_policy_succession: false,
    };
  }

  const incomplete = evaluations.find(
    (item) => item.complete_governed_outcome_set !== true,
  );
  if (incomplete) {
    return {
      success: true,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      status: "REBASED_CANARY_WAITING_FOR_PRIOR_GOVERNED_OUTCOMES",
      canary_active: true,
      monitor_write_count: monitorWriteCount,
      application_performed: false,
      incomplete_outcomes_trigger_regression_rollback: false,
      execution_request_generation_allowed: true,
      automatic_policy_succession: false,
    };
  }

  if (applications.length >= Number(activation.cycle_limit)) {
    if (persist) {
      await closeActivation({
        organizationId,
        activation,
        reasonCode: "CANARY_CYCLE_LIMIT_COMPLETE",
        reason:
          "All approved Phase 40 canary cycles have complete governed outcomes without regression; exact current persistent baseline ranks are restored for certification.",
      });
    }
    const certification = await reconcileClosedCertifications(
      organizationId,
      outcomesByKey,
      persist,
    );
    return {
      success: true,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      status: "REBASED_CANARY_CYCLE_LIMIT_COMPLETE_BASELINE_RESTORED",
      canary_active: false,
      monitor_write_count: monitorWriteCount,
      execution_request_generation_allowed: true,
      ...certification,
      automatic_policy_succession: false,
    };
  }

  if (persist !== true) {
    return {
      success: true,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      status: "DRY_RUN_REBASED_CANARY_APPLICATION_NOT_PERFORMED",
      canary_active: true,
      application_performed: false,
      execution_request_generation_allowed: true,
      automatic_activation: false,
      automatic_policy_succession: false,
    };
  }

  const applicationResult = await supabaseAdmin.rpc(APPLY_RPC, {
    p_organization_id: organizationId,
  });
  if (applicationResult.error) {
    return {
      success: false,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      status: "REBASED_CANARY_ATOMIC_APPLICATION_FAIL_CLOSED",
      canary_active: true,
      application_performed: false,
      execution_request_generation_allowed: false,
      error: applicationResult.error.message,
    };
  }

  const application = object(applicationResult.data);
  if (application.status === "REBASED_CANARY_ACTIVATION_EXPIRED_REQUIRES_CLOSE") {
    await closeActivation({
      organizationId,
      activation,
      reasonCode: "ACTIVATION_EXPIRED",
      reason: "The Phase 40 database authority reported an expired canary activation.",
    });
    return {
      success: true,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      status: "EXPIRED_REBASED_CANARY_CLOSED_TO_CURRENT_PERSISTENT_BASELINE",
      canary_active: false,
      application_performed: false,
      execution_request_generation_allowed: true,
    };
  }
  if (application.status === "CURRENT_PERSISTENT_BASELINE_NOT_ACTIVE_REQUIRES_CLOSE") {
    await closeActivation({
      organizationId,
      activation,
      reasonCode: "CURRENT_BASELINE_NOT_ACTIVE",
      reason: "The current persistent baseline is no longer active; Phase 40 cannot remain layered on it.",
    });
    return {
      success: true,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      status: "REBASED_CANARY_CLOSED_AFTER_PERSISTENT_BASELINE_EXIT",
      canary_active: false,
      application_performed: false,
      execution_request_generation_allowed: true,
    };
  }

  return {
    success: true,
    contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
    status: text(application.status, 180) || "REBASED_CANARY_RECONCILED",
    canary_active: application.canary_active === true,
    application_performed: application.application_performed === true,
    application: application,
    execution_request_generation_allowed: true,
    selected_membership_changed: false,
    source_numeric_scores_mutated: false,
    automatic_activation: false,
    automatic_policy_succession: false,
    execution_authorized: false,
    provider_called_here: false,
    wallet_write_performed_here: false,
    runpod_job_submitted: false,
    platform_knowledge_written: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
  };
}

export const AvantiqoRebasedSelectionPolicyCanaryRuntime = Object.freeze({
  contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
  activate: recordAvantiqoRebasedSelectionPolicyCanaryActivation,
  rollback: rollbackAvantiqoRebasedSelectionPolicyCanary,
  reconcile: reconcileAvantiqoRebasedSelectionPolicyCanary,
});
