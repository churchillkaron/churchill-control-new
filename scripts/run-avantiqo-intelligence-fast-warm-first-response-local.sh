#!/usr/bin/env bash
set -euo pipefail

ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
EXPECTED_MODEL="Qwen/Qwen3-30B-A3B-Instruct-2507"
WARM_TIMEOUT_MS="${AVANTIQO_INTELLIGENCE_FAST_WARM_TIMEOUT_MS:-360000}"
RESPONSE_TIMEOUT_MS="${AVANTIQO_INTELLIGENCE_FAST_HOT_RESPONSE_TIMEOUT_MS:-120000}"
FAST_ACTIVE=NO
RESTORED=NO
GENERATION_SUBMITTED=NO

fail() {
  echo ""
  echo "AVANTIQO_INTELLIGENCE_FAST_WARM_FIRST_RESPONSE=FAIL"
  echo "AVANTIQO_INTELLIGENCE_FAST_WARM_FIRST_RESPONSE_REASON=$1"
  exit 1
}

queue_health() {
  (
    cd "$ROOT" || exit 1
    node --env-file=.env.local --input-type=module <<'NODE'
const endpointId = String(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID || "").trim();
const apiKey = String(process.env.RUNPOD_API_KEY || "").trim();
if (!endpointId || !apiKey) throw new Error("FAST_QUEUE_CONFIGURATION_REQUIRED");
const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/health`, {
  headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  signal: AbortSignal.timeout(15000),
});
const raw = await response.text();
let body = null;
try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
if (!response.ok || !body) throw new Error(`FAST_QUEUE_HEALTH_HTTP_${response.status}`);
console.log(JSON.stringify({
  in_queue: Number(body?.jobs?.inQueue || 0),
  in_progress: Number(body?.jobs?.inProgress || 0),
  workers: body?.workers || {},
}));
NODE
  )
}

purge_unclaimed_fast_queue() {
  (
    cd "$ROOT" || exit 1
    node --env-file=.env.local --input-type=module <<'NODE'
const endpointId = String(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID || "").trim();
const apiKey = String(process.env.RUNPOD_API_KEY || "").trim();
if (!endpointId || !apiKey) throw new Error("FAST_QUEUE_CONFIGURATION_REQUIRED");
const base = `https://api.runpod.ai/v2/${endpointId}`;
const request = async (path, method = "GET") => {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || !body) throw new Error(`FAST_QUEUE_HTTP_${response.status}:${path}`);
  return body;
};
const before = await request("/health");
const queued = Number(before?.jobs?.inQueue || 0);
const progress = Number(before?.jobs?.inProgress || 0);
if (progress > 0) {
  console.log(`AVANTIQO_FAST_CLEANUP_ACTIVE_JOB_PRESENT=${progress}`);
  process.exit(2);
}
if (queued > 0) {
  await request("/purge-queue", "POST");
}
for (let attempt = 0; attempt < 30; attempt += 1) {
  const after = await request("/health");
  const afterQueued = Number(after?.jobs?.inQueue || 0);
  const afterProgress = Number(after?.jobs?.inProgress || 0);
  if (afterQueued === 0 && afterProgress === 0) {
    console.log(`AVANTIQO_FAST_CLEANUP_PURGED_UNCLAIMED=${queued}`);
    console.log("AVANTIQO_FAST_CLEANUP_QUEUE_ZERO=YES");
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
throw new Error("FAST_QUEUE_CLEANUP_VERIFY_FAILED");
NODE
  )
}

restore_deep() {
  if [ "$FAST_ACTIVE" != "YES" ] || [ "$RESTORED" = "YES" ]; then
    return 0
  fi
  RESTORED=YES

  echo ""
  echo "================ CLEAN FAST QUEUE BEFORE RESTORE ================"
  set +e
  purge_unclaimed_fast_queue
  local queue_status=$?
  set -e
  if [ "$queue_status" -ne 0 ]; then
    echo "AVANTIQO_INTELLIGENCE_FAST_WARM_FIRST_RESPONSE_QUEUE_CLEANUP=FAIL"
    return "$queue_status"
  fi
  echo "AVANTIQO_INTELLIGENCE_FAST_WARM_FIRST_RESPONSE_QUEUE_CLEANUP=PASS"

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
    echo "AVANTIQO_INTELLIGENCE_FAST_WARM_FIRST_RESPONSE_RESTORE=PASS"
    return 0
  fi
  echo "AVANTIQO_INTELLIGENCE_FAST_WARM_FIRST_RESPONSE_RESTORE=FAIL"
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
[ -d "$ROOT/node_modules" ] || fail "NODE_MODULES_MISSING"
command -v git >/dev/null 2>&1 || fail "GIT_MISSING"
command -v node >/dev/null 2>&1 || fail "NODE_MISSING"
[ "${AVANTIQO_INTELLIGENCE_FAST_FIRST_RESPONSE_SPEND_APPROVED:-}" = "YES" ] \
  || fail "FAST_FIRST_RESPONSE_SPEND_APPROVAL_REQUIRED"
[[ "$WARM_TIMEOUT_MS" =~ ^[0-9]+$ ]] || fail "FAST_WARM_TIMEOUT_MUST_BE_INTEGER_MS"
[[ "$RESPONSE_TIMEOUT_MS" =~ ^[0-9]+$ ]] || fail "FAST_RESPONSE_TIMEOUT_MUST_BE_INTEGER_MS"
[ "$WARM_TIMEOUT_MS" -ge 240000 ] || fail "FAST_WARM_TIMEOUT_TOO_SHORT_MIN_240000_MS"
[ "$WARM_TIMEOUT_MS" -le 600000 ] || fail "FAST_WARM_TIMEOUT_TOO_LONG_MAX_600000_MS"
[ "$RESPONSE_TIMEOUT_MS" -ge 60000 ] || fail "FAST_RESPONSE_TIMEOUT_TOO_SHORT_MIN_60000_MS"
[ "$RESPONSE_TIMEOUT_MS" -le 300000 ] || fail "FAST_RESPONSE_TIMEOUT_TOO_LONG_MAX_300000_MS"

cd "$ROOT"

echo "============================================================"
echo "AVANTIQO FAST INTELLIGENCE - WARM FIRST REAL RESPONSE"
echo "============================================================"
echo "PROBE_SCOPE=GENERAL_INTELLIGENCE_FAST_PROVIDER_BOUNDARY"
echo "EXPECTED_MODEL=$EXPECTED_MODEL"
echo "WARM_TIMEOUT_MS=$WARM_TIMEOUT_MS"
echo "HOT_RESPONSE_TIMEOUT_MS=$RESPONSE_TIMEOUT_MS"
echo "APPROVED_GENERATIONS=1"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
echo "SECRET_VALUES_PRINTED=NO"

echo ""
echo "================ PIN AUTHORITATIVE MAIN ================"
git fetch origin main || fail "GIT_FETCH_ORIGIN_MAIN_FAILED"
[ "$(git branch --show-current)" = "main" ] || fail "LOCAL_MAIN_REQUIRED"
HEAD_SHA="$(git rev-parse HEAD)"
ORIGIN_SHA="$(git rev-parse origin/main)"
[ "$HEAD_SHA" = "$ORIGIN_SHA" ] || fail "LOCAL_MAIN_NOT_CURRENT"
TRACKED_DIRTY="$(git status --porcelain --untracked-files=no)"
[ -z "$TRACKED_DIRTY" ] || fail "LOCAL_MAIN_TRACKED_DIRTY"
echo "AVANTIQO_INTELLIGENCE_FAST_WARM_FIRST_RESPONSE_MAIN=$HEAD_SHA"

node --check scripts/manage-avantiqo-intelligence-lane-slot-local.mjs \
  || fail "SLOT_MANAGER_SYNTAX_FAILED"
node --check scripts/diagnose-avantiqo-intelligence-lane-live-state-local.mjs \
  || fail "LIVE_STATE_DIAGNOSTIC_SYNTAX_FAILED"
node --test tests/avantiqo-intelligence-fast-provider-contract.test.mjs \
  || fail "FAST_PROVIDER_CONTRACT_FAILED"

echo ""
echo "================ VERIFY LIVE INTELLIGENCE SLOT ================"
LIVE_STATE_OUTPUT="$(
  node --env-file=.env.local scripts/diagnose-avantiqo-intelligence-lane-live-state-local.mjs
)" || fail "INTELLIGENCE_LIVE_STATE_DIAGNOSTIC_FAILED"
printf '%s\n' "$LIVE_STATE_OUTPUT"
printf '%s\n' "$LIVE_STATE_OUTPUT" \
  | grep -q 'AVANTIQO_INTELLIGENCE_LANE_LIVE_STATE=CANONICAL_DEEP_ACTIVE_FAST_PARKED' \
  || fail "CANONICAL_DEEP_ACTIVE_FAST_PARKED_REQUIRED"

echo ""
echo "================ ACTIVATE FAST FLEX SLOT ================"
ACTIVATE_OUTPUT="$(
  AVANTIQO_INTELLIGENCE_FAST_SLOT_SWAP_APPROVED=YES \
    node --env-file=.env.local scripts/manage-avantiqo-intelligence-lane-slot-local.mjs --activate-fast
)" || fail "FAST_SLOT_ACTIVATION_FAILED"
printf '%s\n' "$ACTIVATE_OUTPUT"
printf '%s\n' "$ACTIVATE_OUTPUT" | grep -q '"fast_active_state": true' \
  || fail "FAST_ACTIVE_STATE_NOT_VERIFIED"
printf '%s\n' "$ACTIVATE_OUTPUT" | grep -q '"total_intelligence_workers_max": 1' \
  || fail "INTELLIGENCE_SINGLE_SLOT_NOT_PRESERVED"
FAST_ACTIVE=YES

echo ""
echo "================ WARM FAST SELF-HOSTED MODEL ROUTE ================"
EXPECTED_MODEL="$EXPECTED_MODEL" WARM_TIMEOUT_MS="$WARM_TIMEOUT_MS" \
node --env-file=.env.local --input-type=module <<'NODE'
const endpointId = String(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID || "").trim();
const apiKey = String(process.env.RUNPOD_API_KEY || "").trim();
const expectedModel = String(process.env.EXPECTED_MODEL || "").trim();
const timeoutMs = Number(process.env.WARM_TIMEOUT_MS || 360000);
if (!endpointId || !apiKey || !expectedModel) throw new Error("FAST_WARM_CONFIGURATION_REQUIRED");

const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };
const beforeResponse = await fetch(`https://api.runpod.ai/v2/${endpointId}/health`, {
  headers,
  signal: AbortSignal.timeout(15000),
});
const before = await beforeResponse.json();
if (!beforeResponse.ok) throw new Error(`FAST_WARM_HEALTH_HTTP_${beforeResponse.status}`);
const inQueue = Number(before?.jobs?.inQueue || 0);
const inProgress = Number(before?.jobs?.inProgress || 0);
if (inQueue !== 0 || inProgress !== 0) {
  throw new Error(`FAST_WARM_ZERO_JOB_REQUIRED:in_queue=${inQueue}:in_progress=${inProgress}`);
}

const startedAt = Date.now();
const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/openai/v1/models`, {
  headers,
  signal: AbortSignal.timeout(timeoutMs),
});
const raw = await response.text();
let body = null;
try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
if (!response.ok || !body) {
  throw new Error(`FAST_WARM_MODELS_HTTP_${response.status}`);
}
const ids = Array.isArray(body?.data)
  ? body.data.map((entry) => String(entry?.id || "").trim()).filter(Boolean)
  : [];
if (!ids.includes(expectedModel)) {
  throw new Error(`FAST_WARM_EXPECTED_MODEL_NOT_SERVED:expected=${expectedModel}:served=${ids.join(",") || "NONE"}`);
}
console.log(`AVANTIQO_FAST_WARM_MODEL_ROUTE_LATENCY_MS=${Date.now() - startedAt}`);
console.log(`AVANTIQO_FAST_WARM_MODEL_IDS=${JSON.stringify(ids)}`);
console.log("AVANTIQO_FAST_WARM_EXPECTED_MODEL_SERVED=YES");
console.log("AVANTIQO_FAST_WARM_ROUTE=PASS");
NODE

echo ""
echo "================ ONE CONTROLLED FAST INTELLIGENCE RESPONSE ================"
GENERATION_SUBMITTED=YES
EXPECTED_MODEL="$EXPECTED_MODEL" RESPONSE_TIMEOUT_MS="$RESPONSE_TIMEOUT_MS" \
node --env-file=.env.local --input-type=module <<'NODE'
const expectedModel = String(process.env.EXPECTED_MODEL || "").trim();
const responseTimeoutMs = Number(process.env.RESPONSE_TIMEOUT_MS || 120000);
const {
  AvantiqoIntelligenceProvider,
  getAvantiqoIntelligenceRuntimeConfiguration,
} = await import("./lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js");

const configuration = getAvantiqoIntelligenceRuntimeConfiguration();
const fast = configuration?.execution_lanes?.fast || {};
if (String(fast?.model || "").trim() !== expectedModel) {
  throw new Error(`FAST_RESPONSE_RUNTIME_MODEL_MISMATCH:actual=${String(fast?.model || "UNKNOWN")}:expected=${expectedModel}`);
}
if (fast?.runtime_ready !== true) throw new Error("FAST_RESPONSE_RUNTIME_NOT_READY");

const prompt = String(
  process.env.AVANTIQO_INTELLIGENCE_FIRST_PROMPT ||
    "A business owner says sales increased 12% this month but cash in the bank fell. In four concise sentences, give three plausible business causes and the first two checks you would perform."
).trim();
const startedAt = Date.now();
const response = await AvantiqoIntelligenceProvider.execute({
  execution_lane: "fast",
  messages: [
    {
      role: "system",
      content: "You are Avantiqo Intelligence. Give concise practical business reasoning. Do not expose private chain-of-thought, do not fabricate live facts, and do not output JSON unless asked.",
    },
    { role: "user", content: prompt },
  ],
  temperature: 0.2,
  top_p: 0.8,
  max_output_tokens: 220,
  request_timeout_ms: responseTimeoutMs,
  context: {
    organization_id: "local-first-intelligence-certification",
    organization_service_id: "local-first-intelligence-certification",
    usage_id: `local-first-intelligence-certification-${Date.now()}`,
  },
});
const output = response?.output || {};
const answer = String(output?.text || "").trim();
if (!answer) throw new Error("FAST_RESPONSE_EMPTY");
if (/<think>|<\/think>/i.test(answer) || output?.reasoning_transport_detected === true) {
  throw new Error("FAST_RESPONSE_REASONING_TRANSPORT_DETECTED");
}
if (String(response?.model || "").trim() !== expectedModel) {
  throw new Error(`FAST_RESPONSE_MODEL_MISMATCH:actual=${String(response?.model || "UNKNOWN")}:expected=${expectedModel}`);
}
if (String(output?.execution_lane || "").trim().toLowerCase() !== "fast") {
  throw new Error(`FAST_RESPONSE_LANE_MISMATCH:actual=${String(output?.execution_lane || "UNKNOWN")}`);
}
console.log("================ AVANTIQO INTELLIGENCE ANSWER ================");
console.log(answer);
console.log("================ END ANSWER ================");
console.log(`AVANTIQO_FAST_HOT_RESPONSE_LATENCY_MS=${Date.now() - startedAt}`);
console.log(`AVANTIQO_FAST_FIRST_RESPONSE_PROVIDER=${response?.provider || "UNKNOWN"}`);
console.log(`AVANTIQO_FAST_FIRST_RESPONSE_MODEL=${response?.model || "UNKNOWN"}`);
console.log(`AVANTIQO_FAST_FIRST_RESPONSE_EXECUTION_LANE=${output?.execution_lane || "UNKNOWN"}`);
console.log(`AVANTIQO_FAST_FIRST_RESPONSE_FINISH_REASON=${output?.finish_reason || "UNKNOWN"}`);
console.log(`AVANTIQO_FAST_FIRST_RESPONSE_INPUT_TOKENS=${Number(response?.usage?.input_tokens || 0)}`);
console.log(`AVANTIQO_FAST_FIRST_RESPONSE_OUTPUT_TOKENS=${Number(response?.usage?.output_tokens || 0)}`);
console.log("AVANTIQO_FAST_FIRST_RESPONSE_REASONING_TRANSPORT_DETECTED=NO");
console.log("AVANTIQO_INTELLIGENCE_FAST_FIRST_RESPONSE=PASS");
NODE

restore_deep || fail "DEEP_RESTORE_AFTER_FAST_RESPONSE_FAILED"

echo ""
echo "================ FINAL LIVE STATE ================"
FINAL_STATE_OUTPUT="$(
  node --env-file=.env.local scripts/diagnose-avantiqo-intelligence-lane-live-state-local.mjs
)" || fail "FINAL_LIVE_STATE_DIAGNOSTIC_FAILED"
printf '%s\n' "$FINAL_STATE_OUTPUT"
printf '%s\n' "$FINAL_STATE_OUTPUT" \
  | grep -q 'AVANTIQO_INTELLIGENCE_LANE_LIVE_STATE=CANONICAL_DEEP_ACTIVE_FAST_PARKED' \
  || fail "FINAL_CANONICAL_STATE_NOT_VERIFIED"

echo "AVANTIQO_INTELLIGENCE_FAST_WARM_FIRST_RESPONSE=PASS"
echo "AVANTIQO_INTELLIGENCE_POST_TEST_STATE=DEEP_ACTIVE_FAST_PARKED"
echo "GENERATION_SUBMITTED=$GENERATION_SUBMITTED"
echo "APPROVED_GENERATIONS=1"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
