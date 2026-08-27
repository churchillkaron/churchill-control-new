import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_CONTRACT,
  AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoSelectionPolicyCanaryOutcomeCertificationRuntime";
import {
  AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT,
  AVANTIQO_SELECTION_POLICY_CANARY_ACTIVATION_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoSelectionPolicyCanaryRuntime";
import {
  AVANTIQO_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
  AVANTIQO_SELECTION_POLICY_PROMOTION_APPROVAL_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoSelectionPolicyPromotionGovernanceRuntime";

export const AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT =
  "AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_V1";
export const AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_REQUEST_SCOPE =
  "platform_learning_persistent_ordering_policy_promotion_requests";
export const AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_APPROVAL_SCOPE =
  "platform_learning_persistent_ordering_policy_promotion_approvals";
export const AVANTIQO_PERSISTENT_ORDERING_POLICY_RELEASE_CANDIDATE_SCOPE =
  "platform_learning_persistent_ordering_policy_release_candidates";

const MEMORY_TABLE = "intelligence_memories";
const REQUEST_VALIDITY_DAYS = 7;
const APPROVAL_VALIDITY_MINUTES = 60;
const RELEASE_CANDIDATE_VALIDITY_DAYS = 7;
const MAX_CERTIFIED_INFLUENCE_FRACTION = 0.25;
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
  const fingerprint = text(value, 128).toLowerCase();
  if (!/^[a-f0-9]{32,128}$/.test(fingerprint)) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_${code}_INVALID`,
    );
  }
  return fingerprint;
}

function requireReason(value, code) {
  const reason = text(value, 4000);
  if (reason.length < 12) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_${code}_REQUIRED`,
    );
  }
  return reason;
}

function validCertification(row, nowMs = Date.now()) {
  const metadata = object(row?.metadata);
  return Boolean(
    activeAndUnexpired(row, nowMs) &&
      text(metadata.contract, 180) ===
        AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_CONTRACT &&
      text(metadata.status, 180) ===
        "CANARY_EVIDENCE_FULL_POLICY_PROMOTION_REVIEW_CANDIDATE" &&
      metadata.mature_canary_outcome_evidence === true &&
      metadata.full_policy_promotion_review_candidate === true &&
      metadata.clean_cycle_limit_completion === true &&
      metadata.all_approved_cycles_applied === true &&
      metadata.all_applied_cycles_fully_observed === true &&
      metadata.exact_baseline_restored === true &&
      metadata.zero_regression_cycles_required === true &&
      Number(metadata.regression_cycle_count) === 0 &&
      metadata.actual_canary_ranks_evaluated === true &&
      metadata.theoretical_full_challenger_ranks_used_as_canary_outcome === false &&
      metadata.governed_phase28_realized_outcomes_only === true &&
      metadata.unexecuted_candidate_outcome_inferred === false &&
      metadata.historical_counterfactual_backtest_claimed === false &&
      metadata.automatic_full_policy_promotion === false &&
      metadata.separate_full_policy_promotion_governance_required === true &&
      Boolean(text(metadata.certification_fingerprint, 128)) &&
      Boolean(text(metadata.activation_fingerprint, 128)) &&
      Boolean(text(metadata.release_candidate_fingerprint, 128)) &&
      Boolean(text(metadata.challenger_policy_version, 160)) &&
      Boolean(text(metadata.baseline_policy_fingerprint, 128))
  );
}

async function loadRows(organizationId, scope, { activeOnly = false, limit = 5000 } = {}) {
  let query = supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", scope)
    .limit(limit);
  if (activeOnly) query = query.eq("active", true);
  const result = await query;
  if (result.error) throw result.error;
  return list(result.data);
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

function certifiedActivationRow(activation, certificationMetadata) {
  const metadata = object(activation?.metadata);
  const influence = Number(metadata.canary_influence_fraction);
  return Boolean(
    activation &&
      text(metadata.contract, 180) === AVANTIQO_SELECTION_POLICY_CANARY_CONTRACT &&
      text(metadata.activation_fingerprint, 128) ===
        text(certificationMetadata.activation_fingerprint, 128) &&
      text(metadata.release_candidate_fingerprint, 128) ===
        text(certificationMetadata.release_candidate_fingerprint, 128) &&
      text(metadata.challenger_policy_version, 160) ===
        text(certificationMetadata.challenger_policy_version, 160) &&
      text(metadata.baseline_policy_fingerprint, 128) ===
        text(certificationMetadata.baseline_policy_fingerprint, 128) &&
      metadata.same_selected_portfolio_only === true &&
      metadata.selected_membership_change_authorized === false &&
      metadata.source_score_increase_authorized === false &&
      metadata.full_policy_cutover_authorized === false &&
      metadata.automatic_regression_rollback_required === true &&
      Number.isFinite(influence) &&
      influence > 0 &&
      influence <= MAX_CERTIFIED_INFLUENCE_FRACTION
  );
}

function promotionRequestRow({ organizationId, certification, activation, nowIso }) {
  const certificationMetadata = object(certification.metadata);
  const activationMetadata = object(activation.metadata);
  const certificationFingerprint = text(
    certificationMetadata.certification_fingerprint,
    128,
  );
  const activationFingerprint = text(
    certificationMetadata.activation_fingerprint,
    128,
  );
  const exactCertifiedInfluenceFraction = Number(
    activationMetadata.canary_influence_fraction,
  );
  const challengerPolicyVersion = text(
    certificationMetadata.challenger_policy_version,
    160,
  );
  const baselinePolicyFingerprint = text(
    certificationMetadata.baseline_policy_fingerprint,
    128,
  );
  const requestFingerprint = digest(
    "persistent-ordering-policy-promotion-request",
    certificationFingerprint,
    activationFingerprint,
    challengerPolicyVersion,
    baselinePolicyFingerprint,
    exactCertifiedInfluenceFraction,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_REQUEST_SCOPE,
    memory_key: `persistent-ordering-policy-promotion-request:${requestFingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: `Persistent ordering policy promotion review ${challengerPolicyVersion}`,
    content:
      "Governed review request to persist the exact ordering-policy influence that was actually tested by the completed Phase 32 canary and certified by Phase 33. It does not authorize a stronger challenger, candidate-membership changes, eligibility changes, top-N changes, uncertainty-group changes, source-score mutation, execution, spend, knowledge promotion or training.",
    importance: 1,
    confidence: 1,
    source: "persistent_ordering_policy_promotion_request",
    active: true,
    valid_until: plusDays(nowIso, REQUEST_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "AWAITING_EXPLICIT_PERSISTENT_ORDERING_POLICY_PROMOTION_APPROVAL",
      request_fingerprint: requestFingerprint,
      source_certification_contract:
        AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_CONTRACT,
      source_certification_fingerprint: certificationFingerprint,
      source_activation_fingerprint: activationFingerprint,
      source_phase31_release_candidate_fingerprint: text(
        certificationMetadata.release_candidate_fingerprint,
        128,
      ),
      challenger_policy_version: challengerPolicyVersion,
      baseline_policy_fingerprint: baselinePolicyFingerprint,
      exact_certified_ordering_influence_fraction:
        exactCertifiedInfluenceFraction,
      maximum_ordering_influence_fraction:
        exactCertifiedInfluenceFraction,
      influence_increase_above_certified_canary_allowed: false,
      full_100_percent_challenger_cutover_allowed: false,
      persistent_policy_scope: "ORDERING_WITHIN_ALREADY_SELECTED_PORTFOLIO_ONLY",
      candidate_eligibility_change_allowed: false,
      candidate_membership_change_allowed: false,
      maximum_selection_count_change_allowed: false,
      uncertainty_group_constraint_change_allowed: false,
      source_numeric_score_mutation_allowed: false,
      baseline_membership_selector_remains_authoritative: true,
      explicit_independent_approval_required: true,
      approval_is_not_live_activation: true,
      release_candidate_requires_separate_explicit_call: true,
      live_activation_requires_separate_phase: true,
      exact_baseline_rollback_lineage_required: true,
      automatic_promotion: false,
      live_policy_mutated: false,
      live_selection_mutated: false,
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

export async function reconcileAvantiqoPersistentOrderingPolicyPromotionRequests({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      request_count: 0,
    };
  }

  const nowIso = new Date().toISOString();
  const certifications = (
    await loadRows(
      organizationId,
      AVANTIQO_SELECTION_POLICY_CANARY_OUTCOME_CERTIFICATION_SCOPE,
      { activeOnly: true, limit: 100 },
    )
  ).filter((row) => validCertification(row));

  const rows = [];
  for (const certification of certifications) {
    const certificationMetadata = object(certification.metadata);
    const activationFingerprint = text(
      certificationMetadata.activation_fingerprint,
      128,
    );
    const activation = await loadExactRow(
      organizationId,
      AVANTIQO_SELECTION_POLICY_CANARY_ACTIVATION_SCOPE,
      "activation_fingerprint",
      activationFingerprint,
    );
    if (!certifiedActivationRow(activation, certificationMetadata)) continue;
    rows.push(
      promotionRequestRow({
        organizationId,
        certification,
        activation,
        nowIso,
      }),
    );
  }

  const writeCount = persist ? await upsertRows(rows) : 0;
  return {
    success: true,
    contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
    status: rows.length
      ? "PERSISTENT_ORDERING_POLICY_PROMOTION_REQUESTS_READY"
      : "NO_CERTIFIED_CANARY_ORDERING_POLICY_READY_FOR_PROMOTION_REVIEW",
    request_count: rows.length,
    request_write_count: writeCount,
    requests: rows.map((row) => ({
      request_fingerprint: row.metadata.request_fingerprint,
      source_certification_fingerprint:
        row.metadata.source_certification_fingerprint,
      challenger_policy_version: row.metadata.challenger_policy_version,
      exact_certified_ordering_influence_fraction:
        row.metadata.exact_certified_ordering_influence_fraction,
      baseline_policy_fingerprint: row.metadata.baseline_policy_fingerprint,
      valid_until: row.valid_until,
    })),
    governance: {
      automatic_approval: false,
      automatic_release_candidate_creation: false,
      automatic_live_activation: false,
      candidate_eligibility_change_allowed: false,
      candidate_membership_change_allowed: false,
      influence_increase_above_certified_canary_allowed: false,
      full_100_percent_challenger_cutover_allowed: false,
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

export async function recordAvantiqoPersistentOrderingPolicyPromotionApproval({
  request_fingerprint,
  approver_fingerprint,
  approval_reason,
  independent_approver_attested = false,
  same_actor_as_canary_activator = true,
  same_actor_as_phase31_promotion_approver = true,
  exact_certified_influence_acknowledged = false,
  membership_boundary_acknowledged = false,
  rollback_lineage_reviewed = false,
  approved_at,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`,
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
  if (independent_approver_attested !== true) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_INDEPENDENT_APPROVER_ATTESTATION_REQUIRED`,
    );
  }
  if (
    same_actor_as_canary_activator !== false ||
    same_actor_as_phase31_promotion_approver !== false
  ) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_APPROVER_INDEPENDENCE_REQUIRED`,
    );
  }
  if (
    exact_certified_influence_acknowledged !== true ||
    membership_boundary_acknowledged !== true ||
    rollback_lineage_reviewed !== true
  ) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_PROMOTION_BOUNDARY_REVIEW_REQUIRED`,
    );
  }

  const request = await loadExactRow(
    organizationId,
    AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_REQUEST_SCOPE,
    "request_fingerprint",
    requestFingerprint,
  );
  const requestMetadata = object(request?.metadata);
  if (
    !activeAndUnexpired(request) ||
    text(requestMetadata.contract, 180) !==
      AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT ||
    text(requestMetadata.status, 180) !==
      "AWAITING_EXPLICIT_PERSISTENT_ORDERING_POLICY_PROMOTION_APPROVAL" ||
    requestMetadata.explicit_independent_approval_required !== true ||
    requestMetadata.approval_is_not_live_activation !== true ||
    requestMetadata.candidate_membership_change_allowed !== false ||
    requestMetadata.influence_increase_above_certified_canary_allowed !== false ||
    requestMetadata.full_100_percent_challenger_cutover_allowed !== false
  ) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_PROMOTION_REQUEST_NOT_CURRENT`,
    );
  }

  const activationFingerprint = requireFingerprint(
    requestMetadata.source_activation_fingerprint,
    "SOURCE_ACTIVATION_FINGERPRINT",
  );
  const activation = await loadExactRow(
    organizationId,
    AVANTIQO_SELECTION_POLICY_CANARY_ACTIVATION_SCOPE,
    "activation_fingerprint",
    activationFingerprint,
  );
  const activationMetadata = object(activation?.metadata);
  if (
    text(activationMetadata.activator_fingerprint, 128) === approverFingerprint
  ) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_APPROVER_MATCHES_CANARY_ACTIVATOR`,
    );
  }

  const phase31ApprovalFingerprint = text(
    activationMetadata.approval_fingerprint,
    128,
  );
  if (phase31ApprovalFingerprint) {
    const phase31Approval = await loadExactRow(
      organizationId,
      AVANTIQO_SELECTION_POLICY_PROMOTION_APPROVAL_SCOPE,
      "approval_fingerprint",
      phase31ApprovalFingerprint,
    );
    if (
      text(object(phase31Approval?.metadata).approver_fingerprint, 128) ===
      approverFingerprint
    ) {
      throw new Error(
        `${AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_APPROVER_MATCHES_PHASE31_PROMOTION_APPROVER`,
      );
    }
  }

  const approvedAt = text(approved_at, 120) || new Date().toISOString();
  const approvedAtMs = Date.parse(approvedAt);
  if (
    !Number.isFinite(approvedAtMs) ||
    Math.abs(Date.now() - approvedAtMs) > 5 * MINUTE_MS
  ) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_APPROVED_AT_INVALID`,
    );
  }

  const exactInfluence = Number(
    requestMetadata.exact_certified_ordering_influence_fraction,
  );
  if (
    !Number.isFinite(exactInfluence) ||
    exactInfluence <= 0 ||
    exactInfluence > MAX_CERTIFIED_INFLUENCE_FRACTION ||
    exactInfluence !== Number(requestMetadata.maximum_ordering_influence_fraction)
  ) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_CERTIFIED_INFLUENCE_INVALID`,
    );
  }

  const approvalFingerprint = digest(
    "persistent-ordering-policy-promotion-approval",
    requestFingerprint,
    approverFingerprint,
    approvedAt,
    exactInfluence,
  );
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_APPROVAL_SCOPE,
    memory_key: `persistent-ordering-policy-promotion-approval:${approvalFingerprint.slice(0, 40)}`,
    memory_type: "decision",
    subject: `Persistent ordering policy promotion approval ${approvalFingerprint.slice(0, 16)}`,
    content:
      "Explicit independent approval to create a release candidate for the exact canary-certified ordering policy. The approval cannot increase influence, cannot change candidate membership or eligibility, and is not live activation.",
    importance: 1,
    confidence: 1,
    source: "explicit_persistent_ordering_policy_promotion_approval",
    active: true,
    valid_until: plusMinutes(approvedAt, APPROVAL_VALIDITY_MINUTES),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "EXPLICIT_PERSISTENT_ORDERING_POLICY_RELEASE_CANDIDATE_APPROVAL_RECORDED",
      approval_fingerprint: approvalFingerprint,
      request_fingerprint: requestFingerprint,
      source_certification_fingerprint: text(
        requestMetadata.source_certification_fingerprint,
        128,
      ),
      source_activation_fingerprint: activationFingerprint,
      challenger_policy_version: text(
        requestMetadata.challenger_policy_version,
        160,
      ),
      baseline_policy_fingerprint: text(
        requestMetadata.baseline_policy_fingerprint,
        128,
      ),
      exact_certified_ordering_influence_fraction: exactInfluence,
      approver_fingerprint: approverFingerprint,
      approval_reason: reason,
      independent_approver_attested: true,
      same_actor_as_canary_activator: false,
      same_actor_as_phase31_promotion_approver: false,
      exact_certified_influence_acknowledged: true,
      membership_boundary_acknowledged: true,
      rollback_lineage_reviewed: true,
      approval_validity_minutes: APPROVAL_VALIDITY_MINUTES,
      approval_authorizes_release_candidate_creation_only: true,
      live_activation_authorized: false,
      live_activation_requires_separate_phase: true,
      candidate_eligibility_change_allowed: false,
      candidate_membership_change_allowed: false,
      influence_increase_allowed: false,
      full_100_percent_challenger_cutover_allowed: false,
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
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(row)
    .select("id,memory_key,metadata")
    .single();
  if (result.error) throw result.error;
  return {
    success: true,
    contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
    status: row.metadata.status,
    approval: result.data,
    live_activation_authorized: false,
  };
}

export async function createAvantiqoPersistentOrderingPolicyReleaseCandidate({
  approval_fingerprint,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`,
    );
  }
  const approvalFingerprint = requireFingerprint(
    approval_fingerprint,
    "APPROVAL_FINGERPRINT",
  );
  const approval = await loadExactRow(
    organizationId,
    AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_APPROVAL_SCOPE,
    "approval_fingerprint",
    approvalFingerprint,
  );
  const metadata = object(approval?.metadata);
  if (
    !activeAndUnexpired(approval) ||
    text(metadata.contract, 180) !==
      AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT ||
    text(metadata.status, 180) !==
      "EXPLICIT_PERSISTENT_ORDERING_POLICY_RELEASE_CANDIDATE_APPROVAL_RECORDED" ||
    metadata.approval_authorizes_release_candidate_creation_only !== true ||
    metadata.live_activation_authorized !== false ||
    metadata.candidate_membership_change_allowed !== false ||
    metadata.influence_increase_allowed !== false ||
    metadata.full_100_percent_challenger_cutover_allowed !== false
  ) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_PROMOTION_APPROVAL_NOT_CURRENT`,
    );
  }

  const existing = await loadExactRow(
    organizationId,
    AVANTIQO_PERSISTENT_ORDERING_POLICY_RELEASE_CANDIDATE_SCOPE,
    "approval_fingerprint",
    approvalFingerprint,
  );
  if (existing?.active === true) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_APPROVAL_ALREADY_HAS_RELEASE_CANDIDATE`,
    );
  }

  const exactInfluence = Number(
    metadata.exact_certified_ordering_influence_fraction,
  );
  if (
    !Number.isFinite(exactInfluence) ||
    exactInfluence <= 0 ||
    exactInfluence > MAX_CERTIFIED_INFLUENCE_FRACTION
  ) {
    throw new Error(
      `${AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT}_CERTIFIED_INFLUENCE_INVALID`,
    );
  }

  const nowIso = new Date().toISOString();
  const releaseCandidateFingerprint = digest(
    "persistent-ordering-policy-release-candidate",
    approvalFingerprint,
    text(metadata.source_certification_fingerprint, 128),
    text(metadata.challenger_policy_version, 160),
    text(metadata.baseline_policy_fingerprint, 128),
    exactInfluence,
  );
  const rollbackLineageFingerprint = digest(
    "persistent-ordering-policy-rollback-lineage",
    releaseCandidateFingerprint,
    text(metadata.baseline_policy_fingerprint, 128),
  );
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_PERSISTENT_ORDERING_POLICY_RELEASE_CANDIDATE_SCOPE,
    memory_key: `persistent-ordering-policy-release-candidate:${releaseCandidateFingerprint.slice(0, 40)}`,
    memory_type: "decision",
    subject: `Persistent ordering policy release candidate ${releaseCandidateFingerprint.slice(0, 16)}`,
    content:
      "Versioned persistent ordering-policy release candidate bound to the exact Phase 32 influence that Phase 33 certified. It is not live. A separate activation phase must preserve Phase 17 eligibility, membership, group constraints and source scores and must retain exact baseline rollback lineage.",
    importance: 1,
    confidence: 1,
    source: "persistent_ordering_policy_release_candidate",
    active: true,
    valid_until: plusDays(nowIso, RELEASE_CANDIDATE_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
      status: "PERSISTENT_ORDERING_POLICY_RELEASE_CANDIDATE_READY_FOR_SEPARATE_ACTIVATION",
      release_candidate_fingerprint: releaseCandidateFingerprint,
      approval_fingerprint: approvalFingerprint,
      request_fingerprint: text(metadata.request_fingerprint, 128),
      source_certification_fingerprint: text(
        metadata.source_certification_fingerprint,
        128,
      ),
      source_activation_fingerprint: text(
        metadata.source_activation_fingerprint,
        128,
      ),
      challenger_policy_version: text(metadata.challenger_policy_version, 160),
      baseline_policy_fingerprint: text(metadata.baseline_policy_fingerprint, 128),
      exact_certified_ordering_influence_fraction: exactInfluence,
      rollback_lineage_fingerprint: rollbackLineageFingerprint,
      persistent_policy_scope: "ORDERING_WITHIN_ALREADY_SELECTED_PORTFOLIO_ONLY",
      exact_certified_influence_must_be_preserved: true,
      candidate_eligibility_change_allowed: false,
      candidate_membership_change_allowed: false,
      maximum_selection_count_change_allowed: false,
      uncertainty_group_constraint_change_allowed: false,
      source_numeric_score_mutation_allowed: false,
      full_100_percent_challenger_cutover_allowed: false,
      baseline_membership_selector_remains_authoritative: true,
      live_activation_authorized: false,
      live_activation_requires_separate_phase: true,
      exact_baseline_rollback_lineage_required: true,
      automatic_promotion: false,
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
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(row)
    .select("id,memory_key,metadata")
    .single();
  if (result.error) throw result.error;
  return {
    success: true,
    contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
    status: row.metadata.status,
    release_candidate: result.data,
    live_activation_authorized: false,
  };
}

export const AvantiqoPersistentOrderingPolicyPromotionGovernanceRuntime = Object.freeze({
  contract: AVANTIQO_PERSISTENT_ORDERING_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
  reconcilePromotionRequests:
    reconcileAvantiqoPersistentOrderingPolicyPromotionRequests,
  recordApproval: recordAvantiqoPersistentOrderingPolicyPromotionApproval,
  createReleaseCandidate: createAvantiqoPersistentOrderingPolicyReleaseCandidate,
  maximumCertifiedInfluenceFraction: MAX_CERTIFIED_INFLUENCE_FRACTION,
});
