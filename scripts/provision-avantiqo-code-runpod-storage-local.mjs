import {
  assertManagedVolumeCreationAllowed,
  assertSharedVolumeInventoryCompatible,
  classifyManagedVolumeName,
  resolveReusableGroupVolume,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const SHARED_VOLUME_GROUP = sharedVolumeGroup("INTELLIGENCE_CODE");
const DEFAULT_VOLUME_NAME = SHARED_VOLUME_GROUP.canonical_name;
const DEFAULT_VOLUME_SIZE_GB = 80;
const MIN_VOLUME_SIZE_GB = 48;
const DEFAULT_STORAGE_USD_PER_GB_MONTH = 0.07;
const MIN_GPU_MEMORY_GB = 80;
const CONTRACT = "AVANTIQO_CODE_RUNPOD_STORAGE_V4";

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveInteger(value, fallback) {
  const number = Math.floor(finite(value, fallback));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function upper(value) {
  return text(value).toUpperCase();
}

function approved(value) {
  return ["YES", "TRUE", "1", "APPROVED"].includes(upper(value));
}

function stringList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!text(value)) return [];
  return text(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}

function sameStringSet(left, right) {
  const a = [...new Set(stringList(left))].sort();
  const b = [...new Set(stringList(right))].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function endpointVolumeIds(endpoint = {}) {
  return [text(endpoint.networkVolumeId), ...stringList(endpoint.networkVolumeIds)].filter(Boolean);
}

function endpointDatacenterCompatible(endpoint, requiredDataCenterId) {
  const ids = stringList(endpoint?.dataCenterIds);
  return ids.length === 0 || ids.includes(requiredDataCenterId);
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function graphqlRequest(credential) {
  const query = `
    query AvantiqoCodeStorageDatacenters($input: GpuAvailabilityInput) {
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
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(credential)}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        input: {
          gpuCount: 1,
          minDisk: 5,
          minMemoryInGb: MIN_GPU_MEMORY_GB,
          secureCloud: true,
        },
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
  if (!response.ok || body?.errors?.length) {
    const detail = text(
      body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw,
    ).slice(0, 1200);
    throw new Error(`RUNPOD_DATACENTER_DISCOVERY_FAILED:${response.status}:${detail || "EMPTY_BODY"}`);
  }
  const dataCenters = body?.data?.dataCenters;
  if (!Array.isArray(dataCenters)) throw new Error("RUNPOD_DATACENTER_DISCOVERY_INVALID_RESPONSE");
  return dataCenters;
}

function stockScore(status) {
  const value = upper(status);
  if (value === "HIGH") return 400;
  if (value === "MEDIUM") return 300;
  if (value === "LOW") return 200;
  if (value && value !== "NONE" && value !== "UNAVAILABLE") return 100;
  return 0;
}

function regionPreference(id) {
  const order = [
    "AP-JP-1",
    "OC-AU-1",
    "US-WA-1",
    "US-CA-2",
    "US-TX-3",
    "US-KS-2",
    "EU-NL-1",
    "EU-RO-1",
  ];
  const index = order.indexOf(text(id));
  return index < 0 ? 0 : order.length - index;
}

function gpuLabel(gpu = {}) {
  return upper([
    gpu?.gpuTypeId,
    gpu?.gpuTypeDisplayName,
    gpu?.displayName,
  ].filter(Boolean).join(" "));
}

function gpuProfile(gpu = {}) {
  const label = gpuLabel(gpu);
  if ((label.includes("RTX PRO 6000") || label.includes("RTX 6000 PRO")) && !label.includes("MIG")) {
    return { id: "RTX_PRO_6000_96GB", tier: "HIGH_END", priority: 6000, native_fp8: true };
  }
  if (label.includes("H100") && label.includes("NVL")) {
    return { id: "H100_NVL_94GB", tier: "HIGH_END", priority: 5600, native_fp8: true };
  }
  if (label.includes("H100")) {
    return { id: "H100_80GB", tier: "HIGH_END", priority: 5500, native_fp8: true };
  }
  if (label.includes("H200")) {
    return { id: "H200", tier: "HIGH_END", priority: 5300, native_fp8: true };
  }
  if (label.includes("B200")) {
    return { id: "B200", tier: "HIGH_END", priority: 5100, native_fp8: true };
  }
  return null;
}

function safeGpu(gpu = {}) {
  const profile = gpuProfile(gpu);
  return {
    gpu_type_id: text(gpu?.gpuTypeId) || null,
    gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName) || null,
    profile: profile?.id || null,
    tier: profile?.tier || null,
    native_fp8: profile?.native_fp8 === true,
    preference_priority: profile?.priority || 0,
    available: gpu?.available === true,
    stock_status: text(gpu?.stockStatus) || null,
    stock_score: stockScore(gpu?.stockStatus),
  };
}

function rankedGpus(dataCenter, tier) {
  return (Array.isArray(dataCenter?.gpuAvailability) ? dataCenter.gpuAvailability : [])
    .map(safeGpu)
    .filter((gpu) => gpu.tier === tier)
    .filter((gpu) => gpu.available && gpu.stock_score > 0 && gpu.gpu_type_id)
    .sort((a, b) =>
      b.preference_priority - a.preference_priority
      || b.stock_score - a.stock_score
      || String(a.gpu_type_id).localeCompare(String(b.gpu_type_id))
    );
}

function evaluateDatacenters(dataCenters, tier) {
  return dataCenters
    .filter((dc) => dc?.storageSupport === true)
    .map((dc) => {
      const gpus = rankedGpus(dc, tier);
      const bestGpu = gpus[0] || null;
      return {
        id: text(dc?.id) || null,
        name: text(dc?.name) || null,
        location: text(dc?.location) || null,
        storage_support: true,
        stocked_gpu_count: gpus.length,
        compatible_gpus: gpus,
        best_gpu: bestGpu,
        score: (bestGpu?.preference_priority || 0) * 1000
          + (bestGpu?.stock_score || 0)
          + regionPreference(dc?.id),
      };
    })
    .filter((dc) => dc.id && dc.best_gpu)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function storageInventory(dataCenters) {
  return dataCenters
    .filter((dc) => dc?.storageSupport === true)
    .map((dc) => ({
      id: text(dc?.id) || null,
      name: text(dc?.name) || null,
      location: text(dc?.location) || null,
      high_end_gpus: rankedGpus(dc, "HIGH_END"),
    }))
    .filter((dc) => dc.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    network_volume_id: text(endpoint.networkVolumeId) || null,
    network_volume_ids: stringList(endpoint.networkVolumeIds),
    data_center_ids: stringList(endpoint.dataCenterIds),
    gpu_type_ids: stringList(endpoint.gpuTypeIds),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
  };
}

function safeVolume(volume = {}) {
  return {
    id: text(volume.id) || null,
    name: text(volume.name) || null,
    size_gb: finite(volume.size),
    data_center_id: text(volume.dataCenterId) || null,
  };
}

const apply = process.argv.includes("--apply");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_CODE_ENDPOINT_ID");
const requestedSizeGb = positiveInteger(
  process.env.AVANTIQO_CODE_NETWORK_VOLUME_SIZE_GB,
  DEFAULT_VOLUME_SIZE_GB,
);
const configuredVolumeName = text(process.env.AVANTIQO_CODE_NETWORK_VOLUME_NAME);
if (configuredVolumeName && configuredVolumeName !== DEFAULT_VOLUME_NAME) {
  throw new Error(
    `AVANTIQO_CODE_NETWORK_VOLUME_NAME_FIXED_BY_SHARED_POLICY:expected=${DEFAULT_VOLUME_NAME}:actual=${configuredVolumeName}`,
  );
}
const monthlyRate = finite(
  process.env.AVANTIQO_RUNPOD_NETWORK_VOLUME_USD_PER_GB_MONTH,
  DEFAULT_STORAGE_USD_PER_GB_MONTH,
);
const volumeName = DEFAULT_VOLUME_NAME;
const estimatedMonthlyUsd = Number((requestedSizeGb * monthlyRate).toFixed(2));

if (requestedSizeGb < MIN_VOLUME_SIZE_GB) {
  throw new Error(
    `AVANTIQO_CODE_NETWORK_VOLUME_TOO_SMALL:requested_gb=${requestedSizeGb}:minimum_gb=${MIN_VOLUME_SIZE_GB}`,
  );
}

console.log(`AVANTIQO_CODE_STORAGE_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_CODE_STORAGE_SHARED_GROUP=${SHARED_VOLUME_GROUP.id}`);
console.log(`AVANTIQO_CODE_STORAGE_CANONICAL_VOLUME_NAME=${volumeName}`);
console.log(`AVANTIQO_CODE_STORAGE_REQUESTED_GB=${requestedSizeGb}`);
console.log(`AVANTIQO_CODE_STORAGE_ESTIMATED_MONTHLY_USD=${estimatedMonthlyUsd.toFixed(2)}`);
console.log(`AVANTIQO_CODE_STORAGE_MINIMUM_GPU_MEMORY_GB=${MIN_GPU_MEMORY_GB}`);
console.log("AVANTIQO_CODE_STORAGE_SUB_80GB_GPU_ALLOWED=false");
console.log("AVANTIQO_CODE_STORAGE_48GB_FALLBACK_ALLOWED=false");
console.log("AVANTIQO_CODE_STORAGE_SECRET_VALUES_PRINTED=false");
console.log("AVANTIQO_CODE_STORAGE_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_CODE_STORAGE_PRODUCTION_DEPLOY_PERFORMED=false");

const [endpoint, volumes, dataCenters] = await Promise.all([
  restRequest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  restRequest("/networkvolumes", managementKey),
  graphqlRequest(managementKey),
]);

if (text(endpoint?.id) !== endpointId) throw new Error("AVANTIQO_CODE_ENDPOINT_ID_MISMATCH");
if (text(endpoint?.name) !== CODE_ENDPOINT_NAME) {
  throw new Error(`AVANTIQO_CODE_ENDPOINT_NAME_MISMATCH:${text(endpoint?.name) || "MISSING"}`);
}
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");
assertSharedVolumeInventoryCompatible(volumes);

const alreadyAttached = endpointVolumeIds(endpoint);
if (alreadyAttached.length) {
  const existingAttached = volumes.filter((volume) => alreadyAttached.includes(text(volume?.id)));
  if (existingAttached.length !== alreadyAttached.length) {
    throw new Error("AVANTIQO_CODE_STORAGE_ATTACHED_VOLUME_LOOKUP_FAILED");
  }
  const wrongGroup = existingAttached.filter(
    (volume) => classifyManagedVolumeName(volume?.name)?.id !== SHARED_VOLUME_GROUP.id,
  );
  if (wrongGroup.length) {
    throw new Error(
      `AVANTIQO_CODE_STORAGE_ATTACHED_VOLUME_WRONG_SHARED_GROUP:count=${wrongGroup.length}`,
    );
  }
  console.log("AVANTIQO_CODE_STORAGE_ALREADY_ATTACHED=true");
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    mutation_performed: false,
    minimum_gpu_memory_gb: MIN_GPU_MEMORY_GB,
    sub_80gb_gpu_allowed: false,
    endpoint: safeEndpoint(endpoint),
    shared_volume_group: SHARED_VOLUME_GROUP.id,
    shared_volume_policy: sharedVolumePolicySummary(volumes),
    attached_volumes: existingAttached.map(safeVolume),
    next_action: "REFRESH_CODE_RUNPOD_WORKER",
  }, null, 2));
  process.exit(0);
}

const endpointGpuTypes = stringList(endpoint?.gpuTypeIds);
if (!endpointGpuTypes.length) throw new Error("AVANTIQO_CODE_ENDPOINT_GPU_TYPES_REQUIRED");

const highEndCandidates = evaluateDatacenters(dataCenters, "HIGH_END");
const inventory = storageInventory(dataCenters);
const reusable = resolveReusableGroupVolume(volumes, SHARED_VOLUME_GROUP);
const sharedVolume = reusable.volume;

if (sharedVolume && finite(sharedVolume.size, 0) < requestedSizeGb) {
  throw new Error(
    `AVANTIQO_CODE_STORAGE_EXISTING_SHARED_VOLUME_TOO_SMALL:id=${text(sharedVolume.id)}:size_gb=${finite(sharedVolume.size, 0)}:requested_gb=${requestedSizeGb}`,
  );
}

let selectedDatacenter = null;
let selectionMode = null;
if (sharedVolume) {
  selectedDatacenter = highEndCandidates.find(
    (candidate) => candidate.id === text(sharedVolume.dataCenterId),
  ) || null;
  selectionMode = selectedDatacenter
    ? "SHARED_VOLUME_DATACENTER_HIGH_END_FP8_GPU"
    : "BLOCKED_SHARED_VOLUME_DATACENTER_NO_80GB_PLUS_GPU_STOCK";
} else {
  selectedDatacenter = highEndCandidates[0] || null;
  selectionMode = selectedDatacenter
    ? "HIGH_END_FP8_GPU"
    : "BLOCKED_NO_80GB_PLUS_STORAGE_GPU_STOCK";
}

if (!selectedDatacenter) {
  const blockedPlan = {
    success: false,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    mutation_performed: false,
    blocked_reason: selectionMode,
    minimum_gpu_memory_gb: MIN_GPU_MEMORY_GB,
    sub_80gb_gpu_allowed: false,
    endpoint: safeEndpoint(endpoint),
    shared_volume_group: SHARED_VOLUME_GROUP.id,
    shared_volume_policy: sharedVolumePolicySummary(volumes),
    reusable_existing_volume: sharedVolume ? safeVolume(sharedVolume) : null,
    high_end_gpu_preference_order: [
      "RTX PRO 6000 96GB",
      "H100 NVL 94GB",
      "H100 80GB",
      "H200",
      "B200",
    ],
    high_end_datacenters: highEndCandidates,
    storage_datacenter_inventory: inventory,
    requested_volume: {
      name: volumeName,
      size_gb: requestedSizeGb,
      estimated_monthly_usd: estimatedMonthlyUsd,
    },
    generation_submitted: false,
    production_deploy_performed: false,
    additional_intelligence_code_volume_forbidden: true,
  };
  console.log("AVANTIQO_CODE_STORAGE_PLAN=BLOCKED");
  console.log(JSON.stringify(blockedPlan, null, 2));
  if (apply) {
    throw new Error(
      sharedVolume
        ? "AVANTIQO_CODE_SHARED_VOLUME_DATACENTER_GPU_REPLAN_REQUIRED"
        : "AVANTIQO_CODE_STORAGE_80GB_PLUS_GPU_REPLAN_REQUIRED",
    );
  }
  process.exitCode = 2;
  process.exit(0);
}

const targetGpuTypes = [selectedDatacenter.best_gpu.gpu_type_id];
const gpuBindingChangeRequired = !sameStringSet(targetGpuTypes, endpointGpuTypes);

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  mutation_performed: false,
  endpoint: safeEndpoint(endpoint),
  runtime_model: "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8",
  runtime_model_repository_size_gb: 31.2,
  shared_volume_group: SHARED_VOLUME_GROUP.id,
  shared_volume_policy: sharedVolumePolicySummary(volumes),
  reusable_existing_volume: sharedVolume ? safeVolume(sharedVolume) : null,
  reusable_volume_resolution: reusable.resolution,
  effective_placement: {
    data_center_id: selectedDatacenter.id,
    source: sharedVolume ? "SHARED_VOLUME_DATACENTER" : "SELECTED_HIGH_END_GPU_DATACENTER",
  },
  gpu_selection: {
    mode: selectionMode,
    minimum_gpu_memory_gb: MIN_GPU_MEMORY_GB,
    sub_80gb_gpu_allowed: false,
    configured_gpu_type_ids: endpointGpuTypes,
    gpu_binding_change_required: gpuBindingChangeRequired,
    target_gpu_type_ids: targetGpuTypes,
    selected_gpu: selectedDatacenter.best_gpu,
    rationale: sharedVolume
      ? "The single INTELLIGENCE_CODE shared cache fixes the RunPod datacenter; select the best available 80GB+ native-FP8 GPU inside that datacenter and never create a regional cache duplicate."
      : "Require 80GB+ native-FP8 hardware for the Avantiqo Code vLLM runtime; never downgrade to a 48GB L40-class fallback.",
  },
  requested_volume: {
    name: volumeName,
    size_gb: requestedSizeGb,
    minimum_gb: MIN_VOLUME_SIZE_GB,
    estimated_monthly_usd: estimatedMonthlyUsd,
  },
  compatible_datacenters: highEndCandidates,
  storage_datacenter_inventory: inventory,
  safety: {
    network_volume_create_requires_apply: true,
    recurring_storage_spend_requires_explicit_approval: true,
    gpu_binding_change_requires_explicit_approval: gpuBindingChangeRequired,
    minimum_gpu_memory_gb: MIN_GPU_MEMORY_GB,
    sub_80gb_gpu_allowed: false,
    selected_gpu_stock_rechecked_immediately_before_storage_create: true,
    gpu_runtime_spend_not_started_by_storage_apply: true,
    endpoint_patch_requires_apply: true,
    automatic_delete_on_failure: false,
    maximum_managed_cache_volumes: 3,
    additional_intelligence_code_volume_forbidden: true,
    generation_submitted: false,
    production_deploy_performed: false,
  },
};

if (!apply) {
  console.log("AVANTIQO_CODE_STORAGE_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (!sharedVolume && !approved(process.env.AVANTIQO_CODE_STORAGE_SPEND_APPROVED)) {
  throw new Error(
    `AVANTIQO_CODE_STORAGE_SPEND_APPROVAL_REQUIRED:estimated_monthly_usd=${estimatedMonthlyUsd.toFixed(2)}:set_AVANTIQO_CODE_STORAGE_SPEND_APPROVED=YES`,
  );
}
if (gpuBindingChangeRequired && !approved(process.env.AVANTIQO_CODE_GPU_BINDING_APPROVED)) {
  throw new Error(
    `AVANTIQO_CODE_GPU_BINDING_APPROVAL_REQUIRED:selected=${selectedDatacenter.best_gpu.gpu_type_id}:set_AVANTIQO_CODE_GPU_BINDING_APPROVED=YES`,
  );
}

const endpointBeforeWrite = await restRequest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (endpointVolumeIds(endpointBeforeWrite).length) {
  throw new Error("AVANTIQO_CODE_STORAGE_CONCURRENT_VOLUME_ATTACHMENT_DETECTED");
}
if (text(endpointBeforeWrite.templateId) !== text(endpoint.templateId)) {
  throw new Error("AVANTIQO_CODE_STORAGE_CONCURRENT_TEMPLATE_CHANGE_DETECTED");
}
if (!sameStringSet(endpointBeforeWrite.gpuTypeIds, endpoint.gpuTypeIds)) {
  throw new Error("AVANTIQO_CODE_STORAGE_CONCURRENT_GPU_BINDING_CHANGE_DETECTED");
}
if (!sameStringSet(endpointBeforeWrite.dataCenterIds, endpoint.dataCenterIds)) {
  throw new Error("AVANTIQO_CODE_STORAGE_CONCURRENT_DATACENTER_BINDING_CHANGE_DETECTED");
}

const freshVolumes = await restRequest("/networkvolumes", managementKey);
if (!Array.isArray(freshVolumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID_BEFORE_WRITE");
assertSharedVolumeInventoryCompatible(freshVolumes);
const freshReusable = resolveReusableGroupVolume(freshVolumes, SHARED_VOLUME_GROUP);
if (Boolean(freshReusable.volume) !== Boolean(sharedVolume)) {
  throw new Error("AVANTIQO_CODE_STORAGE_CONCURRENT_SHARED_VOLUME_CHANGE_DETECTED");
}
if (freshReusable.volume && text(freshReusable.volume.id) !== text(sharedVolume?.id)) {
  throw new Error("AVANTIQO_CODE_STORAGE_CONCURRENT_SHARED_VOLUME_ID_CHANGE_DETECTED");
}
if (freshReusable.volume && text(freshReusable.volume.dataCenterId) !== selectedDatacenter.id) {
  throw new Error("AVANTIQO_CODE_STORAGE_CONCURRENT_SHARED_VOLUME_DATACENTER_CHANGE_DETECTED");
}

const liveDataCenters = await graphqlRequest(managementKey);
const liveDatacenter = liveDataCenters.find((dc) => text(dc?.id) === selectedDatacenter.id) || null;
const liveSelectedGpu = (Array.isArray(liveDatacenter?.gpuAvailability) ? liveDatacenter.gpuAvailability : [])
  .map(safeGpu)
  .find((gpu) => gpu.gpu_type_id === selectedDatacenter.best_gpu.gpu_type_id) || null;
if (!liveDatacenter?.storageSupport || !liveSelectedGpu?.available || liveSelectedGpu.stock_score <= 0) {
  throw new Error(
    `AVANTIQO_CODE_STORAGE_SELECTED_GPU_STOCK_CHANGED_REPLAN_REQUIRED:datacenter=${selectedDatacenter.id}:gpu=${selectedDatacenter.best_gpu.gpu_type_id}`,
  );
}

let volume = freshReusable.volume;
let volumeAction = "REUSED_SHARED_INTELLIGENCE_CODE";
if (!volume) {
  assertManagedVolumeCreationAllowed(freshVolumes, SHARED_VOLUME_GROUP);
  volume = await restRequest("/networkvolumes", managementKey, {
    method: "POST",
    body: {
      dataCenterId: selectedDatacenter.id,
      name: volumeName,
      size: requestedSizeGb,
    },
  });
  volumeAction = "CREATED_SHARED_INTELLIGENCE_CODE";
}

const volumeId = text(volume?.id);
if (!volumeId) throw new Error("AVANTIQO_CODE_STORAGE_CREATED_VOLUME_ID_MISSING");
console.log(`AVANTIQO_CODE_STORAGE_VOLUME_ACTION=${volumeAction}`);
console.log(`AVANTIQO_CODE_STORAGE_VOLUME_ID=${volumeId}`);

try {
  await restRequest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: {
      networkVolumeId: volumeId,
      dataCenterIds: [selectedDatacenter.id],
      gpuTypeIds: targetGpuTypes,
    },
  });
} catch (error) {
  console.error(`AVANTIQO_CODE_STORAGE_ENDPOINT_ATTACH_FAILED=${text(error?.message || error)}`);
  console.error(`AVANTIQO_CODE_STORAGE_VOLUME_LEFT_INTACT=${volumeId}`);
  throw error;
}

const [verifiedEndpoint, verifiedVolume] = await Promise.all([
  restRequest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  restRequest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey),
]);
const attached = endpointVolumeIds(verifiedEndpoint).includes(volumeId);
const datacenterBound = endpointDatacenterCompatible(verifiedEndpoint, selectedDatacenter.id);
const gpuBindingVerified = sameStringSet(verifiedEndpoint?.gpuTypeIds, targetGpuTypes);
const sharedGroupVerified = classifyManagedVolumeName(verifiedVolume?.name)?.id === SHARED_VOLUME_GROUP.id;
const volumeDatacenterVerified = text(verifiedVolume?.dataCenterId) === selectedDatacenter.id;
const volumeSizeVerified = finite(verifiedVolume?.size, 0) >= requestedSizeGb;
if (
  !attached ||
  !datacenterBound ||
  !gpuBindingVerified ||
  !sharedGroupVerified ||
  !volumeDatacenterVerified ||
  !volumeSizeVerified
) {
  throw new Error(
    `AVANTIQO_CODE_STORAGE_VERIFICATION_FAILED:attached=${attached}:datacenter_bound=${datacenterBound}:gpu_binding_verified=${gpuBindingVerified}:shared_group_verified=${sharedGroupVerified}:volume_datacenter_verified=${volumeDatacenterVerified}:volume_size_verified=${volumeSizeVerified}`,
  );
}

console.log(JSON.stringify({
  ...plan,
  success: true,
  mode: "APPLY",
  mutation_performed: true,
  volume_action: volumeAction,
  endpoint: safeEndpoint(verifiedEndpoint),
  attached_volume: safeVolume(verifiedVolume),
  shared_volume_policy_after: sharedVolumePolicySummary([
    ...freshVolumes.filter((entry) => text(entry?.id) !== volumeId),
    verifiedVolume,
  ]),
  next_action: "REFRESH_CODE_RUNPOD_WORKER",
}, null, 2));
