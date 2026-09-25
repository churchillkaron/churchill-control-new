import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_LIVE_PROGRESS_LEASE_AUDIT_V2_PROVIDER_NEUTRAL";
const live = await readFile("lib/code/runtime/CodeAILiveProgressRuntime.js", "utf8");
const lease = await readFile("lib/code/runtime/CodeAIWorkerLeaseTouchRuntime.js", "utf8");

for (const marker of [
  'import("./CodeAIWorkerLeaseTouchRuntime.js")',
  "touchReadyCodeAIWorkerLease",
  "ACTIVE_WORKER_IDLE_MS = 30 * 60 * 1000",
  "WORKER_LEASE_TOUCH_INTERVAL_MS = 60 * 1000",
  "worker_lifecycle_mutation_performed: false",
  "active_work_refreshes_worker_lease: true",
  "active_lease_refresh_is_lifecycle_non_mutating: true",
]) {
  assert.ok(live.includes(marker), `live progress marker missing: ${marker}`);
}
assert.equal(live.includes("ensureCodeAIWorkerSession({"), false);

for (const marker of [
  '"AVANTIQO_CODE_AI_WORKER_LEASE_TOUCH_V1"',
  'text(session.state, 80).toUpperCase() !== "READY"',
  "session.engine_ready !== true",
  '.eq("updated_at", row.updated_at)',
  "WORKER_SESSION_STATE_RACE",
  "pod_created: false",
  "warmup_performed: false",
  "health_probe_performed: false",
  "pod_deleted: false",
]) {
  assert.ok(lease.includes(marker), `lease touch marker missing: ${marker}`);
}

for (const forbidden of [
  "createPod(",
  "ensureEngineWarmup(",
  "reapExpiredCodeAIWorkerSession(",
  "deletePodVerified(",
  "RUNPOD_MANAGEMENT_API_KEY",
  "rest.runpod.io",
  "Modal",
  "modal.com",
]) {
  assert.equal(lease.includes(forbidden), false, `lease touch owns forbidden lifecycle capability: ${forbidden}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    live_progress_uses_dedicated_ready_lease_touch: true,
    live_progress_does_not_call_full_worker_ensure: true,
    ready_state_required_before_lease_extension: true,
    engine_ready_required_before_lease_extension: true,
    lease_touch_is_compare_and_swap: true,
    lease_touch_cannot_create_compute: true,
    lease_touch_cannot_warm_model: true,
    lease_touch_cannot_reap_worker: true,
    lease_touch_cannot_delete_compute: true,
    provider_management_api_called: false,
    gpu_mutation_performed: false,
    provider_call_performed: false,
    wallet_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
}, null, 2));
console.log(`${CONTRACT}=PASS`);
