import {
  AVANTIQO_VIDEO_POD_IMAGE,
  AVANTIQO_VIDEO_POD_NAME_PREFIX,
  createVideoPod,
  deleteVideoPod,
  finite,
  getVideoPod,
  list,
  listVideoPods,
  podRest,
  podTerminal,
  text,
} from "./AvantiqoVideoPodRunpod.js";

export const AVANTIQO_VIDEO_POD_FAILOVER_DC = "US-NC-2";
export const AVANTIQO_VIDEO_POD_FAILOVER_VOLUME_ID = "7pcdebhpga";
export const AVANTIQO_VIDEO_POD_FAILOVER_VOLUME_NAME = "avantiqo-shared-image-video-cache";
export const AVANTIQO_VIDEO_POD_PRIMARY_DC = "EU-RO-1";
export const AVANTIQO_VIDEO_POD_PRIMARY_VOLUME_NAME = "avantiqo-video-cache-eu-ro-1";

const GRAPHQL = "https://api.runpod.io/graphql";
const QUEUE = "https://api.runpod.ai/v2";
const TERMINAL = new Set(["EXITED", "TERMINATED", "DELETED", "STOPPED"]);
const POD_PLACEMENT_RAM_GB = Object.freeze([96, 64]);
const NO_INSTANCE_PATTERN = /no instances currently available/i;
const FALLBACK_GPU_FAMILY_PATTERNS = Object.freeze([
  /RTX PRO 6000 Blackwell/i,
  /H200/i,
  /H100/i,
  /A100/i,
  /B200/i,
]);

const rank = (value) => ({ HIGH: 4, MEDIUM: 3, LOW: 2, AVAILABLE: 1 })[text(value).toUpperCase()] || 0;

function key() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
  return value;
}

function queueKey(endpoint = {}) {
  const image = text(endpoint?.name).toLowerCase().includes("image");
  return text(
    (image ? process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY : process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) ||
    process.env.RUNPOD_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY,
  );
}

function normalizeRows(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const childKey of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, childKey)) continue;
    const nested = normalizeRows(value[childKey], keys, depth + 1);
    if (nested.length || Array.isArray(value[childKey])) return nested;
  }
  return [];
}

function currentStatus(value = {}) {
  return text(value?.status ?? value?.workerStatus ?? value?.runtimeStatus).toUpperCase();
}

function desiredStatus(value = {}) {
  return text(value?.desiredStatus ?? value?.desired_status).toUpperCase();
}

function activeWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const current = currentStatus(worker);
    const desired = desiredStatus(worker);
    if (current && !TERMINAL.has(current)) return true;
    if (desired && !TERMINAL.has(desired)) return true;
    return !current && !desired;
  });
}

function volumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId ?? endpoint.network_volume_id),
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids).map((entry) =>
      text(typeof entry === "string" ? entry : entry?.id ?? entry?.networkVolumeId ?? entry?.network_volume_id)),
  ].filter(Boolean))];
}

function podVolumeId(pod = {}) {
  return text(pod?.networkVolume?.id ?? pod?.networkVolumeId ?? pod?.network_volume_id);
}

function podGpuTypeId(pod = {}) {
  return text(
    pod?.machine?.gpuTypeId ??
    pod?.machine?.gpuType?.id ??
    pod?.gpu?.id ??
    pod?.gpuTypeId ??
    pod?.gpu_type_id,
  );
}

async function queueHealth(endpoint = {}) {
  const qk = queueKey(endpoint);
  if (!qk) throw new Error("AVANTIQO_VIDEO_POD_FAILOVER_QUEUE_KEY_REQUIRED");
  const response = await fetch(`${QUEUE}/${encodeURIComponent(text(endpoint.id))}/health`, {
    headers: { Authorization: `Bearer ${qk}`, Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`AVANTIQO_VIDEO_POD_FAILOVER_HEALTH_HTTP_${response.status}`);
  return {
    queued: finite(body?.jobs?.inQueue ?? body?.jobs?.in_queue, 0),
    progress: finite(body?.jobs?.inProgress ?? body?.jobs?.in_progress, 0),
    unhealthy: finite(body?.workers?.unhealthy, 0),
    throttled: finite(body?.workers?.throttled, 0),
  };
}

function compatibleFallbackFamily(id, displayName, memoryGb, secureCloud) {
  if (secureCloud !== true || finite(memoryGb, 0) < 80) return false;
  const haystack = `${text(id)} ${text(displayName)}`;
  return FALLBACK_GPU_FAMILY_PATTERNS.some((pattern) => pattern.test(haystack));
}

async function failoverCapacity() {
  const query = `query VideoPodFailover($input:GpuAvailabilityInput){gpuTypes{id displayName memoryInGb secureCloud} dataCenters{id gpuAvailability(input:$input){available stockStatus gpuTypeId gpuTypeDisplayName displayName}}}`;
  const response = await fetch(`${GRAPHQL}?api_key=${encodeURIComponent(key())}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 AvantiqoVideoPodV72Failover",
    },
    body: JSON.stringify({ query, variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 80, secureCloud: true } } }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`AVANTIQO_VIDEO_POD_FAILOVER_CAPACITY_HTTP_${response.status}`);
  const errors = list(body?.errors).map((entry) => text(entry?.message)).filter(Boolean);
  if (errors.length) throw new Error(`AVANTIQO_VIDEO_POD_FAILOVER_CAPACITY_GRAPHQL:${errors.join(" | ").slice(0, 500)}`);
  const gpuTypes = new Map(list(body?.data?.gpuTypes).map((row) => [text(row?.id), row]));
  const dc = list(body?.data?.dataCenters).find((row) => text(row?.id) === AVANTIQO_VIDEO_POD_FAILOVER_DC) || {};
  const candidates = list(dc?.gpuAvailability)
    .map((row) => {
      const id = text(row?.gpuTypeId);
      const meta = gpuTypes.get(id) || {};
      const displayName = text(row?.gpuTypeDisplayName || row?.displayName || meta?.displayName);
      return {
        gpu_type_id: id,
        display_name: displayName || null,
        memory_gb: finite(meta?.memoryInGb, null),
        secure_cloud: meta?.secureCloud === true,
        available: row?.available === true,
        stock: text(row?.stockStatus).toUpperCase() || "UNAVAILABLE",
        stock_rank: rank(row?.stockStatus),
      };
    })
    .filter((row) => row.available && row.stock_rank > 0 && compatibleFallbackFamily(row.gpu_type_id, row.display_name, row.memory_gb, row.secure_cloud))
    .sort((a, b) => b.stock_rank - a.stock_rank || finite(b.memory_gb, 0) - finite(a.memory_gb, 0) || a.gpu_type_id.localeCompare(b.gpu_type_id));
  if (!candidates.length) throw new Error("AVANTIQO_VIDEO_POD_FAILOVER_US_NC2_NO_COMPATIBLE_CAPACITY");
  return {
    gpu_type_ids: candidates.map((row) => row.gpu_type_id),
    candidates,
  };
}

async function inspectFailoverSnapshot() {
  const [rawVolumes, rawEndpoints, rawPods, capacity] = await Promise.all([
    podRest("/networkvolumes"),
    podRest("/endpoints?includeTemplate=false&includeWorkers=true"),
    podRest("/pods"),
    failoverCapacity(),
  ]);
  const volumes = normalizeRows(rawVolumes, ["networkVolumes", "networkvolumes", "volumes"]);
  const endpoints = normalizeRows(rawEndpoints, ["endpoints", "serverlessEndpoints"]);
  const pods = normalizeRows(rawPods, ["pods"]);
  const matches = volumes.filter((volume) =>
    text(volume?.id) === AVANTIQO_VIDEO_POD_FAILOVER_VOLUME_ID &&
    text(volume?.name) === AVANTIQO_VIDEO_POD_FAILOVER_VOLUME_NAME &&
    text(volume?.dataCenterId ?? volume?.data_center_id) === AVANTIQO_VIDEO_POD_FAILOVER_DC,
  );
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_POD_FAILOVER_VOLUME_INVALID:${matches.length}`);
  const volume = matches[0];
  if (finite(volume?.size ?? volume?.sizeGb, 0) < 400) throw new Error("AVANTIQO_VIDEO_POD_FAILOVER_VOLUME_TOO_SMALL");

  const peers = endpoints.filter((endpoint) => volumeIds(endpoint).includes(AVANTIQO_VIDEO_POD_FAILOVER_VOLUME_ID));
  for (const peer of peers) {
    if (activeWorkers(peer).length) throw new Error(`AVANTIQO_VIDEO_POD_FAILOVER_ACTIVE_WORKER:${text(peer?.name)}`);
    const state = await queueHealth(peer);
    if (state.queued || state.progress || state.unhealthy || state.throttled) {
      throw new Error(`AVANTIQO_VIDEO_POD_FAILOVER_SHARED_CACHE_BUSY:${text(peer?.name)}`);
    }
  }

  const activePods = pods.filter((pod) => podVolumeId(pod) === AVANTIQO_VIDEO_POD_FAILOVER_VOLUME_ID && !podTerminal(pod));
  if (activePods.length) throw new Error(`AVANTIQO_VIDEO_POD_FAILOVER_ACTIVE_POD:${activePods.length}`);
  return { volume, capacity };
}

function placementUnavailable(error) {
  return Number(error?.httpStatus) === 500 && NO_INSTANCE_PATTERN.test(text(error?.message));
}

function primaryPlacementExhausted(error) {
  return /^AVANTIQO_VIDEO_POD_PLACEMENT_EXHAUSTED:/.test(text(error?.message));
}

async function findExistingOwnerPod(ownerRequestId, allowedVolumeIds) {
  const name = `${AVANTIQO_VIDEO_POD_NAME_PREFIX}${ownerRequestId}`;
  const matches = (await listVideoPods()).filter((pod) => text(pod?.name) === name && !podTerminal(pod));
  if (matches.length > 1) throw new Error(`AVANTIQO_VIDEO_POD_FAILOVER_CREATE_AMBIGUOUS:${matches.length}`);
  if (!matches.length) return null;
  const existing = matches[0];
  const volumeId = podVolumeId(existing);
  if (volumeId && !allowedVolumeIds.includes(volumeId)) throw new Error(`AVANTIQO_VIDEO_POD_FAILOVER_UNEXPECTED_VOLUME:${volumeId}`);
  return existing;
}

function failoverCreateBody({ ownerRequestId, snapshot, env, command, failover, minRAMPerGPU }) {
  return {
    allowedCudaVersions: ["12.8", "12.9", "13.0"],
    cloudType: "SECURE",
    computeType: "GPU",
    containerDiskInGb: Math.max(30, finite(snapshot.template?.containerDiskInGb ?? snapshot.template?.container_disk_gb, 30)),
    ...(snapshot.registryAuthId ? { containerRegistryAuthId: snapshot.registryAuthId } : {}),
    dataCenterIds: [AVANTIQO_VIDEO_POD_FAILOVER_DC],
    dataCenterPriority: "availability",
    dockerEntrypoint: [],
    dockerStartCmd: ["python", "-u", "-c", command],
    env,
    gpuCount: 1,
    gpuTypeIds: failover.capacity.gpu_type_ids,
    gpuTypePriority: "availability",
    imageName: AVANTIQO_VIDEO_POD_IMAGE,
    interruptible: false,
    minRAMPerGPU,
    minVCPUPerGPU: 4,
    name: `${AVANTIQO_VIDEO_POD_NAME_PREFIX}${ownerRequestId}`,
    networkVolumeId: AVANTIQO_VIDEO_POD_FAILOVER_VOLUME_ID,
    ports: [],
    volumeMountPath: "/runpod-volume",
  };
}

async function createFailoverPod({ ownerRequestId, snapshot, env, command }) {
  const failover = await inspectFailoverSnapshot();
  let created = null;
  let lastPlacementError = null;
  for (const minRAMPerGPU of POD_PLACEMENT_RAM_GB) {
    try {
      created = await podRest("/pods", {
        method: "POST",
        timeoutMs: 45_000,
        body: failoverCreateBody({ ownerRequestId, snapshot, env, command, failover, minRAMPerGPU }),
      });
      break;
    } catch (error) {
      if (!placementUnavailable(error)) throw error;
      lastPlacementError = error;
      const existing = await findExistingOwnerPod(ownerRequestId, [text(snapshot.volume?.id), AVANTIQO_VIDEO_POD_FAILOVER_VOLUME_ID]);
      if (existing) {
        created = existing;
        break;
      }
    }
  }
  if (!created) {
    const exhausted = new Error(`AVANTIQO_VIDEO_POD_MULTI_VOLUME_PLACEMENT_EXHAUSTED:${AVANTIQO_VIDEO_POD_PRIMARY_DC}_${AVANTIQO_VIDEO_POD_FAILOVER_DC}:${text(lastPlacementError?.message).split(":").slice(1).join(":") || "NO_INSTANCES"}`);
    exhausted.httpStatus = Number(lastPlacementError?.httpStatus) || 500;
    throw exhausted;
  }

  const id = text(created?.id ?? created?.pod?.id ?? created?.data?.id);
  if (!id) throw new Error("AVANTIQO_VIDEO_POD_FAILOVER_CREATE_ID_REQUIRED");
  const verified = await getVideoPod(id);
  if (!verified || text(verified?.name) !== `${AVANTIQO_VIDEO_POD_NAME_PREFIX}${ownerRequestId}`) throw new Error("AVANTIQO_VIDEO_POD_FAILOVER_CREATE_VERIFY_FAILED");
  if (podVolumeId(verified) !== AVANTIQO_VIDEO_POD_FAILOVER_VOLUME_ID) throw new Error("AVANTIQO_VIDEO_POD_FAILOVER_CREATE_VOLUME_VERIFY_FAILED");
  const selectedGpuTypeId = podGpuTypeId(verified);
  if (selectedGpuTypeId && !failover.capacity.gpu_type_ids.includes(selectedGpuTypeId)) {
    await deleteVideoPod(id).catch(() => null);
    throw new Error(`AVANTIQO_VIDEO_POD_FAILOVER_GPU_OUTSIDE_CERTIFIED_POOL:${selectedGpuTypeId}`);
  }
  return {
    ...verified,
    avantiqoSelectedGpuTypeId: selectedGpuTypeId || null,
    avantiqoEligibleGpuTypeIds: failover.capacity.gpu_type_ids,
    avantiqoGpuTypeCertified: true,
    avantiqoSelectedDataCenterId: AVANTIQO_VIDEO_POD_FAILOVER_DC,
    avantiqoSelectedVolumeId: AVANTIQO_VIDEO_POD_FAILOVER_VOLUME_ID,
    avantiqoSelectedVolumeName: AVANTIQO_VIDEO_POD_FAILOVER_VOLUME_NAME,
    avantiqoPlacementMode: "US_NC2_SOURCE_CACHE_FAILOVER",
  };
}

export async function createVideoPodWithCertifiedVolumeFailover(args) {
  try {
    const primary = await createVideoPod(args);
    return {
      ...primary,
      avantiqoEligibleGpuTypeIds: [],
      avantiqoGpuTypeCertified: true,
      avantiqoSelectedDataCenterId: AVANTIQO_VIDEO_POD_PRIMARY_DC,
      avantiqoSelectedVolumeId: text(args?.snapshot?.volume?.id) || null,
      avantiqoSelectedVolumeName: text(args?.snapshot?.volume?.name) || AVANTIQO_VIDEO_POD_PRIMARY_VOLUME_NAME,
      avantiqoPlacementMode: "EU_RO1_REPLICA_PRIMARY",
    };
  } catch (error) {
    if (!primaryPlacementExhausted(error) || !NO_INSTANCE_PATTERN.test(text(error?.message))) throw error;
    return createFailoverPod(args);
  }
}
