import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
  AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CERTIFICATION_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoRebasedSelectionPolicyCanaryRuntime";
import {
  AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT,
  AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_APPROVAL_SCOPE,
} from "@/lib/intelligence/runtime/AvantiqoRebasedSelectionPolicyPromotionGovernanceRuntime";

export const AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT =
  "AVANTIQO_PERSISTENT_POLICY_SUCCESSION_V1";
export const AVANTIQO_PERSISTENT_POLICY_SUCCESSION_REQUEST_SCOPE =
  "platform_learning_persistent_policy_succession_requests";
export const AVANTIQO_PERSISTENT_POLICY_SUCCESSION_APPROVAL_SCOPE =
  "platform_learning_persistent_policy_succession_approvals";
export const AVANTIQO_PERSISTENT_POLICY_SUCCESSION_RELEASE_SCOPE =
  "platform_learning_persistent_policy_succession_release_candidates";

const MEMORY_TABLE = "intelligence_memories";
const POLICY_TABLE = "avantiqo_intelligence_persistent_ordering_policies";
const PHASE40_ACTIVATION_VIEW = "avantiqo_rebased_policy_canary_activations";
const PERSISTENT_POLICY_CONTRACT = "AVANTIQO_PERSISTENT_ORDERING_POLICY_AUTHORITY_V1";
const ACTIVATE_SUCCESSOR_RPC = "activate_avantiqo_policy_successor_v1";
const ROLLBACK_PERSISTENT_RPC = "rollback_avantiqo_intelligence_persistent_ordering_policy_v1";
const REQUEST_VALIDITY_DAYS = 7;
const APPROVAL_VALIDITY_MINUTES = 60;
const RELEASE_VALIDITY_DAYS = 7;
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
    .update(parts.map((part) => text(part, 48000).toLowerCase()).join("|"))
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

function validFingerprint(value) {
  return /^[a-f0-9]{32,128}$/.test(text(value, 128).toLowerCase());
}

function requireFingerprint(value, code) {
  const fingerprint = text(value, 128).toLowerCase();
  if (!validFingerprint(fingerprint)) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_${code}_INVALID`);
  }
  return fingerprint;
}

function requireReason(value, code) {
  const reason = text(value, 4000);
  if (reason.length < 12) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_${code}_REQUIRED`);
  }
  return reason;
}

function activeAndUnexpired(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  const validUntil = Date.parse(text(row.valid_until, 120));
  return !Number.isFinite(validUntil) || validUntil > nowMs;
}

async function loadActivePolicy(organizationId) {
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

function validActivePolicy(policy) {
  return Boolean(
    policy &&
      policy.contract === PERSISTENT_POLICY_CONTRACT &&
      policy.state === "ACTIVE" &&
      validFingerprint(policy.policy_fingerprint) &&
      validFingerprint(policy.baseline_policy_fingerprint) &&
      validFingerprint(policy.activator_fingerprint) &&
      text(policy.challenger_policy_version, 180) &&
      Number(policy.ordering_influence_fraction) > 0 &&
      Number(policy.ordering_influence_fraction) <= 0.25
  );
}

async function loadRows(organizationId, scope, limit = 200) {
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

async function loadExactMemory(organizationId, scope, key, fingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,created_at,updated_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", scope)
    .eq(`metadata->>${key}`, fingerprint)
    .limit(2);
  if (result.error) throw result.error;
  const rows = list(result.data);
  if (rows.length > 1) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_${scope.toUpperCase()}_AMBIGUOUS`);
  }
  return rows[0] || null;
}

async function loadPhase40Activation(organizationId, activationFingerprint) {
  const result = await supabaseAdmin
    .from(PHASE40_ACTIVATION_VIEW)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("activation_fingerprint", activationFingerprint)
    .limit(2);
  if (result.error) throw result.error;
  const rows = list(result.data);
  if (rows.length > 1) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_PHASE40_ACTIVATION_AMBIGUOUS`);
  }
  return rows[0] || null;
}

function eligibleCertification(row, policy) {
  const metadata = object(row?.metadata);
  return Boolean(
    activeAndUnexpired(row) &&
      text(metadata.contract, 180) === AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT &&
      text(metadata.status, 180) ===
        "REBASED_CANARY_EVIDENCE_PERSISTENT_POLICY_SUCCESSION_REVIEW_CANDIDATE" &&
      metadata.persistent_policy_succession_review_candidate === true &&
      metadata.policy_succession_authorized === false &&
      metadata.persistent_policy_replacement_authorized === false &&
      metadata.automatic_policy_succession === false &&
      metadata.automatic_policy_activation === false &&
      metadata.exact_current_persistent_baseline_restored === true &&
      metadata.all_approved_cycles_applied === true &&
      metadata.all_applied_cycles_fully_observed === true &&
      Number(metadata.regression_cycle_count) === 0 &&
      Number(metadata.canary_pairwise_correct_rate) >= Number(metadata.minimum_canary_correct_rate) &&
      Number(metadata.canary_correct_rate_advantage) >= Number(metadata.minimum_canary_rate_advantage) &&
      Number(metadata.canary_observed_rank_regret) <=
        Number(metadata.current_persistent_baseline_observed_rank_regret) &&
      validFingerprint(metadata.certification_fingerprint) &&
      validFingerprint(metadata.activation_fingerprint) &&
      text(metadata.current_baseline_policy_fingerprint, 128) === text(policy.policy_fingerprint, 128) &&
      text(metadata.challenger_policy_version, 180) &&
      text(metadata.challenger_policy_version, 180) !== text(policy.challenger_policy_version, 180) &&
      Number(metadata.canary_influence_fraction) > 0 &&
      Number(metadata.canary_influence_fraction) <= 0.25
  );
}

async function lineageForCertification(organizationId, certification, policy) {
  const certificationMetadata = object(certification.metadata);
  const activation = await loadPhase40Activation(
    organizationId,
    text(certificationMetadata.activation_fingerprint, 128),
  );
  if (
    !activation ||
    activation.contract !== "AVANTIQO_REBASED_SELECTION_POLICY_CANARY_AUTHORITY_V1" ||
    activation.state !== "COMPLETED" ||
    activation.current_baseline_policy_fingerprint !== policy.policy_fingerprint ||
    activation.challenger_policy_version !== certificationMetadata.challenger_policy_version ||
    Number(activation.canary_influence_fraction) !== Number(certificationMetadata.canary_influence_fraction) ||
    object(activation.metadata).exact_current_persistent_baseline_restored !== true ||
    !validFingerprint(activation.source_proposal_fingerprint) ||
    !validFingerprint(activation.source_research_epoch_fingerprint) ||
    !validFingerprint(activation.approval_fingerprint) ||
    !validFingerprint(activation.activator_fingerprint)
  ) {
    return null;
  }
  const phase39Approval = await loadExactMemory(
    organizationId,
    AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_APPROVAL_SCOPE,
    "approval_fingerprint",
    activation.approval_fingerprint,
  );
  const approvalMetadata = object(phase39Approval?.metadata);
  if (
    !phase39Approval ||
    !activeAndUnexpired(phase39Approval, Date.parse(activation.activated_at)) ||
    text(approvalMetadata.contract, 180) !==
      AVANTIQO_REBASED_SELECTION_POLICY_PROMOTION_GOVERNANCE_CONTRACT ||
    text(approvalMetadata.status, 180) !==
      "EXPLICIT_REBASED_POLICY_CANARY_RELEASE_APPROVAL_RECORDED" ||
    !validFingerprint(approvalMetadata.approver_fingerprint)
  ) {
    return null;
  }
  return {
    activation,
    phase39_approver_fingerprint: text(approvalMetadata.approver_fingerprint, 128),
  };
}

function successionRequestRow(organizationId, policy, certification, lineage, nowIso) {
  const metadata = object(certification.metadata);
  const activation = lineage.activation;
  const requestFingerprint = digest(
    "phase41-persistent-policy-succession-request",
    metadata.certification_fingerprint,
    policy.policy_fingerprint,
    activation.source_proposal_fingerprint,
    metadata.challenger_policy_version,
    metadata.canary_influence_fraction,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_REQUEST_SCOPE,
    memory_key: `persistent-policy-succession-request:${requestFingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: `Persistent policy succession request ${text(metadata.challenger_policy_version, 180)}`,
    content:
      "Governed request to replace the current persistent ordering policy with only the exact composite policy actually tested and certified by Phase 40. It cannot approve, release, activate, apply or execute anything.",
    importance: 1,
    confidence: 1,
    source: "persistent_policy_succession_governance_request",
    active: true,
    valid_until: plusDays(nowIso, REQUEST_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT,
      status: "AWAITING_EXPLICIT_PERSISTENT_POLICY_SUCCESSION_APPROVAL",
      request_fingerprint: requestFingerprint,
      source_phase40_contract: AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CONTRACT,
      source_certification_fingerprint: text(metadata.certification_fingerprint, 128),
      source_phase40_activation_fingerprint: text(metadata.activation_fingerprint, 128),
      source_phase38_proposal_fingerprint: activation.source_proposal_fingerprint,
      source_research_epoch_fingerprint: activation.source_research_epoch_fingerprint,
      source_phase39_approval_fingerprint: activation.approval_fingerprint,
      phase39_approver_fingerprint: lineage.phase39_approver_fingerprint,
      phase40_canary_activator_fingerprint: activation.activator_fingerprint,
      current_baseline_policy_fingerprint: policy.policy_fingerprint,
      current_baseline_policy_version: policy.challenger_policy_version,
      current_baseline_policy_activator_fingerprint: policy.activator_fingerprint,
      successor_challenger_policy_version: text(metadata.challenger_policy_version, 180),
      exact_tested_incremental_influence_fraction: Number(metadata.canary_influence_fraction),
      exact_tested_composite_only: true,
      raw_challenger_full_cutover_authorized: false,
      recursive_policy_stack_authorized: false,
      flattened_composition_required: true,
      parent_policy_must_remain_exactly_current_until_activation: true,
      explicit_independent_approval_required: true,
      approval_is_not_release: true,
      approval_is_not_activation: true,
      release_is_not_activation: true,
      activation_requires_separate_explicit_call: true,
      atomic_parent_supersession_and_successor_activation_required: true,
      exact_parent_policy_rollback_required: true,
      phase36_regression_monitor_must_continue: true,
      same_selected_portfolio_only: true,
      selected_membership_change_authorized: false,
      source_numeric_score_mutation_authorized: false,
      execution_authorized: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      automatic_policy_succession: false,
      automatic_policy_activation: false,
      automatic_training_started: false,
      automatic_model_weight_mutation: false,
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

export async function reconcileAvantiqoPersistentPolicySuccessionRequests({ persist = true } = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      request_count: 0,
      automatic_policy_succession: false,
    };
  }
  const policy = await loadActivePolicy(organizationId);
  if (!policy) {
    return {
      success: true,
      contract: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT,
      status: "NO_ACTIVE_PERSISTENT_POLICY_BASELINE",
      request_count: 0,
      automatic_policy_succession: false,
    };
  }
  if (!validActivePolicy(policy)) {
    return {
      success: false,
      contract: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT,
      status: "CURRENT_PERSISTENT_POLICY_INVALID_FAIL_CLOSED",
      request_count: 0,
      execution_authorized: false,
    };
  }
  const eligible = (
    await loadRows(organizationId, AVANTIQO_REBASED_SELECTION_POLICY_CANARY_CERTIFICATION_SCOPE, 100)
  ).filter((row) => eligibleCertification(row, policy));
  const certificationFingerprints = new Set(
    eligible.map((row) => text(object(row.metadata).certification_fingerprint, 128)),
  );
  if (certificationFingerprints.size > 1) {
    return {
      success: false,
      contract: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT,
      status: "MULTIPLE_MATURE_PHASE40_SUCCESSORS_FOR_CURRENT_BASELINE_FAIL_CLOSED",
      request_count: 0,
      execution_authorized: false,
    };
  }
  const nowIso = new Date().toISOString();
  const rows = [];
  for (const certification of eligible) {
    const lineage = await lineageForCertification(organizationId, certification, policy);
    if (!lineage) {
      return {
        success: false,
        contract: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT,
        status: "PHASE40_SUCCESSION_LINEAGE_AMBIGUITY_FAIL_CLOSED",
        request_count: 0,
        execution_authorized: false,
      };
    }
    rows.push(successionRequestRow(organizationId, policy, certification, lineage, nowIso));
  }
  const writeCount = persist ? await upsertRows(rows) : 0;
  return {
    success: true,
    contract: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT,
    status: rows.length
      ? "PERSISTENT_POLICY_SUCCESSION_REQUEST_READY"
      : "NO_CERTIFIED_PERSISTENT_POLICY_SUCCESSION_REQUEST",
    request_count: rows.length,
    request_write_count: writeCount,
    automatic_policy_succession: false,
    automatic_policy_activation: false,
    execution_authorized: false,
  };
}

export async function recordAvantiqoPersistentPolicySuccessionApproval({
  request_fingerprint,
  approver_fingerprint,
  approval_reason,
  explicit_succession_review_completed = false,
  exact_tested_composite_confirmed = false,
  rollback_readiness_confirmed = false,
  same_actor_as_phase39_approver = true,
  same_actor_as_phase40_canary_activator = true,
  same_actor_as_current_baseline_activator = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }
  const requestFingerprint = requireFingerprint(request_fingerprint, "REQUEST_FINGERPRINT");
  const approverFingerprint = requireFingerprint(approver_fingerprint, "APPROVER_FINGERPRINT");
  const reason = requireReason(approval_reason, "APPROVAL_REASON");
  if (
    explicit_succession_review_completed !== true ||
    exact_tested_composite_confirmed !== true ||
    rollback_readiness_confirmed !== true
  ) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_EXPLICIT_REVIEW_REQUIRED`);
  }
  if (
    same_actor_as_phase39_approver !== false ||
    same_actor_as_phase40_canary_activator !== false ||
    same_actor_as_current_baseline_activator !== false
  ) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_INDEPENDENT_APPROVER_REQUIRED`);
  }
  const request = await loadExactMemory(
    organizationId,
    AVANTIQO_PERSISTENT_POLICY_SUCCESSION_REQUEST_SCOPE,
    "request_fingerprint",
    requestFingerprint,
  );
  const requestMetadata = object(request?.metadata);
  if (
    !request ||
    !activeAndUnexpired(request) ||
    text(requestMetadata.contract, 180) !== AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT ||
    text(requestMetadata.status, 180) !== "AWAITING_EXPLICIT_PERSISTENT_POLICY_SUCCESSION_APPROVAL" ||
    requestMetadata.exact_tested_composite_only !== true ||
    requestMetadata.raw_challenger_full_cutover_authorized !== false ||
    requestMetadata.flattened_composition_required !== true
  ) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_REQUEST_NOT_APPROVABLE`);
  }
  const policy = await loadActivePolicy(organizationId);
  if (!validActivePolicy(policy) || policy.policy_fingerprint !== requestMetadata.current_baseline_policy_fingerprint) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_CURRENT_BASELINE_CHANGED`);
  }
  if (
    approverFingerprint === requestMetadata.phase39_approver_fingerprint ||
    approverFingerprint === requestMetadata.phase40_canary_activator_fingerprint ||
    approverFingerprint === policy.activator_fingerprint
  ) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_APPROVER_INDEPENDENCE_FAILED`);
  }
  const nowIso = new Date().toISOString();
  const approvalFingerprint = digest(
    "phase41-persistent-policy-succession-approval",
    requestFingerprint,
    approverFingerprint,
    requestMetadata.source_certification_fingerprint,
  );
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_APPROVAL_SCOPE,
    memory_key: `persistent-policy-succession-approval:${approvalFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Persistent policy succession approval ${approvalFingerprint.slice(0, 16)}`,
    content:
      "Explicit independent approval for creating a release candidate for the exact Phase 40-tested composite persistent-policy successor. Approval itself does not activate or apply the successor.",
    importance: 1,
    confidence: 1,
    source: "persistent_policy_succession_governance_approval",
    active: true,
    valid_until: plusMinutes(nowIso, APPROVAL_VALIDITY_MINUTES),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT,
      status: "EXPLICIT_PERSISTENT_POLICY_SUCCESSION_RELEASE_APPROVAL_RECORDED",
      approval_fingerprint: approvalFingerprint,
      request_fingerprint: requestFingerprint,
      approver_fingerprint: approverFingerprint,
      approval_reason: reason,
      source_certification_fingerprint: requestMetadata.source_certification_fingerprint,
      source_phase40_activation_fingerprint: requestMetadata.source_phase40_activation_fingerprint,
      source_phase38_proposal_fingerprint: requestMetadata.source_phase38_proposal_fingerprint,
      source_research_epoch_fingerprint: requestMetadata.source_research_epoch_fingerprint,
      source_phase39_approval_fingerprint: requestMetadata.source_phase39_approval_fingerprint,
      current_baseline_policy_fingerprint: policy.policy_fingerprint,
      successor_challenger_policy_version: requestMetadata.successor_challenger_policy_version,
      exact_tested_incremental_influence_fraction:
        Number(requestMetadata.exact_tested_incremental_influence_fraction),
      independent_approver_attested: true,
      same_actor_as_phase39_approver: false,
      same_actor_as_phase40_canary_activator: false,
      same_actor_as_current_baseline_activator: false,
      exact_tested_composite_confirmed: true,
      flattened_composition_required: true,
      rollback_readiness_confirmed: true,
      approval_is_not_release: true,
      approval_is_not_activation: true,
      activation_requires_separate_explicit_call: true,
      raw_challenger_full_cutover_authorized: false,
      recursive_policy_stack_authorized: false,
      automatic_policy_succession: false,
      automatic_policy_activation: false,
      execution_authorized: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      approved_at: nowIso,
    },
    updated_at: nowIso,
  };
  await upsertRows([row]);
  return {
    success: true,
    contract: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT,
    status: "EXPLICIT_PERSISTENT_POLICY_SUCCESSION_RELEASE_APPROVAL_RECORDED",
    approval_fingerprint: approvalFingerprint,
    approval_is_activation: false,
    automatic_policy_succession: false,
  };
}

export async function releaseAvantiqoPersistentPolicySuccessor({
  approval_fingerprint,
  release_actor_fingerprint,
  release_reason,
  explicit_release_review_completed = false,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }
  const approvalFingerprint = requireFingerprint(approval_fingerprint, "APPROVAL_FINGERPRINT");
  const releaseActorFingerprint = requireFingerprint(
    release_actor_fingerprint,
    "RELEASE_ACTOR_FINGERPRINT",
  );
  const reason = requireReason(release_reason, "RELEASE_REASON");
  if (explicit_release_review_completed !== true) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_EXPLICIT_RELEASE_REVIEW_REQUIRED`);
  }
  const approval = await loadExactMemory(
    organizationId,
    AVANTIQO_PERSISTENT_POLICY_SUCCESSION_APPROVAL_SCOPE,
    "approval_fingerprint",
    approvalFingerprint,
  );
  const approvalMetadata = object(approval?.metadata);
  if (
    !approval ||
    !activeAndUnexpired(approval) ||
    text(approvalMetadata.contract, 180) !== AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT ||
    text(approvalMetadata.status, 180) !==
      "EXPLICIT_PERSISTENT_POLICY_SUCCESSION_RELEASE_APPROVAL_RECORDED" ||
    approvalMetadata.exact_tested_composite_confirmed !== true ||
    approvalMetadata.flattened_composition_required !== true ||
    approvalMetadata.raw_challenger_full_cutover_authorized !== false
  ) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_APPROVAL_NOT_RELEASABLE`);
  }
  const policy = await loadActivePolicy(organizationId);
  if (!validActivePolicy(policy) || policy.policy_fingerprint !== approvalMetadata.current_baseline_policy_fingerprint) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_CURRENT_BASELINE_CHANGED`);
  }
  const nowIso = new Date().toISOString();
  const releaseCandidateFingerprint = digest(
    "phase41-persistent-policy-successor-release",
    approvalFingerprint,
    policy.policy_fingerprint,
    approvalMetadata.source_certification_fingerprint,
    approvalMetadata.successor_challenger_policy_version,
    approvalMetadata.exact_tested_incremental_influence_fraction,
  );
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_RELEASE_SCOPE,
    memory_key: `persistent-policy-successor-release:${releaseCandidateFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Persistent policy successor release ${releaseCandidateFingerprint.slice(0, 16)}`,
    content:
      "Release candidate for separate transactional activation of the exact tested composite successor. It preserves the current persistent policy as rollback parent and never authorizes a raw challenger cutover.",
    importance: 1,
    confidence: 1,
    source: "persistent_policy_succession_release_candidate",
    active: true,
    valid_until: plusDays(nowIso, RELEASE_VALIDITY_DAYS),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT,
      status: "PERSISTENT_POLICY_SUCCESSOR_RELEASE_READY_FOR_SEPARATE_ACTIVATION",
      release_candidate_fingerprint: releaseCandidateFingerprint,
      approval_fingerprint: approvalFingerprint,
      request_fingerprint: approvalMetadata.request_fingerprint,
      release_actor_fingerprint: releaseActorFingerprint,
      release_reason: reason,
      source_certification_fingerprint: approvalMetadata.source_certification_fingerprint,
      source_phase40_activation_fingerprint: approvalMetadata.source_phase40_activation_fingerprint,
      source_phase38_proposal_fingerprint: approvalMetadata.source_phase38_proposal_fingerprint,
      source_research_epoch_fingerprint: approvalMetadata.source_research_epoch_fingerprint,
      current_baseline_policy_fingerprint: policy.policy_fingerprint,
      successor_challenger_policy_version: approvalMetadata.successor_challenger_policy_version,
      exact_tested_incremental_influence_fraction:
        Number(approvalMetadata.exact_tested_incremental_influence_fraction),
      exact_tested_composite_only: true,
      flattened_composition_required: true,
      parent_policy_rollback_required: true,
      atomic_parent_supersession_and_successor_activation_required: true,
      phase36_regression_monitor_must_continue: true,
      release_is_not_activation: true,
      activation_requires_separate_explicit_call: true,
      raw_challenger_full_cutover_authorized: false,
      recursive_policy_stack_authorized: false,
      selected_membership_change_authorized: false,
      source_numeric_score_mutation_authorized: false,
      automatic_policy_succession: false,
      automatic_policy_activation: false,
      execution_authorized: false,
      provider_execution_authorized: false,
      spend_authorized: false,
      released_at: nowIso,
    },
    updated_at: nowIso,
  };
  await upsertRows([row]);
  return {
    success: true,
    contract: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT,
    status: "PERSISTENT_POLICY_SUCCESSOR_RELEASE_READY_FOR_SEPARATE_ACTIVATION",
    release_candidate_fingerprint: releaseCandidateFingerprint,
    release_is_activation: false,
    automatic_policy_succession: false,
  };
}

export async function activateAvantiqoPersistentPolicySuccessor({
  release_candidate_fingerprint,
  activator_fingerprint,
  activation_reason,
  exact_tested_incremental_influence_fraction,
  explicit_activation_review_completed = false,
  rollback_readiness_confirmed = false,
  same_actor_as_phase41_approver = true,
  same_actor_as_phase40_canary_activator = true,
  same_actor_as_current_baseline_activator = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }
  const releaseFingerprint = requireFingerprint(
    release_candidate_fingerprint,
    "RELEASE_CANDIDATE_FINGERPRINT",
  );
  const activatorFingerprint = requireFingerprint(activator_fingerprint, "ACTIVATOR_FINGERPRINT");
  const reason = requireReason(activation_reason, "ACTIVATION_REASON");
  const influence = Number(exact_tested_incremental_influence_fraction);
  if (!Number.isFinite(influence) || influence <= 0 || influence > 0.25) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_INFLUENCE_INVALID`);
  }
  if (explicit_activation_review_completed !== true || rollback_readiness_confirmed !== true) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_ACTIVATION_REVIEW_REQUIRED`);
  }
  if (
    same_actor_as_phase41_approver !== false ||
    same_actor_as_phase40_canary_activator !== false ||
    same_actor_as_current_baseline_activator !== false
  ) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_ACTIVATOR_INDEPENDENCE_REQUIRED`);
  }
  const result = await supabaseAdmin.rpc(ACTIVATE_SUCCESSOR_RPC, {
    p_organization_id: organizationId,
    p_release_candidate_fingerprint: releaseFingerprint,
    p_activator_fingerprint: activatorFingerprint,
    p_activation_reason: reason,
    p_expected_incremental_influence_fraction: influence,
  });
  if (result.error) throw result.error;
  return {
    success: true,
    contract: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT,
    status: "EXPLICIT_PERSISTENT_POLICY_SUCCESSOR_ACTIVATED",
    policy: result.data,
    raw_challenger_full_cutover_authorized: false,
    automatic_policy_succession: false,
    execution_authorized: false,
  };
}

export async function rollbackAvantiqoPersistentPolicySuccessor({
  policy_fingerprint,
  rollback_actor_fingerprint,
  rollback_reason,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }
  const policyFingerprint = requireFingerprint(policy_fingerprint, "POLICY_FINGERPRINT");
  const actorFingerprint = requireFingerprint(
    rollback_actor_fingerprint,
    "ROLLBACK_ACTOR_FINGERPRINT",
  );
  const reason = requireReason(rollback_reason, "ROLLBACK_REASON");
  const result = await supabaseAdmin.rpc(ROLLBACK_PERSISTENT_RPC, {
    p_organization_id: organizationId,
    p_policy_fingerprint: policyFingerprint,
    p_rollback_actor_fingerprint: actorFingerprint,
    p_rollback_reason: reason,
  });
  if (result.error) throw result.error;
  return {
    success: true,
    contract: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT,
    status: "PERSISTENT_POLICY_SUCCESSOR_ROLLED_BACK_TO_PARENT",
    policy: result.data,
    exact_parent_policy_reactivation_required: true,
    automatic_policy_succession: false,
    execution_authorized: false,
  };
}

export const AvantiqoPersistentPolicySuccessionRuntime = Object.freeze({
  contract: AVANTIQO_PERSISTENT_POLICY_SUCCESSION_CONTRACT,
  reconcileRequests: reconcileAvantiqoPersistentPolicySuccessionRequests,
  approve: recordAvantiqoPersistentPolicySuccessionApproval,
  release: releaseAvantiqoPersistentPolicySuccessor,
  activate: activateAvantiqoPersistentPolicySuccessor,
  rollback: rollbackAvantiqoPersistentPolicySuccessor,
});
