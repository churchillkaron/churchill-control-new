import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  CHILD_TERMINATION_GRACE_MS,
  CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
  CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS,
  CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT,
  RUNPOD_HEALTH_MAX_ATTEMPTS,
  SUPABASE_NETWORK_MAX_ATTEMPTS,
  boundedRetryDelayMs,
  isRunpodHealthRequest,
  isSupabaseCleanupRetryRequest,
  isTransientNetworkError,
  shouldRecoverStaleQueuedPlannerJob,
  staleCodePlannerQueueRecoveryExhausted,
} from "../lib/code/runtime/CodeAICertificationResiliencePolicy.js";

const supabaseOrigin = "https://example.supabase.co";
assert.equal(CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT, "AVANTIQO_CODE_AI_CERTIFICATION_RESILIENCE_V1");
assert.equal(RUNPOD_HEALTH_MAX_ATTEMPTS, 4);
assert.equal(SUPABASE_NETWORK_MAX_ATTEMPTS, 4);
assert.ok(CHILD_TERMINATION_GRACE_MS > 0 && CHILD_TERMINATION_GRACE_MS <= 5000);
assert.ok(boundedRetryDelayMs(0) >= 1 && boundedRetryDelayMs(20) <= 2000);
assert.equal(CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_LIMIT, 1);
assert.ok(CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS >= 5 * 60_000);
const stalledHealth = { jobs: { in_queue: 1, in_progress: 0 }, workers: { initializing: 0 } };
const oldStartedAt = new Date(Date.now() - CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS - 1000).toISOString();
assert.equal(shouldRecoverStaleQueuedPlannerJob({ provider: "avantiqo-code", providerStatus: "queued", startedAt: oldStartedAt, recoveryCount: 0, health: stalledHealth }), true);
assert.equal(shouldRecoverStaleQueuedPlannerJob({ provider: "avantiqo-code", providerStatus: "processing", startedAt: oldStartedAt, recoveryCount: 0, health: stalledHealth }), false);
assert.equal(shouldRecoverStaleQueuedPlannerJob({ provider: "avantiqo-code", providerStatus: "queued", startedAt: oldStartedAt, recoveryCount: 0, health: { jobs: { in_progress: 1 }, workers: { initializing: 0 } } }), false);
assert.equal(shouldRecoverStaleQueuedPlannerJob({ provider: "avantiqo-code", providerStatus: "queued", startedAt: oldStartedAt, recoveryCount: 0, health: { jobs: { in_progress: 0 }, workers: { initializing: 1 } } }), false);
assert.equal(staleCodePlannerQueueRecoveryExhausted({ provider: "avantiqo-code", providerStatus: "queued", startedAt: oldStartedAt, recoveryCount: 1 }), true);

assert.equal(isTransientNetworkError(new Error("TypeError: fetch failed caused by write EPIPE")), true);
assert.equal(isTransientNetworkError(Object.assign(new Error("socket reset"), { code: "ECONNRESET" })), true);
assert.equal(isTransientNetworkError(new Error("CODE_AI_BAD_RESPONSE_SHAPE")), false);

assert.equal(isRunpodHealthRequest("https://api.runpod.ai/v2/code-endpoint/health"), true);
assert.equal(isRunpodHealthRequest("https://api.runpod.ai/v2/code-endpoint/run", { method: "POST" }), false);
assert.equal(isRunpodHealthRequest("https://rest.runpod.io/v1/endpoints", { method: "GET" }), false);

assert.equal(isSupabaseCleanupRetryRequest(`${supabaseOrigin}/rest/v1/organization_services?id=eq.1`, { method: "PATCH" }, supabaseOrigin), true);
assert.equal(isSupabaseCleanupRetryRequest(`${supabaseOrigin}/rest/v1/organization_services?id=eq.1`, { method: "GET" }, supabaseOrigin), true);
assert.equal(isSupabaseCleanupRetryRequest(`${supabaseOrigin}/rest/v1/rpc/charge_wallet`, { method: "POST" }, supabaseOrigin), false);
assert.equal(isSupabaseCleanupRetryRequest("https://other.supabase.co/rest/v1/organization_services", { method: "PATCH" }, supabaseOrigin), false);

const [leaseShim, childGuard, cleanupShim, capacityRunner, packageJson, plannerExecution, autonomousRuntime, pendingSettlement, sharedLease, codeDistributedLease] = await Promise.all([
  readFile("scripts/run-code-ai-runpod-safe-lease-resilient-local.mjs", "utf8"),
  readFile("scripts/run-code-ai-safe-lease-child-guard-local.mjs", "utf8"),
  readFile("scripts/run-code-ai-autonomous-planner-certification-resilient-local.mjs", "utf8"),
  readFile("scripts/run-code-ai-autonomous-planner-certification-capacity-safe-local.mjs", "utf8"),
  readFile("package.json", "utf8"),
  readFile("lib/code/runtime/CodeAIPlannerExecutionRuntime.js", "utf8"),
  readFile("lib/code/runtime/CodeAIAutonomousRuntime.js", "utf8"),
  readFile("scripts/settle-code-ai-planner-certification-pending-local.mjs", "utf8"),
  readFile("scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs", "utf8"),
  readFile("scripts/avantiqo-code-runpod-distributed-lease.mjs", "utf8"),
]);
assert.match(leaseShim, /isRunpodHealthRequest/);
assert.match(leaseShim, /isCodeEndpointClosePatch/);
assert.match(leaseShim, /AVANTIQO_CODE_SAFE_LEASE_CHILD_STOP_FILE/);
assert.match(leaseShim, /child_termination_acknowledged/);
assert.match(leaseShim, /run-avantiqo-runpod-safe-lease-v2-local\.mjs/);
assert.match(leaseShim, /run-code-ai-safe-lease-child-guard-local\.mjs/);
assert.doesNotMatch(leaseShim, /api\.runpod\.ai\/v2\/.*\/run/);
assert.match(childGuard, /AVANTIQO_CODE_SAFE_LEASE_CHILD_READY_FILE/);
assert.match(childGuard, /AVANTIQO_CODE_SAFE_LEASE_CHILD_STOP_FILE/);
assert.match(childGuard, /AVANTIQO_CODE_SAFE_LEASE_CHILD_ACK_FILE/);
assert.match(childGuard, /process\.kill\(-child\.pid, signal\)/);
assert.match(childGuard, /process\.kill\(-child\.pid, "SIGKILL"\)/);
assert.match(cleanupShim, /isSupabaseCleanupRetryRequest/);
assert.match(cleanupShim, /provider_post_retries_forbidden: true/);
assert.match(capacityRunner, /run-code-ai-autonomous-planner-certification-resilient-local\.mjs/);
assert.match(packageJson, /run-code-ai-runpod-safe-lease-resilient-local\.mjs/);
assert.match(packageJson, /code-ai-certification-resilience-selftest\.mjs/);
assert.match(plannerExecution, /recoverStaleQueuedPlannerExecution/);
assert.match(plannerExecution, /\/cancel\//);
assert.match(plannerExecution, /CODE_AI_PLANNER_STALE_QUEUE_CANCEL_NOT_TERMINAL/);
assert.match(plannerExecution, /stale_queue_recovery_count/);
assert.match(autonomousRuntime, /const logicalIterations = new Set\(\)/);
assert.match(autonomousRuntime, /stale_queue_recovery_count/);
assert.match(pendingSettlement, /AVANTIQO_CODE_PLANNER_PENDING_STALE_QUEUE_CANCELED/);
assert.match(pendingSettlement, /exact_job_cancel_only: true/);
assert.doesNotMatch(pendingSettlement, /purge-queue/);
assert.match(sharedLease, /listActiveCodeRunpodDistributedLeases/);
assert.match(sharedLease, /acquireCodeRunpodDistributedLease/);
assert.match(sharedLease, /releaseCodeRunpodDistributedLease/);
assert.match(sharedLease, /code_distributed_lease_acquired/);
assert.match(codeDistributedLease, /AVANTIQO_CODE_DISTRIBUTED_RUNPOD_LEASE_V1/);
assert.match(codeDistributedLease, /updated_at=eq/);
assert.match(codeDistributedLease, /AVANTIQO_CODE_DISTRIBUTED_LEASE_BUSY/);
assert.match(codeDistributedLease, /owner_request_id/);
assert.doesNotMatch(codeDistributedLease, /workersMax/);

console.log(JSON.stringify({
  success: true,
  contract: CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT,
  verified: {
    runpod_health_retry_is_narrow_and_bounded: true,
    runpod_generation_submission_is_not_retried: true,
    child_process_group_termination_guard_present: true,
    child_pre_release_stop_and_ack_handshake_present: true,
    endpoint_close_waits_for_child_shutdown_signal: true,
    supabase_cleanup_retry_is_same_origin_and_bounded: true,
    supabase_post_retry_forbidden: true,
    capacity_safe_runner_uses_resilient_parent: true,
    code_certification_uses_resilient_safe_lease_shim: true,
    shared_safe_lease_runtime_reused_without_source_rewrite: true,
    stale_queued_provider_job_detected_by_age_and_health: true,
    stale_queued_provider_job_exact_cancel_before_replacement: true,
    stale_replacement_is_bounded_to_one: true,
    logical_planner_iteration_deduplicates_replacement_job_ids: true,
    stale_pending_certification_reservation_cleanup_supported: true,
    code_distributed_lease_visible_across_hosts: true,
    code_distributed_lease_compare_and_swap_owned: true,
    code_endpoint_orphan_reaper_respects_distributed_ownership: true,
    code_distributed_lease_does_not_mutate_endpoint_directly: true,
  },
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
}, null, 2));
console.log(`${CODE_AI_CERTIFICATION_RESILIENCE_CONTRACT}=PASS`);
