import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  assertAvantiqoExperimentExecutionApprovalCurrent,
} from "@/lib/intelligence/runtime/AvantiqoExperimentExecutionGovernanceRuntime";

export const AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT =
  "AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_V1";

const MEMORY_TABLE = "intelligence_memories";
const APPROVAL_SCOPE = "platform_learning_experiment_execution_approvals";
const CLAIM_SCOPE = "platform_learning_experiment_execution_claims";
const RUNPOD_SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const CLAIM_VALIDITY_MINUTES = 10;
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
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_${code}_INVALID`);
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

function executionMode(value) {
  const mode = text(value, 80).toUpperCase();
  if (!EXECUTION_MODES.has(mode)) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_EXECUTION_MODE_INVALID`);
  }
  return mode;
}

function boundedPositiveNumber(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > 1e12) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_${code}_INVALID`);
  }
  return number;
}

function plusMinutes(value, minutes) {
  const date = new Date(value);
  date.setUTCMinutes(date.getUTCMinutes() + minutes);
  return date.toISOString();
}

async function loadApproval(organizationId, approvalFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", APPROVAL_SCOPE)
    .eq("metadata->>approval_fingerprint", approvalFingerprint)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadClaim(organizationId, claimFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", CLAIM_SCOPE)
    .eq("metadata->>claim_fingerprint", claimFingerprint)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

function claimExpiry(approval) {
  const nowIso = new Date().toISOString();
  const hardExpiryMs = Date.parse(plusMinutes(nowIso, CLAIM_VALIDITY_MINUTES));
  const approvalExpiryMs = Date.parse(text(approval.valid_until, 120));
  const expiryMs = Number.isFinite(approvalExpiryMs)
    ? Math.min(hardExpiryMs, approvalExpiryMs)
    : hardExpiryMs;
  if (expiryMs <= Date.now()) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_APPROVAL_EXPIRES_TOO_SOON`);
  }
  return new Date(expiryMs).toISOString();
}

function assertModePrerequisites({
  mode,
  provider_service_runtime_authorization_fingerprint,
  wallet_reservation_fingerprint,
  runpod_safe_lease_fingerprint,
}) {
  const providerAuthorization = provider_service_runtime_authorization_fingerprint
    ? fingerprint(
        provider_service_runtime_authorization_fingerprint,
        "PROVIDER_SERVICE_RUNTIME_AUTHORIZATION_FINGERPRINT",
      )
    : null;
  const walletReservation = wallet_reservation_fingerprint
    ? fingerprint(wallet_reservation_fingerprint, "WALLET_RESERVATION_FINGERPRINT")
    : null;
  const runpodSafeLease = runpod_safe_lease_fingerprint
    ? fingerprint(runpod_safe_lease_fingerprint, "RUNPOD_SAFE_LEASE_FINGERPRINT")
    : null;

  if (mode === "LOCAL_PROVIDER_FREE") {
    if (providerAuthorization || walletReservation || runpodSafeLease) {
      throw new Error(
        `${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_LOCAL_MODE_EXTERNAL_AUTHORIZATION_FORBIDDEN`,
      );
    }
  }
  if (mode === "MANAGED_PROVIDER_API") {
    if (!providerAuthorization || !walletReservation || runpodSafeLease) {
      throw new Error(
        `${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_PROVIDER_MODE_PREREQUISITES_INVALID`,
      );
    }
  }
  if (mode === "RUNPOD_GPU") {
    if (!runpodSafeLease || providerAuthorization || walletReservation) {
      throw new Error(
        `${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_RUNPOD_MODE_PREREQUISITES_INVALID`,
      );
    }
  }

  return {
    provider_service_runtime_authorization_fingerprint: providerAuthorization,
    wallet_reservation_fingerprint: walletReservation,
    runpod_safe_lease_fingerprint: runpodSafeLease,
  };
}

export async function createAvantiqoExperimentExecutionClaim({
  approval_fingerprint,
  claim_fingerprint,
  executor_fingerprint,
  selection_fingerprint,
  experiment_version_fingerprint,
  execution_mode,
  expected_cost_units,
  provider_service_runtime_authorization_fingerprint = null,
  wallet_reservation_fingerprint = null,
  runpod_safe_lease_fingerprint = null,
  customer_private_content_used = false,
  customer_identifiers_used = false,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }

  const approvalFingerprint = fingerprint(approval_fingerprint, "APPROVAL_FINGERPRINT");
  const claimFingerprint = fingerprint(claim_fingerprint, "CLAIM_FINGERPRINT");
  const executorFingerprint = fingerprint(executor_fingerprint, "EXECUTOR_FINGERPRINT");
  const selectionFingerprint = fingerprint(selection_fingerprint, "SELECTION_FINGERPRINT");
  const versionFingerprint = fingerprint(
    experiment_version_fingerprint,
    "EXPERIMENT_VERSION_FINGERPRINT",
  );
  const mode = executionMode(execution_mode);
  const expectedCostUnits = boundedPositiveNumber(expected_cost_units, "EXPECTED_COST_UNITS");

  if (customer_private_content_used === true || customer_identifiers_used === true) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_CUSTOMER_PRIVATE_CLAIM_FORBIDDEN`);
  }

  const approvalState = await assertAvantiqoExperimentExecutionApprovalCurrent({
    approval_fingerprint: approvalFingerprint,
    selection_fingerprint: selectionFingerprint,
    experiment_version_fingerprint: versionFingerprint,
    execution_mode: mode,
    expected_cost_units: expectedCostUnits,
  });
  if (approvalState.allowed_to_create_one_time_execution_claim !== true) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_APPROVAL_NOT_CLAIMABLE`);
  }

  const approval = await loadApproval(organizationId, approvalFingerprint);
  if (!approval || !activeAndUnexpired(approval)) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_ACTIVE_APPROVAL_NOT_FOUND`);
  }
  const approvalMetadata = object(approval.metadata);
  if (
    text(approvalMetadata.status, 180) !== "APPROVED_FOR_ONE_TIME_EXECUTION_CLAIM" ||
    approvalMetadata.one_time_execution_claim_required !== true ||
    approvalMetadata.approval_replay_after_claim_forbidden !== true
  ) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_APPROVAL_GOVERNANCE_INVALID`);
  }

  const modePrerequisites = assertModePrerequisites({
    mode,
    provider_service_runtime_authorization_fingerprint,
    wallet_reservation_fingerprint,
    runpod_safe_lease_fingerprint,
  });

  const existing = await loadClaim(organizationId, claimFingerprint);
  if (existing) {
    const metadata = object(existing.metadata);
    const immutableMatch = Boolean(
      text(metadata.approval_fingerprint, 128) === approvalFingerprint &&
        text(metadata.selection_fingerprint, 128) === selectionFingerprint &&
        text(metadata.experiment_version_fingerprint, 128) === versionFingerprint &&
        text(metadata.executor_fingerprint, 128) === executorFingerprint &&
        text(metadata.execution_mode, 80) === mode &&
        Number(metadata.expected_cost_units) === expectedCostUnits
    );
    if (!immutableMatch) {
      throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_CLAIM_FINGERPRINT_COLLISION`);
    }
    return {
      success: true,
      contract: AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT,
      status: text(metadata.status, 180),
      claim: existing,
      idempotent: true,
    };
  }

  const duplicateApprovalClaim = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata")
    .eq("organization_id", organizationId)
    .eq("memory_scope", CLAIM_SCOPE)
    .eq("metadata->>approval_fingerprint", approvalFingerprint)
    .limit(1);
  if (duplicateApprovalClaim.error) throw duplicateApprovalClaim.error;
  if ((duplicateApprovalClaim.data || []).length > 0) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_APPROVAL_ALREADY_HAS_EXECUTION_CLAIM`);
  }

  const nowIso = new Date().toISOString();
  const expiresAt = claimExpiry(approval);
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: CLAIM_SCOPE,
    memory_key: `experiment-execution-claim:${claimFingerprint.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `One-time experiment execution claim ${claimFingerprint.slice(0, 16)}`,
    content:
      "Single-use execution claim bound to one current approval, one exact experiment version, one execution mode, one executor and one cost ceiling. Consumption is an atomic active-to-consumed transition; this claim cannot be replayed.",
    importance: 1,
    confidence: 1,
    source: "one_time_experiment_execution_claim",
    active: true,
    valid_until: expiresAt,
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT,
      status: "READY_FOR_SINGLE_EXECUTION_CONSUMPTION",
      claim_fingerprint: claimFingerprint,
      approval_fingerprint: approvalFingerprint,
      request_fingerprint: text(approvalMetadata.request_fingerprint, 128),
      selection_fingerprint: selectionFingerprint,
      experiment_fingerprint: text(approvalMetadata.experiment_fingerprint, 128),
      experiment_version_fingerprint: versionFingerprint,
      executor_fingerprint: executorFingerprint,
      execution_mode: mode,
      expected_cost_units: expectedCostUnits,
      approved_max_cost_units: Number(approvalMetadata.approved_max_cost_units),
      ...modePrerequisites,
      runpod_safe_lease_contract: mode === "RUNPOD_GPU" ? RUNPOD_SAFE_LEASE_CONTRACT : null,
      single_use: true,
      atomic_consumption_required: true,
      replay_forbidden: true,
      exact_executor_binding_required: true,
      exact_experiment_version_binding_required: true,
      execution_receipt_required_on_consumption: true,
      claim_creation_executes_experiment: false,
      claim_creation_calls_provider: false,
      claim_creation_reserves_wallet: false,
      claim_creation_submits_runpod_job: false,
      result_fabricated: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      customer_private_content_used: false,
      customer_identifiers_used: false,
      raw_reasoning_persisted: false,
      authorization_value: "single_execution_attempt_only",
      created_at: nowIso,
      consumed_at: null,
      execution_receipt_fingerprint: null,
    },
    updated_at: nowIso,
  };

  const written = await supabaseAdmin
    .from(MEMORY_TABLE)
    .insert(row)
    .select("id,memory_key,active,valid_until,metadata")
    .single();
  if (written.error) throw written.error;

  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT,
    status: "READY_FOR_SINGLE_EXECUTION_CONSUMPTION",
    claim: written.data,
    governance: {
      single_use: true,
      atomic_consumption_required: true,
      replay_forbidden: true,
      claim_creation_executes_experiment: false,
      provider_called: false,
      wallet_reservation_performed_here: false,
      runpod_job_submitted: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
    },
  };
}

export async function consumeAvantiqoExperimentExecutionClaim({
  claim_fingerprint,
  executor_fingerprint,
  execution_receipt_fingerprint,
  actual_cost_units,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }

  const claimFingerprint = fingerprint(claim_fingerprint, "CLAIM_FINGERPRINT");
  const executorFingerprint = fingerprint(executor_fingerprint, "EXECUTOR_FINGERPRINT");
  const receiptFingerprint = fingerprint(
    execution_receipt_fingerprint,
    "EXECUTION_RECEIPT_FINGERPRINT",
  );
  const actualCostUnits = Number(actual_cost_units);
  if (!Number.isFinite(actualCostUnits) || actualCostUnits < 0 || actualCostUnits > 1e12) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_ACTUAL_COST_UNITS_INVALID`);
  }

  const claim = await loadClaim(organizationId, claimFingerprint);
  if (!claim || !activeAndUnexpired(claim)) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_ACTIVE_CLAIM_NOT_FOUND`);
  }
  const metadata = object(claim.metadata);
  if (
    text(metadata.contract, 180) !== AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT ||
    text(metadata.status, 180) !== "READY_FOR_SINGLE_EXECUTION_CONSUMPTION" ||
    metadata.single_use !== true ||
    metadata.atomic_consumption_required !== true ||
    metadata.replay_forbidden !== true ||
    text(metadata.executor_fingerprint, 128) !== executorFingerprint
  ) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_CLAIM_GOVERNANCE_INVALID`);
  }
  if (actualCostUnits > Number(metadata.approved_max_cost_units)) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_ACTUAL_COST_EXCEEDS_APPROVAL`);
  }

  const nowIso = new Date().toISOString();
  const consumedMetadata = {
    ...metadata,
    status: "CONSUMED_SINGLE_EXECUTION_CLAIM",
    consumed_at: nowIso,
    execution_receipt_fingerprint: receiptFingerprint,
    actual_cost_units: actualCostUnits,
    active_execution_authority_remaining: false,
    replay_forbidden: true,
  };

  const consumed = await supabaseAdmin
    .from(MEMORY_TABLE)
    .update({
      active: false,
      forgotten_at: nowIso,
      metadata: consumedMetadata,
      updated_at: nowIso,
    })
    .eq("id", claim.id)
    .eq("organization_id", organizationId)
    .eq("memory_scope", CLAIM_SCOPE)
    .eq("active", true)
    .eq("metadata->>claim_fingerprint", claimFingerprint)
    .eq("metadata->>status", "READY_FOR_SINGLE_EXECUTION_CONSUMPTION")
    .select("id,memory_key,active,metadata");
  if (consumed.error) throw consumed.error;
  if (!Array.isArray(consumed.data) || consumed.data.length !== 1) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_CLAIM_ALREADY_CONSUMED_OR_RACE_LOST`);
  }

  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT,
    status: "CONSUMED_SINGLE_EXECUTION_CLAIM",
    claim_fingerprint: claimFingerprint,
    execution_receipt_fingerprint: receiptFingerprint,
    actual_cost_units: actualCostUnits,
    active_execution_authority_remaining: false,
    replay_allowed: false,
    atomic_consumption_succeeded: true,
    result_recorded_here: false,
    platform_knowledge_written: false,
    automatic_training_started: false,
  };
}

export async function assertAvantiqoExperimentExecutionClaimCurrent({
  claim_fingerprint,
  executor_fingerprint,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }
  const claimFingerprint = fingerprint(claim_fingerprint, "CLAIM_FINGERPRINT");
  const executorFingerprint = fingerprint(executor_fingerprint, "EXECUTOR_FINGERPRINT");
  const claim = await loadClaim(organizationId, claimFingerprint);
  if (!claim || !activeAndUnexpired(claim)) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_ACTIVE_CLAIM_NOT_FOUND`);
  }
  const metadata = object(claim.metadata);
  if (
    text(metadata.contract, 180) !== AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT ||
    text(metadata.status, 180) !== "READY_FOR_SINGLE_EXECUTION_CONSUMPTION" ||
    metadata.single_use !== true ||
    metadata.replay_forbidden !== true ||
    text(metadata.executor_fingerprint, 128) !== executorFingerprint
  ) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT}_CLAIM_NOT_CURRENT`);
  }
  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT,
    status: "CURRENT_SINGLE_USE_EXECUTION_CLAIM",
    claim_fingerprint: claimFingerprint,
    approval_fingerprint: text(metadata.approval_fingerprint, 128),
    selection_fingerprint: text(metadata.selection_fingerprint, 128),
    experiment_fingerprint: text(metadata.experiment_fingerprint, 128),
    experiment_version_fingerprint: text(metadata.experiment_version_fingerprint, 128),
    executor_fingerprint: executorFingerprint,
    execution_mode: text(metadata.execution_mode, 80),
    expected_cost_units: Number(metadata.expected_cost_units),
    approved_max_cost_units: Number(metadata.approved_max_cost_units),
    provider_service_runtime_authorization_fingerprint: text(
      metadata.provider_service_runtime_authorization_fingerprint,
      128,
    ) || null,
    wallet_reservation_fingerprint: text(metadata.wallet_reservation_fingerprint, 128) || null,
    runpod_safe_lease_fingerprint: text(metadata.runpod_safe_lease_fingerprint, 128) || null,
    runpod_safe_lease_contract: text(metadata.runpod_safe_lease_contract, 180) || null,
    allowed_single_execution_attempt: true,
    replay_allowed: false,
    execution_result_recorded_here: false,
    reusable_platform_knowledge: false,
    authorization_effect: "ONE_SINGLE_EXECUTION_ATTEMPT_ONLY",
  };
}

export const AvantiqoExperimentExecutionClaimRuntime = Object.freeze({
  contract: AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT,
  createClaim: createAvantiqoExperimentExecutionClaim,
  assertClaimCurrent: assertAvantiqoExperimentExecutionClaimCurrent,
  consumeClaim: consumeAvantiqoExperimentExecutionClaim,
  runpodSafeLeaseContract: RUNPOD_SAFE_LEASE_CONTRACT,
});
