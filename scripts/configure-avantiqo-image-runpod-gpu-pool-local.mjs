const REST_BASE = "https://rest.runpod.io/v1";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const MIN_VOLUME_GB = 64;

// Image quality certification proved the RTX PRO 6000 class can execute the
// current Qwen-Image-2512 worker. Keep the production-candidate pool on 96 GB
// RTX PRO 6000 variants and explicitly forbid the much more expensive B/H
// accelerator classes from being reintroduced by maintenance tooling.
const COST_GUARDED_GPU_TYPES = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
];

const FORBIDDEN_PREMIUM_GPU_TYPES = [
  "NVIDIA B200",
  "NVIDIA H200",
  "NVIDIA H200 NVL",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H100 PCIe",
  "NVIDIA H100 NVL",
];

const KNOWN_IMAGE_GPU_TYPES = [
  ...COST_GUARDED_GPU_TYPES,
  ...FORBIDDEN_PREMIUM_GPU_TYPES,
  "NVIDIA A100-SXM4-80GB",
  "NVIDIA A100 80GB PCIe",
];

function text(value) {
  return String(value ?? "").trim();
}
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function sameSet(left, right) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function restRequest(path, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function gpuAvailability(managementKey) {
  const query = `
    query AvantiqoImagePersistentGpuPool($input: GpuAvailabilityInput) {
      dataCenters {
        id
        gpuAvailability(input: $input) {
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
      query,
      variables: {
        input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 90, secureCloud: true },
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
    const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 1200);
    throw new Error(`RUNPOD_GPU_AVAILABILITY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.dataCenters;
}

function endpointVolumeIds(endpoint = {}) {
  return [text(endpoint.networkVolumeId), ...list(endpoint.networkVolumeIds).map(text)].filter(Boolean);
}

const apply = process.argv.includes("--apply");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
if (
  apply &&
  text(process.env.AVANTIQO_IMAGE_GPU_COST_GUARD_APPROVED).toUpperCase() !== "YES"
) {
  throw new Error("AVANTIQO_IMAGE_GPU_COST_GUARD_APPROVED=YES_REQUIRED");
}

console.log(`AVANTIQO_IMAGE_GPU_POOL_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_IMAGE_GPU_POOL_CONTRACT=AVANTIQO_IMAGE_COST_GUARDED_GPU_POOL_V2");
console.log("AVANTIQO_IMAGE_GPU_POOL_PERSISTENT=true");
console.log("AVANTIQO_IMAGE_GPU_POOL_B200_ALLOWED=false");
console.log("AVANTIQO_IMAGE_GPU_POOL_H100_H200_ALLOWED=false");
console.log("AVANTIQO_IMAGE_GPU_POOL_MIN_MEMORY_GB=90");
console.log("AVANTIQO_IMAGE_GPU_POOL_PER_JOB_MUTATION=false");
console.log("AVANTIQO_IMAGE_GPU_POOL_NEW_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_IMAGE_GPU_POOL_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_GPU_POOL_STORAGE_MUTATION=false");
console.log("AVANTIQO_IMAGE_GPU_POOL_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_IMAGE_GPU_POOL_SECRETS_PRINTED=false");

const endpoints = await restRequest("/endpoints?includeTemplate=false&includeWorkers=false", managementKey);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
const matches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
if (matches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_GPU_POOL_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
}
const endpointId = text(matches[0]?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_GPU_POOL_ENDPOINT_ID_MISSING");

const [endpoint, volumes, dataCenters] = await Promise.all([
  restRequest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  restRequest("/networkvolumes", managementKey),
  gpuAvailability(managementKey),
]);
if (text(endpoint?.name) !== IMAGE_ENDPOINT_NAME) throw new Error("AVANTIQO_IMAGE_GPU_POOL_ENDPOINT_NAME_MISMATCH");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const volumeIds = endpointVolumeIds(endpoint);
if (volumeIds.length !== 1) throw new Error(`AVANTIQO_IMAGE_GPU_POOL_VOLUME_COUNT_INVALID:${volumeIds.length}`);
const volume = volumes.find((entry) => text(entry?.id) === volumeIds[0]);
if (!volume) throw new Error("AVANTIQO_IMAGE_GPU_POOL_VOLUME_NOT_FOUND");
if (finite(volume?.size, 0) < MIN_VOLUME_GB) {
  throw new Error(`AVANTIQO_IMAGE_GPU_POOL_VOLUME_TOO_SMALL:${finite(volume?.size, 0)}`);
}
const dataCenterId = text(volume?.dataCenterId);
if (!dataCenterId) throw new Error("AVANTIQO_IMAGE_GPU_POOL_DATACENTER_MISSING");
const dc = dataCenters.find((entry) => text(entry?.id) === dataCenterId);
if (!dc) throw new Error(`AVANTIQO_IMAGE_GPU_POOL_DATACENTER_NOT_FOUND:${dataCenterId}`);

const supportedIds = new Set(list(dc?.gpuAvailability).map((entry) => text(entry?.gpuTypeId)).filter(Boolean));
const persistentPool = COST_GUARDED_GPU_TYPES.filter((id) => supportedIds.has(id));
const currentPool = list(endpoint?.gpuTypeIds).map(text).filter(Boolean);
const unknownCurrent = currentPool.filter((id) => !KNOWN_IMAGE_GPU_TYPES.includes(id));
if (unknownCurrent.length) {
  throw new Error(`AVANTIQO_IMAGE_GPU_POOL_UNKNOWN_CURRENT_TYPES:${unknownCurrent.join("|")}`);
}
if (persistentPool.length < 1) {
  throw new Error("AVANTIQO_IMAGE_GPU_POOL_NO_COST_GUARDED_96GB_GPU_AVAILABLE");
}

const forbiddenCurrent = currentPool.filter((id) => FORBIDDEN_PREMIUM_GPU_TYPES.includes(id));
const stock = Object.fromEntries(
  list(dc?.gpuAvailability)
    .filter((entry) => persistentPool.includes(text(entry?.gpuTypeId)))
    .map((entry) => [text(entry?.gpuTypeId), text(entry?.stockStatus) || "UNKNOWN"]),
);
const plan = {
  success: true,
  contract: "AVANTIQO_IMAGE_COST_GUARDED_GPU_POOL_V2",
  endpoint_name: IMAGE_ENDPOINT_NAME,
  endpoint_id_present: true,
  data_center_id: dataCenterId,
  network_volume_id_present: true,
  current_gpu_pool: currentPool,
  forbidden_premium_gpu_types_present: forbiddenCurrent,
  persistent_gpu_pool: persistentPool,
  current_stock: stock,
  mutation_required: !sameSet(currentPool, persistentPool),
  behavior: {
    b200_allowed: false,
    h100_h200_allowed: false,
    minimum_gpu_memory_gb: 90,
    submit_once: true,
    runpod_schedules_from_persistent_pool: true,
    per_job_unblock_command_required: false,
    management_key_required_in_production_runtime: false,
    restore_narrow_pool_after_job: false,
  },
};

if (!apply) {
  console.log("AVANTIQO_IMAGE_GPU_POOL_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

// Refetch immediately before the only mutation. Preserve template, shared volume,
// worker limits, idle timeout, execution timeout, scaler and datacenter binding.
const beforeWrite = await restRequest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
if (text(beforeWrite?.templateId) !== text(endpoint?.templateId)) {
  throw new Error("AVANTIQO_IMAGE_GPU_POOL_TEMPLATE_CHANGED_BEFORE_WRITE");
}
if (!endpointVolumeIds(beforeWrite).includes(text(volume?.id))) {
  throw new Error("AVANTIQO_IMAGE_GPU_POOL_VOLUME_CHANGED_BEFORE_WRITE");
}
for (const field of ["workersMin", "workersMax", "idleTimeout", "executionTimeoutMs", "scalerType", "scalerValue"]) {
  if (String(beforeWrite?.[field] ?? "") !== String(endpoint?.[field] ?? "")) {
    throw new Error(`AVANTIQO_IMAGE_GPU_POOL_CONCURRENT_ENDPOINT_CHANGE:${field}`);
  }
}
if (JSON.stringify(list(beforeWrite?.dataCenterIds)) !== JSON.stringify(list(endpoint?.dataCenterIds))) {
  throw new Error("AVANTIQO_IMAGE_GPU_POOL_DATACENTER_CHANGED_BEFORE_WRITE");
}
const livePool = list(beforeWrite?.gpuTypeIds).map(text).filter(Boolean);
const liveUnknown = livePool.filter((id) => !KNOWN_IMAGE_GPU_TYPES.includes(id));
if (liveUnknown.length) {
  throw new Error(`AVANTIQO_IMAGE_GPU_POOL_CONCURRENT_UNKNOWN_TYPES:${liveUnknown.join("|")}`);
}

if (!sameSet(livePool, persistentPool)) {
  await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { gpuTypeIds: persistentPool },
  });
}

const verified = await restRequest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
const verifiedPool = list(verified?.gpuTypeIds).map(text).filter(Boolean);
if (!sameSet(verifiedPool, persistentPool)) {
  throw new Error(`AVANTIQO_IMAGE_GPU_POOL_VERIFY_FAILED:actual=${verifiedPool.join("|")}`);
}
if (verifiedPool.some((id) => FORBIDDEN_PREMIUM_GPU_TYPES.includes(id))) {
  throw new Error("AVANTIQO_IMAGE_GPU_POOL_PREMIUM_GPU_STILL_PRESENT");
}
if (text(verified?.templateId) !== text(endpoint?.templateId)) {
  throw new Error("AVANTIQO_IMAGE_GPU_POOL_TEMPLATE_CHANGED_DURING_APPLY");
}
if (!endpointVolumeIds(verified).includes(text(volume?.id))) {
  throw new Error("AVANTIQO_IMAGE_GPU_POOL_VOLUME_CHANGED_DURING_APPLY");
}
for (const field of ["workersMin", "workersMax", "idleTimeout", "executionTimeoutMs", "scalerType", "scalerValue"]) {
  if (String(verified?.[field] ?? "") !== String(endpoint?.[field] ?? "")) {
    throw new Error(`AVANTIQO_IMAGE_GPU_POOL_UNRELATED_FIELD_CHANGED:${field}`);
  }
}
if (JSON.stringify(list(verified?.dataCenterIds)) !== JSON.stringify(list(endpoint?.dataCenterIds))) {
  throw new Error("AVANTIQO_IMAGE_GPU_POOL_DATACENTER_CHANGED_DURING_APPLY");
}

console.log("AVANTIQO_IMAGE_GPU_POOL_APPLY=COMPLETE");
console.log("AVANTIQO_IMAGE_GPU_POOL_PREMIUM_GPU_REMOVED=true");
console.log(JSON.stringify({
  ...plan,
  mutation_performed: !sameSet(livePool, persistentPool),
  verified_gpu_pool: verifiedPool,
  preserved: {
    template: true,
    shared_volume: true,
    workers_min: true,
    workers_max: true,
    idle_timeout: true,
    execution_timeout: true,
    scaler: true,
    data_center_ids: true,
  },
  generation_submitted: false,
  cache_operation_submitted: false,
  production_deploy: false,
  next_action: "CONTINUE_IMAGE_DEVELOPMENT_WITH_COST_GUARDED_GPU_POOL",
}, null, 2));
