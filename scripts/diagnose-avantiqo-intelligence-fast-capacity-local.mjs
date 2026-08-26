const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_CAPACITY_DIAGNOSTIC_V1";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];
const sorted = (values) => unique(list(values)).sort();
const upper = (value) => text(value).toUpperCase();
const stockRank = (value) => ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[upper(value)] || 0);

function requiredCredential() {
  const value = text(
    process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
  );
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

function runtimeCredential(managementKey) {
  return text(process.env.RUNPOD_API_KEY) || managementKey;
}

async function jsonResponse(response, code) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw)
      .replace(/\s+/g, " ")
      .slice(0, 700);
    throw new Error(`${code}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function rest(path, apiKey) {
  return jsonResponse(
    await fetch(`${REST_BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    }),
    "RUNPOD_INTELLIGENCE_FAST_CAPACITY_REST",
  );
}

async function queueHealth(endpointId, apiKey) {
  return jsonResponse(
    await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    }),
    "RUNPOD_INTELLIGENCE_FAST_CAPACITY_QUEUE",
  );
}

async function discoverDatacenters(apiKey) {
  const query = `
    query AvantiqoIntelligenceFastCapacity($input: GpuAvailabilityInput) {
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
  const response = await fetch(
    `${GRAPHQL_URL}?api_key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
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
    },
  );
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    const detail = text(
      body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw,
    ).slice(0, 900);
    throw new Error(
      `RUNPOD_INTELLIGENCE_FAST_CAPACITY_GRAPHQL_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`,
    );
  }
  return body.data.dataCenters;
}

function resolveOne(items, name, code) {
  const matches = list(items).filter((item) => text(item?.name) === name);
  if (matches.length !== 1) throw new Error(`${code}:matches=${matches.length}`);
  return matches[0];
}

function endpointVolumeIds(endpoint = {}) {
  return unique([
    text(endpoint?.networkVolumeId),
    ...list(endpoint?.networkVolumeIds).map(text),
  ]);
}

function activeWorkerCount(endpoint = {}) {
  return list(endpoint?.workers).filter((worker) => {
    const desired = upper(worker?.desiredStatus || worker?.desired_status);
    return desired !== "EXITED";
  }).length;
}

function healthSummary(value = {}) {
  const jobs = object(value?.jobs);
  const workers = object(value?.workers);
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

function endpointPlacement(endpoint = {}, volumes = []) {
  const volumeIds = endpointVolumeIds(endpoint);
  const attachedVolumes = list(volumes)
    .filter((volume) => volumeIds.includes(text(volume?.id)))
    .map((volume) => ({
      id: text(volume?.id) || null,
      data_center_id: text(volume?.dataCenterId) || null,
    }));
  const volumeDataCenters = unique(
    attachedVolumes.map((volume) => volume.data_center_id),
  );
  const explicitDataCenters = sorted(endpoint?.dataCenterIds);
  return {
    gpu_type_ids: sorted(endpoint?.gpuTypeIds),
    explicit_data_center_ids: explicitDataCenters,
    network_volume_ids: volumeIds.sort(),
    attached_network_volumes: attachedVolumes,
    effective_data_center_ids: volumeDataCenters.length
      ? volumeDataCenters.sort()
      : explicitDataCenters,
    effective_placement_source: volumeDataCenters.length
      ? "NETWORK_VOLUME_DATACENTER"
      : explicitDataCenters.length
        ? "ENDPOINT_DATACENTER_RESTRICTION"
        : "GLOBAL_SERVERLESS_PLACEMENT",
    allowed_cuda_versions: sorted(endpoint?.allowedCudaVersions),
    minimum_cuda_version: text(endpoint?.minCudaVersion) || null,
  };
}

function safeEndpoint(endpoint = {}, placement = {}) {
  return {
    present: Boolean(text(endpoint?.id)),
    name: text(endpoint?.name) || null,
    template_id_present: Boolean(
      text(endpoint?.templateId || endpoint?.template?.id),
    ),
    ...placement,
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    active_management_workers: activeWorkerCount(endpoint),
    flashboot: endpoint?.flashboot === true,
  };
}

function capacityRow(dataCenter = {}, gpu = {}) {
  return {
    data_center_id: text(dataCenter?.id) || null,
    data_center_name: text(dataCenter?.name) || null,
    location: text(dataCenter?.location) || null,
    gpu_type_id: text(gpu?.gpuTypeId) || null,
    gpu_name: text(
      gpu?.gpuTypeDisplayName || gpu?.displayName || gpu?.gpuTypeId,
    ) || null,
    available: gpu?.available === true,
    stock_status: upper(gpu?.stockStatus) || "UNAVAILABLE",
    stock_rank: stockRank(gpu?.stockStatus),
  };
}

function rankRows(rows) {
  return [...rows].sort(
    (left, right) =>
      right.stock_rank - left.stock_rank ||
      Number(right.available) - Number(left.available) ||
      String(left.data_center_id).localeCompare(String(right.data_center_id)) ||
      String(left.gpu_type_id).localeCompare(String(right.gpu_type_id)),
  );
}

function capacityForPlacement(allRows, placement) {
  const configuredRows = allRows.filter((row) =>
    placement.gpu_type_ids.includes(row.gpu_type_id),
  );
  const effectiveRows = placement.effective_data_center_ids.length
    ? configuredRows.filter((row) =>
        placement.effective_data_center_ids.includes(row.data_center_id),
      )
    : configuredRows;
  const ranked = rankRows(effectiveRows);
  return {
    configured_gpu_ids_seen_by_availability_api: placement.gpu_type_ids.filter(
      (id) => allRows.some((row) => row.gpu_type_id === id),
    ),
    configured_gpu_ids_missing_from_availability_api: placement.gpu_type_ids.filter(
      (id) => !allRows.some((row) => row.gpu_type_id === id),
    ),
    effective_configured_capacity: ranked.slice(0, 60),
    effective_available_capacity: ranked
      .filter((row) => row.available && row.stock_rank > 0)
      .slice(0, 40),
  };
}

const managementKey = requiredCredential();
const runtimeKey = runtimeCredential(managementKey);
const [endpoints, volumes, dataCenters] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  discoverDatacenters(managementKey),
]);

const deep = resolveOne(
  endpoints,
  DEEP_NAME,
  "AVANTIQO_INTELLIGENCE_DEEP_ENDPOINT_RESOLUTION_FAILED",
);
const fast = resolveOne(
  endpoints,
  FAST_NAME,
  "AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_RESOLUTION_FAILED",
);
const [deepHealthRaw, fastHealthRaw] = await Promise.all([
  queueHealth(text(deep?.id), runtimeKey),
  queueHealth(text(fast?.id), runtimeKey),
]);
const deepPlacement = endpointPlacement(deep, volumes);
const fastPlacement = endpointPlacement(fast, volumes);
const allRows = list(dataCenters).flatMap((dataCenter) =>
  list(dataCenter?.gpuAvailability).map((gpu) => capacityRow(dataCenter, gpu)),
);
const deepCapacity = capacityForPlacement(allRows, deepPlacement);
const fastCapacity = capacityForPlacement(allRows, fastPlacement);
const placementParity =
  JSON.stringify(deepPlacement) === JSON.stringify(fastPlacement);
const deepRestored =
  finite(deep?.workersMin) === 0 && finite(deep?.workersMax) === 1;
const fastParked =
  finite(fast?.workersMin) === 0 &&
  finite(fast?.workersMax) === 0 &&
  activeWorkerCount(fast) === 0;
const fastAvailable = fastCapacity.effective_available_capacity.length;

let diagnosis = "CONFIGURED_FAST_CAPACITY_AVAILABLE_AFTER_TIMEOUT";
let nextAction = "INSPECT_RUNPOD_SERVERLESS_SCHEDULER_OR_ACCOUNT_CONSTRAINTS_NO_NEW_JOB";
if (!deepRestored || !fastParked) {
  diagnosis = "SAFE_DEEP_RESTORED_FAST_PARKED_STATE_REQUIRED";
  nextAction = "RESTORE_DEEP_AND_PARK_FAST_BEFORE_ANY_REPAIR";
} else if (!placementParity) {
  diagnosis = "DEEP_FAST_RUNTIME_PLACEMENT_PARITY_NOT_MET";
  nextAction = "REPAIR_DEEP_FAST_RUNTIME_PLACEMENT_PARITY";
} else if (
  fastPlacement.gpu_type_ids.length > 0 &&
  fastCapacity.configured_gpu_ids_missing_from_availability_api.length ===
  fastPlacement.gpu_type_ids.length
) {
  diagnosis = "CONFIGURED_FAST_GPU_IDS_NOT_RETURNED_BY_AVAILABILITY_API";
  nextAction = "REPLAN_FAST_GPU_POOL_FROM_LIVE_COMPATIBLE_CAPACITY_NO_NEW_JOB";
} else if (fastAvailable === 0) {
  diagnosis = "NO_LIVE_CONFIGURED_FAST_GPU_CAPACITY";
  nextAction = "KEEP_DEEP_RESTORED_AND_RECHECK_CAPACITY_BEFORE_ANY_NEW_JOB";
}

console.log(
  JSON.stringify(
    {
      success: true,
      contract: CONTRACT,
      mode: "READ_ONLY",
      deep_endpoint: safeEndpoint(deep, deepPlacement),
      fast_endpoint: safeEndpoint(fast, fastPlacement),
      deep_health: healthSummary(deepHealthRaw),
      fast_health: healthSummary(fastHealthRaw),
      runtime_critical_placement_parity: placementParity,
      safe_post_failure_state: deepRestored && fastParked,
      deep_live_capacity: deepCapacity,
      fast_live_capacity: fastCapacity,
      diagnosis,
      next_action: nextAction,
      generation_submitted: false,
      endpoint_mutation_performed: false,
      queue_mutation_performed: false,
      storage_mutation_performed: false,
      production_deploy_performed: false,
      secrets_in_output: false,
    },
    null,
    2,
  ),
);
