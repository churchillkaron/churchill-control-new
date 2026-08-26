import { writeFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_FAILED_JOB_INSPECTION_V1";
const LOG_TAIL = 500;
const LOG_CAPTURE_MS = 6000;
const REPORT_PATH = "/tmp/avantiqo-voice-tts-failed-job-inspection.json";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function finite(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

async function queueRead(endpointId, pathname, credentials) {
  const keys = [...new Set([credentials.inference, credentials.management].filter(Boolean))];
  let lastError = null;
  for (const key of keys) {
    const response = await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}${pathname}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (response.ok) return body || {};
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_VOICE_TTS_FAILED_JOB_QUEUE_HTTP_${response.status}:${redact(text(body?.message || body?.error || raw)).slice(0, 700)}`);
    }
    lastError = new Error(`RUNPOD_VOICE_TTS_FAILED_JOB_QUEUE_HTTP_${response.status}`);
  }
  throw lastError || new Error("RUNPOD_VOICE_TTS_FAILED_JOB_CREDENTIAL_REQUIRED");
}

async function controlWorkers(endpointId, key) {
  const response = await fetch(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`RUNPOD_VOICE_TTS_FAILED_JOB_WORKERS_HTTP_${response.status}:${redact(raw).slice(0, 700)}`);
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
  return {
    workers: list(body?.workers).map((worker) => ({
      id: text(worker?.id) || null,
      status: text(worker?.status).toUpperCase() || null,
      image: text(worker?.image) || null,
      gpu_type_id: text(worker?.gpuTypeId) || null,
      data_center_id: text(worker?.dataCenterId) || null,
      started_at: text(worker?.startedAt) || null,
      is_stale: worker?.isStale === true,
    })),
    summary: object(body?.summary),
  };
}

function parseSseFrame(frame, workerId) {
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

async function captureWorkerLogs(endpointId, workerId, key) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOG_CAPTURE_MS);
  const entries = [];
  let buffer = "";
  let error = null;
  let responseStatus = null;
  try {
    const response = await fetch(
      `${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers/${encodeURIComponent(workerId)}/logs?tail=${LOG_TAIL}`,
      {
        headers: { Authorization: `Bearer ${key}`, Accept: "text/event-stream" },
        signal: controller.signal,
      },
    );
    responseStatus = response.status;
    if (!response.ok) {
      error = `RUNPOD_LOG_HTTP_${response.status}:${redact(await response.text()).slice(0, 700)}`;
      return { worker_id: workerId, response_status: responseStatus, entries, error };
    }
    if (!response.body) return { worker_id: workerId, response_status: responseStatus, entries, error: "RUNPOD_LOG_STREAM_BODY_REQUIRED" };
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      let chunk;
      try { chunk = await reader.read(); } catch (caught) { if (caught?.name === "AbortError") break; throw caught; }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      for (const frame of frames) {
        const entry = parseSseFrame(frame, workerId);
        if (entry) entries.push(entry);
      }
    }
  } catch (caught) {
    if (caught?.name !== "AbortError") error = redact(text(caught?.message || caught)).slice(0, 700);
  } finally {
    clearTimeout(timer);
  }
  if (buffer.trim()) {
    const entry = parseSseFrame(buffer, workerId);
    if (entry) entries.push(entry);
  }
  return { worker_id: workerId, response_status: responseStatus, entries, error };
}

function outputSummary(output) {
  if (output == null) return null;
  if (typeof output === "string") return { type: "string", preview: redact(output).slice(0, 1200), length: output.length };
  if (Array.isArray(output)) return { type: "array", length: output.length };
  if (typeof output === "object") {
    const keys = Object.keys(output).sort();
    const safe = {};
    for (const key of keys) {
      if (/audio_base64|base64|bytes|binary/i.test(key)) {
        safe[key] = "[OMITTED_BINARY_PAYLOAD]";
        continue;
      }
      const value = output[key];
      if (value == null || ["string", "number", "boolean"].includes(typeof value)) {
        safe[key] = typeof value === "string" ? redact(value).slice(0, 1200) : value;
      } else {
        safe[key] = Array.isArray(value) ? `[ARRAY:${value.length}]` : `[OBJECT:${Object.keys(value).length}]`;
      }
    }
    return { type: "object", keys, safe };
  }
  return { type: typeof output };
}

const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const jobId = required("AVANTIQO_VOICE_TTS_FAILED_JOB_ID");
const credentials = {
  management: required("RUNPOD_MANAGEMENT_API_KEY"),
  inference: text(process.env.RUNPOD_API_KEY),
};

const [job, health, workersState] = await Promise.all([
  queueRead(endpointId, `/status/${encodeURIComponent(jobId)}`, credentials),
  queueRead(endpointId, "/health", credentials),
  controlWorkers(endpointId, credentials.management),
]);

const captures = await Promise.all(
  workersState.workers.filter((worker) => worker.id).map((worker) => captureWorkerLogs(endpointId, worker.id, credentials.management)),
);
const logEntries = captures.flatMap((capture) => capture.entries);
const relevantPatterns = [
  /AVANTIQO_VOICE_TTS/i,
  /traceback/i,
  /exception/i,
  /runtimeerror/i,
  /error/i,
  /failed/i,
  /cuda/i,
  /out of memory/i,
  /safetensor/i,
  /huggingface/i,
  /snapshot/i,
  /chatterbox/i,
  /perth/i,
  /tokenizer/i,
  /conds\.pt/i,
  /s3gen/i,
  /t3_/i,
];
const relevant = logEntries.filter((entry) => relevantPatterns.some((pattern) => pattern.test(entry.line))).slice(-160);
const jobs = object(health?.jobs);
const workersHealth = object(health?.workers);

const jobSummary = {
  id: jobId,
  status: text(job?.status).toUpperCase() || "UNKNOWN",
  delay_time_ms: finite(job?.delayTime),
  execution_time_ms: finite(job?.executionTime),
  worker_id: text(job?.workerId || job?.worker_id) || null,
  error: redact(text(job?.error || job?.message)).slice(0, 5000) || null,
  output: outputSummary(job?.output),
};

const report = {
  success: true,
  contract: CONTRACT,
  read_only: true,
  mutation_performed: false,
  generation_submitted: false,
  job_cancel_requested: false,
  endpoint_id: endpointId,
  job: jobSummary,
  health: {
    jobs: {
      in_queue: finite(jobs?.inQueue ?? jobs?.in_queue) ?? 0,
      in_progress: finite(jobs?.inProgress ?? jobs?.in_progress) ?? 0,
      completed: finite(jobs?.completed) ?? 0,
      failed: finite(jobs?.failed) ?? 0,
      retried: finite(jobs?.retried) ?? 0,
    },
    workers: {
      idle: finite(workersHealth?.idle) ?? 0,
      initializing: finite(workersHealth?.initializing) ?? 0,
      ready: finite(workersHealth?.ready) ?? 0,
      running: finite(workersHealth?.running) ?? 0,
      throttled: finite(workersHealth?.throttled) ?? 0,
      unhealthy: finite(workersHealth?.unhealthy) ?? 0,
    },
  },
  workers: workersState.workers,
  worker_summary: workersState.summary,
  log_capture: captures.map((capture) => ({
    worker_id: capture.worker_id,
    response_status: capture.response_status,
    entry_count: capture.entries.length,
    error: capture.error,
  })),
  relevant_log_lines: relevant,
  full_sanitized_log_entry_count: logEntries.length,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
};

await writeFile(REPORT_PATH, `${JSON.stringify({ ...report, full_sanitized_logs: logEntries }, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
console.log(`AVANTIQO_VOICE_TTS_FAILED_JOB=${JSON.stringify(jobSummary)}`);
console.log(`AVANTIQO_VOICE_TTS_FAILED_JOB_INSPECTION_REPORT=${REPORT_PATH}`);
