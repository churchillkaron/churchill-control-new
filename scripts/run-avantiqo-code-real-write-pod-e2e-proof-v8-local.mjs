import { readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_POD_E2E_PROOF_V8";
const V1_PATH = "scripts/run-avantiqo-code-real-write-e2e-proof-v1-local.mjs";
const REST = "https://rest.runpod.io/v1";
const GQL = "https://api.runpod.io/graphql";
const SERVERLESS = "https://api.runpod.ai/v2";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const PRELOADED_CODE_IMAGE = "ghcr.io/churchillkaron/avantiqo-code-pod@sha256:c636b7fc23ab2cd433978cf0ba0470acff7df0df6747b3a64b5e71d1ec762a41";
const CERTIFIED_GPU_TYPES = Object.freeze([
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA H200",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H100 NVL",
  "NVIDIA B200",
]);
const STOCK_RANK = Object.freeze({ HIGH: 4, MEDIUM: 3, LOW: 2 });
const MAX_POD_CREATE_ATTEMPTS = 2;
const POD_CREATE_RETRY_MS = 3000;
const SOURCE_BEGIN = "AVANTIQO_CODE_GENERATED_SOURCE_BEGIN";
const SOURCE_END = "AVANTIQO_CODE_GENERATED_SOURCE_END";

const text = (value, maximum = 8000) => String(value ?? "").trim().slice(0, maximum);
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(response, label) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.detail || body?.error?.message || body?.error || body?.message || raw, 1400) || "UNKNOWN"}`);
  return body;
}

async function rest(pathname, key) {
  return readJson(await fetch(`${REST}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  }), `${CONTRACT}_REST`);
}

async function serverlessHealth(key) {
  return readJson(await fetch(`${SERVERLESS}/${ENDPOINT_ID}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  }), `${CONTRACT}_SERVERLESS_HEALTH`);
}

async function graphql(query, variables, key) {
  const body = await readJson(await fetch(`${GQL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  }), `${CONTRACT}_GRAPHQL`);
  const errors = list(body?.errors).map((entry) => text(entry?.message)).filter(Boolean);
  if (errors.length) throw new Error(`${CONTRACT}_GRAPHQL_ERROR:${errors.join(" | ").slice(0, 1600)}`);
  return body?.data || {};
}

function rows(raw) {
  if (Array.isArray(raw)) return raw;
  for (const key of ["data", "items", "results", "networkVolumes", "volumes", "pods"]) if (Array.isArray(raw?.[key])) return raw[key];
  return [];
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map((entry) => text(typeof entry === "string" ? entry : entry?.networkVolumeId || entry?.id)),
  ].filter(Boolean))];
}

function healthCounters(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    workers: ["idle", "initializing", "ready", "running", "throttled", "unhealthy"].reduce((sum, key) => sum + Math.max(0, finite(workers[key], 0)), 0),
  };
}

function patchOnce(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${CONTRACT}_${label}_MARKER_REQUIRED`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${CONTRACT}_${label}_MARKER_AMBIGUOUS`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

if (text(process.env.NODE_ENV).toLowerCase() === "production") throw new Error(`${CONTRACT}_PRODUCTION_ENV_FORBIDDEN`);
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 2000);
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || managementKey, 2000);
if (!managementKey || !runtimeKey) throw new Error(`${CONTRACT}_RUNPOD_KEY_REQUIRED`);

const [endpoint, volumesRaw, podsRaw, liveHealth] = await Promise.all([
  rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
  rest("/networkvolumes", managementKey),
  rest("/pods?computeType=GPU&includeMachine=true&includeNetworkVolume=true", managementKey),
  serverlessHealth(runtimeKey),
]);
if (text(endpoint?.id) !== ENDPOINT_ID || text(endpoint?.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_ENDPOINT_IDENTITY_INVALID`);
if (finite(endpoint?.workersMin, -1) !== 0 || finite(endpoint?.workersMax, -1) !== 0) throw new Error(`${CONTRACT}_SERVERLESS_MUST_REST_0_0:${endpoint?.workersMin}:${endpoint?.workersMax}`);
if (endpointVolumeIds(endpoint).length !== 0) throw new Error(`${CONTRACT}_SERVERLESS_ENDPOINT_MUST_REMAIN_VOLUME_DETACHED`);
const counters = healthCounters(liveHealth);
if (counters.in_queue !== 0 || counters.in_progress !== 0 || counters.workers !== 0) throw new Error(`${CONTRACT}_SERVERLESS_NOT_IDLE:${JSON.stringify(counters)}`);

const codeVolumes = rows(volumesRaw).filter((row) => /avantiqo.*code.*cache/i.test(text(row?.name)));
if (codeVolumes.length !== 1) throw new Error(`${CONTRACT}_ONE_CODE_STORAGE_REQUIRED:${codeVolumes.length}`);
const volume = codeVolumes[0];
const volumeId = text(volume?.id);
const volumeName = text(volume?.name);
const dataCenterId = text(volume?.dataCenterId ?? volume?.data_center_id);
if (!volumeId || !volumeName || !dataCenterId) throw new Error(`${CONTRACT}_CODE_STORAGE_METADATA_REQUIRED`);

const pods = rows(podsRaw);
const conflictingPods = pods.filter((pod) => {
  const podVolume = text(pod?.networkVolume?.id || pod?.networkVolumeId);
  const desired = text(pod?.desiredStatus).toUpperCase();
  return podVolume === volumeId && desired === "RUNNING";
});
if (conflictingPods.length) throw new Error(`${CONTRACT}_ACTIVE_CODE_VOLUME_POD_PRESENT:${conflictingPods.length}`);

const availabilityQuery = `query AvantiqoCodePodPlacementV8($input:GpuAvailabilityInput){dataCenters{id storageSupport gpuAvailability(input:$input){available stockStatus gpuTypeId gpuTypeDisplayName displayName}}}`;
const graph = await graphql(availabilityQuery, { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 80, secureCloud: true } }, managementKey);
const dc = list(graph?.dataCenters).find((row) => text(row?.id) === dataCenterId);
if (!dc) throw new Error(`${CONTRACT}_DATACENTER_REQUIRED:${dataCenterId}`);
if (dc?.storageSupport === false) throw new Error(`${CONTRACT}_DATACENTER_STORAGE_SUPPORT_REQUIRED`);
const availability = list(dc?.gpuAvailability);
const availableById = new Map(availability.filter((row) => row?.available === true).map((row) => [text(row?.gpuTypeId), row]));
const gpuTypeIds = CERTIFIED_GPU_TYPES
  .filter((id) => availableById.has(id))
  .sort((left, right) => {
    const a = STOCK_RANK[text(availableById.get(left)?.stockStatus).toUpperCase()] || 0;
    const b = STOCK_RANK[text(availableById.get(right)?.stockStatus).toUpperCase()] || 0;
    return b - a || CERTIFIED_GPU_TYPES.indexOf(left) - CERTIFIED_GPU_TYPES.indexOf(right);
  });
if (!gpuTypeIds.length) {
  console.log(JSON.stringify({
    event: `${CONTRACT}_NO_COST_PLACEMENT_BLOCK`,
    pod_create_performed: false,
    inference_performed: false,
    data_center_id: dataCenterId,
    canonical_code_storage_id: volumeId,
    canonical_code_storage_name: volumeName,
    observed_certified_gpu_stock: availability.filter((row) => CERTIFIED_GPU_TYPES.includes(text(row?.gpuTypeId))).map((row) => ({ gpu_type_id: text(row?.gpuTypeId), available: row?.available === true, stock_status: text(row?.stockStatus).toUpperCase() || null })),
    new_storage_created: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }));
  throw new Error(`${CONTRACT}_NO_LIVE_CERTIFIED_GPU_IN_VOLUME_DATACENTER`);
}

process.env.AVANTIQO_CODE_E2E_IMAGE = PRELOADED_CODE_IMAGE;
process.env.AVANTIQO_CODE_E2E_NETWORK_VOLUME_ID = volumeId;
process.env.AVANTIQO_CODE_E2E_DATA_CENTER_ID = dataCenterId;
process.env.AVANTIQO_CODE_E2E_GPU_TYPE_IDS = gpuTypeIds.join(",");
process.env.AVANTIQO_CODE_MAX_MODEL_LEN = text(process.env.AVANTIQO_CODE_MAX_MODEL_LEN || "8192");
process.env.AVANTIQO_CODE_MAX_NEW_TOKENS = text(process.env.AVANTIQO_CODE_MAX_NEW_TOKENS || "2048");
process.env.AVANTIQO_CODE_HF_CACHE_ROOT = "/runpod-volume/huggingface-cache/hub";
process.env.AVANTIQO_CODE_REQUIRE_CACHED_MODEL = "1";

console.log(JSON.stringify({
  event: `${CONTRACT}_PLACEMENT_PASS`,
  transport: "EPHEMERAL_RUNPOD_POD",
  serverless_resting_0_0_verified: true,
  endpoint_volume_detached_verified: true,
  canonical_code_storage_id: volumeId,
  canonical_code_storage_name: volumeName,
  code_storage_count: 1,
  data_center_id: dataCenterId,
  certified_gpu_type_ids: gpuTypeIds,
  gpu_stock: gpuTypeIds.map((id) => ({ gpu_type_id: id, stock_status: text(availableById.get(id)?.stockStatus).toUpperCase() || null })),
  volume_mount_path: "/runpod-volume",
  cached_model_root: "/runpod-volume/huggingface-cache/hub",
  immutable_image: PRELOADED_CODE_IMAGE,
  provider_job_submitted: false,
  pod_create_performed: false,
  inference_performed: false,
  new_storage_created: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

let source = await readFile(V1_PATH, "utf8");
const createStart = source.indexOf("async function createPod() {");
const deleteStart = source.indexOf("async function deleteVerified() {");
if (createStart < 0 || deleteStart <= createStart) throw new Error(`${CONTRACT}_CREATE_DELETE_BOUNDARY_REQUIRED`);
const replacementCreate = `async function createPod() {
  const createBody = {
    allowedCudaVersions: ALLOWED_CUDA_VERSIONS,
    cloudType: "SECURE",
    computeType: "GPU",
    containerDiskInGb: 50,
    dataCenterIds: [DATA_CENTER_ID],
    dataCenterPriority: "availability",
    env: {
      AVANTIQO_CODE_POD_TOKEN: podToken,
      AVANTIQO_CODE_HF_CACHE_ROOT: "/runpod-volume/huggingface-cache/hub",
      AVANTIQO_CODE_REQUIRE_CACHED_MODEL: "1",
      AVANTIQO_CODE_MAX_MODEL_LEN: text(process.env.AVANTIQO_CODE_MAX_MODEL_LEN || "8192"),
      AVANTIQO_CODE_MAX_NEW_TOKENS: text(process.env.AVANTIQO_CODE_MAX_NEW_TOKENS || "2048"),
      AVANTIQO_CODE_GPU_MEMORY_UTILIZATION: text(process.env.AVANTIQO_CODE_GPU_MEMORY_UTILIZATION || "0.90"),
    },
    gpuCount: 1,
    gpuTypeIds: GPU_TYPE_IDS,
    gpuTypePriority: "availability",
    imageName: IMAGE,
    interruptible: false,
    locked: false,
    name: podName,
    networkVolumeId: NETWORK_VOLUME_ID,
    ports: ["8000/http"],
    supportPublicIp: true,
    volumeMountPath: "/runpod-volume",
  };
  for (let attempt = 1; attempt <= ${MAX_POD_CREATE_ATTEMPTS}; attempt += 1) {
    try {
      const created = await rest("/pods", { method: "POST", timeoutMs: 60000, body: createBody });
      podId = text(created?.id);
      if (!podId) throw new Error(\`${'${CONTRACT}'}_POD_ID_REQUIRED\`);
      podCreatePerformed = true;
      podBaseUrl = \`https://${'${podId}'}-8000.proxy.runpod.net\`;
      console.log(JSON.stringify({ event: "AVANTIQO_CODE_REAL_WRITE_E2E_PROGRESS", phase: "POD_ALLOCATED", pod_create_attempt: attempt, volume_mount_path: "/runpod-volume", secrets_printed: false }));
      return created;
    } catch (error) {
      const message = text(error?.message || error);
      const capacityMiss = message.includes("There are no instances currently available");
      if (!capacityMiss || attempt >= ${MAX_POD_CREATE_ATTEMPTS}) throw error;
      console.log(JSON.stringify({ event: "AVANTIQO_CODE_REAL_WRITE_E2E_PROGRESS", phase: "POD_CAPACITY_RACE_RETRY", pod_create_attempt: attempt, next_attempt: attempt + 1, retry_ms: ${POD_CREATE_RETRY_MS}, inference_performed: false, secrets_printed: false }));
      await sleep(${POD_CREATE_RETRY_MS});
    }
  }
  throw new Error(\`${'${CONTRACT}'}_POD_CREATE_ATTEMPTS_EXHAUSTED\`);
}

`;
source = `${source.slice(0, createStart)}${replacementCreate}${source.slice(deleteStart)}`;
source = patchOnce(source,
  "        && body?.cached_model_found === true\n        && body?.raw_reasoning_persisted === false",
  "        && body?.cached_model_found === true\n        && body?.engine_loaded === true\n        && body?.engine_loading === false\n        && !body?.engine_load_error_type\n        && body?.raw_reasoning_persisted === false",
  "ENGINE_READY_HEALTH",
);
source = patchOnce(source,
  "  if (\n    output?.status !== \"completed\"",
  "  if (output?.status === \"engine_load_failed\") {\n    throw new Error(`${CONTRACT}_ENGINE_LOAD_FAILED:${text(output?.error_type || \"UNKNOWN\")}:${text(output?.error_message || \"\").slice(0, 700)}`);\n  }\n  if (\n    output?.status !== \"completed\"",
  "ENGINE_LOAD_FAILURE",
);
source = patchOnce(source,
  "const report = {\n  success:",
  `if (generatedTestsPassed && generatedSource) {\n  console.log("${SOURCE_BEGIN}");\n  process.stdout.write(generatedSource.endsWith("\\n") ? generatedSource : \`${'${generatedSource}'}\\n\`);\n  console.log("${SOURCE_END}");\n}\n\nconst report = {\n  success:`,
  "VISIBLE_SOURCE",
);
const signalMarker = "console.log(JSON.stringify({\n  event: \"AVANTIQO_CODE_REAL_WRITE_E2E_START\",";
source = patchOnce(source, signalMarker,
  `let signalCleanupInProgress = false;\nasync function handlePodTerminationSignal(signal) {\n  if (signalCleanupInProgress) return;\n  signalCleanupInProgress = true;\n  console.log(JSON.stringify({ event: "${CONTRACT}_SIGNAL_CLEANUP_START", signal, pod_present: Boolean(podId), secrets_printed: false }));\n  try {\n    podDeleteVerified = await deleteVerified();\n    console.log(JSON.stringify({ event: "${CONTRACT}_SIGNAL_CLEANUP_DONE", signal, pod_delete_verified: podDeleteVerified, secrets_printed: false }));\n  } catch (error) {\n    console.error(JSON.stringify({ event: "${CONTRACT}_SIGNAL_CLEANUP_FAILED", signal, error: text(error?.message || error).slice(0, 1200), secrets_printed: false }));\n  } finally {\n    if (workspace) await rm(workspace, { recursive: true, force: true }).catch(() => {});\n    process.exit(signal === "SIGTERM" ? 143 : 130);\n  }\n}\nprocess.once("SIGINT", () => { void handlePodTerminationSignal("SIGINT"); });\nprocess.once("SIGTERM", () => { void handlePodTerminationSignal("SIGTERM"); });\n\n${signalMarker}`,
  "SIGNAL_CLEANUP",
);

const tempPath = path.join(os.tmpdir(), `avantiqo-code-real-write-pod-v8-${process.pid}-${Date.now()}.mjs`);
try {
  await writeFile(tempPath, source, "utf8");
  await import(`${pathToFileURL(tempPath).href}?v=${Date.now()}`);
  console.log(`${CONTRACT}=PASS`);
} finally {
  await unlink(tempPath).catch(() => {});
}
