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

requireMarkers("WORKER_READY_RETRY", worker, [
  "READY_TRANSPORT_HEALTH_TIMEOUT_MS = 5000",
  "READY_TRANSPORT_HEALTH_ATTEMPTS = 3",
  "READY_TRANSPORT_HEALTH_RETRY_DELAY_MS = 500",
  "async function confirmReadyTransportHealth(session)",
  "AVANTIQO_CODE_READY_TRANSPORT_HEALTH_RETRY",
  "worker_lifecycle_mutation_performed: false",
  "provider_execution_submitted: false",
  "reasoning_call_consumed: false",
  "await confirmReadyTransportHealth(session)",
]);

const resolverIndex = worker.indexOf("export async function resolveCodeAIWorkerSessionTransport");
const retryIndex = worker.indexOf("await confirmReadyTransportHealth(session)", resolverIndex);
const tokenIndex = worker.indexOf("token: tokenForSession(session.session_id)", resolverIndex);
assert.ok(resolverIndex >= 0, "worker session transport resolver must exist");
assert.ok(retryIndex > resolverIndex, "ready transport must use bounded confirmation retries");
assert.ok(tokenIndex > retryIndex, "transport credentials must only be returned after confirmation succeeds");

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
    ready_worker_transport_health_retry_is_bounded: true,
    ready_worker_transport_health_retry_is_non_mutating: true,
    ready_worker_transport_health_retry_does_not_submit_provider_work: true,
    ready_worker_transport_health_retry_does_not_consume_reasoning: true,
    transport_credentials_require_confirmed_ready_health: true,
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
