import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  assertAvantiqoExperimentSelectionCurrent,
} from "@/lib/intelligence/runtime/AvantiqoActiveExperimentSelectionRuntime";

export const AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT =
  "AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_V1";

const ACTIVE_SELECTION_CONTRACT = "AVANTIQO_ACTIVE_EXPERIMENT_SELECTION_V1";
const RUNPOD_SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const MEMORY_TABLE = "intelligence_memories";
const SELECTION_SCOPE = "platform_learning_active_experiment_selections";
const REQUEST_SCOPE = "platform_learning_experiment_execution_requests";
const APPROVAL_SCOPE = "platform_learning_experiment_execution_approvals";
const MAX_ACTIVE_SELECTIONS = 20;
const MAX_APPROVAL_VALIDITY_MINUTES = 60;
const EXECUTION_MODES = new Set([
  "LOCAL_PROVIDER_FREE",
  "MANAGED_PROVIDER_API",
  "RUNPOD_GPU",
]);

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function normalized(value) {
  return text(value, 4000).toLowerCase();
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function fingerprint(value, code) {
  const candidate = normalized(value);
  if (!/^[a-f0-9]{16,128}$/.test(candidate)) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_${code}_INVALID`,
    );
  }
  return candidate;
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function activeAndUnexpired(row, nowMs = Date.now()) {
  if (row?.active !== true) return false;
  const validUntil = Date.parse(text(row.valid_until, 120));
  return !Number.isFinite(validUntil) || validUntil > nowMs;
}

function validFutureIso(value, code) {
  const candidate = text(value, 120);
  const parsed = Date.parse(candidate);
  if (!candidate || !Number.isFinite(parsed) || parsed <= Date.now()) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_${code}_INVALID`,
    );
  }
  return new Date(parsed).toISOString();
}

function boundedPositiveNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1e12) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_${code}_INVALID`,
    );
  }
  return number;
}

function selectionValid(row, nowMs = Date.now()) {
  const metadata = object(row.metadata);
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
      metadata.experiment_execution_performed_here === false &&
      metadata.runpod_job_submitted === false &&
      Boolean(text(metadata.selection_fingerprint, 128)) &&
      Boolean(text(metadata.experiment_fingerprint, 128)) &&
      Boolean(text(metadata.experiment_version_fingerprint, 128))
  );
}

function executionMode(value) {
  const mode = text(value, 80).toUpperCase();
  if (!EXECUTION_MODES.has(mode)) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_EXECUTION_MODE_INVALID`,
    );
  }
  return mode;
}

function maxApprovalExpiryIso(request, proposedExpiry) {
  const nowMs = Date.now();
  const proposedMs = Date.parse(proposedExpiry);
  const requestExpiryMs = Date.parse(text(request.valid_until, 120));
  const hardMaxMs = nowMs + MAX_APPROVAL_VALIDITY_MINUTES * 60 * 1000;
  const ceilingMs = Number.isFinite(requestExpiryMs)
    ? Math.min(requestExpiryMs, hardMaxMs)
    : hardMaxMs;
  if (!Number.isFinite(proposedMs) || proposedMs <= nowMs || proposedMs > ceilingMs) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_APPROVAL_EXPIRY_EXCEEDS_BOUND`,
    );
  }
  return new Date(proposedMs).toISOString();
}

function requestRow(organizationId, selection, nowIso) {
  const metadata = object(selection.metadata);
  const selectionFingerprint = text(metadata.selection_fingerprint, 128);
  const experimentFingerprint = text(metadata.experiment_fingerprint, 128);
  const versionFingerprint = text(metadata.experiment_version_fingerprint, 128);
  const estimatedCostUnits = Number(metadata.conservative_estimated_cost_units);
  if (!Number.isFinite(estimatedCostUnits) || estimatedCostUnits <= 0) return null;

  const requestFingerprint = digest(
    "experiment-execution-request",
    selectionFingerprint,
    experimentFingerprint,
    versionFingerprint,
  );
  return {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: REQUEST_SCOPE,
    memory_key: `experiment-execution-request:${requestFingerprint.slice(0, 40)}`,
    memory_type: "goal",
    subject: `Experiment execution review ${experimentFingerprint.slice(0, 16)}`,
    content:
      "Governed handoff request for a currently selected experiment. This row is review evidence only. It grants no provider, wallet, RunPod, spend, product-action, knowledge-release or model-training authority.",
    importance: Math.max(0.82, Math.min(0.99, Number(selection.importance || 0.82))),
    confidence: 1,
    source: "active_experiment_execution_governance_handoff",
    active: true,
    valid_until: selection.valid_until || null,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT,
      status: "AWAITING_EXPLICIT_EXPERIMENT_EXECUTION_APPROVAL",
      request_fingerprint: requestFingerprint,
      selection_fingerprint: selectionFingerprint,
      selection_cycle_fingerprint: text(metadata.selection_cycle_fingerprint, 128),
      selection_rank: Number(metadata.selection_rank || 0),
      candidate_family: text(metadata.candidate_family, 40),
      experiment_fingerprint: experimentFingerprint,
      experiment_version_fingerprint: versionFingerprint,
      uncertainty_target_fingerprint: text(
        metadata.uncertainty_target_fingerprint,
        128,
      ),
      transfer_fingerprint: text(metadata.transfer_fingerprint, 128) || null,
      synthesis_fingerprint: text(metadata.synthesis_fingerprint, 128) || null,
      conservative_estimated_cost_units: estimatedCostUnits,
      conservative_estimated_execution_risk: Number(
        metadata.conservative_estimated_execution_risk || 0,
      ),
      risk_adjusted_information_gain_per_cost: Number(
        metadata.risk_adjusted_information_gain_per_cost || 0,
      ),
      selection_is_advisory_only: true,
      explicit_independent_approval_required: true,
      approval_must_bind_exact_experiment_version: true,
      approval_must_expire_with_selection: true,
      one_time_execution_claim_required_after_approval: true,
      direct_execution_from_request_forbidden: true,
      execution_mode_unresolved_until_explicit_approval: true,
      execution_authorized: false,
      provider_execution_authorized: false,
      supplier_spend_authorized: false,
      wallet_reservation_performed: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      runpod_safe_lease_required_if_gpu: true,
      runpod_safe_lease_contract: RUNPOD_SAFE_LEASE_CONTRACT,
      experiment_execution_performed_here: false,
      result_fabricated: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      authorization_value: "none",
      customer_private_content_allowed: false,
      raw_reasoning_persisted: false,
      requested_at: nowIso,
    },
    updated_at: nowIso,
  };
}

async function loadActiveSelections(organizationId) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select(
      "id,memory_key,subject,content,importance,confidence,active,valid_until,metadata,updated_at,created_at",
    )
    .eq("organization_id", organizationId)
    .eq("memory_scope", SELECTION_SCOPE)
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(MAX_ACTIVE_SELECTIONS);
  if (result.error) throw result.error;
  return list(result.data);
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

async function loadRequest(organizationId, requestFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select(
      "id,memory_key,subject,content,active,valid_until,metadata,updated_at,created_at",
    )
    .eq("organization_id", organizationId)
    .eq("memory_scope", REQUEST_SCOPE)
    .eq("metadata->>request_fingerprint", requestFingerprint)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadApproval(organizationId, approvalFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select(
      "id,memory_key,subject,content,active,valid_until,metadata,updated_at,created_at",
    )
    .eq("organization_id", organizationId)
    .eq("memory_scope", APPROVAL_SCOPE)
    .eq("metadata->>approval_fingerprint", approvalFingerprint)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

export async function reconcileAvantiqoExperimentExecutionRequests({
  persist = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    return {
      success: true,
      contract: AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT,
      status: "DISABLED",
      reason: "LEARNING_ORGANIZATION_NOT_CONFIGURED",
      active_selection_count: 0,
      request_count: 0,
    };
  }

  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const selections = (await loadActiveSelections(organizationId)).filter((row) =>
    selectionValid(row, nowMs),
  );
  const requests = selections
    .map((selection) => requestRow(organizationId, selection, nowIso))
    .filter(Boolean);
  const requestWriteCount = persist ? await writeRows(requests) : 0;

  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT,
    status: requests.length
      ? "EXPERIMENT_EXECUTION_APPROVAL_REQUESTS_READY"
      : "NO_CURRENT_SELECTIONS_REQUIRE_EXECUTION_REVIEW",
    active_selection_count: selections.length,
    request_count: requests.length,
    request_write_count: requestWriteCount,
    requests: requests.map((row) => ({
      request_fingerprint: row.metadata.request_fingerprint,
      selection_fingerprint: row.metadata.selection_fingerprint,
      candidate_family: row.metadata.candidate_family,
      experiment_fingerprint: row.metadata.experiment_fingerprint,
      experiment_version_fingerprint:
        row.metadata.experiment_version_fingerprint,
      conservative_estimated_cost_units:
        row.metadata.conservative_estimated_cost_units,
      valid_until: row.valid_until,
    })),
    governance: {
      automatic_approval: false,
      execution_authorized: false,
      provider_execution_authorized: false,
      supplier_spend_authorized: false,
      wallet_reservation_performed: false,
      experiment_execution_performed_here: false,
      runpod_job_submitted: false,
      runpod_endpoint_mutated: false,
      platform_knowledge_written: false,
      automatic_knowledge_promotion: false,
      automatic_training_started: false,
      authorization_effect: "NONE",
    },
  };
}

export async function recordAvantiqoExperimentExecutionApproval({
  request_fingerprint,
  approval_fingerprint,
  approver_fingerprint,
  execution_mode,
  approved_max_cost_units,
  approval_expires_at,
  execution_policy_fingerprint = null,
  independent_approver = false,
  customer_private_content_used = false,
  customer_identifiers_used = false,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`,
    );
  }

  const requestFingerprint = fingerprint(request_fingerprint, "REQUEST_FINGERPRINT");
  const approvalFingerprint = fingerprint(approval_fingerprint, "APPROVAL_FINGERPRINT");
  const approverFingerprint = fingerprint(approver_fingerprint, "APPROVER_FINGERPRINT");
  const mode = executionMode(execution_mode);
  const approvedMaxCostUnits = boundedPositiveNumber(
    approved_max_cost_units,
    "APPROVED_MAX_COST_UNITS",
  );
  const policyFingerprint = execution_policy_fingerprint
    ? fingerprint(execution_policy_fingerprint, "EXECUTION_POLICY_FINGERPRINT")
    : null;

  if (independent_approver !== true) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_INDEPENDENT_APPROVER_REQUIRED`,
    );
  }
  if (customer_private_content_used === true || customer_identifiers_used === true) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_CUSTOMER_PRIVATE_APPROVAL_FORBIDDEN`,
    );
  }
  if (mode !== "LOCAL_PROVIDER_FREE" && !policyFingerprint) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_EXECUTION_POLICY_FINGERPRINT_REQUIRED`,
    );
  }

  const request = await loadRequest(organizationId, requestFingerprint);
  if (!request || !activeAndUnexpired(request)) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_ACTIVE_EXECUTION_REQUEST_NOT_FOUND`,
    );
  }
  const requestMetadata = object(request.metadata);
  if (
    text(requestMetadata.contract, 180) !==
      AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT ||
    text(requestMetadata.status, 180) !==
      "AWAITING_EXPLICIT_EXPERIMENT_EXECUTION_APPROVAL" ||
    requestMetadata.direct_execution_from_request_forbidden !== true ||
    requestMetadata.explicit_independent_approval_required !== true
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_EXECUTION_REQUEST_GOVERNANCE_INVALID`,
    );
  }

  const selectionFingerprint = fingerprint(
    requestMetadata.selection_fingerprint,
    "SELECTION_FINGERPRINT",
  );
  const selection = await assertAvantiqoExperimentSelectionCurrent({
    selection_fingerprint: selectionFingerprint,
  });
  if (
    selection.experiment_fingerprint !==
      text(requestMetadata.experiment_fingerprint, 128) ||
    selection.experiment_version_fingerprint !==
      text(requestMetadata.experiment_version_fingerprint, 128)
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_REQUEST_SELECTION_LINEAGE_MISMATCH`,
    );
  }

  const conservativeCostUnits = Number(
    requestMetadata.conservative_estimated_cost_units,
  );
  if (
    !Number.isFinite(conservativeCostUnits) ||
    approvedMaxCostUnits > conservativeCostUnits
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_APPROVED_COST_EXCEEDS_CONSERVATIVE_ESTIMATE`,
    );
  }

  const requestedExpiry = validFutureIso(
    approval_expires_at,
    "APPROVAL_EXPIRES_AT",
  );
  const approvalExpiry = maxApprovalExpiryIso(request, requestedExpiry);
  const existing = await loadApproval(organizationId, approvalFingerprint);
  if (existing) {
    const metadata = object(existing.metadata);
    const immutableMatch = Boolean(
      text(metadata.request_fingerprint, 128) === requestFingerprint &&
        text(metadata.selection_fingerprint, 128) === selectionFingerprint &&
        text(metadata.approver_fingerprint, 128) === approverFingerprint &&
        text(metadata.execution_mode, 80) === mode &&
        Number(metadata.approved_max_cost_units) === approvedMaxCostUnits &&
        text(metadata.experiment_version_fingerprint, 128) ===
          text(requestMetadata.experiment_version_fingerprint, 128)
    );
    if (!immutableMatch) {
      throw new Error(
        `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_APPROVAL_FINGERPRINT_COLLISION`,
      );
    }
    return {
      success: true,
      contract: AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT,
      status: "EXPERIMENT_EXECUTION_APPROVAL_ALREADY_RECORDED",
      approval: existing,
      idempotent: true,
    };
  }

  const nowIso = new Date().toISOString();
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: APPROVAL_SCOPE,
    memory_key: `experiment-execution-approval:${approvalFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Experiment execution approval ${approvalFingerprint.slice(0, 16)}`,
    content:
      "Explicit independent approval to create one bounded one-time execution claim for the exact selected experiment version. This approval is not itself an execution claim and cannot directly call a provider, reserve a wallet, submit RunPod work, publish knowledge or start training.",
    importance: 0.99,
    confidence: 1,
    source: "explicit_experiment_execution_governance_approval",
    active: true,
    valid_until: approvalExpiry,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT,
      status: "APPROVED_FOR_ONE_TIME_EXECUTION_CLAIM",
      approval_fingerprint: approvalFingerprint,
      request_fingerprint: requestFingerprint,
      selection_fingerprint: selectionFingerprint,
      approver_fingerprint: approverFingerprint,
      independent_approver_attested: true,
      candidate_family: text(requestMetadata.candidate_family, 40),
      experiment_fingerprint: text(requestMetadata.experiment_fingerprint, 128),
      experiment_version_fingerprint: text(
        requestMetadata.experiment_version_fingerprint,
        128,
      ),
      uncertainty_target_fingerprint: text(
        requestMetadata.uncertainty_target_fingerprint,
        128,
      ),
      execution_mode: mode,
      execution_policy_fingerprint: policyFingerprint,
      approved_max_cost_units: approvedMaxCostUnits,
      conservative_estimated_cost_units: conservativeCostUnits,
      approval_expires_at: approvalExpiry,
      one_time_execution_claim_required: true,
      approval_is_not_execution_claim: true,
      approval_replay_after_claim_forbidden: true,
      exact_selection_binding_required_at_claim: true,
      exact_experiment_version_binding_required_at_claim: true,
      direct_provider_call_authorized: false,
      direct_supplier_spend_authorized: false,
      direct_wallet_reservation_authorized: false,
      direct_runpod_call_authorized: false,
      provider_execution_requires_service_runtime_governance:
        mode === "MANAGED_PROVIDER_API",
      provider_execution_requires_wallet_reservation:
        mode === "MANAGED_PROVIDER_API",
      runpod_safe_lease_required: mode === "RUNPOD_GPU",
      runpod_safe_lease_contract:
        mode === "RUNPOD_GPU" ? RUNPOD_SAFE_LEASE_CONTRACT : null,
      runpod_safe_lease_obtained_here: false,
      experiment_execution_performed_here: false,
      result_fabricated: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      customer_private_content_used: false,
      customer_identifiers_used: false,
      raw_reasoning_persisted: false,
      authorization_value: "one_time_execution_claim_only",
      approved_at: nowIso,
    },
    updated_at: nowIso,
  };

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(row)
    .select("id,memory_key,valid_until,metadata")
    .single();
  if (written.error) throw written.error;

  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT,
    status: "APPROVED_FOR_ONE_TIME_EXECUTION_CLAIM",
    approval: written.data,
    governance: {
      approval_is_execution_claim: false,
      direct_provider_call_authorized: false,
      direct_supplier_spend_authorized: false,
      direct_wallet_reservation_authorized: false,
      direct_runpod_call_authorized: false,
      runpod_safe_lease_required: mode === "RUNPOD_GPU",
      runpod_safe_lease_contract:
        mode === "RUNPOD_GPU" ? RUNPOD_SAFE_LEASE_CONTRACT : null,
      experiment_execution_performed: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
    },
  };
}

export async function assertAvantiqoExperimentExecutionApprovalCurrent({
  approval_fingerprint,
  selection_fingerprint,
  experiment_version_fingerprint,
  execution_mode,
  expected_cost_units,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`,
    );
  }

  const approvalFingerprint = fingerprint(
    approval_fingerprint,
    "APPROVAL_FINGERPRINT",
  );
  const expectedSelectionFingerprint = fingerprint(
    selection_fingerprint,
    "SELECTION_FINGERPRINT",
  );
  const expectedVersionFingerprint = fingerprint(
    experiment_version_fingerprint,
    "EXPERIMENT_VERSION_FINGERPRINT",
  );
  const mode = executionMode(execution_mode);
  const expectedCostUnits = boundedPositiveNumber(
    expected_cost_units,
    "EXPECTED_COST_UNITS",
  );

  const approval = await loadApproval(organizationId, approvalFingerprint);
  if (!approval || !activeAndUnexpired(approval)) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_ACTIVE_APPROVAL_NOT_FOUND`,
    );
  }
  const metadata = object(approval.metadata);
  if (
    text(metadata.contract, 180) !==
      AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT ||
    text(metadata.status, 180) !== "APPROVED_FOR_ONE_TIME_EXECUTION_CLAIM" ||
    metadata.one_time_execution_claim_required !== true ||
    metadata.approval_is_not_execution_claim !== true ||
    metadata.direct_provider_call_authorized !== false ||
    metadata.direct_runpod_call_authorized !== false
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_APPROVAL_GOVERNANCE_INVALID`,
    );
  }
  if (
    text(metadata.selection_fingerprint, 128) !== expectedSelectionFingerprint ||
    text(metadata.experiment_version_fingerprint, 128) !== expectedVersionFingerprint ||
    text(metadata.execution_mode, 80) !== mode
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_APPROVAL_BINDING_MISMATCH`,
    );
  }
  if (expectedCostUnits > Number(metadata.approved_max_cost_units)) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_EXPECTED_COST_EXCEEDS_APPROVAL`,
    );
  }

  const selection = await assertAvantiqoExperimentSelectionCurrent({
    selection_fingerprint: expectedSelectionFingerprint,
  });
  if (selection.experiment_version_fingerprint !== expectedVersionFingerprint) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT}_APPROVAL_SELECTION_VERSION_STALE`,
    );
  }

  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT,
    status: "APPROVAL_CURRENT_FOR_ONE_TIME_EXECUTION_CLAIM",
    approval_fingerprint: approvalFingerprint,
    selection_fingerprint: expectedSelectionFingerprint,
    experiment_fingerprint: text(metadata.experiment_fingerprint, 128),
    experiment_version_fingerprint: expectedVersionFingerprint,
    execution_mode: mode,
    expected_cost_units: expectedCostUnits,
    approved_max_cost_units: Number(metadata.approved_max_cost_units),
    allowed_to_create_one_time_execution_claim: true,
    approval_is_execution_claim: false,
    direct_provider_call_authorized: false,
    direct_supplier_spend_authorized: false,
    direct_wallet_reservation_authorized: false,
    direct_runpod_call_authorized: false,
    provider_service_runtime_governance_required:
      mode === "MANAGED_PROVIDER_API",
    provider_wallet_reservation_required: mode === "MANAGED_PROVIDER_API",
    runpod_safe_lease_required: mode === "RUNPOD_GPU",
    runpod_safe_lease_contract:
      mode === "RUNPOD_GPU" ? RUNPOD_SAFE_LEASE_CONTRACT : null,
    runpod_safe_lease_obtained_here: false,
    experiment_execution_performed_here: false,
    result_fabricated: false,
    reusable_platform_knowledge: false,
    authorization_effect: "ONE_TIME_EXECUTION_CLAIM_CREATION_ONLY",
  };
}

export const AvantiqoExperimentExecutionGovernanceRuntime = Object.freeze({
  contract: AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT,
  reconcileRequests: reconcileAvantiqoExperimentExecutionRequests,
  recordApproval: recordAvantiqoExperimentExecutionApproval,
  assertApprovalCurrent: assertAvantiqoExperimentExecutionApprovalCurrent,
  executionModes: Object.freeze([...EXECUTION_MODES]),
  runpodSafeLeaseContract: RUNPOD_SAFE_LEASE_CONTRACT,
});
