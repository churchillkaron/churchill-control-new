import fs from "node:fs";

const CONTRACT = "AVANTIQO_LEARNING_WORLDCLASS_PHASE18_AUDIT_V1";
const ROOT = process.cwd();

function read(path) {
  return fs.readFileSync(`${ROOT}/${path}`, "utf8");
}

function requireMarker(source, marker, code) {
  if (!source.includes(marker)) {
    throw new Error(`${CONTRACT}_${code}_MISSING:${marker}`);
  }
}

function forbidMarker(source, marker, code) {
  if (source.includes(marker)) {
    throw new Error(`${CONTRACT}_${code}_FORBIDDEN:${marker}`);
  }
}

const runtimePath =
  "lib/intelligence/runtime/AvantiqoExperimentExecutionGovernanceRuntime.js";
const routePath =
  "app/api/internal/intelligence/continuous-learning/process/route.js";
const indexPath = "lib/intelligence/index.js";

const runtime = read(runtimePath);
const route = read(routePath);
const index = read(indexPath);

requireMarker(
  runtime,
  '"AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_V1"',
  "RUNTIME_CONTRACT",
);
requireMarker(
  runtime,
  '"platform_learning_experiment_execution_requests"',
  "REQUEST_SCOPE",
);
requireMarker(
  runtime,
  '"platform_learning_experiment_execution_approvals"',
  "APPROVAL_SCOPE",
);
requireMarker(
  runtime,
  '"AWAITING_EXPLICIT_EXPERIMENT_EXECUTION_APPROVAL"',
  "EXPLICIT_APPROVAL_REQUIRED",
);
requireMarker(
  runtime,
  '"APPROVED_FOR_ONE_TIME_EXECUTION_CLAIM"',
  "ONE_TIME_CLAIM_APPROVAL",
);
requireMarker(runtime, "independent_approver !== true", "INDEPENDENT_APPROVER");
requireMarker(
  runtime,
  "APPROVED_COST_EXCEEDS_CONSERVATIVE_ESTIMATE",
  "COST_BOUND",
);
requireMarker(
  runtime,
  "APPROVAL_EXPIRY_EXCEEDS_BOUND",
  "APPROVAL_EXPIRY_BOUND",
);
requireMarker(
  runtime,
  "assertAvantiqoExperimentSelectionCurrent",
  "CURRENT_SELECTION_REVALIDATION",
);
requireMarker(
  runtime,
  "exact_experiment_version_binding_required_at_claim: true",
  "EXACT_VERSION_BINDING",
);
requireMarker(
  runtime,
  "approval_replay_after_claim_forbidden: true",
  "APPROVAL_REPLAY_FORBIDDEN",
);
requireMarker(
  runtime,
  "direct_provider_call_authorized: false",
  "NO_DIRECT_PROVIDER_AUTH",
);
requireMarker(
  runtime,
  "direct_supplier_spend_authorized: false",
  "NO_DIRECT_SPEND_AUTH",
);
requireMarker(
  runtime,
  "direct_wallet_reservation_authorized: false",
  "NO_DIRECT_WALLET_AUTH",
);
requireMarker(
  runtime,
  "direct_runpod_call_authorized: false",
  "NO_DIRECT_RUNPOD_AUTH",
);
requireMarker(
  runtime,
  "runpod_safe_lease_contract: RUNPOD_SAFE_LEASE_CONTRACT",
  "RUNPOD_SAFE_LEASE_BINDING",
);
requireMarker(
  runtime,
  'const RUNPOD_SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2"',
  "RUNPOD_SAFE_LEASE_V2",
);
requireMarker(
  runtime,
  "experiment_execution_performed_here: false",
  "NO_EXECUTION",
);
requireMarker(runtime, "result_fabricated: false", "NO_FABRICATED_RESULT");
requireMarker(
  runtime,
  "reusable_platform_knowledge: false",
  "NO_REUSABLE_KNOWLEDGE",
);
requireMarker(
  runtime,
  'automatic_training_effect: "NONE"',
  "NO_AUTOMATIC_TRAINING",
);
requireMarker(
  runtime,
  'authorization_value: "one_time_execution_claim_only"',
  "LIMITED_AUTHORIZATION_VALUE",
);
requireMarker(
  route,
  "reconcileAvantiqoExperimentExecutionRequests",
  "ROUTE_REQUEST_RECONCILIATION",
);
requireMarker(
  route,
  "await reconcileAvantiqoExperimentExecutionRequests()",
  "ROUTE_REQUEST_ORDER",
);
forbidMarker(
  route,
  "recordAvantiqoExperimentExecutionApproval(",
  "CRON_AUTO_APPROVAL",
);
forbidMarker(
  route,
  "assertAvantiqoExperimentExecutionApprovalCurrent(",
  "CRON_EXECUTION_CLAIM_AUTH",
);
requireMarker(
  index,
  'export * from "./runtime/AvantiqoExperimentExecutionGovernanceRuntime";',
  "INDEX_EXPORT",
);

console.log("AVANTIQO_LEARNING_WORLDCLASS_PHASE18_AUDIT=PASS");
console.log(
  "AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_CONTRACT=AVANTIQO_EXPERIMENT_EXECUTION_GOVERNANCE_V1",
);
console.log("AVANTIQO_PHASE18_CRON_AUTO_APPROVAL=false");
console.log("AVANTIQO_PHASE18_DIRECT_PROVIDER_AUTHORIZED=false");
console.log("AVANTIQO_PHASE18_DIRECT_WALLET_RESERVATION_AUTHORIZED=false");
console.log("AVANTIQO_PHASE18_DIRECT_RUNPOD_AUTHORIZED=false");
console.log("AVANTIQO_PHASE18_EXPERIMENT_EXECUTION_PERFORMED=false");
console.log("AVANTIQO_PHASE18_RUNPOD_SAFE_LEASE_CONTRACT=AVANTIQO_RUNPOD_SAFE_LEASE_V2");
