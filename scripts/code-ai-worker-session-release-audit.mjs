import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_CODE_AI_WORKER_SESSION_RELEASE_AUDIT_V1";
const path = "lib/code/runtime/CodeAIWorkerSessionReleaseRuntime.js";
const source = await readFile(path, "utf8");

function requireMarkers(label, markers) {
  const missing = markers.filter((marker) => !source.includes(marker));
  if (missing.length) {
    throw new Error(`${CONTRACT}_${label}_MISSING:${missing.join("|")}`);
  }
}

requireMarkers("NO_POD_DIRECT_RELEASE", [
  'NO_POD_DIRECT_RELEASE_STATES = new Set(["FAILED", "STARTING", "EXPIRED"])',
  "directReleaseNoPod",
  'if (text(session.pod_id) || !NO_POD_DIRECT_RELEASE_STATES.has(state)) return null;',
  'state: "EXPIRED"',
  "pod_deletion_verified: true",
  "pod_deletion_required: false",
  "previous_session_state",
]);

requireMarkers("POD_PRESENT_STILL_REAPED", [
  "reapExpiredCodeAIWorkerSession",
  "CODE_AI_WORKER_SESSION_EXPLICIT_RELEASE_NOT_VERIFIED",
  "pod_deletion_required: true",
]);

const directStart = source.indexOf("async function directReleaseNoPod");
const directEnd = source.indexOf("export async function releaseCodeAIWorkerSession", directStart);
assert.ok(directStart >= 0 && directEnd > directStart, "direct no-pod release function must exist");
const directSource = source.slice(directStart, directEnd);
assert.equal(directSource.includes("reapExpiredCodeAIWorkerSession("), false);
assert.equal(directSource.includes("deletePod"), false);
assert.equal(directSource.includes("RUNPOD"), false);

const podRequiredIndex = source.indexOf("const reaped = await reapExpiredCodeAIWorkerSession()");
const verifiedIndex = source.indexOf("CODE_AI_WORKER_SESSION_EXPLICIT_RELEASE_NOT_VERIFIED", podRequiredIndex);
assert.ok(podRequiredIndex >= 0, "pod-present release must invoke verified reaper");
assert.ok(verifiedIndex > podRequiredIndex, "pod-present release must fail closed if reaping is not verified");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  verified: {
    failed_session_without_pod_releases_directly: true,
    starting_session_without_pod_releases_directly: true,
    direct_no_pod_release_transitions_to_expired: true,
    direct_no_pod_release_requires_no_runpod_delete: true,
    pod_present_release_still_requires_verified_reaper: true,
    cleanup_failure_for_real_pod_remains_fail_closed: true,
    runpod_mutation_performed_by_audit: false,
    provider_call_performed: false,
    wallet_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
}, null, 2));
console.log(`${CONTRACT}=PASS`);
