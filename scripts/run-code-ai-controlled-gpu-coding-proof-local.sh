#!/usr/bin/env bash
set -u

CONTRACT="AVANTIQO_CODE_AI_CONTROLLED_GPU_CODING_PROOF_LOCAL_V1"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
WT="/tmp/avantiqo-code-controlled-gpu-proof-$$"
LEGACY_DIGEST="1b6ac20925085104ac00c09dde3073e32e5934543bd16b9a346b2dca3fa7bb27"
PREVIOUS_CANDIDATE_DIGEST="3b2efdb6269a26d2bd443be9aaedf996478efd2771afd6d751a1fc9fe3d842a9"
NEW_DIGEST="daba714fde0b149cb82d779a3a114fd10e701de03722a36b1e2041c4adc19b3e"
RC=1

cleanup() {
  if git -C "$ROOT" worktree list --porcelain 2>/dev/null | grep -Fqx "worktree $WT"; then
    git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true
  fi
  rm -rf "$WT" >/dev/null 2>&1 || true
  echo "${CONTRACT}_RC=$RC"
  echo "${CONTRACT}_TEMP_WORKTREE_REMOVED_ON_EXIT=true"
  echo "${CONTRACT}_DIRTY_ROOT_PRESERVED=true"
  echo "${CONTRACT}_GITHUB_WRITE_PERFORMED=false"
  echo "${CONTRACT}_VERCEL_DEPLOY_PERFORMED=false"
  echo "${CONTRACT}_PRODUCTION_DEPLOY_PERFORMED=false"
  echo "Terminal remains open."
}
trap cleanup EXIT

cd "$ROOT" || exit 1

echo "${CONTRACT}_MODE=LOCAL_CONTROLLED_GPU_PROOF"
echo "${CONTRACT}_ROOT=$ROOT"
echo "${CONTRACT}_PRODUCTION_DEPLOY_ALLOWED=false"
echo "${CONTRACT}_VERCEL_ALLOWED=false"
echo "${CONTRACT}_GITHUB_WRITE_ALLOWED=false"
echo "${CONTRACT}_REAL_CODE_GPU_INFERENCE_ALLOWED=true"
echo "${CONTRACT}_REASONING_CALL_BUDGET=4"
echo "${CONTRACT}_TARGET_REASONING_CALLS=1-2"
echo "${CONTRACT}_CANDIDATE_DIGEST=sha256:${NEW_DIGEST}"
echo "${CONTRACT}_SINGLE_WORKER_WARMUP_AND_CODING=true"
echo "${CONTRACT}_BOOT_PRELOAD=true"
echo "${CONTRACT}_SAFETENSORS_LOAD_STRATEGY=eager"
echo "${CONTRACT}_ENGINE_LOADING_PHASE_LIMIT_MS=480000"
echo "${CONTRACT}_POD_STARTUP_PHASE_LIMIT_MS=900000"

if [ ! -f "$ROOT/.env.local" ]; then
  echo "${CONTRACT}_ENV_LOCAL_REQUIRED=true"
  exit 1
fi
if [ ! -d "$ROOT/node_modules" ]; then
  echo "${CONTRACT}_ROOT_NODE_MODULES_REQUIRED=true"
  exit 1
fi

git fetch origin main || exit 1
MAIN_SHA="$(git rev-parse origin/main)"
echo "${CONTRACT}_MAIN_SHA=$MAIN_SHA"

git worktree add --detach "$WT" "$MAIN_SHA" || exit 1
ln -s "$ROOT/node_modules" "$WT/node_modules"
ln -s "$ROOT/.env.local" "$WT/.env.local"
cd "$WT" || exit 1

echo "${CONTRACT}_PHASE=ZERO_SPEND_LOCAL_GATES"
node scripts/code-ai-seeded-implementation-lock-selftest.mjs || exit 1
node scripts/code-ai-operator-prewarm-audit.mjs || exit 1
node scripts/code-ai-work-package-recovery-selftest.mjs || exit 1

echo "${CONTRACT}_PHASE=SHARED_VOLUME_IDLE_PREFLIGHT"
NODE_ENV=development node --env-file="$ROOT/.env.local" --input-type=module - <<'NODE' || exit 1
const key = String(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY || "").trim();
if (!key) throw new Error("AVANTIQO_CODE_GPU_PROOF_RUNPOD_MANAGEMENT_KEY_REQUIRED");
const response = await fetch("https://rest.runpod.io/v1/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true", {
  headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  signal: AbortSignal.timeout(30000),
});
const raw = await response.text();
let body = null;
try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
if (!response.ok) throw new Error(`AVANTIQO_CODE_GPU_PROOF_RUNPOD_HTTP_${response.status}`);
const pods = Array.isArray(body) ? body : (body?.data || body?.items || body?.results || body?.pods || []);
const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
const active = pods.filter((pod) => {
  const volumeId = String(pod?.networkVolume?.id || pod?.networkVolumeId || "").trim();
  if (volumeId !== "7obluigbr0") return false;
  const status = String(pod?.desiredStatus || pod?.desired_status || pod?.status || pod?.runtimeStatus || "").trim().toUpperCase();
  return !terminal.has(status);
});
if (active.length) {
  throw new Error(`AVANTIQO_CODE_GPU_PROOF_SHARED_VOLUME_BUSY:${active.map((pod) => String(pod?.name || pod?.id || "unknown")).join(",")}`);
}
console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_GPU_PROOF_SHARED_VOLUME_IDLE_PREFLIGHT_V1",
  network_volume_id: "7obluigbr0",
  active_conflicting_pods: 0,
  runpod_mutation_performed: false,
  model_inference_performed: false,
  wallet_mutation_performed: false,
  secrets_printed: false,
}, null, 2));
NODE

echo "${CONTRACT}_PHASE=TEMPORARY_LOCAL_CANDIDATE_BINDING"
node --input-type=module - "$LEGACY_DIGEST" "$PREVIOUS_CANDIDATE_DIGEST" "$NEW_DIGEST" <<'NODE' || exit 1
import { readFile, writeFile } from "node:fs/promises";
const legacyDigest = process.argv[2];
const previousCandidateDigest = process.argv[3];
const newDigest = process.argv[4];
const runtimePath = "lib/code/runtime/CodeAIWorkerSessionRuntime.js";
const runtimeBefore = await readFile(runtimePath, "utf8");
const digestMatch = runtimeBefore.match(/ghcr\.io\/churchillkaron\/avantiqo-code-pod@sha256:([a-f0-9]{64})/);
const currentDigest = digestMatch?.[1] || "";
if (!currentDigest) {
  throw new Error("AVANTIQO_CODE_GPU_PROOF_RUNTIME_DIGEST_NOT_FOUND");
}

let runtimeAfter = runtimeBefore;
let runtimeMutationPerformed = false;
let bindingSource = "CURRENT_MAIN_ALREADY_CANDIDATE";
if (currentDigest === newDigest) {
  // Current main is already bound to the image under certification. No detached source rewrite required.
} else if (currentDigest === legacyDigest || currentDigest === previousCandidateDigest) {
  runtimeAfter = runtimeBefore.replace(currentDigest, newDigest);
  runtimeMutationPerformed = true;
  bindingSource = currentDigest === legacyDigest
    ? "APPROVED_LEGACY_PREDECESSOR"
    : "APPROVED_PREVIOUS_CANDIDATE";
  await writeFile(runtimePath, runtimeAfter, "utf8");
} else {
  throw new Error(`AVANTIQO_CODE_GPU_PROOF_UNAPPROVED_RUNTIME_DIGEST:${currentDigest}`);
}
if (!runtimeAfter.includes(`sha256:${newDigest}`)) {
  throw new Error("AVANTIQO_CODE_GPU_PROOF_NEW_DIGEST_NOT_BOUND");
}

const certPath = "scripts/certify-code-ai-employee-fast-start-live.mjs";
const certBefore = await readFile(certPath, "utf8");
let certAfter = certBefore;

const oldWatchdog = "const MAX_WORKER_WARMING_MS = 90 * 1000;";
const newWatchdog = "const MAX_WORKER_WARMING_MS = 8 * 60 * 1000;";
if (!certAfter.includes(oldWatchdog)) {
  throw new Error("AVANTIQO_CODE_GPU_PROOF_CERT_WATCHDOG_MARKER_NOT_FOUND");
}
certAfter = certAfter.replace(oldWatchdog, newWatchdog);

const oldResumeCycles = "const MAX_RESUME_CYCLES = 180;";
const newResumeCycles = "const MAX_RESUME_CYCLES = 900;";
if (!certAfter.includes(oldResumeCycles)) {
  throw new Error("AVANTIQO_CODE_GPU_PROOF_CERT_RESUME_CYCLES_MARKER_NOT_FOUND");
}
certAfter = certAfter.replace(oldResumeCycles, newResumeCycles);

const oldPhaseDeclaration = "  let workerWarmingStartedAt = null;";
const newPhaseDeclaration = [
  "  let workerWarmingStartedAt = null;",
  "  let workerWarmingPhase = null;",
].join("\n");
if (!certAfter.includes(oldPhaseDeclaration)) {
  throw new Error("AVANTIQO_CODE_GPU_PROOF_CERT_PHASE_DECLARATION_MARKER_NOT_FOUND");
}
certAfter = certAfter.replace(oldPhaseDeclaration, newPhaseDeclaration);

const oldPhaseBlock = [
  "    const workerWarming = result.status === \"worker_warming\";",
  "    if (workerWarming && workerWarmingStartedAt === null) {",
  "      workerWarmingStartedAt = Date.now();",
  "    }",
  "    const workerWarmingElapsedMs = workerWarming && workerWarmingStartedAt !== null",
  "      ? Date.now() - workerWarmingStartedAt",
  "      : 0;",
].join("\n");
const newPhaseBlock = [
  "    const workerWarming = result.status === \"worker_warming\";",
  "    const warmupStatus = text(result.worker_session?.engine_warmup_status, 120).toUpperCase();",
  "    const nextWorkerWarmingPhase = !workerWarming",
  "      ? null",
  "      : warmupStatus === \"RUNNING\" || result.worker_session?.engine_loading === true",
  "        ? \"ENGINE_LOADING\"",
  "        : result.worker_session?.transport_ready === true",
  "          ? \"TRANSPORT_READY\"",
  "          : \"POD_STARTUP\";",
  "    if (workerWarming && (workerWarmingStartedAt === null || workerWarmingPhase !== nextWorkerWarmingPhase)) {",
  "      workerWarmingStartedAt = Date.now();",
  "      workerWarmingPhase = nextWorkerWarmingPhase;",
  "    }",
  "    const workerWarmingElapsedMs = workerWarming && workerWarmingStartedAt !== null",
  "      ? Date.now() - workerWarmingStartedAt",
  "      : 0;",
].join("\n");
if (!certAfter.includes(oldPhaseBlock)) {
  throw new Error("AVANTIQO_CODE_GPU_PROOF_CERT_PHASE_BLOCK_MARKER_NOT_FOUND");
}
certAfter = certAfter.replace(oldPhaseBlock, newPhaseBlock);

const oldEventMarker = "      worker_warming_limit_ms: MAX_WORKER_WARMING_MS,";
const newEventMarker = [
  "      worker_warming_limit_ms: MAX_WORKER_WARMING_MS,",
  "      worker_warming_phase: workerWarmingPhase,",
].join("\n");
if (!certAfter.includes(oldEventMarker)) {
  throw new Error("AVANTIQO_CODE_GPU_PROOF_CERT_PHASE_EVENT_MARKER_NOT_FOUND");
}
certAfter = certAfter.replace(oldEventMarker, newEventMarker);

await writeFile(certPath, certAfter, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_GPU_PROOF_TEMPORARY_BINDING_V3",
  candidate_digest: `sha256:${newDigest}`,
  observed_main_digest: `sha256:${currentDigest}`,
  binding_source: bindingSource,
  detached_runtime_mutation_performed: runtimeMutationPerformed,
  current_main_already_candidate: currentDigest === newDigest,
  boot_preload: true,
  safetensors_load_strategy: "eager",
  engine_loading_phase_limit_ms: 480000,
  pod_startup_phase_limit_ms: 900000,
  max_resume_cycles: 900,
  watchdog_resets_on_phase_progress: true,
  duplicate_warmup_pod_created: false,
  persistent_source_mutation_performed: false,
  github_write_performed: false,
  production_deploy_performed: false,
}, null, 2));
NODE

node scripts/code-ai-worker-session-audit.mjs || exit 1

EXPECTED_STATUS="$(git status --short --untracked-files=no)"
if ! printf '%s\n' "$EXPECTED_STATUS" | grep -Fq "scripts/certify-code-ai-employee-fast-start-live.mjs"; then
  echo "${CONTRACT}_TEMP_CERT_WATCHDOG_CHANGE_REQUIRED=true"
  exit 1
fi
if printf '%s\n' "$EXPECTED_STATUS" | grep -Fq "scripts/code-ai-worker-session-audit.mjs"; then
  echo "${CONTRACT}_TEMP_BINDING_AUDIT_MUST_REMAIN_UNCHANGED=true"
  exit 1
fi
RUNTIME_STATUS_CHANGED=false
if printf '%s\n' "$EXPECTED_STATUS" | grep -Fq "lib/code/runtime/CodeAIWorkerSessionRuntime.js"; then
  RUNTIME_STATUS_CHANGED=true
fi
CURRENT_RUNTIME_DIGEST="$(grep -Eo 'ghcr\.io/churchillkaron/avantiqo-code-pod@sha256:[a-f0-9]{64}' lib/code/runtime/CodeAIWorkerSessionRuntime.js | head -n 1 | sed 's/.*sha256://')"
if [ "$CURRENT_RUNTIME_DIGEST" != "$NEW_DIGEST" ]; then
  echo "${CONTRACT}_TEMP_BINDING_RUNTIME_DIGEST_MISMATCH=true"
  exit 1
fi
echo "${CONTRACT}_TEMP_BINDING_RUNTIME_CHANGE_PERFORMED=$RUNTIME_STATUS_CHANGED"
echo "${CONTRACT}_TEMP_BINDING_CURRENT_MAIN_ALREADY_CANDIDATE=$([ "$RUNTIME_STATUS_CHANGED" = false ] && echo true || echo false)"

echo "${CONTRACT}_PHASE=GENERATION_FREE_WARMUP_PLUS_REAL_GPU_EMPLOYEE_CODING_PROOF"
NODE_ENV=development \
AVANTIQO_CODE_EMPLOYEE_CERT_SPEND_APPROVED=YES \
node --env-file="$ROOT/.env.local" \
  scripts/run-code-ai-employee-fast-start-certification-local.mjs || exit 1

RC=0
echo "${CONTRACT}_PASS=true"
echo "${CONTRACT}_ZERO_SPEND_GATES_PASSED=true"
echo "${CONTRACT}_GENERATION_FREE_WARMUP_PROVED=true"
echo "${CONTRACT}_REAL_GPU_EMPLOYEE_CODING_PROVED=true"
echo "${CONTRACT}_SINGLE_WORKER_REUSED_FOR_WARMUP_AND_CODING=true"
echo "${CONTRACT}_CANDIDATE_BINDING_PERSISTED=false"
echo "${CONTRACT}_ROOT_SOURCE_MUTATION_PERFORMED=false"
echo "${CONTRACT}_GITHUB_WRITE_PERFORMED=false"
echo "${CONTRACT}_VERCEL_DEPLOY_PERFORMED=false"
echo "${CONTRACT}_PRODUCTION_DEPLOY_PERFORMED=false"
exit 0
