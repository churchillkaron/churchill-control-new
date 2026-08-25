#!/usr/bin/env bash
set -euo pipefail

ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"

fail() {
  echo "AVANTIQO_INTELLIGENCE_FAST_CONVERGED_FIRST_RESPONSE=FAIL"
  echo "AVANTIQO_INTELLIGENCE_FAST_CONVERGED_FIRST_RESPONSE_REASON=$1"
  exit 1
}

[ -d "$ROOT/.git" ] || [ -f "$ROOT/.git" ] || fail "PROJECT_NOT_GIT_WORKTREE"
[ -f "$ROOT/.env.local" ] || fail "ENV_LOCAL_MISSING"
command -v git >/dev/null 2>&1 || fail "GIT_MISSING"
command -v node >/dev/null 2>&1 || fail "NODE_MISSING"

cd "$ROOT"

echo "============================================================"
echo "AVANTIQO FAST INTELLIGENCE - CONVERGED FIRST RESPONSE V2"
echo "============================================================"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
echo "TEMPLATE_CONVERGENCE_REQUIRED_BEFORE_FAST_ACTIVATION=YES"
echo "SECRET_VALUES_PRINTED=NO"

git fetch origin main || fail "GIT_FETCH_ORIGIN_MAIN_FAILED"
CURRENT_BRANCH="$(git branch --show-current)"
[ "$CURRENT_BRANCH" = "main" ] || fail "LOCAL_MAIN_REQUIRED"
LOCAL_HEAD="$(git rev-parse HEAD)"
ORIGIN_MAIN="$(git rev-parse origin/main)"
[ "$LOCAL_HEAD" = "$ORIGIN_MAIN" ] || fail "LOCAL_MAIN_NOT_CURRENT_RUN_GIT_PULL_FF_ONLY"

node --check scripts/repair-avantiqo-intelligence-fast-template-convergence-v2-local.mjs \
  || fail "FAST_TEMPLATE_CONVERGENCE_V2_SYNTAX_FAILED"
node --check scripts/manage-avantiqo-intelligence-lane-slot-local.mjs \
  || fail "INTELLIGENCE_SLOT_MANAGER_SYNTAX_FAILED"
bash -n scripts/run-avantiqo-intelligence-fast-first-response-local.sh \
  || fail "FAST_FIRST_RESPONSE_WRAPPER_SYNTAX_FAILED"

echo ""
echo "================ CLEAR STALE UNCLAIMED FAST QUEUE ================"
node --env-file=.env.local --input-type=module <<'NODE' || fail "FAST_STALE_QUEUE_RECOVERY_FAILED"
const endpointId = String(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID || "").trim();
const apiKey = String(process.env.RUNPOD_API_KEY || "").trim();
if (!endpointId || !apiKey) throw new Error("AVANTIQO_FAST_QUEUE_CREDENTIAL_OR_ENDPOINT_MISSING");
const request = async (path, method = "GET") => {
  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  if (!response.ok) throw new Error(`AVANTIQO_FAST_QUEUE_HTTP_${response.status}`);
  return body;
};
const health = await request("/health");
const queued = Number(health?.jobs?.inQueue || 0);
const progress = Number(health?.jobs?.inProgress || 0);
if (progress !== 0) throw new Error(`AVANTIQO_FAST_EXECUTING_JOB_BLOCKS_RECOVERY:${progress}`);
if (queued > 0) await request("/purge-queue", "POST");
console.log(`AVANTIQO_FAST_STALE_QUEUE_PURGED=${queued}`);
console.log("AVANTIQO_FAST_EXECUTING_JOB_PRESENT=NO");
NODE

echo ""
echo "================ RESTORE DEEP / PARK FAST ================"
AVANTIQO_INTELLIGENCE_FAST_SLOT_RESTORE_APPROVED=YES \
  node --env-file=.env.local scripts/manage-avantiqo-intelligence-lane-slot-local.mjs --restore-deep \
  || fail "INTELLIGENCE_DEEP_SLOT_RESTORE_FAILED"

echo ""
echo "================ CONVERGE PARKED FAST TEMPLATE V2 ================"
AVANTIQO_INTELLIGENCE_FAST_TEMPLATE_CONVERGENCE_APPROVED=YES \
  node --env-file=.env.local \
    scripts/repair-avantiqo-intelligence-fast-template-convergence-v2-local.mjs \
    --apply \
  || fail "FAST_TEMPLATE_CONVERGENCE_V2_FAILED"

echo ""
echo "================ RUN ONE FAST FIRST RESPONSE ================"
bash scripts/run-avantiqo-intelligence-fast-first-response-local.sh \
  || fail "FAST_FIRST_RESPONSE_FAILED"

echo ""
echo "AVANTIQO_INTELLIGENCE_FAST_CONVERGED_FIRST_RESPONSE=PASS"
echo "AVANTIQO_INTELLIGENCE_POST_TEST_STATE=DEEP_ACTIVE_FAST_PARKED"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
