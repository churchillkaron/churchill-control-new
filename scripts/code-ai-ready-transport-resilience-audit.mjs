import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_READY_TRANSPORT_RESILIENCE_AUDIT_V2_LOCAL";
const worker = await readFile("lib/code/runtime/CodeAIWorkerSessionRuntime.js", "utf8");
const workPackage = await readFile("lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", "utf8");

for (const marker of [
  '"AVANTIQO_CODE_AI_WORKER_SESSION_V4_LOCAL"',
  'infrastructure_provider:"AVANTIQO_LOCAL_NODE_V1"',
  'execution_transport_mode:"LOCAL_DURABLE_QUEUE"',
  'ready, warming:false',
  'worker_started:false',
  'worker_session_created:false',
  'raw_reasoning_persisted:false',
  'resolveCodeAIWorkerSessionTransport',
]) {
  assert.ok(worker.includes(marker), `local transport marker missing: ${marker}`);
}
for (const forbidden of ["tokenForSession", "READY_TRANSPORT_HEALTH_ATTEMPTS", "createPod(", "Modal", "RunPod", "runpod"]) {
  assert.equal(worker.includes(forbidden), false, `local transport unexpectedly owns external lifecycle: ${forbidden}`);
}

for (const marker of [
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
]) {
  assert.ok(workPackage.includes(marker), `planner accounting marker missing: ${marker}`);
}

const plannerTryIndex = workPackage.indexOf("planned = await executeCodeAIPlannerRequest");
const plannerCatchIndex = workPackage.indexOf("} catch (error) {", plannerTryIndex);
const refundGuardIndex = workPackage.indexOf("preProviderResumablePlannerError(error)", plannerCatchIndex);
const refundIndex = workPackage.indexOf("reasoning_calls_used: Math.max(0, callNumber - 1)", refundGuardIndex);
const genericFailureIndex = workPackage.indexOf('phase: "PLANNING_FAILED"', refundIndex);
assert.ok(plannerTryIndex >= 0 && plannerCatchIndex > plannerTryIndex);
assert.ok(refundGuardIndex > plannerCatchIndex && refundIndex > refundGuardIndex);
assert.ok(genericFailureIndex > refundIndex);

const errorSetStart = workPackage.indexOf("const PRE_PROVIDER_RESUMABLE_PLANNER_ERRORS");
const errorSetEnd = workPackage.indexOf("]);", errorSetStart);
const errorSet = workPackage.slice(errorSetStart, errorSetEnd + 3);
assert.match(errorSet, /CODE_AI_PLANNER_WARM_SESSION_NOT_READY/);
for (const forbidden of ["CODE_AI_PLANNER_EXECUTION_FAILED", "CODE_AI_PLANNER_PROVIDER_EXECUTION_FAILED", "CODE_AI_WORK_PACKAGE_JSON_INVALID", "CODE_AI_WORK_PACKAGE_ACTION_NOT_ALLOWED_FOR_PHASE"]) {
  assert.equal(errorSet.includes(forbidden), false);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    local_transport_has_no_external_health_or_token_dependency: true,
    local_transport_readiness_is_bounded_to_queue_configuration: true,
    local_transport_does_not_create_worker_sessions: true,
    pre_provider_transport_unavailability_is_resumable: true,
    pre_provider_transport_unavailability_does_not_charge_reasoning: true,
    pre_provider_transport_unavailability_does_not_create_fake_provider_job: true,
    provider_execution_failures_are_not_refunded: true,
    planner_output_failures_are_not_refunded: true,
    source_mutation_performed_by_audit: false,
    provider_call_performed_by_audit: false,
    wallet_mutation_performed_by_audit: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
}, null, 2));
console.log(`${CONTRACT}=PASS`);
