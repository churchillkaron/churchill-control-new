const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const GQL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_CODE_POST_STARVATION_CAPACITY_PLAN_V1";
const ENDPOINT_NAME = "avantiqo-code-v1";
const MINIMUM_VRAM_GB = 80;
const MAX_GPU_FALLBACKS = 3;
const MIN_RECOMMENDED_STOCK_RANK = 3;

const PROFILES = Object.freeze([
  Object.freeze({ key: "RTX_PRO_6000_96GB", match: /RTX\s*PRO\s*6000/i, exclude: /MIG/i, priority: 5000 }),
  Object.freeze({ key: "H100_NVL_94GB", match: /H100.*NVL|NVL.*H100/i, exclude: /MIG/i, priority: 4900 }),
  Object.freeze({ key: "H100_80GB", match: /\bH100\b/i, exclude: /NVL|MIG/i, priority: 4800 }),
  Object.freeze({ key: "H200_141GB", match: /\bH200\b/i, exclude: /MIG/i, priority: 4700 }),
  Object.freeze({ key: "B200_180GB", match: /\bB200\b/i, exclude: /MIG/i, priority: 4600 }),
]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function unique(values) { return [...new Set(list(values).map(text).filter(Boolean))]; }
function stockRank(value) {
  return ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[text(value).toUpperCase()] || 0);
}
function stockName(rank) {
  return ({ 4: "HIGH", 3: "MEDIUM", 2: "LOW" }[Number(rank)] || "UNAVAILABLE");
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function endpointVolumeIds(endpoint = {}) {
  return unique([
    endpoint.networkVolumeId,
    ...list(endpoint.networkVolumeIds),
  ]);
}
function gpuName(gpu = {}) {
  return text(gpu.gpuTypeDisplayName || gpu.displayName || gpu.gpuTypeId);
}
function profileFor(gpu = {}) {
  const haystack = `${text(gpu.gpuTypeId)} ${gpuName(gpu)}`;
  return PROFILES.find((profile) =>
    profile.match.test(haystack) && !(profile.exclude && profile.exclude.test(haystack)),
  ) || null;
}
function healthCounters(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
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
function activeWorkerCount(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker.desiredStatus ?? worker.desired_status).toUpperCase();
    const status = text(worker.status ?? worker.workerStatus ?? worker.runtimeStatus).toUpperCase();
    return !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(desired || status);
  }).length;
}
function safeTemplate(template = {}) {
  const env = template?.env && typeof template.env === "object" && !Array.isArray(template.env)
    ? template.env
    : {};
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName || template.image) || null,
    docker_entrypoint: list(template.dockerEntrypoint),
    docker_start_cmd: list(template.dockerStartCmd),
    volume_mount_path: text(template.volumeMountPath) || null,
    is_serverless: template.isServerless ?? null,
    env_keys: Object.keys(env).sort(),
  };
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 900)}`);
  }
  return body;
}
async function rest(key, pathname) {
  return readJson(await fetch(`${REST}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_REST");
}
async function health(key, endpointId) {
  return readJson(await fetch(`${SERVERLESS}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_HEALTH");
}
async function gpuAvailability(key) {
  const query = `
    query AvantiqoCodePostStarvationCapacity($input: GpuAvailabilityInput) {
      dataCenters {
        id
        name
        location
        storageSupport
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
  const response = await fetch(`${GQL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          gpuCount: 1,
          minDisk: 5,
          minMemoryInGb: MINIMUM_VRAM_GB,
          secureCloud: true,
        },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  const errors = list(body?.errors).map((entry) => text(entry?.message)).filter(Boolean);
  if (!response.ok || errors.length || !Array.isArray(body?.data?.dataCenters)) {
    throw new Error(`RUNPOD_GPU_AVAILABILITY_FAILED:${response.status}:${errors.join(" | ") || text(raw).slice(0, 900)}`);
  }
  return body.data.dataCenters;
}
function compatibleRows(dataCenters, currentGpuIds) {
  const rows = [];
  for (const dc of dataCenters) {
    for (const gpu of list(dc?.gpuAvailability)) {
      if (gpu.available !== true) continue;
      const profile = profileFor(gpu);
      if (!profile) continue;
      rows.push({
        data_center_id: text(dc.id),
        data_center_name: text(dc.name) || null,
        location: text(dc.location) || null,
        storage_support: dc.storageSupport ?? null,
        gpu_type_id: text(gpu.gpuTypeId),
        gpu_name: gpuName(gpu) || null,
        profile: profile.key,
        stock: text(gpu.stockStatus).toUpperCase() || "UNAVAILABLE",
        stock_rank: stockRank(gpu.stockStatus),
        current_gpu_type: currentGpuIds.includes(text(gpu.gpuTypeId)),
        priority: profile.priority,
      });
    }
  }
  return rows.sort((left, right) =>
    right.stock_rank - left.stock_rank ||
    right.priority - left.priority ||
    left.data_center_id.localeCompare(right.data_center_id) ||
    left.gpu_type_id.localeCompare(right.gpu_type_id)
  );
}
function selectedPool(rows) {
  return unique(rows.slice(0, MAX_GPU_FALLBACKS).map((row) => row.gpu_type_id));
}
function bestStock(rows) {
  return Math.max(0, ...rows.map((row) => row.stock_rank));
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || required("RUNPOD_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");

console.log("AVANTIQO_CODE_POST_STARVATION_CAPACITY_MODE=READ_ONLY");
console.log("AVANTIQO_CODE_POST_STARVATION_CAPACITY_JOB_SUBMISSION=false");
console.log("AVANTIQO_CODE_POST_STARVATION_CAPACITY_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_CODE_POST_STARVATION_CAPACITY_VOLUME_MUTATION=false");
console.log("AVANTIQO_CODE_POST_STARVATION_CAPACITY_SECRETS_PRINTED=false");

const [endpoint, volumes, templates, liveHealth, dataCenters] = await Promise.all([
  rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`),
  rest(managementKey, "/networkvolumes"),
  rest(managementKey, "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false"),
  health(runtimeKey, endpointId),
  gpuAvailability(managementKey),
]);

if (text(endpoint?.id) !== endpointId || text(endpoint?.name) !== ENDPOINT_NAME) {
  throw new Error(`CODE_ENDPOINT_IDENTITY_MISMATCH:${text(endpoint?.id)}:${text(endpoint?.name)}`);
}
const counters = healthCounters(liveHealth);
if (counters.jobs.in_queue !== 0 || counters.jobs.in_progress !== 0) {
  throw new Error(`CODE_POST_STARVATION_REQUIRES_EMPTY_QUEUE:${counters.jobs.in_queue}:${counters.jobs.in_progress}`);
}
if (
  counters.workers.initializing !== 0 || counters.workers.running !== 0 ||
  counters.workers.unhealthy !== 0 || activeWorkerCount(endpoint) !== 0
) {
  throw new Error("CODE_POST_STARVATION_REQUIRES_NO_ACTIVE_WORKER");
}
if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 0) {
  throw new Error(`CODE_POST_STARVATION_REQUIRES_RESTING_0_0:${endpoint.workersMin}:${endpoint.workersMax}`);
}

const currentGpuIds = unique(endpoint.gpuTypeIds);
const volumeIds = endpointVolumeIds(endpoint);
if (volumeIds.length !== 1) {
  throw new Error(`CODE_EXACTLY_ONE_NETWORK_VOLUME_REQUIRED:${volumeIds.length}`);
}
const volume = list(volumes).find((candidate) => text(candidate?.id) === volumeIds[0]) || null;
if (!volume) throw new Error(`CODE_NETWORK_VOLUME_NOT_FOUND:${volumeIds[0]}`);
const currentDcId = text(volume.dataCenterId ?? volume.data_center_id);
if (!currentDcId) throw new Error("CODE_NETWORK_VOLUME_DATACENTER_REQUIRED");
const templateId = text(endpoint.templateId || endpoint.template?.id);
const embeddedTemplate = endpoint?.template && typeof endpoint.template === "object" ? endpoint.template : null;
const resolvedTemplate = embeddedTemplate && Object.keys(embeddedTemplate).length
  ? embeddedTemplate
  : list(templates).find((candidate) => text(candidate?.id) === templateId) || null;

const allCompatible = compatibleRows(dataCenters, currentGpuIds);
const sameDc = allCompatible.filter((row) => row.data_center_id === currentDcId);
const otherDcs = allCompatible.filter((row) => row.data_center_id !== currentDcId && row.storage_support !== false);
const sameDcBest = bestStock(sameDc);
const otherBest = bestStock(otherDcs);
const sameDcPool = selectedPool(sameDc);
const bestOtherDcId = otherDcs.find((row) => row.stock_rank === otherBest)?.data_center_id || null;
const bestOtherDc = bestOtherDcId
  ? otherDcs.filter((row) => row.data_center_id === bestOtherDcId)
  : [];
const bestOtherPool = selectedPool(bestOtherDc);

let diagnosis = "RUNPOD_CAPACITY_SHORTAGE";
let nextAction = "DO_NOT_SUBMIT_ANOTHER_CODE_JOB_UNTIL_CAPACITY_IMPROVES_OR_BACKEND_CHANGES";
if (sameDcBest >= MIN_RECOMMENDED_STOCK_RANK && sameDcPool.length) {
  diagnosis = "SAME_DATACENTER_CAPACITY_AVAILABLE";
  nextAction = JSON.stringify([...currentGpuIds].sort()) === JSON.stringify([...sameDcPool].sort())
    ? "CURRENT_POOL_ALREADY_BEST_SAME_DATACENTER_RETRY_ONLY_AFTER_REVIEW"
    : "REBIND_CODE_TO_TOP3_SAME_DATACENTER_COMPATIBLE_GPUS";
} else if (otherBest >= MIN_RECOMMENDED_STOCK_RANK && bestOtherPool.length) {
  diagnosis = "NETWORK_VOLUME_DATACENTER_CAPACITY_BOTTLENECK";
  nextAction = "PLAN_CODE_VOLUME_AND_ENDPOINT_RELOCATION_TO_BETTER_DATACENTER";
} else if (sameDcBest > 0 || otherBest > 0) {
  diagnosis = "COMPATIBLE_GPU_STOCK_ONLY_LOW";
  nextAction = "AVOID_REPEAT_SERVERLESS_PROBES;USE_RELOCATION_OR_POD_BACKEND_PLAN";
}

const report = {
  success: true,
  contract: CONTRACT,
  diagnosis,
  next_action: nextAction,
  evidence: {
    previous_probe_pattern_expected: "IN_QUEUE_WITH_INITIALIZING_AND_ZERO_BILLABLE_WORKER",
    current_queue_clean: true,
    current_worker_clean: true,
    permanent_rest_state: "0/0",
  },
  endpoint: {
    id: endpointId,
    name: text(endpoint.name),
    gpu_type_ids: currentGpuIds,
    gpu_type_count: currentGpuIds.length,
    runpod_current_fallback_limit: MAX_GPU_FALLBACKS,
    gpu_pool_within_current_limit: currentGpuIds.length <= MAX_GPU_FALLBACKS,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    flashboot: endpoint.flashBoot ?? endpoint.flashboot ?? null,
    allowed_cuda_versions: list(endpoint.allowedCudaVersions),
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    template: resolvedTemplate ? safeTemplate(resolvedTemplate) : null,
  },
  network_volume: {
    id: text(volume.id),
    name: text(volume.name) || null,
    size_gb: finite(volume.size ?? volume.sizeGb),
    data_center_id: currentDcId,
  },
  health: counters,
  capacity: {
    minimum_vram_gb: MINIMUM_VRAM_GB,
    minimum_recommended_stock: stockName(MIN_RECOMMENDED_STOCK_RANK),
    same_datacenter_best_stock: stockName(sameDcBest),
    same_datacenter_candidates: sameDc,
    same_datacenter_recommended_pool: sameDcPool,
    other_datacenters_best_stock: stockName(otherBest),
    best_other_datacenter_id: bestOtherDcId,
    best_other_datacenter_candidates: bestOtherDc,
    best_other_datacenter_recommended_pool: bestOtherPool,
  },
  mutation_performed: false,
  provider_job_submitted: false,
  worker_opened: false,
  volume_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

console.log(JSON.stringify(report, null, 2));
console.log(`${CONTRACT}=PASS`);
