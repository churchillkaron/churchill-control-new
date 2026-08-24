import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_VOICE_TTS_PULL_STALL_RELOCATION_V2";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const REQUIRED_CUDA = "12.4";
const DESIRED_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA L4",
  "NVIDIA RTX A5000",
  "NVIDIA GeForce RTX 3090",
]);
const STALL_THRESHOLD_MS = Math.max(
  120_000,
  Number(process.env.AVANTIQO_VOICE_TTS_PULL_STALL_THRESHOLD_MS || 5 * 60 * 1000),
);
const LOG_CAPTURE_MS = Math.max(
  2_000,
  Math.min(15_000, Number(process.env.AVANTIQO_VOICE_TTS_PULL_STALL_LOG_CAPTURE_MS || 5_000)),
);
const DRAIN_TIMEOUT_MS = Math.max(
  30_000,
  Math.min(5 * 60 * 1000, Number(process.env.AVANTIQO_VOICE_TTS_PULL_STALL_DRAIN_TIMEOUT_MS || 2 * 60 * 1000)),
);
const POLL_MS = 3_000;
const MAX_TARGET_DATACENTERS = 3;

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

function workerAgeSeconds(worker) {
  const started = epochMs(worker?.startedAt);
  return started === null ? null : Math.max(0, Math.round((Date.now() - started) / 1000));
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

function stockRank(value) {
  const status = text(value).toUpperCase();
  if (status === "HIGH") return 4;
  if (status === "MEDIUM") return 3;
  if (status === "LOW") return 2;
  if (status && status !== "NONE" && status !== "UNAVAILABLE") return 1;
  return 0;
}

function gpuPreference(gpuTypeId) {
  const index = DESIRED_GPU_TYPE_IDS.indexOf(text(gpuTypeId));
  return index === -1 ? 999 : index;
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

async function queue(endpointId, credential, pathname = "/health") {
  return readJsonResponse(await fetch(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`,
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
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_TEMPLATE_ID_REQUIRED");
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_PULL_STALL_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`,
    );
  }
  return matches[0];
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
  let buffer = "";
  let responseStatus = null;
  let error = null;

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

function safeWorker(worker = {}) {
  return {
    id: text(worker.id) || null,
    status: text(worker.status).toUpperCase() || null,
    image: text(worker.image) || null,
    version: finite(worker.version),
    gpu_type_id: text(worker.gpuTypeId) || null,
    data_center_id: text(worker.dataCenterId) || null,
    started_at: text(worker.startedAt) || null,
    age_seconds: workerAgeSeconds(worker),
    is_stale: worker.isStale === true,
  };
}

function safeWorkers(body = {}) {
  return list(body?.workers).map(safeWorker);
}

function activeWorkers(body = {}) {
  return safeWorkers(body).filter(
    (worker) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(worker.status),
  );
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

function assertNoJobsOrExecution(health) {
  if (health.jobs.in_queue || health.jobs.in_progress) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_PULL_STALL_RELOCATION_BLOCKED_JOBS:in_queue=${health.jobs.in_queue}:in_progress=${health.jobs.in_progress}`,
    );
  }
  if (health.workers.running || health.workers.throttled) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_PULL_STALL_RELOCATION_BLOCKED_EXECUTION:running=${health.workers.running}:throttled=${health.workers.throttled}`,
    );
  }
}

function stallEvidence(entries, expectedImage) {
  const matchingPending = entries.filter(
    (entry) => /image pull: .*: pending/i.test(entry.line) && entry.line.includes(expectedImage),
  );
  const firstPending = matchingPending[0] || null;
  const lastPending = matchingPending.at(-1) || null;
  const firstMs = epochMs(firstPending?.ts);
  const lastMs = epochMs(lastPending?.ts);
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
  const confirmed =
    matchingPending.length >= 2 &&
    Number.isFinite(pendingSeconds) &&
    pendingSeconds * 1000 >= STALL_THRESHOLD_MS &&
    !transferObserved &&
    !containerStartObserved &&
    !explicitFailureObserved;
  return {
    confirmed,
    pending_entry_count: matchingPending.length,
    first_pending_at: firstPending?.ts || null,
    last_pending_at: lastPending?.ts || null,
    pending_seconds: pendingSeconds,
    transfer_observed: transferObserved,
    container_start_observed: containerStartObserved,
    explicit_failure_observed: explicitFailureObserved,
  };
}

async function readExpectedImage() {
  const evidence = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  const tts = object(evidence.tts);
  if (
    evidence?.success !== true ||
    evidence?.contract !== "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1" ||
    tts?.success !== true ||
    tts?.source_sha_matches_trigger !== true ||
    tts?.startup_probe_outcome !== "success" ||
    tts?.container_startup_probe_passed_by_github_build !== true ||
    tts?.bootstrap_breadcrumb_baked !== true ||
    text(tts?.image_platform) !== "linux/amd64" ||
    text(tts?.cuda_runtime_expected) !== REQUIRED_CUDA
  ) {
    throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_IMAGE_EVIDENCE_INVALID");
  }
  const image = text(tts.immutable_image_reference);
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_IMAGE_REFERENCE_INVALID");
  }
  return {
    image,
    source_sha: text(tts.source_sha),
    github_run_id: text(evidence.github_run_id) || null,
  };
}

async function discoverCapacity(managementKey) {
  const queryText = `
    query AvantiqoVoiceTtsPullStallCapacity($input: GpuAvailabilityInput) {
      dataCenters {
        id
        name
        location
        gpuAvailability(input: $input) {
          available
          stockStatus
          gpuTypeId
          gpuTypeDisplayName
          displayName
        }
      }
    }
  `;
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query: queryText,
      variables: {
        input: {
          gpuCount: 1,
          minDisk: 5,
          minMemoryInGb: 20,
          secureCloud: true,
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 1000);
    throw new Error(`AVANTIQO_VOICE_TTS_PULL_STALL_CAPACITY_DISCOVERY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.dataCenters;
}

function capacityPlan(dataCenters, excludedDataCenterId) {
  const regions = list(dataCenters)
    .map((dc) => {
      const rows = list(dc?.gpuAvailability)
        .filter((gpu) => DESIRED_GPU_TYPE_IDS.includes(text(gpu?.gpuTypeId)))
        .filter((gpu) => gpu?.available !== false)
        .map((gpu) => ({
          gpu_type_id: text(gpu?.gpuTypeId),
          display_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName || gpu?.gpuTypeId),
          stock_status: text(gpu?.stockStatus) || "UNAVAILABLE",
          stock_rank: stockRank(gpu?.stockStatus),
          preference: gpuPreference(gpu?.gpuTypeId),
        }))
        .filter((gpu) => gpu.stock_rank > 0)
        .sort((left, right) =>
          right.stock_rank - left.stock_rank || left.preference - right.preference,
        );
      return {
        data_center_id: text(dc?.id) || null,
        name: text(dc?.name) || null,
        location: text(dc?.location) || null,
        gpu_pool: rows,
        best_stock_rank: rows[0]?.stock_rank || 0,
        best_gpu_preference: rows[0]?.preference ?? 999,
      };
    })
    .filter((region) => region.data_center_id && region.data_center_id !== excludedDataCenterId)
    .filter((region) => region.gpu_pool.length)
    .sort((left, right) =>
      right.best_stock_rank - left.best_stock_rank ||
      left.best_gpu_preference - right.best_gpu_preference ||
      left.data_center_id.localeCompare(right.data_center_id),
    );

  const selected = regions.slice(0, MAX_TARGET_DATACENTERS);
  return {
    selected_data_center_ids: selected.map((region) => region.data_center_id),
    selected_regions: selected,
    available_region_count: regions.length,
    available_regions: regions.slice(0, 12),
  };
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
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true,
  };
}

function assertEndpointBaseline(endpoint, template, endpointId, expectedImage) {
  if (text(endpoint.id) !== endpointId || text(endpoint.name) !== ENDPOINT_NAME) {
    throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_ENDPOINT_BINDING_MISMATCH");
  }
  const templateId = text(endpoint.templateId || endpoint.template?.id);
  if (!templateId || text(template.id) !== templateId) {
    throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_ENDPOINT_TEMPLATE_BINDING_MISMATCH");
  }
  if (text(template.imageName) !== expectedImage) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_PULL_STALL_ENDPOINT_IMAGE_MISMATCH:template=${text(template.imageName) || "missing"}:expected=${expectedImage}`,
    );
  }
  if (text(endpoint.minCudaVersion) !== REQUIRED_CUDA) {
    throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_ENDPOINT_CUDA_MISMATCH");
  }
  if (!sameSet(list(endpoint.gpuTypeIds), DESIRED_GPU_TYPE_IDS)) {
    throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_ENDPOINT_GPU_POOL_MISMATCH");
  }
  if (finite(endpoint.workersMin, 0) !== 0 || finite(endpoint.workersMax, 0) !== 1) {
    throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_ENDPOINT_SCALING_MISMATCH");
  }
}

async function readEndpointState(endpointId, managementKey) {
  const [endpoint, templates] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    endpointBoundTemplates(managementKey),
  ]);
  return { endpoint, template: resolveTemplate(endpoint, templates) };
}

async function waitForWorkerDrain(endpointId, managementKey) {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await controlWorkers(endpointId, managementKey);
    if (activeWorkers(latest).length === 0) return latest;
    await sleep(POLL_MS);
  }
  const remaining = activeWorkers(latest || {});
  throw new Error(
    `AVANTIQO_VOICE_TTS_PULL_STALL_WORKER_DRAIN_TIMEOUT:remaining=${remaining.map((worker) => worker.id).join("|") || "unknown"}`,
  );
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_VOICE_TTS_PULL_STALL_RELOCATION_APPROVED).toUpperCase() === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_RELOCATION_APPROVED=YES_REQUIRED");
}

const expected = await readExpectedImage();
const [state, healthRaw, workersRaw, capacity] = await Promise.all([
  readEndpointState(endpointId, managementKey),
  queue(endpointId, managementKey),
  controlWorkers(endpointId, managementKey),
  discoverCapacity(managementKey),
]);
const { endpoint, template } = state;
assertEndpointBaseline(endpoint, template, endpointId, expected.image);
const health = healthCounters(healthRaw);
assertNoJobsOrExecution(health);

const workers = activeWorkers(workersRaw);
const initializing = workers.filter(
  (worker) => worker.status === "INITIALIZING" && worker.image === expected.image,
);

if (initializing.length === 0) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    endpoint: safeEndpoint(endpoint, template),
    health,
    workers,
    relocation_required: false,
    mutation_performed: false,
    generation_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_in_output: false,
    next_action: "RUN_READ_ONLY_TTS_STARTUP_DIAGNOSTIC_OR_ONE_CONTROLLED_TTS_SMOKE_IF_NO_WORKER",
  }, null, 2));
  process.exit(0);
}
if (initializing.length !== 1 || workers.length !== 1) {
  throw new Error(`AVANTIQO_VOICE_TTS_PULL_STALL_WORKER_SET_UNSAFE:active=${workers.length}:initializing=${initializing.length}`);
}

const stalledWorker = initializing[0];
const logs = await captureWorkerLogs(endpointId, stalledWorker.id, managementKey);
if (logs.error) throw new Error(`AVANTIQO_VOICE_TTS_PULL_STALL_LOG_CAPTURE_FAILED:${logs.error}`);
const stall = stallEvidence(logs.entries, expected.image);
if (!stall.confirmed) {
  throw new Error(
    `AVANTIQO_VOICE_TTS_PULL_STALL_NOT_CONFIRMED:pending=${stall.pending_entry_count}:seconds=${stall.pending_seconds}:transfer=${stall.transfer_observed}:container=${stall.container_start_observed}:failure=${stall.explicit_failure_observed}`,
  );
}

const placement = capacityPlan(capacity, stalledWorker.data_center_id);
if (!placement.selected_data_center_ids.length) {
  throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_NO_ALTERNATE_CAPACITY");
}

const originalDataCenters = unique(list(endpoint.dataCenterIds));
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint: safeEndpoint(endpoint, template),
  health,
  stalled_worker: stalledWorker,
  worker_gpu_outside_endpoint_pool: !DESIRED_GPU_TYPE_IDS.includes(stalledWorker.gpu_type_id),
  image_pull_stall: stall,
  expected_image: expected,
  excluded_data_center_id: stalledWorker.data_center_id,
  target_placement: placement,
  drain_strategy: "PATCH_WORKERS_MAX_0_THEN_RESTORE_1",
  mutation_required: true,
  mutation_performed: false,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  next_action: apply ? "DRAIN_STUCK_WORKER_AND_RELOCATE_ENDPOINT" : "APPLY_PULL_STALL_RELOCATION",
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const [freshState, freshHealthRaw, freshWorkersRaw] = await Promise.all([
  readEndpointState(endpointId, managementKey),
  queue(endpointId, managementKey),
  controlWorkers(endpointId, managementKey),
]);
assertEndpointBaseline(freshState.endpoint, freshState.template, endpointId, expected.image);
const freshHealth = healthCounters(freshHealthRaw);
assertNoJobsOrExecution(freshHealth);
const freshWorkers = activeWorkers(freshWorkersRaw);
if (
  freshWorkers.length !== 1 ||
  freshWorkers[0].id !== stalledWorker.id ||
  freshWorkers[0].status !== "INITIALIZING" ||
  freshWorkers[0].image !== expected.image
) {
  throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_WORKER_CHANGED_REPLAN_REQUIRED");
}
const freshLogs = await captureWorkerLogs(endpointId, stalledWorker.id, managementKey);
if (freshLogs.error) throw new Error(`AVANTIQO_VOICE_TTS_PULL_STALL_RECHECK_LOG_CAPTURE_FAILED:${freshLogs.error}`);
const freshStall = stallEvidence(freshLogs.entries, expected.image);
if (!freshStall.confirmed) {
  throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_RESOLVED_OR_CHANGED_REPLAN_REQUIRED");
}

let maxZeroApplied = false;
let relocationApplied = false;
let rollbackAttempted = false;
let rollbackSucceeded = false;
let drainedWorkersRaw = null;
try {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 0 },
  });
  maxZeroApplied = true;
  drainedWorkersRaw = await waitForWorkerDrain(endpointId, managementKey);

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: {
      dataCenterIds: placement.selected_data_center_ids,
      gpuTypeIds: DESIRED_GPU_TYPE_IDS,
      workersMin: 0,
      workersMax: 1,
    },
  });
  relocationApplied = true;
} catch (error) {
  if (maxZeroApplied && !relocationApplied) {
    rollbackAttempted = true;
    try {
      await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: {
          dataCenterIds: originalDataCenters,
          gpuTypeIds: DESIRED_GPU_TYPE_IDS,
          workersMin: 0,
          workersMax: 1,
        },
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

const [verifiedState, verifiedHealthRaw, verifiedWorkersRaw] = await Promise.all([
  readEndpointState(endpointId, managementKey),
  queue(endpointId, managementKey),
  controlWorkers(endpointId, managementKey),
]);
const verifiedEndpoint = verifiedState.endpoint;
const verifiedTemplate = verifiedState.template;
if (text(verifiedEndpoint.id) !== endpointId || text(verifiedEndpoint.name) !== ENDPOINT_NAME) {
  throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_VERIFY_ENDPOINT_FAILED");
}
if (text(verifiedTemplate.imageName) !== expected.image) {
  throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_VERIFY_IMAGE_FAILED");
}
if (!sameSet(list(verifiedEndpoint.gpuTypeIds), DESIRED_GPU_TYPE_IDS)) {
  throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_VERIFY_GPU_POOL_FAILED");
}
if (!sameSet(list(verifiedEndpoint.dataCenterIds), placement.selected_data_center_ids)) {
  throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_VERIFY_DATACENTERS_FAILED");
}
if (finite(verifiedEndpoint.workersMin, 0) !== 0 || finite(verifiedEndpoint.workersMax, 0) !== 1) {
  throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_VERIFY_SCALING_FAILED");
}
const verifiedHealth = healthCounters(verifiedHealthRaw);
assertNoJobsOrExecution(verifiedHealth);
const verifiedWorkers = activeWorkers(verifiedWorkersRaw);
if (verifiedWorkers.some((worker) => worker.id === stalledWorker.id)) {
  throw new Error("AVANTIQO_VOICE_TTS_PULL_STALL_OLD_WORKER_STILL_ACTIVE");
}

console.log(JSON.stringify({
  ...plan,
  success: true,
  mode: "APPLY",
  endpoint: safeEndpoint(verifiedEndpoint, verifiedTemplate),
  health_after: verifiedHealth,
  active_workers_after: verifiedWorkers,
  drained_workers_snapshot: safeWorkers(drainedWorkersRaw || {}),
  mutation_performed: true,
  worker_drained: true,
  endpoint_relocated: true,
  rollback_attempted: rollbackAttempted,
  rollback_succeeded: rollbackSucceeded,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  next_action: "RUN_ONE_CONTROLLED_TTS_SMOKE_TO_COLD_START_RELOCATED_WORKER",
}, null, 2));