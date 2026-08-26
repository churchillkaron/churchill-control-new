import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_LIVE_REQUEST_DIAGNOSTIC_V2";
const DEFAULT_REPORT = "/tmp/avantiqo-intelligence-fast-live-request-diagnostic.json";
const LOG_CAPTURE_MS = 8000;
const READ_SLICE_MS = 1000;
const LOG_TAIL = 2500;

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env });
  if (result.status !== 0) {
    throw new Error(`${code}:${redact(text(result.stderr || result.stdout)).slice(0, 700)}`);
  }
  return text(result.stdout);
}

function validateCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_FAST_LIVE_REQUEST_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_FAST_LIVE_REQUEST_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_FAST_LIVE_REQUEST_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_FAST_LIVE_REQUEST_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_FAST_LIVE_REQUEST_GIT_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_FAST_LIVE_REQUEST_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  return head;
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: options.accept || "application/json",
    },
    signal: AbortSignal.timeout(options.timeoutMs || 20_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = redact(text(body?.message || body?.error || body?.detail || raw)).slice(0, 700);
    throw new Error(`AVANTIQO_FAST_LIVE_REQUEST_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

function parseSseFrame(frame, workerId) {
  const data = frame
    .split(/\r?\n/)
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

async function captureWorkerLogs(endpointId, workerId, key) {
  const controller = new AbortController();
  const deadline = Date.now() + LOG_CAPTURE_MS;
  const entries = [];
  let responseStatus = null;
  let contentType = null;
  let error = null;
  let buffer = "";
  let reader = null;

  try {
    const response = await fetch(
      `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers/${encodeURIComponent(workerId)}/logs?tail=${LOG_TAIL}`,
      {
        headers: { Authorization: `Bearer ${key}`, Accept: "text/event-stream" },
        signal: controller.signal,
      },
    );
    responseStatus = response.status;
    contentType = text(response.headers.get("content-type")) || null;
    if (!response.ok) {
      error = `AVANTIQO_FAST_LIVE_REQUEST_LOG_HTTP_${response.status}:${redact(await response.text()).slice(0, 600)}`;
      return { worker_id: workerId, response_status: responseStatus, content_type: contentType, entries, error };
    }
    if (!response.body) {
      return { worker_id: workerId, response_status: responseStatus, content_type: contentType, entries, error: "AVANTIQO_FAST_LIVE_REQUEST_LOG_BODY_REQUIRED" };
    }

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (Date.now() < deadline) {
      const remaining = Math.max(1, Math.min(READ_SLICE_MS, deadline - Date.now()));
      const outcome = await Promise.race([
        reader.read().then((chunk) => ({ kind: "chunk", chunk }), (readError) => ({ kind: "error", readError })),
        new Promise((resolve) => setTimeout(() => resolve({ kind: "slice_timeout" }), remaining)),
      ]);
      if (outcome.kind === "slice_timeout") continue;
      if (outcome.kind === "error") {
        if (outcome.readError?.name === "AbortError") break;
        throw outcome.readError;
      }
      const chunk = outcome.chunk;
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const entry = parseSseFrame(frame, workerId);
        if (entry) entries.push(entry);
      }
    }
  } catch (captureError) {
    if (captureError?.name !== "AbortError") error = redact(text(captureError?.message || captureError)).slice(0, 700);
  } finally {
    controller.abort();
    if (reader) void reader.cancel().catch(() => {});
  }

  if (buffer.trim()) {
    const entry = parseSseFrame(buffer, workerId);
    if (entry) entries.push(entry);
  }
  return { worker_id: workerId, response_status: responseStatus, content_type: contentType, entries, error };
}

function healthSummary(value = {}) {
  const jobs = object(value?.jobs);
  const workers = object(value?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      idle: finite(workers.idle, 0),
      ready: finite(workers.ready, 0),
      initializing: finite(workers.initializing, 0),
      running: finite(workers.running, 0),
      throttled: finite(workers.throttled, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

function safeWorker(worker = {}) {
  return {
    id_present: Boolean(text(worker?.id)),
    status: text(worker?.status).toUpperCase() || null,
    image: text(worker?.image) || null,
    version: finite(worker?.version),
    gpu_count: finite(worker?.gpuCount),
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
    application_startup_complete: has(/Application startup complete|Uvicorn running|Started server process/i),
    vllm_signal: has(/\bvllm\b|AsyncLLM|LLMEngine/i),
    model_loaded_signal: has(/model.*loaded|loading model weights took|model weights|engine.*ready/i),
    chat_completion_route_seen: has(/\/v1\/chat\/completions|chat completions?/i),
    http_post_seen: has(/POST\s+.*chat\/completions/i),
    request_received_signal: has(/request received|received request|processing request|added request|request id/i),
    generation_signal: has(/prefill|decode|generation|tokens\/s|prompt throughput|generation throughput/i),
    queue_signal: has(/Jobs in queue|job.*queue|queue.*job/i),
    handler_signal: has(/handler/i),
    model_not_found: has(/model .* does not exist|NotFoundError.*model|unknown model/i),
    bad_request: has(/400 Bad Request|422 Unprocessable|validation error/i),
    auth_failure: has(/401 Unauthorized|403 Forbidden|authentication.*failed|unauthorized|forbidden/i),
    control_plane_failure: has(/failed.*ping|ping.*failed|control plane.*failed/i),
    python_or_vllm_failure: has(/Traceback|ModuleNotFoundError|ImportError|RuntimeError|Exception:/i),
    cuda_or_nvidia_failure: has(/cuda.*(?:error|failed)|nvidia.*(?:error|failed)|libcuda|cudnn.*(?:error|failed)/i),
    memory_failure: has(/out of memory|\boom\b|exit code 137|sigkill|killed process/i),
  };
}

function classify(health, workers, signals, captureErrors) {
  if (!workers.length) return "FAST_LIVE_REQUEST_NO_CONTROL_WORKER_VISIBLE";
  if (captureErrors.length === workers.length) return "FAST_LIVE_REQUEST_LOG_CAPTURE_UNAVAILABLE";
  if (signals.model_not_found) return "FAST_SELF_HOSTED_MODEL_NAME_REJECTED_BY_VLLM";
  if (signals.auth_failure) return "FAST_SELF_HOSTED_AUTH_OR_GATEWAY_FAILURE";
  if (signals.control_plane_failure) return "FAST_SERVERLESS_CONTROL_PLANE_FAILURE";
  if (signals.cuda_or_nvidia_failure) return "FAST_CUDA_OR_NVIDIA_RUNTIME_FAILURE";
  if (signals.memory_failure) return "FAST_MEMORY_OR_PROCESS_TERMINATION_FAILURE";
  if (signals.python_or_vllm_failure) return "FAST_PYTHON_OR_VLLM_RUNTIME_FAILURE";
  if (signals.chat_completion_route_seen && signals.generation_signal) return "FAST_SELF_HOSTED_REQUEST_REACHED_VLLM_GENERATION_ACTIVE";
  if (signals.chat_completion_route_seen || signals.http_post_seen || signals.request_received_signal) {
    return "FAST_SELF_HOSTED_REQUEST_REACHED_WORKER_INSPECT_RUNTIME_LOGS";
  }
  if (health.jobs.in_queue > 0 && health.workers.running > 0) {
    return "FAST_GATEWAY_REQUEST_WAITING_WHILE_WORKER_RUNNING_NO_REQUEST_LOG_SIGNATURE";
  }
  if (health.jobs.in_queue > 0 && (health.workers.idle > 0 || health.workers.ready > 0)) {
    return "FAST_GATEWAY_REQUEST_NOT_DISPATCHED_TO_READY_WORKER";
  }
  return "FAST_LIVE_REQUEST_STATE_INCONCLUSIVE";
}

const mainCommit = validateCurrentMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const runtimeKey = text(process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey || !runtimeKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");

const endpoints = await requestJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey);
const matches = list(endpoints).filter((endpoint) => text(endpoint?.name) === FAST_NAME);
if (matches.length !== 1) throw new Error(`AVANTIQO_FAST_LIVE_REQUEST_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
const fast = matches[0];
const fastId = text(fast?.id);
if (!fastId) throw new Error("AVANTIQO_FAST_LIVE_REQUEST_ENDPOINT_ID_REQUIRED");

const [healthRaw, workersRaw] = await Promise.all([
  requestJson(`${QUEUE_BASE}/${encodeURIComponent(fastId)}/health`, runtimeKey),
  requestJson(`${CONTROL_BASE}/serverless/${encodeURIComponent(fastId)}/workers`, managementKey),
]);
const health = healthSummary(healthRaw);
const rawWorkers = list(Array.isArray(workersRaw) ? workersRaw : workersRaw?.workers)
  .filter((worker) => text(worker?.id));
const workers = rawWorkers.map(safeWorker);

const captures = [];
for (const worker of rawWorkers) {
  captures.push(await captureWorkerLogs(fastId, text(worker.id), managementKey));
}
const entries = captures.flatMap((capture) => capture.entries);
const signals = deriveSignals(entries);
const captureErrors = captures.filter((capture) => capture.error).map((capture) => ({ worker_id: capture.worker_id, error: capture.error }));
const diagnosis = classify(health, workers, signals, captureErrors);
const relevantLogs = entries.filter((entry) =>
  /serverless|handler|queue|request|chat\/completions|application startup|uvicorn|vllm|engine|model|prefill|decode|generation|throughput|cuda|nvidia|traceback|exception|runtimeerror|error|failed|fatal|out of memory|oom|killed|unauthorized|forbidden|400|401|403|404|422|500/i.test(entry.line),
).slice(-220);

const report = {
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY_SELF_HOSTED_LIVE_REQUEST_INSPECTION",
  main_commit: mainCommit,
  endpoint: {
    name: text(fast?.name),
    workers_min: finite(fast?.workersMin),
    workers_max: finite(fast?.workersMax),
    template_id_present: Boolean(text(fast?.templateId || fast?.template?.id)),
  },
  health,
  workers,
  captured_log_entry_count: entries.length,
  log_capture_errors: captureErrors,
  signals,
  diagnosis,
  relevant_logs: relevantLogs,
  generation_submitted: false,
  request_cancelled: false,
  queue_mutation_performed: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  secrets_in_output: false,
};

const reportPath = resolve(process.env.AVANTIQO_INTELLIGENCE_FAST_LIVE_REQUEST_DIAGNOSTIC_OUTPUT || DEFAULT_REPORT);
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
console.log(`AVANTIQO_INTELLIGENCE_FAST_SELF_HOSTED_DIAGNOSIS=${diagnosis}`);
console.log(`AVANTIQO_INTELLIGENCE_FAST_LIVE_REQUEST_DIAGNOSTIC_REPORT=${reportPath}`);
console.log("AVANTIQO_INTELLIGENCE_FAST_LIVE_REQUEST_DIAGNOSTIC=PASS");
