#!/usr/bin/env bash
set -euo pipefail

ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
EXPECTED_MODEL="Qwen/Qwen3-30B-A3B-Thinking-2507"
MODEL_ROUTE_TIMEOUT_MS="${AVANTIQO_INTELLIGENCE_DEEP_SCHEDULER_CONTROL_MODEL_TIMEOUT_MS:-360000}"
UNSCHEDULED_TIMEOUT_SECONDS="${AVANTIQO_INTELLIGENCE_DEEP_SCHEDULER_CONTROL_UNSCHEDULED_TIMEOUT_SECONDS:-90}"
EXPECTED_MAIN="${AVANTIQO_INTELLIGENCE_DEEP_SCHEDULER_CONTROL_EXPECTED_MAIN:-}"
APPROVAL="${AVANTIQO_INTELLIGENCE_DEEP_SCHEDULER_CONTROL_SPEND_APPROVED:-}"
CONTRACT="AVANTIQO_INTELLIGENCE_DEEP_SCHEDULER_CONTROL_PREFLIGHT_V1"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-deep-scheduler-control.XXXXXX")"
MODEL_RESULT="$TMP_DIR/model-result.txt"
MODEL_STATUS_FILE="$TMP_DIR/model-status.txt"
MODEL_PID=""
FIRST_WORKER_SECONDS=""
UNSCHEDULED=NO

fail() {
  echo ""
  echo "$CONTRACT=FAIL"
  echo "${CONTRACT}_REASON=$1"
  exit 1
}

stop_model_child() {
  if [ -n "$MODEL_PID" ] && kill -0 "$MODEL_PID" 2>/dev/null; then
    kill "$MODEL_PID" 2>/dev/null || true
    wait "$MODEL_PID" 2>/dev/null || true
  fi
  MODEL_PID=""
}

safe_cleanup_deep_probe_queue() {
  (
    cd "$ROOT" || exit 1
    node --env-file=.env.local --input-type=module <<'NODE'
const endpointName = "avantiqo-intelligence-v1";
const managementKey = String(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY || "").trim();
const runtimeKey = String(process.env.RUNPOD_API_KEY || managementKey).trim();
if (!managementKey || !runtimeKey) throw new Error("DEEP_SCHEDULER_CONTROL_CREDENTIAL_REQUIRED");
const request = async (url, init = {}, timeoutMs = 20000) => {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body === null) {
    throw new Error(`DEEP_SCHEDULER_CONTROL_CLEANUP_HTTP_${response.status}`);
  }
  return body;
};
const endpointsRaw = await request(
  "https://rest.runpod.io/v1/endpoints?includeTemplate=false&includeWorkers=true",
  { headers: { Authorization: `Bearer ${managementKey}`, Accept: "application/json" } },
);
const rows = Array.isArray(endpointsRaw) ? endpointsRaw : (endpointsRaw?.endpoints || endpointsRaw?.data || endpointsRaw?.items || []);
const matches = rows.filter((entry) => String(entry?.name || "").trim() === endpointName);
if (matches.length !== 1) throw new Error(`DEEP_SCHEDULER_CONTROL_ENDPOINT_MATCHES_${matches.length}`);
const endpointId = String(matches[0]?.id || "").trim();
if (!endpointId) throw new Error("DEEP_SCHEDULER_CONTROL_ENDPOINT_ID_REQUIRED");
const base = `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}`;
const runtimeHeaders = { Authorization: `Bearer ${runtimeKey}`, Accept: "application/json" };
const before = await request(`${base}/health`, { headers: runtimeHeaders });
const queued = Number(before?.jobs?.inQueue || 0);
const progress = Number(before?.jobs?.inProgress || 0);
if (progress !== 0) {
  console.log(`AVANTIQO_DEEP_SCHEDULER_CONTROL_CLEANUP_REFUSED_IN_PROGRESS=${progress}`);
  process.exit(2);
}
if (queued > 1) {
  console.log(`AVANTIQO_DEEP_SCHEDULER_CONTROL_CLEANUP_REFUSED_MULTIPLE_QUEUED=${queued}`);
  process.exit(3);
}
if (queued === 1) {
  await request(`${base}/purge-queue`, {
    method: "POST",
    headers: runtimeHeaders,
  });
}
for (let attempt = 0; attempt < 30; attempt += 1) {
  const after = await request(`${base}/health`, { headers: runtimeHeaders });
  const afterQueued = Number(after?.jobs?.inQueue || 0);
  const afterProgress = Number(after?.jobs?.inProgress || 0);
  if (afterQueued === 0 && afterProgress === 0) {
    console.log(`AVANTIQO_DEEP_SCHEDULER_CONTROL_CLEANUP_PURGED=${queued}`);
    console.log("AVANTIQO_DEEP_SCHEDULER_CONTROL_CLEANUP_QUEUE_ZERO=YES");
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
throw new Error("DEEP_SCHEDULER_CONTROL_CLEANUP_VERIFY_FAILED");
NODE
  )
}

cleanup() {
  local original=$?
  set +e
  stop_model_child
  rm -rf "$TMP_DIR" 2>/dev/null || true
  exit "$original"
}
trap cleanup EXIT INT TERM

[ -d "$ROOT/.git" ] || [ -f "$ROOT/.git" ] || fail "PROJECT_NOT_GIT_WORKTREE"
[ -f "$ROOT/.env.local" ] || fail "ENV_LOCAL_MISSING"
[ -d "$ROOT/node_modules" ] || fail "NODE_MODULES_MISSING"
command -v git >/dev/null 2>&1 || fail "GIT_MISSING"
command -v node >/dev/null 2>&1 || fail "NODE_MISSING"
[ "$APPROVAL" = "YES" ] || fail "DEEP_SCHEDULER_CONTROL_SPEND_APPROVAL_REQUIRED"
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
echo "AVANTIQO DEEP INTELLIGENCE - SCHEDULER CONTROL PREFLIGHT"
echo "============================================================"
echo "EXPECTED_MODEL=$EXPECTED_MODEL"
echo "MODEL_ROUTE_TIMEOUT_MS=$MODEL_ROUTE_TIMEOUT_MS"
echo "UNSCHEDULED_TIMEOUT_SECONDS=$UNSCHEDULED_TIMEOUT_SECONDS"
echo "MODEL_ROUTE_TRANSPORT=NODE_HTTPS_TOTAL_DEADLINE"
echo "GENERATION_SUBMITTED=NO"
echo "FAST_ENDPOINT_MUTATION=NO"
echo "TEMPLATE_MUTATION=NO"
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
echo "${CONTRACT}_MAIN=$PINNED_MAIN_SHA"

echo ""
echo "================ VERIFY CANONICAL DEEP CONTROL STATE ================"
set +e
PINNED_MAIN_SHA="$PINNED_MAIN_SHA" node --env-file=.env.local --input-type=module <<'NODE'
const deepName = "avantiqo-intelligence-v1";
const fastName = "avantiqo-intelligence-fast-v1";
const managementKey = String(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY || "").trim();
const runtimeKey = String(process.env.RUNPOD_API_KEY || managementKey).trim();
if (!managementKey || !runtimeKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
async function request(url, init = {}, timeoutMs = 30000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body === null) throw new Error(`DEEP_CONTROL_STATE_HTTP_${response.status}`);
  return body;
}
const managementHeaders = { Authorization: `Bearer ${managementKey}`, Accept: "application/json" };
const runtimeHeaders = { Authorization: `Bearer ${runtimeKey}`, Accept: "application/json" };
const endpointsRaw = await request(
  "https://rest.runpod.io/v1/endpoints?includeTemplate=true&includeWorkers=true",
  { headers: managementHeaders },
);
const endpoints = Array.isArray(endpointsRaw) ? endpointsRaw : list(endpointsRaw?.endpoints || endpointsRaw?.data || endpointsRaw?.items);
const deepMatches = endpoints.filter((entry) => text(entry?.name) === deepName);
const fastMatches = endpoints.filter((entry) => text(entry?.name) === fastName);
if (deepMatches.length !== 1 || fastMatches.length !== 1) {
  throw new Error(`DEEP_CONTROL_ENDPOINT_RESOLUTION_FAILED:deep=${deepMatches.length}:fast=${fastMatches.length}`);
}
const deep = deepMatches[0];
const fast = fastMatches[0];
const [deepHealth, fastHealth] = await Promise.all([
  request(`https://api.runpod.ai/v2/${encodeURIComponent(text(deep?.id))}/health`, { headers: runtimeHeaders }, 20000),
  request(`https://api.runpod.ai/v2/${encodeURIComponent(text(fast?.id))}/health`, { headers: runtimeHeaders }, 20000),
]);
const summary = {
  deep_workers_min: finite(deep?.workersMin),
  deep_workers_max: finite(deep?.workersMax),
  fast_workers_min: finite(fast?.workersMin),
  fast_workers_max: finite(fast?.workersMax),
  deep_gpu_type_ids: list(deep?.gpuTypeIds).map(text).filter(Boolean),
  fast_gpu_type_ids: list(fast?.gpuTypeIds).map(text).filter(Boolean),
  deep_jobs: {
    in_queue: finite(deepHealth?.jobs?.inQueue, 0),
    in_progress: finite(deepHealth?.jobs?.inProgress, 0),
  },
  fast_jobs: {
    in_queue: finite(fastHealth?.jobs?.inQueue, 0),
    in_progress: finite(fastHealth?.jobs?.inProgress, 0),
  },
};
const canonical =
  summary.deep_workers_min === 0 &&
  summary.deep_workers_max === 1 &&
  summary.fast_workers_min === 0 &&
  summary.fast_workers_max === 0 &&
  summary.deep_jobs.in_queue === 0 &&
  summary.deep_jobs.in_progress === 0 &&
  summary.fast_jobs.in_queue === 0 &&
  summary.fast_jobs.in_progress === 0;
console.log(`AVANTIQO_DEEP_SCHEDULER_CONTROL_STATE=${JSON.stringify({ ...summary, canonical })}`);
if (!canonical) process.exit(3);
NODE
STATE_STATUS=$?
set -e
[ "$STATE_STATUS" -eq 0 ] || fail "CANONICAL_DEEP_ACTIVE_FAST_PARKED_ZERO_QUEUE_REQUIRED"

echo ""
echo "================ RUNPOD SCHEDULER ADMISSION GATE ================"
set +e
node --env-file=.env.local --input-type=module <<'NODE'
const deepName = "avantiqo-intelligence-v1";
const managementKey = String(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY || "").trim();
const runtimeKey = String(process.env.RUNPOD_API_KEY || managementKey).trim();
if (!managementKey || !runtimeKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
async function request(url, init = {}, timeoutMs = 30000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body === null) throw new Error(`DEEP_SCHEDULER_GATE_HTTP_${response.status}`);
  return body;
}
const headers = { Authorization: `Bearer ${managementKey}`, Accept: "application/json" };
const runtimeHeaders = { Authorization: `Bearer ${runtimeKey}`, Accept: "application/json" };
const accountQuery = `query { myself { underBalance minBalance maxServerlessConcurrency clientBalance } }`;
const [accountResponse, endpointsRaw] = await Promise.all([
  request("https://api.runpod.io/graphql", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ query: accountQuery }),
  }),
  request("https://rest.runpod.io/v1/endpoints?includeTemplate=false&includeWorkers=true", { headers }),
]);
if (accountResponse?.errors?.length || !accountResponse?.data?.myself) {
  throw new Error("DEEP_SCHEDULER_GATE_ACCOUNT_RESPONSE_INVALID");
}
const endpoints = Array.isArray(endpointsRaw) ? endpointsRaw : list(endpointsRaw?.endpoints || endpointsRaw?.data || endpointsRaw?.items);
const deepMatches = endpoints.filter((entry) => text(entry?.name) === deepName);
if (deepMatches.length !== 1) throw new Error(`DEEP_SCHEDULER_GATE_ENDPOINT_MATCHES_${deepMatches.length}`);
const deep = deepMatches[0];
const deepHealth = await request(
  `https://api.runpod.ai/v2/${encodeURIComponent(text(deep?.id))}/health`,
  { headers: runtimeHeaders },
  20000,
);
if (finite(deepHealth?.jobs?.inQueue, 0) !== 0 || finite(deepHealth?.jobs?.inProgress, 0) !== 0) {
  throw new Error("DEEP_SCHEDULER_GATE_QUEUE_NOT_EMPTY");
}
let totalActive = 0;
let controlReadFailures = 0;
const activeEndpoints = [];
for (const endpoint of endpoints) {
  const id = text(endpoint?.id);
  if (!id) continue;
  try {
    const body = await request(
      `https://api.runpod.io/v2/serverless/${encodeURIComponent(id)}/workers`,
      { headers },
      15000,
    );
    const active = list(body?.workers).filter((worker) => {
      const status = text(worker?.status).toUpperCase();
      return !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(status);
    });
    if (active.length > 0) {
      totalActive += active.length;
      activeEndpoints.push({ name: text(endpoint?.name) || null, active_workers: active.length });
    }
  } catch {
    controlReadFailures += 1;
  }
}
const account = accountResponse.data.myself;
const maxConcurrency = finite(account?.maxServerlessConcurrency, null);
const clientBalance = finite(account?.clientBalance, null);
const minBalance = finite(account?.minBalance, null);
const blockers = [];
if (account?.underBalance === true) blockers.push("ACCOUNT_UNDER_BALANCE");
if (clientBalance !== null && clientBalance <= 0) blockers.push("CLIENT_BALANCE_NON_POSITIVE");
if (clientBalance !== null && minBalance !== null && clientBalance < minBalance) blockers.push("CLIENT_BALANCE_BELOW_MINIMUM");
if (controlReadFailures > 0) blockers.push("SERVERLESS_CONTROL_WORKER_STATE_INCOMPLETE");
if (maxConcurrency === null) blockers.push("SERVERLESS_CONCURRENCY_UNKNOWN");
else if (totalActive >= maxConcurrency) blockers.push("SERVERLESS_CONCURRENCY_EXHAUSTED");
console.log(`AVANTIQO_DEEP_SCHEDULER_CONTROL_GATE=${JSON.stringify({
  under_balance: account?.underBalance === true,
  client_balance_usd: clientBalance,
  min_balance_usd: minBalance,
  max_serverless_concurrency: maxConcurrency,
  total_active_control_workers: totalActive,
  concurrency_remaining: maxConcurrency === null ? null : maxConcurrency - totalActive,
  active_endpoints: activeEndpoints,
  control_read_failures: controlReadFailures,
  deep_gpu_type_ids: list(deep?.gpuTypeIds).map(text).filter(Boolean),
  hard_blockers: blockers,
})}`);
if (blockers.length > 0) process.exit(4);
NODE
GATE_STATUS=$?
set -e
if [ "$GATE_STATUS" -ne 0 ]; then
  fail "RUNPOD_DEEP_SCHEDULER_ADMISSION_GATE_BLOCKED"
fi
echo "AVANTIQO_DEEP_SCHEDULER_CONTROL_GATE_RESULT=PASS"

echo ""
echo "================ QUERY DEEP SELF-HOSTED MODEL ROUTE ================"
PINNED_MODEL="$EXPECTED_MODEL" MODEL_ROUTE_TIMEOUT_MS="$MODEL_ROUTE_TIMEOUT_MS" MODEL_RESULT="$MODEL_RESULT" MODEL_STATUS_FILE="$MODEL_STATUS_FILE" \
node --env-file=.env.local --input-type=module <<'NODE' &
import https from "node:https";

const expectedModel = String(process.env.PINNED_MODEL || "").trim();
const timeoutMs = Number(process.env.MODEL_ROUTE_TIMEOUT_MS || 360000);
const resultFile = String(process.env.MODEL_RESULT || "").trim();
const statusFile = String(process.env.MODEL_STATUS_FILE || "").trim();
const managementKey = String(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY || "").trim();
const runtimeKey = String(process.env.RUNPOD_API_KEY || managementKey).trim();
if (!expectedModel || !resultFile || !statusFile || !managementKey || !runtimeKey) process.exit(8);

async function resolveEndpoint() {
  const response = await fetch(
    "https://rest.runpod.io/v1/endpoints?includeTemplate=false&includeWorkers=false",
    {
      headers: { Authorization: `Bearer ${managementKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    },
  );
  const raw = await response.text();
  const body = raw ? JSON.parse(raw) : null;
  if (!response.ok || body === null) throw new Error(`ENDPOINT_RESOLUTION_HTTP_${response.status}`);
  const rows = Array.isArray(body) ? body : (body?.endpoints || body?.data || body?.items || []);
  const matches = rows.filter((entry) => String(entry?.name || "").trim() === "avantiqo-intelligence-v1");
  if (matches.length !== 1) throw new Error(`DEEP_ENDPOINT_MATCHES_${matches.length}`);
  const id = String(matches[0]?.id || "").trim();
  if (!id) throw new Error("DEEP_ENDPOINT_ID_REQUIRED");
  return id;
}

const endpointId = await resolveEndpoint();
const started = Date.now();
const path = `/v2/${encodeURIComponent(endpointId)}/openai/v1/models`;
const request = https.request(
  {
    hostname: "api.runpod.ai",
    port: 443,
    path,
    method: "GET",
    headers: {
      Authorization: `Bearer ${runtimeKey}`,
      Accept: "application/json",
    },
  },
  (response) => {
    let raw = "";
    response.setEncoding("utf8");
    response.on("data", (chunk) => { raw += chunk; });
    response.on("end", async () => {
      const fs = await import("node:fs/promises");
      const elapsedMs = Date.now() - started;
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      const ids = Array.isArray(body?.data)
        ? body.data.map((entry) => String(entry?.id || "").trim()).filter(Boolean)
        : [];
      const served = ids.includes(expectedModel);
      const result = {
        http_status: Number(response.statusCode || 0),
        elapsed_ms: elapsedMs,
        model_ids: ids,
        expected_model_served: served,
      };
      await fs.writeFile(resultFile, `${JSON.stringify(result)}\n`, "utf8");
      await fs.writeFile(statusFile, `${response.statusCode === 200 && served ? 0 : 5}\n`, "utf8");
      process.exit(response.statusCode === 200 && served ? 0 : 5);
    });
  },
);
request.on("error", async (error) => {
  const fs = await import("node:fs/promises");
  await fs.writeFile(resultFile, `${JSON.stringify({ error: String(error?.message || error), elapsed_ms: Date.now() - started })}\n`, "utf8");
  await fs.writeFile(statusFile, "6\n", "utf8");
  process.exit(6);
});
request.setTimeout(timeoutMs, () => {
  request.destroy(new Error(`MODEL_ROUTE_TOTAL_DEADLINE_${timeoutMs}MS`));
});
request.end();
NODE
MODEL_PID=$!
START_EPOCH="$(date +%s)"

while kill -0 "$MODEL_PID" 2>/dev/null; do
  sleep 10
  ELAPSED="$(( $(date +%s) - START_EPOCH ))"
  set +e
  PROGRESS="$(node --env-file=.env.local --input-type=module <<'NODE'
const managementKey = String(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY || "").trim();
const runtimeKey = String(process.env.RUNPOD_API_KEY || managementKey).trim();
const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
async function request(url, init = {}, timeoutMs = 15000) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body === null) throw new Error(`DEEP_PROGRESS_HTTP_${response.status}`);
  return body;
}
const headers = { Authorization: `Bearer ${managementKey}`, Accept: "application/json" };
const runtimeHeaders = { Authorization: `Bearer ${runtimeKey}`, Accept: "application/json" };
const endpointsRaw = await request("https://rest.runpod.io/v1/endpoints?includeTemplate=false&includeWorkers=true", { headers });
const endpoints = Array.isArray(endpointsRaw) ? endpointsRaw : list(endpointsRaw?.endpoints || endpointsRaw?.data || endpointsRaw?.items);
const matches = endpoints.filter((entry) => text(entry?.name) === "avantiqo-intelligence-v1");
if (matches.length !== 1) throw new Error(`DEEP_PROGRESS_ENDPOINT_MATCHES_${matches.length}`);
const endpoint = matches[0];
const endpointId = text(endpoint?.id);
const [health, control] = await Promise.all([
  request(`https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}/health`, { headers: runtimeHeaders }),
  request(`https://api.runpod.io/v2/serverless/${encodeURIComponent(endpointId)}/workers`, { headers }),
]);
const active = list(control?.workers).filter((worker) => {
  const status = text(worker?.status).toUpperCase();
  return !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(status);
});
const workerSummaries = active.map((worker) => ({
  status: text(worker?.status) || null,
  desired_status: text(worker?.desiredStatus ?? worker?.desired_status) || null,
  gpu_type_id: text(worker?.gpuTypeId ?? worker?.gpu_type_id ?? worker?.gpuType?.id ?? worker?.gpu?.id) || null,
  data_center_id: text(worker?.dataCenterId ?? worker?.data_center_id ?? worker?.dataCenter?.id) || null,
}));
const workers = health?.workers || {};
const jobs = health?.jobs || {};
const workerVisible =
  active.length > 0 ||
  Number(workers?.initializing || 0) > 0 ||
  Number(workers?.running || 0) > 0 ||
  Number(workers?.ready || 0) > 0 ||
  Number(workers?.idle || 0) > 0;
console.log(JSON.stringify({
  jobs,
  workers,
  active_control_workers: active.length,
  worker_visible: workerVisible,
  control_workers: workerSummaries,
}));
NODE
)"
  PROGRESS_STATUS=$?
  set -e
  if [ "$PROGRESS_STATUS" -ne 0 ]; then
    echo "AVANTIQO_DEEP_SCHEDULER_CONTROL_PROGRESS_READ=FAILED"
    continue
  fi
  echo "AVANTIQO_DEEP_SCHEDULER_CONTROL_PROGRESS={\"elapsed_seconds\":$ELAPSED,\"snapshot\":$PROGRESS}"
  if printf '%s' "$PROGRESS" | grep -q '"worker_visible":true'; then
    echo "AVANTIQO_DEEP_SCHEDULER_CONTROL_WORKER_VISIBLE=YES"
    if [ -z "$FIRST_WORKER_SECONDS" ]; then
      FIRST_WORKER_SECONDS="$ELAPSED"
      echo "AVANTIQO_DEEP_SCHEDULER_CONTROL_FIRST_WORKER_VISIBLE_SECONDS=$FIRST_WORKER_SECONDS"
    fi
  else
    echo "AVANTIQO_DEEP_SCHEDULER_CONTROL_WORKER_VISIBLE=NO"
    if [ "$ELAPSED" -ge "$UNSCHEDULED_TIMEOUT_SECONDS" ] && [ -z "$FIRST_WORKER_SECONDS" ]; then
      UNSCHEDULED=YES
      echo "AVANTIQO_DEEP_SCHEDULER_CONTROL_UNSCHEDULED_ABORT_SECONDS=$ELAPSED"
      stop_model_child
      break
    fi
  fi
done

if [ "$UNSCHEDULED" = "YES" ]; then
  set +e
  safe_cleanup_deep_probe_queue
  CLEANUP_STATUS=$?
  set -e
  if [ "$CLEANUP_STATUS" -ne 0 ]; then
    fail "RUNPOD_DEEP_WORKER_NOT_SCHEDULED_AND_QUEUE_CLEANUP_REFUSED"
  fi
  fail "RUNPOD_DEEP_WORKER_NOT_SCHEDULED_WITHIN_${UNSCHEDULED_TIMEOUT_SECONDS}_SECONDS"
fi

set +e
wait "$MODEL_PID"
MODEL_WAIT_STATUS=$?
set -e
MODEL_PID=""
if [ -f "$MODEL_STATUS_FILE" ]; then
  MODEL_CHILD_STATUS="$(tr -dc '0-9' < "$MODEL_STATUS_FILE")"
else
  MODEL_CHILD_STATUS="$MODEL_WAIT_STATUS"
fi
if [ -f "$MODEL_RESULT" ]; then
  echo "AVANTIQO_DEEP_SCHEDULER_CONTROL_MODEL_ROUTE_RESULT=$(cat "$MODEL_RESULT")"
fi
[ "$MODEL_CHILD_STATUS" = "0" ] || fail "DEEP_MODEL_ROUTE_FAILURE"

MODEL_LATENCY_MS="$(node --input-type=module - "$MODEL_RESULT" <<'NODE'
import fs from "node:fs";
const path = process.argv[2];
const body = JSON.parse(fs.readFileSync(path, "utf8"));
process.stdout.write(String(Number(body?.elapsed_ms || 0)));
NODE
)"
EXPECTED_SERVED="$(node --input-type=module - "$MODEL_RESULT" <<'NODE'
import fs from "node:fs";
const path = process.argv[2];
const body = JSON.parse(fs.readFileSync(path, "utf8"));
process.stdout.write(body?.expected_model_served === true ? "YES" : "NO");
NODE
)"
echo "AVANTIQO_DEEP_SCHEDULER_CONTROL_MODELS_LATENCY_MS=$MODEL_LATENCY_MS"
echo "AVANTIQO_DEEP_SCHEDULER_CONTROL_EXPECTED_MODEL_SERVED=$EXPECTED_SERVED"
[ "$EXPECTED_SERVED" = "YES" ] || fail "EXPECTED_DEEP_MODEL_NOT_SERVED"

sleep 5
set +e
safe_cleanup_deep_probe_queue
POST_CLEANUP_STATUS=$?
set -e
[ "$POST_CLEANUP_STATUS" -eq 0 ] || fail "POST_ROUTE_QUEUE_CLEANUP_FAILED"

echo ""
echo "$CONTRACT=PASS"
echo "${CONTRACT}_FIRST_WORKER_VISIBLE_SECONDS=${FIRST_WORKER_SECONDS:-UNKNOWN}"
echo "${CONTRACT}_MODELS_LATENCY_MS=$MODEL_LATENCY_MS"
echo "${CONTRACT}_EXPECTED_MODEL_SERVED=YES"
echo "${CONTRACT}_INTERPRETATION=DEEP_SCHEDULER_CONTROL_WORKER_ALLOCATED"
echo "GENERATION_SUBMITTED=NO"
echo "FAST_ENDPOINT_MUTATION=NO"
echo "TEMPLATE_MUTATION=NO"
echo "PRODUCTION_DEPLOY_PERFORMED=NO"
