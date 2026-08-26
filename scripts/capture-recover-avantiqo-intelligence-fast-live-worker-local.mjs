import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_LIVE_WORKER_CAPTURE_RECOVERY_V2";
const APPROVAL = "AVANTIQO_INTELLIGENCE_FAST_LIVE_WORKER_CAPTURE_RECOVERY_APPROVED";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const REPORT_DEFAULT = "/tmp/avantiqo-intelligence-fast-live-worker-capture-recovery.json";
const LOG_CAPTURE_MS = 10_000;

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
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_FAST_LIVE_CAPTURE_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_FAST_LIVE_CAPTURE_GIT_BRANCH_FAILED");
  if (branch !== "main") {
    throw new Error(`AVANTIQO_FAST_LIVE_CAPTURE_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }

  let head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_FAST_LIVE_CAPTURE_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_FAST_LIVE_CAPTURE_GIT_REMOTE_FAILED");
  if (head !== remote) {
    const dirty = shell(
      "git",
      ["status", "--porcelain", "--untracked-files=no"],
      "AVANTIQO_FAST_LIVE_CAPTURE_GIT_STATUS_FAILED",
    );
    if (dirty) {
      throw new Error("AVANTIQO_FAST_LIVE_CAPTURE_CURRENT_MAIN_DIRTY_CHECKOUT");
    }
    shell(
      "git",
      ["merge", "--ff-only", "origin/main"],
      "AVANTIQO_FAST_LIVE_CAPTURE_GIT_FAST_FORWARD_FAILED",
    );
    head = shell(
      "git",
      ["rev-parse", "HEAD"],
      "AVANTIQO_FAST_LIVE_CAPTURE_GIT_CONVERGED_HEAD_FAILED",
    );
    if (head !== remote) {
      throw new Error(`AVANTIQO_FAST_LIVE_CAPTURE_MAIN_CONVERGENCE_FAILED:head=${head}:origin_main=${remote}`);
    }
    console.log(`AVANTIQO_INTELLIGENCE_FAST_LIVE_CAPTURE_MAIN_CONVERGED=${head}`);
  }
  return head;
}

async function request(url, key, options = {}) {
  return fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: options.accept || "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: options.signal || AbortSignal.timeout(options.timeoutMs || 30_000),
  });
}

async function requestJson(url, key, options = {}) {
  const response = await request(url, key, options);
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = redact(text(body?.message || body?.error || body?.detail || raw)).slice(0, 800);
    throw new Error(`AVANTIQO_FAST_LIVE_CAPTURE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

function resolveOne(rows, name) {
  const matches = list(rows).filter((row) => text(row?.name) === name);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_FAST_LIVE_CAPTURE_ENDPOINT_RESOLUTION_FAILED:name=${name}:matches=${matches.length}`);
  }
  return matches[0];
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
      initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0),
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
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    started_at: text(worker?.startedAt) || null,
    is_stale: worker?.isStale === true,
  };
}

function parseSseFrame(frame) {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart());
  if (!data.length) return null;
  const payload = data.join("\n");
  try {
    const parsed = JSON.parse(payload);
    return {
      source: text(parsed?.source) || "unknown",
      ts: text(parsed?.ts) || null,
      line: redact(parsed?.line ?? parsed?.raw ?? payload).slice(0, 5000),
    };
  } catch {
    return { source: "unknown", ts: null, line: redact(payload).slice(0, 5000) };
  }
}

async function captureWorkerLogs(endpointId, workerId, managementKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOG_CAPTURE_MS);
  const entries = [];
  let buffer = "";
  let responseStatus = null;
  let error = null;

  try {
    const response = await request(
      `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers/${encodeURIComponent(workerId)}/logs?tail=2000`,
      managementKey,
      { accept: "text/event-stream", signal: controller.signal },
    );
    responseStatus = response.status;
    if (!response.ok) {
      error = `AVANTIQO_FAST_LIVE_CAPTURE_LOG_HTTP_${response.status}:${redact(await response.text()).slice(0, 600)}`;
      return { response_status: responseStatus, entries, error };
    }
    if (!response.body) {
      return { response_status: responseStatus, entries, error: "AVANTIQO_FAST_LIVE_CAPTURE_LOG_BODY_REQUIRED" };
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
        const entry = parseSseFrame(frame);
        if (entry) entries.push(entry);
      }
    }
  } catch (captureError) {
    if (captureError?.name !== "AbortError") {
      error = redact(text(captureError?.message || captureError)).slice(0, 700);
    }
  } finally {
    clearTimeout(timeout);
  }

  if (buffer.trim()) {
    const entry = parseSseFrame(buffer);
    if (entry) entries.push(entry);
  }
  return { response_status: responseStatus, entries, error };
}

function deriveSignals(entries) {
  const joined = entries.map((entry) => entry.line).join("\n");
  const has = (pattern) => pattern.test(joined);
  return {
    serverless_worker_started: has(/Starting Serverless Worker|serverless worker.*start/i),
    serverless_sdk_signal: has(/runpod.*serverless|serverless.*runpod/i),
    queue_poll_signal: has(/Jobs in queue|job.*queue|queue.*job/i),
    handler_signal: has(/handler/i),
    application_startup_complete: has(/Application startup complete|Uvicorn running|Started server process/i),
    vllm_signal: has(/\bvllm\b|AsyncLLM|LLMEngine/i),
    model_loaded_signal: has(/model.*loaded|loading model weights took|model weights|engine.*ready/i),
    auth_or_control_plane_failure: has(/unauthorized|forbidden|failed.*ping|ping.*failed|authentication.*failed/i),
    python_or_vllm_failure: has(/Traceback|ModuleNotFoundError|ImportError|RuntimeError|Exception:/i),
    cuda_or_nvidia_failure: has(/cuda.*(?:error|failed)|nvidia.*(?:error|failed)|libcuda|cudnn.*(?:error|failed)/i),
    memory_failure: has(/out of memory|\boom\b|exit code 137|sigkill|killed process/i),
  };
}

function classify(workerCount, signals) {
  if (!workerCount) return "FAST_WORKER_DISAPPEARED_BEFORE_LOG_CAPTURE";
  if (signals.auth_or_control_plane_failure) return "FAST_SERVERLESS_CONTROL_PLANE_FAILURE";
  if (signals.cuda_or_nvidia_failure) return "FAST_CUDA_OR_NVIDIA_STARTUP_FAILURE";
  if (signals.memory_failure) return "FAST_MEMORY_OR_PROCESS_TERMINATION_FAILURE";
  if (signals.python_or_vllm_failure) return "FAST_PYTHON_OR_VLLM_STARTUP_FAILURE";
  if (signals.serverless_worker_started) return "FAST_SERVERLESS_WORKER_STARTED_NO_INFERENCE";
  if (signals.application_startup_complete) return "FAST_RUNTIME_STARTED_SERVERLESS_SIGNATURE_NOT_CAPTURED";
  return "FAST_WORKER_RUNNING_STARTUP_LOG_SIGNATURE_INCONCLUSIVE";
}

async function patchWorkers(endpointId, managementKey, workersMin, workersMax) {
  await requestJson(`${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin, workersMax },
  });
  const verified = await requestJson(
    `${REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeWorkers=true`,
    managementKey,
  );
  if (finite(verified?.workersMin, -1) !== workersMin || finite(verified?.workersMax, -1) !== workersMax) {
    throw new Error(
      `AVANTIQO_FAST_LIVE_CAPTURE_PATCH_VERIFY_FAILED:name=${text(verified?.name)}:min=${finite(verified?.workersMin, -1)}:max=${finite(verified?.workersMax, -1)}:expected_min=${workersMin}:expected_max=${workersMax}`,
    );
  }
  return verified;
}

const mainCommit = validateCurrentMain();
if (text(process.env[APPROVAL]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL}=YES_REQUIRED`);
}
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const runtimeKey = text(process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey || !runtimeKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");

let report = null;
let cleanup = { fast_parked: false, deep_restored: false, error: null };
let deepId = null;
let fastId = null;

try {
  const endpoints = await requestJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey);
  const deep = resolveOne(endpoints, DEEP_NAME);
  const fast = resolveOne(endpoints, FAST_NAME);
  deepId = text(deep?.id);
  fastId = text(fast?.id);
  if (!deepId || !fastId) throw new Error("AVANTIQO_FAST_LIVE_CAPTURE_ENDPOINT_IDS_REQUIRED");

  const [deepHealthRaw, fastHealthRaw, controlRaw] = await Promise.all([
    requestJson(`${QUEUE_BASE}/${encodeURIComponent(deepId)}/health`, runtimeKey),
    requestJson(`${QUEUE_BASE}/${encodeURIComponent(fastId)}/health`, runtimeKey),
    requestJson(`${CONTROL_BASE}/serverless/${encodeURIComponent(fastId)}/workers`, managementKey),
  ]);
  const beforeHealth = { deep: healthSummary(deepHealthRaw), fast: healthSummary(fastHealthRaw) };
  if (
    beforeHealth.deep.jobs.in_queue !== 0 ||
    beforeHealth.deep.jobs.in_progress !== 0 ||
    beforeHealth.fast.jobs.in_queue !== 0 ||
    beforeHealth.fast.jobs.in_progress !== 0
  ) {
    throw new Error(
      `AVANTIQO_FAST_LIVE_CAPTURE_ZERO_JOBS_REQUIRED:deep=${JSON.stringify(beforeHealth.deep.jobs)}:fast=${JSON.stringify(beforeHealth.fast.jobs)}`,
    );
  }

  const rawWorkers = list(controlRaw?.workers).filter((worker) => text(worker?.id));
  const workers = rawWorkers.map(safeWorker);
  if (!rawWorkers.length) throw new Error("AVANTIQO_FAST_LIVE_CAPTURE_ACTIVE_FAST_WORKER_REQUIRED");

  const deepMax = finite(deep?.workersMax, -1);
  const fastMax = finite(fast?.workersMax, -1);
  if (![0, 1].includes(deepMax) || fastMax !== 1) {
    throw new Error(`AVANTIQO_FAST_LIVE_CAPTURE_SLOT_STATE_INVALID:deep_max=${deepMax}:fast_max=${fastMax}`);
  }

  const captures = [];
  for (const worker of rawWorkers) {
    captures.push(await captureWorkerLogs(fastId, text(worker.id), managementKey));
  }
  const entries = captures.flatMap((capture) => capture.entries);
  const signals = deriveSignals(entries);
  const diagnosis = classify(rawWorkers.length, signals);
  const relevantLogs = entries.filter((entry) =>
    /serverless|handler|queue|application startup|uvicorn|vllm|engine|model|cuda|nvidia|traceback|exception|runtimeerror|error|failed|fatal|out of memory|oom|killed|unauthorized|forbidden/i.test(entry.line),
  ).slice(-180);

  report = {
    success: true,
    contract: CONTRACT,
    mode: "CAPTURE_EXISTING_FAST_WORKER_THEN_RESTORE_DEEP",
    main_commit: mainCommit,
    before_health: beforeHealth,
    slot_state_before: {
      deep_workers_min: finite(deep?.workersMin, -1),
      deep_workers_max: deepMax,
      fast_workers_min: finite(fast?.workersMin, -1),
      fast_workers_max: fastMax,
    },
    fast_workers: workers,
    captured_log_entry_count: entries.length,
    log_capture_errors: captures.filter((capture) => capture.error).map((capture) => capture.error),
    signals,
    diagnosis,
    relevant_logs: relevantLogs,
    generation_submitted: false,
    inference_performed: false,
    queue_mutation_performed: false,
    production_deploy_performed: false,
    secrets_in_output: false,
  };
} finally {
  if (fastId && deepId) {
    try {
      await patchWorkers(fastId, managementKey, 0, 0);
      cleanup.fast_parked = true;
      await patchWorkers(deepId, managementKey, 0, 1);
      cleanup.deep_restored = true;

      const finalEndpoints = await requestJson(
        `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`,
        managementKey,
      );
      const deepAfter = resolveOne(finalEndpoints, DEEP_NAME);
      const fastAfter = resolveOne(finalEndpoints, FAST_NAME);
      cleanup.canonical_state_after = {
        deep_workers_min: finite(deepAfter?.workersMin, -1),
        deep_workers_max: finite(deepAfter?.workersMax, -1),
        fast_workers_min: finite(fastAfter?.workersMin, -1),
        fast_workers_max: finite(fastAfter?.workersMax, -1),
      };
      if (
        cleanup.canonical_state_after.deep_workers_min !== 0 ||
        cleanup.canonical_state_after.deep_workers_max !== 1 ||
        cleanup.canonical_state_after.fast_workers_min !== 0 ||
        cleanup.canonical_state_after.fast_workers_max !== 0
      ) {
        throw new Error(`AVANTIQO_FAST_LIVE_CAPTURE_CLEANUP_VERIFY_FAILED:${JSON.stringify(cleanup.canonical_state_after)}`);
      }
    } catch (error) {
      cleanup.error = redact(text(error?.message || error)).slice(0, 900);
    }
  }
}

if (!report) {
  throw new Error(`AVANTIQO_FAST_LIVE_CAPTURE_FAILED_BEFORE_REPORT:cleanup=${JSON.stringify(cleanup)}`);
}
report.cleanup = cleanup;
report.success = cleanup.fast_parked && cleanup.deep_restored && !cleanup.error;
report.next_action =
  report.diagnosis === "FAST_SERVERLESS_WORKER_STARTED_NO_INFERENCE"
    ? "RUN_ONE_BOUNDED_FAST_FIRST_RESPONSE_AFTER_CANONICAL_SLOT_REACTIVATION"
    : report.diagnosis === "FAST_RUNTIME_STARTED_SERVERLESS_SIGNATURE_NOT_CAPTURED"
      ? "VERIFY_FAST_SERVERLESS_HANDLER_ENTRYPOINT_BEFORE_INFERENCE"
      : report.diagnosis.includes("FAILURE")
        ? "REPAIR_FAST_STARTUP_FROM_CAPTURED_LOGS"
        : "REVIEW_FAST_LIVE_WORKER_LOGS_BEFORE_ONE_BOUNDED_INFERENCE";

const reportPath = resolve(process.env.AVANTIQO_INTELLIGENCE_FAST_LIVE_WORKER_CAPTURE_RECOVERY_OUTPUT || REPORT_DEFAULT);
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
console.log(JSON.stringify(report, null, 2));
console.log(`AVANTIQO_INTELLIGENCE_FAST_LIVE_WORKER_CAPTURE_RECOVERY_REPORT=${reportPath}`);
console.log(`AVANTIQO_INTELLIGENCE_FAST_LIVE_WORKER_CAPTURE_RECOVERY=${report.success ? "PASS" : "FAIL"}`);
if (!report.success) process.exitCode = 1;
