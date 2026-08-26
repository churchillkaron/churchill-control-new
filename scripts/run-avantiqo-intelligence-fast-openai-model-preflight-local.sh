#!/usr/bin/env bash
set -euo pipefail

ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
EXPECTED_MODEL="Qwen/Qwen3-30B-A3B-Instruct-2507"
MODEL_ROUTE_TIMEOUT_MS="${AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_TIMEOUT_MS:-360000}"
FAST_ACTIVE=NO
RESTORED=NO

fail() {
  echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_PREFLIGHT=FAIL"
  echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_PREFLIGHT_REASON=$1"
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
    echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_PREFLIGHT_RESTORE=PASS"
    return 0
  fi
  echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_PREFLIGHT_RESTORE=FAIL"
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
  || [ "${AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_PREFLIGHT_APPROVED:-}" = "YES" ] \
  || fail "SELF_HOSTED_MODEL_PREFLIGHT_APPROVAL_REQUIRED"
[[ "$MODEL_ROUTE_TIMEOUT_MS" =~ ^[0-9]+$ ]] || fail "SELF_HOSTED_MODEL_TIMEOUT_MUST_BE_INTEGER_MS"
[ "$MODEL_ROUTE_TIMEOUT_MS" -ge 120000 ] || fail "SELF_HOSTED_MODEL_TIMEOUT_TOO_SHORT_MIN_120000_MS"
[ "$MODEL_ROUTE_TIMEOUT_MS" -le 600000 ] || fail "SELF_HOSTED_MODEL_TIMEOUT_TOO_LONG_MAX_600000_MS"

cd "$ROOT"

echo "============================================================"
echo "AVANTIQO FAST INTELLIGENCE - SELF-HOSTED MODEL PREFLIGHT"
echo "============================================================"
echo "GENERATION_SUBMITTED=NO"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
echo "SECRET_VALUES_PRINTED=NO"
echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_TIMEOUT_MS=$MODEL_ROUTE_TIMEOUT_MS"

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
fi
PINNED_MAIN_SHA="$HEAD_SHA"
echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_PREFLIGHT_MAIN=$PINNED_MAIN_SHA"

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

echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_PREFLIGHT_GATEWAY_SETTLE_SECONDS=10"
sleep 10

echo ""
echo "================ QUERY FAST SELF-HOSTED MODEL ROUTE ================"
MODEL_RESULT="$(mktemp /tmp/avantiqo-fast-self-hosted-model.XXXXXX)"
MODEL_STATUS_FILE="$(mktemp /tmp/avantiqo-fast-self-hosted-status.XXXXXX)"
rm -f "$MODEL_STATUS_FILE"

(
  set +e
  EXPECTED_MODEL="$EXPECTED_MODEL" \
  MODEL_ROUTE_TIMEOUT_MS="$MODEL_ROUTE_TIMEOUT_MS" \
    node --env-file=.env.local --input-type=module >"$MODEL_RESULT" 2>&1 <<'NODE'
const endpointId = String(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID || "").trim();
const apiKey = String(process.env.RUNPOD_API_KEY || "").trim();
const expectedModel = String(process.env.EXPECTED_MODEL || "").trim();
const modelRouteTimeoutMs = Number(process.env.MODEL_ROUTE_TIMEOUT_MS || 360000);
if (!endpointId || !apiKey || !expectedModel) {
  throw new Error("AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_CONFIGURATION_REQUIRED");
}
if (!Number.isInteger(modelRouteTimeoutMs) || modelRouteTimeoutMs < 120000 || modelRouteTimeoutMs > 600000) {
  throw new Error("AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_TIMEOUT_CONFIGURATION_INVALID");
}

const healthUrl = `https://api.runpod.ai/v2/${endpointId}/health`;
const modelsUrl = `https://api.runpod.ai/v2/${endpointId}/openai/v1/models`;
const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };

async function json(url, timeoutMs) {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = String(body?.error?.message || body?.message || raw || "")
      .replace(/\s+/g, " ")
      .slice(0, 500);
    throw new Error(`AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_HTTP_${response.status}:${detail}`);
  }
  if (body === null) {
    throw new Error("AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_NON_JSON_RESPONSE");
  }
  return body;
}

try {
  const before = await json(healthUrl, 15000);
  console.log(
    `AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_HEALTH_BEFORE=${JSON.stringify({ jobs: before?.jobs || {}, workers: before?.workers || {} })}`,
  );
  console.log(`AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_MODEL_ROUTE_TIMEOUT_MS=${modelRouteTimeoutMs}`);
  const startedAt = Date.now();
  const models = await json(modelsUrl, modelRouteTimeoutMs);
  const ids = Array.isArray(models?.data)
    ? models.data.map((entry) => String(entry?.id || "").trim()).filter(Boolean)
    : [];
  console.log(`AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_MODELS_LATENCY_MS=${Date.now() - startedAt}`);
  console.log(`AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_MODEL_IDS=${JSON.stringify(ids)}`);
  console.log(`AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_EXPECTED_MODEL=${expectedModel}`);
  if (!ids.includes(expectedModel)) {
    throw new Error(
      `AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_EXPECTED_MODEL_NOT_SERVED:expected=${expectedModel}:served=${ids.join(",") || "NONE"}`,
    );
  }
  console.log("AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_EXPECTED_MODEL_SERVED=YES");
  console.log("AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_ROUTE=PASS");
} catch (error) {
  const name = String(error?.name || "Error").trim();
  const detail = String(error?.message || error).replace(/\s+/g, " ").slice(0, 900);
  console.error(`AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_ERROR_NAME=${name}`);
  console.error(`AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_ERROR=${detail}`);
  if (name === "TimeoutError" || name === "AbortError" || /timed out|aborted/i.test(detail)) {
    console.error("AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_FAILURE_CLASS=COLD_START_TIMEOUT");
  } else {
    console.error("AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_FAILURE_CLASS=MODEL_ROUTE_FAILURE");
  }
  process.exitCode = 1;
}
NODE
  echo "$?" >"$MODEL_STATUS_FILE"
) &
MODEL_PID=$!

MONITOR_START_SECONDS=$SECONDS
while kill -0 "$MODEL_PID" 2>/dev/null; do
  sleep 15
  if ! kill -0 "$MODEL_PID" 2>/dev/null; then
    break
  fi
  ELAPSED_SECONDS=$((SECONDS - MONITOR_START_SECONDS))
  echo ""
  echo "================ FAST COLD-START PROGRESS ${ELAPSED_SECONDS}s ================"
  set +e
  PREFLIGHT_ELAPSED_SECONDS="$ELAPSED_SECONDS" \
    node --env-file=.env.local --input-type=module <<'NODE'
const endpointId = String(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID || "").trim();
const apiKey = String(process.env.RUNPOD_API_KEY || "").trim();
const elapsedSeconds = Number(process.env.PREFLIGHT_ELAPSED_SECONDS || 0);
if (!endpointId || !apiKey) process.exit(2);
try {
  const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/health`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || !body) {
    console.log(`AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_PROGRESS_HEALTH=UNAVAILABLE:${response.status}`);
    process.exit(0);
  }
  console.log(
    `AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_PROGRESS=${JSON.stringify({ elapsed_seconds: elapsedSeconds, jobs: body?.jobs || {}, workers: body?.workers || {} })}`,
  );
} catch (error) {
  console.log(
    `AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_PROGRESS_HEALTH=UNAVAILABLE:${String(error?.name || "Error")}`,
  );
}
NODE
  set -e
done

wait "$MODEL_PID" || true
cat "$MODEL_RESULT"
MODEL_STATUS="1"
if [ -f "$MODEL_STATUS_FILE" ]; then
  MODEL_STATUS="$(cat "$MODEL_STATUS_FILE")"
fi

if [ "$MODEL_STATUS" -ne 0 ]; then
  MODEL_FAILURE_REASON="FAST_SELF_HOSTED_MODEL_ROUTE_FAILED"
  if grep -q "AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_FAILURE_CLASS=COLD_START_TIMEOUT" "$MODEL_RESULT"; then
    MODEL_FAILURE_REASON="FAST_SELF_HOSTED_MODEL_COLD_START_TIMEOUT"
  fi

  echo ""
  echo "================ FAILURE-TIME FAST WORKER EVIDENCE ================"
  set +e
  AVANTIQO_INTELLIGENCE_FAST_LIVE_REQUEST_EXPECTED_MAIN="$PINNED_MAIN_SHA" \
    node --env-file=.env.local scripts/diagnose-avantiqo-intelligence-fast-live-request-local.mjs
  DIAGNOSTIC_STATUS=$?
  set -e
  echo "AVANTIQO_FAST_SELF_HOSTED_PREFLIGHT_FAILURE_DIAGNOSTIC_STATUS=$DIAGNOSTIC_STATUS"

  rm -f "$MODEL_RESULT" "$MODEL_STATUS_FILE"
  restore_deep || fail "DEEP_RESTORE_AFTER_PREFLIGHT_FAILURE_FAILED"
  fail "$MODEL_FAILURE_REASON"
fi

rm -f "$MODEL_RESULT" "$MODEL_STATUS_FILE"
restore_deep || fail "DEEP_RESTORE_AFTER_PREFLIGHT_FAILED"

echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_PREFLIGHT=PASS"
echo "AVANTIQO_INTELLIGENCE_POST_TEST_STATE=DEEP_ACTIVE_FAST_PARKED"
echo "GENERATION_SUBMITTED=NO"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
