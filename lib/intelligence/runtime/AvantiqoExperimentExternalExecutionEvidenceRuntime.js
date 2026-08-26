import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT =
  "AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_V1";

const RUNPOD_SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const RUNPOD_STATUS_BASE_URL = "https://api.runpod.ai/v2";
const RUNPOD_STATUS_TIMEOUT_MS = 15000;
const EXECUTION_MODES = new Set([
  "LOCAL_PROVIDER_FREE",
  "MANAGED_PROVIDER_API",
  "RUNPOD_GPU",
]);

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function normalized(value) {
  return text(value, 4000).toLowerCase();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => text(part, 24000).toLowerCase()).join("|"))
    .digest("hex");
}

function fingerprintOrNull(value, code) {
  if (value === null || value === undefined || text(value, 200) === "") return null;
  const candidate = normalized(value);
  if (!/^[a-f0-9]{16,128}$/.test(candidate)) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_${code}_INVALID`,
    );
  }
  return candidate;
}

function requiredUuid(value, code) {
  const candidate = text(value, 80).toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(candidate)) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_${code}_INVALID`,
    );
  }
  return candidate;
}

function executionMode(value) {
  const mode = text(value, 80).toUpperCase();
  if (!EXECUTION_MODES.has(mode)) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_EXECUTION_MODE_INVALID`,
    );
  }
  return mode;
}

function learningOrganizationId() {
  return text(process.env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 160);
}

function requireLearningOrganizationId() {
  const organizationId = learningOrganizationId();
  if (!organizationId) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_LEARNING_ORGANIZATION_REQUIRED`,
    );
  }
  return organizationId;
}

function finiteNonNegative(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1e12) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_${code}_INVALID`,
    );
  }
  return number;
}

function sameInstant(left, right, toleranceMs = 1500) {
  const leftMs = Date.parse(text(left, 120));
  const rightMs = Date.parse(text(right, 120));
  return (
    Number.isFinite(leftMs) &&
    Number.isFinite(rightMs) &&
    Math.abs(leftMs - rightMs) <= toleranceMs
  );
}

function sameNumber(left, right, tolerance = 1e-9) {
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
}

async function loadOrganizationService(organizationId, serviceId) {
  const result = await supabaseAdmin
    .from("organization_services")
    .select(
      "id,organization_id,service_id,status,managed_by,authorization_required,usage_enabled,billing_enabled,default_provider_id,billing_mode,default_currency,updated_at",
    )
    .eq("id", serviceId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadUsage(organizationId, usageId) {
  const result = await supabaseAdmin
    .from("platform_service_usage")
    .select(
      "id,organization_id,organization_service_id,provider,capability,status,execution_status,provider_request_id,provider_response_id,provider_model,execution_started_at,execution_finished_at,reserved_amount,charged_amount,billing_completed,currency,created_at,updated_at,metadata",
    )
    .eq("id", usageId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

async function loadWalletTransaction(organizationId, transactionId) {
  const result = await supabaseAdmin
    .from("wallet_transactions")
    .select(
      "id,organization_id,wallet_id,type,amount,currency,provider,usage_id,reservation_id,idempotency_key,created_at,metadata",
    )
    .eq("id", transactionId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (result.error) throw result.error;
  return result.data || null;
}

function assertOptionalFingerprintMatch(provided, derived, code) {
  const candidate = fingerprintOrNull(provided, code);
  if (candidate && candidate !== derived) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_${code}_MISMATCH`,
    );
  }
}

function assertProviderUsagePreExecution(usage, serviceId) {
  if (!usage || text(usage.organization_service_id, 80) !== serviceId) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_PROVIDER_USAGE_BINDING_INVALID`,
    );
  }
  if (text(usage.status, 80).toUpperCase() !== "PENDING") {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_PROVIDER_USAGE_ALREADY_TERMINAL`,
    );
  }
  if (
    usage.provider_request_id ||
    usage.provider_response_id ||
    usage.execution_started_at ||
    usage.execution_finished_at ||
    usage.billing_completed === true
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_PROVIDER_USAGE_ALREADY_STARTED`,
    );
  }
}

export async function verifyAvantiqoManagedProviderClaimEvidence({
  organization_service_id,
  service_usage_id,
  wallet_reservation_transaction_id,
  provider_service_runtime_authorization_fingerprint = null,
  wallet_reservation_fingerprint = null,
} = {}) {
  const organizationId = requireLearningOrganizationId();
  const serviceId = requiredUuid(organization_service_id, "ORGANIZATION_SERVICE_ID");
  const usageId = requiredUuid(service_usage_id, "SERVICE_USAGE_ID");
  const reservationId = requiredUuid(
    wallet_reservation_transaction_id,
    "WALLET_RESERVATION_TRANSACTION_ID",
  );

  const [service, usage, reservation] = await Promise.all([
    loadOrganizationService(organizationId, serviceId),
    loadUsage(organizationId, usageId),
    loadWalletTransaction(organizationId, reservationId),
  ]);

  if (
    !service ||
    text(service.status, 80).toUpperCase() !== "ACTIVE" ||
    normalized(service.managed_by) !== "avantiqo" ||
    service.usage_enabled !== true ||
    service.billing_enabled !== true
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_AVANTIQO_MANAGED_SERVICE_NOT_ACTIVE`,
    );
  }

  assertProviderUsagePreExecution(usage, serviceId);

  if (
    !reservation ||
    text(reservation.type, 80).toUpperCase() !== "RESERVE" ||
    Number(reservation.amount) <= 0 ||
    text(reservation.idempotency_key, 240) !== `RESERVE:${usageId}`
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_WALLET_RESERVATION_LEDGER_INVALID`,
    );
  }
  if (
    text(reservation.provider, 160) &&
    text(usage.provider, 160) &&
    text(reservation.provider, 160) !== text(usage.provider, 160)
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_RESERVATION_PROVIDER_MISMATCH`,
    );
  }
  if (object(reservation.metadata).provider_execution_funding !== true) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_RESERVATION_NOT_PROVIDER_EXECUTION_FUNDING`,
    );
  }

  const providerAuthorizationFingerprint = digest(
    "managed-provider-service-runtime-authorization",
    organizationId,
    service.id,
    service.service_id,
    service.default_provider_id,
    usage.id,
    usage.provider,
    usage.capability,
    usage.created_at,
  );
  const walletReservationFingerprint = digest(
    "managed-provider-wallet-reservation",
    organizationId,
    reservation.id,
    reservation.wallet_id,
    usage.id,
    reservation.amount,
    reservation.currency,
    reservation.provider,
    reservation.idempotency_key,
    reservation.created_at,
  );

  assertOptionalFingerprintMatch(
    provider_service_runtime_authorization_fingerprint,
    providerAuthorizationFingerprint,
    "PROVIDER_SERVICE_RUNTIME_AUTHORIZATION_FINGERPRINT",
  );
  assertOptionalFingerprintMatch(
    wallet_reservation_fingerprint,
    walletReservationFingerprint,
    "WALLET_RESERVATION_FINGERPRINT",
  );

  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT,
    execution_mode: "MANAGED_PROVIDER_API",
    organization_service_id: service.id,
    service_usage_id: usage.id,
    wallet_reservation_transaction_id: reservation.id,
    provider_service_runtime_authorization_fingerprint: providerAuthorizationFingerprint,
    wallet_reservation_fingerprint: walletReservationFingerprint,
    provider: text(usage.provider, 160),
    capability: text(usage.capability, 240),
    reservation_amount: Number(reservation.amount),
    reservation_currency: text(reservation.currency, 40),
    service_runtime_ledger_verified: true,
    wallet_reservation_ledger_verified: true,
    caller_supplied_fingerprint_is_authority: false,
    external_execution_authorized_here: false,
  };
}

export function verifyAvantiqoRunpodClaimEvidence({
  runpod_endpoint_id,
  runpod_lease_lane = null,
  runpod_safe_lease_fingerprint = null,
} = {}) {
  requireLearningOrganizationId();
  const endpointId = text(runpod_endpoint_id, 200);
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_RUNPOD_ENDPOINT_ID_INVALID`,
    );
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE, 40).toUpperCase() !== "YES") {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_RUNPOD_SAFE_LEASE_ACTIVE_REQUIRED`,
    );
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== RUNPOD_SAFE_LEASE_CONTRACT) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_RUNPOD_SAFE_LEASE_V2_REQUIRED`,
    );
  }
  const envEndpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID, 200);
  const envLane = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 160);
  const envExpiresAt = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT, 160);
  const expiryMs = Date.parse(envExpiresAt);
  if (envEndpointId !== endpointId || !Number.isFinite(expiryMs) || expiryMs <= Date.now()) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_RUNPOD_SAFE_LEASE_BINDING_INVALID`,
    );
  }
  if (runpod_lease_lane && text(runpod_lease_lane, 160) !== envLane) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_RUNPOD_SAFE_LEASE_LANE_MISMATCH`,
    );
  }

  const safeLeaseFingerprint = digest(
    "runpod-safe-lease-v2",
    RUNPOD_SAFE_LEASE_CONTRACT,
    envLane,
    envEndpointId,
    new Date(expiryMs).toISOString(),
  );
  assertOptionalFingerprintMatch(
    runpod_safe_lease_fingerprint,
    safeLeaseFingerprint,
    "RUNPOD_SAFE_LEASE_FINGERPRINT",
  );

  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT,
    execution_mode: "RUNPOD_GPU",
    runpod_safe_lease_contract: RUNPOD_SAFE_LEASE_CONTRACT,
    runpod_safe_lease_fingerprint: safeLeaseFingerprint,
    runpod_endpoint_id: envEndpointId,
    runpod_lease_lane: envLane,
    runpod_lease_expires_at: new Date(expiryMs).toISOString(),
    safe_lease_environment_verified: true,
    caller_supplied_fingerprint_is_authority: false,
    external_execution_authorized_here: false,
  };
}

function assertReceiptStatusAgainstUsage(receiptStatus, usage) {
  const requested = text(receiptStatus, 80).toUpperCase();
  const status = text(usage.status, 80).toUpperCase();
  const executionStatus = text(usage.execution_status, 80).toUpperCase();
  if (requested === "COMPLETED" && status !== "SUCCESS" && executionStatus !== "SUCCESS") {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_PROVIDER_COMPLETION_NOT_IN_LEDGER`,
    );
  }
  if (requested === "FAILED" && status !== "FAILED" && executionStatus !== "FAILED") {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_PROVIDER_FAILURE_NOT_IN_LEDGER`,
    );
  }
  if (requested === "CANCELLED_AFTER_START" && status !== "CANCELLED") {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_PROVIDER_CANCELLATION_NOT_IN_LEDGER`,
    );
  }
}

export async function verifyAvantiqoManagedProviderSettlementEvidence({
  service_usage_id,
  wallet_reservation_transaction_id,
  wallet_charge_transaction_id,
  actual_cost_units,
  execution_started_at,
  execution_completed_at,
  execution_status,
  provider_execution_fingerprint = null,
  wallet_charge_fingerprint = null,
} = {}) {
  const organizationId = requireLearningOrganizationId();
  const usageId = requiredUuid(service_usage_id, "SERVICE_USAGE_ID");
  const reservationId = requiredUuid(
    wallet_reservation_transaction_id,
    "WALLET_RESERVATION_TRANSACTION_ID",
  );
  const chargeId = requiredUuid(wallet_charge_transaction_id, "WALLET_CHARGE_TRANSACTION_ID");
  const actualCost = finiteNonNegative(actual_cost_units, "ACTUAL_COST_UNITS");

  const [usage, reservation, charge] = await Promise.all([
    loadUsage(organizationId, usageId),
    loadWalletTransaction(organizationId, reservationId),
    loadWalletTransaction(organizationId, chargeId),
  ]);
  if (!usage || !reservation || !charge) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_MANAGED_PROVIDER_SETTLEMENT_LEDGER_MISSING`,
    );
  }

  assertReceiptStatusAgainstUsage(execution_status, usage);
  if (
    !usage.execution_started_at ||
    !usage.execution_finished_at ||
    !sameInstant(usage.execution_started_at, execution_started_at) ||
    !sameInstant(usage.execution_finished_at, execution_completed_at)
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_PROVIDER_EXECUTION_TIME_MISMATCH`,
    );
  }
  if (!text(usage.provider_request_id, 240) && !text(usage.provider_response_id, 240)) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_PROVIDER_REQUEST_RESPONSE_EVIDENCE_REQUIRED`,
    );
  }
  if (usage.billing_completed !== true) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_PROVIDER_BILLING_NOT_COMPLETED`,
    );
  }
  if (
    text(reservation.type, 80).toUpperCase() !== "RESERVE" ||
    text(reservation.idempotency_key, 240) !== `RESERVE:${usageId}` ||
    text(charge.type, 80).toUpperCase() !== "CHARGE" ||
    text(charge.usage_id, 80) !== usageId ||
    text(charge.idempotency_key, 240) !== `CHARGE:${usageId}` ||
    text(reservation.wallet_id, 80) !== text(charge.wallet_id, 80)
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_WALLET_SETTLEMENT_CHAIN_INVALID`,
    );
  }
  if (
    !sameNumber(charge.amount, actualCost) ||
    !sameNumber(usage.charged_amount, actualCost) ||
    text(reservation.currency, 40) !== text(charge.currency, 40) ||
    (text(reservation.provider, 160) &&
      text(charge.provider, 160) &&
      text(reservation.provider, 160) !== text(charge.provider, 160))
  ) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_WALLET_SETTLEMENT_VALUE_MISMATCH`,
    );
  }

  const providerExecutionFingerprint = digest(
    "managed-provider-execution",
    organizationId,
    usage.id,
    usage.organization_service_id,
    usage.provider,
    usage.capability,
    usage.provider_request_id,
    usage.provider_response_id,
    usage.provider_model,
    usage.status,
    usage.execution_status,
    usage.execution_started_at,
    usage.execution_finished_at,
    usage.charged_amount,
  );
  const walletChargeFingerprint = digest(
    "managed-provider-wallet-charge",
    organizationId,
    charge.id,
    charge.wallet_id,
    usage.id,
    charge.amount,
    charge.currency,
    charge.provider,
    charge.idempotency_key,
    charge.created_at,
  );

  assertOptionalFingerprintMatch(
    provider_execution_fingerprint,
    providerExecutionFingerprint,
    "PROVIDER_EXECUTION_FINGERPRINT",
  );
  assertOptionalFingerprintMatch(
    wallet_charge_fingerprint,
    walletChargeFingerprint,
    "WALLET_CHARGE_FINGERPRINT",
  );

  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT,
    execution_mode: "MANAGED_PROVIDER_API",
    service_usage_id: usage.id,
    wallet_reservation_transaction_id: reservation.id,
    wallet_charge_transaction_id: charge.id,
    provider_execution_fingerprint: providerExecutionFingerprint,
    wallet_charge_fingerprint: walletChargeFingerprint,
    provider: text(usage.provider, 160),
    provider_request_id: text(usage.provider_request_id, 240) || null,
    provider_response_id: text(usage.provider_response_id, 240) || null,
    provider_model: text(usage.provider_model, 240) || null,
    settlement_amount: Number(charge.amount),
    settlement_currency: text(charge.currency, 40),
    service_runtime_execution_ledger_verified: true,
    wallet_settlement_ledger_verified: true,
    caller_supplied_fingerprint_is_authority: false,
  };
}

function expectedRunpodStatuses(executionStatus) {
  const status = text(executionStatus, 80).toUpperCase();
  if (status === "COMPLETED") return new Set(["COMPLETED"]);
  if (status === "FAILED") return new Set(["FAILED", "TIMED_OUT"]);
  if (status === "CANCELLED_AFTER_START") return new Set(["CANCELLED"]);
  throw new Error(
    `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_RUNPOD_RECEIPT_STATUS_INVALID`,
  );
}

export async function verifyAvantiqoRunpodJobEvidence({
  runpod_endpoint_id,
  runpod_job_id,
  execution_status,
  runpod_job_fingerprint = null,
} = {}) {
  requireLearningOrganizationId();
  const endpointId = text(runpod_endpoint_id, 200);
  const jobId = text(runpod_job_id, 240);
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId) || !/^[A-Za-z0-9_.:-]+$/.test(jobId)) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_RUNPOD_JOB_IDENTITY_INVALID`,
    );
  }
  const apiKey = text(process.env.RUNPOD_API_KEY, 4000);
  if (!apiKey) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_RUNPOD_API_KEY_REQUIRED`,
    );
  }

  const response = await fetch(
    `${RUNPOD_STATUS_BASE_URL}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
    {
      method: "GET",
      headers: { Authorization: apiKey },
      signal: AbortSignal.timeout(RUNPOD_STATUS_TIMEOUT_MS),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_RUNPOD_STATUS_LOOKUP_FAILED:${response.status}`,
    );
  }
  const body = object(await response.json());
  const observedJobId = text(body.id, 240);
  const observedStatus = text(body.status, 80).toUpperCase();
  if (observedJobId !== jobId || !expectedRunpodStatuses(execution_status).has(observedStatus)) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_RUNPOD_JOB_STATUS_MISMATCH`,
    );
  }

  const jobFingerprint = digest(
    "runpod-serverless-job-status",
    endpointId,
    observedJobId,
    observedStatus,
    body.executionTime,
    body.delayTime,
    body.retries,
  );
  assertOptionalFingerprintMatch(
    runpod_job_fingerprint,
    jobFingerprint,
    "RUNPOD_JOB_FINGERPRINT",
  );

  return {
    success: true,
    contract: AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT,
    execution_mode: "RUNPOD_GPU",
    runpod_endpoint_id: endpointId,
    runpod_job_id: observedJobId,
    runpod_job_status: observedStatus,
    runpod_job_fingerprint: jobFingerprint,
    runpod_execution_time_ms: Number.isFinite(Number(body.executionTime))
      ? Number(body.executionTime)
      : null,
    runpod_delay_time_ms: Number.isFinite(Number(body.delayTime)) ? Number(body.delayTime) : null,
    runpod_status_api_verified: true,
    output_persisted_here: false,
    caller_supplied_fingerprint_is_authority: false,
  };
}

export function assertAvantiqoExternalEvidenceModeIsolation({
  execution_mode,
  organization_service_id = null,
  service_usage_id = null,
  wallet_reservation_transaction_id = null,
  wallet_charge_transaction_id = null,
  runpod_endpoint_id = null,
  runpod_job_id = null,
} = {}) {
  const mode = executionMode(execution_mode);
  const providerFields = [
    organization_service_id,
    service_usage_id,
    wallet_reservation_transaction_id,
    wallet_charge_transaction_id,
  ].some((value) => Boolean(text(value, 240)));
  const runpodFields = [runpod_endpoint_id, runpod_job_id].some((value) => Boolean(text(value, 240)));
  if (mode === "LOCAL_PROVIDER_FREE" && (providerFields || runpodFields)) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_LOCAL_MODE_EXTERNAL_EVIDENCE_FORBIDDEN`,
    );
  }
  if (mode === "MANAGED_PROVIDER_API" && runpodFields) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_PROVIDER_MODE_RUNPOD_EVIDENCE_FORBIDDEN`,
    );
  }
  if (mode === "RUNPOD_GPU" && providerFields) {
    throw new Error(
      `${AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT}_RUNPOD_MODE_PROVIDER_LEDGER_EVIDENCE_FORBIDDEN`,
    );
  }
  return { success: true, mode, provider_fields_present: providerFields, runpod_fields_present: runpodFields };
}

export const AvantiqoExperimentExternalExecutionEvidenceRuntime = Object.freeze({
  contract: AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT,
  verifyManagedProviderClaimEvidence: verifyAvantiqoManagedProviderClaimEvidence,
  verifyManagedProviderSettlementEvidence: verifyAvantiqoManagedProviderSettlementEvidence,
  verifyRunpodClaimEvidence: verifyAvantiqoRunpodClaimEvidence,
  verifyRunpodJobEvidence: verifyAvantiqoRunpodJobEvidence,
  assertModeIsolation: assertAvantiqoExternalEvidenceModeIsolation,
  runpodSafeLeaseContract: RUNPOD_SAFE_LEASE_CONTRACT,
  runpodStatusApi: `${RUNPOD_STATUS_BASE_URL}/<endpoint-id>/status/<job-id>`,
});
