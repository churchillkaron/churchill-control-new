import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const runtimePath = path.join(
  ROOT,
  "lib/intelligence/runtime/AvantiqoExperimentExecutionClaimRuntime.js",
);
const indexPath = path.join(ROOT, "lib/intelligence/index.js");
const routePath = path.join(
  ROOT,
  "app/api/internal/intelligence/continuous-learning/process/route.js",
);

for (const filePath of [runtimePath, indexPath, routePath]) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`AVANTIQO_LEARNING_WORLDCLASS_PHASE19_AUDIT_MISSING:${filePath}`);
  }
}

const runtime = fs.readFileSync(runtimePath, "utf8");
const index = fs.readFileSync(indexPath, "utf8");
const route = fs.readFileSync(routePath, "utf8");

function assertMatch(source, pattern, code) {
  if (!pattern.test(source)) {
    const error = new Error(`AVANTIQO_LEARNING_WORLDCLASS_PHASE19_AUDIT_FAILED:${code}`);
    error.details = { pattern: String(pattern) };
    throw error;
  }
}

assertMatch(
  runtime,
  /AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_V1/,
  "CLAIM_CONTRACT",
);
assertMatch(
  runtime,
  /platform_learning_experiment_execution_claims/,
  "CLAIM_SCOPE",
);
assertMatch(runtime, /CLAIM_VALIDITY_MINUTES = 10/, "BOUNDED_CLAIM_VALIDITY");
assertMatch(runtime, /LOCAL_PROVIDER_FREE/, "LOCAL_MODE");
assertMatch(runtime, /MANAGED_PROVIDER_API/, "PROVIDER_MODE");
assertMatch(runtime, /RUNPOD_GPU/, "RUNPOD_MODE");
assertMatch(runtime, /AVANTIQO_RUNPOD_SAFE_LEASE_V2/, "RUNPOD_SAFE_LEASE_CONTRACT");
assertMatch(
  runtime,
  /provider_service_runtime_authorization_fingerprint/,
  "PROVIDER_RUNTIME_AUTHORIZATION_BINDING",
);
assertMatch(
  runtime,
  /wallet_reservation_fingerprint/,
  "WALLET_RESERVATION_BINDING",
);
assertMatch(runtime, /runpod_safe_lease_fingerprint/, "RUNPOD_LEASE_BINDING");
assertMatch(
  runtime,
  /LOCAL_MODE_EXTERNAL_AUTHORIZATION_FORBIDDEN/,
  "LOCAL_EXTERNAL_AUTH_FORBIDDEN",
);
assertMatch(
  runtime,
  /PROVIDER_MODE_PREREQUISITES_INVALID/,
  "PROVIDER_PREREQUISITES_ENFORCED",
);
assertMatch(
  runtime,
  /RUNPOD_MODE_PREREQUISITES_INVALID/,
  "RUNPOD_PREREQUISITES_ENFORCED",
);
assertMatch(
  runtime,
  /assertAvantiqoExperimentExecutionApprovalCurrent/,
  "PHASE18_APPROVAL_REVALIDATED",
);
assertMatch(
  runtime,
  /APPROVAL_ALREADY_HAS_EXECUTION_CLAIM/,
  "ONE_CLAIM_PER_APPROVAL",
);
assertMatch(runtime, /single_use: true/, "SINGLE_USE_MARKER");
assertMatch(runtime, /replay_forbidden: true/, "REPLAY_FORBIDDEN");
assertMatch(
  runtime,
  /exact_executor_binding_required: true/,
  "EXACT_EXECUTOR_BINDING",
);
assertMatch(
  runtime,
  /exact_experiment_version_binding_required: true/,
  "EXACT_VERSION_BINDING",
);
assertMatch(
  runtime,
  /execution_receipt_required_on_consumption: true/,
  "EXECUTION_RECEIPT_REQUIRED",
);
assertMatch(
  runtime,
  /claim_creation_executes_experiment: false/,
  "CLAIM_CREATION_DOES_NOT_EXECUTE",
);
assertMatch(
  runtime,
  /claim_creation_calls_provider: false/,
  "CLAIM_CREATION_DOES_NOT_CALL_PROVIDER",
);
assertMatch(
  runtime,
  /claim_creation_reserves_wallet: false/,
  "CLAIM_CREATION_DOES_NOT_RESERVE_WALLET",
);
assertMatch(
  runtime,
  /claim_creation_submits_runpod_job: false/,
  "CLAIM_CREATION_DOES_NOT_SUBMIT_RUNPOD",
);
assertMatch(
  runtime,
  /CONSUMED_SINGLE_EXECUTION_CLAIM/,
  "CONSUMED_STATE",
);
assertMatch(
  runtime,
  /\.eq\("active", true\)/,
  "ATOMIC_ACTIVE_COMPARE_AND_SET",
);
assertMatch(
  runtime,
  /\.eq\("metadata->>status", "READY_FOR_SINGLE_EXECUTION_CONSUMPTION"\)/,
  "ATOMIC_READY_STATUS_COMPARE_AND_SET",
);
assertMatch(
  runtime,
  /CLAIM_ALREADY_CONSUMED_OR_RACE_LOST/,
  "RACE_LOSS_REJECTED",
);
assertMatch(
  runtime,
  /active_execution_authority_remaining: false/,
  "AUTHORITY_REMOVED_AFTER_CONSUMPTION",
);
assertMatch(runtime, /replay_allowed: false/, "REPLAY_NOT_ALLOWED_AFTER_CONSUMPTION");
assertMatch(runtime, /result_recorded_here: false/, "NO_RESULT_FABRICATION_ON_CONSUMPTION");
assertMatch(runtime, /platform_knowledge_written: false/, "NO_PLATFORM_KNOWLEDGE_WRITE");
assertMatch(runtime, /automatic_training_started: false/, "NO_AUTO_TRAINING");
assertMatch(
  index,
  /AvantiqoExperimentExecutionClaimRuntime/,
  "INDEX_EXPORT",
);

if (/AvantiqoExperimentExecutionClaimRuntime/.test(route)) {
  throw new Error(
    "AVANTIQO_LEARNING_WORLDCLASS_PHASE19_AUDIT_FAILED:CLAIM_RUNTIME_MUST_NOT_BE_CALLED_BY_CRON",
  );
}
if (/createAvantiqoExperimentExecutionClaim/.test(route)) {
  throw new Error(
    "AVANTIQO_LEARNING_WORLDCLASS_PHASE19_AUDIT_FAILED:CRON_MUST_NOT_CREATE_CLAIMS",
  );
}
if (/consumeAvantiqoExperimentExecutionClaim/.test(route)) {
  throw new Error(
    "AVANTIQO_LEARNING_WORLDCLASS_PHASE19_AUDIT_FAILED:CRON_MUST_NOT_CONSUME_CLAIMS",
  );
}

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE19_AUDIT=PASS");
console.log(
  "AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_CONTRACT=AVANTIQO_EXPERIMENT_EXECUTION_CLAIM_V1",
);
console.log("AVANTIQO_PHASE19_CLAIM_SINGLE_USE=true");
console.log("AVANTIQO_PHASE19_CLAIM_VALIDITY_MINUTES=10");
console.log("AVANTIQO_PHASE19_ATOMIC_CONSUMPTION=true");
console.log("AVANTIQO_PHASE19_REPLAY_ALLOWED=false");
console.log("AVANTIQO_PHASE19_CRON_CLAIM_CREATION=false");
console.log("AVANTIQO_PHASE19_PROVIDER_CALL_PERFORMED=false");
console.log("AVANTIQO_PHASE19_WALLET_RESERVATION_PERFORMED=false");
console.log("AVANTIQO_PHASE19_RUNPOD_JOB_SUBMITTED=false");
console.log("AVANTIQO_PHASE19_PLATFORM_KNOWLEDGE_WRITTEN=false");
