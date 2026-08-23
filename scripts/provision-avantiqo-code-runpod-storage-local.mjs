const REST_BASE = "https://rest.runpod.io/v1";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const DEFAULT_VOLUME_NAME = "avantiqo-code-model-cache";
const DEFAULT_VOLUME_SIZE_GB = 80;
const MIN_VOLUME_SIZE_GB = 48;
const DEFAULT_STORAGE_USD_PER_GB_MONTH = 0.07;
const MIN_GPU_MEMORY_GB = 48;

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
          stockStatus
          gpuTypeId
          gpuTypeDisplayName
          displayName
        }
      }
    }
  `;
  const url = `${GRAPHQL_URL}?api_key=${encodeURIComponent(credential)}`;
  const response = await fetch(url, {
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
  if (!Array.isArray(dataCenters)) {
    throw new Error("RUNPOD_DATACENTER_DISCOVERY_INVALID_RESPONSE");
  }
  return dataCenters;
}

function endpointVolumeIds(endpoint = {}) {
  return [
    text(endpoint.networkVolumeId),
    ...(Array.isArray(endpoint.networkVolumeIds) ? endpoint.networkVolumeIds.map(text) : []),
  ].filter(Boolean);
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
    "EU-CZ-1",
    "EU-RO-1",
    "EU-NL-1",
    "EU-SE-1",
    "US-GA-2",
    "US-IL-1",
    "US-KS-2",
    "US-NC-1",
  ];
  const index = order.indexOf(text(id));
  return index < 0 ? 0 : order.length - index;
}

function evaluateDatacenters(dataCenters, endpointGpuTypes) {
  return dataCenters
    .filter((dc) => dc?.storageSupport === true)
    .map((dc) => {
      const matching = (Array.isArray(dc?.gpuAvailability) ? dc.gpuAvailability : [])
        .filter((gpu) => endpointGpuTypes.includes(text(gpu?.gpuTypeId)))
        .map((gpu) => ({
          gpu_type_id: text(gpu?.gpuTypeId) || null,
          gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName) || null,
          stock_status: text(gpu?.stockStatus) || null,
          stock_score: stockScore(gpu?.stockStatus),
        }))
        .sort((a, b) => b.stock_score - a.stock_score);
      const bestGpu = matching[0] || null;
      return {
        id: text(dc?.id) || null,
        name: text(dc?.name) || null,
        location: text(dc?.location) || null,
        storage_support: true,
        compatible_gpu_count: matching.length,
        best_gpu: bestGpu,
        score: (bestGpu?.stock_score || 0) + regionPreference(dc?.id),
      };
    })
    .filter((dc) => dc.id && dc.best_gpu && dc.best_gpu.stock_score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    network_volume_id: text(endpoint.networkVolumeId) || null,
    network_volume_ids: Array.isArray(endpoint.networkVolumeIds)
      ? endpoint.networkVolumeIds.map(text).filter(Boolean)
      : [],
    data_center_ids: Array.isArray(endpoint.dataCenterIds)
      ? endpoint.dataCenterIds.map(text).filter(Boolean)
      : [],
    gpu_type_ids: Array.isArray(endpoint.gpuTypeIds)
      ? endpoint.gpuTypeIds.map(text).filter(Boolean)
      : [],
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
const monthlyRate = finite(
  process.env.AVANTIQO_RUNPOD_NETWORK_VOLUME_USD_PER_GB_MONTH,
  DEFAULT_STORAGE_USD_PER_GB_MONTH,
);
const volumeName = text(process.env.AVANTIQO_CODE_NETWORK_VOLUME_NAME) || DEFAULT_VOLUME_NAME;
const estimatedMonthlyUsd = Number((requestedSizeGb * monthlyRate).toFixed(2));

if (requestedSizeGb < MIN_VOLUME_SIZE_GB) {
  throw new Error(
    `AVANTIQO_CODE_NETWORK_VOLUME_TOO_SMALL:requested_gb=${requestedSizeGb}:minimum_gb=${MIN_VOLUME_SIZE_GB}`,
  );
}

console.log(`AVANTIQO_CODE_STORAGE_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_CODE_STORAGE_REQUESTED_GB=${requestedSizeGb}`);
console.log(`AVANTIQO_CODE_STORAGE_ESTIMATED_MONTHLY_USD=${estimatedMonthlyUsd.toFixed(2)}`);
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

const alreadyAttached = endpointVolumeIds(endpoint);
if (alreadyAttached.length) {
  const existingAttached = volumes.filter((volume) => alreadyAttached.includes(text(volume?.id)));
  console.log("AVANTIQO_CODE_STORAGE_ALREADY_ATTACHED=true");
  console.log(JSON.stringify({
    success: true,
    contract: "AVANTIQO_CODE_RUNPOD_STORAGE_V1",
    mode: apply ? "APPLY" : "PLAN",
    mutation_performed: false,
    endpoint: safeEndpoint(endpoint),
    attached_volumes: existingAttached.map(safeVolume),
    next_action: "REFRESH_CODE_RUNPOD_WORKER",
  }, null, 2));
  process.exit(0);
}

const endpointGpuTypes = Array.isArray(endpoint?.gpuTypeIds)
  ? endpoint.gpuTypeIds.map(text).filter(Boolean)
  : [];
if (!endpointGpuTypes.length) throw new Error("AVANTIQO_CODE_ENDPOINT_GPU_TYPES_REQUIRED");

const candidates = evaluateDatacenters(dataCenters, endpointGpuTypes);
if (!candidates.length) {
  throw new Error("AVANTIQO_CODE_STORAGE_NO_COMPATIBLE_STORAGE_DATACENTER_WITH_GPU_STOCK");
}
const selectedDatacenter = candidates[0];

const sameNameVolumes = volumes.filter((volume) => text(volume?.name) === volumeName);
if (sameNameVolumes.length > 1) {
  throw new Error(`AVANTIQO_CODE_STORAGE_AMBIGUOUS_EXISTING_VOLUMES:count=${sameNameVolumes.length}`);
}
const sameNameVolume = sameNameVolumes[0] || null;
if (sameNameVolume && finite(sameNameVolume.size, 0) < requestedSizeGb) {
  throw new Error(
    `AVANTIQO_CODE_STORAGE_EXISTING_VOLUME_TOO_SMALL:id=${text(sameNameVolume.id)}:size_gb=${finite(sameNameVolume.size, 0)}:requested_gb=${requestedSizeGb}`,
  );
}
if (sameNameVolume && text(sameNameVolume.dataCenterId) !== selectedDatacenter.id) {
  throw new Error(
    `AVANTIQO_CODE_STORAGE_EXISTING_VOLUME_DATACENTER_MISMATCH:id=${text(sameNameVolume.id)}:actual=${text(sameNameVolume.dataCenterId)}:selected=${selectedDatacenter.id}`,
  );
}

const plan = {
  success: true,
  contract: "AVANTIQO_CODE_RUNPOD_STORAGE_V1",
  mode: apply ? "APPLY" : "PLAN",
  mutation_performed: false,
  endpoint: safeEndpoint(endpoint),
  runtime_model: "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8",
  runtime_model_repository_size_gb: 31.2,
  requested_volume: {
    name: volumeName,
    size_gb: requestedSizeGb,
    minimum_gb: MIN_VOLUME_SIZE_GB,
    estimated_monthly_usd: estimatedMonthlyUsd,
  },
  selected_datacenter: selectedDatacenter,
  compatible_datacenters: candidates,
  reusable_existing_volume: sameNameVolume ? safeVolume(sameNameVolume) : null,
  safety: {
    network_volume_create_requires_apply: true,
    recurring_storage_spend_requires_explicit_approval: true,
    endpoint_patch_requires_apply: true,
    automatic_delete_on_failure: false,
    generation_submitted: false,
    production_deploy_performed: false,
  },
};

if (!apply) {
  console.log("AVANTIQO_CODE_STORAGE_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (!sameNameVolume && !approved(process.env.AVANTIQO_CODE_STORAGE_SPEND_APPROVED)) {
  throw new Error(
    `AVANTIQO_CODE_STORAGE_SPEND_APPROVAL_REQUIRED:estimated_monthly_usd=${estimatedMonthlyUsd.toFixed(2)}:set_AVANTIQO_CODE_STORAGE_SPEND_APPROVED=YES`,
  );
}

// Re-read immediately before mutation so apply cannot proceed on stale endpoint state.
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

let volume = sameNameVolume;
let volumeAction = "REUSED";
if (!volume) {
  volume = await restRequest("/networkvolumes", managementKey, {
    method: "POST",
    body: {
      dataCenterId: selectedDatacenter.id,
      name: volumeName,
      size: requestedSizeGb,
    },
  });
  volumeAction = "CREATED";
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
const verifiedIds = endpointVolumeIds(verifiedEndpoint);
const attached = verifiedIds.includes(volumeId);
const datacenterBound = Array.isArray(verifiedEndpoint?.dataCenterIds)
  && verifiedEndpoint.dataCenterIds.map(text).includes(selectedDatacenter.id);
if (!attached || !datacenterBound) {
  throw new Error(
    `AVANTIQO_CODE_STORAGE_VERIFICATION_FAILED:attached=${attached}:datacenter_bound=${datacenterBound}`,
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
  next_action: "REFRESH_CODE_RUNPOD_WORKER",
}, null, 2));
