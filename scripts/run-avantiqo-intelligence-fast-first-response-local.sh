#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-fast-first-response.XXXXXX")"
SHADOW_ROOT="$TMP_DIR/repo"
SLOT_MANAGER="$TMP_DIR/manage-avantiqo-intelligence-lane-slot-local.mjs"
WARM_CONTROLLER="$TMP_DIR/manage-avantiqo-intelligence-fast-warm-probe-local.mjs"
FAST_ACTIVE=NO
RESTORED=NO

fail() {
  echo ""
  echo "AVANTIQO_INTELLIGENCE_FAST_FIRST_RESPONSE=FAIL"
  echo "AVANTIQO_INTELLIGENCE_FAST_FIRST_RESPONSE_REASON=$1"
  exit 1
}

restore_deep() {
  if [ "$FAST_ACTIVE" != "YES" ] || [ "$RESTORED" = "YES" ]; then
    return 0
  fi
  RESTORED=YES
  echo ""
  echo "================ RESTORE DEEP INTELLIGENCE SLOT ================"
  set +e
  (
    cd "$SOURCE_ROOT" || exit 1
    AVANTIQO_INTELLIGENCE_FAST_WARM_PROBE_RESTORE_APPROVED=YES \
    AVANTIQO_INTELLIGENCE_FAST_QUEUE_PURGE_APPROVED=YES \
      node --env-file=.env.local "$WARM_CONTROLLER" --restore-deep
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

echo "============================================================"
echo "AVANTIQO FAST INTELLIGENCE - FIRST REAL RESPONSE"
echo "============================================================"
echo "PROBE_SCOPE=OWNED_PROVIDER_BOUNDARY"
echo "APPLICATION_LOGIN_REQUIRED=NO"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
echo "SECRET_VALUES_PRINTED=NO"

echo ""
echo "================ FETCH AUTHORITATIVE MAIN ================"
git -C "$SOURCE_ROOT" fetch origin main || fail "GIT_FETCH_ORIGIN_MAIN_FAILED"
ORIGIN_MAIN="$(git -C "$SOURCE_ROOT" rev-parse origin/main)"
REMOTE_URL="$(git -C "$SOURCE_ROOT" remote get-url origin)"
echo "SOURCE_ORIGIN_MAIN=$ORIGIN_MAIN"

git -C "$SOURCE_ROOT" show origin/main:scripts/manage-avantiqo-intelligence-lane-slot-local.mjs > "$SLOT_MANAGER" \
  || fail "INTELLIGENCE_SLOT_MANAGER_READ_FAILED"
git -C "$SOURCE_ROOT" show origin/main:scripts/manage-avantiqo-intelligence-fast-warm-probe-local.mjs > "$WARM_CONTROLLER" \
  || fail "INTELLIGENCE_WARM_CONTROLLER_READ_FAILED"
node --check "$SLOT_MANAGER" || fail "INTELLIGENCE_SLOT_MANAGER_SYNTAX_FAILED"
node --check "$WARM_CONTROLLER" || fail "INTELLIGENCE_WARM_CONTROLLER_SYNTAX_FAILED"

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
echo "================ PARK FAST LANE ================"
PARK_OUTPUT="$(
  cd "$SOURCE_ROOT"
  AVANTIQO_INTELLIGENCE_FAST_RUNPOD_PROVISION_APPROVED=YES \
    node --env-file=.env.local "$SLOT_MANAGER" --provision
)" || fail "FAST_LANE_PROVISION_FAILED"
printf '%s\n' "$PARK_OUTPUT"
printf '%s\n' "$PARK_OUTPUT" | grep -q '"parked_state": true' || fail "FAST_LANE_PARKED_STATE_NOT_VERIFIED"

echo ""
echo "================ PURGE STALE QUEUE AND WARM FAST LANE ================"
WARM_OUTPUT="$(
  cd "$SOURCE_ROOT"
  AVANTIQO_INTELLIGENCE_FAST_WARM_PROBE_APPROVED=YES \
  AVANTIQO_INTELLIGENCE_FAST_QUEUE_PURGE_APPROVED=YES \
    node --env-file=.env.local "$WARM_CONTROLLER" --prepare-fast
)" || fail "FAST_LANE_WARM_PREPARE_FAILED"
printf '%s\n' "$WARM_OUTPUT"
printf '%s\n' "$WARM_OUTPUT" | grep -q '"fast_warm_prepared_state": true' || fail "FAST_LANE_WARM_STATE_NOT_VERIFIED"
printf '%s\n' "$WARM_OUTPUT" | grep -q '"total_intelligence_workers_max": 1' || fail "INTELLIGENCE_SLOT_TOTAL_NOT_PRESERVED"
FAST_ACTIVE=YES

echo ""
echo "================ ASK AVANTIQO INTELLIGENCE ================"
set +e
(
  cd "$SHADOW_ROOT" || exit 1
  AVANTIQO_INTELLIGENCE_FAST_REQUIRE_WARM_WORKER=YES \
  node --env-file="$SOURCE_ROOT/.env.local" --input-type=module <<'NODE'
const {
  AvantiqoIntelligenceProvider,
  getAvantiqoIntelligenceEndpointHealthForLane,
  getAvantiqoIntelligenceRuntimeConfiguration,
} = await import("./lib/platform/service-runtime/providers/avantiqo-intelligence/AvantiqoIntelligenceProvider.js");

const configuration = getAvantiqoIntelligenceRuntimeConfiguration();
const fast = configuration?.execution_lanes?.fast || {};
console.log(`AVANTIQO_FAST_MODEL=${fast.model || "UNKNOWN"}`);
console.log(`AVANTIQO_FAST_RUNTIME_READY=${fast.runtime_ready === true ? "YES" : "NO"}`);
console.log("AVANTIQO_FAST_REASONING_MODE=NON_THINKING_ONLY");
console.log("AVANTIQO_FAST_RAW_REASONING_PERSISTED=NO");

const health = await getAvantiqoIntelligenceEndpointHealthForLane({ execution_lane: "fast" });
const warm =
  Number(health?.workers?.running || 0) +
  Number(health?.workers?.idle || 0) +
  Number(health?.workers?.ready || 0);
console.log(
  `AVANTIQO_FAST_PRE_REQUEST_HEALTH workers_running=${Number(health?.workers?.running || 0)} workers_idle=${Number(health?.workers?.idle || 0)} workers_ready=${Number(health?.workers?.ready || 0)} workers_initializing=${Number(health?.workers?.initializing || 0)} jobs_in_queue=${Number(health?.jobs?.inQueue || 0)} jobs_in_progress=${Number(health?.jobs?.inProgress || 0)}`,
);
if (
  warm < 1 ||
  Number(health?.workers?.initializing || 0) !== 0 ||
  Number(health?.jobs?.inQueue || 0) !== 0 ||
  Number(health?.jobs?.inProgress || 0) !== 0
) {
  throw new Error("AVANTIQO_FAST_PRE_REQUEST_NOT_WARM_AND_QUIESCENT");
}

const prompt = String(
  process.env.AVANTIQO_INTELLIGENCE_FIRST_PROMPT ||
    "Introduce yourself as Avantiqo Intelligence. In five short sentences, explain what you can do for an Avantiqo owner and how you differ from a generic chatbot. Then give one concrete example of a task you can reason about."
).trim();

const startedAt = Date.now();
const heartbeat = setInterval(() => {
  console.log(`AVANTIQO_FAST_FIRST_RESPONSE_ACTIVE elapsed_seconds=${Math.floor((Date.now() - startedAt) / 1000)}`);
}, 10_000);
heartbeat.unref?.();

try {
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
    request_timeout_ms: 120000,
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
  console.error(`AVANTIQO_FAST_FIRST_RESPONSE_ERROR=${String(error?.message || error).replace(/\s+/g, " ").slice(0, 900)}`);
  process.exitCode = 1;
} finally {
  clearInterval(heartbeat);
}
NODE
)
RESPONSE_STATUS=$?
set -e

restore_deep || fail "DEEP_INTELLIGENCE_SLOT_RESTORE_FAILED"
[ "$RESPONSE_STATUS" -eq 0 ] || fail "FAST_PROVIDER_FIRST_RESPONSE_FAILED"

echo ""
echo "AVANTIQO_INTELLIGENCE_POST_TEST_STATE=DEEP_ACTIVE_FAST_PARKED"
