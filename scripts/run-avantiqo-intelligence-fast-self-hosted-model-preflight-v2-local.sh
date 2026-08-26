#!/usr/bin/env bash
set -euo pipefail

ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
EXPECTED_MODEL="Qwen/Qwen3-30B-A3B-Instruct-2507"
MODEL_ROUTE_TIMEOUT_MS="${AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_TIMEOUT_MS:-360000}"
UNSCHEDULED_TIMEOUT_SECONDS="${AVANTIQO_INTELLIGENCE_FAST_UNSCHEDULED_TIMEOUT_SECONDS:-90}"
EXPECTED_MAIN="${AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_PREFLIGHT_V2_EXPECTED_MAIN:-}"
FAST_ACTIVE=NO
RESTORED=NO
MODEL_PID=""
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-fast-self-hosted-v2.XXXXXX")"
MODEL_RESULT="$TMP_DIR/model-result.txt"
MODEL_STATUS_FILE="$TMP_DIR/model-status.txt"
FIRST_WORKER_SECONDS=""
UNSCHEDULED=NO

fail() {
  echo ""
  echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_PREFLIGHT_V2=FAIL"
  echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_PREFLIGHT_V2_REASON=$1"
  exit 1
}

stop_model_child() {
  if [ -n "$MODEL_PID" ] && kill -0 "$MODEL_PID" 2>/dev/null; then
    kill "$MODEL_PID" 2>/dev/null || true
    wait "$MODEL_PID" 2>/dev/null || true
  fi
  MODEL_PID=""
}

safe_cleanup_probe_queue() {
  (
    cd "$ROOT" || exit 1
    node --env-file=.env.local --input-type=module <<'NODE'
const endpointId = String(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID || "").trim();
const apiKey = String(process.env.RUNPOD_API_KEY || "").trim();
if (!endpointId || !apiKey) throw new Error("FAST_PREFLIGHT_V2_CLEANUP_CONFIGURATION_REQUIRED");
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
  if (!response.ok || body === null) {
    throw new Error(`FAST_PREFLIGHT_V2_CLEANUP_HTTP_${response.status}:${path}`);
  }
  return body;
};
const before = await request("/health");
const queued = Number(before?.jobs?.inQueue || 0);
const progress = Number(before?.jobs?.inProgress || 0);
if (progress !== 0) {
  console.log(`AVANTIQO_FAST_PREFLIGHT_V2_CLEANUP_REFUSED_IN_PROGRESS=${progress}`);
  process.exit(2);
}
if (queued > 1) {
  console.log(`AVANTIQO_FAST_PREFLIGHT_V2_CLEANUP_REFUSED_MULTIPLE_QUEUED=${queued}`);
  process.exit(3);
}
if (queued === 1) {
  await request("/purge-queue", "POST");
}
for (let attempt = 0; attempt < 30; attempt += 1) {
  const after = await request("/health");
  const afterQueued = Number(after?.jobs?.inQueue || 0);
  const afterProgress = Number(after?.jobs?.inProgress || 0);
  if (afterQueued === 0 && afterProgress === 0) {
    console.log(`AVANTIQO_FAST_PREFLIGHT_V2_CLEANUP_PURGED=${queued}`);
    console.log("AVANTIQO_FAST_PREFLIGHT_V2_CLEANUP_QUEUE_ZERO=YES");
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
throw new Error("FAST_PREFLIGHT_V2_CLEANUP_VERIFY_FAILED");
NODE
  )
}

restore_deep() {
  if [ "$FAST_ACTIVE" != "YES" ] || [ "$RESTORED" = "YES" ]; then
    return 0
  fi
  RESTORED=YES
  stop_model_child

  echo ""
  echo "================ SAFE FAST PROBE CLEANUP ================"
  set +e
  safe_cleanup_probe_queue
  local queue_status=$?
  set -e
  if [ "$queue_status" -ne 0 ]; then
    RESTORED=NO
    echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_PREFLIGHT_V2_QUEUE_CLEANUP=REFUSED"
    return "$queue_status"
  fi
  echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_PREFLIGHT_V2_QUEUE_CLEANUP=PASS"

  echo ""
  echo "================ RESTORE DEEP / PARK FAST ================"
  set +e
  (
    cd "$ROOT" || exit 1
    AVANTIQO_INTELLIGENCE_FAST_SLOT_RESTORE_APPROVED=YES \
      node --env-file=.env.local scripts/manage-avantiqo-intelligence-lane-slot-local.mjs --restore-deep
  )
  local restore_status=$?
  set -e
  if [ "$restore_status" -eq 0 ]; then
    FAST_ACTIVE=NO
    echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_PREFLIGHT_V2_RESTORE=PASS"
    return 0
  fi
  RESTORED=NO
  echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_PREFLIGHT_V2_RESTORE=FAIL"
  return "$restore_status"
}

cleanup() {
  local original=$?
  set +e
  stop_model_child
  restore_deep
  local restored=$?
  rm -rf "$TMP_DIR" 2>/dev/null || true
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
[ "${AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_PREFLIGHT_V2_SPEND_APPROVED:-}" = "YES" ] \
  || fail "FAST_SELF_HOSTED_PREFLIGHT_V2_SPEND_APPROVAL_REQUIRED"
[[ "$MODEL_ROUTE_TIMEOUT_MS" =~ ^[0-9]+$ ]] || fail "MODEL_ROUTE_TIMEOUT_MUST_BE_INTEGER_MS"
[[ "$UNSCHEDULED_TIMEOUT_SECONDS" =~ ^[0-9]+$ ]] || fail "UNSCHEDULED_TIMEOUT_MUST_BE_INTEGER_SECONDS"
[ "$MODEL_ROUTE_TIMEOUT_MS" -ge 240000 ] || fail "MODEL_ROUTE_TIMEOUT_TOO_SHORT_MIN_240000_MS"
[ "$MODEL_ROUTE_TIMEOUT_MS" -le 600000 ] || fail "MODEL_ROUTE_TIMEOUT_TOO_LONG_MAX_600000_MS"
[ "$UNSCHEDULED_TIMEOUT_SECONDS" -ge 60 ] || fail "UNSCHEDULED_TIMEOUT_TOO_SHORT_MIN_60_SECONDS"
[ "$UNSCHEDULED_TIMEOUT_SECONDS" -le 180 ] || fail "UNSCHEDULED_TIMEOUT_TOO_LONG_MAX_180_SECONDS"
if [ -n "$EXPECTED_MAIN" ] && ! [[ "$EXPECTED_MAIN" =~ ^[0-9a-fA-F]{40}$ ]]; then
  fail "EXPECTED_MAIN_INVALID"
fi

cd "$ROOT"

echo "============================================================"
echo "AVANTIQO FAST INTELLIGENCE - SELF-HOSTED MODEL PREFLIGHT V2"
echo "============================================================"
echo "EXPECTED_MODEL=$EXPECTED_MODEL"
echo "MODEL_ROUTE_TIMEOUT_MS=$MODEL_ROUTE_TIMEOUT_MS"
echo "UNSCHEDULED_TIMEOUT_SECONDS=$UNSCHEDULED_TIMEOUT_SECONDS"
echo "MODEL_ROUTE_TRANSPORT=NODE_HTTPS_TOTAL_DEADLINE"
echo "GENERATION_SUBMITTED=NO"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
echo "SECRET_VALUES_PRINTED=NO"

echo ""
echo "================ PIN AUTHORITATIVE MAIN ================"
git fetch origin main || fail "GIT_FETCH_ORIGIN_MAIN_FAILED"
[ "$(git branch --show-current)" = "main" ] || fail "LOCAL_MAIN_REQUIRED"
HEAD_SHA="$(git rev-parse HEAD)"
ORIGIN_SHA="$(git rev-parse origin/main)"
if [ -n "$EXPECTED_MAIN" ]; then
  [ "$HEAD_SHA" = "$EXPECTED_MAIN" ] || fail "PINNED_MAIN_MISMATCH"
else
  if [ "$HEAD_SHA" != "$ORIGIN_SHA" ]; then
    [ -z "$(git status --porcelain --untracked-files=no)" ] || fail "LOCAL_MAIN_DIRTY_CANNOT_FAST_FORWARD"
    git merge --ff-only origin/main || fail "LOCAL_MAIN_FAST_FORWARD_FAILED"
    HEAD_SHA="$(git rev-parse HEAD)"
  fi
fi
PINNED_MAIN_SHA="$HEAD_SHA"
echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_PREFLIGHT_V2_MAIN=$PINNED_MAIN_SHA"

node --check scripts/manage-avantiqo-intelligence-lane-slot-local.mjs \
  || fail "SLOT_MANAGER_SYNTAX_FAILED"
node --check scripts/diagnose-avantiqo-intelligence-fast-live-request-local.mjs \
  || fail "LIVE_DIAGNOSTIC_SYNTAX_FAILED"

echo ""
echo "================ RESTORE CANONICAL SLOT ================"
AVANTIQO_INTELLIGENCE_FAST_SLOT_RESTORE_APPROVED=YES \
  node --env-file=.env.local scripts/manage-avantiqo-intelligence-lane-slot-local.mjs --restore-deep \
  || fail "CANONICAL_SLOT_RESTORE_FAILED"

echo ""
echo "================ RUNPOD SCHEDULER ADMISSION GATE ================"
PINNED_MAIN_SHA="$PINNED_MAIN_SHA" node --env-file=.env.local --input-type=module <<'NODE'
const managementKey = String(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY || "").trim();
const runtimeKey = String(process.env.RUNPOD_API_KEY || managementKey).trim();
if (!managementKey || !runtimeKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
const headers = { Authorization: `Bearer ${managementKey}`, Accept: "application/json" };
const runtimeHeaders = { Authorization: `Bearer ${runtimeKey}`, Accept: "application/json" };
const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const finite = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
async function request(url, init = {}, timeoutMs = 30000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body === null) {
    throw new Error(`FAST_PREFLIGHT_V2_GATE_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 500)}`);
  }
  return body;
}
const accountQuery = `query { myself { underBalance minBalance maxServerlessConcurrency clientBalance } }`;
const capacityQuery = `query { dataCenters { id name location gpuAvailability { gpuTypeId displayName stockStatus } } }`;
const [accountResponse, endpointsRaw, capacityResponse] = await Promise.all([
  request("https://api.runpod.io/graphql", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query: accountQuery }),
  }),
  request("https://rest.runpod.io/v1/endpoints?includeTemplate=false&includeWorkers=true", { headers }),
  request("https://api.runpod.io/graphql", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query: capacityQuery }),
  }).catch((error) => ({ __error: text(error?.message || error) })),
]);
if (accountResponse?.errors?.length || !accountResponse?.data?.myself) {
  throw new Error(`FAST_PREFLIGHT_V2_ACCOUNT_GATE_FAILED:${text(accountResponse?.errors?.[0]?.message || "INVALID_ACCOUNT_RESPONSE")}`);
}
const account = accountResponse.data.myself;
const endpoints = Array.isArray(endpointsRaw) ? endpointsRaw : list(endpointsRaw?.endpoints || endpointsRaw?.data || endpointsRaw?.items);
const fastMatches = endpoints.filter((entry) => text(entry?.name) === "avantiqo-intelligence-fast-v1");
if (fastMatches.length !== 1) throw new Error(`FAST_PREFLIGHT_V2_FAST_ENDPOINT_MATCHES_${fastMatches.length}`);
const fast = fastMatches[0];
const fastId = text(fast?.id);
const fastHealth = await request(`https://api.runpod.ai/v2/${encodeURIComponent(fastId)}/health`, { headers: runtimeHeaders }, 20000);
const inQueue = finite(fastHealth?.jobs?.inQueue, 0);
const inProgress = finite(fastHealth?.jobs?.inProgress, 0);
if (inQueue !== 0 || inProgress !== 0) {
  throw new Error(`FAST_PREFLIGHT_V2_FAST_QUEUE_NOT_EMPTY:in_queue=${inQueue}:in_progress=${inProgress}`);
}
let totalActive = 0;
const activeEndpoints = [];
for (const endpoint of endpoints) {
  const id = text(endpoint?.id);
  if (!id) continue;
  try {
    const workers = await request(`https://api.runpod.io/v2/serverless/${encodeURIComponent(id)}/workers`, { headers }, 15000);
    const active = list(workers?.workers).filter((worker) => {
      const status = text(worker?.status).toUpperCase();
      const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
      return ![status, desired].some((value) => ["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(value));
    });
    if (active.length > 0) {
      totalActive += active.length;
      activeEndpoints.push({ name: text(endpoint?.name) || null, active_workers: active.length });
    }
  } catch {
    // A control read failure is not treated as free capacity; fail closed below.
    console.log(`AVANTIQO_FAST_PREFLIGHT_V2_GATE_CONTROL_READ_WARNING=${JSON.stringify({ endpoint_name: text(endpoint?.name) || null })}`);
  }
}
const maxConcurrency = finite(account?.maxServerlessConcurrency, null);
const clientBalance = finite(account?.clientBalance, null);
const minBalance = finite(account?.minBalance, null);
const blockers = [];
if (account?.underBalance === true) blockers.push("ACCOUNT_UNDER_BALANCE");
if (clientBalance !== null && clientBalance <= 0) blockers.push("CLIENT_BALANCE_NON_POSITIVE");
if (clientBalance !== null && minBalance !== null && clientBalance < minBalance) blockers.push("CLIENT_BALANCE_BELOW_MINIMUM");
if (maxConcurrency === null) blockers.push("SERVERLESS_CONCURRENCY_UNKNOWN");
else if (totalActive >= maxConcurrency) blockers.push("SERVERLESS_CONCURRENCY_EXHAUSTED");

const acceptedGpuTypes = new Set(list(fast?.gpuTypeIds).map(text).filter(Boolean));
let gpuCapacity = [];
if (!capacityResponse?.__error && !capacityResponse?.errors?.length) {
  for (const dc of list(capacityResponse?.data?.dataCenters)) {
    for (const row of list(dc?.gpuAvailability)) {
      const gpuTypeId = text(row?.gpuTypeId);
      if (acceptedGpuTypes.size > 0 && !acceptedGpuTypes.has(gpuTypeId)) continue;
      gpuCapacity.push({
        location: text(dc?.location || dc?.name) || null,
        gpu_type_id: gpuTypeId || null,
        display_name: text(row?.displayName) || null,
        stock_status: text(row?.stockStatus) || null,
      });
    }
  }
  const stock = gpuCapacity.map((row) => text(row.stock_status).toLowerCase()).filter(Boolean);
  const explicitNoStock = stock.length > 0 && stock.every((value) => ["none", "unavailable", "out of stock", "no stock"].includes(value));
  if (explicitNoStock) blockers.push("FAST_ACCEPTED_GPU_POOL_NO_STOCK");
}
console.log(`AVANTIQO_FAST_PREFLIGHT_V2_SCHEDULER_GATE=${JSON.stringify({
  under_balance: account?.underBalance === true,
  client_balance_usd: clientBalance,
  min_balance_usd: minBalance,
  max_serverless_concurrency: maxConcurrency,
  total_active_control_workers: totalActive,
  concurrency_remaining: maxConcurrency === null ? null : maxConcurrency - totalActive,
  active_endpoints: activeEndpoints,
  fast_gpu_capacity: gpuCapacity,
  hard_blockers: blockers,
})}`);
if (blockers.length > 0) {
  console.log(`AVANTIQO_FAST_PREFLIGHT_V2_SCHEDULER_GATE_RESULT=BLOCKED:${blockers.join(",")}`);
  process.exit(3);
}
console.log("AVANTIQO_FAST_PREFLIGHT_V2_SCHEDULER_GATE_RESULT=PASS");
NODE
GATE_STATUS=$?
[ "$GATE_STATUS" -eq 0 ] || fail "RUNPOD_SCHEDULER_ADMISSION_GATE_BLOCKED"

echo ""
echo "================ ACTIVATE FAST WITHOUT GENERATION ================"
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
echo "================ QUERY FAST SELF-HOSTED MODEL ROUTE ================"
rm -f "$MODEL_STATUS_FILE"
(
  set +e
  EXPECTED_MODEL="$EXPECTED_MODEL" MODEL_ROUTE_TIMEOUT_MS="$MODEL_ROUTE_TIMEOUT_MS" \
    node --env-file=.env.local --input-type=module >"$MODEL_RESULT" 2>&1 <<'NODE'
import https from "node:https";

const endpointId = String(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID || "").trim();
const apiKey = String(process.env.RUNPOD_API_KEY || "").trim();
const expectedModel = String(process.env.EXPECTED_MODEL || "").trim();
const timeoutMs = Number(process.env.MODEL_ROUTE_TIMEOUT_MS || 360000);
if (!endpointId || !apiKey || !expectedModel) throw new Error("FAST_PREFLIGHT_V2_CONFIGURATION_REQUIRED");
const headers = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };

const healthResponse = await fetch(`https://api.runpod.ai/v2/${endpointId}/health`, {
  headers,
  signal: AbortSignal.timeout(15000),
});
const healthRaw = await healthResponse.text();
let health = null;
try { health = healthRaw ? JSON.parse(healthRaw) : null; } catch { health = null; }
if (!healthResponse.ok || !health) throw new Error(`FAST_PREFLIGHT_V2_HEALTH_HTTP_${healthResponse.status}`);
const queued = Number(health?.jobs?.inQueue || 0);
const progress = Number(health?.jobs?.inProgress || 0);
if (queued !== 0 || progress !== 0) {
  throw new Error(`FAST_PREFLIGHT_V2_ZERO_JOB_REQUIRED:in_queue=${queued}:in_progress=${progress}`);
}
console.log(`AVANTIQO_FAST_PREFLIGHT_V2_HEALTH_BEFORE=${JSON.stringify({ jobs: health?.jobs || {}, workers: health?.workers || {} })}`);

function longJsonRequest(url, requestHeaders, totalTimeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let request;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      callback(value);
    };
    const deadline = setTimeout(() => {
      if (request) request.destroy(new Error(`FAST_PREFLIGHT_V2_TOTAL_TIMEOUT_MS_${totalTimeoutMs}`));
    }, totalTimeoutMs);
    deadline.unref?.();
    request = https.request(url, { method: "GET", headers: requestHeaders }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        raw += chunk;
        if (raw.length > 5_000_000) request.destroy(new Error("FAST_PREFLIGHT_V2_RESPONSE_TOO_LARGE"));
      });
      response.on("end", () => {
        let body = null;
        try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
        finish(resolve, { status: Number(response.statusCode || 0), body, raw });
      });
      response.on("error", (error) => finish(reject, error));
    });
    request.on("error", (error) => finish(reject, error));
    request.end();
  });
}

try {
  const startedAt = Date.now();
  const result = await longJsonRequest(
    `https://api.runpod.ai/v2/${endpointId}/openai/v1/models`,
    headers,
    timeoutMs,
  );
  if (result.status < 200 || result.status >= 300 || !result.body) {
    const detail = String(result.body?.error?.message || result.body?.message || result.raw || "EMPTY_BODY")
      .replace(/\s+/g, " ")
      .slice(0, 500);
    throw new Error(`FAST_PREFLIGHT_V2_MODELS_HTTP_${result.status}:${detail}`);
  }
  const ids = Array.isArray(result.body?.data)
    ? result.body.data.map((entry) => String(entry?.id || "").trim()).filter(Boolean)
    : [];
  const latency = Date.now() - startedAt;
  console.log(`AVANTIQO_FAST_PREFLIGHT_V2_MODELS_LATENCY_MS=${latency}`);
  console.log(`AVANTIQO_FAST_PREFLIGHT_V2_MODEL_IDS=${JSON.stringify(ids)}`);
  if (!ids.includes(expectedModel)) {
    throw new Error(`FAST_PREFLIGHT_V2_EXPECTED_MODEL_NOT_SERVED:expected=${expectedModel}:served=${ids.join(",") || "NONE"}`);
  }
  console.log("AVANTIQO_FAST_PREFLIGHT_V2_EXPECTED_MODEL_SERVED=YES");
  console.log("AVANTIQO_FAST_PREFLIGHT_V2_MODEL_ROUTE=PASS");
} catch (error) {
  console.error(`AVANTIQO_FAST_PREFLIGHT_V2_MODEL_ROUTE_ERROR=${String(error?.message || error).replace(/\s+/g, " ").slice(0, 900)}`);
  process.exitCode = 1;
}
NODE
  echo "$?" >"$MODEL_STATUS_FILE"
) &
MODEL_PID=$!

MONITOR_START=$SECONDS
while kill -0 "$MODEL_PID" 2>/dev/null; do
  sleep 10
  if ! kill -0 "$MODEL_PID" 2>/dev/null; then break; fi
  ELAPSED=$((SECONDS - MONITOR_START))
  set +e
  MONITOR_OUTPUT="$(PREFLIGHT_ELAPSED_SECONDS="$ELAPSED" node --env-file=.env.local --input-type=module <<'NODE'
const endpointId = String(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID || "").trim();
const runtimeKey = String(process.env.RUNPOD_API_KEY || "").trim();
const managementKey = String(process.env.RUNPOD_MANAGEMENT_API_KEY || runtimeKey).trim();
const elapsed = Number(process.env.PREFLIGHT_ELAPSED_SECONDS || 0);
if (!endpointId || !runtimeKey || !managementKey) process.exit(2);
const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
async function read(url, key, timeoutMs = 10000) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body === null) throw new Error(`HTTP_${response.status}`);
  return body;
}
try {
  const [health, control] = await Promise.all([
    read(`https://api.runpod.ai/v2/${endpointId}/health`, runtimeKey),
    read(`https://api.runpod.io/v2/serverless/${endpointId}/workers`, managementKey),
  ]);
  const controlWorkers = list(control?.workers).filter((worker) => {
    const status = text(worker?.status).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    return ![status, desired].some((value) => ["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(value));
  });
  const workers = health?.workers || {};
  const workerVisible = controlWorkers.length > 0 || [workers.idle, workers.initializing, workers.ready, workers.running].some((value) => Number(value || 0) > 0);
  console.log(`AVANTIQO_FAST_PREFLIGHT_V2_PROGRESS=${JSON.stringify({
    elapsed_seconds: elapsed,
    jobs: health?.jobs || {},
    workers,
    active_control_workers: controlWorkers.length,
    worker_visible: workerVisible,
  })}`);
  console.log(`AVANTIQO_FAST_PREFLIGHT_V2_WORKER_VISIBLE=${workerVisible ? "YES" : "NO"}`);
} catch (error) {
  console.log(`AVANTIQO_FAST_PREFLIGHT_V2_PROGRESS_UNAVAILABLE=${text(error?.message || error)}`);
  console.log("AVANTIQO_FAST_PREFLIGHT_V2_WORKER_VISIBLE=UNKNOWN");
}
NODE
)"
  MONITOR_STATUS=$?
  set -e
  printf '%s\n' "$MONITOR_OUTPUT"
  if [ "$MONITOR_STATUS" -eq 0 ] && printf '%s\n' "$MONITOR_OUTPUT" | grep -q 'AVANTIQO_FAST_PREFLIGHT_V2_WORKER_VISIBLE=YES'; then
    if [ -z "$FIRST_WORKER_SECONDS" ]; then
      FIRST_WORKER_SECONDS="$ELAPSED"
      echo "AVANTIQO_FAST_PREFLIGHT_V2_FIRST_WORKER_VISIBLE_SECONDS=$FIRST_WORKER_SECONDS"
    fi
  fi
  if [ -z "$FIRST_WORKER_SECONDS" ] && [ "$ELAPSED" -ge "$UNSCHEDULED_TIMEOUT_SECONDS" ]; then
    UNSCHEDULED=YES
    echo "AVANTIQO_FAST_PREFLIGHT_V2_UNSCHEDULED_ABORT_SECONDS=$ELAPSED"
    stop_model_child
    break
  fi
done

if [ "$UNSCHEDULED" = "YES" ]; then
  safe_cleanup_probe_queue || fail "UNSCHEDULED_PROBE_QUEUE_CLEANUP_FAILED"
  restore_deep || fail "DEEP_RESTORE_AFTER_UNSCHEDULED_PROBE_FAILED"
  fail "RUNPOD_FAST_WORKER_NOT_SCHEDULED_WITHIN_${UNSCHEDULED_TIMEOUT_SECONDS}_SECONDS"
fi

wait "$MODEL_PID" 2>/dev/null || true
MODEL_PID=""
cat "$MODEL_RESULT"
MODEL_STATUS="1"
if [ -f "$MODEL_STATUS_FILE" ]; then MODEL_STATUS="$(cat "$MODEL_STATUS_FILE")"; fi

if [ "$MODEL_STATUS" -ne 0 ]; then
  echo ""
  echo "================ FAILURE-TIME FAST WORKER EVIDENCE ================"
  set +e
  AVANTIQO_INTELLIGENCE_FAST_LIVE_REQUEST_EXPECTED_MAIN="$PINNED_MAIN_SHA" \
    node --env-file=.env.local scripts/diagnose-avantiqo-intelligence-fast-live-request-local.mjs
  DIAGNOSTIC_STATUS=$?
  set -e
  echo "AVANTIQO_FAST_PREFLIGHT_V2_FAILURE_DIAGNOSTIC_STATUS=$DIAGNOSTIC_STATUS"
  safe_cleanup_probe_queue || fail "FAILED_PROBE_QUEUE_CLEANUP_FAILED"
  restore_deep || fail "DEEP_RESTORE_AFTER_MODEL_ROUTE_FAILURE_FAILED"
  fail "FAST_SELF_HOSTED_MODEL_ROUTE_FAILED"
fi

restore_deep || fail "DEEP_RESTORE_AFTER_PREFLIGHT_FAILED"

echo ""
echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_PREFLIGHT_V2=PASS"
echo "AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_MODEL_PREFLIGHT_V2_FIRST_WORKER_SECONDS=${FIRST_WORKER_SECONDS:-UNKNOWN}"
echo "AVANTIQO_INTELLIGENCE_POST_TEST_STATE=DEEP_ACTIVE_FAST_PARKED"
echo "GENERATION_SUBMITTED=NO"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
