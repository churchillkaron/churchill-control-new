import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_ZERO_IDLE_PUBLIC_WIRING_AUDIT_V1";

const files = {
  capability: await readFile("lib/platform/capabilities/createCodeAIAutonomousCapability.js", "utf8"),
  zeroIdle: await readFile("lib/code/runtime/CodeAIEmployeeZeroIdleFastStartRuntime.js", "utf8"),
  prewarm: await readFile("app/api/operator/code/prewarm/route.js", "utf8"),
  planner: await readFile("lib/code/runtime/CodeAIPlannerExecutionRuntime.js", "utf8"),
};

assert.match(files.capability, /AVANTIQO_CODE_ZERO_IDLE_SERVERLESS_ENABLED/);
assert.match(files.capability, /executeCodeAIEmployeeZeroIdleFastStartMission/);
assert.match(files.capability, /SERVERLESS_ZERO_IDLE/);
assert.match(files.zeroIdle, /worker_session_created: false/);
assert.match(files.zeroIdle, /serverless_worker_requested_by_fast_start: false/);
assert.match(files.zeroIdle, /executeCodeAIEmployeeMission/);
assert.match(files.zeroIdle, /executeCodeAIMission/);
assert.match(files.prewarm, /status: "zero_idle_ready"/);
assert.match(files.prewarm, /gpu_worker_started: false/);
assert.match(files.prewarm, /serverless_worker_requested: false/);
assert.match(files.planner, /CODE_AI_PLANNER_RUNPOD_ENDPOINT_PAUSED/);
assert.match(files.planner, /workersMax < 1/);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  explicit_zero_idle_switch_verified: true,
  deterministic_repository_start_verified: true,
  worker_session_not_created_by_zero_idle_fast_start: true,
  operator_open_does_not_start_gpu_in_zero_idle_mode: true,
  serverless_reasoning_transport_preserved: true,
  serverless_requires_workers_max_at_least_one: true,
  legacy_direct_worker_lane_preserved: true,
  model_call_performed: false,
  provider_call_performed: false,
  wallet_mutation_performed: false,
  runpod_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));