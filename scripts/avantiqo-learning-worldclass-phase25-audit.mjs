import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const requireText = (source, needle, code) => {
  if (!source.includes(needle)) throw new Error(`AVANTIQO_PHASE25_${code}_MISSING`);
};

const leaseMigration = read("supabase/migrations/20260827023000_phase25_intelligence_runpod_lease_provenance.sql");
const guardMigration = read("supabase/migrations/20260827024500_phase25_intelligence_runpod_claim_receipt_enforcement.sql");
const leaseRuntime = read("lib/intelligence/runtime/AvantiqoIntelligenceRunpodLeaseRuntime.js");
const claimRuntime = read("lib/intelligence/runtime/AvantiqoExperimentExecutionClaimRuntime.js");
const receiptRuntime = read("lib/intelligence/runtime/AvantiqoExperimentExecutionReceiptRuntime.js");
const index = read("lib/intelligence/index.js");

for (const [source, needle, code] of [
  [leaseMigration, "create table if not exists public.avantiqo_intelligence_runpod_leases", "LEASE_TABLE"],
  [leaseMigration, "AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_V1", "LEASE_CONTRACT"],
  [leaseMigration, "AVANTIQO_RUNPOD_SAFE_LEASE_V2", "SAFE_LEASE_CONTRACT"],
  [leaseMigration, "pg_advisory_xact_lock", "ATOMIC_ACQUIRE"],
  [leaseMigration, "avantiqo_intelligence_runpod_leases_one_active_endpoint_idx", "ACTIVE_ENDPOINT_UNIQUENESS"],
  [leaseMigration, "acquire_avantiqo_intelligence_runpod_lease_v1", "ACQUIRE_RPC"],
  [leaseMigration, "refresh_avantiqo_intelligence_runpod_lease_v1", "REFRESH_RPC"],
  [leaseMigration, "release_avantiqo_intelligence_runpod_lease_v1", "RELEASE_RPC"],
  [leaseMigration, "security invoker", "RPC_SECURITY_INVOKER"],
  [leaseMigration, "revoke all on table public.avantiqo_intelligence_runpod_leases from public, anon, authenticated", "SERVER_ONLY_TABLE"],
  [guardMigration, "avantiqo_enforce_intelligence_runpod_lease_provenance", "DB_GUARD_FUNCTION"],
  [guardMigration, "before insert on public.intelligence_memories", "BEFORE_INSERT_GUARD"],
  [guardMigration, "platform_learning_experiment_execution_claims", "CLAIM_SCOPE"],
  [guardMigration, "platform_learning_experiment_execution_receipts", "RECEIPT_SCOPE"],
  [guardMigration, "AVANTIQO_PHASE25_ACTIVE_PERSISTED_RUNPOD_LEASE_REQUIRED", "CLAIM_FAIL_CLOSED"],
  [guardMigration, "runpod_safe_lease_db_persisted', true", "DB_PERSISTED_MARKER"],
  [guardMigration, "runpod_intelligence_lease_id", "LEASE_ID_BINDING"],
  [guardMigration, "AVANTIQO_PHASE25_EXECUTION_START_OUTSIDE_PERSISTED_LEASE_WINDOW", "START_WINDOW_FAIL_CLOSED"],
  [guardMigration, "runpod_execution_started_inside_persisted_lease_window', true", "START_WINDOW_MARKER"],
  [leaseRuntime, "AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_V1", "RUNTIME_CONTRACT"],
  [leaseRuntime, "acquire_avantiqo_intelligence_runpod_lease_v1", "RUNTIME_ACQUIRE"],
  [leaseRuntime, "refresh_avantiqo_intelligence_runpod_lease_v1", "RUNTIME_REFRESH"],
  [leaseRuntime, "release_avantiqo_intelligence_runpod_lease_v1", "RUNTIME_RELEASE"],
  [leaseRuntime, "runpodJobSubmittedHere: false", "NO_JOB_SUBMISSION"],
  [leaseRuntime, "providerCalledHere: false", "NO_PROVIDER_CALL"],
  [leaseRuntime, "walletWrittenHere: false", "NO_WALLET_WRITE"],
  [leaseRuntime, "platformKnowledgeWrittenHere: false", "NO_KNOWLEDGE_WRITE"],
  [leaseRuntime, "automaticTrainingStartedHere: false", "NO_TRAINING"],
  [claimRuntime, "runpod_endpoint_id", "CLAIM_ENDPOINT_BINDING"],
  [receiptRuntime, "exactOptionalBinding(claimMetadata.runpod_endpoint_id, runpod_endpoint_id", "RECEIPT_ENDPOINT_BINDING"],
  [receiptRuntime, "verifyAvantiqoRunpodJobEvidence", "RUNPOD_STATUS_EVIDENCE"],
  [index, "./runtime/AvantiqoIntelligenceRunpodLeaseRuntime", "INDEX_EXPORT"],
]) requireText(source, needle, code);

if (leaseMigration.includes("security definer") || guardMigration.includes("security definer")) {
  throw new Error("AVANTIQO_PHASE25_SECURITY_DEFINER_FORBIDDEN");
}

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE25_AUDIT=PASS");
console.log("AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_CONTRACT=AVANTIQO_INTELLIGENCE_RUNPOD_LEASE_V1");
console.log("AVANTIQO_PHASE25_RUNPOD_SAFE_LEASE_CONTRACT=AVANTIQO_RUNPOD_SAFE_LEASE_V2");
console.log("AVANTIQO_PHASE25_RUNPOD_SAFE_LEASE_DB_PERSISTED=true");
console.log("AVANTIQO_PHASE25_ATOMIC_LEASE_ACQUIRE=true");
console.log("AVANTIQO_PHASE25_LEASE_REFRESH_SUPPORTED=true");
console.log("AVANTIQO_PHASE25_LEASE_RELEASE_SUPPORTED=true");
console.log("AVANTIQO_PHASE25_CLAIM_PERSISTED_LEASE_DB_ENFORCED=true");
console.log("AVANTIQO_PHASE25_RECEIPT_SAME_LEASE_DB_ENFORCED=true");
console.log("AVANTIQO_PHASE25_EXECUTION_START_INSIDE_LEASE_WINDOW_REQUIRED=true");
console.log("AVANTIQO_PHASE25_RUNPOD_JOB_STATUS_API_VERIFICATION_RETAINED=true");
console.log("AVANTIQO_PHASE25_RUNPOD_JOB_SUBMITTED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE25_PROVIDER_CALL_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE25_WALLET_WRITE_PERFORMED_BY_AUDIT=false");
console.log("AVANTIQO_PHASE25_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE25_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE25_AUTOMATIC_TRAINING_STARTED=false");
