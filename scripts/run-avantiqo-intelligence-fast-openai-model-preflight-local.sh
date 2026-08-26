#!/usr/bin/env bash
set -euo pipefail

ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
EXPECTED_MODEL="Qwen/Qwen3-30B-A3B-Instruct-2507"
FAST_ACTIVE=NO
RESTORED=NO

fail() {
  echo "AVANTIQO_INTELLIGENCE_FAST_OPENAI_MODEL_PREFLIGHT=FAIL"
  echo "AVANTIQO_INTELLIGENCE_FAST_OPENAI_MODEL_PREFLIGHT_REASON=$1"
  exit 1
}

restore_deep() {
  if [ "$FAST_ACTIVE" != "YES" ] || [ "$RESTORED" = "YES" ]; then
    return 0
  fi
  RESTORED=YES
  echo ""
  echo "================ RESTORE DEEP / PARK FAST ================"
  set +e
  (
    cd "$ROOT" || exit 1
    AVANTIQO_INTELLIGENCE_FAST_SLOT_RESTORE_APPROVED=YES \
      node --env-file=.env.local scripts/manage-avantiqo-intelligence-lane-slot-local.mjs --restore-deep
  )
  local status=$?
  set -e
  if [ "$status" -eq 0 ]; then
    FAST_ACTIVE=NO
    echo "AVANTIQO_INTELLIGENCE_FAST_OPENAI_MODEL_PREFLIGHT_RESTORE=PASS"
    return 0
  fi
  echo "AVANTIQO_INTELLIGENCE_FAST_OPENAI_MODEL_PREFLIGHT_RESTORE=FAIL"
  return "$status"
}

cleanup() {
  local original=$?
  set +e
  restore_deep
  local restored=$?
  if [ "$original" -ne 0 ]; then exit "$original"; fi
  if [ "$restored" -ne 0 ]; then exit "$restored"; fi
  exit 0
}
trap cleanup EXIT INT TERM

[ -d "$ROOT/.git" ] || [ -f "$ROOT/.git" ] || fail "PROJECT_NOT_GIT_WORKTREE"
[ -f "$ROOT/.env.local" ] || fail "ENV_LOCAL_MISSING"
[ "${AVANTIQO_INTELLIGENCE_FAST_OPENAI_PREFLIGHT_APPROVED:-}" = "YES" ] \
  || fail "OPENAI_MODEL_PREFLIGHT_APPROVAL_REQUIRED"

cd "$ROOT"

echo "============================================================"
echo "AVANTIQO FAST INTELLIGENCE - OPENAI MODEL PREFLIGHT"
echo "============================================================"
echo "GENERATION_SUBMITTED=NO"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
echo "SECRET_VALUES_PRINTED=NO"

git fetch origin main || fail "GIT_FETCH_ORIGIN_MAIN_FAILED"
[ "$(git branch --show-current)" = "main" ] || fail "LOCAL_MAIN_REQUIRED"
HEAD_SHA="$(git rev-parse HEAD)"
ORIGIN_MAIN_SHA="$(git rev-parse origin/main)"
if [ "$HEAD_SHA" != "$ORIGIN_MAIN_SHA" ]; then
  TRACKED_DIRTY="$(git status --porcelain --untracked-files=no)"
  [ -z "$TRACKED_DIRTY" ] || fail "LOCAL_MAIN_DIRTY_CANNOT_FAST_FORWARD"
  git merge --ff-only origin/main || fail "LOCAL_MAIN_FAST_FORWARD_FAILED"
  HEAD_SHA="$(git rev-parse HEAD)"
  [ "$HEAD_SHA" = "$ORIGIN_MAIN_SHA" ] || fail "LOCAL_MAIN_CONVERGENCE_FAILED"
  echo "AVANTIQO_INTELLIGENCE_FAST_OPENAI_PREFLIGHT_MAIN_CONVERGED=$HEAD_SHA"
fi

node --check scripts/manage-avantiqo-intelligence-lane-slot-local.mjs || fail "SLOT_MANAGER_SYNTAX_FAILED"
node --check scripts/diagnose-avantiqo-intelligence-fast-live-request-local.mjs || fail "LIVE_DIAGNOSTIC_SYNTAX_FAILED"

echo ""
echo "================ RESTORE CANONICAL SLOT ================"
AVANTIQO_INTELLIGENCE_FAST_SLOT_RESTORE_APPROVED=YES \
  node --env-file=.env.local scripts/manage-avantiqo-intelligence-lane-slot-local.mjs --restore-deep \
  || fail "CANONICAL_SLOT_RESTORE_FAILED"

echo ""
echo "================ ACTIVATE FAST WITHOUT GENERATION ================"
AVANTIQO_INTELLIGENCE_FAST_SLOT_SWAP_APPROVED=YES \
  node --env-file=.env.local scripts/manage-avantiqo-intelligence-lane-slot-local.mjs --activate-fast \
  || fail "FAST_SLOT_ACTIVATION_FAILED"
FAST_ACTIVE=YES

echo "AVANTIQO_INTELLIGENCE_FAST_OPENAI_MODEL_PREFLIGHT_GATEWAY_SETTLE_SECONDS=10"
sleep 10

echo ""
echo "================ QUERY FAST OPENAI MODELS ================"
set +e
EXPECTED_MODEL="$EXPECTED_MODEL" node --env-file=.env.local --input-type=module <<'NODE'
const endpointId = String(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID || "").trim();
const apiKey = String(process.env.RUNPOD_API_KEY || "").trim();
const expectedModel = String(process.env.EXPECTED_MODEL || "").trim();
if (!endpointId || !apiKey || !expectedModel) throw new Error("AVANTIQO_FAST_OPENAI_PREFLIGHT_CONFIGURATION_REQUIRED");

const healthUrl = `https://api.runpod.ai/v2/${endpointId}/health`;
const modelsUrl = `https://api.runpod.ai/v2/${endpointId}/openai/v1/models`;
const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };

async function json(url, timeoutMs) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = String(body?.error?.message || body?.message || raw || "").replace(/\s+/g, " ").slice(0, 500);
    throw new Error(`AVANTIQO_FAST_OPENAI_PREFLIGHT_HTTP_${response.status}:${detail}`);
  }
  if (body === null) throw new Error("AVANTIQO_FAST_OPENAI_PREFLIGHT_NON_JSON_RESPONSE");
  return body;
}

try {
  const before = await json(healthUrl, 15000);
  console.log(`AVANTIQO_FAST_OPENAI_PREFLIGHT_HEALTH_BEFORE=${JSON.stringify({ jobs: before?.jobs || {}, workers: before?.workers || {} })}`);

  const startedAt = Date.now();
  const models = await json(modelsUrl, 90000);
  const ids = Array.isArray(models?.data)
    ? models.data.map((entry) => String(entry?.id || "").trim()).filter(Boolean)
    : [];
  console.log(`AVANTIQO_FAST_OPENAI_PREFLIGHT_MODELS_LATENCY_MS=${Date.now() - startedAt}`);
  console.log(`AVANTIQO_FAST_OPENAI_PREFLIGHT_MODEL_IDS=${JSON.stringify(ids)}`);
  console.log(`AVANTIQO_FAST_OPENAI_PREFLIGHT_EXPECTED_MODEL=${expectedModel}`);
  if (!ids.includes(expectedModel)) {
    throw new Error(`AVANTIQO_FAST_OPENAI_PREFLIGHT_EXPECTED_MODEL_NOT_SERVED:expected=${expectedModel}:served=${ids.join(",") || "NONE"}`);
  }
  console.log("AVANTIQO_FAST_OPENAI_PREFLIGHT_EXPECTED_MODEL_SERVED=YES");
  console.log("AVANTIQO_INTELLIGENCE_FAST_OPENAI_MODEL_ROUTE=PASS");
} catch (error) {
  const detail = String(error?.message || error).replace(/\s+/g, " ").slice(0, 900);
  console.error(`AVANTIQO_FAST_OPENAI_PREFLIGHT_ERROR=${detail}`);
  process.exitCode = 1;
}
NODE
MODEL_STATUS=$?
set -e

if [ "$MODEL_STATUS" -ne 0 ]; then
  echo ""
  echo "================ CAPTURE FAST WORKER EVIDENCE ================"
  set +e
  node --env-file=.env.local scripts/diagnose-avantiqo-intelligence-fast-live-request-local.mjs
  DIAGNOSTIC_STATUS=$?
  set -e
  echo "AVANTIQO_FAST_OPENAI_PREFLIGHT_DIAGNOSTIC_STATUS=$DIAGNOSTIC_STATUS"
  restore_deep || fail "DEEP_RESTORE_AFTER_PREFLIGHT_FAILURE_FAILED"
  fail "FAST_OPENAI_MODEL_ROUTE_FAILED"
fi

restore_deep || fail "DEEP_RESTORE_AFTER_PREFLIGHT_FAILED"

echo "AVANTIQO_INTELLIGENCE_FAST_OPENAI_MODEL_PREFLIGHT=PASS"
echo "AVANTIQO_INTELLIGENCE_POST_TEST_STATE=DEEP_ACTIVE_FAST_PARKED"
echo "GENERATION_SUBMITTED=NO"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
