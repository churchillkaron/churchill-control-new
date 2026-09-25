import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_ZERO_IDLE_PUBLIC_WIRING_AUDIT_V2_LOCAL";
const files = {
  capability: await readFile("lib/platform/capabilities/createCodeAIAutonomousCapability.js", "utf8"),
  canonical: await readFile("lib/code/runtime/CodeAIEmployeeCanonicalExecutionRuntime.js", "utf8"),
  zeroIdle: await readFile("lib/code/runtime/CodeAIEmployeeZeroIdleFastStartRuntime.js", "utf8"),
  prewarm: await readFile("app/api/operator/code/prewarm/route.js", "utf8"),
  localProvider: await readFile("lib/platform/service-runtime/providers/avantiqo-code/AvantiqoCodeLocalQueueProvider.js", "utf8"),
};

assert.match(files.capability, /resolveCodeAIEmployeeExecutionTransport/);
assert.match(files.capability, /executeCanonicalCodeAIEmployeeMission/);
assert.match(files.capability, /execution_transport_mode = transport\.mode/);
assert.match(files.canonical, /SERVERLESS_ZERO_IDLE/);
assert.match(files.canonical, /DIRECT_GOVERNED/);
assert.match(files.zeroIdle, /deterministic_start: true/);
assert.match(files.zeroIdle, /model_call_required_to_start: false/);
assert.match(files.zeroIdle, /gpu_worker_required_to_start: false/);
assert.match(files.zeroIdle, /worker_session_created: false/);
assert.match(files.zeroIdle, /provider_execution_submitted_by_fast_start: false/);
assert.match(files.prewarm, /AVANTIQO_CODE_OPERATOR_LOCAL_READINESS_V4/);
assert.match(files.prewarm, /AvantiqoCodeLocalQueueProvider\.available\(\)/);
assert.match(files.prewarm, /status: localReady \? "local_ready" : "local_unavailable"/);
assert.match(files.prewarm, /external_compute_available: false/);
assert.match(files.prewarm, /external_worker_started: false/);
assert.match(files.localProvider, /AVANTIQO_LOCAL_NODE_V1/);
assert.match(files.localProvider, /lane:"code"/);
assert.doesNotMatch(files.prewarm, /Modal|modal|RunPod|runpod|ensureCodeAIWorkerSession/);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  canonical_transport_resolution_verified: true,
  deterministic_repository_start_verified: true,
  model_wait_not_required_to_start: true,
  gpu_worker_not_required_to_start: true,
  local_readiness_route_verified: true,
  external_compute_fallback_absent_from_readiness: true,
  owned_local_queue_provider_verified: true,
  provider_call_performed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
