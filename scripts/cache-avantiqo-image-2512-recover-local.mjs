import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const PRIMARY_VOLUME_NAME = "avantiqo-image-model-cache";
const SECONDARY_VOLUME_PREFIX = "avantiqo-image-model-cache-ha-";
const MIN_VOLUME_GB = 64;
const GENERATION_EXECUTION_TIMEOUT_MS = 20 * 60 * 1000;

const GENERATION_GPU_TYPES = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
];

const KNOWN_TEMPORARY_GPU_PATTERN = /(RTX\s*(?:PRO\s*)?6000|RTX\s*4090|RTX\s*3090|A5000|A6000|6000\s*Ada|\bA40\b|\bL4\b|\bL40S?\b|\bA100\b|\bH100\b|\bH200\b|\bB200\b)/i;

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function endpointGpuTypes(endpoint = {}) {
  return unique(list(endpoint.gpuTypeIds));
}

function healthCounters(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
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

function activityCount(counters) {
  return (
    counters.jobs.in_queue +
    counters.jobs.in_progress +
    Object.values(counters.workers).reduce((sum, value) => sum + finite(value, 0), 0)
  );
}

async function rest(path, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function queueHealth(endpointId, inferenceKey) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${inferenceKey}`,
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
    const detail = text(body?.message || body?.error || raw).slice(0, 1200);
    throw new Error(`RUNPOD_HEALTH_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

function runChild(relativePath, args, label) {
  const script = fileURLToPath(new URL(relativePath, import.meta.url));
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`${label}_SIGNAL:${result.signal}`);
  if (result.status !== 0) throw new Error(`${label}_FAILED:exit=${result.status}`);
}

const apply = process.argv.includes("--apply");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);

console.log(`AVANTIQO_IMAGE_CACHE_RECOVERY_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_IMAGE_CACHE_RECOVERY_ENDPOINT_BASELINE=TWO_VOLUMES");
console.log("AVANTIQO_IMAGE_CACHE_RECOVERY_REGION_BINDING_SOURCE=NETWORK_VOLUMES");
console.log("AVANTIQO_IMAGE_CACHE_RECOVERY_REBUILD=false");
console.log("AVANTIQO_IMAGE_CACHE_RECOVERY_IMAGE_GENERATION=false");
console.log("AVANTIQO_IMAGE_CACHE_RECOVERY_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_CACHE_RECOVERY_SECRETS_PRINTED=false");

const endpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=false", managementKey);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");

let endpointSummary = null;
if (configuredEndpointId) {
  const matches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredEndpointId);
  if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_RECOVERY_CONFIGURED_ENDPOINT_INVALID:matches=${matches.length}`);
  }
  endpointSummary = matches[0];
} else {
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_RECOVERY_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  endpointSummary = matches[0];
}

const endpointId = text(endpointSummary?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_CACHE_RECOVERY_ENDPOINT_ID_MISSING");

const [endpoint, volumes, healthRaw] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  rest("/networkvolumes", managementKey),
  queueHealth(endpointId, inferenceKey),
]);
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");
if (text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_IMAGE_CACHE_RECOVERY_ENDPOINT_NAME_MISMATCH");
}
if (!text(endpoint?.templateId || endpoint?.template?.id)) {
  throw new Error("AVANTIQO_IMAGE_CACHE_RECOVERY_TEMPLATE_ID_REQUIRED");
}
if (finite(endpoint?.workersMin) !== 0 || finite(endpoint?.workersMax) !== 1) {
  throw new Error(
    `AVANTIQO_IMAGE_CACHE_RECOVERY_WORKER_SCALING_UNEXPECTED:min=${finite(endpoint?.workersMin)}:max=${finite(endpoint?.workersMax)}`,
  );
}

const health = healthCounters(healthRaw);
if (activityCount(health) !== 0) {
  throw new Error(
    `AVANTIQO_IMAGE_CACHE_RECOVERY_REQUIRES_ZERO_ACTIVITY:jobs=${health.jobs.in_queue + health.jobs.in_progress}:workers=${Object.values(health.workers).reduce((sum, value) => sum + value, 0)}`,
  );
}

const primaryMatches = volumes.filter((volume) => text(volume?.name) === PRIMARY_VOLUME_NAME);
if (primaryMatches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_CACHE_RECOVERY_PRIMARY_VOLUME_RESOLUTION_FAILED:matches=${primaryMatches.length}`);
}
const primary = primaryMatches[0];
const primaryId = text(primary?.id);
const primaryDc = text(primary?.dataCenterId);
if (!primaryId || !primaryDc || finite(primary?.size, 0) < MIN_VOLUME_GB) {
  throw new Error("AVANTIQO_IMAGE_CACHE_RECOVERY_PRIMARY_VOLUME_INVALID");
}

const secondaryMatches = volumes.filter(
  (volume) =>
    text(volume?.name).startsWith(SECONDARY_VOLUME_PREFIX) &&
    text(volume?.dataCenterId) &&
    text(volume?.dataCenterId) !== primaryDc,
);
if (secondaryMatches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_CACHE_RECOVERY_SECONDARY_VOLUME_RESOLUTION_FAILED:matches=${secondaryMatches.length}`);
}
const secondary = secondaryMatches[0];
const secondaryId = text(secondary?.id);
const secondaryDc = text(secondary?.dataCenterId);
if (!secondaryId || !secondaryDc || finite(secondary?.size, 0) < MIN_VOLUME_GB) {
  throw new Error("AVANTIQO_IMAGE_CACHE_RECOVERY_SECONDARY_VOLUME_INVALID");
}

const canonicalVolumeIds = [primaryId, secondaryId];
const canonicalDataCenters = [primaryDc, secondaryDc];
const currentVolumeIds = endpointVolumeIds(endpoint);
if (!currentVolumeIds.length || currentVolumeIds.some((id) => !canonicalVolumeIds.includes(id))) {
  throw new Error(
    `AVANTIQO_IMAGE_CACHE_RECOVERY_UNEXPECTED_ATTACHED_VOLUME:${currentVolumeIds.join("|") || "NONE"}`,
  );
}

const currentGpuTypes = endpointGpuTypes(endpoint);
if (!currentGpuTypes.length) throw new Error("AVANTIQO_IMAGE_CACHE_RECOVERY_GPU_POOL_REQUIRED");
const unknownGpuTypes = currentGpuTypes.filter(
  (gpu) => !GENERATION_GPU_TYPES.includes(gpu) && !KNOWN_TEMPORARY_GPU_PATTERN.test(gpu),
);
if (unknownGpuTypes.length) {
  throw new Error(`AVANTIQO_IMAGE_CACHE_RECOVERY_UNKNOWN_GPU_TYPES:${unknownGpuTypes.join("|")}`);
}

const currentTimeout = finite(endpoint?.executionTimeoutMs);
const baselineRequired =
  !sameSet(currentVolumeIds, canonicalVolumeIds) ||
  !sameSet(currentGpuTypes, GENERATION_GPU_TYPES) ||
  currentTimeout !== GENERATION_EXECUTION_TIMEOUT_MS;

const plan = {
  success: true,
  contract: "AVANTIQO_IMAGE_CACHE_RECOVERY_V1",
  mode: apply ? "APPLY" : "PLAN",
  endpoint_name: IMAGE_ENDPOINT_NAME,
  endpoint_id_present: true,
  template_id_present: true,
  current_volume_count: currentVolumeIds.length,
  canonical_volume_count: canonicalVolumeIds.length,
  canonical_data_centers: canonicalDataCenters,
  current_gpu_type_count: currentGpuTypes.length,
  canonical_generation_gpu_type_count: GENERATION_GPU_TYPES.length,
  current_execution_timeout_ms: currentTimeout,
  canonical_execution_timeout_ms: GENERATION_EXECUTION_TIMEOUT_MS,
  endpoint_baseline_repair_required: baselineRequired,
  zero_activity_verified: true,
  next_steps: [
    "RESTORE_TWO_VOLUME_GENERATION_BASELINE_IF_REQUIRED",
    "BIND_IMMUTABLE_IMAGE_FROM_EVIDENCE",
    "CACHE_OR_VERIFY_QWEN_IMAGE_2512_PER_VOLUME",
  ],
  safety: {
    rebuild: false,
    image_generation: false,
    production_deploy: false,
    template_binding_delegated_to_immutable_binder: true,
    cache_job_submission_delegated_to_guarded_cache_runner: true,
  },
};

if (!apply) {
  console.log("AVANTIQO_IMAGE_CACHE_RECOVERY_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (baselineRequired) {
  const [freshEndpoint, freshHealthRaw] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    queueHealth(endpointId, inferenceKey),
  ]);
  if (text(freshEndpoint?.name) !== IMAGE_ENDPOINT_NAME) {
    throw new Error("AVANTIQO_IMAGE_CACHE_RECOVERY_ENDPOINT_CHANGED_BEFORE_WRITE");
  }
  if (text(freshEndpoint?.templateId || freshEndpoint?.template?.id) !== text(endpoint?.templateId || endpoint?.template?.id)) {
    throw new Error("AVANTIQO_IMAGE_CACHE_RECOVERY_TEMPLATE_CHANGED_BEFORE_WRITE");
  }
  const freshHealth = healthCounters(freshHealthRaw);
  if (activityCount(freshHealth) !== 0) {
    throw new Error("AVANTIQO_IMAGE_CACHE_RECOVERY_ACTIVITY_CHANGED_BEFORE_WRITE");
  }
  const freshVolumeIds = endpointVolumeIds(freshEndpoint);
  if (!freshVolumeIds.length || freshVolumeIds.some((id) => !canonicalVolumeIds.includes(id))) {
    throw new Error("AVANTIQO_IMAGE_CACHE_RECOVERY_VOLUME_CHANGED_BEFORE_WRITE");
  }
  const freshGpuTypes = endpointGpuTypes(freshEndpoint);
  const freshUnknownGpuTypes = freshGpuTypes.filter(
    (gpu) => !GENERATION_GPU_TYPES.includes(gpu) && !KNOWN_TEMPORARY_GPU_PATTERN.test(gpu),
  );
  if (freshUnknownGpuTypes.length) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_RECOVERY_GPU_CHANGED_BEFORE_WRITE:${freshUnknownGpuTypes.join("|")}`);
  }

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: {
      networkVolumeId: primaryId,
      networkVolumeIds: canonicalVolumeIds,
      dataCenterIds: canonicalDataCenters,
      gpuTypeIds: GENERATION_GPU_TYPES,
      executionTimeoutMs: GENERATION_EXECUTION_TIMEOUT_MS,
    },
  });

  const verified = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  if (!sameSet(endpointVolumeIds(verified), canonicalVolumeIds)) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_RECOVERY_VOLUME_RESTORE_VERIFY_FAILED:${endpointVolumeIds(verified).join("|")}`);
  }
  if (!sameSet(endpointGpuTypes(verified), GENERATION_GPU_TYPES)) {
    throw new Error(`AVANTIQO_IMAGE_CACHE_RECOVERY_GPU_RESTORE_VERIFY_FAILED:${endpointGpuTypes(verified).join("|")}`);
  }
  if (finite(verified?.executionTimeoutMs) !== GENERATION_EXECUTION_TIMEOUT_MS) {
    throw new Error(
      `AVANTIQO_IMAGE_CACHE_RECOVERY_TIMEOUT_RESTORE_VERIFY_FAILED:${finite(verified?.executionTimeoutMs)}`,
    );
  }
  if (finite(verified?.workersMin) !== 0 || finite(verified?.workersMax) !== 1) {
    throw new Error("AVANTIQO_IMAGE_CACHE_RECOVERY_SCALING_CHANGED_DURING_REPAIR");
  }
  console.log("AVANTIQO_IMAGE_CACHE_RECOVERY_ENDPOINT_BASELINE_RESTORED=true");
} else {
  console.log("AVANTIQO_IMAGE_CACHE_RECOVERY_ENDPOINT_BASELINE_ALREADY_CURRENT=true");
}

console.log("AVANTIQO_IMAGE_CACHE_RECOVERY_BIND_IMMUTABLE_IMAGE=START");
runChild("./refresh-avantiqo-image-runpod-worker-canonical-local.mjs", ["--apply"], "AVANTIQO_IMAGE_CACHE_RECOVERY_BIND");
console.log("AVANTIQO_IMAGE_CACHE_RECOVERY_BIND_IMMUTABLE_IMAGE=COMPLETE");

console.log("AVANTIQO_IMAGE_CACHE_RECOVERY_CACHE_QWEN_2512=START");
runChild("./cache-avantiqo-image-2512-canonical-local.mjs", ["--apply"], "AVANTIQO_IMAGE_CACHE_RECOVERY_CACHE");
console.log("AVANTIQO_IMAGE_CACHE_RECOVERY=COMPLETE");
