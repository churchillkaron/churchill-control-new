const RUNPOD_SERVERLESS = "https://api.runpod.ai/v2";
const RUNPOD_REST = "https://rest.runpod.io/v1";
const RUNPOD_GRAPHQL = "https://api.runpod.io/graphql";

export const AVANTIQO_VIDEO_CAPACITY_ROUTER_CONTRACT =
  "AVANTIQO_VIDEO_CAPACITY_ROUTER_V1";

const ROUTABLE_CAPABILITIES = new Set([
  "ai.video.generate",
  "ai.video.image_to_video",
]);

const MINIMUM_VRAM_GB = 80;
const MIN_OWNED_STOCK_RANK = 3;
const DEFAULT_CACHE_MS = 10_000;

const STOCK_RANK = Object.freeze({ HIGH: 4, MEDIUM: 3, LOW: 2 });
let cached = null;

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function enabled(value, fallback = false) {
  const normalized = text(value).toLowerCase();
  if (!normalized) return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(normalized);
}
function unique(values) { return [...new Set(list(values).map(text).filter(Boolean))]; }
function rank(value) { return STOCK_RANK[text(value).toUpperCase()] || 0; }
function stockName(value) {
  return ({ 4: "HIGH", 3: "MEDIUM", 2: "LOW" })[Number(value)] || "UNAVAILABLE";
}

function healthSummary(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
  const workerCounts = {
    idle: finite(workers.idle),
    initializing: finite(workers.initializing),
    ready: finite(workers.ready),
    running: finite(workers.running),
    throttled: finite(workers.throttled),
    unhealthy: finite(workers.unhealthy),
  };
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress),
    },
    workers: workerCounts,
    worker_total: Object.values(workerCounts).reduce((sum, value) => sum + value, 0),
  };
}

function activeManagementWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const effective = desired || status;
    return effective && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(effective);
  }).length;
}

function fallbackConfigured() {
  return enabled(process.env.AVANTIQO_VIDEO_MANAGED_FALLBACK_ENABLED, true) &&
    Boolean(text(process.env.FAL_KEY || process.env.FAL_API_KEY));
}

function endpointSelection() {
  const productionId = text(process.env.RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID);
  const certificationId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
  if (productionId) return { endpointId: productionId, endpointRole: "PRODUCTION" };
  if (certificationId) return { endpointId: certificationId, endpointRole: "CERTIFICATION" };
  return { endpointId: "", endpointRole: "UNCONFIGURED" };
}

async function json(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 500)}`);
  }
  return body || {};
}

async function serverless(endpointId, apiKey, pathname) {
  return json(await fetch(`${RUNPOD_SERVERLESS}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  }), "AVANTIQO_VIDEO_CAPACITY_SERVERLESS");
}

async function rest(apiKey, pathname) {
  return json(await fetch(`${RUNPOD_REST}${pathname}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  }), "AVANTIQO_VIDEO_CAPACITY_REST");
}

async function graphql(apiKey) {
  const query = `
    query AvantiqoVideoCapacity($input: GpuAvailabilityInput) {
      gpuTypes { id displayName memoryInGb secureCloud }
      dataCenters {
        id
        storageSupport
        gpuAvailability(input: $input) {
          available stockStatus gpuTypeId gpuTypeDisplayName displayName
        }
      }
    }
  `;
  const response = await fetch(`${RUNPOD_GRAPHQL}?api_key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: {
        input: { gpuCount: 1, minDisk: 5, minMemoryInGb: MINIMUM_VRAM_GB, secureCloud: true },
      },
    }),
    signal: AbortSignal.timeout(8_000),
  });
  const body = await json(response, "AVANTIQO_VIDEO_CAPACITY_GRAPHQL");
  const errors = list(body.errors).map((entry) => text(entry?.message)).filter(Boolean);
  if (errors.length) {
    throw new Error(`AVANTIQO_VIDEO_CAPACITY_GRAPHQL_ERROR:${errors.join(" | ").slice(0, 500)}`);
  }
  return body.data || {};
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function compatibleRows({ dataCenters, gpuTypes, endpointGpuIds, eligibleDcIds }) {
  const gpuMeta = new Map(list(gpuTypes).map((gpu) => [text(gpu.id), gpu]));
  const rows = [];
  for (const dc of list(dataCenters)) {
    const dcId = text(dc.id);
    if (eligibleDcIds.length && !eligibleDcIds.includes(dcId)) continue;
    for (const availability of list(dc?.gpuAvailability)) {
      const gpuTypeId = text(availability.gpuTypeId);
      if (!endpointGpuIds.includes(gpuTypeId)) continue;
      const meta = gpuMeta.get(gpuTypeId) || {};
      rows.push({
        data_center_id: dcId,
        gpu_type_id: gpuTypeId,
        gpu_name: text(availability.gpuTypeDisplayName || availability.displayName || meta.displayName) || null,
        memory_gb: finite(meta.memoryInGb, null),
        secure_cloud_supported: meta.secureCloud === true,
        available: availability.available === true,
        stock: text(availability.stockStatus).toUpperCase() || "UNAVAILABLE",
        stock_rank: rank(availability.stockStatus),
      });
    }
  }
  return rows.sort((left, right) =>
    right.stock_rank - left.stock_rank ||
    (right.memory_gb || 0) - (left.memory_gb || 0) ||
    left.data_center_id.localeCompare(right.data_center_id) ||
    left.gpu_type_id.localeCompare(right.gpu_type_id)
  );
}

async function snapshot() {
  const { endpointId, endpointRole } = endpointSelection();
  const runtimeKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY || process.env.RUNPOD_API_KEY);
  const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!endpointId || !runtimeKey) {
    throw new Error("AVANTIQO_VIDEO_CAPACITY_ENDPOINT_OR_RUNTIME_KEY_REQUIRED");
  }

  const liveHealth = healthSummary(await serverless(endpointId, runtimeKey, "/health"));
  if (!managementKey) {
    return {
      endpoint_id: endpointId,
      endpoint_role: endpointRole,
      health: liveHealth,
      management_capacity_visible: false,
      configured_gpu_type_ids: [],
      eligible_data_center_ids: [],
      stock_rows: [],
      best_stock_rank: 0,
      best_stock: "UNAVAILABLE",
      active_management_workers: 0,
      workers_min: null,
      workers_max: null,
    };
  }

  const [endpoint, volumes, availability] = await Promise.all([
    rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`),
    rest(managementKey, "/networkvolumes"),
    graphql(managementKey),
  ]);
  const volumeIds = endpointVolumeIds(endpoint);
  const eligibleDcIds = unique(
    list(volumes)
      .filter((volume) => volumeIds.includes(text(volume?.id)))
      .map((volume) => text(volume?.dataCenterId ?? volume?.data_center_id)),
  );
  const endpointGpuIds = unique(endpoint.gpuTypeIds);
  const rows = compatibleRows({
    dataCenters: availability.dataCenters,
    gpuTypes: availability.gpuTypes,
    endpointGpuIds,
    eligibleDcIds,
  });
  const usable = rows.filter((row) =>
    row.available && row.secure_cloud_supported && finite(row.memory_gb, 0) >= MINIMUM_VRAM_GB
  );
  const best = Math.max(0, ...usable.map((row) => row.stock_rank));

  return {
    endpoint_id: endpointId,
    endpoint_role: endpointRole,
    health: liveHealth,
    management_capacity_visible: true,
    configured_gpu_type_ids: endpointGpuIds,
    eligible_data_center_ids: eligibleDcIds,
    stock_rows: rows,
    best_stock_rank: best,
    best_stock: stockName(best),
    active_management_workers: activeManagementWorkers(endpoint),
    workers_min: finite(endpoint.workersMin, null),
    workers_max: finite(endpoint.workersMax, null),
  };
}

export function decideAvantiqoVideoRoute({ capability, capacity, fallbackReady = fallbackConfigured() }) {
  const capabilityId = text(capability);
  if (!ROUTABLE_CAPABILITIES.has(capabilityId)) {
    return { route: "OWNED", reason: "CAPABILITY_NOT_ROUTED", fallback_ready: fallbackReady };
  }

  if (text(capacity?.endpoint_role) !== "PRODUCTION") {
    return fallbackReady
      ? { route: "MANAGED_FALLBACK", reason: "OWNED_CERTIFICATION_ENDPOINT_INTERNAL_ONLY", fallback_ready: true }
      : { route: "UNAVAILABLE", reason: "OWNED_PRODUCTION_ENDPOINT_NOT_CONFIGURED_AND_FALLBACK_UNAVAILABLE", fallback_ready: false };
  }

  const workerReady =
    finite(capacity?.health?.worker_total) > 0 ||
    finite(capacity?.active_management_workers) > 0;
  if (workerReady) {
    return { route: "OWNED", reason: "OWNED_PRODUCTION_WORKER_ALREADY_ALLOCATED", fallback_ready: fallbackReady };
  }

  if (finite(capacity?.workers_max, 0) <= 0) {
    return fallbackReady
      ? { route: "MANAGED_FALLBACK", reason: "OWNED_PRODUCTION_ENDPOINT_CANNOT_SCALE", fallback_ready: true }
      : { route: "UNAVAILABLE", reason: "OWNED_PRODUCTION_ENDPOINT_CANNOT_SCALE_AND_FALLBACK_UNAVAILABLE", fallback_ready: false };
  }

  if (capacity?.management_capacity_visible === true && finite(capacity?.best_stock_rank) >= MIN_OWNED_STOCK_RANK) {
    return {
      route: "OWNED",
      reason: `OWNED_${text(capacity.best_stock) || "MEDIUM"}_STOCK_VISIBLE`,
      fallback_ready: fallbackReady,
    };
  }

  if (fallbackReady) {
    return {
      route: "MANAGED_FALLBACK",
      reason: capacity?.management_capacity_visible === false
        ? "OWNED_CAPACITY_UNKNOWN"
        : finite(capacity?.best_stock_rank) > 0
          ? "OWNED_CAPACITY_LOW_ONLY"
          : "OWNED_CAPACITY_UNAVAILABLE",
      fallback_ready: true,
    };
  }

  return {
    route: "UNAVAILABLE",
    reason: "OWNED_CAPACITY_NOT_PRODUCTION_READY_AND_FALLBACK_UNAVAILABLE",
    fallback_ready: false,
  };
}

export async function resolveAvantiqoVideoRoute({ capability, forceRefresh = false } = {}) {
  const routerEnabled = enabled(process.env.AVANTIQO_VIDEO_CAPACITY_ROUTER_ENABLED, true);
  if (!routerEnabled || !ROUTABLE_CAPABILITIES.has(text(capability))) {
    return {
      contract: AVANTIQO_VIDEO_CAPACITY_ROUTER_CONTRACT,
      route: "OWNED",
      reason: routerEnabled ? "CAPABILITY_NOT_ROUTED" : "ROUTER_DISABLED",
      capacity: null,
      fallback_ready: fallbackConfigured(),
      endpoint_mutation_performed: false,
      worker_mutation_performed: false,
    };
  }

  const ttl = Math.max(1_000, finite(process.env.AVANTIQO_VIDEO_CAPACITY_CACHE_MS, DEFAULT_CACHE_MS));
  if (!forceRefresh && cached && Date.now() - cached.at < ttl) {
    const decision = decideAvantiqoVideoRoute({ capability, capacity: cached.capacity });
    return {
      contract: AVANTIQO_VIDEO_CAPACITY_ROUTER_CONTRACT,
      ...decision,
      capacity: cached.capacity,
      cache_hit: true,
      endpoint_mutation_performed: false,
      worker_mutation_performed: false,
    };
  }

  try {
    const capacity = await snapshot();
    cached = { at: Date.now(), capacity };
    const decision = decideAvantiqoVideoRoute({ capability, capacity });
    return {
      contract: AVANTIQO_VIDEO_CAPACITY_ROUTER_CONTRACT,
      ...decision,
      capacity,
      cache_hit: false,
      endpoint_mutation_performed: false,
      worker_mutation_performed: false,
    };
  } catch (error) {
    const fallbackReady = fallbackConfigured();
    return {
      contract: AVANTIQO_VIDEO_CAPACITY_ROUTER_CONTRACT,
      route: fallbackReady ? "MANAGED_FALLBACK" : "UNAVAILABLE",
      reason: fallbackReady ? "CAPACITY_CHECK_FAILED_USE_FALLBACK" : "CAPACITY_CHECK_FAILED_NO_FALLBACK",
      capacity: null,
      capacity_error: text(error?.message || error).slice(0, 500),
      fallback_ready: fallbackReady,
      cache_hit: false,
      endpoint_mutation_performed: false,
      worker_mutation_performed: false,
    };
  }
}

export const AVANTIQO_VIDEO_ROUTABLE_CAPABILITIES = ROUTABLE_CAPABILITIES;
