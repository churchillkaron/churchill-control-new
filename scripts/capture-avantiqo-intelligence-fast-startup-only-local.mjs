import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_STARTUP_ONLY_CAPTURE_V1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const REPORT_DEFAULT = "/tmp/avantiqo-intelligence-fast-startup-only-capture.json";
const POLL_MS = 5_000;
const CAPTURE_WINDOW_MS = 2_500;
const STARTUP_TIMEOUT_MS = Math.max(
  60_000,
  Math.min(420_000, Number(process.env.AVANTIQO_INTELLIGENCE_FAST_STARTUP_ONLY_TIMEOUT_MS || 300_000)),
);

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env });
  if (result.status !== 0) throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 500)}`);
  return text(result.stdout);
}

function validateCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_FAST_STARTUP_CAPTURE_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_FAST_STARTUP_CAPTURE_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_FAST_STARTUP_CAPTURE_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_FAST_STARTUP_CAPTURE_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_FAST_STARTUP_CAPTURE_GIT_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_FAST_STARTUP_CAPTURE_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  return head;
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = redact(text(body?.message || body?.error || body?.detail || raw)).slice(0, 700);
    throw new Error(`RUNPOD_FAST_STARTUP_CAPTURE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function rest(path, key, options = {}) {
  return requestJson(`${REST_BASE}${path}`, key, options);
}

async function queueHealth(endpointId, key) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key);
}

function healthSummary(value) {
  const jobs = object(value?.jobs);
  const workers = object(value?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress),
    },
    workers: {
      idle: finite(workers.idle),
      initializing: finite(workers.initializing),
      ready: finite(workers.ready),
      running: finite(workers.running),
      throttled: finite(workers.throttled),
      unhealthy: finite(workers.unhealthy),
    },
  };
}

async function loadEndpoints(key) {
  const endpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", key);
  const resolveOne = (name) => {
    const matches = list(endpoints).filter((entry) => text(entry?.name) === name);
    if (matches.length !== 1) throw new Error(`AVANTIQO_FAST_STARTUP_CAPTURE_ENDPOINT_RESOLUTION_FAILED:name=${name}:matches=${matches.length}`);
    return matches[0];
  };
  return { deep: resolveOne(DEEP_NAME), fast: resolveOne(FAST_NAME) };
}

async function patchFastWarm(endpointId, workersMin, managementKey) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin, workersMax: 1 },
  });
  const verified = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
  if (finite(verified?.workersMin, -1) !== workersMin || finite(verified?.workersMax, -1) !== 1) {
    throw new Error(`AVANTIQO_FAST_STARTUP_CAPTURE_WARM_PATCH_VERIFY_FAILED:min=${finite(verified?.workersMin, -1)}:max=${finite(verified?.workersMax, -1)}:expected_min=${workersMin}`);
  }
  return verified;
}

function parseFrame(frame, workerId) {
  const data = frame.split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (!data.length) return null;
  const payload = data.join("\n");
  try {
    const parsed = JSON.parse(payload);
    return {
      worker_id: workerId,
      source: text(parsed?.source) || "unknown",
      ts: text(parsed?.ts) || null,
      line: redact(parsed?.line ?? parsed?.raw ?? payload).slice(0, 5000),
    };
  } catch {
    return { worker_id: workerId, source: "unknown", ts: null, line: redact(payload).slice(0, 5000) };
  }
}

async function captureTail(endpointId, workerId, managementKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CAPTURE_WINDOW_MS);
  const entries = [];
  let error = null;
  let status = null;
  let buffer = "";
  try {
    const response = await fetch(
      `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers/${encodeURIComponent(workerId)}/logs?tail=1000`,
      { headers: { Authorization: `Bearer ${managementKey}`, Accept: "text/event-stream" }, signal: controller.signal },
    );
    status = response.status;
    if (!response.ok) {
      error = `RUNPOD_FAST_STARTUP_LOG_HTTP_${response.status}:${redact(await response.text()).slice(0, 500)}`;
      return { worker_id: workerId, response_status: status, entries, error };
    }
    if (!response.body) return { worker_id: workerId, response_status: status, entries, error: "RUNPOD_FAST_STARTUP_LOG_BODY_REQUIRED" };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      let chunk;
      try { chunk = await reader.read(); }
      catch (readError) {
        if (readError?.name === "AbortError") break;
        throw readError;
      }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const entry = parseFrame(frame, workerId);
        if (entry) entries.push(entry);
      }
    }
  } catch (captureError) {
    if (captureError?.name !== "AbortError") error = redact(text(captureError?.message || captureError)).slice(0, 500);
  } finally {
    clearTimeout(timeout);
  }
  if (buffer.trim()) {
    const entry = parseFrame(buffer, workerId);
    if (entry) entries.push(entry);
  }
  return { worker_id: workerId, response_status: status, entries, error };
}

function safeWorker(worker) {
  return {
    id: text(worker?.id) || null,
    status: text(worker?.status).toUpperCase() || null,
    image: text(worker?.image) || null,
    version: Number.isFinite(Number(worker?.version)) ? Number(worker.version) : null,
    gpu_count: Number.isFinite(Number(worker?.gpuCount)) ? Number(worker.gpuCount) : null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    started_at: text(worker?.startedAt) || null,
    is_stale: worker?.isStale === true,
  };
}

function deriveSignals(entries) {
  const joined = entries.map((entry) => entry.line).join("\n");
  const has = (pattern) => pattern.test(joined);
  return {
    serverless_worker_started: has(/Starting Serverless Worker|serverless worker.*start/i),
    serverless_sdk_signal: has(/runpod.*serverless|serverless.*runpod/i),
    queue_poll_signal: has(/Jobs in queue|job.*queue|queue.*job/i),
    handler_signal: has(/handler/i),
    ping_or_refresh_signal: has(/ping|refresh worker|worker refresh/i),
    vllm_signal: has(/\bvllm\b|AsyncLLM|LLMEngine/i),
    api_server_started: has(/Application startup complete|Uvicorn running|Started server process/i),
    model_loaded_signal: has(/model.*loaded|loading model weights took|model weights|engine.*ready/i),
    serverless_environment_missing: has(/not deployed on RunPod serverless/i),
    auth_or_control_plane_failure: has(/unauthorized|forbidden|failed.*ping|ping.*failed|authentication.*failed/i),
    python_or_vllm_failure: has(/Traceback|ModuleNotFoundError|ImportError|RuntimeError|Exception:/i),
    cuda_or_nvidia_failure: has(/cuda.*(?:error|failed)|nvidia.*(?:error|failed)|libcuda|cudnn.*(?:error|failed)/i),
    memory_failure: has(/out of memory|\boom\b|exit code 137|sigkill|killed process/i),
  };
}

function classify({ reachedReady, unhealthyObserved, timedOut, signals }) {
  if (signals.serverless_environment_missing) return "SERVERLESS_ENVIRONMENT_NOT_DETECTED";
  if (signals.auth_or_control_plane_failure) return "SERVERLESS_CONTROL_PLANE_FAILURE";
  if (signals.cuda_or_nvidia_failure) return "CUDA_OR_NVIDIA_STARTUP_FAILURE";
  if (signals.memory_failure) return "MEMORY_OR_PROCESS_TERMINATION_FAILURE";
  if (signals.python_or_vllm_failure) return "PYTHON_OR_VLLM_STARTUP_FAILURE";
  if (unhealthyObserved) return "WORKER_BECAME_UNHEALTHY";
  if (reachedReady && signals.serverless_worker_started) return "FAST_WORKER_READY_SERVERLESS_HANDLER_STARTED";
  if (reachedReady && signals.api_server_started && !signals.serverless_worker_started) return "VLLM_READY_SERVERLESS_HANDLER_NOT_OBSERVED";
  if (reachedReady) return "FAST_WORKER_READY_LOG_SIGNATURE_INCONCLUSIVE";
  if (timedOut) return "FAST_WORKER_STARTUP_TIMEOUT";
  return "FAST_WORKER_STARTUP_INCONCLUSIVE";
}

const mainCommit = validateCurrentMain();
if (text(process.env.AVANTIQO_INTELLIGENCE_FAST_STARTUP_ONLY_CAPTURE_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_STARTUP_ONLY_CAPTURE_APPROVED=YES_REQUIRED");
}
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const runtimeKey = text(process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey || !runtimeKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");

const initial = await loadEndpoints(managementKey);
if (finite(initial.deep?.workersMin, -1) !== 0 || finite(initial.deep?.workersMax, -1) !== 0) {
  throw new Error(`AVANTIQO_FAST_STARTUP_CAPTURE_DEEP_DISABLED_SLOT_REQUIRED:min=${finite(initial.deep?.workersMin, -1)}:max=${finite(initial.deep?.workersMax, -1)}`);
}
if (finite(initial.fast?.workersMin, -1) !== 0 || finite(initial.fast?.workersMax, -1) !== 1) {
  throw new Error(`AVANTIQO_FAST_STARTUP_CAPTURE_FAST_ACTIVE_SLOT_REQUIRED:min=${finite(initial.fast?.workersMin, -1)}:max=${finite(initial.fast?.workersMax, -1)}`);
}
const fastId = text(initial.fast?.id);
if (!fastId) throw new Error("AVANTIQO_FAST_STARTUP_CAPTURE_FAST_ENDPOINT_ID_REQUIRED");
const initialHealth = healthSummary(await queueHealth(fastId, runtimeKey));
if (initialHealth.jobs.in_queue !== 0 || initialHealth.jobs.in_progress !== 0) {
  throw new Error(`AVANTIQO_FAST_STARTUP_CAPTURE_ZERO_JOBS_REQUIRED:in_queue=${initialHealth.jobs.in_queue}:in_progress=${initialHealth.jobs.in_progress}`);
}

const seen = new Set();
const logs = [];
const captureErrors = [];
let reachedReady = false;
let unhealthyObserved = false;
let externalJobObserved = false;
let timedOut = false;
let warmMinApplied = false;
let cleanupPassed = false;
let lastHealth = initialHealth;
let lastWorkers = [];
const startedAt = Date.now();

try {
  await patchFastWarm(fastId, 1, managementKey);
  warmMinApplied = true;
  while (Date.now() - startedAt <= STARTUP_TIMEOUT_MS) {
    const [workersBody, healthBody] = await Promise.all([
      requestJson(`${CONTROL_BASE}/serverless/${encodeURIComponent(fastId)}/workers`, managementKey),
      queueHealth(fastId, runtimeKey),
    ]);
    lastWorkers = list(workersBody?.workers).map(safeWorker);
    lastHealth = healthSummary(healthBody);

    if (lastHealth.jobs.in_queue > 0 || lastHealth.jobs.in_progress > 0) externalJobObserved = true;
    unhealthyObserved ||= lastHealth.workers.unhealthy > 0;

    for (const worker of lastWorkers) {
      if (!worker.id) continue;
      const capture = await captureTail(fastId, worker.id, managementKey);
      if (capture.error) captureErrors.push({ worker_id: worker.id, error: capture.error });
      for (const entry of capture.entries) {
        const key = `${entry.worker_id}|${entry.source}|${entry.ts}|${entry.line}`;
        if (seen.has(key)) continue;
        seen.add(key);
        logs.push(entry);
      }
    }

    console.log(JSON.stringify({
      event: "AVANTIQO_INTELLIGENCE_FAST_STARTUP_ONLY_PROGRESS",
      elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
      health: lastHealth,
      workers: lastWorkers,
      captured_log_entries: logs.length,
      generation_submitted: false,
      secrets_printed: false,
    }));

    reachedReady = lastHealth.workers.ready > 0 || lastHealth.workers.idle > 0 ||
      lastWorkers.some((worker) => ["READY", "IDLE"].includes(worker.status));
    if (reachedReady || unhealthyObserved) break;
    await sleep(POLL_MS);
  }
  timedOut = !reachedReady && !unhealthyObserved && Date.now() - startedAt > STARTUP_TIMEOUT_MS;
} finally {
  if (warmMinApplied) {
    try {
      await patchFastWarm(fastId, 0, managementKey);
      cleanupPassed = true;
    } catch (error) {
      cleanupPassed = false;
      captureErrors.push({ worker_id: null, error: `FAST_MIN_RESET_FAILED:${redact(text(error?.message || error)).slice(0, 500)}` });
    }
  }
}

const signals = deriveSignals(logs);
const diagnosis = classify({ reachedReady, unhealthyObserved, timedOut, signals });
const relevant = logs.filter((entry) => [
  /Starting Serverless Worker|serverless|handler|Jobs in queue|Jobs in progress|ping/i,
  /Application startup complete|Uvicorn|vllm|LLMEngine|model/i,
  /Traceback|Exception|RuntimeError|error|failed|cuda|nvidia|out of memory|killed/i,
].some((pattern) => pattern.test(entry.line))).slice(-160);

const report = {
  success: cleanupPassed,
  contract: CONTRACT,
  main_commit: mainCommit,
  mode: "STARTUP_ONLY_LOG_CAPTURE",
  startup_timeout_ms: STARTUP_TIMEOUT_MS,
  elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
  initial_state: {
    deep_workers_min: finite(initial.deep?.workersMin, -1),
    deep_workers_max: finite(initial.deep?.workersMax, -1),
    fast_workers_min: finite(initial.fast?.workersMin, -1),
    fast_workers_max: finite(initial.fast?.workersMax, -1),
    fast_health: initialHealth,
  },
  reached_ready: reachedReady,
  unhealthy_observed: unhealthyObserved,
  timed_out: timedOut,
  external_job_observed: externalJobObserved,
  last_health: lastHealth,
  last_workers: lastWorkers,
  signals,
  diagnosis,
  captured_log_entry_count: logs.length,
  log_capture_errors: captureErrors.slice(-20),
  relevant_logs: relevant,
  fast_min_reset_to_zero: cleanupPassed,
  next_action: diagnosis === "FAST_WORKER_READY_SERVERLESS_HANDLER_STARTED"
    ? "COMPARE_HANDLER_CLAIM_PATH_OR_RUN_ONE_BOUNDED_FAST_PROBE"
    : diagnosis === "VLLM_READY_SERVERLESS_HANDLER_NOT_OBSERVED"
      ? "REPAIR_FAST_SERVERLESS_HANDLER_STARTUP"
      : "REPAIR_FROM_STARTUP_DIAGNOSIS",
  generation_submitted: false,
  inference_performed: false,
  endpoint_generation_job_submitted: false,
  production_deploy_performed: false,
  secrets_in_output: false,
};

const reportPath = resolve(process.env.AVANTIQO_INTELLIGENCE_FAST_STARTUP_ONLY_OUTPUT || REPORT_DEFAULT);
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
console.log(`AVANTIQO_INTELLIGENCE_FAST_STARTUP_ONLY_REPORT=${reportPath}`);

if (!cleanupPassed) process.exitCode = 1;
