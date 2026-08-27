const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_HANDLER_CLAIM_DIAGNOSTIC_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "intelligence-deep";
const ENDPOINT_NAME = "avantiqo-intelligence-v1";
const DEFAULT_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const OBSERVE_MS = 90_000;
const POLL_MS = 5_000;
const LOG_CAPTURE_MS = 1_500;

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const upper = (value) => text(value, 160).toUpperCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function requireLease() {
  if (upper(process.env.AVANTIQO_INTELLIGENCE_DEEP_HANDLER_CLAIM_DIAGNOSTIC_APPROVED) !== "YES") {
    throw new Error("AVANTIQO_INTELLIGENCE_DEEP_HANDLER_CLAIM_DIAGNOSTIC_APPROVED=YES_REQUIRED");
  }
  if (upper(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE) !== "YES") {
    throw new Error("AVANTIQO_DEEP_HANDLER_CLAIM_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_DEEP_HANDLER_CLAIM_SAFE_LEASE_V2_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120) !== SAFE_LEASE_LANE) {
    throw new Error("AVANTIQO_DEEP_HANDLER_CLAIM_SAFE_LEASE_LANE_MISMATCH");
  }
  const leaseId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID, 200);
  const configuredId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID, 200);
  if (!leaseId || !configuredId || leaseId !== configuredId) {
    throw new Error("AVANTIQO_DEEP_HANDLER_CLAIM_SAFE_LEASE_ENDPOINT_MISMATCH");
  }
  return leaseId;
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs || 20_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`AVANTIQO_DEEP_HANDLER_CLAIM_HTTP_${response.status}:${redact(text(body?.error?.message || body?.error || body?.message || raw, 700))}`);
  }
  return body ?? {};
}

function normalizeRows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function envKeys(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => text(entry?.key || entry?.name, 200)).filter(Boolean).sort();
  }
  return Object.keys(object(value)).sort();
}

function commandList(value) {
  return (Array.isArray(value) ? value : [value]).map((entry) => text(entry, 500)).filter(Boolean);
}

function templateSummary(template = {}) {
  const entrypoint = commandList(template?.dockerEntrypoint);
  const startCmd = commandList(template?.dockerStartCmd);
  const serialized = JSON.stringify({ entrypoint, startCmd, env: envKeys(template?.env) });
  return {
    image_name: text(template?.imageName, 500) || null,
    container_disk_gb: finite(template?.containerDiskInGb, null),
    entrypoint_present: entrypoint.length > 0,
    entrypoint_arg_count: entrypoint.length,
    start_cmd_present: startCmd.length > 0,
    start_cmd_arg_count: startCmd.length,
    env_key_count: envKeys(template?.env).length,
    runpod_serverless_reference_present: /runpod|serverless/i.test(serialized),
    vllm_reference_present: /vllm|openai\.api_server|api_server/i.test(serialized),
    model_binding_present: serialized.includes(DEFAULT_MODEL),
  };
}

function healthSummary(value = {}) {
  return {
    jobs: {
      in_queue: finite(value?.jobs?.inQueue ?? value?.jobs?.in_queue),
      in_progress: finite(value?.jobs?.inProgress ?? value?.jobs?.in_progress),
    },
    workers: {
      initializing: finite(value?.workers?.initializing),
      running: finite(value?.workers?.running),
      idle: finite(value?.workers?.idle),
      ready: finite(value?.workers?.ready),
      unhealthy: finite(value?.workers?.unhealthy),
    },
  };
}

function safeWorker(worker = {}) {
  return {
    id: text(worker?.id, 240) || null,
    status: upper(worker?.status) || null,
    version: Number.isFinite(Number(worker?.version)) ? Number(worker.version) : null,
    image: text(worker?.image, 500) || null,
    gpu_type_id: text(worker?.gpuTypeId, 300) || null,
    started_at: text(worker?.startedAt, 200) || null,
    is_stale: worker?.isStale === true,
  };
}

function parseFrame(frame, workerId) {
  const parts = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart());
  if (!parts.length) return null;
  const payload = parts.join("\n");
  try {
    const parsed = JSON.parse(payload);
    return {
      worker_id: workerId,
      source: text(parsed?.source, 120) || "unknown",
      ts: text(parsed?.ts, 160) || null,
      line: redact(parsed?.line ?? parsed?.raw ?? payload).slice(0, 4000),
    };
  } catch {
    return { worker_id: workerId, source: "unknown", ts: null, line: redact(payload).slice(0, 4000) };
  }
}

async function captureLogs(endpointId, workerId, managementKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOG_CAPTURE_MS);
  const entries = [];
  let buffer = "";
  let error = null;
  try {
    const response = await fetch(
      `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers/${encodeURIComponent(workerId)}/logs?tail=1200`,
      { headers: { Authorization: `Bearer ${managementKey}`, Accept: "text/event-stream" }, signal: controller.signal },
    );
    if (!response.ok) return { entries, error: `LOG_HTTP_${response.status}` };
    if (!response.body) return { entries, error: "LOG_BODY_REQUIRED" };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      let chunk;
      try { chunk = await reader.read(); } catch (readError) {
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
    if (captureError?.name !== "AbortError") error = redact(text(captureError?.message || captureError, 500));
  } finally {
    clearTimeout(timer);
  }
  if (buffer.trim()) {
    const entry = parseFrame(buffer, workerId);
    if (entry) entries.push(entry);
  }
  return { entries, error };
}

function signals(entries) {
  const joined = entries.map((entry) => entry.line).join("\n");
  const has = (pattern) => pattern.test(joined);
  return {
    serverless_worker_started: has(/Starting Serverless Worker|serverless worker.*start/i),
    serverless_environment_missing: has(/not deployed on RunPod serverless/i),
    handler_signal: has(/handler/i),
    queue_poll_signal: has(/Jobs in queue|job.*queue|queue.*job/i),
    control_plane_failure: has(/unauthorized|forbidden|failed.*ping|ping.*failed|authentication.*failed/i),
    api_server_started: has(/Application startup complete|Uvicorn running|Started server process/i),
    vllm_signal: has(/\bvllm\b|AsyncLLM|LLMEngine/i),
    model_loaded_signal: has(/model.*loaded|loading model weights took|engine.*ready/i),
    python_failure: has(/Traceback|ModuleNotFoundError|ImportError|RuntimeError|Exception:/i),
    cuda_failure: has(/cuda.*(?:error|failed)|nvidia.*(?:error|failed)|libcuda|cudnn.*(?:error|failed)/i),
    memory_failure: has(/out of memory|\boom\b|exit code 137|sigkill|killed process/i),
  };
}

function classify({ evidence, latestHealth, workersSeen }) {
  if (evidence.serverless_environment_missing) return "SERVERLESS_ENVIRONMENT_NOT_DETECTED_BY_CONTAINER";
  if (evidence.control_plane_failure) return "RUNPOD_HANDLER_CONTROL_PLANE_FAILURE";
  if (evidence.cuda_failure) return "CUDA_OR_NVIDIA_STARTUP_FAILURE";
  if (evidence.memory_failure) return "MEMORY_OR_PROCESS_TERMINATION_FAILURE";
  if (evidence.python_failure) return "PYTHON_OR_VLLM_STARTUP_FAILURE";
  if (evidence.api_server_started && !evidence.serverless_worker_started) return "VLLM_STARTED_BUT_SERVERLESS_HANDLER_NOT_STARTED";
  if (evidence.serverless_worker_started && latestHealth.jobs.in_queue > 0 && latestHealth.jobs.in_progress === 0) {
    return "SERVERLESS_HANDLER_STARTED_BUT_JOB_NOT_CLAIMED";
  }
  if (workersSeen > 0 && latestHealth.jobs.in_queue > 0 && latestHealth.jobs.in_progress === 0) {
    return "WORKER_RUNNING_BUT_HANDLER_CLAIM_SIGNAL_MISSING";
  }
  return "DEEP_HANDLER_CLAIM_LOGS_INCONCLUSIVE";
}

const endpointId = requireLease();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 500);
const runtimeKey = text(process.env.RUNPOD_API_KEY || managementKey, 500);
if (!managementKey || !runtimeKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");

const endpointsRaw = await requestJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey);
const endpoints = normalizeRows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const matches = endpoints.filter((entry) => text(entry?.name, 300) === ENDPOINT_NAME);
if (matches.length !== 1) throw new Error(`AVANTIQO_DEEP_HANDLER_CLAIM_ENDPOINT_MATCHES_${matches.length}`);
const endpoint = matches[0];
if (text(endpoint?.id, 200) !== endpointId) throw new Error("AVANTIQO_DEEP_HANDLER_CLAIM_ENDPOINT_ID_MISMATCH");
if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 1) {
  throw new Error(`AVANTIQO_DEEP_HANDLER_CLAIM_LEASE_CAPACITY_INVALID:${finite(endpoint?.workersMin, -1)}/${finite(endpoint?.workersMax, -1)}`);
}
const boundTemplate = endpoint?.template || {};
const before = healthSummary(await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, runtimeKey));
if (before.jobs.in_queue !== 0 || before.jobs.in_progress !== 0) throw new Error("AVANTIQO_DEEP_HANDLER_CLAIM_ZERO_QUEUE_REQUIRED");

console.log(JSON.stringify({
  contract: CONTRACT,
  phase: "START",
  endpoint_name: ENDPOINT_NAME,
  template_runtime: templateSummary(boundTemplate),
  generation_submitted: false,
  endpoint_mutation_performed: false,
  template_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

const model = text(process.env.AVANTIQO_INTELLIGENCE_MODEL, 300) || DEFAULT_MODEL;
const submitted = await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/run`, runtimeKey, {
  method: "POST",
  body: {
    input: {
      route: "/v1/chat/completions",
      method: "POST",
      body: {
        model,
        messages: [{ role: "user", content: "Reply only READY." }],
        temperature: 0.6,
        top_p: 0.95,
        max_tokens: 8,
      },
    },
  },
});
const jobId = text(submitted?.id, 300);
if (!jobId) throw new Error("AVANTIQO_DEEP_HANDLER_CLAIM_JOB_ID_MISSING");

const seenEntries = new Set();
const logs = [];
const logErrors = [];
const workerIds = new Set();
let latestHealth = before;
let latestWorkers = [];
let lastStatus = "IN_QUEUE";
const startedAt = Date.now();

while (Date.now() - startedAt < OBSERVE_MS) {
  const [healthRaw, workersRaw, statusRaw] = await Promise.all([
    requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, runtimeKey).catch(() => ({})),
    requestJson(`${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`, managementKey).catch(() => ({})),
    requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`, runtimeKey).catch(() => ({})),
  ]);
  latestHealth = healthSummary(healthRaw);
  latestWorkers = list(workersRaw?.workers).map(safeWorker);
  lastStatus = upper(statusRaw?.status || statusRaw?.state) || lastStatus;

  for (const worker of latestWorkers) {
    if (!worker.id) continue;
    workerIds.add(worker.id);
    const capture = await captureLogs(endpointId, worker.id, managementKey);
    if (capture.error) logErrors.push({ worker_id: worker.id, error: capture.error });
    for (const entry of capture.entries) {
      const key = `${entry.worker_id}|${entry.source}|${entry.ts}|${entry.line}`;
      if (seenEntries.has(key)) continue;
      seenEntries.add(key);
      logs.push(entry);
    }
  }

  console.log(`AVANTIQO_DEEP_HANDLER_CLAIM_PROGRESS=${JSON.stringify({
    elapsed_seconds: Math.floor((Date.now() - startedAt) / 1000),
    status: lastStatus,
    health: latestHealth,
    workers: latestWorkers.map((worker) => ({ status: worker.status, version: worker.version, is_stale: worker.is_stale })),
    captured_log_entries: logs.length,
  })}`);

  if (["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(lastStatus)) break;
  if (latestHealth.jobs.in_progress > 0) break;
  await sleep(POLL_MS);
}

const evidence = signals(logs);
const diagnosis = classify({ evidence, latestHealth, workersSeen: workerIds.size });
const relevantPatterns = [
  /Starting Serverless Worker/i,
  /Jobs in queue|Jobs in progress/i,
  /handler/i,
  /not deployed on RunPod serverless/i,
  /Application startup complete|Uvicorn running/i,
  /vllm|LLMEngine|model/i,
  /traceback|exception|runtimeerror|error|failed|fatal/i,
  /cuda|nvidia|out of memory|oom|killed/i,
  /ping|unauthorized|forbidden/i,
];
const relevantLogs = logs.filter((entry) => relevantPatterns.some((pattern) => pattern.test(entry.line))).slice(-160);

console.log(JSON.stringify({
  success: false,
  contract: CONTRACT,
  diagnosis,
  final_status: lastStatus,
  latest_health: latestHealth,
  workers_seen: workerIds.size,
  latest_workers: latestWorkers,
  template_runtime: templateSummary(boundTemplate),
  signals: evidence,
  relevant_logs: relevantLogs,
  log_capture_errors: logErrors.slice(-20),
  generation_submitted: true,
  generation_scope: "DIAGNOSTIC_8_TOKEN_NATIVE_RUN_ONLY",
  endpoint_mutation_performed: false,
  template_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`AVANTIQO_INTELLIGENCE_DEEP_HANDLER_CLAIM_DIAGNOSTIC=${diagnosis}`);
process.exit(3);
