import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_STUCK_WORKER_RECYCLE_V1";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const REQUIRED_CUDA = "12.4";
const STALL_THRESHOLD_MS = Math.max(
  120_000,
  Number(process.env.AVANTIQO_VOICE_TTS_STUCK_WORKER_STALL_THRESHOLD_MS || 5 * 60 * 1000),
);
const LOG_CAPTURE_MS = Math.max(
  2_000,
  Math.min(15_000, Number(process.env.AVANTIQO_VOICE_TTS_STUCK_WORKER_LOG_CAPTURE_MS || 5_000)),
);
const DRAIN_TIMEOUT_MS = Math.max(
  30_000,
  Math.min(10 * 60 * 1000, Number(process.env.AVANTIQO_VOICE_TTS_STUCK_WORKER_DRAIN_TIMEOUT_MS || 3 * 60 * 1000)),
);
const POLL_MS = 3_000;
const REQUIRED_STABLE_DRAIN_OBSERVATIONS = 2;

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((entry, index) => entry === b[index]);
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function epochMs(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

async function readJsonResponse(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function rest(pathname, credential, options = {}) {
  return readJsonResponse(await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "RUNPOD_REST");
}

async function queueHealth(endpointId, credential) {
  return readJsonResponse(await fetch(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
    {
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  ), "RUNPOD_QUEUE");
}

async function controlWorkers(endpointId, credential) {
  return readJsonResponse(await fetch(
    `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`,
    {
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  ), "RUNPOD_CONTROL_WORKERS");
}

async function endpointBoundTemplates(managementKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_TEMPLATE_ID_REQUIRED");
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VOICE_TTS_RECYCLE_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`);
  }
  return matches[0];
}

async function readEndpointState(endpointId, managementKey) {
  const [endpoint, templates] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    endpointBoundTemplates(managementKey),
  ]);
  return { endpoint, template: resolveTemplate(endpoint, templates) };
}

function healthCounters(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      retried: finite(jobs.retried, 0),
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

function managementWorkerSummary(endpoint = {}) {
  const workers = list(endpoint.workers).map((worker) => ({
    id: text(worker?.id) || null,
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    status: text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase() || null,
  }));
  const nonExited = workers.filter((worker) => worker.desired_status !== "EXITED");
  return {
    worker_count: workers.length,
    workers,
    all_workers_desired_exited: workers.length === 0 || nonExited.length === 0,
    non_exited_worker_count: nonExited.length,
  };
}

function safeWorker(worker = {}) {
  const startedAt = text(worker.startedAt) || null;
  const startedMs = epochMs(startedAt);
  return {
    id: text(worker.id) || null,
    status: text(worker.status).toUpperCase() || null,
    image: text(worker.image) || null,
    version: finite(worker.version),
    gpu_type_id: text(worker.gpuTypeId) || null,
    data_center_id: text(worker.dataCenterId) || null,
    started_at: startedAt,
    age_seconds: startedMs === null ? null : Math.max(0, Math.round((Date.now() - startedMs) / 1000)),
    is_stale: worker.isStale === true,
  };
}

function safeWorkers(body = {}) {
  return list(body?.workers).map(safeWorker);
}

function activeControlWorkers(body = {}) {
  return safeWorkers(body).filter(
    (worker) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(worker.status),
  );
}

function safeEndpoint(endpoint = {}, template = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    template_image: text(template.imageName) || null,
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)),
    data_center_ids: unique(list(endpoint.dataCenterIds)),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true,
  };
}

function stableEndpoint(endpoint = {}, template = {}) {
  const safe = safeEndpoint(endpoint, template);
  return {
    id: safe.id,
    name: safe.name,
    template_id: safe.template_id,
    template_image: safe.template_image,
    min_cuda_version: safe.min_cuda_version,
    gpu_type_ids: safe.gpu_type_ids,
    data_center_ids: safe.data_center_ids,
    idle_timeout_seconds: safe.idle_timeout_seconds,
    execution_timeout_ms: safe.execution_timeout_ms,
    flashboot: safe.flashboot,
  };
}

function assertStableEndpoint(before, after) {
  if (before.id !== after.id || before.name !== after.name) {
    throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_ENDPOINT_IDENTITY_CHANGED");
  }
  if (before.template_id !== after.template_id || before.template_image !== after.template_image) {
    throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_TEMPLATE_OR_IMAGE_CHANGED");
  }
  if (before.min_cuda_version !== after.min_cuda_version) {
    throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_CUDA_CHANGED");
  }
  if (!sameSet(before.gpu_type_ids, after.gpu_type_ids)) {
    throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_GPU_POOL_CHANGED");
  }
  if (!sameSet(before.data_center_ids, after.data_center_ids)) {
    throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_DATACENTERS_CHANGED");
  }
  for (const key of ["idle_timeout_seconds", "execution_timeout_ms", "flashboot"]) {
    if (before[key] !== after[key]) {
      throw new Error(`AVANTIQO_VOICE_TTS_RECYCLE_UNRELATED_ENDPOINT_FIELD_CHANGED:${key}`);
    }
  }
}

function assertNoJobsOrExecution(health) {
  if (health.jobs.in_queue || health.jobs.in_progress) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_RECYCLE_BLOCKED_JOBS:in_queue=${health.jobs.in_queue}:in_progress=${health.jobs.in_progress}`,
    );
  }
  if (health.workers.running || health.workers.throttled) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_RECYCLE_BLOCKED_EXECUTION:running=${health.workers.running}:throttled=${health.workers.throttled}`,
    );
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
      line: text(parsed?.line ?? parsed?.raw ?? payload).slice(0, 4000),
    };
  } catch {
    return {
      worker_id: workerId,
      source: "unknown",
      ts: null,
      line: payload.slice(0, 4000),
    };
  }
}

async function captureWorkerLogs(endpointId, workerId, credential) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOG_CAPTURE_MS);
  const entries = [];
  let responseStatus = null;
  let error = null;
  let buffer = "";

  try {
    const response = await fetch(
      `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers/${encodeURIComponent(workerId)}/logs?tail=500`,
      {
        headers: {
          Authorization: `Bearer ${credential}`,
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      },
    );
    responseStatus = response.status;
    if (!response.ok) {
      error = `RUNPOD_LOG_HTTP_${response.status}:${(await response.text()).slice(0, 700)}`;
      return { response_status: responseStatus, entries, error };
    }
    if (!response.body) {
      return { response_status: responseStatus, entries, error: "RUNPOD_LOG_STREAM_BODY_REQUIRED" };
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
      error = text(captureError?.message || captureError).slice(0, 700);
    }
  } finally {
    clearTimeout(timer);
  }

  if (buffer.trim()) {
    const entry = parseSseFrame(buffer, workerId);
    if (entry) entries.push(entry);
  }
  return { response_status: responseStatus, entries, error };
}

function stallEvidence(entries, expectedImage) {
  const pending = entries.filter(
    (entry) => /image pull: .*: pending/i.test(entry.line) && entry.line.includes(expectedImage),
  );
  const first = pending[0] || null;
  const last = pending.at(-1) || null;
  const firstMs = epochMs(first?.ts);
  const lastMs = epochMs(last?.ts);
  const pendingSeconds = firstMs !== null && lastMs !== null && lastMs >= firstMs
    ? Math.round((lastMs - firstMs) / 1000)
    : null;
  const transferObserved = entries.some((entry) =>
    /\bPulling from\b|Pulling fs layer|Downloading|Download complete|Pull complete|Downloaded newer image|Image is up to date/i.test(entry.line),
  );
  const containerStartObserved = entries.some((entry) =>
    entry.source === "container" || /start(?:ing|ed)? container|container started|docker container start/i.test(entry.line),
  );
  const explicitFailureObserved = entries.some((entry) =>
    /pull access denied|unauthorized|authentication required|manifest unknown|no matching manifest|failed to pull|context deadline exceeded|i\/o timeout|connection reset|unexpected eof|tls handshake timeout/i.test(entry.line),
  );
  return {
    confirmed:
      pending.length >= 2 &&
      Number.isFinite(pendingSeconds) &&
      pendingSeconds * 1000 >= STALL_THRESHOLD_MS &&
      !transferObserved &&
      !containerStartObserved &&
      !explicitFailureObserved,
    pending_entry_count: pending.length,
    first_pending_at: first?.ts || null,
    last_pending_at: last?.ts || null,
    pending_seconds: pendingSeconds,
    transfer_observed: transferObserved,
    container_start_observed: containerStartObserved,
    explicit_failure_observed: explicitFailureObserved,
  };
}

async function expectedImageEvidence() {
  const parsed = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  const tts = object(parsed.tts);
  if (
    parsed?.success !== true ||
    parsed?.contract !== "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1" ||
    tts?.success !== true ||
    tts?.source_sha_matches_trigger !== true ||
    tts?.startup_probe_outcome !== "success" ||
    tts?.container_startup_probe_passed_by_github_build !== true ||
    tts?.bootstrap_breadcrumb_baked !== true ||
    text(tts.image_platform) !== "linux/amd64" ||
    text(tts.cuda_runtime_expected) !== REQUIRED_CUDA
  ) {
    throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_IMAGE_EVIDENCE_INVALID");
  }
  const image = text(tts.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_IMAGE_REFERENCE_INVALID");
  }
  return {
    image,
    source_sha: text(tts.source_sha),
    github_run_id: text(parsed.github_run_id) || null,
  };
}

async function waitForManagementDrain(endpointId, managementKey) {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  let stable = 0;
  let latest = null;

  while (Date.now() < deadline) {
    const [state, healthRaw, controlRaw] = await Promise.all([
      readEndpointState(endpointId, managementKey),
      queueHealth(endpointId, managementKey),
      controlWorkers(endpointId, managementKey),
    ]);
    const management = managementWorkerSummary(state.endpoint);
    const health = healthCounters(healthRaw);
    const control = activeControlWorkers(controlRaw);
    const drained =
      health.jobs.in_queue === 0 &&
      health.jobs.in_progress === 0 &&
      health.workers.running === 0 &&
      health.workers.unhealthy === 0 &&
      management.all_workers_desired_exited;

    latest = {
      endpoint: safeEndpoint(state.endpoint, state.template),
      management,
      health,
      active_control_workers: control,
      management_plane_authoritative: true,
      health_initializing_ignored_when_management_desired_exited: management.all_workers_desired_exited,
      health_throttled_ignored_when_management_desired_exited: management.all_workers_desired_exited,
      drained_candidate: drained,
    };

    if (drained) {
      stable += 1;
      if (stable >= REQUIRED_STABLE_DRAIN_OBSERVATIONS) return { stable_observations: stable, snapshot: latest };
    } else {
      stable = 0;
    }
    await sleep(POLL_MS);
  }

  throw new Error(`AVANTIQO_VOICE_TTS_RECYCLE_DRAIN_TIMEOUT:${JSON.stringify(latest)}`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_VOICE_TTS_STUCK_WORKER_RECYCLE_APPROVED).toUpperCase() === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_VOICE_TTS_STUCK_WORKER_RECYCLE_APPROVED=YES_REQUIRED");
}

const expected = await expectedImageEvidence();
const [state, healthRaw, controlRaw] = await Promise.all([
  readEndpointState(endpointId, managementKey),
  queueHealth(endpointId, managementKey),
  controlWorkers(endpointId, managementKey),
]);
const endpoint = state.endpoint;
const template = state.template;
if (text(endpoint.id) !== endpointId || text(endpoint.name) !== ENDPOINT_NAME) {
  throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_ENDPOINT_BINDING_MISMATCH");
}
if (text(template.imageName) !== expected.image) {
  throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_ENDPOINT_IMAGE_MISMATCH");
}
if (text(endpoint.minCudaVersion) !== REQUIRED_CUDA) {
  throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_ENDPOINT_CUDA_MISMATCH");
}
if (finite(endpoint.workersMin, 0) !== 0 || finite(endpoint.workersMax, 0) !== 1) {
  throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_ENDPOINT_SCALING_BASELINE_MISMATCH");
}
const health = healthCounters(healthRaw);
assertNoJobsOrExecution(health);
const workers = activeControlWorkers(controlRaw);
const candidates = workers.filter(
  (worker) => worker.status === "INITIALIZING" && worker.image === expected.image,
);
if (workers.length !== 1 || candidates.length !== 1) {
  throw new Error(`AVANTIQO_VOICE_TTS_RECYCLE_WORKER_SET_UNSAFE:active=${workers.length}:candidates=${candidates.length}`);
}
const stalledWorker = candidates[0];
const logs = await captureWorkerLogs(endpointId, stalledWorker.id, managementKey);
if (logs.error) throw new Error(`AVANTIQO_VOICE_TTS_RECYCLE_LOG_CAPTURE_FAILED:${logs.error}`);
const stall = stallEvidence(logs.entries, expected.image);
if (!stall.confirmed) {
  throw new Error(
    `AVANTIQO_VOICE_TTS_RECYCLE_STALL_NOT_CONFIRMED:pending=${stall.pending_entry_count}:seconds=${stall.pending_seconds}:transfer=${stall.transfer_observed}:container=${stall.container_start_observed}:failure=${stall.explicit_failure_observed}`,
  );
}

const baseline = stableEndpoint(endpoint, template);
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint: safeEndpoint(endpoint, template),
  health,
  management_workers: managementWorkerSummary(endpoint),
  stalled_worker: stalledWorker,
  image_pull_stall: stall,
  expected_image: expected,
  recovery_pattern: {
    code_pause_resume: "PATCH_WORKERS_MAX_0_DRAIN_THEN_RESTORE_1",
    audio_drain_authority: "MANAGEMENT_DESIRED_STATUS_EXITED",
    image_scheduler_policy: "DO_NOT_PIN_EPHEMERAL_CAPACITY_SNAPSHOT",
  },
  preserve_data_center_ids_exactly: baseline.data_center_ids,
  preserve_gpu_type_ids_exactly: baseline.gpu_type_ids,
  capacity_snapshot_required: false,
  mutation_required: true,
  mutation_performed: false,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  next_action: apply ? "RECYCLE_STUCK_WORKER" : "APPLY_STUCK_WORKER_RECYCLE",
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const [freshState, freshHealthRaw, freshControlRaw] = await Promise.all([
  readEndpointState(endpointId, managementKey),
  queueHealth(endpointId, managementKey),
  controlWorkers(endpointId, managementKey),
]);
assertStableEndpoint(baseline, stableEndpoint(freshState.endpoint, freshState.template));
if (finite(freshState.endpoint.workersMin, 0) !== 0 || finite(freshState.endpoint.workersMax, 0) !== 1) {
  throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_ENDPOINT_SCALING_CHANGED_REPLAN_REQUIRED");
}
const freshHealth = healthCounters(freshHealthRaw);
assertNoJobsOrExecution(freshHealth);
const freshWorkers = activeControlWorkers(freshControlRaw);
if (
  freshWorkers.length !== 1 ||
  freshWorkers[0].id !== stalledWorker.id ||
  freshWorkers[0].status !== "INITIALIZING" ||
  freshWorkers[0].image !== expected.image
) {
  throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_WORKER_CHANGED_REPLAN_REQUIRED");
}
const freshLogs = await captureWorkerLogs(endpointId, stalledWorker.id, managementKey);
if (freshLogs.error) throw new Error(`AVANTIQO_VOICE_TTS_RECYCLE_RECHECK_LOG_CAPTURE_FAILED:${freshLogs.error}`);
const freshStall = stallEvidence(freshLogs.entries, expected.image);
if (!freshStall.confirmed) {
  throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_STALL_RESOLVED_OR_CHANGED_REPLAN_REQUIRED");
}

let paused = false;
let drain = null;
let restored = false;
let rollbackAttempted = false;
let rollbackSucceeded = false;
try {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 0 },
  });
  paused = true;
  drain = await waitForManagementDrain(endpointId, managementKey);

  const pausedState = await readEndpointState(endpointId, managementKey);
  assertStableEndpoint(baseline, stableEndpoint(pausedState.endpoint, pausedState.template));
  if (finite(pausedState.endpoint.workersMin, 0) !== 0 || finite(pausedState.endpoint.workersMax, 0) !== 0) {
    throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_PAUSED_SCALING_VERIFY_FAILED");
  }

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 1 },
  });
  restored = true;
} catch (error) {
  if (paused && !restored) {
    rollbackAttempted = true;
    try {
      await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: { workersMin: 0, workersMax: 1 },
      });
      rollbackSucceeded = true;
    } catch {
      rollbackSucceeded = false;
    }
  }
  throw new Error(
    `${text(error?.message || error)}:rollback_attempted=${rollbackAttempted}:rollback_succeeded=${rollbackSucceeded}`,
  );
}

const [verifiedState, verifiedHealthRaw, verifiedControlRaw] = await Promise.all([
  readEndpointState(endpointId, managementKey),
  queueHealth(endpointId, managementKey),
  controlWorkers(endpointId, managementKey),
]);
assertStableEndpoint(baseline, stableEndpoint(verifiedState.endpoint, verifiedState.template));
if (finite(verifiedState.endpoint.workersMin, 0) !== 0 || finite(verifiedState.endpoint.workersMax, 0) !== 1) {
  throw new Error("AVANTIQO_VOICE_TTS_RECYCLE_RESTORE_SCALING_VERIFY_FAILED");
}
const verifiedHealth = healthCounters(verifiedHealthRaw);
assertNoJobsOrExecution(verifiedHealth);
const verifiedControlWorkers = activeControlWorkers(verifiedControlRaw);
const oldWorkerStillVisible = verifiedControlWorkers.some((worker) => worker.id === stalledWorker.id);
const verifiedManagement = managementWorkerSummary(verifiedState.endpoint);

console.log(JSON.stringify({
  ...plan,
  success: true,
  mode: "APPLY",
  endpoint: safeEndpoint(verifiedState.endpoint, verifiedState.template),
  health_after: verifiedHealth,
  management_workers_after: verifiedManagement,
  active_control_workers_after: verifiedControlWorkers,
  mutation_performed: true,
  endpoint_paused: paused,
  management_drain_confirmed: Boolean(drain),
  stable_drain_observations: drain?.stable_observations || 0,
  drain_snapshot: drain?.snapshot || null,
  endpoint_restored: restored,
  old_worker_still_visible_in_control_plane: oldWorkerStillVisible,
  old_worker_management_exit_authoritative: true,
  data_center_ids_changed: false,
  gpu_type_ids_changed: false,
  rollback_attempted: rollbackAttempted,
  rollback_succeeded: rollbackSucceeded,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  next_action: "RUN_ONE_CONTROLLED_TTS_SMOKE_TO_TRIGGER_FRESH_GLOBAL_SCHEDULER_PLACEMENT",
}, null, 2));