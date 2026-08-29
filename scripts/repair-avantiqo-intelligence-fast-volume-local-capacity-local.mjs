import { spawnSync } from "node:child_process";

const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const GQL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_VOLUME_LOCAL_CAPACITY_REPAIR_V1";
const ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const MINIMUM_VRAM_GB = 80;
const MAX_GPU_FALLBACKS = 4;

const PROFILES = Object.freeze([
  Object.freeze({ key: "RTX_PRO_6000_BLACKWELL_SERVER_96GB", match: /RTX\s*PRO\s*6000.*Blackwell.*Server|Blackwell.*Server.*RTX\s*PRO\s*6000/i, exclude: /MIG|Max-Q|Workstation/i, priority: 6000 }),
  Object.freeze({ key: "H200_141GB", match: /\bH200\b/i, exclude: /MIG|NVL/i, priority: 5900 }),
  Object.freeze({ key: "B200_180GB", match: /\bB200\b/i, exclude: /MIG/i, priority: 5800 }),
  Object.freeze({ key: "A100_80GB_PCIE", match: /A100.*80.*PCIe|PCIe.*A100.*80|A100.*PCIe.*80/i, exclude: /MIG/i, priority: 5700 }),
]);

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const unique = (values) => [...new Set(list(values).map(text).filter(Boolean))];
const sorted = (values) => [...unique(values)].sort();

function redact(value) {
  return text(value)
    .slice(0, 1600)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env });
  if (result.status !== 0) throw new Error(`${code}:${redact(result.stderr || result.stdout)}`);
  return text(result.stdout);
}

function validateMain() {
  const expected = text(process.env.AVANTIQO_INTELLIGENCE_CODE_MISSION_PRODUCTION_CERT_EXPECTED_MAIN_COMMIT).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(expected)) throw new Error(`${CONTRACT}_EXPECTED_MAIN_REQUIRED`);
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_GIT_HEAD_FAILED`).toLowerCase();
  if (head !== expected) throw new Error(`${CONTRACT}_PINNED_MAIN_MISMATCH:${head}:${expected}`);
  const dirty = shell("git", ["status", "--porcelain", "--untracked-files=no"], `${CONTRACT}_GIT_STATUS_FAILED`);
  if (dirty) throw new Error(`${CONTRACT}_TRACKED_WORKTREE_MUST_BE_CLEAN`);
  return head;
}

function credential() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

function runtimeCredential(managementKey) {
  return text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok || body === null) {
    throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  }
  return body;
}

async function rest(key, path, options = {}) {
  return readJson(await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30000),
  }), `${CONTRACT}_REST`);
}

async function queueHealth(key, endpointId) {
  return readJson(await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  }), `${CONTRACT}_QUEUE`);
}

async function graphqlBody(key, query, variables, label) {
  const response = await fetch(`${GQL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  const errors = list(body?.errors).map((entry) => text(entry?.message)).filter(Boolean);
  if (!response.ok || body === null || errors.length) {
    throw new Error(`${label}:${response.status}:${redact(errors.join(" | ") || raw)}`);
  }
  return body;
}

async function inventory(key) {
  const query = `
    query AvantiqoFastCapacityRepair($input: GpuAvailabilityInput) {
      gpuTypes { id displayName memoryInGb secureCloud communityCloud }
      dataCenters {
        id name location storageSupport
        gpuAvailability(input: $input) {
          available stockStatus gpuTypeId gpuTypeDisplayName displayName
        }
      }
    }
  `;
  const body = await graphqlBody(
    key,
    query,
    { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: MINIMUM_VRAM_GB, secureCloud: true } },
    `${CONTRACT}_GRAPHQL_INVENTORY_FAILED`,
  );
  if (!Array.isArray(body?.data?.gpuTypes) || !Array.isArray(body?.data?.dataCenters)) {
    throw new Error(`${CONTRACT}_GRAPHQL_INVENTORY_INVALID`);
  }
  return body.data;
}

async function endpointTopology(key, endpointId = null) {
  const query = `
    query AvantiqoFastEndpointTopology {
      myself {
        endpoints {
          id name locations networkVolumeId
          networkVolumeIds { networkVolumeId dataCenterId }
        }
      }
    }
  `;
  const body = await graphqlBody(key, query, {}, `${CONTRACT}_GRAPHQL_ENDPOINT_FAILED`);
  const rows = list(body?.data?.myself?.endpoints);
  const matches = endpointId
    ? rows.filter((endpoint) => text(endpoint?.id) === endpointId && text(endpoint?.name) === ENDPOINT_NAME)
    : rows.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_GRAPHQL_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function profileFor(row = {}) {
  const label = [row.id, row.displayName].map(text).filter(Boolean).join(" ");
  return PROFILES.find((profile) => profile.match.test(label) && !(profile.exclude && profile.exclude.test(label))) || null;
}

function stockRank(value) {
  const status = text(value).toUpperCase();
  if (status === "HIGH") return 4;
  if (status === "MEDIUM") return 3;
  if (status === "LOW") return 2;
  if (status && status !== "NONE" && status !== "UNAVAILABLE") return 1;
  return 0;
}

function healthSummary(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
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

function activeWorkers(endpoint = {}) {
  const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return list(endpoint.workers).filter((worker) => {
    const status = text(worker.status ?? worker.workerStatus ?? worker.runtimeStatus).toUpperCase();
    const desired = text(worker.desiredStatus ?? worker.desired_status).toUpperCase();
    if (status) return !terminal.has(status);
    if (desired) return !terminal.has(desired);
    return false;
  });
}

function endpointVolumes(endpoint = {}) {
  return unique([
    endpoint.networkVolumeId,
    ...list(endpoint.networkVolumeIds).map((entry) => typeof entry === "string" ? entry : entry?.id || entry?.networkVolumeId),
  ]);
}

function stableEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    network_volume_ids: endpointVolumes(endpoint).sort(),
    data_center_ids: sorted(endpoint.dataCenterIds),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    compute_type: text(endpoint.computeType) || null,
    gpu_count: finite(endpoint.gpuCount),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
    flashboot: endpoint.flashBoot ?? endpoint.flashboot ?? null,
    allowed_cuda_versions: sorted(endpoint.allowedCudaVersions),
    min_cuda_version: text(endpoint.minCudaVersion) || null,
  };
}

function sameStableSnapshot(snapshot, endpoint) {
  return JSON.stringify(snapshot) === JSON.stringify(stableEndpoint(endpoint));
}

function sameSet(left, right) {
  const a = sorted(left);
  const b = sorted(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function assertParked(endpoint, health, label) {
  if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 0) {
    throw new Error(`${label}_RESTING_0_0_REQUIRED:${endpoint.workersMin}:${endpoint.workersMax}`);
  }
  if (health.jobs.in_queue || health.jobs.in_progress) {
    throw new Error(`${label}_EMPTY_QUEUE_REQUIRED:${health.jobs.in_queue}:${health.jobs.in_progress}`);
  }
  if (Object.values(health.workers).some((value) => value > 0) || activeWorkers(endpoint).length) {
    throw new Error(`${label}_NO_ACTIVE_WORKER_REQUIRED`);
  }
}

async function loadEndpoint(managementKey, queueKey, endpointId = null) {
  const endpointRows = await rest(managementKey, "/endpoints?includeTemplate=true&includeWorkers=true");
  if (!Array.isArray(endpointRows)) throw new Error(`${CONTRACT}_ENDPOINT_LIST_INVALID`);
  const matches = endpointId
    ? endpointRows.filter((endpoint) => text(endpoint.id) === endpointId && text(endpoint.name) === ENDPOINT_NAME)
    : endpointRows.filter((endpoint) => text(endpoint.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  const endpoint = matches[0];
  const id = text(endpoint.id);
  if (!id) throw new Error(`${CONTRACT}_ENDPOINT_ID_REQUIRED`);
  const [healthRaw, topology] = await Promise.all([
    queueHealth(queueKey, id),
    endpointTopology(managementKey, id),
  ]);
  const health = healthSummary(healthRaw);
  return { endpoint, topology, endpointId: id, health };
}

function resolveVolumeBinding(endpoint, topology, volumeRows) {
  const restIds = endpointVolumes(endpoint);
  const graphqlIds = endpointVolumes(topology);
  if (restIds.length && graphqlIds.length && !sameSet(restIds, graphqlIds)) {
    throw new Error(`${CONTRACT}_REST_GRAPHQL_VOLUME_BINDING_MISMATCH:${restIds.join(",")}:${graphqlIds.join(",")}`);
  }
  const volumeIds = graphqlIds.length ? graphqlIds : restIds;
  if (volumeIds.length > 1) throw new Error(`${CONTRACT}_MULTIPLE_NETWORK_VOLUMES_UNSUPPORTED:${volumeIds.length}`);
  if (!volumeIds.length) {
    return {
      volume_ids: [],
      volume: null,
      datacenter_id: null,
      source: "NO_NETWORK_VOLUME",
      rest_volume_ids: restIds,
      graphql_volume_ids: graphqlIds,
    };
  }
  const volume = volumeRows.find((row) => text(row.id) === volumeIds[0]);
  if (!volume) throw new Error(`${CONTRACT}_VOLUME_NOT_FOUND:${volumeIds[0]}`);
  const datacenterId = text(volume.dataCenterId ?? volume.data_center_id);
  if (!datacenterId) throw new Error(`${CONTRACT}_VOLUME_DATACENTER_REQUIRED:${volumeIds[0]}`);
  const graphqlHints = unique(list(topology?.networkVolumeIds)
    .filter((entry) => text(entry?.networkVolumeId || entry?.id) === volumeIds[0])
    .map((entry) => entry?.dataCenterId));
  if (graphqlHints.length > 1 || (graphqlHints.length === 1 && graphqlHints[0] !== datacenterId)) {
    throw new Error(`${CONTRACT}_VOLUME_DATACENTER_MISMATCH:${datacenterId}:${graphqlHints.join(",")}`);
  }
  return {
    volume_ids: volumeIds,
    volume,
    datacenter_id: datacenterId,
    source: graphqlIds.length ? (restIds.length ? "REST_AND_GRAPHQL_ENDPOINT" : "GRAPHQL_ENDPOINT") : "REST_ENDPOINT",
    rest_volume_ids: restIds,
    graphql_volume_ids: graphqlIds,
  };
}

function resolveEffectivePlacement(endpoint, volumeBinding, gpuInventory) {
  const dataCenters = list(gpuInventory.dataCenters);
  if (volumeBinding.volume_ids.length === 1) {
    const dc = dataCenters.find((row) => text(row.id) === volumeBinding.datacenter_id);
    if (!dc) throw new Error(`${CONTRACT}_DATACENTER_NOT_FOUND:${volumeBinding.datacenter_id}`);
    if (dc.storageSupport !== true) throw new Error(`${CONTRACT}_DATACENTER_STORAGE_UNSUPPORTED:${volumeBinding.datacenter_id}`);
    return {
      source: "NETWORK_VOLUME_DATACENTER",
      data_center_ids: [volumeBinding.datacenter_id],
      data_centers: [dc],
      scheduler_rule: "ATTACHED_VOLUME_REQUIRES_STOCK_IN_EFFECTIVE_VOLUME_DATACENTER",
    };
  }

  const explicitIds = sorted(endpoint.dataCenterIds);
  if (explicitIds.length) {
    const matched = explicitIds.map((id) => dataCenters.find((row) => text(row.id) === id)).filter(Boolean);
    if (matched.length !== explicitIds.length) {
      const found = new Set(matched.map((row) => text(row.id)));
      const missing = explicitIds.filter((id) => !found.has(id));
      throw new Error(`${CONTRACT}_ENDPOINT_DATACENTER_NOT_FOUND:${missing.join(",")}`);
    }
    return {
      source: "ENDPOINT_DATACENTER_RESTRICTION",
      data_center_ids: explicitIds,
      data_centers: matched,
      scheduler_rule: "ENDPOINT_DATACENTER_RESTRICTION_REQUIRES_STOCK_IN_CONFIGURED_DATACENTER",
    };
  }

  if (!dataCenters.length) throw new Error(`${CONTRACT}_NO_DATACENTERS_RETURNED`);
  return {
    source: "GLOBAL_SERVERLESS_PLACEMENT",
    data_center_ids: [],
    data_centers: dataCenters,
    scheduler_rule: "NO_VOLUME_OR_DATACENTER_RESTRICTION_REQUIRES_CURRENT_GLOBAL_SERVERLESS_STOCK",
  };
}

function availabilityForPlacement(placement) {
  const map = new Map();
  for (const dc of placement.data_centers) {
    for (const row of list(dc?.gpuAvailability)) {
      const id = text(row?.gpuTypeId);
      if (!id) continue;
      if (!map.has(id)) map.set(id, []);
      map.get(id).push({
        ...row,
        data_center_id: text(dc?.id) || null,
        data_center_name: text(dc?.name) || null,
        data_center_location: text(dc?.location) || null,
      });
    }
  }
  return map;
}

function bestAvailability(rows) {
  return [...list(rows)].sort((a, b) => {
    const aAvailable = a?.available === true && stockRank(a?.stockStatus) > 0 ? 1 : 0;
    const bAvailable = b?.available === true && stockRank(b?.stockStatus) > 0 ? 1 : 0;
    return bAvailable - aAvailable || stockRank(b?.stockStatus) - stockRank(a?.stockStatus) || text(a?.data_center_id).localeCompare(text(b?.data_center_id));
  })[0] || null;
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_INTELLIGENCE_FAST_CAPACITY_REPAIR_APPROVED)) {
  throw new Error("AVANTIQO_INTELLIGENCE_FAST_CAPACITY_REPAIR_APPROVED=YES_REQUIRED");
}
const head = validateMain();
const managementKey = credential();
const queueKey = runtimeCredential(managementKey);

const [{ endpoint, topology, endpointId, health }, volumeRows, gpuInventory] = await Promise.all([
  loadEndpoint(managementKey, queueKey),
  rest(managementKey, "/networkvolumes"),
  inventory(managementKey),
]);
if (!Array.isArray(volumeRows)) throw new Error(`${CONTRACT}_VOLUME_LIST_INVALID`);
assertParked(endpoint, health, `${CONTRACT}_PRECHECK`);

const volumeBinding = resolveVolumeBinding(endpoint, topology, volumeRows);
const volumeIds = volumeBinding.volume_ids;
const placement = resolveEffectivePlacement(endpoint, volumeBinding, gpuInventory);
const availability = availabilityForPlacement(placement);

const compatible = list(gpuInventory.gpuTypes)
  .map((row) => {
    const profile = profileFor(row);
    return {
      id: text(row.id),
      display_name: text(row.displayName) || null,
      memory_gb: finite(row.memoryInGb),
      secure_cloud: row.secureCloud === true,
      profile: profile?.key || null,
      priority: profile?.priority || 0,
    };
  })
  .filter((row) => row.id && row.profile && row.memory_gb >= MINIMUM_VRAM_GB && row.secure_cloud)
  .filter((row) => availability.has(row.id))
  .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
const targetPool = compatible.slice(0, MAX_GPU_FALLBACKS).map((row) => row.id);
if (!targetPool.length) throw new Error(`${CONTRACT}_NO_COMPATIBLE_GPU_TYPES_IN_EFFECTIVE_PLACEMENT:${placement.source}`);
const poolRows = targetPool.map((id) => {
  const global = compatible.find((row) => row.id === id);
  const liveRows = availability.get(id) || [];
  const best = bestAvailability(liveRows) || {};
  const stockedDataCenters = liveRows
    .filter((row) => row?.available === true && stockRank(row?.stockStatus) > 0)
    .map((row) => row.data_center_id)
    .filter(Boolean);
  return {
    gpu_type_id: id,
    gpu_name: global?.display_name || text(best.gpuTypeDisplayName || best.displayName) || null,
    profile: global?.profile || null,
    memory_gb: global?.memory_gb ?? null,
    available: stockedDataCenters.length > 0,
    stock_status: text(best.stockStatus).toUpperCase() || "NOT_LISTED",
    stock_rank: stockRank(best.stockStatus),
    best_data_center_id: best.data_center_id || null,
    stocked_data_center_ids: unique(stockedDataCenters),
  };
});
const stocked = poolRows.filter((row) => row.available && row.stock_rank > 0);
if (!stocked.length) {
  throw new Error(`${CONTRACT}_NO_CURRENT_STOCKED_COMPATIBLE_GPU_IN_EFFECTIVE_PLACEMENT:${placement.source}`);
}

const currentPool = unique(endpoint.gpuTypeIds);
const mutationRequired = !sameSet(currentPool, targetPool);
const beforeStable = stableEndpoint(endpoint);
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  repository_head: head,
  endpoint_name: ENDPOINT_NAME,
  network_volume_ids: volumeIds,
  network_volume_resolution_source: volumeBinding.source,
  volume_datacenter_id: volumeBinding.datacenter_id,
  effective_placement_source: placement.source,
  effective_data_center_ids: placement.data_center_ids,
  scheduler_rule: placement.scheduler_rule,
  current_gpu_type_ids: currentPool,
  target_gpu_type_ids: targetPool,
  stocked_compatible_targets: stocked,
  mutation_required: mutationRequired,
  endpoint_scaling_mutation_performed: false,
  queue_mutation_performed: false,
  template_mutation_performed: false,
  volume_mutation_performed: false,
  inference_performed: false,
  provider_job_submitted: false,
  database_mutation_performed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

if (!apply || !mutationRequired) {
  console.log(JSON.stringify(plan, null, 2));
  console.log(`${CONTRACT}=PASS`);
  process.exit(0);
}

const immediate = await loadEndpoint(managementKey, queueKey, endpointId);
assertParked(immediate.endpoint, immediate.health, `${CONTRACT}_IMMEDIATE_PREPATCH`);
if (!sameStableSnapshot(beforeStable, immediate.endpoint)) throw new Error(`${CONTRACT}_NON_GPU_ENDPOINT_CHANGED_DURING_PREFLIGHT`);
if (!sameSet(currentPool, unique(immediate.endpoint.gpuTypeIds))) throw new Error(`${CONTRACT}_GPU_POOL_CHANGED_DURING_PREFLIGHT`);
const immediateVolumeBinding = resolveVolumeBinding(immediate.endpoint, immediate.topology, volumeRows);
if (!sameSet(volumeIds, immediateVolumeBinding.volume_ids)) throw new Error(`${CONTRACT}_VOLUME_BINDING_CHANGED_DURING_PREFLIGHT`);

await rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}`, {
  method: "PATCH",
  body: { gpuTypeIds: targetPool },
});

let verifyFailure = null;
let verified = null;
try {
  verified = await loadEndpoint(managementKey, queueKey, endpointId);
  assertParked(verified.endpoint, verified.health, `${CONTRACT}_POSTPATCH`);
  if (!sameSet(unique(verified.endpoint.gpuTypeIds), targetPool)) throw new Error(`${CONTRACT}_TARGET_POOL_NOT_PERSISTED`);
  if (!sameStableSnapshot(beforeStable, verified.endpoint)) throw new Error(`${CONTRACT}_NON_GPU_ENDPOINT_INVARIANT_CHANGED`);
  const verifiedVolumeBinding = resolveVolumeBinding(verified.endpoint, verified.topology, volumeRows);
  if (!sameSet(volumeIds, verifiedVolumeBinding.volume_ids)) throw new Error(`${CONTRACT}_VOLUME_BINDING_CHANGED`);
} catch (error) {
  verifyFailure = error;
}

if (verifyFailure) {
  let rollback = "NOT_ATTEMPTED";
  try {
    const rollbackPrecheck = await loadEndpoint(managementKey, queueKey, endpointId);
    assertParked(rollbackPrecheck.endpoint, rollbackPrecheck.health, `${CONTRACT}_ROLLBACK_PRECHECK`);
    if (!sameStableSnapshot(beforeStable, rollbackPrecheck.endpoint)) {
      throw new Error(`${CONTRACT}_ROLLBACK_BLOCKED_NON_GPU_ENDPOINT_CHANGED`);
    }
    const rollbackVolumeBinding = resolveVolumeBinding(rollbackPrecheck.endpoint, rollbackPrecheck.topology, volumeRows);
    if (!sameSet(volumeIds, rollbackVolumeBinding.volume_ids)) {
      throw new Error(`${CONTRACT}_ROLLBACK_BLOCKED_VOLUME_BINDING_CHANGED`);
    }
    await rest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}`, {
      method: "PATCH",
      body: { gpuTypeIds: currentPool },
    });
    const rolledBack = await loadEndpoint(managementKey, queueKey, endpointId);
    assertParked(rolledBack.endpoint, rolledBack.health, `${CONTRACT}_ROLLBACK_VERIFY`);
    const rolledBackVolumeBinding = resolveVolumeBinding(rolledBack.endpoint, rolledBack.topology, volumeRows);
    rollback = sameStableSnapshot(beforeStable, rolledBack.endpoint)
      && sameSet(unique(rolledBack.endpoint.gpuTypeIds), currentPool)
      && sameSet(volumeIds, rolledBackVolumeBinding.volume_ids)
      ? "PASS"
      : "FAIL_VERIFICATION";
  } catch (rollbackError) {
    rollback = `FAIL:${redact(rollbackError?.message || rollbackError)}`;
  }
  throw new Error(`${CONTRACT}_POSTPATCH_VERIFY_FAILED:${redact(verifyFailure?.message || verifyFailure)}:rollback=${rollback}`);
}

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  mutation_required: true,
  gpu_pool_mutation_performed: true,
  final_gpu_type_ids: unique(verified.endpoint.gpuTypeIds),
  non_gpu_endpoint_invariants_preserved: true,
  effective_placement_preserved: true,
  immediate_prepatch_rest_state_verified: true,
  rollback_available_if_verification_fails: true,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
