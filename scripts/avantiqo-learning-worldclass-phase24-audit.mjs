import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function requireIncludes(source, needle, code) {
  if (!source.includes(needle)) throw new Error(`AVANTIQO_PHASE24_AUDIT_FAILURE=${code}`);
}

function requireExcludes(source, needle, code) {
  if (source.includes(needle)) throw new Error(`AVANTIQO_PHASE24_AUDIT_FAILURE=${code}`);
}

const evidencePath =
  "lib/intelligence/runtime/AvantiqoExperimentExternalExecutionEvidenceRuntime.js";
const claimPath =
  "lib/intelligence/runtime/AvantiqoExperimentExecutionClaimRuntime.js";
const receiptPath =
  "lib/intelligence/runtime/AvantiqoExperimentExecutionReceiptRuntime.js";
const indexPath = "lib/intelligence/index.js";
const resultEnforcementMigrationPath =
  "supabase/migrations/20260827011500_phase23_experiment_result_receipt_enforcement.sql";

const evidence = read(evidencePath);
const claim = read(claimPath);
const receipt = read(receiptPath);
const index = read(indexPath);
const resultEnforcementMigration = read(resultEnforcementMigrationPath);

requireIncludes(
  evidence,
  '"AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_V1"',
  "EXTERNAL_EVIDENCE_CONTRACT_MISSING",
);
requireIncludes(evidence, '.from("organization_services")', "ORGANIZATION_SERVICE_LEDGER_NOT_READ");
requireIncludes(evidence, '.from("platform_service_usage")', "SERVICE_USAGE_LEDGER_NOT_READ");
requireIncludes(evidence, '.from("wallet_transactions")', "WALLET_LEDGER_NOT_READ");
requireIncludes(evidence, 'normalized(service.managed_by) !== "avantiqo"', "AVANTIQO_MANAGED_SERVICE_NOT_REQUIRED");
requireIncludes(evidence, 'text(service.status, 80).toUpperCase() !== "ACTIVE"', "ACTIVE_SERVICE_NOT_REQUIRED");
requireIncludes(evidence, 'service.usage_enabled !== true', "USAGE_ENABLED_NOT_REQUIRED");
requireIncludes(evidence, 'service.billing_enabled !== true', "BILLING_ENABLED_NOT_REQUIRED");

requireIncludes(evidence, 'text(usage.status, 80).toUpperCase() !== "PENDING"', "PENDING_USAGE_NOT_REQUIRED");
requireIncludes(evidence, "usage.provider_request_id ||", "PROVIDER_REQUEST_PRESTART_GUARD_MISSING");
requireIncludes(evidence, "usage.execution_started_at ||", "EXECUTION_START_PRESTART_GUARD_MISSING");
requireIncludes(evidence, "usage.execution_finished_at ||", "EXECUTION_FINISH_PRESTART_GUARD_MISSING");
requireIncludes(evidence, "usage.billing_completed === true", "BILLING_PRESTART_GUARD_MISSING");
requireIncludes(evidence, '`RESERVE:${usageId}`', "RESERVATION_USAGE_BINDING_MISSING");
requireIncludes(evidence, "provider_execution_funding !== true", "PROVIDER_FUNDING_RESERVATION_REQUIRED");
requireIncludes(evidence, "service_runtime_ledger_verified: true", "SERVICE_RUNTIME_LEDGER_MARKER_MISSING");
requireIncludes(evidence, "wallet_reservation_ledger_verified: true", "WALLET_RESERVATION_LEDGER_MARKER_MISSING");

requireIncludes(evidence, '`CHARGE:${usageId}`', "CHARGE_USAGE_BINDING_MISSING");
requireIncludes(evidence, 'text(charge.usage_id, 80) !== usageId', "CHARGE_USAGE_ID_BINDING_MISSING");
requireIncludes(evidence, "usage.billing_completed !== true", "BILLING_COMPLETION_REQUIRED");
requireIncludes(evidence, "!sameNumber(charge.amount, actualCost)", "CHARGE_ACTUAL_COST_BINDING_MISSING");
requireIncludes(evidence, "!sameNumber(usage.charged_amount, actualCost)", "USAGE_ACTUAL_COST_BINDING_MISSING");
requireIncludes(evidence, "service_runtime_execution_ledger_verified: true", "EXECUTION_LEDGER_MARKER_MISSING");
requireIncludes(evidence, "wallet_settlement_ledger_verified: true", "WALLET_SETTLEMENT_MARKER_MISSING");

requireIncludes(evidence, 'const RUNPOD_SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2"', "RUNPOD_SAFE_LEASE_V2_MISSING");
requireIncludes(evidence, "AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE", "RUNPOD_ACTIVE_LEASE_REQUIRED");
requireIncludes(evidence, "AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID", "RUNPOD_ENDPOINT_BINDING_MISSING");
requireIncludes(evidence, "AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT", "RUNPOD_LEASE_EXPIRY_MISSING");
requireIncludes(evidence, 'method: "GET"', "RUNPOD_STATUS_NOT_READ_ONLY");
requireIncludes(evidence, "/status/${encodeURIComponent(jobId)}", "RUNPOD_STATUS_LOOKUP_MISSING");
requireIncludes(evidence, "runpod_status_api_verified: true", "RUNPOD_STATUS_MARKER_MISSING");
requireExcludes(evidence, 'method: "POST"', "RUNPOD_SUBMISSION_PRESENT_IN_EVIDENCE_VERIFIER");
requireExcludes(evidence, 'method: "PUT"', "RUNPOD_MUTATION_PRESENT_IN_EVIDENCE_VERIFIER");
requireExcludes(evidence, 'method: "DELETE"', "RUNPOD_DELETE_PRESENT_IN_EVIDENCE_VERIFIER");

requireIncludes(evidence, "caller_supplied_fingerprint_is_authority: false", "CALLER_FINGERPRINT_AUTHORITY_NOT_DENIED");
requireIncludes(evidence, "assertOptionalFingerprintMatch", "DERIVED_FINGERPRINT_COMPARISON_MISSING");
requireIncludes(evidence, "LOCAL_MODE_EXTERNAL_EVIDENCE_FORBIDDEN", "LOCAL_MODE_ISOLATION_MISSING");
requireIncludes(evidence, "PROVIDER_MODE_RUNPOD_EVIDENCE_FORBIDDEN", "PROVIDER_RUNPOD_ISOLATION_MISSING");
requireIncludes(evidence, "RUNPOD_MODE_PROVIDER_LEDGER_EVIDENCE_FORBIDDEN", "RUNPOD_PROVIDER_ISOLATION_MISSING");

requireIncludes(claim, "verifyAvantiqoManagedProviderClaimEvidence", "CLAIM_PROVIDER_VERIFIER_NOT_WIRED");
requireIncludes(claim, "verifyAvantiqoRunpodClaimEvidence", "CLAIM_RUNPOD_VERIFIER_NOT_WIRED");
requireIncludes(claim, "organization_service_id = null", "CLAIM_SERVICE_ID_MISSING");
requireIncludes(claim, "service_usage_id = null", "CLAIM_USAGE_ID_MISSING");
requireIncludes(claim, "wallet_reservation_transaction_id = null", "CLAIM_RESERVATION_ID_MISSING");
requireIncludes(claim, "runpod_endpoint_id = null", "CLAIM_RUNPOD_ENDPOINT_MISSING");
requireIncludes(claim, "external_claim_evidence_verified: true", "CLAIM_EXTERNAL_EVIDENCE_MARKER_MISSING");
requireIncludes(claim, "caller_supplied_fingerprint_is_authority: false", "CLAIM_CALLER_AUTHORITY_NOT_DENIED");
requireIncludes(claim, "claim_creation_calls_provider: false", "CLAIM_PROVIDER_CALL_SAFETY_MISSING");
requireIncludes(claim, "claim_creation_reserves_wallet: false", "CLAIM_WALLET_WRITE_SAFETY_MISSING");
requireIncludes(claim, "claim_creation_submits_runpod_job: false", "CLAIM_RUNPOD_SUBMIT_SAFETY_MISSING");
requireIncludes(claim, "runpod_safe_lease_db_persisted: false", "RUNPOD_LEASE_DB_LIMITATION_NOT_EXPLICIT");

requireIncludes(receipt, "verifyAvantiqoManagedProviderSettlementEvidence", "RECEIPT_PROVIDER_SETTLEMENT_VERIFIER_NOT_WIRED");
requireIncludes(receipt, "verifyAvantiqoRunpodJobEvidence", "RECEIPT_RUNPOD_STATUS_VERIFIER_NOT_WIRED");
requireIncludes(receipt, "wallet_charge_transaction_id = null", "RECEIPT_CHARGE_ID_MISSING");
requireIncludes(receipt, "runpod_job_id = null", "RECEIPT_RUNPOD_JOB_ID_MISSING");
requireIncludes(receipt, "exactOptionalBinding(claimMetadata.service_usage_id", "RECEIPT_USAGE_CLAIM_BINDING_MISSING");
requireIncludes(receipt, "claimMetadata.wallet_reservation_transaction_id", "RECEIPT_RESERVATION_CLAIM_BINDING_MISSING");
requireIncludes(receipt, "exactOptionalBinding(claimMetadata.runpod_endpoint_id", "RECEIPT_RUNPOD_ENDPOINT_CLAIM_BINDING_MISSING");
requireIncludes(receipt, "external_execution_evidence_verified: true", "RECEIPT_EXTERNAL_EVIDENCE_MARKER_MISSING");
requireIncludes(receipt, "caller_supplied_fingerprint_is_authority: false", "RECEIPT_CALLER_AUTHORITY_NOT_DENIED");
requireIncludes(receipt, "runpod_safe_lease_revalidation_at_completion_required: false", "LONG_RUNNING_RUNPOD_LEASE_SEMANTICS_MISSING");
requireIncludes(receipt, "provider_called_here: false", "RECEIPT_PROVIDER_CALL_SAFETY_MISSING");
requireIncludes(receipt, "wallet_charged_here: false", "RECEIPT_WALLET_WRITE_SAFETY_MISSING");
requireIncludes(receipt, "runpod_job_submitted_here: false", "RECEIPT_RUNPOD_SUBMIT_SAFETY_MISSING");

requireIncludes(receipt, "execution_start_bound_to_claim_consumption: true", "PHASE23_START_BINDING_REGRESSED");
requireIncludes(receipt, "long_running_execution_completion_allowed: true", "PHASE23_LONG_RUNNING_REGRESSED");
requireIncludes(receipt, "executed_at_is_completion_alias: true", "PHASE23_COMPLETION_ALIAS_REGRESSED");
requireIncludes(resultEnforcementMigration, "platform_learning_experiment_execution_receipts", "PHASE23_DB_RESULT_RECEIPT_ENFORCEMENT_REGRESSED");

requireIncludes(
  index,
  'export * from "./runtime/AvantiqoExperimentExternalExecutionEvidenceRuntime";',
  "INDEX_EXPORT_MISSING",
);

for (const source of [evidence, claim, receipt]) {
  requireExcludes(source, "automatic_training_effect: \"START", "AUTOMATIC_TRAINING_PRESENT");
  requireExcludes(source, "automatic_knowledge_promotion: true", "AUTOMATIC_KNOWLEDGE_PROMOTION_PRESENT");
}

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE24_AUDIT=PASS");
console.log(
  "AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_CONTRACT=AVANTIQO_EXPERIMENT_EXTERNAL_EXECUTION_EVIDENCE_V1",
);
console.log("AVANTIQO_PHASE24_PROVIDER_SERVICE_RUNTIME_LEDGER_VERIFIED=true");
console.log("AVANTIQO_PHASE24_WALLET_RESERVATION_LEDGER_VERIFIED=true");
console.log("AVANTIQO_PHASE24_WALLET_SETTLEMENT_LEDGER_VERIFIED=true");
console.log("AVANTIQO_PHASE24_CALLER_FINGERPRINT_IS_AUTHORITY=false");
console.log("AVANTIQO_PHASE24_RUNPOD_SAFE_LEASE_ENV_VERIFIED=true");
console.log("AVANTIQO_PHASE24_RUNPOD_SAFE_LEASE_DB_PERSISTED=false");
console.log("AVANTIQO_PHASE24_RUNPOD_JOB_STATUS_API_VERIFIED=true");
console.log("AVANTIQO_PHASE24_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE24_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE24_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE24_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE24_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE24_AUTOMATIC_TRAINING_STARTED=false");
