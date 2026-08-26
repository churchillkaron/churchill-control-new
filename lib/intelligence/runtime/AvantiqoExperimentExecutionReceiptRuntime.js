import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT,
  assertAvantiqoExternalEvidenceModeIsolation,
  verifyAvantiqoManagedProviderSettlementEvidence,
  verifyAvantiqoRunpodJobEvidence,
} from "@/lib/intelligence/runtime/AvantiqoExperimentExternalExecutionEvidenceRuntime";

export const AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT =
  "AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_V1";

const CLAIM_CONTRACT = "AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_V1";
const MEMORY_TABLE = "intelligence_memories";
const CLAIM_SCOPE = "platform_learning_experiment_execution_claims";
const RECEIPT_SCOPE = "platform_learning_experiment_execution_receipts";
const RECEIPT_RETENTION_DAYS = 730;
const CLAIM_START_CLOCK_SKEW_MINUTES = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalized(value) {
  return text(value, 4000).toLowerCase();
}

function fingerprint(value, code) {
  const candidate = normalized(value);
  if (!/^[a-f0-9]{16,128}$/.test(candidate)) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_${code}_INVALID`);
  }
  return candidate;
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function boundedCost(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1e12) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_${code}_INVALID`);
  }
  return number;
}

function validIso(value, code) {
  const candidate = text(value, 120);
  const parsed = Date.parse(candidate);
  if (!candidate || !Number.isFinite(parsed)) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_${code}_INVALID`);
  }
  if (parsed > Date.now() + 5 * 60 * 1000) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_${code}_FUTURE`);
  }
  return new Date(parsed).toISOString();
}

async function loadConsumedClaim(organizationId, claimFingerprint) {
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

async function loadReceipt(organizationId, receiptFingerprint) {
  const result = await supabaseAdmin
    .from(MEMORY_TABLE)
    .select("id,memory_key,active,valid_until,metadata,updated_at,created_at")
    .eq("organization_id", organizationId)
    .eq("memory_scope", RECEIPT_SCOPE)
    .eq("metadata->>execution_receipt_fingerprint", receiptFingerprint)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

function exactOptionalBinding(expected, actual, code) {
  const left = text(expected, 240);
  const right = text(actual, 240);
  if (!left || left !== right) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_${code}_MISMATCH`);
  }
}

export async function recordAvantiqoExperimentExecutionReceipt({
  execution_receipt_fingerprint,
  claim_fingerprint,
  executor_fingerprint,
  experiment_fingerprint,
  experiment_version_fingerprint,
  evidence_fingerprint,
  measurement_fingerprint,
  execution_mode,
  actual_cost_units,
  execution_started_at,
  execution_completed_at,
  executed_at = null,
  execution_status = "COMPLETED",
  service_usage_id = null,
  wallet_reservation_transaction_id = null,
  wallet_charge_transaction_id = null,
  runpod_endpoint_id = null,
  runpod_job_id = null,
  provider_execution_fingerprint = null,
  wallet_charge_fingerprint = null,
  runpod_job_fingerprint = null,
  customer_private_content_used = false,
  customer_identifiers_used = false,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }

  const receiptFingerprint = fingerprint(execution_receipt_fingerprint, "EXECUTION_RECEIPT_FINGERPRINT");
  const claimFingerprint = fingerprint(claim_fingerprint, "CLAIM_FINGERPRINT");
  const executorFingerprint = fingerprint(executor_fingerprint, "EXECUTOR_FINGERPRINT");
  const experimentFingerprint = fingerprint(experiment_fingerprint, "EXPERIMENT_FINGERPRINT");
  const versionFingerprint = fingerprint(experiment_version_fingerprint, "EXPERIMENT_VERSION_FINGERPRINT");
  const evidenceFingerprint = fingerprint(evidence_fingerprint, "EVIDENCE_FINGERPRINT");
  const measurementFingerprint = fingerprint(measurement_fingerprint, "MEASUREMENT_FINGERPRINT");
  const actualCostUnits = boundedCost(actual_cost_units, "ACTUAL_COST_UNITS");
  const executionStartedAt = validIso(execution_started_at, "EXECUTION_STARTED_AT");
  const executionCompletedAt = validIso(execution_completed_at, "EXECUTION_COMPLETED_AT");
  const legacyExecutedAt = executed_at ? validIso(executed_at, "EXECUTED_AT") : null;
  if (legacyExecutedAt && legacyExecutedAt !== executionCompletedAt) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_EXECUTED_AT_MUST_EQUAL_COMPLETION`);
  }
  if (Date.parse(executionCompletedAt) < Date.parse(executionStartedAt)) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_COMPLETION_BEFORE_START`);
  }

  const mode = text(execution_mode, 80).toUpperCase();
  const status = text(execution_status, 80).toUpperCase();
  if (!["LOCAL_PROVIDER_FREE", "MANAGED_PROVIDER_API", "RUNPOD_GPU"].includes(mode)) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_EXECUTION_MODE_INVALID`);
  }
  if (!["COMPLETED", "FAILED", "CANCELLED_AFTER_START"].includes(status)) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_EXECUTION_STATUS_INVALID`);
  }
  if (customer_private_content_used === true || customer_identifiers_used === true) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_CUSTOMER_PRIVATE_RECEIPT_FORBIDDEN`);
  }

  assertAvantiqoExternalEvidenceModeIsolation({
    execution_mode: mode,
    service_usage_id,
    wallet_reservation_transaction_id,
    wallet_charge_transaction_id,
    runpod_endpoint_id,
    runpod_job_id,
  });

  const claim = await loadConsumedClaim(organizationId, claimFingerprint);
  if (!claim) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_CONSUMED_CLAIM_NOT_FOUND`);
  }
  const claimMetadata = object(claim.metadata);
  if (
    text(claimMetadata.contract, 180) !== CLAIM_CONTRACT ||
    text(claimMetadata.status, 180) !== "CONSUMED_SINGLE_EXECUTION_CLAIM" ||
    claim.active !== false ||
    claimMetadata.active_execution_authority_remaining !== false ||
    claimMetadata.replay_forbidden !== true ||
    claimMetadata.external_claim_evidence_verified !== true ||
    claimMetadata.caller_supplied_fingerprint_is_authority !== false ||
    text(claimMetadata.execution_receipt_fingerprint, 128) !== receiptFingerprint
  ) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_CLAIM_RECEIPT_BINDING_INVALID`);
  }
  if (
    text(claimMetadata.executor_fingerprint, 128) !== executorFingerprint ||
    text(claimMetadata.experiment_fingerprint, 128) !== experimentFingerprint ||
    text(claimMetadata.experiment_version_fingerprint, 128) !== versionFingerprint ||
    text(claimMetadata.execution_mode, 80) !== mode ||
    Number(claimMetadata.actual_cost_units) !== actualCostUnits
  ) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_CLAIM_PROVENANCE_MISMATCH`);
  }

  const consumedAt = Date.parse(text(claimMetadata.consumed_at, 120));
  const startedAt = Date.parse(executionStartedAt);
  const startWindowMs = CLAIM_START_CLOCK_SKEW_MINUTES * 60 * 1000;
  if (!Number.isFinite(consumedAt) || startedAt < consumedAt - startWindowMs || startedAt > consumedAt + startWindowMs) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_EXECUTION_START_OUTSIDE_CLAIM_CONSUMPTION_WINDOW`);
  }

  let providerFingerprint = null;
  let walletFingerprint = null;
  let runpodFingerprint = null;
  let externalEvidence = {
    external_execution_evidence_contract:
      AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT,
    external_execution_evidence_verified: true,
    caller_supplied_fingerprint_is_authority: false,
    service_usage_id: null,
    wallet_reservation_transaction_id: null,
    wallet_charge_transaction_id: null,
    runpod_endpoint_id: null,
    runpod_job_id: null,
    service_runtime_execution_ledger_verified: false,
    wallet_settlement_ledger_verified: false,
    runpod_status_api_verified: false,
  };

  if (mode === "LOCAL_PROVIDER_FREE") {
    if (
      provider_execution_fingerprint ||
      wallet_charge_fingerprint ||
      runpod_job_fingerprint ||
      service_usage_id ||
      wallet_reservation_transaction_id ||
      wallet_charge_transaction_id ||
      runpod_endpoint_id ||
      runpod_job_id
    ) {
      throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_LOCAL_MODE_EXTERNAL_EXECUTION_EVIDENCE_FORBIDDEN`);
    }
  } else if (mode === "MANAGED_PROVIDER_API") {
    if (!service_usage_id || !wallet_reservation_transaction_id || !wallet_charge_transaction_id) {
      throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_PROVIDER_LEDGER_IDENTIFIERS_REQUIRED`);
    }
    exactOptionalBinding(claimMetadata.service_usage_id, service_usage_id, "SERVICE_USAGE_ID");
    exactOptionalBinding(
      claimMetadata.wallet_reservation_transaction_id,
      wallet_reservation_transaction_id,
      "WALLET_RESERVATION_TRANSACTION_ID",
    );
    const verified = await verifyAvantiqoManagedProviderSettlementEvidence({
      service_usage_id,
      wallet_reservation_transaction_id,
      wallet_charge_transaction_id,
      actual_cost_units: actualCostUnits,
      execution_started_at: executionStartedAt,
      execution_completed_at: executionCompletedAt,
      execution_status: status,
      provider_execution_fingerprint,
      wallet_charge_fingerprint,
    });
    providerFingerprint = verified.provider_execution_fingerprint;
    walletFingerprint = verified.wallet_charge_fingerprint;
    externalEvidence = {
      ...externalEvidence,
      service_usage_id: verified.service_usage_id,
      wallet_reservation_transaction_id: verified.wallet_reservation_transaction_id,
      wallet_charge_transaction_id: verified.wallet_charge_transaction_id,
      service_runtime_execution_ledger_verified:
        verified.service_runtime_execution_ledger_verified === true,
      wallet_settlement_ledger_verified: verified.wallet_settlement_ledger_verified === true,
      provider_request_id: verified.provider_request_id,
      provider_response_id: verified.provider_response_id,
      provider_model: verified.provider_model,
      settlement_amount: verified.settlement_amount,
      settlement_currency: verified.settlement_currency,
    };
  } else {
    if (!runpod_endpoint_id || !runpod_job_id) {
      throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_RUNPOD_JOB_IDENTIFIERS_REQUIRED`);
    }
    exactOptionalBinding(claimMetadata.runpod_endpoint_id, runpod_endpoint_id, "RUNPOD_ENDPOINT_ID");
    const verified = await verifyAvantiqoRunpodJobEvidence({
      runpod_endpoint_id,
      runpod_job_id,
      execution_status: status,
      runpod_job_fingerprint,
    });
    runpodFingerprint = verified.runpod_job_fingerprint;
    externalEvidence = {
      ...externalEvidence,
      runpod_endpoint_id: verified.runpod_endpoint_id,
      runpod_job_id: verified.runpod_job_id,
      runpod_job_status: verified.runpod_job_status,
      runpod_execution_time_ms: verified.runpod_execution_time_ms,
      runpod_delay_time_ms: verified.runpod_delay_time_ms,
      runpod_status_api_verified: verified.runpod_status_api_verified === true,
      runpod_safe_lease_fingerprint: text(claimMetadata.runpod_safe_lease_fingerprint, 128),
      runpod_safe_lease_contract: text(claimMetadata.runpod_safe_lease_contract, 180),
      runpod_safe_lease_was_verified_at_claim_creation:
        claimMetadata.runpod_safe_lease_environment_verified === true,
      runpod_safe_lease_db_persisted: claimMetadata.runpod_safe_lease_db_persisted === true,
      runpod_safe_lease_revalidation_at_completion_required: false,
    };
  }

  const existing = await loadReceipt(organizationId, receiptFingerprint);
  if (existing) {
    const metadata = object(existing.metadata);
    const immutableMatch = Boolean(
      text(metadata.claim_fingerprint, 128) === claimFingerprint &&
      text(metadata.executor_fingerprint, 128) === executorFingerprint &&
      text(metadata.experiment_fingerprint, 128) === experimentFingerprint &&
      text(metadata.experiment_version_fingerprint, 128) === versionFingerprint &&
      text(metadata.evidence_fingerprint, 128) === evidenceFingerprint &&
      text(metadata.measurement_fingerprint, 128) === measurementFingerprint &&
      text(metadata.execution_mode, 80) === mode &&
      Number(metadata.actual_cost_units) === actualCostUnits &&
      text(metadata.execution_status, 80) === status &&
      text(metadata.execution_started_at, 120) === executionStartedAt &&
      text(metadata.execution_completed_at, 120) === executionCompletedAt
    );
    if (!immutableMatch) {
      throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_RECEIPT_FINGERPRINT_COLLISION`);
    }
    return {
      success: true,
      contract: AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT,
      status: "EXECUTION_RECEIPT_ALREADY_RECORDED",
      receipt: existing,
      idempotent: true,
    };
  }

  const receiptIdentity = digest(
    "execution-receipt",
    receiptFingerprint,
    claimFingerprint,
    experimentFingerprint,
    versionFingerprint,
    evidenceFingerprint,
    measurementFingerprint,
    mode,
    actualCostUnits,
    status,
    executionStartedAt,
    executionCompletedAt,
    providerFingerprint,
    walletFingerprint,
    runpodFingerprint,
  );
  const nowIso = new Date().toISOString();
  const row = {
    organization_id: organizationId,
    party_id: null,
    entity_id: null,
    conversation_id: null,
    source_turn_id: null,
    memory_scope: RECEIPT_SCOPE,
    memory_key: `experiment-execution-receipt:${receiptIdentity.slice(0, 40)}`,
    memory_type: "evidence",
    subject: `Experiment execution receipt ${receiptFingerprint.slice(0, 16)}`,
    content:
      "Immutable execution receipt bound to one consumed single-use claim. External provider settlement is verified against Service Runtime and wallet ledgers; RunPod jobs are verified against the RunPod status API. Caller fingerprints are never authority. The execution start is claim-window bound while completion may occur later.",
    importance: 1,
    confidence: 1,
    source: "experiment_execution_receipt_provenance",
    active: true,
    valid_until: new Date(Date.parse(executionCompletedAt) + RECEIPT_RETENTION_DAYS * DAY_MS).toISOString(),
    superseded_by: null,
    superseded_at: null,
    forgotten_at: null,
    metadata: {
      contract: AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT,
      status: "IMMUTABLE_EXECUTION_RECEIPT_RECORDED",
      execution_receipt_fingerprint: receiptFingerprint,
      receipt_identity_fingerprint: receiptIdentity,
      claim_contract: CLAIM_CONTRACT,
      claim_fingerprint: claimFingerprint,
      approval_fingerprint: text(claimMetadata.approval_fingerprint, 128),
      selection_fingerprint: text(claimMetadata.selection_fingerprint, 128),
      executor_fingerprint: executorFingerprint,
      experiment_fingerprint: experimentFingerprint,
      experiment_version_fingerprint: versionFingerprint,
      execution_mode: mode,
      execution_status: status,
      evidence_fingerprint: evidenceFingerprint,
      measurement_fingerprint: measurementFingerprint,
      actual_cost_units: actualCostUnits,
      provider_execution_fingerprint: providerFingerprint,
      wallet_charge_fingerprint: walletFingerprint,
      runpod_job_fingerprint: runpodFingerprint,
      ...externalEvidence,
      execution_started_at: executionStartedAt,
      execution_completed_at: executionCompletedAt,
      executed_at: executionCompletedAt,
      executed_at_is_completion_alias: true,
      claim_consumed_at: text(claimMetadata.consumed_at, 120),
      execution_start_bound_to_claim_consumption: true,
      long_running_execution_completion_allowed: true,
      completion_has_no_claim_window_maximum: true,
      claim_start_clock_skew_minutes: CLAIM_START_CLOCK_SKEW_MINUTES,
      exact_claim_binding_verified: true,
      exact_executor_binding_verified: true,
      exact_experiment_version_binding_verified: true,
      exact_cost_binding_verified: true,
      execution_mode_evidence_verified: true,
      immutable_provenance_record: true,
      receipt_authorizes_execution: false,
      receipt_can_be_replayed_for_execution: false,
      result_recording_requires_receipt_assertion: true,
      result_fabricated: false,
      reusable_platform_knowledge: false,
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
      customer_private_content_used: false,
      customer_identifiers_used: false,
      raw_reasoning_persisted: false,
      authorization_value: "none",
      recorded_at: nowIso,
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
    contract: AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT,
    status: "IMMUTABLE_EXECUTION_RECEIPT_RECORDED",
    receipt: written.data,
    governance: {
      receipt_authorizes_execution: false,
      external_execution_evidence_verified: true,
      caller_supplied_fingerprint_is_authority: false,
      execution_start_bound_to_claim_consumption: true,
      long_running_execution_completion_allowed: true,
      result_recording_requires_receipt_assertion: true,
      provider_called_here: false,
      wallet_charged_here: false,
      runpod_job_submitted_here: false,
      platform_knowledge_written: false,
      automatic_training_started: false,
    },
  };
}

export async function assertAvantiqoExperimentExecutionReceiptCurrent({
  execution_receipt_fingerprint,
  experiment_fingerprint,
  evidence_fingerprint,
  measurement_fingerprint = null,
  require_completed = true,
} = {}) {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`);
  }
  const receiptFingerprint = fingerprint(execution_receipt_fingerprint, "EXECUTION_RECEIPT_FINGERPRINT");
  const experimentFingerprint = fingerprint(experiment_fingerprint, "EXPERIMENT_FINGERPRINT");
  const evidenceFingerprint = fingerprint(evidence_fingerprint, "EVIDENCE_FINGERPRINT");
  const measurementFingerprint = measurement_fingerprint
    ? fingerprint(measurement_fingerprint, "MEASUREMENT_FINGERPRINT")
    : null;

  const receipt = await loadReceipt(organizationId, receiptFingerprint);
  if (!receipt || receipt.active !== true) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_ACTIVE_RECEIPT_NOT_FOUND`);
  }
  const metadata = object(receipt.metadata);
  if (
    text(metadata.contract, 180) !== AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT ||
    text(metadata.status, 180) !== "IMMUTABLE_EXECUTION_RECEIPT_RECORDED" ||
    metadata.immutable_provenance_record !== true ||
    metadata.exact_claim_binding_verified !== true ||
    metadata.external_execution_evidence_verified !== true ||
    metadata.caller_supplied_fingerprint_is_authority !== false ||
    metadata.execution_start_bound_to_claim_consumption !== true ||
    metadata.long_running_execution_completion_allowed !== true ||
    text(metadata.execution_started_at, 120) === "" ||
    text(metadata.execution_completed_at, 120) === "" ||
    text(metadata.executed_at, 120) !== text(metadata.execution_completed_at, 120) ||
    metadata.receipt_authorizes_execution !== false ||
    metadata.result_recording_requires_receipt_assertion !== true
  ) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_RECEIPT_GOVERNANCE_INVALID`);
  }
  if (
    text(metadata.experiment_fingerprint, 128) !== experimentFingerprint ||
    text(metadata.evidence_fingerprint, 128) !== evidenceFingerprint ||
    (measurementFingerprint && text(metadata.measurement_fingerprint, 128) !== measurementFingerprint)
  ) {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_RESULT_PROVENANCE_MISMATCH`);
  }
  if (require_completed === true && text(metadata.execution_status, 80) !== "COMPLETED") {
    throw new Error(`${AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT}_EXECUTION_NOT_COMPLETED`);
  }

  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT,
    status: "EXECUTION_RECEIPT_PROVENANCE_VERIFIED",
    execution_receipt_fingerprint: receiptFingerprint,
    claim_fingerprint: text(metadata.claim_fingerprint, 128),
    executor_fingerprint: text(metadata.executor_fingerprint, 128),
    experiment_fingerprint: experimentFingerprint,
    experiment_version_fingerprint: text(metadata.experiment_version_fingerprint, 128),
    evidence_fingerprint: evidenceFingerprint,
    measurement_fingerprint: text(metadata.measurement_fingerprint, 128),
    execution_mode: text(metadata.execution_mode, 80),
    execution_status: text(metadata.execution_status, 80),
    actual_cost_units: Number(metadata.actual_cost_units),
    execution_started_at: text(metadata.execution_started_at, 120),
    execution_completed_at: text(metadata.execution_completed_at, 120),
    executed_at: text(metadata.execution_completed_at, 120),
    external_execution_evidence_contract: text(
      metadata.external_execution_evidence_contract,
      180,
    ),
    external_execution_evidence_verified: true,
    caller_supplied_fingerprint_is_authority: false,
    provenance_verified: true,
    reusable_platform_knowledge: false,
    authorization_effect: "NONE",
  };
}

export const AvantiqoExperimentExecutionReceiptRuntime = Object.freeze({
  contract: AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT,
  recordReceipt: recordAvantiqoExperimentExecutionReceipt,
  assertReceiptCurrent: assertAvantiqoExperimentExecutionReceiptCurrent,
  claimStartClockSkewMinutes: CLAIM_START_CLOCK_SKEW_MINUTES,
});
