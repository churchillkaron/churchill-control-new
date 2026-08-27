import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
  AVANTIQO_SELECTION_POLICY_PROMOTION_APPROVAL_SCOPE,
  AVANTIQO_SELECTION_POLICY_CANARY_RELEASE_SCOPE,
  AVANTIQO_SELECTION_POLICY_ROLLBACK_DIRECTIVE_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoSelectionPolicyPromotionGovernanceRuntime";
import {
  AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT,
} from "@/lib/intelligence/runtime/AvantiqoSelectionPolicyShadowChallengerRuntime";

export const AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT =
  "AVANTIQO_SELECTION_POLICY_CANARY_V1";

export const AVANTIQO_SELECTION_POLICY_CANARY_ACTIVATION_SCOPE =
  "platform_learning_experiment_selection_policy_canary_activations";
export const AVANTIQO_SELECTION_POLICY_CANARY_APPLICATION_SCOPE =
  "platform_learning_experiment_selection_policy_canary_applications";
export const AVANTIQO_SELECTION_POLICY_CANARY_ROLLBACK_SCOPE =
  "platform_learning_experiment_selection_policy_canary_rollbacks";

const ACTIVE_SELECTION_CONTRACT = "AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1";
const MEMORY_TABLE = "intelligence_memories";
const SELECTION_SCOPE = "platform_learning_active_experiment_selections";
const REQUEST_SCOPE = "platform_learning_experiment_execution_requests";
const SHADOW_SNAPSHOT_SCOPE =
  "platform_learning_experiment_selection_policy_shadow_snapshots";
const SHADOW_EVALUATION_SCOPE =
  "platform_learning_experiment_selection_policy_shadow_evaluations";
const MAX_CANARY_INFLUENCE_FRACTION = 0.25;
const MAX_CANARY_CYCLES = 3;
const MAX_ACTIVE_SELECTIONS = 20;
const ACTIVATION_VALIDITY_DAYS = 7;
const ROLLBACK_RETENTION_DAYS = 730;
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

function activeAndUnexpired(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  const validUntil = Date.parse(text(row.valid_until, 120));
  return !Number.isFinite(validUntil) || validUntil > nowMs;
}

function requireFingerprint(value, code) {
  const fingerprint = text(value, 128).toLowerCase();
  if (!/^[a-f0-9]{32,128}$/.test(fingerprint)) {
    throw new Error(`${AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT}_${code}_INVALID`);
  }
  return fingerprint;
}

function requireReason(value, code) {
  const reason = text(value, 4000);
  if (reason.length < 12) {
    throw new Error(`${AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT}_${code}_REQUIRED`);
  }
  return reason;
}

function boundedInfluenceFraction(value, approvedMaximum) {
  const number = Number(value);
  const approval = Number(approvedMaximum);
  if (
    !Number.isFinite(number) ||
    number <= 0 ||
    number > MAX_CANARY_INFLUENCE_FRACTION ||
    !Number.isFinite(approval) ||
    number > approval
  ) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT}_CANARY_INFLUENCE_FRACTION_INVALID`,
    );
  }
  return number;
}

function boundedCanaryCycles(value, approvedMaximum) {
  const number = Number(value);
  const approval = Number(approvedMaximum);
  if (
    !Number.isInteger(number) ||
    number < 1 ||
    number > MAX_CANARY_CYCLES ||
    !Number.isInteger(approval) ||
    number > approval
  ) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT}_CANARY_CYCLES_INVALID`,
    );
  }
  return number;
}

async function loadExactRow(organizationId, scope, metadataKey, fingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", scope)
    .eq(`metadata->>${metadataKey}`, fingerprint)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadActiveRows(organizationId, scope, limit = 100) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", scope)
    .eq("active", true)
    .limit(limit);
  if (result.error) throw result.error;
  return list(result.data);
}

async function insertRow(row) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(row)
    .select("id,memory_key,metadata")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

async function upsertRow(row) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(row, {
      onConflict: "organization_id,memory_scope,memory_key",
    })
    .select("id,memory_key,metadata")
    .single();
  if (result.error) throw result.error;
  return result.data;
}

export async function recordAvantiqoSelectionPolicyCanaryActivation({
  release_candidate_fingerprint,
  activator_fingerprint,
  activation_reason,
  canary_influence_fraction,
  canary_cycles,
  explicit_activation_review_completed = false,
  rollback_readiness_confirmed = false,
  same_actor_as_policy_promotion_approver = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`,
    );
  }
  const releaseCandidateFingerprint = requireFingerprint(
    release_candidate_fingerprint,
    "RELEASE_CANDIDATE_FINGERPRINT",
  );
  const activatorFingerprint = requireFingerprint(
    activator_fingerprint,
    "ACTIVATOR_FINGERPRINT",
  );
  const reason = requireReason(activation_reason, "ACTIVATION_REASON");
  if (
    explicit_activation_review_completed !== true ||
    rollback_readiness_confirmed !== true
  ) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT}_ACTIVATION_AND_ROLLBACK_REVIEW_REQUIRED`,
    );
  }
  if (same_actor_as_policy_promotion_approver !== false) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT}_ACTIVATOR_INDEPENDENCE_REQUIRED`,
    );
  }

  const candidate = await loadExactRow(
    organizationId,
    AVANTIQO_SELECTION_POLICY_CANARY_RELEASE_SCOPE,
    "release_candidate_fingerprint",
    releaseCandidateFingerprint,
  );
  const candidateMetadata = object(candidate?.metadata);
  if (
    !activeAndUnexpired(candidate) ||
    text(candidateMetadata.contract, 180) !==
      AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT ||
    text(candidateMetadata.status, 180) !==
      "CANARY_POLICY_RELEASE_CANDIDATE_READY_FOR_SEPARATE_ACTIVATION" ||
    candidateMetadata.activation_requires_separate_phase !== true ||
    candidateMetadata.production_canary_activation_authorized !== false ||
    candidateMetadata.exact_baseline_rollback_required !== true ||
    candidateMetadata.full_policy_cutover_allowed !== false ||
    !text(candidateMetadata.baseline_policy_fingerprint, 128) ||
    !text(candidateMetadata.rollback_plan_fingerprint, 128)
  ) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT}_RELEASE_CANDIDATE_NOT_CURRENT`,
    );
  }

  const approvalFingerprint = requireFingerprint(
    candidateMetadata.approval_fingerprint,
    "APPROVAL_FINGERPRINT",
  );
  const approval = await loadExactRow(
    organizationId,
    AVANTIQO_SELECTION_POLICY_PROMOTION_APPROVAL_SCOPE,
    "approval_fingerprint",
    approvalFingerprint,
  );
  const approvalMetadata = object(approval?.metadata);
  if (
    text(approvalMetadata.contract, 180) !==
      AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT ||
    text(approvalMetadata.status, 180) !==
      "EXPLICIT_POLICY_CANARY_RELEASE_CANDIDATE_APPROVAL_RECORDED" ||
    text(approvalMetadata.approver_fingerprint, 128) === activatorFingerprint
  ) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT}_ACTIVATOR_NOT_INDEPENDENT_FROM_PROMOTION_APPROVER`,
    );
  }

  const influenceFraction = boundedInfluenceFraction(
    canary_influence_fraction,
    candidateMetadata.approved_canary_selection_fraction,
  );
  const cycleLimit = boundedCanaryCycles(
    canary_cycles,
    candidateMetadata.approved_canary_cycles,
  );
  const currentActivations = (
    await loadActiveRows(
      organizationId,
      AVANTIQO_SELECTION_POLICY_CANARY_ACTIVATION_SCOPE,
      20,
    )
  ).filter((row) => activeAndUnexpired(row));
  if (currentActivations.length > 0) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT}_ACTIVE_CANARY_ALREADY_EXISTS`,
    );
  }

  const nowIso = new Date().toISOString();
  const candidateExpiryMs = Date.parse(text(candidate.valid_until, 120));
  const hardExpiryMs = Date.parse(plusDays(nowIso, ACTIVATION_VALIDITY_DAYS));
  const validUntil = new Date(
    Number.isFinite(candidateExpiryMs)
      ? Math.min(candidateExpiryMs, hardExpiryMs)
      : hardExpiryMs,
  ).toISOString();
  const activationFingerprint = digest(
    "selection-policy-canary-activation",
    releaseCandidateFingerprint,
    activatorFingerprint,
    nowIso,
    influenceFraction,
    cycleLimit,
  );
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_SELECTION_POLICY_CANARY_ACTIVATION_SCOPE,
    memory_key: `selection-policy-canary-activation:${activationFingerprint.slice(0, 40)}`,
    memory_type: "decision",
    subject: `Selection policy canary activation ${activationFingerprint.slice(0, 16)}`,
    content:
      "Explicit bounded activation of a Phase 31 release candidate. The canary may blend at most the approved challenger influence into ranking of the exact same selected portfolio; it cannot add candidates, increase source scores, perform full policy cutover, or exceed the approved cycle limit.",
    importance: 1,
    confidence: 1,
    source: "explicit_selection_policy_canary_activation",
    active: true,
    valid_until: validUntil,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
      status: "EXPLICIT_BOUNDED_POLICY_CANARY_ACTIVATION_RECORDED",
      activation_fingerprint: activationFingerprint,
      release_candidate_fingerprint: releaseCandidateFingerprint,
      approval_fingerprint: approvalFingerprint,
      challenger_policy_version: text(
        candidateMetadata.challenger_policy_version,
        160,
      ),
      baseline_policy_contract: text(
        candidateMetadata.baseline_policy_contract,
        180,
      ),
      baseline_policy_version: text(candidateMetadata.baseline_policy_version, 160),
      baseline_policy_fingerprint: text(
        candidateMetadata.baseline_policy_fingerprint,
        128,
      ),
      rollback_plan_fingerprint: text(
        candidateMetadata.rollback_plan_fingerprint,
        128,
      ),
      activator_fingerprint: activatorFingerprint,
      activation_reason: reason,
      explicit_activation_review_completed: true,
      rollback_readiness_confirmed: true,
      same_actor_as_policy_promotion_approver: false,
      canary_influence_fraction: influenceFraction,
      canary_cycle_limit: cycleLimit,
      maximum_canary_influence_fraction: MAX_CANARY_INFLUENCE_FRACTION,
      maximum_canary_cycles: MAX_CANARY_CYCLES,
      canary_fraction_is_policy_influence_not_membership_fraction: true,
      same_selected_portfolio_only: true,
      selected_membership_change_authorized: false,
      source_score_increase_authorized: false,
      full_policy_cutover_authorized: false,
      automatic_regression_rollback_required: true,
      explicit_rollback_directive_must_be_honored: true,
      live_rank_canary_authorized: true,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      authorization_value: "bounded_same_portfolio_rank_blending_only",
      activated_at: nowIso,
    },
    updated_at: nowIso,
  };
  const written = await insertRow(row);
  return {
    success: true,
    contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
    status: row.metadata.status,
    activation: written,
    selected_membership_change_authorized: false,
    full_policy_cutover_authorized: false,
  };
}

function validSelection(row, nowMs = Date.now()) {
  const metadata = object(row?.metadata);
  return Boolean(
    activeAndUnexpired(row, nowMs) &&
      text(metadata.contract, 180) === ACTIVE_SELECTION_CONTRACT &&
      text(metadata.status, 180) ===
        "SELECTED_FOR_SEPARATE_GOVERNED_EXECUTION_REVIEW" &&
      metadata.selection_is_not_execution_authorization === true &&
      metadata.execution_requires_separate_governance === true &&
      metadata.execution_authorized === false &&
      metadata.provider_execution_authorized === false &&
      metadata.spend_authorized === false &&
      Number(metadata.selection_rank) > 0 &&
      Boolean(text(metadata.selection_fingerprint, 128)) &&
      Boolean(text(metadata.selection_cycle_fingerprint, 128))
  );
}

async function loadCurrentSelections(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", SELECTION_SCOPE)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(MAX_ACTIVE_SELECTIONS);
  if (result.error) throw result.error;
  return list(result.data).filter((row) => validSelection(row));
}

async function loadCurrentSnapshot(organizationId, cycleFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", SHADOW_SNAPSHOT_SCOPE)
    .eq("active", true)
    .eq("metadata->>selection_cycle_fingerprint", cycleFingerprint)
    .order("created_at", { ascending: false })
    .limit(10);
  if (result.error) throw result.error;
  return list(result.data).find((row) => {
    const metadata = object(row.metadata);
    return Boolean(
      text(metadata.contract, 180) ===
        AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT &&
        text(metadata.status, 180) ===
          "PROSPECTIVE_SHADOW_CHALLENGER_SNAPSHOT_RECORDED" &&
        metadata.created_before_execution_request === true &&
        metadata.historical_counterfactual_backtest_claimed === false &&
        metadata.prospective_same_selected_portfolio_comparison_only === true
    );
  }) || null;
}

async function requestsExistForSelections(organizationId, selectionFingerprints) {
  for (const fingerprint of selectionFingerprints) {
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id")
      .eq("organization_id", organizationId)
      .eq("memory_scope", REQUEST_SCOPE)
      .eq("metadata->>selection_fingerprint", fingerprint)
      .limit(1);
    if (result.error) throw result.error;
    if (list(result.data).length > 0) return true;
  }
  return false;
}

async function loadApplicationsForActivation(organizationId, activationFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", AVANTIQO_SELECTION_POLICY_CANARY_APPLICATION_SCOPE)
    .eq("metadata->>activation_fingerprint", activationFingerprint)
    .limit(100);
  if (result.error) throw result.error;
  return list(result.data);
}

async function loadEvaluationByCycle(organizationId, cycleFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", SHADOW_EVALUATION_SCOPE)
    .eq("active", true)
    .eq("metadata->>selection_cycle_fingerprint", cycleFingerprint)
    .order("created_at", { ascending: false })
    .limit(10);
  if (result.error) throw result.error;
  return list(result.data).find((row) => {
    const metadata = object(row.metadata);
    return Boolean(
      text(metadata.contract, 180) ===
        AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT &&
        text(metadata.status, 180) ===
          "PROSPECTIVE_SHADOW_CHALLENGER_EVALUATED" &&
        metadata.prospective_shadow_only === true &&
        metadata.unexecuted_candidate_outcome_inferred === false
    );
  }) || null;
}

async function loadRollbackDirective(organizationId, releaseCandidateFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", AVANTIQO_SELECTION_POLICY_ROLLBACK_DIRECTIVE_SCOPE)
    .eq("active", true)
    .eq("metadata->>release_candidate_fingerprint", releaseCandidateFingerprint)
    .order("created_at", { ascending: false })
    .limit(10);
  if (result.error) throw result.error;
  return list(result.data).find((row) => {
    const metadata = object(row.metadata);
    return Boolean(
      activeAndUnexpired(row) &&
        text(metadata.contract, 180) ===
          AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT &&
        text(metadata.status, 180) ===
          "ROLLBACK_DIRECTIVE_RECORDED_AWAITING_SEPARATE_APPLICATION" &&
        metadata.directive_requires_separate_application === true &&
        metadata.production_policy_mutated_here === false
    );
  }) || null;
}

async function restoreCurrentSelectionRanks(
  organizationId,
  activationFingerprint,
  reason,
  nowIso,
) {
  const selections = await loadCurrentSelections(organizationId);
  let restored = 0;
  for (const row of selections) {
    const metadata = object(row.metadata);
    if (
      text(metadata.phase32_canary_activation_fingerprint, 128) !==
      activationFingerprint
    ) {
      continue;
    }
    const baselineRank = Number(metadata.phase32_baseline_rank);
    if (!Number.isInteger(baselineRank) || baselineRank < 1) continue;
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({
        metadata: {
          ...metadata,
          selection_rank: baselineRank,
          phase32_contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
          phase32_status: "BASELINE_RANK_RESTORED",
          phase32_rollback_reason: reason,
          phase32_rollback_at: nowIso,
          phase32_canary_rank_active: false,
        },
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .eq("active", true)
      .select("id");
    if (result.error) throw result.error;
    if (list(result.data).length === 1) restored += 1;
  }
  return restored;
}

async function closeActivationWithRollback({
  organizationId,
  activation,
  reasonCode,
  reasonDetail,
  sourceEvaluationFingerprint = null,
  sourceRollbackDirectiveFingerprint = null,
}) {
  const metadata = object(activation.metadata);
  const activationFingerprint = text(metadata.activation_fingerprint, 128);
  const nowIso = new Date().toISOString();
  const restoredSelectionCount = await restoreCurrentSelectionRanks(
    organizationId,
    activationFingerprint,
    reasonCode,
    nowIso,
  );
  const closeResult = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      forgotten_at: nowIso,
      updated_at: nowIso,
      metadata: {
        ...metadata,
        status: reasonCode === "CANARY_CYCLE_LIMIT_COMPLETE"
          ? "CANARY_CYCLE_LIMIT_COMPLETE_BASELINE_RESTORED"
          : "CANARY_ROLLED_BACK_TO_EXACT_BASELINE",
        phase32_closed_reason: reasonCode,
        phase32_closed_detail: reasonDetail,
        phase32_closed_at: nowIso,
        live_rank_canary_authorized: false,
        baseline_restored: true,
      },
    })
    .eq("id", activation.id)
    .eq("active", true)
    .select("id");
  if (closeResult.error) throw closeResult.error;

  const rollbackFingerprint = digest(
    "selection-policy-canary-rollback",
    activationFingerprint,
    reasonCode,
    sourceEvaluationFingerprint || "none",
    sourceRollbackDirectiveFingerprint || "none",
  );
  const rollbackRow = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_SELECTION_POLICY_CANARY_ROLLBACK_SCOPE,
    memory_key: `selection-policy-canary-rollback:${rollbackFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Selection policy canary baseline restoration ${rollbackFingerprint.slice(0, 16)}`,
    content:
      "Immutable evidence that the bounded canary was closed and current canaried ranks were restored to the exact Phase 31 baseline. Regression and explicit rollback directives fail closed; no full policy promotion is performed.",
    importance: 1,
    confidence: 1,
    source: "selection_policy_canary_rollback_enforcement",
    active: true,
    valid_until: plusDays(nowIso, ROLLBACK_RETENTION_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
      status: reasonCode === "CANARY_CYCLE_LIMIT_COMPLETE"
        ? "CANARY_COMPLETED_BASELINE_RESTORATION_RECORDED"
        : "CANARY_ROLLBACK_TO_BASELINE_RECORDED",
      rollback_fingerprint: rollbackFingerprint,
      activation_fingerprint: activationFingerprint,
      release_candidate_fingerprint: text(
        metadata.release_candidate_fingerprint,
        128,
      ),
      baseline_policy_fingerprint: text(
        metadata.baseline_policy_fingerprint,
        128,
      ),
      rollback_plan_fingerprint: text(metadata.rollback_plan_fingerprint, 128),
      reason_code: reasonCode,
      reason_detail: text(reasonDetail, 4000),
      source_evaluation_fingerprint: sourceEvaluationFingerprint,
      source_rollback_directive_fingerprint: sourceRollbackDirectiveFingerprint,
      restored_current_selection_count: restoredSelectionCount,
      exact_baseline_restored: true,
      selected_membership_changed: false,
      source_numeric_scores_mutated: false,
      automatic_full_policy_promotion: false,
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
      recorded_at: nowIso,
    },
    updated_at: nowIso,
  };
  await upsertRow(rollbackRow);
  return {
    activation_fingerprint: activationFingerprint,
    reason_code: reasonCode,
    restored_current_selection_count: restoredSelectionCount,
    rollback_fingerprint: rollbackFingerprint,
  };
}

async function applyCanaryRanking({
  organizationId,
  activation,
  selections,
  snapshot,
  applications,
}) {
  const activationMetadata = object(activation.metadata);
  const snapshotMetadata = object(snapshot.metadata);
  const cycleFingerprint = text(
    snapshotMetadata.selection_cycle_fingerprint,
    128,
  );
  const existingApplication = list(applications).find(
    (row) =>
      text(object(row.metadata).selection_cycle_fingerprint, 128) === cycleFingerprint,
  );
  if (existingApplication) {
    return {
      status: "CANARY_ALREADY_APPLIED_TO_CURRENT_SELECTION_CYCLE",
      application: existingApplication,
      rank_changed: Boolean(object(existingApplication.metadata).rank_changed),
    };
  }

  const selectionByFingerprint = new Map(
    selections.map((row) => [
      text(object(row.metadata).selection_fingerprint, 128),
      row,
    ]),
  );
  const candidates = list(snapshotMetadata.candidates);
  if (
    candidates.length < 2 ||
    candidates.length !== selections.length ||
    candidates.some(
      (candidate) =>
        !selectionByFingerprint.has(text(candidate.selection_fingerprint, 128)),
    )
  ) {
    return {
      status: "CANARY_BLOCKED_SELECTION_MEMBERSHIP_MISMATCH",
      application: null,
      rank_changed: false,
    };
  }

  const influence = Number(activationMetadata.canary_influence_fraction);
  const ranked = candidates.map((candidate) => {
    const baselineScore = Number(candidate.baseline_score);
    const challengerScore = Number(candidate.challenger_score);
    if (
      !Number.isFinite(baselineScore) ||
      baselineScore <= 0 ||
      !Number.isFinite(challengerScore) ||
      challengerScore < 0 ||
      challengerScore > baselineScore
    ) {
      throw new Error(
        `${AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT}_SHADOW_SCORE_INVARIANT_VIOLATION`,
      );
    }
    const blendedScore =
      baselineScore * (1 - influence) + challengerScore * influence;
    return {
      selection_fingerprint: text(candidate.selection_fingerprint, 128),
      experiment_fingerprint: text(candidate.experiment_fingerprint, 128),
      experiment_version_fingerprint: text(
        candidate.experiment_version_fingerprint,
        128,
      ),
      baseline_rank: Number(candidate.baseline_rank),
      baseline_score: baselineScore,
      challenger_rank: Number(candidate.challenger_rank),
      challenger_score: challengerScore,
      canary_blended_score: blendedScore,
    };
  });
  ranked.sort((left, right) => {
    if (right.canary_blended_score !== left.canary_blended_score) {
      return right.canary_blended_score - left.canary_blended_score;
    }
    if (left.baseline_rank !== right.baseline_rank) {
      return left.baseline_rank - right.baseline_rank;
    }
    return left.experiment_fingerprint.localeCompare(right.experiment_fingerprint);
  });
  const canaryRankBySelection = new Map(
    ranked.map((candidate, index) => [candidate.selection_fingerprint, index + 1]),
  );
  const assignments = candidates
    .map((candidate) => {
      const rankedCandidate = ranked.find(
        (item) =>
          item.selection_fingerprint ===
          text(candidate.selection_fingerprint, 128),
      );
      return {
        ...rankedCandidate,
        canary_rank: canaryRankBySelection.get(
          text(candidate.selection_fingerprint, 128),
        ),
      };
    })
    .sort((left, right) => left.baseline_rank - right.baseline_rank);
  const rankChanged = assignments.some(
    (assignment) => assignment.canary_rank !== assignment.baseline_rank,
  );
  const nowIso = new Date().toISOString();

  for (const assignment of assignments) {
    const row = selectionByFingerprint.get(assignment.selection_fingerprint);
    const metadata = object(row.metadata);
    const result = await supabaseAdmin
      .from(MEMORY_TABLE)
      .update({
        metadata: {
          ...metadata,
          selection_rank: assignment.canary_rank,
          phase32_contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
          phase32_status: "BOUNDED_CANARY_RANK_APPLIED",
          phase32_canary_activation_fingerprint: text(
            activationMetadata.activation_fingerprint,
            128,
          ),
          phase32_release_candidate_fingerprint: text(
            activationMetadata.release_candidate_fingerprint,
            128,
          ),
          phase32_shadow_snapshot_fingerprint: text(
            snapshotMetadata.snapshot_fingerprint,
            128,
          ),
          phase32_baseline_policy_fingerprint: text(
            activationMetadata.baseline_policy_fingerprint,
            128,
          ),
          phase32_baseline_rank: assignment.baseline_rank,
          phase32_canary_rank: assignment.canary_rank,
          phase32_canary_influence_fraction: influence,
          phase32_canary_blended_score: assignment.canary_blended_score,
          phase32_selected_membership_changed: false,
          phase32_source_risk_adjusted_score_mutated: false,
          phase32_source_score_increase_applied: false,
          phase32_canary_rank_active: true,
          phase32_applied_at: nowIso,
        },
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .eq("active", true)
      .select("id");
    if (result.error) throw result.error;
    if (list(result.data).length !== 1) {
      throw new Error(
        `${AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT}_SELECTION_RANK_UPDATE_RACE`,
      );
    }
  }

  const applicationFingerprint = digest(
    "selection-policy-canary-application",
    text(activationMetadata.activation_fingerprint, 128),
    cycleFingerprint,
    text(snapshotMetadata.snapshot_fingerprint, 128),
  );
  const applicationRow = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_SELECTION_POLICY_CANARY_APPLICATION_SCOPE,
    memory_key: `selection-policy-canary-application:${applicationFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Selection policy canary application ${cycleFingerprint.slice(0, 16)}`,
    content:
      "Observed application of a bounded challenger influence to ranking of the exact Phase 30 selected portfolio before execution requests were created. Membership and source numeric scores remain unchanged; the exact baseline ranks are retained for automatic rollback.",
    importance: 1,
    confidence: 1,
    source: "selection_policy_canary_application",
    active: true,
    valid_until: plusDays(nowIso, ROLLBACK_RETENTION_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
      status: "BOUNDED_CANARY_RANK_APPLICATION_RECORDED",
      application_fingerprint: applicationFingerprint,
      activation_fingerprint: text(activationMetadata.activation_fingerprint, 128),
      release_candidate_fingerprint: text(
        activationMetadata.release_candidate_fingerprint,
        128,
      ),
      shadow_snapshot_fingerprint: text(snapshotMetadata.snapshot_fingerprint, 128),
      selection_cycle_fingerprint: cycleFingerprint,
      baseline_policy_fingerprint: text(
        activationMetadata.baseline_policy_fingerprint,
        128,
      ),
      canary_influence_fraction: influence,
      rank_changed: rankChanged,
      assignment_count: assignments.length,
      assignments,
      same_selected_portfolio_only: true,
      selected_membership_changed: false,
      source_numeric_scores_mutated: false,
      source_score_increase_applied: false,
      application_preceded_execution_requests: true,
      exact_baseline_ranks_retained_for_rollback: true,
      full_policy_cutover_applied: false,
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
      applied_at: nowIso,
    },
    updated_at: nowIso,
  };
  const written = await upsertRow(applicationRow);
  return {
    status: rankChanged
      ? "BOUNDED_CANARY_RANK_APPLIED"
      : "BOUNDED_CANARY_EVALUATED_BASELINE_ORDER_UNCHANGED",
    application: written,
    rank_changed: rankChanged,
  };
}

export async function reconcileAvantiqoSelectionPolicyCanary({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      canary_active: false,
    };
  }
  if (persist !== true) {
    return {
      success: true,
      contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
      status: "DRY_RUN_NO_LIVE_RANK_MUTATION",
      canary_active: false,
      governance: {
        selected_membership_changed: false,
        numeric_source_scores_mutated: false,
        full_policy_cutover_applied: false,
        execution_authorized: false,
        provider_called_here: false,
        wallet_write_performed_here: false,
        runpod_job_submitted: false,
        platform_knowledge_written: false,
        automatic_training_started: false,
      },
    };
  }

  const activations = (
    await loadActiveRows(
      organizationId,
      AVANTIQO_SELECTION_POLICY_CANARY_ACTIVATION_SCOPE,
      20,
    )
  ).filter((row) => activeAndUnexpired(row));
  if (activations.length === 0) {
    return {
      success: true,
      contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
      status: "NO_ACTIVE_POLICY_CANARY",
      canary_active: false,
    };
  }
  if (activations.length > 1) {
    const rollbacks = [];
    for (const activation of activations) {
      rollbacks.push(
        await closeActivationWithRollback({
          organizationId,
          activation,
          reasonCode: "MULTIPLE_ACTIVE_CANARIES_FAIL_CLOSED",
          reasonDetail:
            "More than one active policy canary was present; all were closed and exact baseline ranks restored.",
        }),
      );
    }
    return {
      success: false,
      contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
      status: "MULTIPLE_ACTIVE_CANARIES_ROLLED_BACK_FAIL_CLOSED",
      canary_active: false,
      rollbacks,
    };
  }

  const activation = activations[0];
  const activationMetadata = object(activation.metadata);
  const activationFingerprint = text(
    activationMetadata.activation_fingerprint,
    128,
  );
  const releaseCandidateFingerprint = text(
    activationMetadata.release_candidate_fingerprint,
    128,
  );
  if (
    text(activationMetadata.contract, 180) !==
      AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT ||
    text(activationMetadata.status, 180) !==
      "EXPLICIT_BOUNDED_POLICY_CANARY_ACTIVATION_RECORDED" ||
    activationMetadata.same_selected_portfolio_only !== true ||
    activationMetadata.selected_membership_change_authorized !== false ||
    activationMetadata.source_score_increase_authorized !== false ||
    activationMetadata.full_policy_cutover_authorized !== false ||
    activationMetadata.automatic_regression_rollback_required !== true
  ) {
    const rollback = await closeActivationWithRollback({
      organizationId,
      activation,
      reasonCode: "ACTIVATION_CONTRACT_INVALID_FAIL_CLOSED",
      reasonDetail: "The active canary no longer satisfied Phase 32 activation invariants.",
    });
    return {
      success: false,
      contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
      status: "INVALID_CANARY_ACTIVATION_ROLLED_BACK_FAIL_CLOSED",
      canary_active: false,
      rollback,
    };
  }

  const explicitRollback = await loadRollbackDirective(
    organizationId,
    releaseCandidateFingerprint,
  );
  if (explicitRollback) {
    const rollbackMetadata = object(explicitRollback.metadata);
    const rollback = await closeActivationWithRollback({
      organizationId,
      activation,
      reasonCode: "EXPLICIT_GOVERNED_ROLLBACK_DIRECTIVE",
      reasonDetail: text(rollbackMetadata.rollback_reason, 4000),
      sourceRollbackDirectiveFingerprint: text(
        rollbackMetadata.rollback_directive_fingerprint,
        128,
      ),
    });
    return {
      success: true,
      contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
      status: "EXPLICIT_ROLLBACK_DIRECTIVE_APPLIED",
      canary_active: false,
      rollback,
    };
  }

  const applications = await loadApplicationsForActivation(
    organizationId,
    activationFingerprint,
  );
  const appliedCycles = [
    ...new Set(
      applications
        .map((row) => text(object(row.metadata).selection_cycle_fingerprint, 128))
        .filter(Boolean),
    ),
  ];
  for (const application of applications) {
    const applicationMetadata = object(application.metadata);
    const cycleFingerprint = text(
      applicationMetadata.selection_cycle_fingerprint,
      128,
    );
    const evaluation = await loadEvaluationByCycle(
      organizationId,
      cycleFingerprint,
    );
    if (!evaluation) continue;
    const evaluationMetadata = object(evaluation.metadata);
    if (text(evaluationMetadata.cycle_winner, 40) === "BASELINE") {
      const rollback = await closeActivationWithRollback({
        organizationId,
        activation,
        reasonCode: "GOVERNED_CANARY_REGRESSION_DETECTED",
        reasonDetail:
          "Phase 30 governed prospective evaluation found the baseline ordering outperformed the challenger ordering for a canary-applied cycle.",
        sourceEvaluationFingerprint: text(
          evaluationMetadata.evaluation_fingerprint,
          128,
        ),
      });
      return {
        success: true,
        contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
        status: "AUTOMATIC_REGRESSION_ROLLBACK_APPLIED",
        canary_active: false,
        rollback,
      };
    }
  }

  const cycleLimit = Number(activationMetadata.canary_cycle_limit);
  if (appliedCycles.length >= cycleLimit) {
    const completion = await closeActivationWithRollback({
      organizationId,
      activation,
      reasonCode: "CANARY_CYCLE_LIMIT_COMPLETE",
      reasonDetail:
        "The explicitly approved bounded canary cycle limit was reached; exact baseline ranks were restored and no further challenger influence is authorized.",
    });
    return {
      success: true,
      contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
      status: "CANARY_CYCLE_LIMIT_COMPLETE_BASELINE_RESTORED",
      canary_active: false,
      completion,
    };
  }

  const selections = await loadCurrentSelections(organizationId);
  if (selections.length < 2) {
    return {
      success: true,
      contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
      status: "CANARY_WAITING_FOR_MULTI_SELECTION_PORTFOLIO",
      canary_active: true,
      applied_cycle_count: appliedCycles.length,
      cycle_limit: cycleLimit,
    };
  }
  const cycleFingerprints = [
    ...new Set(
      selections
        .map((row) => text(object(row.metadata).selection_cycle_fingerprint, 128))
        .filter(Boolean),
    ),
  ];
  if (cycleFingerprints.length !== 1) {
    const rollback = await closeActivationWithRollback({
      organizationId,
      activation,
      reasonCode: "CURRENT_SELECTION_CYCLE_AMBIGUOUS_FAIL_CLOSED",
      reasonDetail:
        "Current active selections did not resolve to exactly one selection cycle.",
    });
    return {
      success: false,
      contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
      status: "AMBIGUOUS_SELECTION_CYCLE_ROLLED_BACK_FAIL_CLOSED",
      canary_active: false,
      rollback,
    };
  }

  const cycleFingerprint = cycleFingerprints[0];
  const snapshot = await loadCurrentSnapshot(
    organizationId,
    cycleFingerprint,
  );
  if (!snapshot) {
    return {
      success: true,
      contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
      status: "CANARY_WAITING_FOR_PROSPECTIVE_PHASE30_SNAPSHOT",
      canary_active: true,
      applied_cycle_count: appliedCycles.length,
      cycle_limit: cycleLimit,
    };
  }
  const selectionFingerprints = selections.map((row) =>
    text(object(row.metadata).selection_fingerprint, 128),
  );
  if (
    await requestsExistForSelections(
      organizationId,
      selectionFingerprints,
    )
  ) {
    return {
      success: true,
      contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
      status: "CANARY_NOT_APPLIED_AFTER_EXECUTION_REQUEST_CREATION",
      canary_active: true,
      applied_cycle_count: appliedCycles.length,
      cycle_limit: cycleLimit,
      live_rank_mutated_this_run: false,
    };
  }

  const application = await applyCanaryRanking({
    organizationId,
    activation,
    selections,
    snapshot,
    applications,
  });
  return {
    success: true,
    contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
    status: application.status,
    canary_active: true,
    activation_fingerprint: activationFingerprint,
    release_candidate_fingerprint: releaseCandidateFingerprint,
    canary_influence_fraction: Number(
      activationMetadata.canary_influence_fraction,
    ),
    applied_cycle_count:
      appliedCycles.length +
      (application.status === "CANARY_ALREADY_APPLIED_TO_CURRENT_SELECTION_CYCLE"
        ? 0
        : 1),
    cycle_limit: cycleLimit,
    rank_changed: application.rank_changed,
    application: application.application,
    policy: {
      maximum_canary_influence_fraction: MAX_CANARY_INFLUENCE_FRACTION,
      maximum_canary_cycles: MAX_CANARY_CYCLES,
      canary_fraction_is_policy_influence_not_membership_fraction: true,
      same_selected_portfolio_only: true,
      selected_membership_changed: false,
      challenger_score_can_increase_baseline_score: false,
      source_numeric_scores_mutated: false,
      prospective_phase30_snapshot_required: true,
      application_after_execution_request_creation_allowed: false,
      exact_baseline_rollback_required: true,
      automatic_regression_rollback_enabled: true,
      explicit_rollback_directive_honored: true,
      full_policy_cutover_allowed: false,
    },
    governance: {
      activation_created_here: false,
      automatic_policy_promotion: false,
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
      authorization_effect: "BOUNDED_RANK_ONLY_IF_EXPLICITLY_ACTIVATED",
    },
  };
}

export const AvantiqoSelectionPolicyCanaryRuntime = Object.freeze({
  contract: AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
  recordActivation: recordAvantiqoSelectionPolicyCanaryActivation,
  reconcile: reconcileAvantiqoSelectionPolicyCanary,
  maximumCanaryInfluenceFraction: MAX_CANARY_INFLUENCE_FRACTION,
  maximumCanaryCycles: MAX_CANARY_CYCLES,
});
