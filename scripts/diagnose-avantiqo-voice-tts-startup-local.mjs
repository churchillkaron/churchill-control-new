import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const CONTROL_BASE = "https://api.runpod.io/v2";
const INVOKE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_STARTUP_DIAGNOSTIC_V2";
const DEFAULT_REPORT = "/tmp/avantiqo-voice-tts-startup-diagnostic.json";
const LOG_TAIL = 500;
const LOG_CAPTURE_MS = 8000;
const STALL_THRESHOLD_MS = 120_000;

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

function epochMs(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function secondsBetween(start, end) {
  const startMs = epochMs(start);
  const endMs = epochMs(end);
  if (startMs === null || endMs === null || endMs < startMs) return null;
  return Math.round((endMs - startMs) / 1000);
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

async function optionalJsonRequest(url, credential, options = {}) {
  try {
    return {
      ok: true,
      body: await jsonRequest(url, credential, options),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      body: null,
      error: redact(text(error?.message || error)).slice(0, 700),
    };
  }
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
      return {
        worker_id: workerId,
        response_status: responseStatus,
        content_type: contentType,
        entries,
        error: captureError,
      };
    }
    if (!response.body) {
      captureError = "RUNPOD_LOG_STREAM_BODY_REQUIRED";
      return {
        worker_id: workerId,
        response_status: responseStatus,
        content_type: contentType,
        entries,
        error: captureError,
      };
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
  /download/i,
];

function firstEntry(entries, pattern) {
  return entries.find((entry) => pattern.test(entry.line)) || null;
}

function lastEntry(entries, pattern) {
  return [...entries].reverse().find((entry) => pattern.test(entry.line)) || null;
}

function pullTimeline(entries) {
  const firstPending = firstEntry(entries, /image pull: .*: pending/i);
  const lastPending = lastEntry(entries, /image pull: .*: pending/i);
  const pullStarted = firstEntry(entries, /\bPulling from\b/i);
  const firstLayer = firstEntry(
    entries,
    /Pulling fs layer|Waiting|Downloading|Download complete|Pull complete/i,
  );
  const imageReady = firstEntry(
    entries,
    /Downloaded newer image|Image is up to date|Status:\s*Downloaded|pull complete.*digest/i,
  );
  const containerStarted = firstEntry(
    entries,
    /start(?:ing|ed)? container|container started|docker container start/i,
  );
  const firstContainerOutput = entries.find((entry) => entry.source === "container") || null;

  const explicitRegistryFailure = firstEntry(
    entries,
    /pull access denied|unauthorized(?::|.*registry)|authentication required|denied: requested access|manifest unknown|no matching manifest/i,
  );
  const explicitTransportFailure = firstEntry(
    entries,
    /failed to pull|context deadline exceeded|i\/o timeout|connection reset|unexpected eof|tls handshake timeout|temporary failure in name resolution/i,
  );

  const pendingEnd = pullStarted || firstLayer || lastPending;
  const preTransferSeconds = firstPending && pendingEnd
    ? secondsBetween(firstPending.ts, pendingEnd.ts)
    : null;
  const layerTransferSeconds = firstLayer
    ? secondsBetween(firstLayer.ts, (containerStarted || imageReady || entries.at(-1))?.ts)
    : null;

  let phase = "NO_IMAGE_PULL_EVIDENCE";
  if (explicitRegistryFailure) {
    phase = "REGISTRY_AUTH_OR_MANIFEST_FAILURE";
  } else if (explicitTransportFailure) {
    phase = "IMAGE_PULL_TRANSPORT_FAILURE";
  } else if (firstContainerOutput || containerStarted) {
    phase = "CONTAINER_STARTED";
  } else if (imageReady) {
    phase = "IMAGE_READY_AWAITING_CONTAINER_START";
  } else if (firstLayer) {
    phase = "IMAGE_LAYER_TRANSFER_IN_PROGRESS";
  } else if (pullStarted) {
    phase = "IMAGE_PULL_STARTED";
  } else if (firstPending) {
    phase = "IMAGE_PULL_PENDING";
  }

  return {
    phase,
    first_pending_at: firstPending?.ts || null,
    last_pending_at: lastPending?.ts || null,
    pull_started_at: pullStarted?.ts || null,
    first_layer_transfer_at: firstLayer?.ts || null,
    image_ready_at: imageReady?.ts || null,
    container_started_at: containerStarted?.ts || null,
    first_container_output_at: firstContainerOutput?.ts || null,
    pre_transfer_seconds: preTransferSeconds,
    layer_transfer_observed: Boolean(firstLayer),
    layer_transfer_seconds_observed: layerTransferSeconds,
    container_output_observed: Boolean(firstContainerOutput),
    explicit_registry_failure_observed: Boolean(explicitRegistryFailure),
    explicit_transport_failure_observed: Boolean(explicitTransportFailure),
    pre_transfer_stall_observed:
      Number.isFinite(preTransferSeconds) && preTransferSeconds * 1000 >= STALL_THRESHOLD_MS,
  };
}

function classify(entries, timeline, workerStatuses) {
  const lines = entries.map((entry) => entry.line).filter(Boolean);
  const joined = lines.join("\n");
  const causes = [];

  const add = (code, pattern) => {
    if (pattern.test(joined)) causes.push(code);
  };

  if (timeline.explicit_registry_failure_observed) {
    causes.push("IMAGE_PULL_REGISTRY_OR_MANIFEST_FAILURE");
  }
  if (timeline.explicit_transport_failure_observed) {
    causes.push("IMAGE_PULL_TRANSPORT_FAILURE");
  }
  if (timeline.pre_transfer_stall_observed && !timeline.explicit_registry_failure_observed) {
    causes.push("IMAGE_PULL_PRE_TRANSFER_STALL");
  }
  if (
    timeline.phase === "IMAGE_LAYER_TRANSFER_IN_PROGRESS" &&
    Number.isFinite(timeline.layer_transfer_seconds_observed) &&
    timeline.layer_transfer_seconds_observed * 1000 >= STALL_THRESHOLD_MS
  ) {
    causes.push("IMAGE_LAYER_TRANSFER_SLOW_OR_STALLED");
  }

  add(
    "CONTAINER_START_COMMAND_FAILURE",
    /exec format error|executable file not found|permission denied|no such file or directory.*python|failed to start container/i,
  );
  add(
    "CUDA_OR_NVIDIA_RUNTIME_FAILURE",
    /cuda driver version is insufficient|libcuda|libcudnn|cudnn.*error|nvidia.*error|cuda initialization|cuda error/i,
  );
  add(
    "CUDA_FITNESS_CHECK_FAILURE",
    /AVANTIQO_VOICE_TTS_CUDA_REQUIRED|torch\.cuda\.is_available.*false/i,
  );
  add("PYTHON_DEPENDENCY_IMPORT_FAILURE", /ModuleNotFoundError|ImportError|cannot import name/i);
  add("MEMORY_OR_OOM_FAILURE", /out of memory|oom|exit code 137|sigkill|killed process/i);
  add("APPLICATION_STARTUP_EXCEPTION", /Traceback|RuntimeError|Exception:/i);

  const systemStarts = entries.filter(
    (entry) => entry.source === "system" && /start(?:ing|ed)? container/i.test(entry.line),
  ).length;
  const containerLines = entries.filter((entry) => entry.source === "container").length;
  if (systemStarts >= 2 && containerLines === 0) {
    causes.push("CONTAINER_EXITS_BEFORE_PYTHON_OUTPUT");
  }

  if (
    workerStatuses.includes("INITIALIZING") &&
    ["IMAGE_PULL_PENDING", "IMAGE_PULL_STARTED", "IMAGE_LAYER_TRANSFER_IN_PROGRESS"].includes(
      timeline.phase,
    ) &&
    causes.length === 0
  ) {
    causes.push("IMAGE_PULL_IN_PROGRESS");
  }

  return [...new Set(causes)];
}

function relevantEntries(entries) {
  const matched = entries.filter((entry) => signalPatterns.some((pattern) => pattern.test(entry.line)));
  const source = matched.length ? matched : entries;
  return source.slice(-100);
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
const timeline = pullTimeline(allEntries);
const workerStatuses = safeWorkers.map((worker) => worker.status).filter(Boolean);
const causes = classify(allEntries, timeline, workerStatuses);
const signals = relevantEntries(allEntries);

let jobBefore = null;
let jobReadError = null;
let jobAfter = null;
let cancelPerformed = false;
if (jobId) {
  const read = await optionalJsonRequest(
    `${INVOKE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
    managementKey,
  );
  if (read.ok) {
    jobBefore = read.body;
  } else {
    jobReadError = read.error;
  }

  const status = text(jobBefore?.status).toUpperCase();
  if (cancelRequested && status === "IN_QUEUE") {
    await jsonRequest(
      `${INVOKE_BASE}/${encodeURIComponent(endpointId)}/cancel/${encodeURIComponent(jobId)}`,
      managementKey,
      { method: "POST" },
    );
    cancelPerformed = true;
    const afterRead = await optionalJsonRequest(
      `${INVOKE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
      managementKey,
    );
    if (afterRead.ok) jobAfter = afterRead.body;
  }
}

const result = {
  success: true,
  contract: CONTRACT,
  read_only_log_capture: !cancelPerformed,
  mutation_performed: cancelPerformed,
  endpoint_id: endpointId,
  workers: safeWorkers,
  worker_summary: object(workersBody?.summary),
  startup_phase: timeline.phase,
  image_pull_timeline: timeline,
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
        read_error: jobReadError,
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
