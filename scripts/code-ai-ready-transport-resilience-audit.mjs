import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_READY_TRANSPORT_RESILIENCE_AUDIT_V1";
const workerPath = "lib/code/runtime/CodeAIWorkerSessionRuntime.js";
const packagePath = "lib/code/runtime/CodeAIWorkPackageRuntimeLive.js";
const [worker, workPackage] = await Promise.all([
  readFile(workerPath, "utf8"),
  readFile(packagePath, "utf8"),
]);

function requireMarkers(label, source, markers) {
  const missing = markers.filter((marker) => !source.includes(marker));
  if (missing.length) {
    throw new Error(`${CONTRACT}_${label}_MISSING:${missing.join("|")}`);
  }
}

requireMarkers("LOCAL_DURABLE_TRANSPORT", worker, [
  '"AVANTIQO_CODE_AI_WORKER_SESSION_V4_LOCAL"',
  'infrastructure_provider:"AVANTIQO_LOCAL_NODE_V1"',
  'execution_transport_mode:"LOCAL_DURABLE_QUEUE"',
  'ready, warming:false',
  'worker_started:false',
  'worker_session_created:false',
  'scale_to_zero_required:false',
]);
assert.equal(worker.includes("confirmReadyTransportHealth"), false);
assert.equal(worker.includes("tokenForSession"), false);
assert.match(worker, /resolveCodeAIWorkerSessionTransport\(\)[^{]*\{[^}]*current\.ready \? current : null/s);

requireMarkers("PRE_PROVIDER_ACCOUNTING", workPackage, [
  "PRE_PROVIDER_RESUMABLE_PLANNER_ERRORS",
  '"CODE_AI_PLANNER_WARM_SESSION_NOT_READY"',
  "preProviderResumablePlannerError",
  "reasoning_calls_used: Math.max(0, callNumber - 1)",
  "pending_reasoning_call: null",
  'status: "planner_pending"',
  'reason: "CODE_AI_BATCHED_PLANNER_TRANSPORT_PENDING"',
  'kind: "planner_transport_wait"',
  "reasoning_call_charged: false",
  "provider_execution_submitted: false",
]);

const plannerTryIndex = workPackage.indexOf("planned = await executeCodeAIPlannerRequest");
const plannerCatchIndex = workPackage.indexOf("} catch (error) {", plannerTryIndex);
const refundGuardIndex = workPackage.indexOf("preProviderResumablePlannerError(error)", plannerCatchIndex);
const refundIndex = workPackage.indexOf("reasoning_calls_used: Math.max(0, callNumber - 1)", refundGuardIndex);
const genericFailureIndex = workPackage.indexOf('phase: "PLANNING_FAILED"', refundIndex);
assert.ok(plannerTryIndex >= 0, "planner execution call must exist");
assert.ok(plannerCatchIndex > plannerTryIndex, "planner execution must have a guarded catch path");
assert.ok(refundGuardIndex > plannerCatchIndex, "reasoning refund must be guarded by exact pre-provider error classification");
assert.ok(refundIndex > refundGuardIndex, "reasoning refund must occur only inside pre-provider guard");
assert.ok(genericFailureIndex > refundIndex, "ordinary planner failures must remain outside the refund branch");

const errorSetStart = workPackage.indexOf("const PRE_PROVIDER_RESUMABLE_PLANNER_ERRORS");
const errorSetEnd = workPackage.indexOf("]);", errorSetStart);
const errorSet = workPackage.slice(errorSetStart, errorSetEnd + 3);
assert.match(errorSet, /CODE_AI_PLANNER_WARM_SESSION_NOT_READY/);
assert.equal(errorSet.includes("CODE_AI_PLANNER_EXECUTION_FAILED"), false);
assert.equal(errorSet.includes("CODE_AI_PLANNER_PROVIDER_EXECUTION_FAILED"), false);
assert.equal(errorSet.includes("CODE_AI_WORK_PACKAGE_JSON_INVALID"), false);
assert.equal(errorSet.includes("CODE_AI_WORK_PACKAGE_ACTION_NOT_ALLOWED_FOR_PHASE"), false);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    local_durable_transport_is_direct_and_bounded: true,
    local_transport_has_no_remote_health_retry_loop: true,
    local_transport_has_no_session_credentials: true,
    local_transport_requires_ready_configuration: true,
    warm_session_not_ready_is_explicitly_pre_provider: true,
    warm_session_not_ready_rolls_back_attempted_reasoning_call: true,
    warm_session_not_ready_returns_resumable_planner_pending: true,
    warm_session_not_ready_does_not_create_fake_pending_provider_job: true,
    provider_execution_failures_are_not_refunded: true,
    planner_output_failures_are_not_refunded: true,
    source_mutation_performed_by_audit: false,
    provider_call_performed_by_audit: false,
    wallet_mutation_performed_by_audit: false,
    runpod_mutation_performed_by_audit: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
}, null, 2));
console.log(`${CONTRACT}=PASS`);
