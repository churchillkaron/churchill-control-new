import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const CONTROL_BASE = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_CONTAINER_TRANSITION_DIAGNOSTIC_V1";
const DEFAULT_REPORT = "/tmp/avantiqo-voice-tts-container-transition-diagnostic.json";
const LOG_TAIL = Math.max(100, Math.min(5000, Number(process.env.AVANTIQO_VOICE_TTS_CONTAINER_LOG_TAIL || 1500)));
const CAPTURE_MS = Math.max(
  15_000,
  Math.min(180_000, Number(process.env.AVANTIQO_VOICE_TTS_CONTAINER_CAPTURE_MS || 75_000)),
);

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

async function jsonRequest(url, credential) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = redact(text(body?.message || body?.error || body?.detail || raw)).slice(0, 700);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

function safeWorkers(body) {
  return list(body?.workers).map((worker) => ({
    id: text(worker?.id) || null,
    status: text(worker?.status).toUpperCase() || null,
    image: text(worker?.image) || null,
    version: Number.isFinite(Number(worker?.version)) ? Number(worker.version) : null,
    gpu_count: Number.isFinite(Number(worker?.gpuCount)) ? Number(worker.gpuCount) : null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    started_at: text(worker?.startedAt) || null,
    is_stale: worker?.isStale === true,
  }));
}

function parseSseFrame(frame, workerId) {
  const lines = frame.split(/\r?\n/);
  const data = [];
  for (const line of lines) {
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  const payload = data.join("\n");
  try {
    const parsed = JSON.parse(payload);
    return {
      worker_id: workerId,
      source: text(parsed?.source) || "unknown",
      ts: text(parsed?.ts) || null,
      line: redact(parsed?.line ?? parsed?.raw ?? payload).slice(0, 4000),
      truncated: parsed?.truncated === true,
    };
  } catch {
    return {
      worker_id: workerId,
      source: "unknown",
      ts: null,
      line: redact(payload).slice(0, 4000),
      truncated: payload.length > 4000,
    };
  }
}

async function captureWorkerLogs(endpointId, workerId, credential) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CAPTURE_MS);
  const url = `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers/${encodeURIComponent(workerId)}/logs?tail=${LOG_TAIL}&source=both`;
  const entries = [];
  let responseStatus = null;
  let contentType = null;
  let buffer = "";
  let error = null;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "text/event-stream",
      },
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
      try {
        chunk = await reader.read();
      } catch (readError) {
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
    if (captureError?.name !== "AbortError") {
      error = redact(text(captureError?.message || captureError)).slice(0, 700);
    }
  } finally {
    clearTimeout(timeout);
  }

  if (buffer.trim()) {
    const entry = parseSseFrame(buffer, workerId);
    if (entry) entries.push(entry);
  }

  return { worker_id: workerId, response_status: responseStatus, content_type: contentType, entries, error };
}

const importantPattern = /start container|container start|stop container|container stop|exited|exit code|failed|failure|error|fatal|no space left|disk quota|overlay|mount|runc|oci runtime|exec format|permission denied|executable file not found|killed|sigkill|oom|out of memory|cuda|nvidia|fitness|heartbeat|runpod|handler|python|traceback|exception|importerror|modulenotfound/i;

function relevant(entries) {
  const matched = entries.filter((entry) => importantPattern.test(entry.line));
  return (matched.length ? matched : entries).slice(-160);
}

function classify(entries, beforeWorker, afterWorker) {
  const joined = entries.map((entry) => entry.line).join("\n");
  const containerOutput = entries.some((entry) => entry.source === "container");
  const startBegin = /start container.*begin|starting container|container start/i.test(joined);
  const startFailure = /failed to start container|oci runtime|runc.*error|exec format error|executable file not found|permission denied/i.test(joined);
  const diskFailure = /no space left on device|disk quota exceeded|insufficient disk/i.test(joined);
  const oom = /out of memory|\boom\b|exit code 137|sigkill|killed process/i.test(joined);
  const exitObserved = /stop(?:ping|ped)? container|container stopped|exited|exit code|terminated/i.test(joined);
  const pythonFailure = /traceback|modulenotfounderror|importerror|runtimeerror|exception:/i.test(joined);
  const fitnessFailure = /fitness.*fail|worker is unhealthy|cuda.*required|cuda.*fail/i.test(joined);
  const afterStatus = text(afterWorker?.status).toUpperCase();

  const causes = [];
  if (diskFailure) causes.push("CONTAINER_DISK_EXHAUSTED");
  if (startFailure) causes.push("CONTAINER_RUNTIME_START_FAILURE");
  if (oom) causes.push("CONTAINER_MEMORY_OR_OOM_FAILURE");
  if (fitnessFailure) causes.push("WORKER_FITNESS_FAILURE");
  if (pythonFailure) causes.push("PYTHON_STARTUP_FAILURE");
  if (containerOutput) causes.push("CONTAINER_PROCESS_OUTPUT_OBSERVED");
  if (startBegin && !containerOutput && (exitObserved || afterStatus === "UNHEALTHY")) {
    causes.push("CONTAINER_EXITS_BEFORE_PROCESS_OUTPUT");
  }
  if (startBegin && !containerOutput && afterStatus === "INITIALIZING" && causes.length === 0) {
    causes.push("CONTAINER_START_TRANSITION_STILL_IN_PROGRESS");
  }
  if (!startBegin && beforeWorker?.status === "INITIALIZING" && causes.length === 0) {
    causes.push("WORKER_INITIALIZATION_NO_CONTAINER_START_EVIDENCE");
  }
  return [...new Set(causes)];
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const reportPath = resolve(
  process.env.AVANTIQO_VOICE_TTS_CONTAINER_TRANSITION_OUTPUT || DEFAULT_REPORT,
);

const beforeBody = await jsonRequest(
  `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`,
  managementKey,
);
const beforeWorkers = safeWorkers(beforeBody);
console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_TTS_CONTAINER_TRANSITION_BEFORE",
  endpoint_id: endpointId,
  capture_seconds: Math.round(CAPTURE_MS / 1000),
  workers: beforeWorkers,
  summary: object(beforeBody?.summary),
  secret_values_printed: false,
}));

const candidates = beforeWorkers
  .filter((worker) => worker.id && ["INITIALIZING", "UNHEALTHY", "IDLE"].includes(worker.status))
  .slice(-5);
const captures = await Promise.all(
  candidates.map((worker) => captureWorkerLogs(endpointId, worker.id, managementKey)),
);

const afterBody = await jsonRequest(
  `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`,
  managementKey,
);
const afterWorkers = safeWorkers(afterBody);
const afterById = new Map(afterWorkers.map((worker) => [worker.id, worker]));

const workerEvidence = captures.map((capture) => {
  const beforeWorker = beforeWorkers.find((worker) => worker.id === capture.worker_id) || null;
  const afterWorker = afterById.get(capture.worker_id) || null;
  return {
    worker_id: capture.worker_id,
    status_before: beforeWorker?.status || null,
    status_after: afterWorker?.status || "NO_LONGER_LISTED",
    response_status: capture.response_status,
    content_type: capture.content_type,
    entry_count: capture.entries.length,
    container_output_count: capture.entries.filter((entry) => entry.source === "container").length,
    likely_causes: classify(capture.entries, beforeWorker, afterWorker),
    relevant_log_lines: relevant(capture.entries),
    error: capture.error,
  };
});

const result = {
  success: true,
  contract: CONTRACT,
  read_only: true,
  mutation_performed: false,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  endpoint_id: endpointId,
  capture_seconds: Math.round(CAPTURE_MS / 1000),
  workers_before: beforeWorkers,
  summary_before: object(beforeBody?.summary),
  workers_after: afterWorkers,
  summary_after: object(afterBody?.summary),
  worker_evidence: workerEvidence,
  secrets_in_output: false,
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify({ ...result, captures }, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
console.log(`AVANTIQO_VOICE_TTS_CONTAINER_TRANSITION_REPORT=${reportPath}`);
