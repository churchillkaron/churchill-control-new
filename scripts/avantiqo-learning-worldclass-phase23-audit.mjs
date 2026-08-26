import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const files = {
  claim: path.join(
    root,
    "lib/intelligence/runtime/AvantiqoExperimentExecutionClaimRuntime.js",
  ),
  receipt: path.join(
    root,
    "lib/intelligence/runtime/AvantiqoExperimentExecutionReceiptRuntime.js",
  ),
  ingress: path.join(
    root,
    "lib/intelligence/runtime/AvantiqoGovernedExperimentResultIngressRuntime.js",
  ),
  claimMigration: path.join(
    root,
    "supabase/migrations/20260827010500_phase23_experiment_claim_approval_uniqueness.sql",
  ),
  provenanceMigration: path.join(
    root,
    "supabase/migrations/20260827011500_phase23_experiment_result_receipt_enforcement.sql",
  ),
};

function read(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`MISSING_FILE:${path.relative(root, file)}`);
  }
  return fs.readFileSync(file, "utf8");
}

const claim = read(files.claim);
const receipt = read(files.receipt);
const ingress = read(files.ingress);
const claimMigration = read(files.claimMigration);
const provenanceMigration = read(files.provenanceMigration);

const failures = [];

function requireText(source, needle, code) {
  if (!source.includes(needle)) failures.push(code);
}

function forbidText(source, needle, code) {
  if (source.includes(needle)) failures.push(code);
}

// Phase 19 claim contract remains intact while Phase 23 adds a database-level
// one-claim-per-approval invariant that does not depend on application timing.
requireText(
  claim,
  '"AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_V1"',
  "CLAIM_CONTRACT_MISSING",
);
requireText(
  claimMigration,
  "create unique index if not exists intelligence_memories_one_experiment_claim_per_approval_idx",
  "CLAIM_APPROVAL_UNIQUE_INDEX_MISSING",
);
requireText(
  claimMigration,
  "metadata->>'approval_fingerprint'",
  "CLAIM_APPROVAL_FINGERPRINT_INDEX_MISSING",
);
requireText(
  claimMigration,
  "memory_scope = 'platform_learning_experiment_execution_claims'",
  "CLAIM_SCOPE_PARTIAL_INDEX_MISSING",
);

// Receipt contract: execution authority binds the start, not the eventual
// completion. Long-running experiments therefore remain valid without extending
// the single-use claim window.
requireText(
  receipt,
  '"AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_V1"',
  "RECEIPT_CONTRACT_MISSING",
);
requireText(receipt, "execution_started_at", "EXECUTION_STARTED_AT_MISSING");
requireText(receipt, "execution_completed_at", "EXECUTION_COMPLETED_AT_MISSING");
requireText(
  receipt,
  "CLAIM_START_CLOCK_SKEW_MINUTES = 5",
  "CLAIM_START_WINDOW_MISSING",
);
requireText(
  receipt,
  "EXECUTION_START_OUTSIDE_CLAIM_CONSUMPTION_WINDOW",
  "START_CLAIM_BINDING_MISSING",
);
requireText(
  receipt,
  "COMPLETION_BEFORE_START",
  "COMPLETION_ORDER_GUARD_MISSING",
);
requireText(
  receipt,
  "long_running_execution_completion_allowed: true",
  "LONG_RUNNING_COMPLETION_MARKER_MISSING",
);
requireText(
  receipt,
  "completion_has_no_claim_window_maximum: true",
  "NO_COMPLETION_MAXIMUM_MARKER_MISSING",
);
requireText(
  receipt,
  "executed_at_is_completion_alias: true",
  "EXECUTED_AT_COMPLETION_ALIAS_MISSING",
);
requireText(
  receipt,
  "executed_at: executionCompletedAt",
  "EXECUTED_AT_NOT_BOUND_TO_COMPLETION",
);
forbidText(
  receipt,
  "EXECUTION_AFTER_CLAIM_CONSUMPTION_WINDOW",
  "LEGACY_COMPLETION_WINDOW_STILL_PRESENT",
);

// Database trigger is the non-bypassable result-ingress boundary. It applies even
// if a future caller invokes an older result recorder directly.
requireText(
  provenanceMigration,
  "create or replace function public.avantiqo_enforce_learning_execution_provenance()",
  "PROVENANCE_FUNCTION_MISSING",
);
requireText(
  provenanceMigration,
  "security invoker",
  "PROVENANCE_FUNCTION_NOT_SECURITY_INVOKER",
);
forbidText(
  provenanceMigration.toLowerCase(),
  "security definer",
  "PROVENANCE_FUNCTION_SECURITY_DEFINER_FORBIDDEN",
);
requireText(
  provenanceMigration,
  "before insert on public.intelligence_memories",
  "PROVENANCE_TRIGGER_NOT_BEFORE_INSERT",
);
requireText(
  provenanceMigration,
  "platform_learning_experiment_execution_receipts",
  "RECEIPT_SCOPE_DB_GUARD_MISSING",
);
requireText(
  provenanceMigration,
  "platform_learning_experiment_results",
  "SCIENTIFIC_RESULT_DB_GUARD_MISSING",
);
requireText(
  provenanceMigration,
  "platform_learning_transfer_experiment_results",
  "TRANSFER_RESULT_DB_GUARD_MISSING",
);
requireText(
  provenanceMigration,
  "AVANTIQO_PHASE23_EXECUTION_STARTED_AT_REQUIRED",
  "DB_START_TIMESTAMP_REQUIRED_GUARD_MISSING",
);
requireText(
  provenanceMigration,
  "AVANTIQO_PHASE23_EXECUTION_COMPLETED_AT_REQUIRED",
  "DB_COMPLETION_TIMESTAMP_REQUIRED_GUARD_MISSING",
);
requireText(
  provenanceMigration,
  "AVANTIQO_PHASE23_CLAIM_CONSUMED_AT_REQUIRED",
  "DB_CLAIM_CONSUMED_TIMESTAMP_REQUIRED_GUARD_MISSING",
);
requireText(
  provenanceMigration,
  "AVANTIQO_PHASE23_EXECUTION_START_OUTSIDE_CLAIM_WINDOW",
  "DB_START_CLAIM_WINDOW_GUARD_MISSING",
);
requireText(
  provenanceMigration,
  "AVANTIQO_PHASE23_EXACT_COMPLETED_EXECUTION_RECEIPT_REQUIRED",
  "EXACT_COMPLETED_RECEIPT_GUARD_MISSING",
);
requireText(
  provenanceMigration,
  "'immutable_provenance_record', true",
  "IMMUTABLE_RECEIPT_DB_REQUIREMENT_MISSING",
);
requireText(
  provenanceMigration,
  "'execution_status', 'COMPLETED'",
  "COMPLETED_RECEIPT_DB_REQUIREMENT_MISSING",
);
requireText(
  provenanceMigration,
  "r.metadata->>'measurement_fingerprint' = new.metadata->>'measurement_fingerprint'",
  "SCIENTIFIC_MEASUREMENT_BINDING_MISSING",
);
requireText(
  provenanceMigration,
  "r.metadata->>'executed_at' = new.metadata->>'executed_at'",
  "TRANSFER_COMPLETION_BINDING_MISSING",
);
requireText(
  provenanceMigration,
  "'result_ingress_bypass_allowed', false",
  "RESULT_INGRESS_BYPASS_NOT_DISABLED",
);
requireText(
  provenanceMigration,
  "'receipt_enforced_by_database', true",
  "DB_RECEIPT_ENFORCEMENT_MARKER_MISSING",
);

// Canonical ingress remains receipt-aware as defense in depth.
requireText(
  ingress,
  "assertAvantiqoExperimentExecutionReceiptCurrent",
  "CANONICAL_INGRESS_RECEIPT_ASSERTION_MISSING",
);
requireText(
  ingress,
  "require_completed: true",
  "CANONICAL_INGRESS_COMPLETED_RECEIPT_REQUIREMENT_MISSING",
);

// Static certification must remain non-executing and non-promoting.
const combined = [claim, receipt, ingress, claimMigration, provenanceMigration].join("\n");
for (const forbidden of [
  "automatic_training_started: true",
  "automatic_knowledge_promotion: true",
  "receipt_authorizes_execution: true",
  "provider_called_here: true",
  "runpod_job_submitted_here: true",
]) {
  forbidText(combined, forbidden, `FORBIDDEN_MARKER:${forbidden}`);
}

if (failures.length) {
  console.error("AVANTIQO_LEARNING_WORLDCLASS_PHASE23_AUDIT=FAIL");
  for (const failure of failures) {
    console.error(`AVANTIQO_PHASE23_AUDIT_FAILURE=${failure}`);
  }
  process.exit(1);
}

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE23_AUDIT=PASS");
console.log(
  "AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_CONTRACT=AVANTIQO_EXPERIMENT_EXECUTION_RECEIPT_V1",
);
console.log("AVANTIQO_PHASE23_ONE_CLAIM_PER_APPROVAL_DB_ENFORCED=true");
console.log("AVANTIQO_PHASE23_EXECUTION_START_CLAIM_BOUND=true");
console.log("AVANTIQO_PHASE23_LONG_RUNNING_COMPLETION_ALLOWED=true");
console.log("AVANTIQO_PHASE23_EXECUTED_AT_IS_COMPLETION_ALIAS=true");
console.log("AVANTIQO_PHASE23_DIRECT_RESULT_INGRESS_BYPASS_ALLOWED=false");
console.log("AVANTIQO_PHASE23_RECEIPT_DB_ENFORCED=true");
console.log("AVANTIQO_PHASE23_EXECUTION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE23_PLATFORM_KNOWLEDGE_WRITTEN=false");
console.log("AVANTIQO_PHASE23_AUTOMATIC_TRAINING_STARTED=false");
