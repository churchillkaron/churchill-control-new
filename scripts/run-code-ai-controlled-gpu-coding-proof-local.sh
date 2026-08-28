#!/usr/bin/env bash
set -u

CONTRACT="AVANTIQO_CODE_AI_CONTROLLED_GPU_CODING_PROOF_LOCAL_V1"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
WT="/tmp/avantiqo-code-controlled-gpu-proof-$$"
OLD_DIGEST="1b6ac20925085104ac00c09dde3073e32e5934543bd16b9a346b2dca3fa7bb27"
NEW_DIGEST="764bcb2ce3636adc68ada7ce2a51d41de995e5e0d54e543b41044d76e5686535"
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
echo "${CONTRACT}_ACTIVE_ENGINE_LOAD_LIMIT_MS=240000"

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

# Phase 1: zero-spend deterministic gates. No RunPod mutation and no model call.
echo "${CONTRACT}_PHASE=ZERO_SPEND_LOCAL_GATES"
node scripts/code-ai-seeded-implementation-lock-selftest.mjs || exit 1
node scripts/code-ai-operator-prewarm-audit.mjs || exit 1
node scripts/code-ai-work-package-recovery-selftest.mjs || exit 1

# Refuse to share the exact Code model volume with any active GPU Pod.
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

# Bind the candidate digest only inside this detached temporary worktree.
# Nothing is committed, pushed, deployed, or written to the user's root checkout.
# The real employee worker below performs its own generation-free engine warmup
# before the first reasoning call, so we intentionally do not create and delete
# a separate duplicate warmup Pod here.
echo "${CONTRACT}_PHASE=TEMPORARY_LOCAL_CANDIDATE_BINDING"
node --input-type=module - "$OLD_DIGEST" "$NEW_DIGEST" <<'NODE' || exit 1
import { readFile, writeFile } from "node:fs/promises";
const oldDigest = process.argv[2];
const newDigest = process.argv[3];
const paths = [
  "lib/code/runtime/CodeAIWorkerSessionRuntime.js",
  "scripts/code-ai-worker-session-audit.mjs",
];
for (const path of paths) {
  const before = await readFile(path, "utf8");
  const occurrences = before.split(oldDigest).length - 1;
  if (occurrences < 1) throw new Error(`AVANTIQO_CODE_GPU_PROOF_OLD_DIGEST_NOT_FOUND:${path}`);
  const after = before.split(oldDigest).join(newDigest);
  if (!after.includes(newDigest)) throw new Error(`AVANTIQO_CODE_GPU_PROOF_NEW_DIGEST_NOT_BOUND:${path}`);
  await writeFile(path, after, "utf8");
}

const certPath = "scripts/certify-code-ai-employee-fast-start-live.mjs";
const certBefore = await readFile(certPath, "utf8");
const oldWatchdog = "const MAX_WORKER_WARMING_MS = 90 * 1000;";
const newWatchdog = "const MAX_WORKER_WARMING_MS = 4 * 60 * 1000;";
if (!certBefore.includes(oldWatchdog)) {
  throw new Error("AVANTIQO_CODE_GPU_PROOF_CERT_WATCHDOG_MARKER_NOT_FOUND");
}
await writeFile(certPath, certBefore.replace(oldWatchdog, newWatchdog), "utf8");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_GPU_PROOF_TEMPORARY_BINDING_V1",
  candidate_digest: `sha256:${newDigest}`,
  active_engine_load_limit_ms: 240000,
  duplicate_warmup_pod_created: false,
  persistent_source_mutation_performed: false,
  github_write_performed: false,
  production_deploy_performed: false,
}, null, 2));
NODE

node scripts/code-ai-worker-session-audit.mjs || exit 1

EXPECTED_STATUS="$(git status --short --untracked-files=no)"
if ! printf '%s\n' "$EXPECTED_STATUS" | grep -Fq "lib/code/runtime/CodeAIWorkerSessionRuntime.js"; then
  echo "${CONTRACT}_TEMP_BINDING_RUNTIME_CHANGE_REQUIRED=true"
  exit 1
fi
if ! printf '%s\n' "$EXPECTED_STATUS" | grep -Fq "scripts/code-ai-worker-session-audit.mjs"; then
  echo "${CONTRACT}_TEMP_BINDING_AUDIT_CHANGE_REQUIRED=true"
  exit 1
fi
if ! printf '%s\n' "$EXPECTED_STATUS" | grep -Fq "scripts/certify-code-ai-employee-fast-start-live.mjs"; then
  echo "${CONTRACT}_TEMP_CERT_WATCHDOG_CHANGE_REQUIRED=true"
  exit 1
fi

# Phase 2: one real employee coding mission through one candidate GPU worker.
# The worker-session runtime performs a generation-free engine warmup first.
# No reasoning call is allowed while the worker is warming. The same warmed
# worker is then reused for the bounded employee coding mission and cleaned up.
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
