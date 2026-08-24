const API_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_CODE_ENGINE_V1";
const EXPECTED_FOUNDATION_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct";
const EXPECTED_RUNTIME_MODEL = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const EXPECTED_QUANTIZATION = "fp8";
const EXPECTED_SERVING_RUNTIME = "vllm";
const EXPECTED_MULTIPROC_METHOD = "spawn";
const EXPECTED_IMAGE = "ghcr.io/churchillkaron/avantiqo-code-worker@sha256:398275050d3f160af627353a02de7e017a1089783c1a8a314b8c51b5bdabdddb";
const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_NO_WORKER_TIMEOUT_MS = 3 * 60 * 1000;
const DEFAULT_DEGRADED_CONTROL_TIMEOUT_MS = 8 * 60 * 1000;
const DEFAULT_COLD_START_TIMEOUT_MS = 12 * 60 * 1000;
const DEFAULT_JOB_TIMEOUT_MS = 15 * 60 * 1000;
const STATUS_POLL_MS = 1000;
const HEARTBEAT_MS = 5000;
const LOG_CAPTURE_INTERVAL_MS = 20_000;
const LOG_CAPTURE_MS = 2500;

function text(value) {
  return String(value ?? "").trim();
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function epochMs(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

async function responseBody(response) {
  return response.json().catch(() => ({}));
}

async function fetchWithTimeout(url, options, label, timeoutMs) {
  try {
    return await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const name = text(error?.name);
    const message = text(error?.message || error);
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error(`${label}_TIMEOUT_AFTER_${timeoutMs}MS`);
    }
    throw new Error(`${label}_FAILED:${message}`);
  }
}

function workerSnapshot(health) {
  const workers = health?.workers || {};
  return {
    idle: Number(workers.idle) || 0,
    initializing: Number(workers.initializing) || 0,
    ready: Number(workers.ready) || 0,
    running: Number(workers.running) || 0,
    throttled: Number(workers.throttled) || 0,
    unhealthy: Number(workers.unhealthy) || 0,
  };
}

function jobSnapshot(health) {
  const jobs = health?.jobs || {};
  return {
    completed: Number(jobs.completed) || 0,
    failed: Number(jobs.failed) || 0,
    in_progress: Number(jobs.in_progress ?? jobs.inProgress) || 0,
    in_queue: Number(jobs.in_queue ?? jobs.inQueue) || 0,
    retried: Number(jobs.retried) || 0,
  };
}

function safeControlWorker(worker = {}) {
  const startedAt = text(worker.startedAt) || null;
  const startedMs = epochMs(startedAt);
  return {
    id: text(worker.id) || null,
    status: text(worker.status).toUpperCase() || null,
    image: text(worker.image) || null,
    version: number(worker.version, null),
    gpu_type_id: text(worker.gpuTypeId) || null,
    data_center_id: text(worker.dataCenterId) || null,
    started_at: startedAt,
    age_seconds: startedMs === null ? null : Math.max(0, Math.round((Date.now() - startedMs) / 1000)),
    is_stale: worker.isStale === true,
  };
}

function activeControlWorkers(body = {}) {
  return list(body?.workers)
    .map(safeControlWorker)
    .filter((worker) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(worker.status));
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
      line: text(parsed?.line ?? parsed?.raw ?? payload),
    };
  } catch {
    return {
      worker_id: workerId,
      source: "unknown",
      ts: null,
      line: payload,
    };
  }
}

function classifyLogEntries(entries) {
  const lines = entries.map((entry) => entry.line);
  const tests = [
    ["AUTH", /pull access denied|unauthorized|authentication required|denied: requested access/i],
    ["MANIFEST", /manifest unknown|no matching manifest|manifest invalid/i],
    ["PULL", /failed to pull|error pulling image|failed resolving source metadata/i],
    ["NETWORK", /context deadline exceeded|i\/o timeout|connection reset|unexpected eof|tls handshake timeout/i],
    ["CONTAINER_START", /failed to start container|container.*exited|error response from daemon/i],
  ];
  const failureCodes = tests
    .filter(([, pattern]) => lines.some((line) => pattern.test(line)))
    .map(([code]) => code);
  return {
    entry_count: entries.length,
    pending_observed: lines.some((line) => /image pull: .*: pending/i.test(line)),
    transfer_observed: lines.some((line) => /Pulling from|Pulling fs layer|Downloading|Download complete|Pull complete|Downloaded newer image|Image is up to date/i.test(line)),
    container_start_observed:
      entries.some((entry) => entry.source === "container") ||
      lines.some((line) => /start(?:ing|ed)? container|container started|docker container start/i.test(line)),
    failure_codes: failureCodes,
  };
}

const apiKey = required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
const existingJobId = text(
  process.env.AVANTIQO_CODE_COLD_START_EXISTING_JOB_ID || process.argv[2],
);
const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
  Accept: "application/json",
};
const requestTimeoutMs = Math.max(
  5000,
  Math.min(
    60_000,
    number(process.env.AVANTIQO_CODE_COLD_START_REQUEST_TIMEOUT_MS, DEFAULT_REQUEST_TIMEOUT_MS),
  ),
);
const noWorkerTimeoutMs = Math.max(
  30_000,
  Math.min(
    10 * 60 * 1000,
    number(process.env.AVANTIQO_CODE_COLD_START_NO_WORKER_TIMEOUT_MS, DEFAULT_NO_WORKER_TIMEOUT_MS),
  ),
);
const degradedControlTimeoutMs = Math.max(
  noWorkerTimeoutMs,
  Math.min(
    15 * 60 * 1000,
    number(
      process.env.AVANTIQO_CODE_COLD_START_DEGRADED_CONTROL_TIMEOUT_MS,
      DEFAULT_DEGRADED_CONTROL_TIMEOUT_MS,
    ),
  ),
);
const coldStartTimeoutMs = Math.max(
  2 * 60 * 1000,
  Math.min(
    20 * 60 * 1000,
    number(process.env.AVANTIQO_CODE_COLD_START_TIMEOUT_MS, DEFAULT_COLD_START_TIMEOUT_MS),
  ),
);
const jobTimeoutMs = Math.max(
  coldStartTimeoutMs,
  Math.min(
    30 * 60 * 1000,
    number(process.env.AVANTIQO_CODE_COLD_START_JOB_TIMEOUT_MS, DEFAULT_JOB_TIMEOUT_MS),
  ),
);

async function healthSnapshot() {
  const response = await fetchWithTimeout(
    `${API_BASE}/${endpointId}/health`,
    { headers },
    "RUNPOD_CODE_COLD_START_HEALTH",
    requestTimeoutMs,
  );
  const body = await responseBody(response);
  if (!response.ok) throw new Error(`RUNPOD_CODE_COLD_START_HEALTH_HTTP_${response.status}`);
  return {
    workers: workerSnapshot(body),
    jobs: jobSnapshot(body),
  };
}

async function jobStatus(jobId) {
  const response = await fetchWithTimeout(
    `${API_BASE}/${endpointId}/status/${encodeURIComponent(jobId)}`,
    { headers },
    "RUNPOD_CODE_COLD_START_STATUS",
    requestTimeoutMs,
  );
  const body = await responseBody(response);
  if (!response.ok) {
    throw new Error(`RUNPOD_CODE_COLD_START_STATUS_HTTP_${response.status}`);
  }
  return body;
}

async function controlWorkerSnapshot() {
  try {
    const response = await fetchWithTimeout(
      `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`,
      { headers },
      "RUNPOD_CODE_COLD_START_WORKERS",
      requestTimeoutMs,
    );
    const body = await responseBody(response);
    if (!response.ok) {
      return {
        available: false,
        http_status: response.status,
        workers: [],
        error: `RUNPOD_CODE_COLD_START_WORKERS_HTTP_${response.status}`,
      };
    }
    return {
      available: true,
      http_status: response.status,
      workers: activeControlWorkers(body),
      error: null,
    };
  } catch (error) {
    return {
      available: false,
      http_status: null,
      workers: [],
      error: text(error?.message || error).slice(0, 500),
    };
  }
}

async function captureWorkerLogs(workerId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOG_CAPTURE_MS);
  const entries = [];
  let buffer = "";
  let responseStatus = null;
  let error = null;
  try {
    const response = await fetch(
      `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers/${encodeURIComponent(workerId)}/logs?tail=500`,
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      },
    );
    responseStatus = response.status;
    if (!response.ok) {
      return {
        response_status: responseStatus,
        classification: classifyLogEntries(entries),
        error: `RUNPOD_CODE_COLD_START_LOG_HTTP_${response.status}`,
      };
    }
    if (!response.body) {
      return {
        response_status: responseStatus,
        classification: classifyLogEntries(entries),
        error: "RUNPOD_CODE_COLD_START_LOG_BODY_REQUIRED",
      };
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
      error = text(captureError?.message || captureError).slice(0, 500);
    }
  } finally {
    clearTimeout(timer);
  }
  if (buffer.trim()) {
    const entry = parseSseFrame(buffer, workerId);
    if (entry) entries.push(entry);
  }
  return {
    response_status: responseStatus,
    classification: classifyLogEntries(entries),
    error,
  };
}

async function cancelJob(jobId, reason) {
  try {
    const response = await fetchWithTimeout(
      `${API_BASE}/${endpointId}/cancel/${jobId}`,
      { method: "POST", headers },
      "RUNPOD_CODE_COLD_START_CANCEL",
      requestTimeoutMs,
    );
    const body = await responseBody(response);
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_COLD_START_CANCELLED",
      job_id: jobId,
      reason,
      http_status: response.status,
      runpod_status: text(body?.status),
      generation_performed: false,
    }));
  } catch (error) {
    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_COLD_START_CANCEL_FAILED",
      job_id: jobId,
      reason,
      error: text(error?.message || error),
      generation_performed: false,
    }));
  }
}

let body = null;
let jobId = existingJobId;
let attachedToExistingJob = Boolean(existingJobId);

if (attachedToExistingJob) {
  body = await jobStatus(jobId);
  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_COLD_START_ATTACHED_TO_EXISTING_JOB",
    job_id: jobId,
    status: text(body?.status).toUpperCase() || null,
    provider_job_submitted: false,
    generation_performed: false,
  }));
} else {
  const initial = await healthSnapshot();
  if (initial.jobs.in_progress > 0 || initial.jobs.in_queue > 0) {
    throw new Error(
      `AVANTIQO_CODE_COLD_START_EXISTING_JOB_BLOCK:in_queue=${initial.jobs.in_queue}:in_progress=${initial.jobs.in_progress}`,
    );
  }

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_COLD_START_PROBE_START",
    contract: "AVANTIQO_CODE_COLD_START_PROBE_V2",
    endpoint_id: endpointId,
    expected_image: EXPECTED_IMAGE,
    initial_health: initial,
    provider_job_submitted: false,
    generation_performed: false,
    production_deploy_performed: false,
    secrets_in_output: false,
  }));

  const submitResponse = await fetchWithTimeout(
    `${API_BASE}/${endpointId}/run`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        input: {
          contract: CONTRACT,
          capability: "ai.code.debug",
          foundation_model: EXPECTED_FOUNDATION_MODEL,
          organization_id: "benchmark-only",
          organization_service_id: "benchmark-only",
          usage_id: `code-cold-start-probe-${Date.now()}`,
          instruction: "Report the deployed Avantiqo Code runtime metadata only.",
          structured_specification: {
            runtime_probe: true,
            purpose: "DEPLOYED_RUNTIME_COLD_START_PROBE",
          },
        },
      }),
    },
    "RUNPOD_CODE_COLD_START_SUBMIT",
    requestTimeoutMs,
  );
  body = await responseBody(submitResponse);
  if (!submitResponse.ok) {
    throw new Error(
      `RUNPOD_CODE_COLD_START_SUBMIT_HTTP_${submitResponse.status}:${text(body?.error || body?.message)}`,
    );
  }
  jobId = text(body?.id);
  if (!jobId) throw new Error("AVANTIQO_CODE_COLD_START_JOB_ID_REQUIRED");

  console.log(JSON.stringify({
    event: "AVANTIQO_CODE_COLD_START_SUBMITTED",
    job_id: jobId,
    provider_job_submitted: true,
    generation_performed: false,
  }));
}

const startedAt = Date.now();
const overallDeadline = startedAt + jobTimeoutMs;
let lastHeartbeatAt = 0;
let lastLogCaptureAt = 0;
let startupObservedAt = null;
let lastActiveWorkers = [];
let lastLogEvidence = null;
let lastStatus = text(body?.status).toUpperCase();
let controlAvailableEver = false;
let controlUnavailableCount = 0;
let lastControlError = null;

while (Date.now() < overallDeadline) {
  const status = text(body?.status).toUpperCase();
  lastStatus = status;
  if (status === "COMPLETED") break;
  if (["FAILED", "CANCELLED", "TIMED_OUT"].includes(status)) {
    throw new Error(`RUNPOD_CODE_COLD_START_JOB_${status}:${text(body?.error || body?.message)}`);
  }

  const now = Date.now();
  if (now - lastHeartbeatAt >= HEARTBEAT_MS) {
    const [health, control] = await Promise.all([
      healthSnapshot(),
      controlWorkerSnapshot(),
    ]);
    const activeWorkers = control.workers;
    lastActiveWorkers = activeWorkers;
    if (control.available) {
      controlAvailableEver = true;
    } else {
      controlUnavailableCount += 1;
      lastControlError = control.error;
    }

    if (activeWorkers.length > 0 && startupObservedAt === null) {
      startupObservedAt = now;
    }

    for (const worker of activeWorkers) {
      if (worker.image && worker.image !== EXPECTED_IMAGE) {
        await cancelJob(jobId, "WORKER_IMAGE_MISMATCH");
        throw new Error(
          `AVANTIQO_CODE_COLD_START_WORKER_IMAGE_MISMATCH:expected=${EXPECTED_IMAGE}:actual=${worker.image}`,
        );
      }
    }

    if (activeWorkers.length > 0 && now - lastLogCaptureAt >= LOG_CAPTURE_INTERVAL_MS) {
      const worker = activeWorkers[0];
      lastLogEvidence = await captureWorkerLogs(worker.id);
      lastLogCaptureAt = Date.now();
      console.log(JSON.stringify({
        event: "AVANTIQO_CODE_COLD_START_WORKER_LOG_EVIDENCE",
        job_id: jobId,
        worker,
        logs: lastLogEvidence,
        generation_performed: false,
      }));
      if (lastLogEvidence?.classification?.failure_codes?.length) {
        await cancelJob(
          jobId,
          `WORKER_START_FAILURE_${lastLogEvidence.classification.failure_codes.join("_")}`,
        );
        throw new Error(
          `AVANTIQO_CODE_COLD_START_WORKER_START_FAILED:${lastLogEvidence.classification.failure_codes.join(",")}`,
        );
      }
    }

    console.log(JSON.stringify({
      event: "AVANTIQO_CODE_COLD_START_PROGRESS",
      job_id: jobId,
      status,
      elapsed_seconds: Math.round((now - startedAt) / 1000),
      attached_to_existing_job: attachedToExistingJob,
      startup_observed: startupObservedAt !== null,
      seconds_since_startup_observed:
        startupObservedAt === null ? null : Math.round((now - startupObservedAt) / 1000),
      health,
      control_plane: {
        available: control.available,
        http_status: control.http_status,
        unavailable_count: controlUnavailableCount,
        error: control.error,
      },
      active_control_workers: activeWorkers,
      last_log_classification: lastLogEvidence?.classification || null,
      generation_performed: false,
    }));
    lastHeartbeatAt = now;

    if (status === "IN_QUEUE" && startupObservedAt === null) {
      const noWorkerLimit = control.available ? noWorkerTimeoutMs : degradedControlTimeoutMs;
      if (now - startedAt >= noWorkerLimit) {
        await cancelJob(
          jobId,
          `${control.available ? "NO_WORKER_ASSIGNED" : "CONTROL_UNAVAILABLE_NO_ACCEPTANCE"}_${noWorkerLimit}MS`,
        );
        throw new Error(
          `AVANTIQO_CODE_COLD_START_NO_WORKER_ACCEPTANCE:${jobId}:${noWorkerLimit}MS:control_available=${control.available}:last_control_error=${lastControlError || "none"}`,
        );
      }
    }

    if (
      status === "IN_QUEUE" &&
      startupObservedAt !== null &&
      now - startupObservedAt >= coldStartTimeoutMs
    ) {
      await cancelJob(jobId, `COLD_START_TIMEOUT_${coldStartTimeoutMs}MS`);
      throw new Error(
        `AVANTIQO_CODE_COLD_START_TIMEOUT:${jobId}:${coldStartTimeoutMs}MS:${JSON.stringify(lastLogEvidence?.classification || {})}`,
      );
    }
  }

  await delay(STATUS_POLL_MS);
  body = await jobStatus(jobId);
}

if (text(body?.status).toUpperCase() !== "COMPLETED") {
  await cancelJob(jobId, `JOB_TIMEOUT_${jobTimeoutMs}MS`);
  throw new Error(
    `AVANTIQO_CODE_COLD_START_JOB_TIMEOUT:${jobId}:${jobTimeoutMs}MS:last_status=${lastStatus}`,
  );
}

const output = body?.output || {};
const checks = {
  output_status: text(output.status) === "runtime_probe",
  provider: text(output.provider) === "avantiqo-code",
  contract: text(output.engine_contract) === CONTRACT,
  foundation_model: text(output.foundation_model) === EXPECTED_FOUNDATION_MODEL,
  runtime_model: text(output.runtime_model) === EXPECTED_RUNTIME_MODEL,
  serving_runtime: text(output.serving_runtime).toLowerCase() === EXPECTED_SERVING_RUNTIME,
  quantization: text(output.quantization).toLowerCase() === EXPECTED_QUANTIZATION,
  cached_model_found: output.cached_model_found === true,
  multiproc_method:
    text(output.vllm_worker_multiproc_method).toLowerCase() === EXPECTED_MULTIPROC_METHOD,
  flashinfer_sampler_disabled: output.flashinfer_sampler_disabled === true,
  raw_reasoning_boundary: output.raw_reasoning_persisted === false,
};
const passed = Object.values(checks).every(Boolean);

console.log(JSON.stringify({
  success: passed,
  contract: "AVANTIQO_CODE_COLD_START_PROBE_V2",
  endpoint_id: endpointId,
  expected_image: EXPECTED_IMAGE,
  job_id: jobId,
  attached_to_existing_job: attachedToExistingJob,
  wall_ms: Date.now() - startedAt,
  delay_ms: Number(body?.delayTime) || null,
  execution_ms: Number(body?.executionTime) || null,
  startup_observed: startupObservedAt !== null,
  control_plane_available_ever: controlAvailableEver,
  control_plane_unavailable_count: controlUnavailableCount,
  last_control_error: lastControlError,
  last_active_control_workers: lastActiveWorkers,
  last_log_evidence: lastLogEvidence,
  checks,
  output,
  provider_job_submitted: !attachedToExistingJob,
  generation_performed: false,
  production_deploy_performed: false,
  secrets_in_output: false,
  next_action: passed ? "RUN_ONE_BOUNDED_REAL_CODE_INFERENCE" : "REPAIR_COLD_START_BEFORE_INFERENCE",
}, null, 2));

if (!passed) process.exitCode = 1;
