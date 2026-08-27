import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_CONTRACT,
  AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoSelectionPolicyResearchEpochRuntime";

export const AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT =
  "AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_V1";

export const AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_PROPOSAL_SCOPE =
  "platform_learning_rebased_selection_policy_challenger_proposals";
export const AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_SNAPSHOT_SCOPE =
  "platform_learning_rebased_selection_policy_challenger_snapshots";
export const AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_EVALUATION_SCOPE =
  "platform_learning_rebased_selection_policy_challenger_evaluations";
export const AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_REVIEW_SCOPE =
  "platform_learning_rebased_selection_policy_challenger_reviews";

const MEMORY_TABLE = "intelligence_memories";
const POLICY_TABLE = "avantiqo_intelligence_persistent_ordering_policies";
const APPLICATION_TABLE =
  "avantiqo_intelligence_persistent_ordering_policy_applications";
const MONITOR_TABLE =
  "avantiqo_intelligence_persistent_ordering_policy_monitor_evaluations";
const SELECTION_SCOPE = "platform_learning_active_experiment_selections";
const REQUEST_SCOPE = "platform_learning_experiment_execution_requests";
const OUTCOME_SCOPE = "platform_learning_experiment_portfolio_outcomes";
const ACTIVE_SELECTION_CONTRACT = "AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1";
const OUTCOME_CONTRACT = "AVANTIQO_EXPERIMENT_PORTFOLIO_PERFORMANCE_V1";
const EXECUTION_REQUEST_CONTRACT = "AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_V1";
const PERSISTENT_POLICY_CONTRACT =
  "AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_V1";
const PERSISTENT_APPLICATION_CONTRACT =
  "AVANTIQO_PERSISTENT_ORDERING_POLICY_APPLICATION_V1";
const ALGORITHM_VERSION = "POST_ACTIVATION_RESIDUAL_CALIBRATION_V1";
const LEGACY_CHALLENGER_POLICY_VERSION =
  "EMPIRICAL_CONSERVATIVE_CALIBRATION_V1";
const MIN_BASELINE_COMPLETE_CYCLES = 3;
const MIN_BASELINE_OBSERVATIONS = 6;
const MIN_BASELINE_DISTINCT_EXPERIMENTS = 3;
const MIN_FAMILY_OBSERVATIONS = 3;
const MIN_REVIEW_COMPLETE_CYCLES = 3;
const MIN_REVIEW_COMPARABLE_PAIRS = 5;
const MIN_REVIEW_DISTINCT_EXPERIMENTS = 3;
const MIN_REVIEW_CHALLENGER_CORRECT_RATE = 0.67;
const MIN_REVIEW_RATE_ADVANTAGE = 0.1;
const MIN_RESIDUAL_FACTOR = 0.25;
const RETENTION_DAYS = 730;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_ROWS = 5000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(list(values).map((value) => text(value, 512)).filter(Boolean))];
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 48000).toLowerCase()).join("|"))
    .digest("hex");
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function plusDays(value, days) {
  return new Date(Date.parse(value) + days * DAY_MS).toISOString();
}

function clamp(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.max(minimum, Math.min(maximum, number));
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

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function validFingerprint(value) {
  return /^[a-f0-9]{32,128}$/.test(text(value, 128).toLowerCase());
}

function validActiveSelection(row) {
  const metadata = object(row?.metadata);
  const validUntil = Date.parse(text(row?.valid_until, 120));
  return Boolean(
    row?.active === true &&
      (!Number.isFinite(validUntil) || validUntil > Date.now()) &&
      text(metadata.contract, 180) === ACTIVE_SELECTION_CONTRACT &&
      text(metadata.status, 180) ===
        "SELECTED_FOR_SEPARATE_GOVERNED_EXECUTION_REVIEW" &&
      metadata.selection_is_not_execution_authorization === true &&
      metadata.execution_requires_separate_governance === true &&
      metadata.execution_authorized === false &&
      metadata.provider_execution_authorized === false &&
      metadata.spend_authorized === false &&
      Number(metadata.selection_rank) > 0 &&
      Number(metadata.risk_adjusted_information_gain_per_cost) > 0 &&
      validFingerprint(metadata.selection_fingerprint) &&
      validFingerprint(metadata.selection_cycle_fingerprint) &&
      validFingerprint(metadata.experiment_fingerprint)
  );
}

function qualifiedOutcome(row, activatedAtMs) {
  const metadata = object(row?.metadata);
  const createdAtMs = Date.parse(text(row?.created_at, 120));
  return Boolean(
    row?.active === true &&
      Number.isFinite(createdAtMs) &&
      createdAtMs >= activatedAtMs &&
      text(metadata.contract, 180) === OUTCOME_CONTRACT &&
      text(metadata.status, 180) ===
        "OBSERVED_PORTFOLIO_EXECUTION_OUTCOME_RECORDED" &&
      metadata.selection_request_lineage_verified === true &&
      metadata.immutable_execution_receipt_verified === true &&
      metadata.information_outcome_qualified === true &&
      metadata.unexecuted_candidate_outcome_inferred === false &&
      metadata.full_counterfactual_regret_claimed === false &&
      Number.isFinite(Number(metadata.realized_information_gain_per_cost)) &&
      Number(metadata.realized_information_gain_per_cost) >= 0 &&
      validFingerprint(metadata.selection_cycle_fingerprint) &&
      validFingerprint(metadata.selection_fingerprint) &&
      validFingerprint(metadata.experiment_fingerprint) &&
      validFingerprint(metadata.outcome_fingerprint)
  );
}

async function loadActivePolicy(organizationId) {
  const result = await supabaseAdmin
    .from(POLICY_TABLE)
    .select(
      "id,contract,organization_id,policy_fingerprint,baseline_policy_fingerprint,challenger_policy_version,ordering_influence_fraction,state,activated_at,metadata,created_at,updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("state", "ACTIVE")
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadCurrentEpoch(organizationId, policyFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,active,valid_until,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_SCOPE)
    .eq("active", true)
    .eq("metadata->>current_baseline_policy_fingerprint", policyFingerprint)
    .order("updated_at", { ascending: false })
    .limit(2);
  if (result.error) throw result.error;
  const rows = list(result.data);
  return rows.length === 1 ? rows[0] : null;
}

async function loadBaselineEvidence(organizationId, policy) {
  const [applications, monitors, outcomes] = await Promise.all([
    supabaseAdmin
      .from(APPLICATION_TABLE)
      .select(
        "id,contract,organization_id,policy_id,policy_fingerprint,selection_cycle_fingerprint,challenger_policy_version,ordering_influence_fraction,state,assignments,applied_at,metadata,created_at,updated_at",
      )
      .eq("organization_id", organizationId)
      .eq("policy_id", policy.id)
      .order("applied_at", { ascending: true })
      .limit(1000),
    supabaseAdmin
      .from(MONITOR_TABLE)
      .select(
        "id,application_id,policy_fingerprint,selection_cycle_fingerprint,status,observed_assignment_count,informative_pair_count,regression_detected,lineage_ambiguity_detected,evaluated_at,evidence",
      )
      .eq("organization_id", organizationId)
      .eq("policy_id", policy.id)
      .order("evaluated_at", { ascending: true })
      .limit(1000),
    supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,active,metadata,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", OUTCOME_SCOPE)
      .eq("active", true)
      .gte("created_at", policy.activated_at)
      .limit(MAX_ROWS),
  ]);
  for (const result of [applications, monitors, outcomes]) {
    if (result.error) throw result.error;
  }
  return {
    applications: list(applications.data),
    monitors: list(monitors.data),
    outcomes: list(outcomes.data),
  };
}

function buildQualifiedBaselineObservations(policy, evidence) {
  const activatedAtMs = Date.parse(text(policy.activated_at, 120));
  if (!Number.isFinite(activatedAtMs)) {
    return { ambiguous: true, observations: [], completeCycles: [] };
  }

  const completeMonitors = evidence.monitors.filter(
    (row) =>
      row.status === "COMPLETE_NON_REGRESSIVE_CYCLE" &&
      row.regression_detected === false &&
      row.lineage_ambiguity_detected === false &&
      validFingerprint(row.selection_cycle_fingerprint) &&
      text(row.policy_fingerprint, 128) === text(policy.policy_fingerprint, 128),
  );
  const completeCycles = unique(
    completeMonitors.map((row) => row.selection_cycle_fingerprint),
  );
  const applicationByCycle = new Map();
  for (const application of evidence.applications) {
    const cycle = text(application.selection_cycle_fingerprint, 128);
    if (!completeCycles.includes(cycle)) continue;
    if (applicationByCycle.has(cycle)) {
      return { ambiguous: true, observations: [], completeCycles };
    }
    applicationByCycle.set(cycle, application);
  }

  const outcomeGroups = new Map();
  for (const outcome of evidence.outcomes) {
    if (!qualifiedOutcome(outcome, activatedAtMs)) continue;
    const metadata = object(outcome.metadata);
    const cycle = text(metadata.selection_cycle_fingerprint, 128);
    if (!completeCycles.includes(cycle)) continue;
    const key = `${cycle}|${text(metadata.selection_fingerprint, 128)}`;
    if (!outcomeGroups.has(key)) outcomeGroups.set(key, []);
    outcomeGroups.get(key).push(outcome);
  }

  const observations = [];
  for (const cycle of completeCycles) {
    const application = applicationByCycle.get(cycle);
    if (
      !application ||
      application.contract !== PERSISTENT_APPLICATION_CONTRACT ||
      application.state !== "APPLIED" ||
      text(application.policy_fingerprint, 128) !== text(policy.policy_fingerprint, 128) ||
      text(application.challenger_policy_version, 180) !==
        text(policy.challenger_policy_version, 180) ||
      Number(application.ordering_influence_fraction) !==
        Number(policy.ordering_influence_fraction) ||
      !Array.isArray(application.assignments) ||
      application.assignments.length < 2
    ) {
      return { ambiguous: true, observations: [], completeCycles };
    }

    for (const assignment of application.assignments) {
      const selectionFingerprint = text(assignment.selection_fingerprint, 128);
      const experimentFingerprint = text(assignment.experiment_fingerprint, 128);
      const persistentScore = Number(assignment.persistent_blended_score);
      if (
        !validFingerprint(selectionFingerprint) ||
        !validFingerprint(experimentFingerprint) ||
        !Number.isFinite(persistentScore) ||
        persistentScore <= 0 ||
        Number(assignment.persistent_rank) <= 0 ||
        Number(assignment.baseline_rank) <= 0
      ) {
        return { ambiguous: true, observations: [], completeCycles };
      }
      const outcomes = outcomeGroups.get(`${cycle}|${selectionFingerprint}`) || [];
      if (outcomes.length !== 1) {
        return { ambiguous: true, observations: [], completeCycles };
      }
      const outcome = outcomes[0];
      const metadata = object(outcome.metadata);
      if (text(metadata.experiment_fingerprint, 128) !== experimentFingerprint) {
        return { ambiguous: true, observations: [], completeCycles };
      }
      const realized = Number(metadata.realized_information_gain_per_cost);
      const residualRatio = clamp(realized / persistentScore, 0, 1);
      observations.push({
        selection_cycle_fingerprint: cycle,
        selection_fingerprint: selectionFingerprint,
        experiment_fingerprint: experimentFingerprint,
        candidate_family: text(metadata.candidate_family, 40).toUpperCase() || "UNSPECIFIED",
        current_persistent_score: persistentScore,
        realized_information_gain_per_cost: realized,
        residual_ratio: residualRatio,
        outcome_fingerprint: text(metadata.outcome_fingerprint, 128),
      });
    }
  }

  return { ambiguous: false, observations, completeCycles };
}

function buildCalibration(observations) {
  const globalFactor = clamp(
    quantile(observations.map((item) => item.residual_ratio), 0.25),
    MIN_RESIDUAL_FACTOR,
    1,
  );
  const byFamily = new Map();
  for (const observation of observations) {
    const family = text(observation.candidate_family, 40).toUpperCase() || "UNSPECIFIED";
    if (!byFamily.has(family)) byFamily.set(family, []);
    byFamily.get(family).push(observation.residual_ratio);
  }
  const familyFactors = {};
  const familyObservationCounts = {};
  for (const [family, values] of byFamily.entries()) {
    familyObservationCounts[family] = values.length;
    familyFactors[family] =
      values.length >= MIN_FAMILY_OBSERVATIONS
        ? clamp(quantile(values, 0.25), MIN_RESIDUAL_FACTOR, 1)
        : globalFactor;
  }
  return { globalFactor, familyFactors, familyObservationCounts };
}

async function loadExistingProposal(organizationId, epochFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,active,valid_until,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_PROPOSAL_SCOPE)
    .eq("active", true)
    .eq("metadata->>research_epoch_fingerprint", epochFingerprint)
    .order("created_at", { ascending: true })
    .limit(2);
  if (result.error) throw result.error;
  const rows = list(result.data);
  return rows.length === 1 ? rows[0] : null;
}

function proposalRow({ organizationId, policy, epoch, observations, completeCycles, nowIso }) {
  const calibration = buildCalibration(observations);
  const epochMetadata = object(epoch.metadata);
  const evidenceFingerprint = digest(
    "rebased-selection-policy-post-activation-evidence",
    text(epochMetadata.epoch_fingerprint, 128),
    completeCycles.sort().join("|"),
    observations
      .map((item) => item.outcome_fingerprint)
      .sort()
      .join("|"),
  );
  const proposalFingerprint = digest(
    "rebased-selection-policy-challenger",
    ALGORITHM_VERSION,
    policy.policy_fingerprint,
    evidenceFingerprint,
  );
  const challengerPolicyVersion = `${ALGORITHM_VERSION}_${proposalFingerprint.slice(0, 16).toUpperCase()}`;
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_PROPOSAL_SCOPE,
    memory_key: `rebased-selection-policy-challenger:${proposalFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Rebased selection policy challenger ${proposalFingerprint.slice(0, 16)}`,
    content:
      "Distinct post-activation challenger proposal calibrated against the current persistent ordering-policy score using only governed outcomes from completed non-regressive cycles after that policy became active. This proposal is research evidence only and cannot change live ordering or authorize promotion, execution, provider use, spend, knowledge release or training.",
    importance: 0.99,
    confidence: 1,
    source: "rebased_selection_policy_challenger_proposal",
    active: true,
    valid_until: plusDays(nowIso, RETENTION_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
      status: "POST_ACTIVATION_REBASED_CHALLENGER_PROPOSAL_RECORDED",
      proposal_fingerprint: proposalFingerprint,
      research_epoch_fingerprint: text(epochMetadata.epoch_fingerprint, 128),
      current_baseline_policy_contract: policy.contract,
      current_baseline_policy_fingerprint: policy.policy_fingerprint,
      current_baseline_policy_version: text(policy.challenger_policy_version, 180),
      parent_baseline_policy_fingerprint: policy.baseline_policy_fingerprint,
      algorithm_version: ALGORITHM_VERSION,
      challenger_policy_version: challengerPolicyVersion,
      challenger_policy_version_is_distinct_from_promoted_version:
        challengerPolicyVersion !== text(policy.challenger_policy_version, 180),
      legacy_challenger_policy_version: LEGACY_CHALLENGER_POLICY_VERSION,
      post_activation_evidence_fingerprint: evidenceFingerprint,
      post_activation_complete_non_regressive_cycle_count: completeCycles.length,
      post_activation_governed_observation_count: observations.length,
      post_activation_distinct_experiment_count: unique(
        observations.map((item) => item.experiment_fingerprint),
      ).length,
      residual_calibration_reference: "CURRENT_PERSISTENT_BLENDED_SCORE",
      residual_calibration_quantile: 0.25,
      residual_factor_minimum: MIN_RESIDUAL_FACTOR,
      residual_factor_maximum: 1,
      global_residual_calibration_factor: calibration.globalFactor,
      family_residual_calibration_factors: calibration.familyFactors,
      family_observation_counts: calibration.familyObservationCounts,
      historical_pre_activation_outcomes_used: false,
      unexecuted_candidate_outcomes_inferred: false,
      full_counterfactual_backtest_claimed: false,
      prospective_same_selected_portfolio_evaluation_required: true,
      challenger_score_can_exceed_current_persistent_baseline: false,
      selected_membership_change_authorized: false,
      source_numeric_score_mutation_authorized: false,
      live_ordering_mutation_authorized: false,
      automatic_policy_promotion: false,
      automatic_policy_activation: false,
      execution_authorized: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      authorization_value: "prospective_shadow_research_only",
      proposed_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function writeRow(row) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id,metadata")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

async function loadCurrentSelections(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select(
      "id,memory_key,active,valid_until,metadata,created_at,updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("memory_scope", SELECTION_SCOPE)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(20);
  if (result.error) throw result.error;
  return list(result.data).filter(validActiveSelection);
}

async function loadCurrentApplication(organizationId, policy, cycleFingerprint) {
  const result = await supabaseAdmin
    .from(APPLICATION_TABLE)
    .select(
      "id,contract,policy_fingerprint,selection_cycle_fingerprint,challenger_policy_version,ordering_influence_fraction,state,assignments,applied_at,metadata",
    )
    .eq("organization_id", organizationId)
    .eq("policy_id", policy.id)
    .eq("selection_cycle_fingerprint", cycleFingerprint)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function executionRequestExists(organizationId, selectionFingerprints) {
  if (!selectionFingerprints.length) return false;
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,metadata")
    .eq("organization_id", organizationId)
    .eq("memory_scope", REQUEST_SCOPE)
    .eq("metadata->>contract", EXECUTION_REQUEST_CONTRACT)
    .limit(MAX_ROWS);
  if (result.error) throw result.error;
  const target = new Set(selectionFingerprints);
  return list(result.data).some((row) =>
    target.has(text(object(row.metadata).selection_fingerprint, 128)),
  );
}

async function loadExistingSnapshot(organizationId, proposalFingerprint, cycleFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,active,valid_until,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_SNAPSHOT_SCOPE)
    .eq("active", true)
    .eq("metadata->>proposal_fingerprint", proposalFingerprint)
    .eq("metadata->>selection_cycle_fingerprint", cycleFingerprint)
    .order("created_at", { ascending: true })
    .limit(2);
  if (result.error) throw result.error;
  const rows = list(result.data);
  return rows.length === 1 ? rows[0] : null;
}

function buildSnapshotRow({ organizationId, policy, proposal, selections, application, nowIso }) {
  const proposalMetadata = object(proposal.metadata);
  if (
    application?.contract !== PERSISTENT_APPLICATION_CONTRACT ||
    application?.state !== "APPLIED" ||
    text(application.policy_fingerprint, 128) !== text(policy.policy_fingerprint, 128) ||
    !Array.isArray(application.assignments) ||
    application.assignments.length !== selections.length
  ) {
    return null;
  }

  const assignmentBySelection = new Map(
    application.assignments.map((assignment) => [
      text(assignment.selection_fingerprint, 128),
      assignment,
    ]),
  );
  if (assignmentBySelection.size !== selections.length) return null;

  const factors = object(proposalMetadata.family_residual_calibration_factors);
  const globalFactor = clamp(
    proposalMetadata.global_residual_calibration_factor,
    MIN_RESIDUAL_FACTOR,
    1,
  );
  const entries = selections.map((selection) => {
    const metadata = object(selection.metadata);
    const selectionFingerprint = text(metadata.selection_fingerprint, 128);
    const assignment = assignmentBySelection.get(selectionFingerprint);
    if (!assignment) return null;
    const experimentFingerprint = text(metadata.experiment_fingerprint, 128);
    if (text(assignment.experiment_fingerprint, 128) !== experimentFingerprint) return null;
    const baselineRank = Number(assignment.persistent_rank);
    const baselineScore = Number(assignment.persistent_blended_score);
    if (!Number.isInteger(baselineRank) || baselineRank <= 0) return null;
    if (!Number.isFinite(baselineScore) || baselineScore <= 0) return null;
    const family = text(metadata.candidate_family, 40).toUpperCase() || "UNSPECIFIED";
    const factor = clamp(factors[family] ?? globalFactor, MIN_RESIDUAL_FACTOR, 1);
    const challengerScore = baselineScore * factor;
    return {
      selection_fingerprint: selectionFingerprint,
      selection_cycle_fingerprint: text(metadata.selection_cycle_fingerprint, 128),
      experiment_fingerprint: experimentFingerprint,
      experiment_version_fingerprint: text(metadata.experiment_version_fingerprint, 128),
      candidate_family: family,
      current_persistent_baseline_rank: baselineRank,
      current_persistent_baseline_score: baselineScore,
      original_phase17_score: Number(assignment.baseline_score),
      promoted_legacy_challenger_score: Number(assignment.challenger_score),
      residual_calibration_factor: factor,
      rebased_challenger_score: challengerScore,
      challenger_score_can_exceed_current_persistent_baseline: false,
    };
  });
  if (entries.some((entry) => !entry)) return null;

  const challengerOrder = [...entries].sort((left, right) => {
    if (right.rebased_challenger_score !== left.rebased_challenger_score) {
      return right.rebased_challenger_score - left.rebased_challenger_score;
    }
    if (left.current_persistent_baseline_rank !== right.current_persistent_baseline_rank) {
      return left.current_persistent_baseline_rank - right.current_persistent_baseline_rank;
    }
    return left.experiment_fingerprint.localeCompare(right.experiment_fingerprint);
  });
  const challengerRank = new Map(
    challengerOrder.map((entry, index) => [entry.selection_fingerprint, index + 1]),
  );
  const candidates = entries
    .map((entry) => ({
      ...entry,
      rebased_challenger_rank: challengerRank.get(entry.selection_fingerprint),
    }))
    .sort(
      (left, right) =>
        left.current_persistent_baseline_rank - right.current_persistent_baseline_rank,
    );
  const cycleFingerprint = text(application.selection_cycle_fingerprint, 128);
  const snapshotFingerprint = digest(
    "rebased-selection-policy-prospective-snapshot",
    proposalMetadata.proposal_fingerprint,
    cycleFingerprint,
    candidates
      .map(
        (candidate) =>
          `${candidate.selection_fingerprint}:${candidate.current_persistent_baseline_rank}:${candidate.rebased_challenger_rank}`,
      )
      .join("|"),
  );

  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_SNAPSHOT_SCOPE,
    memory_key: `rebased-selection-policy-snapshot:${snapshotFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Rebased challenger prospective snapshot ${cycleFingerprint.slice(0, 16)}`,
    content:
      "Prospective same-selected-portfolio shadow comparison between the current persistent ordering-policy baseline and the distinct Phase 38 challenger. Captured after the current persistent policy was atomically applied and before any execution request exists for this cycle. It cannot mutate live ranking or execution state.",
    importance: 0.99,
    confidence: 1,
    source: "rebased_selection_policy_challenger_snapshot",
    active: true,
    valid_until: plusDays(nowIso, RETENTION_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
      status: "PROSPECTIVE_REBASED_CHALLENGER_SNAPSHOT_RECORDED",
      snapshot_fingerprint: snapshotFingerprint,
      proposal_fingerprint: proposalMetadata.proposal_fingerprint,
      research_epoch_fingerprint: proposalMetadata.research_epoch_fingerprint,
      current_baseline_policy_fingerprint: policy.policy_fingerprint,
      current_baseline_policy_version: policy.challenger_policy_version,
      challenger_policy_version: proposalMetadata.challenger_policy_version,
      selection_cycle_fingerprint: cycleFingerprint,
      candidate_count: candidates.length,
      candidates,
      captured_after_current_persistent_policy_application: true,
      created_before_execution_request: true,
      prospective_same_selected_portfolio_comparison_only: true,
      historical_pre_activation_outcomes_used: false,
      historical_unselected_candidates_reconstructed: false,
      full_counterfactual_backtest_claimed: false,
      live_selection_mutated: false,
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
      automatic_policy_promotion: false,
      authorization_value: "prospective_shadow_research_only",
      snapshot_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function loadProposalSnapshots(organizationId, proposalFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,active,valid_until,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_SNAPSHOT_SCOPE)
    .eq("active", true)
    .eq("metadata->>proposal_fingerprint", proposalFingerprint)
    .order("created_at", { ascending: true })
    .limit(1000);
  if (result.error) throw result.error;
  return list(result.data);
}

async function loadPostActivationOutcomes(organizationId, activatedAt) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,active,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", OUTCOME_SCOPE)
    .eq("active", true)
    .gte("created_at", activatedAt)
    .limit(MAX_ROWS);
  if (result.error) throw result.error;
  return list(result.data);
}

function evaluateSnapshot(snapshot, outcomeRows, activatedAtMs, organizationId, nowIso) {
  const metadata = object(snapshot.metadata);
  const candidates = list(metadata.candidates);
  const cycleFingerprint = text(metadata.selection_cycle_fingerprint, 128);
  const grouped = new Map();
  for (const outcome of outcomeRows) {
    if (!qualifiedOutcome(outcome, activatedAtMs)) continue;
    const outcomeMetadata = object(outcome.metadata);
    if (text(outcomeMetadata.selection_cycle_fingerprint, 128) !== cycleFingerprint) continue;
    const key = text(outcomeMetadata.selection_fingerprint, 128);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(outcome);
  }

  let lineageAmbiguous = false;
  const observed = candidates
    .map((candidate) => {
      const selectionFingerprint = text(candidate.selection_fingerprint, 128);
      const outcomes = grouped.get(selectionFingerprint) || [];
      if (outcomes.length > 1) {
        lineageAmbiguous = true;
        return null;
      }
      if (outcomes.length !== 1) return null;
      const outcome = outcomes[0];
      const outcomeMetadata = object(outcome.metadata);
      if (
        text(outcomeMetadata.experiment_fingerprint, 128) !==
        text(candidate.experiment_fingerprint, 128)
      ) {
        lineageAmbiguous = true;
        return null;
      }
      return {
        selection_fingerprint: selectionFingerprint,
        experiment_fingerprint: text(candidate.experiment_fingerprint, 128),
        baseline_rank: Number(candidate.current_persistent_baseline_rank),
        challenger_rank: Number(candidate.rebased_challenger_rank),
        realized_information_gain_per_cost: Number(
          outcomeMetadata.realized_information_gain_per_cost,
        ),
        outcome_fingerprint: text(outcomeMetadata.outcome_fingerprint, 128),
      };
    })
    .filter(Boolean);

  let comparablePairs = 0;
  let baselineCorrect = 0;
  let challengerCorrect = 0;
  let baselineRegret = 0;
  let challengerRegret = 0;
  for (let leftIndex = 0; leftIndex < observed.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < observed.length; rightIndex += 1) {
      const left = observed[leftIndex];
      const right = observed[rightIndex];
      if (left.realized_information_gain_per_cost === right.realized_information_gain_per_cost) {
        continue;
      }
      const baselineLeftWins = left.baseline_rank < right.baseline_rank;
      const challengerLeftWins = left.challenger_rank < right.challenger_rank;
      if (baselineLeftWins === challengerLeftWins) continue;
      const realizedLeftWins =
        left.realized_information_gain_per_cost > right.realized_information_gain_per_cost;
      comparablePairs += 1;
      if (baselineLeftWins === realizedLeftWins) baselineCorrect += 1;
      if (challengerLeftWins === realizedLeftWins) challengerCorrect += 1;
      if (baselineLeftWins && !realizedLeftWins) {
        baselineRegret +=
          right.realized_information_gain_per_cost -
          left.realized_information_gain_per_cost;
      } else if (!baselineLeftWins && realizedLeftWins) {
        baselineRegret +=
          left.realized_information_gain_per_cost -
          right.realized_information_gain_per_cost;
      }
      if (challengerLeftWins && !realizedLeftWins) {
        challengerRegret +=
          right.realized_information_gain_per_cost -
          left.realized_information_gain_per_cost;
      } else if (!challengerLeftWins && realizedLeftWins) {
        challengerRegret +=
          left.realized_information_gain_per_cost -
          right.realized_information_gain_per_cost;
      }
    }
  }

  const complete = observed.length === candidates.length;
  const status = lineageAmbiguous
    ? "REBASED_CHALLENGER_EVALUATION_LINEAGE_AMBIGUOUS"
    : observed.length < 2
      ? "REBASED_CHALLENGER_WAITING_FOR_GOVERNED_OUTCOMES"
      : comparablePairs === 0
        ? "REBASED_CHALLENGER_NO_RANK_CHANGED_PAIRS_OBSERVED"
        : complete
          ? "REBASED_CHALLENGER_COMPLETE_PROSPECTIVE_EVALUATION"
          : "REBASED_CHALLENGER_PARTIAL_PROSPECTIVE_EVALUATION";
  const cycleWinner =
    comparablePairs === 0
      ? "NO_COMPARABLE_RANK_CHANGED_PAIRS"
      : challengerCorrect > baselineCorrect
        ? "CHALLENGER"
        : challengerCorrect < baselineCorrect
          ? "BASELINE"
          : challengerRegret < baselineRegret
            ? "CHALLENGER"
            : challengerRegret > baselineRegret
              ? "BASELINE"
              : "TIE";
  const evaluationFingerprint = digest(
    "rebased-selection-policy-evaluation",
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
    memory_scope: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_EVALUATION_SCOPE,
    memory_key: `rebased-selection-policy-evaluation:${text(metadata.snapshot_fingerprint, 128).slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Rebased challenger evaluation ${cycleFingerprint.slice(0, 16)}`,
    content:
      "Authoritative prospective evaluation for one Phase 38 selection cycle. Only unique governed outcomes for the exact selected portfolio are compared, and only pairs whose ordering differs between the current persistent baseline and the rebased challenger are informative.",
    importance: 0.99,
    confidence: lineageAmbiguous ? 0 : 1,
    source: "rebased_selection_policy_challenger_evaluation",
    active: true,
    valid_until: plusDays(nowIso, RETENTION_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
      status,
      evaluation_fingerprint: evaluationFingerprint,
      snapshot_fingerprint: text(metadata.snapshot_fingerprint, 128),
      proposal_fingerprint: text(metadata.proposal_fingerprint, 128),
      research_epoch_fingerprint: text(metadata.research_epoch_fingerprint, 128),
      current_baseline_policy_fingerprint: text(
        metadata.current_baseline_policy_fingerprint,
        128,
      ),
      challenger_policy_version: text(metadata.challenger_policy_version, 180),
      selection_cycle_fingerprint: cycleFingerprint,
      candidate_count: candidates.length,
      observed_candidate_count: observed.length,
      complete_governed_outcome_set: complete && !lineageAmbiguous,
      lineage_ambiguity_detected: lineageAmbiguous,
      informative_rank_changed_pair_count: comparablePairs,
      current_baseline_pairwise_correct_count: baselineCorrect,
      rebased_challenger_pairwise_correct_count: challengerCorrect,
      current_baseline_pairwise_correct_rate: ratio(baselineCorrect, comparablePairs),
      rebased_challenger_pairwise_correct_rate: ratio(challengerCorrect, comparablePairs),
      current_baseline_observed_rank_regret: baselineRegret,
      rebased_challenger_observed_rank_regret: challengerRegret,
      cycle_winner: cycleWinner,
      observed,
      authoritative_evaluation_per_selection_cycle: true,
      unexecuted_candidate_outcomes_inferred: false,
      full_counterfactual_regret_claimed: false,
      selected_membership_change_authorized: false,
      live_ordering_mutation_authorized: false,
      automatic_policy_promotion: false,
      automatic_policy_activation: false,
      execution_authorized: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      authorization_value: "prospective_evaluation_only",
      evaluated_at: nowIso,
    },
    updated_at: nowIso,
  };
}

function reviewRow({ organizationId, policy, proposal, evaluations, nowIso }) {
  const proposalMetadata = object(proposal.metadata);
  const complete = evaluations.filter((row) => {
    const metadata = object(row.metadata);
    return Boolean(
      metadata.complete_governed_outcome_set === true &&
        metadata.lineage_ambiguity_detected === false &&
        Number(metadata.informative_rank_changed_pair_count) > 0
    );
  });
  const pairCount = complete.reduce(
    (total, row) =>
      total + Number(object(row.metadata).informative_rank_changed_pair_count || 0),
    0,
  );
  const baselineCorrect = complete.reduce(
    (total, row) =>
      total + Number(object(row.metadata).current_baseline_pairwise_correct_count || 0),
    0,
  );
  const challengerCorrect = complete.reduce(
    (total, row) =>
      total + Number(object(row.metadata).rebased_challenger_pairwise_correct_count || 0),
    0,
  );
  const baselineRegret = complete.reduce(
    (total, row) =>
      total + Number(object(row.metadata).current_baseline_observed_rank_regret || 0),
    0,
  );
  const challengerRegret = complete.reduce(
    (total, row) =>
      total + Number(object(row.metadata).rebased_challenger_observed_rank_regret || 0),
    0,
  );
  const distinctExperiments = unique(
    complete.flatMap((row) =>
      list(object(row.metadata).observed).map((item) => item.experiment_fingerprint),
    ),
  );
  const worseCycles = complete.filter(
    (row) => object(row.metadata).cycle_winner === "BASELINE",
  ).length;
  const baselineRate = ratio(baselineCorrect, pairCount);
  const challengerRate = ratio(challengerCorrect, pairCount);
  const advantage = challengerRate - baselineRate;
  const reviewCandidate = Boolean(
    complete.length >= MIN_REVIEW_COMPLETE_CYCLES &&
      pairCount >= MIN_REVIEW_COMPARABLE_PAIRS &&
      distinctExperiments.length >= MIN_REVIEW_DISTINCT_EXPERIMENTS &&
      challengerRate >= MIN_REVIEW_CHALLENGER_CORRECT_RATE &&
      advantage >= MIN_REVIEW_RATE_ADVANTAGE &&
      worseCycles === 0 &&
      challengerRegret <= baselineRegret
  );
  const reviewFingerprint = digest(
    "rebased-selection-policy-review",
    proposalMetadata.proposal_fingerprint,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_REVIEW_SCOPE,
    memory_key: `rebased-selection-policy-review:${reviewFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Rebased challenger review ${reviewFingerprint.slice(0, 16)}`,
    content:
      "Aggregated prospective review of the distinct Phase 38 challenger against the current persistent policy baseline. Even when maturity thresholds are met this row is a promotion-review candidate only; no promotion, canary, activation or execution authority is granted.",
    importance: 0.99,
    confidence: 1,
    source: "rebased_selection_policy_challenger_review",
    active: true,
    valid_until: plusDays(nowIso, RETENTION_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
      status: reviewCandidate
        ? "REBASED_CHALLENGER_PROMOTION_REVIEW_CANDIDATE"
        : "REBASED_CHALLENGER_PROSPECTIVE_EVIDENCE_ACCUMULATING",
      review_fingerprint: reviewFingerprint,
      proposal_fingerprint: proposalMetadata.proposal_fingerprint,
      research_epoch_fingerprint: proposalMetadata.research_epoch_fingerprint,
      current_baseline_policy_fingerprint: policy.policy_fingerprint,
      challenger_policy_version: proposalMetadata.challenger_policy_version,
      complete_evaluated_cycle_count: complete.length,
      comparable_rank_changed_pair_count: pairCount,
      distinct_experiment_count: distinctExperiments.length,
      current_baseline_pairwise_correct_rate: baselineRate,
      rebased_challenger_pairwise_correct_rate: challengerRate,
      challenger_correct_rate_advantage: advantage,
      current_baseline_observed_rank_regret: baselineRegret,
      rebased_challenger_observed_rank_regret: challengerRegret,
      baseline_winning_cycle_count: worseCycles,
      minimum_complete_cycles: MIN_REVIEW_COMPLETE_CYCLES,
      minimum_comparable_pairs: MIN_REVIEW_COMPARABLE_PAIRS,
      minimum_distinct_experiments: MIN_REVIEW_DISTINCT_EXPERIMENTS,
      minimum_challenger_correct_rate: MIN_REVIEW_CHALLENGER_CORRECT_RATE,
      minimum_challenger_rate_advantage: MIN_REVIEW_RATE_ADVANTAGE,
      zero_baseline_winning_cycles_required: true,
      no_higher_observed_rank_regret_required: true,
      promotion_review_candidate: reviewCandidate,
      promotion_authorized: false,
      canary_authorized: false,
      activation_authorized: false,
      automatic_policy_promotion: false,
      automatic_policy_activation: false,
      selected_membership_change_authorized: false,
      live_ordering_mutation_authorized: false,
      execution_authorized: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      authorization_value: "review_evidence_only",
      reviewed_at: nowIso,
    },
    updated_at: nowIso,
  };
}

export async function reconcileAvantiqoRebasedSelectionPolicyChallenger({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      proposal_ready: false,
      live_ordering_mutated: false,
    };
  }

  const policy = await loadActivePolicy(organizationId);
  if (!policy) {
    return {
      success: true,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
      status: "NO_ACTIVE_PERSISTENT_POLICY_BASELINE",
      proposal_ready: false,
      prospective_snapshot_recorded: false,
      promotion_authorized: false,
      automatic_policy_activation: false,
      live_ordering_mutated: false,
    };
  }
  if (
    policy.contract !== PERSISTENT_POLICY_CONTRACT ||
    !validFingerprint(policy.policy_fingerprint) ||
    !validFingerprint(policy.baseline_policy_fingerprint) ||
    !text(policy.challenger_policy_version, 180) ||
    Number(policy.ordering_influence_fraction) <= 0 ||
    Number(policy.ordering_influence_fraction) > 0.25
  ) {
    return {
      success: false,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
      status: "CURRENT_PERSISTENT_POLICY_BASELINE_INVALID_FAIL_CLOSED",
      proposal_ready: false,
      live_ordering_mutated: false,
      execution_authorized: false,
    };
  }

  const epoch = await loadCurrentEpoch(organizationId, policy.policy_fingerprint);
  const epochMetadata = object(epoch?.metadata);
  if (
    !epoch ||
    text(epochMetadata.contract, 180) !==
      AVANTIQO_SELECTION_POLICY_RESEARCH_EPOCH_CONTRACT ||
    text(epochMetadata.status, 180) !==
      "ACTIVE_PERSISTENT_POLICY_IS_CURRENT_RESEARCH_BASELINE" ||
    text(epochMetadata.current_baseline_policy_fingerprint, 128) !==
      text(policy.policy_fingerprint, 128) ||
    epochMetadata.old_challenger_repromotion_allowed !== false ||
    epochMetadata.future_challenger_must_bind_current_baseline_policy_fingerprint !== true ||
    epochMetadata.future_challenger_must_use_distinct_policy_version !== true ||
    epochMetadata.future_challenger_requires_post_activation_governed_evidence !== true
  ) {
    return {
      success: false,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
      status: "CURRENT_RESEARCH_EPOCH_NOT_AUTHORITATIVE_FAIL_CLOSED",
      proposal_ready: false,
      live_ordering_mutated: false,
      execution_authorized: false,
    };
  }

  const epochFingerprint = text(epochMetadata.epoch_fingerprint, 128);
  let proposal = await loadExistingProposal(organizationId, epochFingerprint);
  let proposalWriteCount = 0;
  let baselineEvidence = null;
  if (!proposal) {
    const evidence = await loadBaselineEvidence(organizationId, policy);
    baselineEvidence = buildQualifiedBaselineObservations(policy, evidence);
    if (baselineEvidence.ambiguous) {
      return {
        success: false,
        contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
        status: "POST_ACTIVATION_BASELINE_EVIDENCE_AMBIGUOUS_FAIL_CLOSED",
        proposal_ready: false,
        live_ordering_mutated: false,
        execution_authorized: false,
      };
    }
    const distinctExperiments = unique(
      baselineEvidence.observations.map((item) => item.experiment_fingerprint),
    );
    if (
      baselineEvidence.completeCycles.length < MIN_BASELINE_COMPLETE_CYCLES ||
      baselineEvidence.observations.length < MIN_BASELINE_OBSERVATIONS ||
      distinctExperiments.length < MIN_BASELINE_DISTINCT_EXPERIMENTS
    ) {
      return {
        success: true,
        contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
        status: "WAITING_FOR_MATURE_POST_ACTIVATION_BASELINE_EVIDENCE",
        proposal_ready: false,
        post_activation_complete_cycle_count: baselineEvidence.completeCycles.length,
        post_activation_governed_observation_count:
          baselineEvidence.observations.length,
        post_activation_distinct_experiment_count: distinctExperiments.length,
        minimum_complete_cycles: MIN_BASELINE_COMPLETE_CYCLES,
        minimum_governed_observations: MIN_BASELINE_OBSERVATIONS,
        minimum_distinct_experiments: MIN_BASELINE_DISTINCT_EXPERIMENTS,
        historical_pre_activation_outcomes_used: false,
        promotion_authorized: false,
        automatic_policy_activation: false,
        live_ordering_mutated: false,
      };
    }
    const nowIso = new Date().toISOString();
    const row = proposalRow({
      organizationId,
      policy,
      epoch,
      observations: baselineEvidence.observations,
      completeCycles: baselineEvidence.completeCycles,
      nowIso,
    });
    if (persist) {
      proposal = await writeRow(row);
      proposalWriteCount = 1;
    } else {
      proposal = row;
    }
  }

  const proposalMetadata = object(proposal.metadata);
  if (
    text(proposalMetadata.contract, 180) !==
      AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT ||
    text(proposalMetadata.status, 180) !==
      "POST_ACTIVATION_REBASED_CHALLENGER_PROPOSAL_RECORDED" ||
    text(proposalMetadata.current_baseline_policy_fingerprint, 128) !==
      text(policy.policy_fingerprint, 128) ||
    text(proposalMetadata.challenger_policy_version, 180) ===
      text(policy.challenger_policy_version, 180) ||
    proposalMetadata.historical_pre_activation_outcomes_used !== false ||
    proposalMetadata.prospective_same_selected_portfolio_evaluation_required !== true ||
    proposalMetadata.challenger_score_can_exceed_current_persistent_baseline !== false
  ) {
    return {
      success: false,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
      status: "REBASED_CHALLENGER_PROPOSAL_LINEAGE_INVALID_FAIL_CLOSED",
      proposal_ready: false,
      live_ordering_mutated: false,
      execution_authorized: false,
    };
  }

  const selections = await loadCurrentSelections(organizationId);
  const cycles = unique(
    selections.map((row) => object(row.metadata).selection_cycle_fingerprint),
  );
  let snapshot = null;
  let snapshotWriteCount = 0;
  let snapshotStatus = "WAITING_FOR_CURRENT_MULTI_SELECTION_PORTFOLIO";
  if (selections.length >= 2 && cycles.length === 1) {
    const cycleFingerprint = cycles[0];
    snapshot = await loadExistingSnapshot(
      organizationId,
      proposalMetadata.proposal_fingerprint,
      cycleFingerprint,
    );
    if (!snapshot) {
      const application = await loadCurrentApplication(
        organizationId,
        policy,
        cycleFingerprint,
      );
      if (!application) {
        snapshotStatus = "WAITING_FOR_CURRENT_PERSISTENT_POLICY_APPLICATION";
      } else {
        const selectionFingerprints = selections.map((row) =>
          text(object(row.metadata).selection_fingerprint, 128),
        );
        if (await executionRequestExists(organizationId, selectionFingerprints)) {
          snapshotStatus = "PROSPECTIVE_SNAPSHOT_NOT_CREATED_AFTER_EXECUTION_REQUEST";
        } else {
          const nowIso = new Date().toISOString();
          const row = buildSnapshotRow({
            organizationId,
            policy,
            proposal,
            selections,
            application,
            nowIso,
          });
          if (!row) {
            return {
              success: false,
              contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
              status: "CURRENT_PERSISTENT_BASELINE_ASSIGNMENT_LINEAGE_INVALID_FAIL_CLOSED",
              proposal_ready: true,
              live_ordering_mutated: false,
              execution_authorized: false,
            };
          }
          if (persist) {
            snapshot = await writeRow(row);
            snapshotWriteCount = 1;
          } else {
            snapshot = row;
          }
          snapshotStatus = "PROSPECTIVE_REBASED_CHALLENGER_SNAPSHOT_RECORDED";
        }
      }
    } else {
      snapshotStatus = "PROSPECTIVE_REBASED_CHALLENGER_SNAPSHOT_ALREADY_RECORDED";
    }
  } else if (cycles.length > 1) {
    return {
      success: false,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
      status: "CURRENT_SELECTION_CYCLE_AMBIGUOUS_FAIL_CLOSED",
      proposal_ready: true,
      live_ordering_mutated: false,
      execution_authorized: false,
    };
  }

  const snapshots = await loadProposalSnapshots(
    organizationId,
    proposalMetadata.proposal_fingerprint,
  );
  const outcomeRows = await loadPostActivationOutcomes(
    organizationId,
    policy.activated_at,
  );
  const activatedAtMs = Date.parse(text(policy.activated_at, 120));
  const nowIso = new Date().toISOString();
  const evaluations = snapshots.map((item) =>
    evaluateSnapshot(item, outcomeRows, activatedAtMs, organizationId, nowIso),
  );
  let evaluationWriteCount = 0;
  if (persist) {
    for (const evaluation of evaluations) {
      await writeRow(evaluation);
      evaluationWriteCount += 1;
    }
  }
  const review = reviewRow({
    organizationId,
    policy,
    proposal,
    evaluations,
    nowIso,
  });
  let reviewWriteCount = 0;
  if (persist) {
    await writeRow(review);
    reviewWriteCount = 1;
  }

  return {
    success: true,
    contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
    status: object(review.metadata).promotion_review_candidate === true
      ? "REBASED_CHALLENGER_PROMOTION_REVIEW_CANDIDATE"
      : snapshotStatus,
    proposal_ready: true,
    proposal_fingerprint: proposalMetadata.proposal_fingerprint,
    challenger_policy_version: proposalMetadata.challenger_policy_version,
    current_baseline_policy_fingerprint: policy.policy_fingerprint,
    research_epoch_fingerprint: epochFingerprint,
    proposal_write_count: proposalWriteCount,
    prospective_snapshot_recorded:
      snapshotStatus === "PROSPECTIVE_REBASED_CHALLENGER_SNAPSHOT_RECORDED" ||
      snapshotStatus === "PROSPECTIVE_REBASED_CHALLENGER_SNAPSHOT_ALREADY_RECORDED",
    snapshot_write_count: snapshotWriteCount,
    evaluated_cycle_count: evaluations.length,
    evaluation_write_count: evaluationWriteCount,
    review_write_count: reviewWriteCount,
    promotion_review_candidate:
      object(review.metadata).promotion_review_candidate === true,
    promotion_authorized: false,
    canary_authorized: false,
    activation_authorized: false,
    automatic_policy_promotion: false,
    automatic_policy_activation: false,
    selected_membership_change_authorized: false,
    source_numeric_score_mutation_authorized: false,
    live_ordering_mutated: false,
    execution_authorized: false,
    provider_execution_authorized: false,
    spend_authorized: false,
    provider_called_here: false,
    wallet_write_performed_here: false,
    runpod_job_submitted: false,
    platform_knowledge_written: false,
    automatic_training_started: false,
    automatic_model_weight_mutation: false,
  };
}

export const AvantiqoRebasedSelectionPolicyChallengerRuntime = Object.freeze({
  contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
  reconcile: reconcileAvantiqoRebasedSelectionPolicyChallenger,
});
