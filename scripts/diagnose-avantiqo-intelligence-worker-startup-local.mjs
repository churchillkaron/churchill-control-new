import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const CONTROL_BASE = "https://api.runpod.io/v2";
const INVOKE_BASE = "https://api.runpod.ai/v2";
const REST_BASE = "https://rest.runpod.io/v1";
const CONTRACT = "AVANTIQO_INTELLIGENCE_WORKER_STARTUP_DIAGNOSTIC_V1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const DEFAULT_REPORT = "/tmp/avantiqo-intelligence-worker-startup-diagnostic.json";
const LOG_TAIL = 800;
const LOG_CAPTURE_MS = 7000;

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 500)}`);
  }
  return text(result.stdout);
}

function validateCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_INTELLIGENCE_WORKER_LOG_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_INTELLIGENCE_WORKER_LOG_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_INTELLIGENCE_WORKER_LOG_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_INTELLIGENCE_WORKER_LOG_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_INTELLIGENCE_WORKER_LOG_GIT_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_INTELLIGENCE_WORKER_LOG_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  return head;
}

async function requestJson(url, credential, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = redact(text(body?.message || body?.error || body?.detail || raw)).slice(0, 700);
    throw new Error(`RUNPOD_INTELLIGENCE_WORKER_LOG_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function optionalJson(url, credential) {
  try {
    return { ok: true, body: await requestJson(url, credential), error: null };
  } catch (error) {
    return { ok: false, body: null, error: redact(text(error?.message || error)).slice(0, 700) };
  }
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
      line: redact(parsed?.line ?? parsed?.raw ?? payload).slice(0, 4000),
    };
  } catch {
    return {
      worker_id: workerId,
      source: "unknown",
      ts: null,
      line: redact(payload).slice(0, 4000),
    };
  }
}

async function captureWorkerLogs(endpointId, workerId, credential) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOG_CAPTURE_MS);
  const url = `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers/${encodeURIComponent(workerId)}/logs?tail=${LOG_TAIL}`;
  const entries = [];
  let responseStatus = null;
  let contentType = null;
  let buffer = "";
  let error = null;

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${credential}`, Accept: "text/event-stream" },
      signal: controller.signal,
    });
    responseStatus = response.status;
    contentType = text(response.headers.get("content-type")) || null;
    if (!response.ok) {
      const raw = await response.text();
      error = `RUNPOD_LOG_HTTP_${response.status}:${redact(raw).slice(0, 700)}`;
      return { worker_id: workerId, response_status: responseStatus, content_type: contentType, entries, error };
    }
    if (!response.body) {
      error = "RUNPOD_LOG_STREAM_BODY_REQUIRED";
      return { worker_id: workerId, response_status: responseStatus, content_type: contentType, entries, error };
    }

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
        const entry = parseSseFrame(frame, workerId);
        if (entry) entries.push(entry);
      }
    }
  } catch (captureError) {
    if (captureError?.name !== "AbortError") error = redact(text(captureError?.message || captureError)).slice(0, 700);
  } finally {
    clearTimeout(timeout);
  }

  if (buffer.trim()) {
    const entry = parseSseFrame(buffer, workerId);
    if (entry) entries.push(entry);
  }
  return { worker_id: workerId, response_status: responseStatus, content_type: contentType, entries, error };
}

const importantPatterns = [
  /Starting Serverless Worker/i,
  /Jobs in queue/i,
  /Jobs in progress/i,
  /handler/i,
  /ping/i,
  /not deployed on RunPod serverless/i,
  /Application startup complete/i,
  /vllm/i,
  /engine/i,
  /model/i,
  /cuda/i,
  /nvidia/i,
  /traceback/i,
  /exception/i,
  /runtimeerror/i,
  /error[: ]/i,
  /failed/i,
  /fatal/i,
  /out of memory/i,
  /oom/i,
  /killed/i,
  /exit code/i,
  /unauthorized/i,
  /forbidden/i,
  /connection/i,
  /timeout/i,
];

function relevantEntries(entries) {
  const matched = entries.filter((entry) => importantPatterns.some((pattern) => pattern.test(entry.line)));
  return (matched.length ? matched : entries).slice(-120);
}

function signals(entries) {
  const joined = entries.map((entry) => entry.line).join("\n");
  const has = (pattern) => pattern.test(joined);
  return {
    serverless_worker_started: has(/Starting Serverless Worker/i),
    queue_counter_logged: has(/Jobs in queue/i),
    progress_counter_logged: has(/Jobs in progress/i),
    runpod_serverless_environment_missing: has(/not deployed on RunPod serverless/i),
    handler_signal_present: has(/handler/i),
    application_startup_complete: has(/Application startup complete/i),
    vllm_signal_present: has(/\bvllm\b/i),
    model_signal_present: has(/model/i),
    cuda_or_nvidia_failure: has(/cuda.*(?:error|failed)|nvidia.*(?:error|failed)|libcuda|cudnn.*(?:error|failed)/i),
    python_startup_failure: has(/Traceback|ModuleNotFoundError|ImportError|RuntimeError|Exception:/i),
    memory_failure: has(/out of memory|\boom\b|exit code 137|sigkill|killed process/i),
    auth_or_control_plane_failure: has(/unauthorized|forbidden|authentication.*failed|failed.*ping|ping.*failed/i),
  };
}

function classify(workerCount, laneSignals, captureErrors) {
  if (workerCount === 0) return "NO_RETAINED_WORKERS_FOR_LOG_CAPTURE";
  if (captureErrors.length === workerCount) return "WORKER_LOG_CAPTURE_UNAVAILABLE";
  if (laneSignals.runpod_serverless_environment_missing) return "SERVERLESS_ENVIRONMENT_NOT_DETECTED_BY_CONTAINER";
  if (laneSignals.cuda_or_nvidia_failure) return "CUDA_OR_NVIDIA_STARTUP_FAILURE";
  if (laneSignals.memory_failure) return "MEMORY_OR_PROCESS_TERMINATION_FAILURE";
  if (laneSignals.python_startup_failure) return "PYTHON_OR_VLLM_STARTUP_FAILURE";
  if (laneSignals.auth_or_control_plane_failure) return "RUNPOD_HANDLER_CONTROL_PLANE_FAILURE";
  if (!laneSignals.serverless_worker_started && laneSignals.application_startup_complete) return "VLLM_STARTED_BUT_SERVERLESS_HANDLER_NOT_STARTED";
  if (laneSignals.serverless_worker_started) return "SERVERLESS_HANDLER_STARTED_INSPECT_JOB_CLAIM_LOGS";
  return "STARTUP_LOGS_INCONCLUSIVE";
}

async function laneDiagnostic(endpoint, managementKey, runtimeKey) {
  const endpointId = text(endpoint?.id);
  const workersResult = await optionalJson(`${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`, managementKey);
  const queueResult = await optionalJson(`${INVOKE_BASE}/${encodeURIComponent(endpointId)}/health`, runtimeKey);
  const workers = list(workersResult.body?.workers);
  const safeWorkers = workers.map((worker) => ({
    id: text(worker?.id) || null,
    status: text(worker?.status).toUpperCase() || null,
    image: text(worker?.image) || null,
    version: finite(worker?.version),
    gpu_count: finite(worker?.gpuCount),
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    started_at: text(worker?.startedAt) || null,
    is_stale: worker?.isStale === true,
  }));

  const captures = [];
  for (const worker of safeWorkers) {
    if (!worker.id) continue;
    captures.push(await captureWorkerLogs(endpointId, worker.id, managementKey));
  }

  const allEntries = captures.flatMap((capture) => capture.entries);
  const laneSignals = signals(allEntries);
  const captureErrors = captures.filter((capture) => capture.error).map((capture) => ({ worker_id: capture.worker_id, error: capture.error }));
  const diagnosis = classify(safeWorkers.length, laneSignals, captureErrors);

  return {
    endpoint: {
      name: text(endpoint?.name),
      workers_min: finite(endpoint?.workersMin),
      workers_max: finite(endpoint?.workersMax),
      template_id_present: Boolean(text(endpoint?.templateId || endpoint?.template?.id)),
    },
    queue_health: queueResult.ok ? object(queueResult.body) : null,
    queue_health_error: queueResult.error,
    workers_request_error: workersResult.error,
    workers: safeWorkers,
    worker_versions: [...new Set(safeWorkers.map((worker) => worker.version).filter((value) => value !== null))],
    stale_worker_present: safeWorkers.some((worker) => worker.is_stale),
    signals: laneSignals,
    diagnosis,
    log_capture_errors: captureErrors,
    relevant_logs: relevantEntries(allEntries),
  };
}

const mainCommit = validateCurrentMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const runtimeKey = text(process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey || !runtimeKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");

const endpoints = await requestJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey);
const resolveOne = (name) => {
  const matches = list(endpoints).filter((endpoint) => text(endpoint?.name) === name);
  if (matches.length !== 1) throw new Error(`AVANTIQO_INTELLIGENCE_WORKER_LOG_ENDPOINT_RESOLUTION_FAILED:name=${name}:matches=${matches.length}`);
  return matches[0];
};

const deep = await laneDiagnostic(resolveOne(DEEP_NAME), managementKey, runtimeKey);
const fast = await laneDiagnostic(resolveOne(FAST_NAME), managementKey, runtimeKey);

let nextAction = "REVIEW_CAPTURED_WORKER_LOGS";
if (fast.diagnosis === "NO_RETAINED_WORKERS_FOR_LOG_CAPTURE") {
  nextAction = "RUN_CONTROLLED_FAST_STARTUP_ONLY_LOG_CAPTURE_NO_JOB";
} else if (fast.diagnosis === "SERVERLESS_ENVIRONMENT_NOT_DETECTED_BY_CONTAINER") {
  nextAction = "REPAIR_FAST_SERVERLESS_RUNTIME_ENVIRONMENT";
} else if (fast.diagnosis === "VLLM_STARTED_BUT_SERVERLESS_HANDLER_NOT_STARTED") {
  nextAction = "REPAIR_FAST_CONTAINER_HANDLER_STARTUP";
} else if (["CUDA_OR_NVIDIA_STARTUP_FAILURE", "MEMORY_OR_PROCESS_TERMINATION_FAILURE", "PYTHON_OR_VLLM_STARTUP_FAILURE"].includes(fast.diagnosis)) {
  nextAction = "REPAIR_FAST_WORKER_STARTUP_FAILURE_FROM_LOGS";
} else if (fast.diagnosis === "RUNPOD_HANDLER_CONTROL_PLANE_FAILURE") {
  nextAction = "REPAIR_FAST_HANDLER_CONTROL_PLANE_CONNECTIVITY";
}

const report = {
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  main_commit: mainCommit,
  deep,
  fast,
  next_action: nextAction,
  generation_submitted: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  secrets_in_output: false,
};

const reportPath = resolve(process.env.AVANTIQO_INTELLIGENCE_WORKER_STARTUP_DIAGNOSTIC_OUTPUT || DEFAULT_REPORT);
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });

console.log(JSON.stringify(report, null, 2));
console.log(`AVANTIQO_INTELLIGENCE_WORKER_STARTUP_DIAGNOSTIC_REPORT=${reportPath}`);
