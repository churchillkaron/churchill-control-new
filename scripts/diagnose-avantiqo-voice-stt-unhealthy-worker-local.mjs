import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_VOICE_STT_UNHEALTHY_WORKER_DIAGNOSTIC_V1";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const REPORT_PATH = resolve(
  process.env.AVANTIQO_VOICE_STT_UNHEALTHY_WORKER_REPORT ||
  "/tmp/avantiqo-voice-stt-unhealthy-worker-diagnostic.json",
);
const LOG_TAIL = Math.max(200, Math.min(5000, Number(process.env.AVANTIQO_VOICE_STT_LOG_TAIL || 1800)));
const CAPTURE_MS = Math.max(10_000, Math.min(90_000, Number(process.env.AVANTIQO_VOICE_STT_LOG_CAPTURE_MS || 20_000)));

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}
function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}
async function jsonRequest(url, credential) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = redact(text(body?.message || body?.error || body?.detail || raw)).slice(0, 900);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}
function safeWorker(worker = {}) {
  return {
    id: text(worker?.id) || null,
    status: text(worker?.status || worker?.desiredStatus).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    image: text(worker?.image) || null,
    started_at: text(worker?.startedAt) || null,
    is_stale: worker?.isStale === true,
  };
}
function parseSseFrame(frame, workerId) {
  const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart());
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
async function captureWorkerLogs(endpointId, workerId, credential) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CAPTURE_MS);
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
      error = `RUNPOD_LOG_HTTP_${response.status}:${redact(raw).slice(0, 900)}`;
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
      catch (readError) { if (readError?.name === "AbortError") break; throw readError; }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const parsed = parseSseFrame(frame, workerId);
        if (parsed) entries.push(parsed);
      }
    }
  } catch (captureError) {
    if (captureError?.name !== "AbortError") error = redact(captureError?.message || captureError).slice(0, 900);
  } finally {
    clearTimeout(timeout);
  }
  if (buffer.trim()) {
    const parsed = parseSseFrame(buffer, workerId);
    if (parsed) entries.push(parsed);
  }
  return { worker_id: workerId, response_status: responseStatus, content_type: contentType, entries, error };
}

const importantPattern = /traceback|exception|error|fatal|failed|failure|runtimeerror|importerror|modulenotfound|cuda|nvidia|driver|device|fitness|unhealthy|heartbeat|torch|transformers|python|handler|runpod|oom|out of memory|killed|sigkill|exit code|exited|container|permission denied|no space left/i;
function relevant(entries) {
  const matched = entries.filter((entry) => importantPattern.test(entry.line));
  return (matched.length ? matched : entries).slice(-220);
}
function classify(entries, worker) {
  const joined = entries.map((entry) => entry.line).join("\n");
  const causes = [];
  if (/cuda.*driver|driver.*cuda|cuda driver version is insufficient|failed call to cuinit|libcuda/i.test(joined)) causes.push("CUDA_DRIVER_RUNTIME_FAILURE");
  if (/torch\.cuda\.is_available|cuda required|no cuda|cuda unavailable|no nvidia gpu/i.test(joined)) causes.push("CUDA_FITNESS_FAILURE");
  if (/fitness.*fail|worker is unhealthy|health check.*fail/i.test(joined)) causes.push("WORKER_FITNESS_FAILURE");
  if (/traceback|runtimeerror|exception:|importerror|modulenotfounderror/i.test(joined)) causes.push("PYTHON_STARTUP_FAILURE");
  if (/out of memory|\boom\b|exit code 137|sigkill|killed process/i.test(joined)) causes.push("MEMORY_OR_OOM_FAILURE");
  if (/no space left on device|disk quota exceeded|insufficient disk/i.test(joined)) causes.push("CONTAINER_DISK_FAILURE");
  if (/failed to start container|oci runtime|runc.*error|exec format error|permission denied|executable file not found/i.test(joined)) causes.push("CONTAINER_RUNTIME_START_FAILURE");
  if (/401|unauthorized|authentication required|pull access denied|manifest unknown/i.test(joined)) causes.push("IMAGE_PULL_OR_REGISTRY_FAILURE");
  if (!causes.length && worker?.status === "UNHEALTHY") causes.push("UNHEALTHY_CAUSE_REQUIRES_LOG_REVIEW");
  return [...new Set(causes)];
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointsRaw = await jsonRequest(`${REST_BASE}/endpoints?includeTemplate=false&includeWorkers=false`, managementKey);
const endpoints = normalizeList(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
if (!endpoints) throw new Error("AVANTIQO_VOICE_STT_DIAGNOSTIC_ENDPOINT_LIST_INVALID");
const endpointMatches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
if (endpointMatches.length !== 1) throw new Error(`AVANTIQO_VOICE_STT_DIAGNOSTIC_ENDPOINT_RESOLUTION_FAILED:matches=${endpointMatches.length}`);
const endpointId = text(endpointMatches[0]?.id);
if (!endpointId) throw new Error("AVANTIQO_VOICE_STT_DIAGNOSTIC_ENDPOINT_ID_REQUIRED");

const workersBeforeBody = await jsonRequest(`${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`, managementKey);
const workersBefore = list(workersBeforeBody?.workers).map(safeWorker);
const candidates = workersBefore
  .filter((worker) => worker.id && !worker.is_stale && ["INITIALIZING", "UNHEALTHY", "READY", "RUNNING"].includes(worker.status))
  .slice(-4);

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_STT_UNHEALTHY_WORKER_CAPTURE_START",
  contract: CONTRACT,
  endpoint_name: ENDPOINT_NAME,
  endpoint_id_present: true,
  capture_seconds: Math.round(CAPTURE_MS / 1000),
  workers: workersBefore.map(({ id, ...worker }) => ({ ...worker, id_present: Boolean(id) })),
  candidates: candidates.map(({ id, ...worker }) => ({ ...worker, id_present: Boolean(id) })),
  read_only: true,
  generation_submitted: false,
  queue_mutation_performed: false,
  endpoint_mutation_performed: false,
  tts_touched: false,
  secrets_printed: false,
}, null, 2));

if (!candidates.length) throw new Error("AVANTIQO_VOICE_STT_UNHEALTHY_WORKER_NOT_CURRENTLY_PRESENT");

const captures = await Promise.all(candidates.map((worker) => captureWorkerLogs(endpointId, worker.id, managementKey)));
const workersAfterBody = await jsonRequest(`${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`, managementKey).catch(() => ({ workers: [] }));
const workersAfter = list(workersAfterBody?.workers).map(safeWorker);
const afterById = new Map(workersAfter.map((worker) => [worker.id, worker]));

const workerEvidence = captures.map((capture) => {
  const before = workersBefore.find((worker) => worker.id === capture.worker_id) || null;
  const after = afterById.get(capture.worker_id) || null;
  return {
    worker_id_present: Boolean(capture.worker_id),
    status_before: before?.status || null,
    status_after: after?.status || "NO_LONGER_LISTED",
    gpu_type_id: before?.gpu_type_id || after?.gpu_type_id || null,
    data_center_id: before?.data_center_id || after?.data_center_id || null,
    response_status: capture.response_status,
    content_type: capture.content_type,
    entry_count: capture.entries.length,
    container_output_count: capture.entries.filter((entry) => entry.source === "container").length,
    likely_causes: classify(capture.entries, after || before),
    relevant_log_lines: relevant(capture.entries),
    error: capture.error,
  };
});

const result = {
  success: true,
  contract: CONTRACT,
  endpoint_name: ENDPOINT_NAME,
  endpoint_id_present: true,
  read_only: true,
  mutation_performed: false,
  generation_submitted: false,
  queue_mutation_performed: false,
  endpoint_mutation_performed: false,
  tts_touched: false,
  capture_seconds: Math.round(CAPTURE_MS / 1000),
  workers_before: workersBefore.map(({ id, ...worker }) => ({ ...worker, id_present: Boolean(id) })),
  workers_after: workersAfter.map(({ id, ...worker }) => ({ ...worker, id_present: Boolean(id) })),
  worker_evidence: workerEvidence,
  secrets_printed: false,
};

await mkdir(dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify({ ...result, raw_captures: captures }, null, 2)}\n`, "utf8");
console.log(JSON.stringify(result, null, 2));
console.log(`AVANTIQO_VOICE_STT_UNHEALTHY_WORKER_REPORT=${REPORT_PATH}`);
console.log("AVANTIQO_VOICE_STT_UNHEALTHY_WORKER_DIAGNOSTIC=PASS");
