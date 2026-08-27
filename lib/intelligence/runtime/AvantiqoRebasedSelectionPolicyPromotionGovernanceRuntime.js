import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
  AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_REVIEW_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoRebasedSelectionPolicyChallengerRuntime";

export const AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT =
  "AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_V1";

export const AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_REQUEST_SCOPE =
  "platform_learning_rebased_selection_policy_promotion_requests";
export const AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_APPROVAL_SCOPE =
  "platform_learning_rebased_selection_policy_promotion_approvals";
export const AVANTIQO_REBASED_SELECTION_POLICY_CANARY_RELEASE_SCOPE =
  "platform_learning_rebased_selection_policy_canary_release_candidates";

const MEMORY_TABLE = "intelligence_memories";
const POLICY_TABLE = "avantiqo_intelligence_persistent_ordering_policies";
const PERSISTENT_POLICY_CONTRACT =
  "AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_V1";
const PROMOTION_REQUEST_VALIDITY_DAYS = 7;
const APPROVAL_VALIDITY_MINUTES = 60;
const RELEASE_CANDIDATE_VALIDITY_DAYS = 7;
const MAX_CANARY_INFLUENCE_FRACTION = 0.25;
const MAX_CANARY_CYCLES = 3;
const MIN_CANARY_CYCLES = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

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

const PHASE38_EVIDENCE_GENERATOR_FINGERPRINT = digest(
  "AVANTIQO_PHASE38_AUTOMATED_REBASED_CHALLENGER_EVIDENCE_GENERATOR",
);

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function plusDays(value, days) {
  return new Date(Date.parse(value) + days * DAY_MS).toISOString();
}

function plusMinutes(value, minutes) {
  return new Date(Date.parse(value) + minutes * MINUTE_MS).toISOString();
}

function activeAndUnexpired(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  const validUntil = Date.parse(text(row.valid_until, 120));
  return !Number.isFinite(validUntil) || validUntil > nowMs;
}

function validFingerprint(value) {
  return /^[a-f0-9]{32,128}$/.test(text(value, 128).toLowerCase());
}

function requireFingerprint(value, code) {
  const fingerprint = text(value, 128).toLowerCase();
  if (!validFingerprint(fingerprint)) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_${code}_INVALID`,
    );
  }
  return fingerprint;
}

function requireReason(value, code) {
  const reason = text(value, 4000);
  if (reason.length < 12) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_${code}_REQUIRED`,
    );
  }
  return reason;
}

function boundedCanaryInfluence(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > MAX_CANARY_INFLUENCE_FRACTION) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_CANARY_INFLUENCE_INVALID`,
    );
  }
  return number;
}

function boundedCanaryCycles(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < MIN_CANARY_CYCLES || number > MAX_CANARY_CYCLES) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_CANARY_CYCLE_LIMIT_INVALID`,
    );
  }
  return number;
}

async function loadActivePersistentPolicy(organizationId) {
  const result = await supabaseAdmin
    .from(POLICY_TABLE)
    .select(
      "id,contract,organization_id,policy_fingerprint,baseline_policy_fingerprint,challenger_policy_version,ordering_influence_fraction,state,activator_fingerprint,activated_at,metadata,created_at,updated_at",
    )
    .eq("organization_id", organizationId)
    .eq("state", "ACTIVE")
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

function persistentPolicyValid(policy) {
  return Boolean(
    policy &&
      policy.contract === PERSISTENT_POLICY_CONTRACT &&
      policy.state === "ACTIVE" &&
      validFingerprint(policy.policy_fingerprint) &&
      validFingerprint(policy.baseline_policy_fingerprint) &&
      text(policy.challenger_policy_version, 180) &&
      Number.isFinite(Number(policy.ordering_influence_fraction)) &&
      Number(policy.ordering_influence_fraction) > 0 &&
      Number(policy.ordering_influence_fraction) <= 0.25 &&
      validFingerprint(policy.activator_fingerprint)
  );
}

async function loadMemoryRows(organizationId, scope, limit = 200) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", scope)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (result.error) throw result.error;
  return list(result.data);
}

async function loadExactRow(organizationId, scope, metadataKey, fingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", scope)
    .eq(`metadata->>${metadataKey}`, fingerprint)
    .limit(2);
  if (result.error) throw result.error;
  const rows = list(result.data);
  if (rows.length > 1) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_${scope.toUpperCase()}_AMBIGUOUS`,
    );
  }
  return rows[0] || null;
}

function reviewEligible(row, policy, nowMs = Date.now()) {
  const metadata = object(row?.metadata);
  return Boolean(
    activeAndUnexpired(row, nowMs) &&
      text(metadata.contract, 180) === AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT &&
      text(metadata.status, 180) === "REBASED_CHALLENGER_PROMOTION_REVIEW_CANDIDATE" &&
      metadata.promotion_review_candidate === true &&
      metadata.promotion_authorized === false &&
      metadata.canary_authorized === false &&
      metadata.activation_authorized === false &&
      metadata.automatic_policy_promotion === false &&
      metadata.automatic_policy_activation === false &&
      Number(metadata.complete_evaluated_cycle_count) >= Number(metadata.minimum_complete_cycles) &&
      Number(metadata.comparable_rank_changed_pair_count) >= Number(metadata.minimum_comparable_pairs) &&
      Number(metadata.distinct_experiment_count) >= Number(metadata.minimum_distinct_experiments) &&
      Number(metadata.rebased_challenger_pairwise_correct_rate) >= Number(metadata.minimum_challenger_correct_rate) &&
      Number(metadata.challenger_correct_rate_advantage) >= Number(metadata.minimum_challenger_rate_advantage) &&
      Number(metadata.baseline_winning_cycle_count) === 0 &&
      Number(metadata.rebased_challenger_observed_rank_regret) <= Number(metadata.current_baseline_observed_rank_regret) &&
      validFingerprint(metadata.review_fingerprint) &&
      validFingerprint(metadata.proposal_fingerprint) &&
      validFingerprint(metadata.research_epoch_fingerprint) &&
      text(metadata.current_baseline_policy_fingerprint, 128) === text(policy.policy_fingerprint, 128) &&
      text(metadata.challenger_policy_version, 180) &&
      text(metadata.challenger_policy_version, 180) !== text(policy.challenger_policy_version, 180)
  );
}

function promotionRequestRow(organizationId, policy, review, nowIso) {
  const metadata = object(review.metadata);
  const requestFingerprint = digest(
    "rebased-selection-policy-promotion-request",
    metadata.review_fingerprint,
    metadata.proposal_fingerprint,
    policy.policy_fingerprint,
    metadata.challenger_policy_version,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_REQUEST_SCOPE,
    memory_key: `rebased-selection-policy-promotion-request:${requestFingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: `Rebased selection policy promotion request ${text(metadata.challenger_policy_version, 180)}`,
    content:
      "Governed request to review a mature Phase 38 rebased challenger for a bounded canary against the exact currently active persistent policy baseline. The request itself cannot approve, release, activate, apply or promote the challenger.",
    importance: 0.99,
    confidence: 1,
    source: "rebased_selection_policy_promotion_governance_request",
    active: true,
    valid_until: plusDays(nowIso, PROMOTION_REQUEST_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "AWAITING_EXPLICIT_REBASED_SELECTION_POLICY_CANARY_APPROVAL",
      request_fingerprint: requestFingerprint,
      source_phase38_contract: AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_CONTRACT,
      source_review_fingerprint: text(metadata.review_fingerprint, 128),
      source_proposal_fingerprint: text(metadata.proposal_fingerprint, 128),
      source_research_epoch_fingerprint: text(metadata.research_epoch_fingerprint, 128),
      phase38_evidence_generator_fingerprint: PHASE38_EVIDENCE_GENERATOR_FINGERPRINT,
      current_baseline_policy_contract: policy.contract,
      current_baseline_policy_fingerprint: policy.policy_fingerprint,
      current_baseline_policy_version: policy.challenger_policy_version,
      current_baseline_policy_ordering_influence_fraction: Number(policy.ordering_influence_fraction),
      current_baseline_policy_activator_fingerprint: policy.activator_fingerprint,
      challenger_policy_version: text(metadata.challenger_policy_version, 180),
      phase38_complete_evaluated_cycle_count: Number(metadata.complete_evaluated_cycle_count) || 0,
      phase38_comparable_rank_changed_pair_count: Number(metadata.comparable_rank_changed_pair_count) || 0,
      phase38_distinct_experiment_count: Number(metadata.distinct_experiment_count) || 0,
      phase38_current_baseline_pairwise_correct_rate: Number(metadata.current_baseline_pairwise_correct_rate) || 0,
      phase38_rebased_challenger_pairwise_correct_rate: Number(metadata.rebased_challenger_pairwise_correct_rate) || 0,
      phase38_challenger_correct_rate_advantage: Number(metadata.challenger_correct_rate_advantage) || 0,
      phase38_baseline_winning_cycle_count: Number(metadata.baseline_winning_cycle_count) || 0,
      exact_current_baseline_must_remain_active: true,
      explicit_independent_approval_required: true,
      approval_is_not_activation: true,
      approval_is_not_release_candidate: true,
      release_candidate_requires_separate_explicit_call: true,
      canary_activation_requires_separate_phase: true,
      canary_application_requires_separate_phase: true,
      maximum_canary_influence_fraction: MAX_CANARY_INFLUENCE_FRACTION,
      maximum_canary_cycles: MAX_CANARY_CYCLES,
      canary_influence_is_relative_to_current_persistent_baseline: true,
      same_selected_portfolio_only: true,
      full_policy_cutover_allowed: false,
      selected_membership_change_authorized: false,
      source_numeric_score_mutation_authorized: false,
      live_ordering_mutation_authorized: false,
      promotion_authorized: false,
      canary_authorized: false,
      activation_authorized: false,
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
      automatic_policy_activation: false,
      authorization_value: "none",
      requested_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .upsert(rows, { onConflict: "organization_id,memory_scope,memory_key" })
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length;
}

export async function reconcileAvantiqoRebasedSelectionPolicyPromotionRequests({ persist = true } = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      request_count: 0,
      automatic_policy_promotion: false,
      automatic_policy_activation: false,
    };
  }
  const policy = await loadActivePersistentPolicy(organizationId);
  if (!policy) {
    return {
      success: true,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "NO_ACTIVE_PERSISTENT_POLICY_BASELINE",
      request_count: 0,
      automatic_policy_promotion: false,
      automatic_policy_activation: false,
    };
  }
  if (!persistentPolicyValid(policy)) {
    return {
      success: false,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "CURRENT_PERSISTENT_POLICY_BASELINE_INVALID_FAIL_CLOSED",
      request_count: 0,
      execution_authorized: false,
    };
  }
  const reviews = (
    await loadMemoryRows(organizationId, AVANTIQO_REBASED_SELECTION_POLICY_CHALLENGER_REVIEW_SCOPE, 100)
  ).filter((row) => reviewEligible(row, policy));
  const distinctProposals = new Set(
    reviews.map((row) => text(object(row.metadata).proposal_fingerprint, 128)),
  );
  if (distinctProposals.size > 1) {
    return {
      success: false,
      contract: AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "MULTIPLE_MATURE_REBASED_CHALLENGERS_FOR_CURRENT_BASELINE_FAIL_CLOSED",
      request_count: 0,
      execution_authorized: false,
    };
  }
  const nowIso = new Date().toISOString();
  const rows = reviews.map((review) => promotionRequestRow(organizationId, policy, review, nowIso));
  const writeCount = persist ? await upsertRows(rows) : 0;
  return {
    success: true,
    contract: AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
    status: rows.length
      ? "REBASED_SELECTION_POLICY_PROMOTION_REQUEST_READY"
      : "NO_MATURE_REBASED_CHALLENGER_PROMOTION_REQUEST",
    request_count: rows.length,
    request_write_count: writeCount,
    requests: rows.map((row) => ({
      request_fingerprint: row.metadata.request_fingerprint,
      source_review_fingerprint: row.metadata.source_review_fingerprint,
      current_baseline_policy_fingerprint: row.metadata.current_baseline_policy_fingerprint,
      challenger_policy_version: row.metadata.challenger_policy_version,
      valid_until: row.valid_until,
    })),
    governance: {
      separate_phase39_scopes_only: true,
      old_phase31_34_authority_reused: false,
      explicit_independent_approval_required: true,
      approval_created_here: false,
      release_candidate_created_here: false,
      canary_activated_here: false,
      canary_applied_here: false,
      automatic_policy_promotion: false,
      automatic_policy_activation: false,
      live_ordering_mutated: false,
      selected_membership_change_authorized: false,
      source_numeric_score_mutation_authorized: false,
      execution_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      authorization_effect: "NONE",
    },
  };
}

async function insertAuthorityRowIdempotently({ organizationId, scope, memoryKey, fingerprintKey, fingerprint, row }) {
  const existingResult = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", scope)
    .eq("memory_key", memoryKey)
    .maybeSingle();
  if (existingResult.error) throw existingResult.error;
  if (existingResult.data) {
    const existingFingerprint = text(object(existingResult.data.metadata)[fingerprintKey], 128);
    if (existingFingerprint !== fingerprint) {
      throw new Error(
        `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_DETERMINISTIC_AUTHORITY_KEY_CONFLICT`,
      );
    }
    return existingResult.data;
  }
  const inserted = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(row)
    .select("id,memory_key,active,valid_until,metadata,created_at,updated_at")
    .single();
  if (inserted.error) {
    const raced = await supabaseAdmin
      .from(MEMORY_TABLE)
      .select("id,memory_key,active,valid_until,metadata,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("memory_scope", scope)
      .eq("memory_key", memoryKey)
      .maybeSingle();
    if (raced.error) throw inserted.error;
    if (raced.data && text(object(raced.data.metadata)[fingerprintKey], 128) === fingerprint) {
      return raced.data;
    }
    throw inserted.error;
  }
  return inserted.data;
}

export async function recordAvantiqoRebasedSelectionPolicyPromotionApproval({
  request_fingerprint,
  approver_fingerprint,
  approval_reason,
  approved_canary_influence_fraction,
  approved_canary_cycles,
  independent_approver_attested = false,
  same_actor_as_phase38_evidence_generator = true,
  same_actor_as_current_baseline_activator = true,
  policy_change_review_completed = false,
  rollback_plan_reviewed = false,
  approved_at,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`,
    );
  }
  const requestFingerprint = requireFingerprint(request_fingerprint, "REQUEST_FINGERPRINT");
  const approverFingerprint = requireFingerprint(approver_fingerprint, "APPROVER_FINGERPRINT");
  const reason = requireReason(approval_reason, "APPROVAL_REASON");
  const canaryInfluence = boundedCanaryInfluence(approved_canary_influence_fraction);
  const canaryCycles = boundedCanaryCycles(approved_canary_cycles);
  if (independent_approver_attested !== true) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_INDEPENDENT_APPROVER_ATTESTATION_REQUIRED`,
    );
  }
  if (same_actor_as_phase38_evidence_generator !== false) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_APPROVER_MUST_DIFFER_FROM_PHASE38_EVIDENCE_GENERATOR`,
    );
  }
  if (same_actor_as_current_baseline_activator !== false) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_APPROVER_MUST_DIFFER_FROM_CURRENT_BASELINE_ACTIVATOR`,
    );
  }
  if (policy_change_review_completed !== true || rollback_plan_reviewed !== true) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_POLICY_AND_ROLLBACK_REVIEW_REQUIRED`,
    );
  }
  const request = await loadExactRow(
    organizationId,
    AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_REQUEST_SCOPE,
    "request_fingerprint",
    requestFingerprint,
  );
  const requestMetadata = object(request?.metadata);
  if (
    !activeAndUnexpired(request) ||
    text(requestMetadata.contract, 180) !== AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT ||
    text(requestMetadata.status, 180) !== "AWAITING_EXPLICIT_REBASED_SELECTION_POLICY_CANARY_APPROVAL" ||
    requestMetadata.explicit_independent_approval_required !== true ||
    requestMetadata.approval_is_not_activation !== true ||
    requestMetadata.release_candidate_requires_separate_explicit_call !== true ||
    requestMetadata.canary_activation_requires_separate_phase !== true ||
    requestMetadata.full_policy_cutover_allowed !== false ||
    !validFingerprint(requestMetadata.current_baseline_policy_fingerprint) ||
    !text(requestMetadata.challenger_policy_version, 180)
  ) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_PROMOTION_REQUEST_NOT_CURRENT`,
    );
  }
  const policy = await loadActivePersistentPolicy(organizationId);
  if (
    !persistentPolicyValid(policy) ||
    text(policy.policy_fingerprint, 128) !== text(requestMetadata.current_baseline_policy_fingerprint, 128) ||
    text(policy.challenger_policy_version, 180) !== text(requestMetadata.current_baseline_policy_version, 180) ||
    Number(policy.ordering_influence_fraction) !== Number(requestMetadata.current_baseline_policy_ordering_influence_fraction)
  ) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_CURRENT_BASELINE_CHANGED_BEFORE_APPROVAL`,
    );
  }
  if (
    text(policy.activator_fingerprint, 128).toLowerCase() === approverFingerprint ||
    text(requestMetadata.phase38_evidence_generator_fingerprint, 128).toLowerCase() === approverFingerprint
  ) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_APPROVER_INDEPENDENCE_FAILED`,
    );
  }
  const approvedAt = text(approved_at, 120) || new Date().toISOString();
  const approvedAtMs = Date.parse(approvedAt);
  if (!Number.isFinite(approvedAtMs) || Math.abs(Date.now() - approvedAtMs) > 5 * MINUTE_MS) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_APPROVED_AT_INVALID`,
    );
  }
  const requestExpiryMs = Date.parse(text(request.valid_until, 120));
  const approvalHardExpiryMs = Date.parse(plusMinutes(approvedAt, APPROVAL_VALIDITY_MINUTES));
  const validUntil = new Date(
    Number.isFinite(requestExpiryMs) ? Math.min(requestExpiryMs, approvalHardExpiryMs) : approvalHardExpiryMs,
  ).toISOString();
  const approvalFingerprint = digest(
    "rebased-selection-policy-promotion-approval",
    requestFingerprint,
    approverFingerprint,
    reason,
    canaryInfluence,
    canaryCycles,
  );
  const memoryKey = `rebased-selection-policy-promotion-approval:${requestFingerprint.slice(0, 40)}`;
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_APPROVAL_SCOPE,
    memory_key: memoryKey,
    memory_type: "decision",
    subject: `Rebased selection policy approval ${approvalFingerprint.slice(0, 16)}`,
    content:
      "Explicit independent approval permitting creation of one bounded rebased-challenger canary release candidate. This approval is not canary activation, application, promotion, execution or spend authorization.",
    importance: 1,
    confidence: 1,
    source: "explicit_rebased_selection_policy_promotion_approval",
    active: true,
    valid_until: validUntil,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "EXPLICIT_REBASED_POLICY_CANARY_RELEASE_APPROVAL_RECORDED",
      approval_fingerprint: approvalFingerprint,
      request_fingerprint: requestFingerprint,
      source_review_fingerprint: requestMetadata.source_review_fingerprint,
      source_proposal_fingerprint: requestMetadata.source_proposal_fingerprint,
      source_research_epoch_fingerprint: requestMetadata.source_research_epoch_fingerprint,
      current_baseline_policy_fingerprint: policy.policy_fingerprint,
      current_baseline_policy_version: policy.challenger_policy_version,
      current_baseline_policy_ordering_influence_fraction: Number(policy.ordering_influence_fraction),
      current_baseline_policy_activator_fingerprint: policy.activator_fingerprint,
      challenger_policy_version: requestMetadata.challenger_policy_version,
      approver_fingerprint: approverFingerprint,
      approval_reason: reason,
      approved_canary_influence_fraction: canaryInfluence,
      approved_canary_cycles: canaryCycles,
      maximum_canary_influence_fraction: MAX_CANARY_INFLUENCE_FRACTION,
      maximum_canary_cycles: MAX_CANARY_CYCLES,
      independent_approver_attested: true,
      same_actor_as_phase38_evidence_generator: false,
      same_actor_as_current_baseline_activator: false,
      immutable_actor_independence_verified: true,
      policy_change_review_completed: true,
      rollback_plan_reviewed: true,
      approval_is_not_release_candidate: true,
      approval_is_not_activation: true,
      canary_activation_requires_separate_phase: true,
      canary_application_requires_separate_phase: true,
      canary_influence_is_relative_to_current_persistent_baseline: true,
      current_baseline_must_remain_active_at_release_and_activation: true,
      same_selected_portfolio_only: true,
      full_policy_cutover_allowed: false,
      selected_membership_change_authorized: false,
      source_numeric_score_mutation_authorized: false,
      live_ordering_mutation_authorized: false,
      promotion_authorized: false,
      activation_authorized: false,
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
      automatic_policy_activation: false,
      authorization_value: "release_candidate_creation_only",
      approved_at: approvedAt,
    },
    updated_at: approvedAt,
  };
  return insertAuthorityRowIdempotently({
    organizationId,
    scope: AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_APPROVAL_SCOPE,
    memoryKey,
    fingerprintKey: "approval_fingerprint",
    fingerprint: approvalFingerprint,
    row,
  });
}

export async function createAvantiqoRebasedSelectionPolicyCanaryReleaseCandidate({
  approval_fingerprint,
  release_reason,
  release_review_completed = false,
  exact_baseline_rollback_verified = false,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`,
    );
  }
  const approvalFingerprint = requireFingerprint(approval_fingerprint, "APPROVAL_FINGERPRINT");
  const reason = requireReason(release_reason, "RELEASE_REASON");
  if (release_review_completed !== true || exact_baseline_rollback_verified !== true) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_RELEASE_AND_ROLLBACK_REVIEW_REQUIRED`,
    );
  }
  const approval = await loadExactRow(
    organizationId,
    AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_APPROVAL_SCOPE,
    "approval_fingerprint",
    approvalFingerprint,
  );
  const approvalMetadata = object(approval?.metadata);
  if (
    !activeAndUnexpired(approval) ||
    text(approvalMetadata.contract, 180) !== AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT ||
    text(approvalMetadata.status, 180) !== "EXPLICIT_REBASED_POLICY_CANARY_RELEASE_APPROVAL_RECORDED" ||
    approvalMetadata.approval_is_not_activation !== true ||
    approvalMetadata.canary_activation_requires_separate_phase !== true ||
    approvalMetadata.current_baseline_must_remain_active_at_release_and_activation !== true ||
    approvalMetadata.full_policy_cutover_allowed !== false
  ) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_APPROVAL_NOT_CURRENT`,
    );
  }
  const policy = await loadActivePersistentPolicy(organizationId);
  if (
    !persistentPolicyValid(policy) ||
    text(policy.policy_fingerprint, 128) !== text(approvalMetadata.current_baseline_policy_fingerprint, 128) ||
    text(policy.challenger_policy_version, 180) !== text(approvalMetadata.current_baseline_policy_version, 180) ||
    Number(policy.ordering_influence_fraction) !== Number(approvalMetadata.current_baseline_policy_ordering_influence_fraction)
  ) {
    throw new Error(
      `${AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_CURRENT_BASELINE_CHANGED_BEFORE_RELEASE`,
    );
  }
  const approvedInfluence = boundedCanaryInfluence(approvalMetadata.approved_canary_influence_fraction);
  const approvedCycles = boundedCanaryCycles(approvalMetadata.approved_canary_cycles);
  const nowIso = new Date().toISOString();
  const approvalExpiryMs = Date.parse(text(approval.valid_until, 120));
  const hardExpiryMs = Date.parse(plusDays(nowIso, RELEASE_CANDIDATE_VALIDITY_DAYS));
  const validUntil = new Date(
    Number.isFinite(approvalExpiryMs) ? Math.min(approvalExpiryMs, hardExpiryMs) : hardExpiryMs,
  ).toISOString();
  const rollbackPlanFingerprint = digest(
    "rebased-selection-policy-exact-current-baseline-rollback",
    policy.policy_fingerprint,
    policy.challenger_policy_version,
    policy.ordering_influence_fraction,
  );
  const releaseCandidateFingerprint = digest(
    "rebased-selection-policy-canary-release-candidate",
    approvalFingerprint,
    policy.policy_fingerprint,
    approvalMetadata.challenger_policy_version,
    approvedInfluence,
    approvedCycles,
  );
  const memoryKey = `rebased-selection-policy-canary-release:${approvalFingerprint.slice(0, 40)}`;
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_RELEASE_SCOPE,
    memory_key: memoryKey,
    memory_type: "decision",
    subject: `Rebased policy canary release ${releaseCandidateFingerprint.slice(0, 16)}`,
    content:
      "Bounded release candidate for a future Phase 40 rebased-challenger canary. The exact active persistent policy remains the rollback baseline. This record does not activate or apply a canary and cannot authorize execution or spend.",
    importance: 1,
    confidence: 1,
    source: "explicit_rebased_selection_policy_canary_release",
    active: true,
    valid_until: validUntil,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "REBASED_CANARY_RELEASE_CANDIDATE_READY_FOR_SEPARATE_ACTIVATION",
      release_candidate_fingerprint: releaseCandidateFingerprint,
      approval_fingerprint: approvalFingerprint,
      request_fingerprint: approvalMetadata.request_fingerprint,
      source_review_fingerprint: approvalMetadata.source_review_fingerprint,
      source_proposal_fingerprint: approvalMetadata.source_proposal_fingerprint,
      source_research_epoch_fingerprint: approvalMetadata.source_research_epoch_fingerprint,
      current_baseline_policy_contract: policy.contract,
      current_baseline_policy_fingerprint: policy.policy_fingerprint,
      current_baseline_policy_version: policy.challenger_policy_version,
      current_baseline_policy_ordering_influence_fraction: Number(policy.ordering_influence_fraction),
      current_baseline_policy_activator_fingerprint: policy.activator_fingerprint,
      challenger_policy_version: approvalMetadata.challenger_policy_version,
      approved_canary_influence_fraction: approvedInfluence,
      approved_canary_cycles: approvedCycles,
      maximum_canary_influence_fraction: MAX_CANARY_INFLUENCE_FRACTION,
      maximum_canary_cycles: MAX_CANARY_CYCLES,
      release_reason: reason,
      release_review_completed: true,
      exact_baseline_rollback_verified: true,
      rollback_plan_fingerprint: rollbackPlanFingerprint,
      exact_current_baseline_rollback_required: true,
      current_baseline_must_remain_active_at_activation: true,
      canary_influence_is_incremental_relative_to_current_persistent_baseline: true,
      current_persistent_policy_is_not_replaced_by_release_candidate: true,
      same_selected_portfolio_only: true,
      full_100_percent_challenger_cutover_allowed: false,
      release_candidate_is_not_activation: true,
      activation_requires_separate_phase40_call: true,
      application_requires_separate_phase40_runtime: true,
      selected_membership_change_authorized: false,
      source_numeric_score_mutation_authorized: false,
      live_ordering_mutation_authorized: false,
      promotion_authorized: false,
      activation_authorized: false,
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
      automatic_policy_activation: false,
      authorization_value: "future_phase40_bounded_canary_activation_candidate_only",
      released_at: nowIso,
    },
    updated_at: nowIso,
  };
  return insertAuthorityRowIdempotently({
    organizationId,
    scope: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_RELEASE_SCOPE,
    memoryKey,
    fingerprintKey: "release_candidate_fingerprint",
    fingerprint: releaseCandidateFingerprint,
    row,
  });
}

export const AvantiqoRebasedSelectionPolicyPromotionGovernanceRuntime = Object.freeze({
  contract: AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
  reconcileRequests: reconcileAvantiqoRebasedSelectionPolicyPromotionRequests,
  recordApproval: recordAvantiqoRebasedSelectionPolicyPromotionApproval,
  createCanaryReleaseCandidate: createAvantiqoRebasedSelectionPolicyCanaryReleaseCandidate,
});
