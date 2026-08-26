#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-fast-first-response.XXXXXX")"
SHADOW_ROOT="$TMP_DIR/repo"
SLOT_MANAGER="$TMP_DIR/manage-avantiqo-intelligence-lane-slot-local.mjs"
ERROR_FILE="$TMP_DIR/fast-first-response-error.txt"
FAST_ACTIVE=NO
RESTORED=NO

fail() {
  echo ""
  echo "AVANTIQO_INTELLIGENCE_FAST_FIRST_RESPONSE=FAIL"
  echo "AVANTIQO_INTELLIGENCE_FAST_FIRST_RESPONSE_REASON=$1"
  exit 1
}

purge_unclaimed_fast_queue() {
  (
    cd "$SOURCE_ROOT" || exit 1
    node --env-file=.env.local --input-type=module <<'NODE'
const endpointId = String(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID || "").trim();
const apiKey = String(process.env.RUNPOD_API_KEY || "").trim();
if (!endpointId || !apiKey) throw new Error("AVANTIQO_FAST_QUEUE_CREDENTIAL_OR_ENDPOINT_MISSING");
const base = `https://api.runpod.ai/v2/${endpointId}`;
const request = async (path, method = "GET") => {
  const response = await fetch(`${base}${path}`, {
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
const healthBefore = await request("/health");
const queuedBefore = Number(healthBefore?.jobs?.inQueue || 0);
const progressBefore = Number(healthBefore?.jobs?.inProgress || 0);
if (progressBefore > 0) {
  console.log(`AVANTIQO_FAST_QUEUE_PURGE_SKIPPED_ACTIVE_JOB=${progressBefore}`);
  console.log(`AVANTIQO_FAST_QUEUE_QUEUED_WHILE_ACTIVE=${queuedBefore}`);
  console.log("AVANTIQO_FAST_QUEUE_SECRET_VALUES_PRINTED=NO");
  process.exit(0);
}
if (queuedBefore > 0) await request("/purge-queue", "POST");
let healthAfter = healthBefore;
for (let i = 0; i < 30; i += 1) {
  healthAfter = await request("/health");
  if (Number(healthAfter?.jobs?.inQueue || 0) === 0 && Number(healthAfter?.jobs?.inProgress || 0) === 0) break;
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
const queuedAfter = Number(healthAfter?.jobs?.inQueue || 0);
const progressAfter = Number(healthAfter?.jobs?.inProgress || 0);
if (queuedAfter !== 0 || progressAfter !== 0) {
  throw new Error(`AVANTIQO_FAST_QUEUE_PURGE_VERIFY_FAILED:in_queue=${queuedAfter}:in_progress=${progressAfter}`);
}
console.log(`AVANTIQO_FAST_QUEUE_PURGED=${queuedBefore}`);
console.log("AVANTIQO_FAST_QUEUE_CLEAN=YES");
console.log("AVANTIQO_FAST_QUEUE_SECRET_VALUES_PRINTED=NO");
NODE
  )
}

restore_deep() {
  if [ "$FAST_ACTIVE" != "YES" ] || [ "$RESTORED" = "YES" ]; then
    return 0
  fi
  RESTORED=YES
  echo ""
  echo "================ RECOVER UNCLAIMED FAST QUEUE ================"
  set +e
  purge_unclaimed_fast_queue
  local queue_status=$?
  set -e
  if [ "$queue_status" -ne 0 ]; then
    echo "AVANTIQO_INTELLIGENCE_FAST_RESTORE_QUEUE_RECOVERY=FAIL"
    return "$queue_status"
  fi
  echo "AVANTIQO_INTELLIGENCE_FAST_RESTORE_QUEUE_RECOVERY=PASS"

  echo ""
  echo "================ RESTORE DEEP INTELLIGENCE SLOT ================"
  set +e
  (
    cd "$SOURCE_ROOT" || exit 1
    AVANTIQO_INTELLIGENCE_FAST_SLOT_RESTORE_APPROVED=YES \
      node --env-file=.env.local "$SLOT_MANAGER" --restore-deep
  )
  local status=$?
  set -e
  if [ "$status" -eq 0 ]; then
    FAST_ACTIVE=NO
    echo "AVANTIQO_INTELLIGENCE_DEEP_SLOT_RESTORE=PASS"
    return 0
  fi
  echo "AVANTIQO_INTELLIGENCE_DEEP_SLOT_RESTORE=FAIL"
  return "$status"
}

cleanup() {
  local original=$?
  set +e
  restore_deep
  local restored=$?
  rm -rf "$TMP_DIR" 2>/dev/null || true
  if [ "$original" -ne 0 ]; then exit "$original"; fi
  if [ "$restored" -ne 0 ]; then exit "$restored"; fi
  exit 0
}
trap cleanup EXIT INT TERM

[ -d "$SOURCE_ROOT/.git" ] || [ -f "$SOURCE_ROOT/.git" ] || fail "SOURCE_PROJECT_NOT_GIT_WORKTREE"
[ -f "$SOURCE_ROOT/.env.local" ] || fail "SOURCE_ENV_LOCAL_MISSING"
[ -d "$SOURCE_ROOT/node_modules" ] || fail "SOURCE_NODE_MODULES_MISSING"
command -v git >/dev/null 2>&1 || fail "GIT_MISSING"
command -v node >/dev/null 2>&1 || fail "NODE_MISSING"
[ "${AVANTIQO_INTELLIGENCE_FAST_FIRST_RESPONSE_SPEND_APPROVED:-}" = "YES" ] \
  || fail "FAST_FIRST_RESPONSE_SPEND_APPROVAL_REQUIRED"

echo "============================================================"
echo "AVANTIQO FAST INTELLIGENCE - FIRST REAL RESPONSE"
echo "============================================================"
echo "PROBE_SCOPE=OWNED_PROVIDER_BOUNDARY"
echo "APPLICATION_LOGIN_REQUIRED=NO"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
echo "SECRET_VALUES_PRINTED=NO"
echo "SPEND_APPROVED=YES"
echo "FAST_LIFECYCLE=PROVEN_FLEX_JOB_WAKE_V1"

echo ""
echo "================ FETCH AUTHORITATIVE MAIN ================"
git -C "$SOURCE_ROOT" fetch origin main || fail "GIT_FETCH_ORIGIN_MAIN_FAILED"
ORIGIN_MAIN="$(git -C "$SOURCE_ROOT" rev-parse origin/main)"
REMOTE_URL="$(git -C "$SOURCE_ROOT" remote get-url origin)"
echo "SOURCE_ORIGIN_MAIN=$ORIGIN_MAIN"

git -C "$SOURCE_ROOT" show origin/main:scripts/manage-avantiqo-intelligence-lane-slot-local.mjs > "$SLOT_MANAGER" \
  || fail "INTELLIGENCE_SLOT_MANAGER_READ_FAILED"
node --check "$SLOT_MANAGER" || fail "INTELLIGENCE_SLOT_MANAGER_SYNTAX_FAILED"

echo ""
echo "================ CREATE ISOLATED MAIN RUNTIME ================"
git init --quiet "$SHADOW_ROOT" || fail "ISOLATED_GIT_INIT_FAILED"
git -C "$SHADOW_ROOT" remote add origin "$REMOTE_URL" || fail "ISOLATED_ORIGIN_ADD_FAILED"
git -C "$SHADOW_ROOT" fetch --quiet --depth 1 origin "$ORIGIN_MAIN" || fail "ISOLATED_EXACT_MAIN_FETCH_FAILED"
git -C "$SHADOW_ROOT" checkout --quiet -B main FETCH_HEAD || fail "ISOLATED_EXACT_MAIN_CHECKOUT_FAILED"
[ "$(git -C "$SHADOW_ROOT" rev-parse HEAD)" = "$ORIGIN_MAIN" ] || fail "ISOLATED_HEAD_NOT_FETCHED_ORIGIN_MAIN"
ln -s "$SOURCE_ROOT/node_modules" "$SHADOW_ROOT/node_modules" || fail "NODE_MODULES_LINK_FAILED"
echo "ISOLATED_MAIN_HEAD=$ORIGIN_MAIN"
echo "SOURCE_CHECKOUT_MUTATED=NO"

echo ""
echo "================ VERIFY FAST PROVIDER CONTRACT ================" 
(
  cd "$SHADOW_ROOT"
  node --test tests/avantiqo-intelligence-fast-provider-contract.test.mjs
) || fail "FAST_PROVIDER_CONTRACT_FAILED"

echo ""
echo "================ PARK FAST LANE ================"
PARK_OUTPUT="$(
  cd "$SOURCE_ROOT"
  AVANTIQO_INTELLIGENCE_FAST_RUNPOD_PROVISION_APPROVED=YES \
    node --env-file=.env.local "$SLOT_MANAGER" --provision
)" || fail "FAST_LANE_PROVISION_FAILED"
printf '%s\n' "$PARK_OUTPUT"
printf '%s\n' "$PARK_OUTPUT" | grep -q '"parked_state": true' || fail "FAST_LANE_PARKED_STATE_NOT_VERIFIED"

echo ""
echo "================ PURGE PARKED FAST QUEUE ================"
purge_unclaimed_fast_queue || fail "FAST_LANE_QUEUE_PURGE_FAILED"

echo ""
echo "================ ACTIVATE FAST FLEX SLOT ================"
ACTIVATE_OUTPUT="$(
  cd "$SOURCE_ROOT"
  AVANTIQO_INTELLIGENCE_FAST_SLOT_SWAP_APPROVED=YES \
    node --env-file=.env.local "$SLOT_MANAGER" --activate-fast
)" || fail "FAST_LANE_SLOT_ACTIVATION_FAILED"
printf '%s\n' "$ACTIVATE_OUTPUT"
printf '%s\n' "$ACTIVATE_OUTPUT" | grep -q '"fast_active_state": true' || fail "FAST_LANE_ACTIVE_STATE_NOT_VERIFIED"
printf '%s\n' "$ACTIVATE_OUTPUT" | grep -q '"workers_min": 0' || fail "FAST_LANE_FLEX_MIN_NOT_VERIFIED"
printf '%s\n' "$ACTIVATE_OUTPUT" | grep -q '"total_intelligence_workers_max": 1' || fail "INTELLIGENCE_SLOT_TOTAL_NOT_PRESERVED"
FAST_ACTIVE=YES

echo ""
echo "================ WAIT FOR RUNPOD JOB GATEWAY ================"
echo "AVANTIQO_FAST_GATEWAY_SETTLE_SECONDS=30"
sleep 30

echo ""
echo "================ ASK AVANTIQO INTELLIGENCE ================"
set +e
(
  cd "$SHADOW_ROOT" || exit 1
  AVANTIQO_FAST_FIRST_RESPONSE_ERROR_FILE="$ERROR_FILE" \
  node --env-file="$SOURCE_ROOT/.env.local" --input-type=module <<'NODE'
import { writeFile } from "node:fs/promises";

const {
  AvantiqoIntelligenceProvider,
  getAvantiqoIntelligenceEndpointHealthForLane,
  getAvantiqoIntelligenceRuntimeConfiguration,
} = await import("./lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js");

const cleanError = (error) => String(error?.message || error).replace(/\s+/g, " ").slice(0, 900);
async function saveError(error) {
  const detail = cleanError(error);
  console.error(`AVANTIQO_FAST_FIRST_RESPONSE_ERROR=${detail}`);
  const path = String(process.env.AVANTIQO_FAST_FIRST_RESPONSE_ERROR_FILE || "").trim();
  if (!path) return;
  try { await writeFile(path, `${detail}\n`, { mode: 0o600 }); } catch {}
}

const configuration = getAvantiqoIntelligenceRuntimeConfiguration();
const fast = configuration?.execution_lanes?.fast || {};
console.log(`AVANTIQO_FAST_MODEL=${fast.model || "UNKNOWN"}`);
console.log(`AVANTIQO_FAST_RUNTIME_READY=${fast.runtime_ready === true ? "YES" : "NO"}`);
console.log("AVANTIQO_FAST_REASONING_MODE=NON_THINKING_ONLY");
console.log("AVANTIQO_FAST_RAW_REASONING_PERSISTED=NO");

let monitoring = false;
let lastSignature = "";
let lastPrintedAt = 0;
const startedAt = Date.now();
const sampleHealth = async () => {
  if (monitoring) return;
  monitoring = true;
  try {
    const health = await getAvantiqoIntelligenceEndpointHealthForLane({ execution_lane: "fast" });
    const state = {
      in_queue: Number(health?.jobs?.inQueue || 0),
      in_progress: Number(health?.jobs?.inProgress || 0),
      idle: Number(health?.workers?.idle || 0),
      ready: Number(health?.workers?.ready || 0),
      initializing: Number(health?.workers?.initializing || 0),
      running: Number(health?.workers?.running || 0),
      throttled: Number(health?.workers?.throttled || 0),
      unhealthy: Number(health?.workers?.unhealthy || 0),
    };
    const signature = JSON.stringify(state);
    const now = Date.now();
    if (signature !== lastSignature || now - lastPrintedAt >= 10000) {
      console.log(`AVANTIQO_FAST_JOB_HEALTH elapsed_seconds=${Math.floor((now - startedAt) / 1000)} state=${signature}`);
      lastSignature = signature;
      lastPrintedAt = now;
    }
  } catch (error) {
    console.log(`AVANTIQO_FAST_JOB_HEALTH_ERROR=${cleanError(error).slice(0, 300)}`);
  } finally {
    monitoring = false;
  }
};
await sampleHealth();
const monitor = setInterval(() => { void sampleHealth(); }, 2000);
monitor.unref?.();

try {
  const prompt = String(
    process.env.AVANTIQO_INTELLIGENCE_FIRST_PROMPT ||
      "Introduce yourself as Avantiqo Intelligence. In five short sentences, explain what you can do for an Avantiqo owner and how you differ from a generic chatbot. Then give one concrete example of a task you can reason about."
  ).trim();
  const response = await AvantiqoIntelligenceProvider.execute({
    execution_lane: "fast",
    messages: [
      {
        role: "system",
        content: "You are Avantiqo Intelligence, Avantiqo's owned business and engineering intelligence. Answer naturally, concisely, and practically. Do not output JSON unless explicitly requested. Do not expose private chain-of-thought or fabricate live facts.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.2,
    top_p: 0.8,
    max_output_tokens: 360,
    request_timeout_ms: 180000,
    context: {
      organization_id: "local-first-intelligence-probe",
      organization_service_id: "local-first-intelligence-probe",
      usage_id: `local-first-intelligence-probe-${Date.now()}`,
    },
  });
  const output = response?.output || {};
  const answer = String(output.text || "").trim();
  if (!answer) throw new Error("AVANTIQO_FAST_FIRST_RESPONSE_EMPTY");
  if (/<think>|<\/think>/i.test(answer) || output.reasoning_transport_detected === true) {
    throw new Error("AVANTIQO_FAST_FIRST_RESPONSE_REASONING_TRANSPORT_DETECTED");
  }
  console.log("");
  console.log("================ AVANTIQO INTELLIGENCE ANSWER ================");
  console.log(answer);
  console.log("================ END ANSWER ================");
  console.log("");
  console.log(`AVANTIQO_FAST_FIRST_RESPONSE_LATENCY_MS=${Date.now() - startedAt}`);
  console.log(`AVANTIQO_FAST_FIRST_RESPONSE_PROVIDER=${response?.provider || "UNKNOWN"}`);
  console.log(`AVANTIQO_FAST_FIRST_RESPONSE_MODEL=${response?.model || "UNKNOWN"}`);
  console.log(`AVANTIQO_FAST_FIRST_RESPONSE_EXECUTION_LANE=${output.execution_lane || "UNKNOWN"}`);
  console.log(`AVANTIQO_FAST_FIRST_RESPONSE_FINISH_REASON=${output.finish_reason || "UNKNOWN"}`);
  console.log(`AVANTIQO_FAST_FIRST_RESPONSE_INPUT_TOKENS=${Number(response?.usage?.input_tokens || 0)}`);
  console.log(`AVANTIQO_FAST_FIRST_RESPONSE_OUTPUT_TOKENS=${Number(response?.usage?.output_tokens || 0)}`);
  console.log("AVANTIQO_FAST_FIRST_RESPONSE_REASONING_TRANSPORT_DETECTED=NO");
  console.log("AVANTIQO_INTELLIGENCE_FAST_FIRST_RESPONSE=PASS");
} catch (error) {
  await saveError(error);
  process.exitCode = 1;
} finally {
  clearInterval(monitor);
  await sampleHealth();
}
NODE
)
RESPONSE_STATUS=$?
set -e

restore_deep || fail "DEEP_INTELLIGENCE_SLOT_RESTORE_FAILED"
if [ "$RESPONSE_STATUS" -ne 0 ]; then
  if [ -s "$ERROR_FILE" ]; then
    ERROR_DETAIL="$(tr '\r\n' '  ' < "$ERROR_FILE" | cut -c1-900)"
  else
    ERROR_DETAIL="ERROR_DETAIL_NOT_CAPTURED"
  fi
  echo "AVANTIQO_INTELLIGENCE_FAST_FIRST_RESPONSE_DETAIL=$ERROR_DETAIL"
  fail "FAST_PROVIDER_FIRST_RESPONSE_FAILED"
fi

echo ""
echo "AVANTIQO_INTELLIGENCE_POST_TEST_STATE=DEEP_ACTIVE_FAST_PARKED"
