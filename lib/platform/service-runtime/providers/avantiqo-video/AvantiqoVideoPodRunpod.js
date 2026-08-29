export const AVANTIQO_VIDEO_POD_NAME_PREFIX = "avantiqo-video-pod-v72-";
export const AVANTIQO_VIDEO_POD_GPU = "NVIDIA RTX PRO 4500 Blackwell";
export const AVANTIQO_VIDEO_POD_DC = "EU-RO-1";
export const AVANTIQO_VIDEO_POD_IMAGE = "ghcr.io/churchillkaron/avantiqo-video-worker-32gb-candidate@sha256:44ef09f27a402b2890007a3620b772240913e68fa6ceafcc06436af2c1023adc";
export const AVANTIQO_VIDEO_POD_CACHE_VOLUME = "avantiqo-video-cache-eu-ro-1";

const REST = "https://rest.runpod.io/v1";
const GRAPHQL = "https://api.runpod.io/graphql";
const QUEUE = "https://api.runpod.ai/v2";
const CANDIDATE = "avantiqo-video-32gb-candidate-v1";
const TERMINAL = new Set(["EXITED", "TERMINATED", "DELETED", "STOPPED"]);
const T2V = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const I2V = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";

export const text = (v) => String(v ?? "").trim();
export const list = (v) => Array.isArray(v) ? v : [];
export const finite = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const rank = (v) => ({ HIGH: 4, MEDIUM: 3, LOW: 2, AVAILABLE: 1 })[text(v).toUpperCase()] || 0;
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};

function normalizeRows(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = normalizeRows(value[key], keys, depth + 1);
    if (nested.length || Array.isArray(value[key])) return nested;
  }
  return [];
}

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
        .filter(([name]) => Boolean(name)),
    );
  }
  return Object.fromEntries(
    Object.entries(object(value)).map(([name, child]) => [String(name), String(child ?? "")]),
  );
}

function endpointTemplateId(endpoint = {}) {
  const embedded = endpoint?.template;
  return text(
    endpoint?.templateId ??
    endpoint?.template_id ??
    (typeof embedded === "string" ? embedded : embedded?.id),
  );
}

function templateRegistryAuthId(template = {}) {
  return text(template?.containerRegistryAuthId ?? template?.container_registry_auth_id);
}

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
export async function runpodJson(url, options = {}, explicitKey = key()) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${explicitKey}`,
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 AvantiqoVideoPodV72",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).replace(/\s+/g, " ").slice(0, 500);
    const error = new Error(`AVANTIQO_VIDEO_POD_HTTP_${response.status}:${detail || "UNKNOWN"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body ?? {};
}
export const podRest = (path, options = {}) => runpodJson(`${REST}${path}`, options);

async function resolveRegistryAuthId(template = {}) {
  const listedId = templateRegistryAuthId(template);
  if (listedId) return listedId;

  const templateId = text(template?.id);
  if (templateId) {
    try {
      const directBody = await podRest(`/templates/${encodeURIComponent(templateId)}`);
      const directTemplate = directBody?.template || directBody?.data || directBody;
      const directId = templateRegistryAuthId(directTemplate);
      if (directId) return directId;
    } catch (error) {
      if (Number(error?.httpStatus) !== 404) {
        // The list endpoint is allowed to redact registry auth metadata. Keep the
        // preflight read-only and fall through to the same inventory lookup V69
        // used when it originally provisioned the candidate.
      }
    }
  }

  const rawRegistryAuths = await podRest("/containerregistryauth");
  const registryAuths = normalizeRows(rawRegistryAuths, [
    "containerRegistryAuths",
    "containerRegistryAuth",
    "containerregistryauth",
    "registryAuths",
  ]);
  if (!registryAuths.length) throw new Error("AVANTIQO_VIDEO_POD_REGISTRY_AUTH_INVENTORY_REQUIRED");

  const explicit = text(
    process.env.AVANTIQO_VIDEO_RUNPOD_REGISTRY_AUTH_ID ||
    process.env.AVANTIQO_VIDEO_32GB_CANDIDATE_RUNPOD_REGISTRY_AUTH_ID,
  );
  if (explicit) {
    const matches = registryAuths.filter((item) => text(item?.id) === explicit);
    if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_POD_REGISTRY_AUTH_EXPLICIT_INVALID:${matches.length}`);
    return explicit;
  }

  const matches = registryAuths.filter((item) => /ghcr|github/i.test(text(item?.name)));
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_POD_GHCR_AUTH_AMBIGUOUS:${matches.length}`);
  const id = text(matches[0]?.id);
  if (!id) throw new Error("AVANTIQO_VIDEO_POD_REGISTRY_AUTH_ID_REQUIRED");
  return id;
}

const currentStatus = (value = {}) => text(value?.status ?? value?.workerStatus ?? value?.runtimeStatus).toUpperCase();
const desiredStatus = (value = {}) => text(value?.desiredStatus ?? value?.desired_status).toUpperCase();
export const podTerminal = (pod = {}) => {
  const current = currentStatus(pod);
  const desired = desiredStatus(pod);
  if (current) return TERMINAL.has(current);
  return Boolean(desired && TERMINAL.has(desired));
};
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
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids).map((entry) => text(typeof entry === "string" ? entry : entry?.id ?? entry?.networkVolumeId ?? entry?.network_volume_id)),
  ].filter(Boolean))];
}
async function health(endpoint) {
  const qk = queueKey(endpoint);
  if (!qk) throw new Error("AVANTIQO_VIDEO_POD_QUEUE_KEY_REQUIRED");
  const body = await runpodJson(`${QUEUE}/${encodeURIComponent(text(endpoint.id))}/health`, { timeoutMs: 12_000 }, qk);
  return {
    queued: finite(body?.jobs?.inQueue ?? body?.jobs?.in_queue, 0),
    progress: finite(body?.jobs?.inProgress ?? body?.jobs?.in_progress, 0),
    unhealthy: finite(body?.workers?.unhealthy, 0),
    throttled: finite(body?.workers?.throttled, 0),
  };
}
export async function videoPodCapacity() {
  const query = `query VideoPod($input:GpuAvailabilityInput){gpuTypes{id memoryInGb secureCloud} dataCenters{id gpuAvailability(input:$input){available stockStatus gpuTypeId}}}`;
  const response = await fetch(`${GRAPHQL}?api_key=${encodeURIComponent(key())}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key()}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 AvantiqoVideoPodV72",
    },
    body: JSON.stringify({ query, variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 32, secureCloud: true } } }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`AVANTIQO_VIDEO_POD_CAPACITY_HTTP_${response.status}`);
  const errors = list(body?.errors).map((entry) => text(entry?.message)).filter(Boolean);
  if (errors.length) throw new Error(`AVANTIQO_VIDEO_POD_CAPACITY_GRAPHQL:${errors.join(" | ").slice(0, 500)}`);
  if (!body?.data) throw new Error("AVANTIQO_VIDEO_POD_CAPACITY_DATA_REQUIRED");
  const gpu = list(body.data.gpuTypes).find((row) => text(row?.id) === AVANTIQO_VIDEO_POD_GPU) || {};
  const dc = list(body.data.dataCenters).find((row) => text(row?.id) === AVANTIQO_VIDEO_POD_DC) || {};
  const row = list(dc?.gpuAvailability).find((item) => text(item?.gpuTypeId) === AVANTIQO_VIDEO_POD_GPU) || {};
  return {
    gpu_type_id: AVANTIQO_VIDEO_POD_GPU,
    data_center_id: AVANTIQO_VIDEO_POD_DC,
    memory_gb: finite(gpu.memoryInGb, null),
    secure_cloud: gpu.secureCloud === true,
    available: row.available === true,
    stock: text(row.stockStatus).toUpperCase() || "UNAVAILABLE",
    stock_rank: rank(row.stockStatus),
  };
}
export async function videoPodCandidateSnapshot() {
  const [rawEndpoints, rawTemplates, rawVolumes, rawPods] = await Promise.all([
    podRest("/endpoints?includeTemplate=true&includeWorkers=true"),
    podRest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false"),
    podRest("/networkvolumes"),
    podRest("/pods"),
  ]);
  const endpoints = normalizeRows(rawEndpoints, ["endpoints", "serverlessEndpoints"]);
  const templates = normalizeRows(rawTemplates, ["templates"]);
  const volumes = normalizeRows(rawVolumes, ["networkVolumes", "networkvolumes"]);
  const pods = normalizeRows(rawPods, ["pods"]);
  if (!endpoints.length) throw new Error("AVANTIQO_VIDEO_POD_ENDPOINT_INVENTORY_REQUIRED");
  if (!templates.length) throw new Error("AVANTIQO_VIDEO_POD_TEMPLATE_INVENTORY_REQUIRED");
  if (!volumes.length) throw new Error("AVANTIQO_VIDEO_POD_VOLUME_INVENTORY_REQUIRED");
  const candidates = endpoints.filter((row) => text(row?.name) === CANDIDATE);
  if (candidates.length !== 1) throw new Error(`AVANTIQO_VIDEO_POD_CANDIDATE_AMBIGUOUS:${candidates.length}`);
  const candidate = candidates[0];
  if (finite(candidate.workersMin ?? candidate.workers_min, -1) !== 0 || finite(candidate.workersMax ?? candidate.workers_max, -1) !== 0 || activeWorkers(candidate).length) {
    throw new Error("AVANTIQO_VIDEO_POD_CANDIDATE_MUST_REMAIN_0_0");
  }
  const ids = volumeIds(candidate);
  const matches = volumes.filter((volume) => ids.includes(text(volume?.id)) && text(volume?.name) === AVANTIQO_VIDEO_POD_CACHE_VOLUME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_POD_CACHE_VOLUME_AMBIGUOUS:${matches.length}`);
  const volume = matches[0];
  if (text(volume.dataCenterId ?? volume.data_center_id) !== AVANTIQO_VIDEO_POD_DC || finite(volume.size ?? volume.sizeGb, 0) < 400) {
    throw new Error("AVANTIQO_VIDEO_POD_CACHE_VOLUME_INVALID");
  }
  const templateId = endpointTemplateId(candidate);
  const template = templates.find((row) => text(row?.id) === templateId) || null;
  if (!template) throw new Error(`AVANTIQO_VIDEO_POD_TEMPLATE_REQUIRED:${templateId || "MISSING_ID"}`);
  if (text(template.imageName ?? template.image_name) !== AVANTIQO_VIDEO_POD_IMAGE) throw new Error("AVANTIQO_VIDEO_POD_IMMUTABLE_IMAGE_MISMATCH");
  const registryAuthId = await resolveRegistryAuthId(template);
  if (!registryAuthId) throw new Error("AVANTIQO_VIDEO_POD_REGISTRY_AUTH_REQUIRED");
  const env = normalizeEnv(template.env);
  if (text(env.AVANTIQO_VIDEO_HF_CACHE_ROOT) !== "/runpod-volume/huggingface-cache/hub" || text(env.AVANTIQO_VIDEO_T2V_MODEL) !== T2V || text(env.AVANTIQO_VIDEO_I2V_MODEL) !== I2V || text(env.AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL) !== "1") {
    throw new Error("AVANTIQO_VIDEO_POD_TEMPLATE_ENV_INVALID");
  }
  const peers = endpoints.filter((row) => volumeIds(row).includes(text(volume.id)));
  for (const peer of peers) {
    if (activeWorkers(peer).length) throw new Error(`AVANTIQO_VIDEO_POD_SHARED_CACHE_ACTIVE_WORKER:${text(peer.name)}`);
    const state = await health(peer);
    if (state.queued || state.progress || state.unhealthy || state.throttled) throw new Error(`AVANTIQO_VIDEO_POD_SHARED_CACHE_BUSY:${text(peer.name)}`);
  }
  const activePods = pods.filter((pod) => text(pod?.networkVolume?.id ?? pod?.networkVolumeId ?? pod?.network_volume_id) === text(volume.id) && !podTerminal(pod));
  if (activePods.length) throw new Error(`AVANTIQO_VIDEO_POD_SHARED_CACHE_ACTIVE_POD:${activePods.length}`);
  return { candidate, volume, template, templateEnv: env, registryAuthId };
}
export async function createVideoPod({ ownerRequestId, snapshot, env, command }) {
  const created = await podRest("/pods", {
    method: "POST",
    timeoutMs: 45_000,
    body: {
      allowedCudaVersions: ["12.8", "12.9", "13.0"],
      cloudType: "SECURE",
      computeType: "GPU",
      containerDiskInGb: Math.max(30, finite(snapshot.template?.containerDiskInGb ?? snapshot.template?.container_disk_gb, 30)),
      containerRegistryAuthId: snapshot.registryAuthId,
      dataCenterIds: [AVANTIQO_VIDEO_POD_DC],
      dataCenterPriority: "custom",
      dockerEntrypoint: [],
      dockerStartCmd: ["python", "-u", "-c", command],
      env,
      gpuCount: 1,
      gpuTypeIds: [AVANTIQO_VIDEO_POD_GPU],
      gpuTypePriority: "custom",
      imageName: AVANTIQO_VIDEO_POD_IMAGE,
      interruptible: false,
      minRAMPerGPU: 128,
      minVCPUPerGPU: 4,
      name: `${AVANTIQO_VIDEO_POD_NAME_PREFIX}${ownerRequestId}`,
      networkVolumeId: text(snapshot.volume.id),
      ports: [],
      volumeMountPath: "/runpod-volume",
    },
  });
  const id = text(created?.id ?? created?.pod?.id ?? created?.data?.id);
  if (!id) throw new Error("AVANTIQO_VIDEO_POD_CREATE_ID_REQUIRED");
  const verified = await getVideoPod(id);
  if (!verified || text(verified?.name) !== `${AVANTIQO_VIDEO_POD_NAME_PREFIX}${ownerRequestId}`) throw new Error("AVANTIQO_VIDEO_POD_CREATE_VERIFY_FAILED");
  if (text(verified?.networkVolume?.id ?? verified?.networkVolumeId ?? verified?.network_volume_id) !== text(snapshot.volume.id)) throw new Error("AVANTIQO_VIDEO_POD_CREATE_VOLUME_VERIFY_FAILED");
  return verified;
}
export async function getVideoPod(id) {
  try {
    const body = await podRest(`/pods/${encodeURIComponent(id)}`, { timeoutMs: 20_000 });
    return body?.pod || body?.data || body;
  } catch (error) {
    if (Number(error?.httpStatus) === 404) return null;
    throw error;
  }
}
export async function deleteVideoPod(id) {
  if (!text(id)) return false;
  try { await podRest(`/pods/${encodeURIComponent(id)}`, { method: "DELETE" }); return true; }
  catch (error) { if (Number(error?.httpStatus) === 404) return false; throw error; }
}
export async function listVideoPods() {
  const pods = normalizeRows(await podRest("/pods"), ["pods"]);
  return pods.filter((pod) => text(pod?.name).startsWith(AVANTIQO_VIDEO_POD_NAME_PREFIX));
}
