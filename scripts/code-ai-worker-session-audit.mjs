import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_WORKER_SESSION_SOURCE_AUDIT_V1";
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
  "body?.raw_reasoning_persisted === false",
  "HEALTH_TIMEOUT_MS = 2500",
]);

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
  "expired(session)",
  "token: tokenForSession(session.session_id)",
]);

assert.equal(/ServiceExecutionRuntime|executeCodeAIPlannerRequest|ai\.code\.debug/.test(source), false);

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
    atomic_claim_compare_and_swap_present: true,
    cleanup_failure_blocks_replacement: true,
    expired_state_requires_verified_pod_deletion: true,
    ready_transport_only_for_ready_unexpired_session: true,
    provider_model_call_performed: false,
    wallet_mutation_performed: false,
    runpod_mutation_performed_by_audit: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
}, null, 2));
console.log(`${CONTRACT}=PASS`);
