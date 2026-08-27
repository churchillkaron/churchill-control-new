import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT,
  AVANTIQO_SELECTION_POLICY_SHADOW_REVIEW_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoSelectionPolicyShadowChallengerRuntime";

export const AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT =
  "AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_V1";

export const AVANTIQO_SELECTION_POLICY_PROMOTION_REQUEST_SCOPE =
  "platform_learning_experiment_selection_policy_promotion_requests";
export const AVANTIQO_SELECTION_POLICY_PROMOTION_APPROVAL_SCOPE =
  "platform_learning_experiment_selection_policy_promotion_approvals";
export const AVANTIQO_SELECTION_POLICY_CANARY_RELEASE_SCOPE =
  "platform_learning_experiment_selection_policy_canary_release_candidates";
export const AVANTIQO_SELECTION_POLICY_ROLLBACK_DIRECTIVE_SCOPE =
  "platform_learning_experiment_selection_policy_rollback_directives";

const ACTIVE_SELECTION_CONTRACT = "AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1";
const MEMORY_TABLE = "intelligence_memories";
const PROMOTION_REQUEST_VALIDITY_DAYS = 7;
const APPROVAL_VALIDITY_MINUTES = 60;
const RELEASE_CANDIDATE_VALIDITY_DAYS = 7;
const ROLLBACK_DIRECTIVE_VALIDITY_DAYS = 7;
const MAX_CANARY_SELECTION_FRACTION = 0.25;
const MAX_CANARY_CYCLES = 3;
const MIN_CANARY_CYCLES = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const BASELINE_POLICY_VERSION = "CONSERVATIVE_INFORMATION_GAIN_V1";
const BASELINE_POLICY_FINGERPRINT = digest(
  "selection-policy-baseline",
  ACTIVE_SELECTION_CONTRACT,
  BASELINE_POLICY_VERSION,
  "RISK_ADJUSTED_INFORMATION_GAIN_PER_COST",
  "MAX_SELECTIONS_PER_CYCLE=3",
  "ONE_EXPERIMENT_PER_UNCERTAINTY_GROUP=true",
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

function plusMinutes(value, minutes) {
  return new Date(Date.parse(value) + minutes * MINUTE_MS).toISOString();
}

function activeAndUnexpired(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  const validUntil = Date.parse(text(row.valid_until, 120));
  return !Number.isFinite(validUntil) || validUntil > nowMs;
}

function requireFingerprint(value, code) {
  const fingerprint = text(value, 128);
  if (!/^[a-f0-9]{32,128}$/i.test(fingerprint)) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_${code}_INVALID`,
    );
  }
  return fingerprint.toLowerCase();
}

function requireReason(value, code) {
  const reason = text(value, 4000);
  if (reason.length < 12) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_${code}_REQUIRED`,
    );
  }
  return reason;
}

function boundedCanaryFraction(value) {
  const number = Number(value);
  if (
    !Number.isFinite(number) ||
    number <= 0 ||
    number > MAX_CANARY_SELECTION_FRACTION
  ) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_CANARY_SELECTION_FRACTION_INVALID`,
    );
  }
  return number;
}

function boundedCanaryCycles(value) {
  const number = Number(value);
  if (
    !Number.isInteger(number) ||
    number < MIN_CANARY_CYCLES ||
    number > MAX_CANARY_CYCLES
  ) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_CANARY_CYCLE_LIMIT_INVALID`,
    );
  }
  return number;
}

function reviewEligible(row, nowMs = Date.now()) {
  const metadata = object(row?.metadata);
  return Boolean(
    activeAndUnexpired(row, nowMs) &&
      text(metadata.contract, 180) ===
        AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT &&
      text(metadata.status, 180) ===
        "SHADOW_CHALLENGER_PROMOTION_REVIEW_CANDIDATE" &&
      metadata.mature_shadow_evidence === true &&
      metadata.promotion_review_candidate === true &&
      metadata.zero_challenger_worse_cycles_required === true &&
      Number(metadata.challenger_worse_cycle_count) === 0 &&
      Number(metadata.distinct_selection_cycle_count) >=
        Number(metadata.minimum_review_cycles) &&
      Number(metadata.comparable_pair_count) >= Number(metadata.minimum_review_pairs) &&
      Number(metadata.distinct_experiment_count) >=
        Number(metadata.minimum_review_distinct_experiments) &&
      Number(metadata.challenger_pairwise_correct_rate) >=
        Number(metadata.minimum_challenger_correct_rate) &&
      Number(metadata.challenger_correct_rate_advantage) >=
        Number(metadata.minimum_challenger_rate_advantage) &&
      metadata.automatic_policy_promotion === false &&
      metadata.explicit_separate_policy_promotion_governance_required === true &&
      metadata.live_policy_mutated === false &&
      metadata.live_selection_mutated === false &&
      metadata.numeric_selection_scores_mutated === false &&
      Boolean(text(metadata.review_fingerprint, 128)) &&
      Boolean(text(metadata.challenger_policy_version, 160))
  );
}

async function loadEligibleReviews(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", AVANTIQO_SELECTION_POLICY_SHADOW_REVIEW_SCOPE)
    .eq("active", true)
    .limit(100);
  if (result.error) throw result.error;
  return list(result.data).filter((row) => reviewEligible(row));
}

function promotionRequestRow(organizationId, review, nowIso) {
  const metadata = object(review.metadata);
  const reviewFingerprint = text(metadata.review_fingerprint, 128);
  const challengerPolicyVersion = text(metadata.challenger_policy_version, 160);
  const requestFingerprint = digest(
    "selection-policy-promotion-request",
    reviewFingerprint,
    challengerPolicyVersion,
    BASELINE_POLICY_FINGERPRINT,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_SELECTION_POLICY_PROMOTION_REQUEST_SCOPE,
    memory_key: `selection-policy-promotion-request:${requestFingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: `Selection policy promotion request ${challengerPolicyVersion}`,
    content:
      "Governed request to review a mature Phase 30 shadow challenger for a bounded production canary. The request carries an exact baseline rollback fingerprint and cannot approve, activate or promote the challenger by itself.",
    importance: 0.99,
    confidence: 1,
    source: "selection_policy_promotion_governance_request",
    active: true,
    valid_until: plusDays(nowIso, PROMOTION_REQUEST_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "AWAITING_EXPLICIT_SELECTION_POLICY_PROMOTION_APPROVAL",
      request_fingerprint: requestFingerprint,
      source_shadow_contract: AVANTIQO_SELECTION_POLICY_SHADOW_CHALLENGER_CONTRACT,
      source_shadow_review_fingerprint: reviewFingerprint,
      challenger_policy_version: challengerPolicyVersion,
      baseline_policy_contract: ACTIVE_SELECTION_CONTRACT,
      baseline_policy_version: BASELINE_POLICY_VERSION,
      baseline_policy_fingerprint: BASELINE_POLICY_FINGERPRINT,
      shadow_distinct_selection_cycle_count:
        Number(metadata.distinct_selection_cycle_count) || 0,
      shadow_comparable_pair_count: Number(metadata.comparable_pair_count) || 0,
      shadow_distinct_experiment_count: Number(metadata.distinct_experiment_count) || 0,
      shadow_baseline_pairwise_correct_rate:
        Number(metadata.baseline_pairwise_correct_rate) || 0,
      shadow_challenger_pairwise_correct_rate:
        Number(metadata.challenger_pairwise_correct_rate) || 0,
      shadow_challenger_correct_rate_advantage:
        Number(metadata.challenger_correct_rate_advantage) || 0,
      shadow_challenger_worse_cycle_count:
        Number(metadata.challenger_worse_cycle_count) || 0,
      explicit_independent_approval_required: true,
      approval_is_not_activation: true,
      release_candidate_creation_requires_separate_explicit_call: true,
      production_canary_activation_requires_separate_phase: true,
      rollback_baseline_fingerprint_required: true,
      maximum_canary_selection_fraction: MAX_CANARY_SELECTION_FRACTION,
      maximum_canary_cycles: MAX_CANARY_CYCLES,
      automatic_policy_promotion: false,
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
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
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
    .upsert(rows, {
      onConflict: "organization_id,memory_scope,memory_key",
    })
    .select("id");
  if (result.error) throw result.error;
  return list(result.data).length;
}

export async function reconcileAvantiqoSelectionPolicyPromotionRequests({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      request_count: 0,
    };
  }

  const nowIso = new Date().toISOString();
  const reviews = await loadEligibleReviews(organizationId);
  const rows = reviews.map((review) => promotionRequestRow(organizationId, review, nowIso));
  const writeCount = persist ? await upsertRows(rows) : 0;
  return {
    success: true,
    contract: AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
    status: rows.length
      ? "SELECTION_POLICY_PROMOTION_REVIEW_REQUESTS_READY"
      : "NO_MATURE_SHADOW_CHALLENGER_PROMOTION_REQUESTS",
    request_count: rows.length,
    request_write_count: writeCount,
    requests: rows.map((row) => ({
      request_fingerprint: row.metadata.request_fingerprint,
      challenger_policy_version: row.metadata.challenger_policy_version,
      baseline_policy_fingerprint: row.metadata.baseline_policy_fingerprint,
      valid_until: row.valid_until,
    })),
    governance: {
      explicit_independent_approval_required: true,
      approval_created_here: false,
      canary_release_candidate_created_here: false,
      canary_activated_here: false,
      automatic_policy_promotion: false,
      live_policy_mutated: false,
      live_selection_mutated: false,
      numeric_selection_scores_mutated: false,
      execution_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      authorization_effect: "NONE",
    },
  };
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

export async function recordAvantiqoSelectionPolicyPromotionApproval({
  request_fingerprint,
  approver_fingerprint,
  approval_reason,
  approved_canary_selection_fraction,
  approved_canary_cycles,
  independent_approver_attested = false,
  same_actor_as_shadow_evidence_generator = true,
  policy_change_review_completed = false,
  rollback_plan_reviewed = false,
  approved_at,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`,
    );
  }
  const requestFingerprint = requireFingerprint(
    request_fingerprint,
    "REQUEST_FINGERPRINT",
  );
  const approverFingerprint = requireFingerprint(
    approver_fingerprint,
    "APPROVER_FINGERPRINT",
  );
  const reason = requireReason(approval_reason, "APPROVAL_REASON");
  const canaryFraction = boundedCanaryFraction(
    approved_canary_selection_fraction,
  );
  const canaryCycles = boundedCanaryCycles(approved_canary_cycles);
  if (independent_approver_attested !== true) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_INDEPENDENT_APPROVER_ATTESTATION_REQUIRED`,
    );
  }
  if (same_actor_as_shadow_evidence_generator !== false) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_APPROVER_INDEPENDENCE_REQUIRED`,
    );
  }
  if (policy_change_review_completed !== true || rollback_plan_reviewed !== true) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_POLICY_AND_ROLLBACK_REVIEW_REQUIRED`,
    );
  }

  const request = await loadExactRow(
    organizationId,
    AVANTIQO_SELECTION_POLICY_PROMOTION_REQUEST_SCOPE,
    "request_fingerprint",
    requestFingerprint,
  );
  const requestMetadata = object(request?.metadata);
  if (
    !activeAndUnexpired(request) ||
    text(requestMetadata.contract, 180) !==
      AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT ||
    text(requestMetadata.status, 180) !==
      "AWAITING_EXPLICIT_SELECTION_POLICY_PROMOTION_APPROVAL" ||
    requestMetadata.explicit_independent_approval_required !== true ||
    requestMetadata.approval_is_not_activation !== true ||
    text(requestMetadata.baseline_policy_fingerprint, 128) !==
      BASELINE_POLICY_FINGERPRINT
  ) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_PROMOTION_REQUEST_NOT_CURRENT`,
    );
  }

  const approvedAt = text(approved_at, 120) || new Date().toISOString();
  const approvedAtMs = Date.parse(approvedAt);
  if (!Number.isFinite(approvedAtMs) || Math.abs(Date.now() - approvedAtMs) > 5 * MINUTE_MS) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_APPROVED_AT_INVALID`,
    );
  }
  const approvalFingerprint = digest(
    "selection-policy-promotion-approval",
    requestFingerprint,
    approverFingerprint,
    approvedAt,
    canaryFraction,
    canaryCycles,
  );
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_SELECTION_POLICY_PROMOTION_APPROVAL_SCOPE,
    memory_key: `selection-policy-promotion-approval:${approvalFingerprint.slice(0, 40)}`,
    memory_type: "decision",
    subject: `Selection policy promotion approval ${approvalFingerprint.slice(0, 16)}`,
    content:
      "Explicit independent approval for creation of a bounded canary release candidate. This approval is not production activation and cannot change live selection by itself.",
    importance: 1,
    confidence: 1,
    source: "explicit_selection_policy_promotion_approval",
    active: true,
    valid_until: plusMinutes(approvedAt, APPROVAL_VALIDITY_MINUTES),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "EXPLICIT_POLICY_CANARY_RELEASE_CANDIDATE_APPROVAL_RECORDED",
      approval_fingerprint: approvalFingerprint,
      request_fingerprint: requestFingerprint,
      source_shadow_review_fingerprint: text(
        requestMetadata.source_shadow_review_fingerprint,
        128,
      ),
      challenger_policy_version: text(requestMetadata.challenger_policy_version, 160),
      baseline_policy_contract: ACTIVE_SELECTION_CONTRACT,
      baseline_policy_version: BASELINE_POLICY_VERSION,
      baseline_policy_fingerprint: BASELINE_POLICY_FINGERPRINT,
      approver_fingerprint: approverFingerprint,
      approval_reason: reason,
      independent_approver_attested: true,
      same_actor_as_shadow_evidence_generator: false,
      policy_change_review_completed: true,
      rollback_plan_reviewed: true,
      approved_canary_selection_fraction: canaryFraction,
      approved_canary_cycles: canaryCycles,
      approval_validity_minutes: APPROVAL_VALIDITY_MINUTES,
      approval_authorizes_release_candidate_creation_only: true,
      live_policy_activation_authorized: false,
      production_canary_activation_requires_separate_phase: true,
      rollback_baseline_fingerprint_verified: true,
      automatic_policy_promotion: false,
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
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      authorization_value: "release_candidate_creation_only",
      approved_at: approvedAt,
    },
    updated_at: approvedAt,
  };
  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(row)
    .select("id,memory_key,metadata")
    .single();
  if (written.error) throw written.error;
  return {
    success: true,
    contract: AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
    status: row.metadata.status,
    approval: written.data,
    live_policy_activation_authorized: false,
  };
}

export async function createAvantiqoSelectionPolicyCanaryReleaseCandidate({
  approval_fingerprint,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`,
    );
  }
  const approvalFingerprint = requireFingerprint(
    approval_fingerprint,
    "APPROVAL_FINGERPRINT",
  );
  const approval = await loadExactRow(
    organizationId,
    AVANTIQO_SELECTION_POLICY_PROMOTION_APPROVAL_SCOPE,
    "approval_fingerprint",
    approvalFingerprint,
  );
  const metadata = object(approval?.metadata);
  if (
    !activeAndUnexpired(approval) ||
    text(metadata.contract, 180) !==
      AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT ||
    text(metadata.status, 180) !==
      "EXPLICIT_POLICY_CANARY_RELEASE_CANDIDATE_APPROVAL_RECORDED" ||
    metadata.approval_authorizes_release_candidate_creation_only !== true ||
    metadata.live_policy_activation_authorized !== false ||
    metadata.rollback_baseline_fingerprint_verified !== true ||
    text(metadata.baseline_policy_fingerprint, 128) !== BASELINE_POLICY_FINGERPRINT
  ) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_PROMOTION_APPROVAL_NOT_CURRENT`,
    );
  }

  const existing = await loadExactRow(
    organizationId,
    AVANTIQO_SELECTION_POLICY_CANARY_RELEASE_SCOPE,
    "approval_fingerprint",
    approvalFingerprint,
  );
  if (existing?.active === true) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_APPROVAL_ALREADY_HAS_RELEASE_CANDIDATE`,
    );
  }

  const nowIso = new Date().toISOString();
  const releaseCandidateFingerprint = digest(
    "selection-policy-canary-release-candidate",
    approvalFingerprint,
    text(metadata.challenger_policy_version, 160),
    BASELINE_POLICY_FINGERPRINT,
  );
  const rollbackPlanFingerprint = digest(
    "selection-policy-rollback-plan",
    releaseCandidateFingerprint,
    BASELINE_POLICY_FINGERPRINT,
  );
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_SELECTION_POLICY_CANARY_RELEASE_SCOPE,
    memory_key: `selection-policy-canary-release:${releaseCandidateFingerprint.slice(0, 40)}`,
    memory_type: "decision",
    subject: `Selection policy canary release candidate ${releaseCandidateFingerprint.slice(0, 16)}`,
    content:
      "Versioned bounded canary release candidate created from a current explicit independent approval. It contains the exact baseline rollback fingerprint and is not live until a separate production-canary activation phase applies it.",
    importance: 1,
    confidence: 1,
    source: "selection_policy_canary_release_candidate",
    active: true,
    valid_until: plusDays(nowIso, RELEASE_CANDIDATE_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "CANARY_POLICY_RELEASE_CANDIDATE_READY_FOR_SEPARATE_ACTIVATION",
      release_candidate_fingerprint: releaseCandidateFingerprint,
      approval_fingerprint: approvalFingerprint,
      request_fingerprint: text(metadata.request_fingerprint, 128),
      challenger_policy_version: text(metadata.challenger_policy_version, 160),
      baseline_policy_contract: ACTIVE_SELECTION_CONTRACT,
      baseline_policy_version: BASELINE_POLICY_VERSION,
      baseline_policy_fingerprint: BASELINE_POLICY_FINGERPRINT,
      rollback_plan_fingerprint: rollbackPlanFingerprint,
      approved_canary_selection_fraction: Number(
        metadata.approved_canary_selection_fraction,
      ),
      approved_canary_cycles: Number(metadata.approved_canary_cycles),
      canary_selection_fraction_cannot_exceed_approval: true,
      canary_cycle_limit_cannot_exceed_approval: true,
      exact_baseline_rollback_required: true,
      automatic_rollback_on_governed_regression_required: true,
      explicit_rollback_directive_supported: true,
      production_canary_activation_authorized: false,
      activation_requires_separate_phase: true,
      automatic_policy_promotion: false,
      full_policy_cutover_allowed: false,
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
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      authorization_value: "none",
      created_at: nowIso,
    },
    updated_at: nowIso,
  };
  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(row)
    .select("id,memory_key,metadata")
    .single();
  if (written.error) throw written.error;
  return {
    success: true,
    contract: AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
    status: row.metadata.status,
    release_candidate: written.data,
    production_canary_activation_authorized: false,
  };
}

export async function recordAvantiqoSelectionPolicyRollbackDirective({
  release_candidate_fingerprint,
  approver_fingerprint,
  rollback_reason,
  independent_approver_attested = false,
  rollback_review_completed = false,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`,
    );
  }
  const releaseCandidateFingerprint = requireFingerprint(
    release_candidate_fingerprint,
    "RELEASE_CANDIDATE_FINGERPRINT",
  );
  const approverFingerprint = requireFingerprint(
    approver_fingerprint,
    "ROLLBACK_APPROVER_FINGERPRINT",
  );
  const reason = requireReason(rollback_reason, "ROLLBACK_REASON");
  if (independent_approver_attested !== true || rollback_review_completed !== true) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_ROLLBACK_REVIEW_REQUIRED`,
    );
  }

  const candidate = await loadExactRow(
    organizationId,
    AVANTIQO_SELECTION_POLICY_CANARY_RELEASE_SCOPE,
    "release_candidate_fingerprint",
    releaseCandidateFingerprint,
  );
  const metadata = object(candidate?.metadata);
  if (
    candidate?.active !== true ||
    text(metadata.contract, 180) !==
      AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT ||
    text(metadata.status, 180) !==
      "CANARY_POLICY_RELEASE_CANDIDATE_READY_FOR_SEPARATE_ACTIVATION" ||
    metadata.exact_baseline_rollback_required !== true ||
    text(metadata.baseline_policy_fingerprint, 128) !== BASELINE_POLICY_FINGERPRINT
  ) {
    throw new Error(
      `${AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_RELEASE_CANDIDATE_NOT_CURRENT`,
    );
  }

  const nowIso = new Date().toISOString();
  const rollbackDirectiveFingerprint = digest(
    "selection-policy-rollback-directive",
    releaseCandidateFingerprint,
    approverFingerprint,
    nowIso,
  );
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_SELECTION_POLICY_ROLLBACK_DIRECTIVE_SCOPE,
    memory_key: `selection-policy-rollback-directive:${rollbackDirectiveFingerprint.slice(0, 40)}`,
    memory_type: "decision",
    subject: `Selection policy rollback directive ${rollbackDirectiveFingerprint.slice(0, 16)}`,
    content:
      "Explicit independent rollback directive bound to one canary release candidate and its exact baseline policy fingerprint. This record does not mutate production policy; a separate canary runtime must apply it fail closed.",
    importance: 1,
    confidence: 1,
    source: "explicit_selection_policy_rollback_directive",
    active: true,
    valid_until: plusDays(nowIso, ROLLBACK_DIRECTIVE_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "ROLLBACK_DIRECTIVE_RECORDED_AWAITING_SEPARATE_APPLICATION",
      rollback_directive_fingerprint: rollbackDirectiveFingerprint,
      release_candidate_fingerprint: releaseCandidateFingerprint,
      rollback_plan_fingerprint: text(metadata.rollback_plan_fingerprint, 128),
      challenger_policy_version: text(metadata.challenger_policy_version, 160),
      baseline_policy_contract: ACTIVE_SELECTION_CONTRACT,
      baseline_policy_version: BASELINE_POLICY_VERSION,
      baseline_policy_fingerprint: BASELINE_POLICY_FINGERPRINT,
      approver_fingerprint: approverFingerprint,
      rollback_reason: reason,
      independent_approver_attested: true,
      rollback_review_completed: true,
      directive_requires_separate_application: true,
      production_policy_mutated_here: false,
      automatic_policy_promotion: false,
      execution_authorized: false,
      spend_authorized: false,
      provider_execution_authorized: false,
      provider_called_here: false,
      wallet_write_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
      authorization_value: "rollback_directive_only",
      recorded_at: nowIso,
    },
    updated_at: nowIso,
  };
  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(row)
    .select("id,memory_key,metadata")
    .single();
  if (written.error) throw written.error;
  return {
    success: true,
    contract: AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
    status: row.metadata.status,
    rollback_directive: written.data,
    production_policy_mutated: false,
  };
}

export const AvantiqoSelectionPolicyPromotionGovernanceRuntime = Object.freeze({
  contract: AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
  reconcilePromotionRequests: reconcileAvantiqoSelectionPolicyPromotionRequests,
  recordApproval: recordAvantiqoSelectionPolicyPromotionApproval,
  createCanaryReleaseCandidate: createAvantiqoSelectionPolicyCanaryReleaseCandidate,
  recordRollbackDirective: recordAvantiqoSelectionPolicyRollbackDirective,
  baselinePolicyFingerprint: BASELINE_POLICY_FINGERPRINT,
  maximumCanarySelectionFraction: MAX_CANARY_SELECTION_FRACTION,
  maximumCanaryCycles: MAX_CANARY_CYCLES,
});
