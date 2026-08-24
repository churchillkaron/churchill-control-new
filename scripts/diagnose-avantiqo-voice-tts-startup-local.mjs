import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const CONTROL_BASE = "https://api.runpod.io/v2";
const INVOKE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_STARTUP_DIAGNOSTIC_V1";
const DEFAULT_REPORT = "/tmp/avantiqo-voice-tts-startup-diagnostic.json";
const LOG_TAIL = 500;
const LOG_CAPTURE_MS = 8000;

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

async function jsonRequest(url, credential, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
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
  const timeout = setTimeout(() => controller.abort(), LOG_CAPTURE_MS);
  const url = `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers/${encodeURIComponent(workerId)}/logs?tail=${LOG_TAIL}`;
  const entries = [];
  let responseStatus = null;
  let contentType = null;
  let buffer = "";
  let captureError = null;

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
      captureError = `RUNPOD_LOG_HTTP_${response.status}:${redact(raw).slice(0, 700)}`;
      return { worker_id: workerId, response_status: responseStatus, content_type: contentType, entries, error: captureError };
    }
    if (!response.body) {
      captureError = "RUNPOD_LOG_STREAM_BODY_REQUIRED";
      return { worker_id: workerId, response_status: responseStatus, content_type: contentType, entries, error: captureError };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (error) {
        if (error?.name === "AbortError") break;
        throw error;
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
  } catch (error) {
    if (error?.name !== "AbortError") {
      captureError = redact(text(error?.message || error)).slice(0, 700);
    }
  } finally {
    clearTimeout(timeout);
  }

  if (buffer.trim()) {
    const entry = parseSseFrame(buffer, workerId);
    if (entry) entries.push(entry);
  }

  return {
    worker_id: workerId,
    response_status: responseStatus,
    content_type: contentType,
    entries,
    error: captureError,
  };
}

const signalPatterns = [
  /traceback/i,
  /exception/i,
  /runtimeerror/i,
  /error[: ]/i,
  /failed/i,
  /fatal/i,
  /cuda/i,
  /cudnn/i,
  /nvidia/i,
  /torch/i,
  /chatterbox/i,
  /module.*not found/i,
  /importerror/i,
  /cannot import/i,
  /out of memory/i,
  /\boom\b/i,
  /killed/i,
  /sigkill/i,
  /exit code/i,
  /permission denied/i,
  /exec format/i,
  /no such file/i,
  /pull/i,
  /manifest/i,
  /unauthorized/i,
  /fitness/i,
  /health/i,
  /handler/i,
  /start container/i,
  /stopp?ed container/i,
];

function classify(entries) {
  const lines = entries.map((entry) => entry.line).filter(Boolean);
  const joined = lines.join("\n");
  const causes = [];

  const add = (code, pattern) => {
    if (pattern.test(joined)) causes.push(code);
  };

  add("IMAGE_PULL_OR_REGISTRY_FAILURE", /failed to pull|pull access denied|manifest unknown|no matching manifest|unauthorized.*registry|image pull/i);
  add("CONTAINER_START_COMMAND_FAILURE", /exec format error|executable file not found|permission denied|no such file or directory.*python|failed to start container/i);
  add("CUDA_OR_NVIDIA_RUNTIME_FAILURE", /cuda driver version is insufficient|libcuda|libcudnn|cudnn.*error|nvidia.*error|cuda initialization|cuda error/i);
  add("CUDA_FITNESS_CHECK_FAILURE", /AVANTIQO_VOICE_TTS_CUDA_REQUIRED|torch\.cuda\.is_available.*false/i);
  add("PYTHON_DEPENDENCY_IMPORT_FAILURE", /ModuleNotFoundError|ImportError|cannot import name/i);
  add("MEMORY_OR_OOM_FAILURE", /out of memory|oom|exit code 137|sigkill|killed process/i);
  add("APPLICATION_STARTUP_EXCEPTION", /Traceback|RuntimeError|Exception:/i);

  const systemStarts = entries.filter(
    (entry) => entry.source === "system" && /start container/i.test(entry.line),
  ).length;
  const containerLines = entries.filter((entry) => entry.source === "container").length;
  if (systemStarts >= 2 && containerLines === 0) {
    causes.push("CONTAINER_EXITS_BEFORE_PYTHON_OUTPUT");
  }

  return [...new Set(causes)];
}

function relevantEntries(entries) {
  const matched = entries.filter((entry) => signalPatterns.some((pattern) => pattern.test(entry.line)));
  const source = matched.length ? matched : entries;
  return source.slice(-80);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const jobId = text(process.env.AVANTIQO_VOICE_TTS_SMOKE_JOB_ID);
const cancelRequested = process.argv.includes("--cancel-queued-job");
const cancelApproved = text(process.env.AVANTIQO_VOICE_TTS_CANCEL_QUEUED_JOB_APPROVED).toUpperCase() === "YES";
if (cancelRequested && !cancelApproved) {
  throw new Error("AVANTIQO_VOICE_TTS_CANCEL_QUEUED_JOB_APPROVED=YES_REQUIRED");
}

const reportPath = resolve(
  process.env.AVANTIQO_VOICE_TTS_STARTUP_DIAGNOSTIC_OUTPUT || DEFAULT_REPORT,
);

const workersBody = await jsonRequest(
  `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`,
  managementKey,
);
const workers = list(workersBody?.workers);
const safeWorkers = workers.map((worker) => ({
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

console.log(JSON.stringify({
  event: "AVANTIQO_VOICE_TTS_STARTUP_DIAGNOSTIC_WORKERS",
  endpoint_id: endpointId,
  workers: safeWorkers,
  summary: object(workersBody?.summary),
  secret_values_printed: false,
}));

const captures = await Promise.all(
  safeWorkers
    .filter((worker) => worker.id)
    .map((worker) => captureWorkerLogs(endpointId, worker.id, managementKey)),
);
const allEntries = captures.flatMap((capture) => capture.entries);
const causes = classify(allEntries);
const signals = relevantEntries(allEntries);

let jobBefore = null;
let jobAfter = null;
let cancelPerformed = false;
if (jobId) {
  jobBefore = await jsonRequest(
    `${INVOKE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
    managementKey,
  );
  const status = text(jobBefore?.status).toUpperCase();
  if (cancelRequested && status === "IN_QUEUE") {
    await jsonRequest(
      `${INVOKE_BASE}/${encodeURIComponent(endpointId)}/cancel/${encodeURIComponent(jobId)}`,
      managementKey,
      { method: "POST" },
    );
    cancelPerformed = true;
    jobAfter = await jsonRequest(
      `${INVOKE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
      managementKey,
    );
  }
}

const result = {
  success: true,
  contract: CONTRACT,
  read_only_log_capture: true,
  endpoint_id: endpointId,
  workers: safeWorkers,
  worker_summary: object(workersBody?.summary),
  log_capture: captures.map((capture) => ({
    worker_id: capture.worker_id,
    response_status: capture.response_status,
    content_type: capture.content_type,
    entry_count: capture.entries.length,
    error: capture.error,
  })),
  likely_startup_causes: causes,
  relevant_log_lines: signals,
  full_sanitized_log_entry_count: allEntries.length,
  job: jobId
    ? {
        id: jobId,
        status_before: text(jobBefore?.status).toUpperCase() || null,
        cancel_requested: cancelRequested,
        cancel_performed: cancelPerformed,
        status_after: text(jobAfter?.status).toUpperCase() || null,
      }
    : null,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
};

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(
  reportPath,
  `${JSON.stringify({ ...result, full_sanitized_logs: allEntries }, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(result, null, 2));
console.log(`AVANTIQO_VOICE_TTS_STARTUP_DIAGNOSTIC_REPORT=${reportPath}`);
