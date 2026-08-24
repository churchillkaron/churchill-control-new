import {
  assertManagedVolumeCreationAllowed,
  classifyManagedVolumeName,
  resolveReusableGroupVolume,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const SHARED_VOLUME_GROUP = sharedVolumeGroup("AUDIO_VOICE");
const DEFAULT_VOLUME_NAME = SHARED_VOLUME_GROUP.canonical_name;
const DEFAULT_VOLUME_SIZE_GB = 30;
const MIN_VOLUME_SIZE_GB = 20;
const MIN_GPU_MEMORY_GB = 24;
const DEFAULT_STORAGE_USD_PER_GB_MONTH = 0.07;
const NETWORK_VOLUME_MOUNT_ROOT = "/runpod-volume";
const CHECKPOINT_ROOT = `${NETWORK_VOLUME_MOUNT_ROOT}/ace-step-checkpoints`;
const CONTRACT = "AVANTIQO_AUDIO_RUNPOD_STORAGE_V2";

function text(value) {
  return String(value ?? "").trim();
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

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!text(value)) return [];
  return text(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function rest(path, credential, options = {}) {
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

async function discoverDatacenters(credential) {
  const query = `
    query AvantiqoAudioStorageDatacenters($input: GpuAvailabilityInput) {
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

function endpointVolumeIds(endpoint = {}) {
  return [text(endpoint.networkVolumeId), ...list(endpoint.networkVolumeIds)].filter(Boolean);
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
    "EU-NL-1",
    "EU-RO-1",
    "EU-CZ-1",
    "EU-SE-1",
    "US-GA-2",
    "US-KS-2",
  ];
  const index = order.indexOf(text(id));
  return index < 0 ? 0 : order.length - index;
}

function safeGpu(gpu = {}) {
  return {
    gpu_type_id: text(gpu?.gpuTypeId) || null,
    gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName) || null,
    available: gpu?.available === true,
    stock_status: text(gpu?.stockStatus) || null,
    stock_score: stockScore(gpu?.stockStatus),
  };
}

function evaluateDatacenters(dataCenters, endpointGpuTypes) {
  return dataCenters
    .filter((dc) => dc?.storageSupport === true)
    .map((dc) => {
      const compatible = (Array.isArray(dc?.gpuAvailability) ? dc.gpuAvailability : [])
        .map(safeGpu)
        .filter((gpu) => gpu.gpu_type_id && endpointGpuTypes.includes(gpu.gpu_type_id))
        .filter((gpu) => gpu.stock_score > 0 && gpu.available !== false)
        .sort((a, b) => b.stock_score - a.stock_score || a.gpu_type_id.localeCompare(b.gpu_type_id));
      const bestGpu = compatible[0] || null;
      return {
        id: text(dc?.id) || null,
        name: text(dc?.name) || null,
        location: text(dc?.location) || null,
        storage_support: true,
        compatible_gpus: compatible,
        best_gpu: bestGpu,
        score: (bestGpu?.stock_score || 0) * 100 + regionPreference(dc?.id),
      };
    })
    .filter((dc) => dc.id && dc.best_gpu)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    gpu_type_ids: list(endpoint.gpuTypeIds),
    data_center_ids: list(endpoint.dataCenterIds),
    network_volume_id: text(endpoint.networkVolumeId) || null,
    network_volume_ids: list(endpoint.networkVolumeIds),
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

function resolveEndpoint(endpoints, configuredId) {
  if (configuredId) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredId);
    if (matches.length !== 1) {
      throw new Error(`AVANTIQO_AUDIO_CONFIGURED_ENDPOINT_NOT_FOUND:matches=${matches.length}`);
    }
    if (text(matches[0]?.name) !== AUDIO_ENDPOINT_NAME) {
      throw new Error(`AVANTIQO_AUDIO_CONFIGURED_ENDPOINT_NAME_MISMATCH:actual=${text(matches[0]?.name) || "MISSING"}`);
    }
    return { endpoint: matches[0], resolution: "ENV_VERIFIED" };
  }
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === AUDIO_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_AUDIO_ENDPOINT_EXACT_NAME_REQUIRED:matches=${matches.length}`);
  }
  return { endpoint: matches[0], resolution: "EXACT_NAME" };
}

const apply = process.argv.includes("--apply");
const approved = upper(process.env.AVANTIQO_AUDIO_RUNPOD_STORAGE_APPROVED) === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_AUDIO_RUNPOD_STORAGE_APPROVED=YES_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID);
const requestedSizeGb = positiveInteger(
  process.env.AVANTIQO_AUDIO_NETWORK_VOLUME_SIZE_GB,
  DEFAULT_VOLUME_SIZE_GB,
);
if (requestedSizeGb < MIN_VOLUME_SIZE_GB) {
  throw new Error(
    `AVANTIQO_AUDIO_NETWORK_VOLUME_TOO_SMALL:requested_gb=${requestedSizeGb}:minimum_gb=${MIN_VOLUME_SIZE_GB}`,
  );
}
const configuredVolumeName = text(process.env.AVANTIQO_AUDIO_NETWORK_VOLUME_NAME);
if (configuredVolumeName && configuredVolumeName !== DEFAULT_VOLUME_NAME) {
  throw new Error(
    `AVANTIQO_AUDIO_NETWORK_VOLUME_NAME_FIXED_BY_SHARED_POLICY:expected=${DEFAULT_VOLUME_NAME}:actual=${configuredVolumeName}`,
  );
}
const monthlyRate = finite(
  process.env.AVANTIQO_RUNPOD_NETWORK_VOLUME_USD_PER_GB_MONTH,
  DEFAULT_STORAGE_USD_PER_GB_MONTH,
);
const estimatedMonthlyUsd = Number((requestedSizeGb * monthlyRate).toFixed(2));
const volumeName = DEFAULT_VOLUME_NAME;

console.log(`AVANTIQO_AUDIO_STORAGE_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_AUDIO_STORAGE_SHARED_GROUP=${SHARED_VOLUME_GROUP.id}`);
console.log(`AVANTIQO_AUDIO_STORAGE_CANONICAL_VOLUME_NAME=${volumeName}`);
console.log(`AVANTIQO_AUDIO_STORAGE_REQUESTED_GB=${requestedSizeGb}`);
console.log(`AVANTIQO_AUDIO_STORAGE_ESTIMATED_MONTHLY_USD=${estimatedMonthlyUsd.toFixed(2)}`);
console.log(`AVANTIQO_AUDIO_STORAGE_EXPECTED_MOUNT_ROOT=${NETWORK_VOLUME_MOUNT_ROOT}`);
console.log(`AVANTIQO_AUDIO_STORAGE_CHECKPOINT_ROOT=${CHECKPOINT_ROOT}`);
console.log("AVANTIQO_AUDIO_STORAGE_SECRET_VALUES_PRINTED=false");
console.log("AVANTIQO_AUDIO_STORAGE_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_AUDIO_STORAGE_PRODUCTION_DEPLOY_PERFORMED=false");

const [endpoints, volumes, dataCenters] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  discoverDatacenters(managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");

const resolved = resolveEndpoint(endpoints, configuredEndpointId);
const endpoint = resolved.endpoint;
const endpointId = text(endpoint.id);
const endpointGpuTypes = list(endpoint.gpuTypeIds);
if (!endpointGpuTypes.length) throw new Error("AVANTIQO_AUDIO_ENDPOINT_GPU_TYPES_REQUIRED");

const alreadyAttachedIds = endpointVolumeIds(endpoint);
if (alreadyAttachedIds.length) {
  const attachedVolumes = volumes.filter((volume) => alreadyAttachedIds.includes(text(volume?.id)));
  if (attachedVolumes.length !== alreadyAttachedIds.length) {
    throw new Error("AVANTIQO_AUDIO_STORAGE_ATTACHED_VOLUME_LOOKUP_FAILED");
  }
  const wrongGroup = attachedVolumes.filter(
    (volume) => classifyManagedVolumeName(volume?.name)?.id !== SHARED_VOLUME_GROUP.id,
  );
  if (wrongGroup.length) {
    throw new Error(
      `AVANTIQO_AUDIO_STORAGE_ATTACHED_VOLUME_WRONG_SHARED_GROUP:count=${wrongGroup.length}`,
    );
  }
  console.log("AVANTIQO_AUDIO_STORAGE_ALREADY_ATTACHED=true");
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: apply ? "APPLY" : "PLAN",
    endpoint_resolution: resolved.resolution,
    endpoint: safeEndpoint(endpoint),
    shared_volume_group: SHARED_VOLUME_GROUP.id,
    shared_volume_policy: sharedVolumePolicySummary(volumes),
    attached_volumes: attachedVolumes.map(safeVolume),
    expected_serverless_mount_root: NETWORK_VOLUME_MOUNT_ROOT,
    checkpoints_dir: CHECKPOINT_ROOT,
    mutation_performed: false,
    generation_submitted: false,
    production_deploy_performed: false,
    next_action: "REPAIR_AUDIO_TEMPLATE_FOR_NETWORK_VOLUME_CACHE",
  }, null, 2));
  process.exit(0);
}

const candidates = evaluateDatacenters(dataCenters, endpointGpuTypes);
if (!candidates.length) {
  throw new Error("AVANTIQO_AUDIO_STORAGE_NO_COMPATIBLE_STORAGE_DATACENTER_WITH_GPU_STOCK");
}

const reusable = resolveReusableGroupVolume(volumes, SHARED_VOLUME_GROUP);
const sharedVolume = reusable.volume;
if (sharedVolume && finite(sharedVolume.size, 0) < requestedSizeGb) {
  throw new Error(
    `AVANTIQO_AUDIO_STORAGE_EXISTING_SHARED_VOLUME_TOO_SMALL:id=${text(sharedVolume.id)}:size_gb=${finite(sharedVolume.size, 0)}:requested_gb=${requestedSizeGb}`,
  );
}
const sharedPolicy = sharedVolumePolicySummary(volumes);
const creationBlockedBySharedInventory =
  !sharedVolume &&
  (
    sharedPolicy.policy_compliant !== true ||
    sharedPolicy.managed_cache_volume_count >= sharedPolicy.maximum_managed_cache_volumes
  );

let selectedDatacenter = candidates[0];
if (sharedVolume) {
  const existingDc = candidates.find((candidate) => candidate.id === text(sharedVolume.dataCenterId));
  if (!existingDc) {
    throw new Error(
      `AVANTIQO_AUDIO_STORAGE_SHARED_VOLUME_DATACENTER_INCOMPATIBLE:id=${text(sharedVolume.id)}:data_center_id=${text(sharedVolume.dataCenterId)}`,
    );
  }
  selectedDatacenter = existingDc;
}

const plan = {
  success: !creationBlockedBySharedInventory,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_resolution: resolved.resolution,
  endpoint: safeEndpoint(endpoint),
  shared_volume_group: SHARED_VOLUME_GROUP.id,
  shared_volume_policy: sharedPolicy,
  blocking_shared_cache_groups: creationBlockedBySharedInventory
    ? sharedPolicy.duplicate_groups
    : [],
  expected_serverless_mount_root: NETWORK_VOLUME_MOUNT_ROOT,
  checkpoints_dir: CHECKPOINT_ROOT,
  requested_volume: {
    name: volumeName,
    size_gb: requestedSizeGb,
    estimated_monthly_usd: estimatedMonthlyUsd,
  },
  selected_datacenter: selectedDatacenter,
  compatible_datacenters: candidates,
  reusable_existing_volume: sharedVolume ? safeVolume(sharedVolume) : null,
  reusable_volume_resolution: reusable.resolution,
  mutation_performed: false,
  generation_submitted: false,
  production_deploy_performed: false,
  safety: {
    approval_required: "AVANTIQO_AUDIO_RUNPOD_STORAGE_APPROVED=YES",
    automatic_delete_on_failure: false,
    endpoint_gpu_types_preserved: true,
    workers_min_preserved: true,
    maximum_managed_cache_volumes: 3,
    additional_audio_voice_volume_forbidden: true,
    shared_cache_inventory_must_be_compliant_before_creation: true,
  },
  next_action: creationBlockedBySharedInventory
    ? "COMPLETE_SHARED_CACHE_CONSOLIDATION_THEN_REPLAN_AUDIO_STORAGE"
    : apply
      ? "CREATE_OR_REUSE_SHARED_VOLUME_AND_ATTACH_ENDPOINT"
      : "APPROVE_AUDIO_STORAGE_PROVISION",
};

if (!apply) {
  if (creationBlockedBySharedInventory) {
    console.log("AVANTIQO_AUDIO_STORAGE_PLAN=BLOCKED_SHARED_CACHE_CONSOLIDATION");
    console.log(JSON.stringify(plan, null, 2));
    process.exit(2);
  }
  console.log("AVANTIQO_AUDIO_STORAGE_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (creationBlockedBySharedInventory) {
  throw new Error(
    `AVANTIQO_AUDIO_STORAGE_SHARED_CACHE_CONSOLIDATION_REQUIRED:managed=${sharedPolicy.managed_cache_volume_count}:maximum=${sharedPolicy.maximum_managed_cache_volumes}:duplicate_groups=${sharedPolicy.duplicate_groups.join("|") || "NONE"}`,
  );
}

const freshEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
if (!Array.isArray(freshEndpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID_BEFORE_WRITE");
const freshResolved = resolveEndpoint(freshEndpoints, endpointId);
const freshEndpoint = freshResolved.endpoint;
if (endpointVolumeIds(freshEndpoint).length) {
  throw new Error("AVANTIQO_AUDIO_STORAGE_CONCURRENT_VOLUME_ATTACHMENT_DETECTED");
}
if (text(freshEndpoint.templateId || freshEndpoint.template?.id) !== text(endpoint.templateId || endpoint.template?.id)) {
  throw new Error("AVANTIQO_AUDIO_STORAGE_CONCURRENT_TEMPLATE_CHANGE_DETECTED");
}

const freshVolumes = await rest("/networkvolumes", managementKey);
if (!Array.isArray(freshVolumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID_BEFORE_WRITE");
const freshReusable = resolveReusableGroupVolume(freshVolumes, SHARED_VOLUME_GROUP);
if (Boolean(freshReusable.volume) !== Boolean(sharedVolume)) {
  throw new Error("AVANTIQO_AUDIO_STORAGE_CONCURRENT_SHARED_VOLUME_CHANGE_DETECTED");
}
if (freshReusable.volume && text(freshReusable.volume.id) !== text(sharedVolume?.id)) {
  throw new Error("AVANTIQO_AUDIO_STORAGE_CONCURRENT_SHARED_VOLUME_ID_CHANGE_DETECTED");
}

let volume = freshReusable.volume;
let volumeAction = "REUSED";
if (!volume) {
  assertManagedVolumeCreationAllowed(freshVolumes, SHARED_VOLUME_GROUP);
  volume = await rest("/networkvolumes", managementKey, {
    method: "POST",
    body: {
      dataCenterId: selectedDatacenter.id,
      name: volumeName,
      size: requestedSizeGb,
    },
  });
  volumeAction = "CREATED_SHARED_AUDIO_VOICE";
}
const volumeId = text(volume?.id);
if (!volumeId) throw new Error("AVANTIQO_AUDIO_STORAGE_VOLUME_ID_REQUIRED");
console.log(`AVANTIQO_AUDIO_STORAGE_VOLUME_ACTION=${volumeAction}`);

try {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: {
      networkVolumeId: volumeId,
      dataCenterIds: [selectedDatacenter.id],
    },
  });
} catch (error) {
  console.error(`AVANTIQO_AUDIO_STORAGE_ENDPOINT_ATTACH_FAILED=${text(error?.message || error)}`);
  console.error("AVANTIQO_AUDIO_STORAGE_VOLUME_LEFT_INTACT=true");
  throw error;
}

const [verifiedEndpoint, verifiedVolume] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  rest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey),
]);
if (!endpointVolumeIds(verifiedEndpoint).includes(volumeId)) {
  throw new Error("AVANTIQO_AUDIO_STORAGE_ATTACHMENT_VERIFICATION_FAILED");
}
if (classifyManagedVolumeName(verifiedVolume?.name)?.id !== SHARED_VOLUME_GROUP.id) {
  throw new Error("AVANTIQO_AUDIO_STORAGE_SHARED_GROUP_VERIFICATION_FAILED");
}
if (text(verifiedVolume?.dataCenterId) !== selectedDatacenter.id) {
  throw new Error("AVANTIQO_AUDIO_STORAGE_DATACENTER_VERIFICATION_FAILED");
}
if (finite(verifiedVolume?.size, 0) < requestedSizeGb) {
  throw new Error("AVANTIQO_AUDIO_STORAGE_SIZE_VERIFICATION_FAILED");
}

console.log("AVANTIQO_AUDIO_STORAGE_APPLY=COMPLETE");
console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  endpoint: safeEndpoint(verifiedEndpoint),
  volume: safeVolume(verifiedVolume),
  volume_action: volumeAction,
  mutation_performed: true,
  shared_volume_policy_after: sharedVolumePolicySummary([
    ...freshVolumes.filter((entry) => text(entry?.id) !== volumeId),
    verifiedVolume,
  ]),
  next_action: "REPAIR_AUDIO_TEMPLATE_FOR_RUNPOD_VOLUME_THEN_FINGERPRINT",
}, null, 2));
