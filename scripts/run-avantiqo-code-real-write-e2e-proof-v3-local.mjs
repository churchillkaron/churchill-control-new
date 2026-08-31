import { pathToFileURL } from "node:url";
import path from "node:path";

const CONTRACT = "AVANTIQO_CODE_REAL_WRITE_E2E_PROOF_V3_LAUNCHER";
const REST = "https://rest.runpod.io/v1";
const GQL = "https://api.runpod.io/graphql";
const V1_PATH = "scripts/run-avantiqo-code-real-write-e2e-proof-v1-local.mjs";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const RUNPOD_AVAILABILITY_MIN_MEMORY_GB = 40;
const CERTIFIED_GPU_TYPES = [
  "NVIDIA B200",
  "NVIDIA H200",
  "NVIDIA H100 NVL",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
];
const STOCK_RANK = { HIGH: 4, MEDIUM: 3, LOW: 2 };

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const rows = (raw, keys = []) => {
  if (Array.isArray(raw)) return raw;
  for (const key of [...keys, "data", "items", "results", "networkVolumes", "volumes", "endpoints"]) {
    if (Array.isArray(raw?.[key])) return raw[key];
  }
  return [];
};
const endpointVolumeIds = (endpoint) => [...new Set([
  text(endpoint?.networkVolumeId),
  text(endpoint?.networkVolume?.id),
  ...list(endpoint?.networkVolumeIds).map((value) => text(
    typeof value === "string" ? value : value?.id || value?.networkVolumeId,
  )),
].filter(Boolean))];

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error(`${CONTRACT}_RUNPOD_MANAGEMENT_KEY_REQUIRED`);

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 800)}`);
  }
  return body || {};
}

async function rest(pathname) {
  return readJson(await fetch(`${REST}${pathname}`, {
    headers: { Authorization: `Bearer ${managementKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_REST`);
}

async function liveGpuAvailability(dataCenterId) {
  const query = `query($input:GpuAvailabilityInput){dataCenters{id gpuAvailability(input:$input){available stockStatus gpuTypeId gpuTypeDisplayName displayName}}}`;
  const body = await readJson(await fetch(`${GQL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: RUNPOD_AVAILABILITY_MIN_MEMORY_GB, secureCloud: true } },
    }),
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_GQL`);
  const errors = list(body?.errors).map((entry) => text(entry?.message)).filter(Boolean);
  if (errors.length) throw new Error(`${CONTRACT}_GQL_ERROR:${errors.join(" | ")}`);
  const dc = list(body?.data?.dataCenters).find((entry) => text(entry?.id) === dataCenterId);
  if (!dc) throw new Error(`${CONTRACT}_DATACENTER_AVAILABILITY_REQUIRED:${dataCenterId}`);
  return list(dc?.gpuAvailability);
}

const [volumeRaw, endpointRaw] = await Promise.all([
  rest("/networkvolumes"),
  rest("/endpoints?includeTemplate=false&includeWorkers=true"),
]);
const volumes = rows(volumeRaw, ["networkVolumes"]);
const endpoints = rows(endpointRaw, ["endpoints"]);
const codeEndpoints = endpoints.filter((endpoint) => text(endpoint?.name) === CODE_ENDPOINT_NAME);
if (codeEndpoints.length !== 1) {
  throw new Error(`${CONTRACT}_CODE_ENDPOINT_RESOLUTION:${codeEndpoints.length}`);
}
const boundVolumeIds = endpointVolumeIds(codeEndpoints[0]);
if (boundVolumeIds.length !== 1) {
  throw new Error(`${CONTRACT}_CODE_ENDPOINT_SINGLE_STORAGE_REQUIRED:${boundVolumeIds.length}`);
}
const volumeMatches = volumes.filter((row) => text(row?.id) === boundVolumeIds[0]);
if (volumeMatches.length !== 1) {
  throw new Error(`${CONTRACT}_CODE_ENDPOINT_STORAGE_NOT_FOUND:${boundVolumeIds[0]}:${volumeMatches.length}`);
}
const volume = volumeMatches[0];
const volumeId = text(volume?.id);
const volumeName = text(volume?.name);
const dataCenterId = text(volume?.dataCenterId ?? volume?.data_center_id);
if (!volumeId || !volumeName || !dataCenterId) throw new Error(`${CONTRACT}_VOLUME_CONTRACT_INVALID`);
if (!/avantiqo.*code.*cache/i.test(volumeName)) {
  throw new Error(`${CONTRACT}_CODE_ENDPOINT_STORAGE_NAME_INVALID:${volumeName}`);
}

const availability = await liveGpuAvailability(dataCenterId);
const availableById = new Map(
  availability
    .filter((row) => row?.available === true)
    .map((row) => [text(row?.gpuTypeId), row]),
);
const gpuTypeIds = CERTIFIED_GPU_TYPES
  .filter((gpuTypeId) => availableById.has(gpuTypeId))
  .sort((left, right) => {
    const a = STOCK_RANK[text(availableById.get(left)?.stockStatus).toUpperCase()] || 0;
    const b = STOCK_RANK[text(availableById.get(right)?.stockStatus).toUpperCase()] || 0;
    return b - a;
  });
if (!gpuTypeIds.length) {
  const observed = availability
    .filter((row) => CERTIFIED_GPU_TYPES.includes(text(row?.gpuTypeId)))
    .map((row) => ({
      gpu_type_id: text(row?.gpuTypeId),
      available: row?.available === true,
      stock_status: text(row?.stockStatus).toUpperCase() || null,
    }));
  throw new Error(`${CONTRACT}_NO_LIVE_CERTIFIED_GPU:${JSON.stringify({
    endpoint: CODE_ENDPOINT_NAME,
    network_volume_id: volumeId,
    network_volume_name: volumeName,
    data_center_id: dataCenterId,
    observed,
  })}`);
}

process.env.AVANTIQO_CODE_E2E_NETWORK_VOLUME_ID = volumeId;
process.env.AVANTIQO_CODE_E2E_DATA_CENTER_ID = dataCenterId;
process.env.AVANTIQO_CODE_E2E_GPU_TYPE_IDS = gpuTypeIds.join(",");
process.env.AVANTIQO_CODE_MAX_MODEL_LEN = process.env.AVANTIQO_CODE_MAX_MODEL_LEN?.trim() || "8192";
process.env.AVANTIQO_CODE_MAX_NEW_TOKENS = process.env.AVANTIQO_CODE_MAX_NEW_TOKENS?.trim() || "2048";

console.log(JSON.stringify({
  event: "AVANTIQO_CODE_REAL_WRITE_E2E_LIVE_PLACEMENT",
  contract: CONTRACT,
  endpoint_name: CODE_ENDPOINT_NAME,
  endpoint_single_storage_verified: true,
  network_volume_name: volumeName,
  network_volume_id: volumeId,
  data_center_id: dataCenterId,
  certified_fp8_gpu_pool_only: true,
  runpod_availability_min_memory_gb: RUNPOD_AVAILABILITY_MIN_MEMORY_GB,
  proof_max_model_len: Number(process.env.AVANTIQO_CODE_MAX_MODEL_LEN),
  gpu_type_ids: gpuTypeIds,
  gpu_stock: gpuTypeIds.map((gpuTypeId) => ({
    gpu_type_id: gpuTypeId,
    stock_status: text(availableById.get(gpuTypeId)?.stockStatus).toUpperCase() || null,
  })),
  new_storage_created: false,
  volume_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

await import(`${pathToFileURL(path.resolve(V1_PATH)).href}?placement=${Date.now()}`);
