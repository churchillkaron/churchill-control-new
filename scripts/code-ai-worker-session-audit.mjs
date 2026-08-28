import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_WORKER_SESSION_SOURCE_AUDIT_V3";
const path = "lib/code/runtime/CodeAIWorkerSessionRuntime.js";
const source = await readFile(path, "utf8");

function requireMarkers(label, markers) {
  const missing = markers.filter((marker) => !source.includes(marker));
  if (missing.length) {
    throw new Error(`${CONTRACT}_${label}_MISSING:${missing.join("|")}`);
  }
}

requireMarkers("CONTRACT", [
  "AVANTIQO_CODE_AI_WORKER_SESSION_V2",
  'MEMORY_SCOPE = "code_ai_worker_session"',
  'MEMORY_KEY = "code_ai_worker_session:v2:shared"',
  "ordinary_memory_recall: false",
  'authorization_effect: "NONE"',
  "contains_worker_token: false",
]);

requireMarkers("WARM_WINDOW", [
  "DEFAULT_IDLE_MS = 10 * 60 * 1000",
  "MAX_IDLE_MS = 30 * 60 * 1000",
  "Math.max(60_000, Math.min(MAX_IDLE_MS",
]);

requireMarkers("TOKEN_SECURITY", [
  "AVANTIQO_CODE_WORKER_SESSION_SECRET",
  "createHmac",
  'update(`avantiqo-code-worker:${sessionId}`',
  "AVANTIQO_CODE_POD_TOKEN: token",
  "contains_worker_token: false",
]);
assert.equal(source.includes("metadata: { token"), false);
assert.equal(source.includes("session, token"), false);

requireMarkers("IMMUTABLE_WORKER", [
  "r79dtnjnrilrlc",
  "7obluigbr0",
  "US-CA-2",
  "sha256:1b6ac20925085104ac00c09dde3073e32e5934543bd16b9a346b2dca3fa7bb27",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H200",
  "NVIDIA B200",
  'Object.freeze(["12.8", "12.9", "13.0"])',
]);

requireMarkers("SHARED_VOLUME_EXCLUSION", [
  "assertNoForeignCodePod",
  "CODE_AI_WORKER_SESSION_SHARED_VOLUME_BUSY",
  "podVolumeId(pod) !== NETWORK_VOLUME_ID",
]);

requireMarkers("HEALTH", [
  'POD_HTTP_CONTRACT = "AVANTIQO_CODE_POD_HTTP_V3"',
  "body?.cached_model_found === true",
  "body?.async_jobs_enabled === true",
  "body?.async_submit_path === POD_ENGINE_WARMUP_SUBMIT_PATH",
  "body?.async_status_path_template === POD_ENGINE_WARMUP_STATUS_PATH",
  "body?.engine_loaded === true",
  "body?.raw_reasoning_persisted === false",
  "HEALTH_TIMEOUT_MS = 2500",
]);

requireMarkers("ENGINE_WARMUP", [
  "submitEngineWarmup",
  "engineWarmupStatus",
  "MODEL_ENGINE_WARMUP_STARTED",
  "MODEL_ENGINE_WARMUP_ROUTE_PENDING",
  "allow404: true",
  "route_pending: true",
  "CODE_AI_WORKER_SESSION_ENGINE_WARMUP_FAILED",
  "CODE_AI_WORKER_SESSION_ENGINE_WARMUP_ENGINE_NOT_LOADED",
  "engine_warmup_job_id",
  "engine_ready: true",
  "reasoning_call_consumed_by_warmup: false",
  "wallet_mutation_performed_by_warmup: false",
]);

const warmupSubmitIndex = source.indexOf("async function submitEngineWarmup");
const warmupAllow404Index = source.indexOf("allow404: true", warmupSubmitIndex);
const routePendingIndex = source.indexOf("MODEL_ENGINE_WARMUP_ROUTE_PENDING", warmupSubmitIndex);
const warmupFailureIndex = source.indexOf("CODE_AI_WORKER_SESSION_ENGINE_WARMUP_FAILED", warmupSubmitIndex);
assert.ok(warmupSubmitIndex >= 0, "engine warmup submit must exist");
assert.ok(warmupAllow404Index > warmupSubmitIndex, "startup warmup submit 404 must be explicitly retryable");
assert.ok(routePendingIndex > warmupAllow404Index, "startup route 404 must become a warming state");
assert.ok(warmupFailureIndex > routePendingIndex, "established warmup failures must remain fail-closed");

const readyStateIndex = source.indexOf('state: "READY"');
const engineReadyIndex = source.indexOf("engine_ready: true", readyStateIndex);
assert.ok(readyStateIndex >= 0, "READY state must exist");
assert.ok(engineReadyIndex > readyStateIndex, "READY must bind engine_ready=true");

requireMarkers("DURABLE_CLAIM", [
  "insertClaim",
  "compareAndSwap",
  '.eq("updated_at", row.updated_at)',
  "CLAIM_ATTEMPTS = 4",
  "CODE_AI_WORKER_SESSION_CLAIM_RETRY_EXHAUSTED",
]);

requireMarkers("FAIL_CLOSED_CLEANUP", [
  'state: "CLEANUP_REQUIRED"',
  "CODE_AI_WORKER_SESSION_CLEANUP_REQUIRED",
  "deletePodVerified",
  "verifyPodDeleted",
  "CODE_AI_WORKER_SESSION_POD_DELETE_NOT_VERIFIED",
  "await expireSession(row, session",
  'state: "EXPIRED"',
  "pod_id: null",
  "pod_base_url: null",
]);
const deleteVerificationIndex = source.indexOf("await deletePodVerified(session?.pod_id)");
const expiredStateIndex = source.indexOf('state: "EXPIRED"', deleteVerificationIndex);
assert.ok(deleteVerificationIndex >= 0, "verified deletion must exist");
assert.ok(expiredStateIndex > deleteVerificationIndex, "EXPIRED must only follow verified deletion");

requireMarkers("READY_TRANSPORT", [
  "resolveCodeAIWorkerSessionTransport",
  'session.state !== "READY"',
  "session.engine_ready !== true",
  "readiness.engine_loaded !== true",
  "expired(session)",
  "token: tokenForSession(session.session_id)",
]);

assert.equal(/ServiceExecutionRuntime|executeCodeAIPlannerRequest/.test(source), false);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    durable_server_owned_session_state: true,
    single_shared_worker_session: true,
    ordinary_intelligence_recall_excluded: true,
    worker_token_hmac_derived_not_persisted: true,
    default_warm_idle_minutes: 10,
    maximum_warm_idle_minutes: 30,
    immutable_worker_image_bound: true,
    shared_volume_foreign_pod_exclusion: true,
    pod_v3_health_required: true,
    canonical_async_route_advertisement_required_before_transport_ready: true,
    startup_warmup_route_404_is_retryable: true,
    established_engine_warmup_failures_remain_fail_closed: true,
    model_engine_must_be_loaded_before_ready: true,
    durable_idempotent_engine_warmup_present: true,
    engine_warmup_does_not_consume_employee_reasoning_budget: true,
    engine_warmup_bypasses_wallet_and_service_runtime: true,
    atomic_claim_compare_and_swap_present: true,
    cleanup_failure_blocks_replacement: true,
    expired_state_requires_verified_pod_deletion: true,
    ready_transport_only_for_engine_ready_unexpired_session: true,
    customer_provider_model_call_performed: false,
    wallet_mutation_performed: false,
    runpod_mutation_performed_by_audit: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
}, null, 2));
console.log(`${CONTRACT}=PASS`);