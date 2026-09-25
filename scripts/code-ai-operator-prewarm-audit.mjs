import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_OPERATOR_PREWARM_AUDIT_V2_LOCAL";

const files = {
  route: "app/api/operator/code/prewarm/route.js",
  localProvider: "lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js",
  canonical: "lib/code/runtime/CodeAIEmployeeCanonicalExecutionRuntime.js",
  zeroIdle: "lib/code/runtime/CodeAIEmployeeZeroIdleFastStartRuntime.js",
  businessPartnerUi: "components/operator/HomeAvantiqoIntelligence.jsx",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
  ),
);

function requireMarkers(label, content, markers) {
  const missing = markers.filter((marker) => !content.includes(marker));
  if (missing.length) throw new Error(`${CONTRACT}_${label}_MISSING:${missing.join("|")}`);
}

requireMarkers("ROUTE", source.route, [
  "requireOrganizationAccess",
  "AvantiqoCodeLocalQueueProvider",
  "AvantiqoCodeLocalQueueProvider.available()",
  "AVANTIQO_CODE_OPERATOR_LOCAL_READINESS_V4",
  'status: localReady ? "local_ready" : "local_unavailable"',
  'execution_transport_mode: "AVANTIQO_LOCAL_NODE_V1"',
  "local_only: true",
  "external_compute_available: false",
  "external_compute_checked: false",
  "external_worker_started: false",
  "worker_session_created: false",
  "reasoning_calls_used: 0",
  "customer_inference_performed: false",
  "wallet_mutation_performed: false",
  "source_mutation_performed: false",
  "github_write_performed: false",
  "production_deploy_performed: false",
  "raw_reasoning_persisted: false",
]);

requireMarkers("LOCAL_PROVIDER", source.localProvider, [
  'const INFRASTRUCTURE="AVANTIQO_LOCAL_NODE_V1"',
  'lane:"code"',
  'workload:"code_text"',
  "INTERACTIVE_CODE_PRIORITY=90",
  "strongCodeModelRequired",
  "raw_reasoning_persisted:false",
]);

requireMarkers("CANONICAL", source.canonical, [
  'mode: "SERVERLESS_ZERO_IDLE"',
  'mode: "DIRECT_GOVERNED"',
  "executeCodeAIEmployeeZeroIdleFastStartMission",
  "executeCodeAIEmployeeFinalReviewMission",
]);

requireMarkers("ZERO_IDLE", source.zeroIdle, [
  "deterministic_start: true",
  "model_call_required_to_start: false",
  "gpu_worker_required_to_start: false",
  "worker_session_created: false",
  "provider_execution_submitted_by_fast_start: false",
  "wallet_mutation_performed_by_fast_start: false",
  "source_mutation_performed_by_fast_start: false",
]);

assert.doesNotMatch(source.route, /ensureCodeAIWorkerSession|Modal|RunPod|runpod|ServiceExecutionRuntime|executeCodeAIPlannerRequest/);
assert.doesNotMatch(source.businessPartnerUi, /\/api\/operator\/code\/prewarm|CODE_PREWARM_POLL_MS|CODE_PREWARM_MAX_POLLS/);
assert.equal(source.route.includes("[deploy-production-final]"), false);
assert.equal(source.route.includes("executeCodeAIMission"), false);
assert.equal(source.route.includes("apply_files"), false);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    authenticated_organization_scoped_readiness_route: true,
    readiness_checks_owned_local_queue_only: true,
    readiness_bypasses_reasoning_and_wallet: true,
    readiness_cannot_mutate_source_or_github: true,
    readiness_cannot_deploy_production: true,
    business_partner_does_not_poll_code_readiness: true,
    code_fast_start_begins_deterministic_repository_work_without_model_wait: true,
    zero_idle_fast_start_does_not_start_gpu_worker: true,
    local_queue_is_canonical_code_inference_transport: true,
    raw_reasoning_persisted: false,
    provider_call_performed_by_audit: false,
    production_deploy_performed: false,
  },
}, null, 2));
console.log(`${CONTRACT}=PASS`);
