import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_VOICE_TTS_BLACKWELL_CAPACITY_DIAGNOSTIC_V1";
const LOCK_CONTRACT = "AVANTIQO_VOICE_TTS_CONTROLLED_GENERATION_V1";
const LOCK_PATH = "audits/results/avantiqo-voice-tts-controlled-generation.json";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1";
const REQUIRED_CUDA = "12.8";
const CERTIFIED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:c9ce291cc27bb7de119cf1120a92dd6466962b6d79fd5728a1266a743bad1a06";
const CONFIGURED_BLACKWELL_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA GeForce RTX 5090",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
]);

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function upper(value) {
  return text(value).toUpperCase();
}

function stockRank(value) {
  return ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[upper(value)] || 0);
}

function sameSet(left, right) {
  const a = unique(list(left)).sort();
  const b = unique(list(right)).sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}

async function readJsonResponse(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function rest(pathname, managementKey) {
  return readJsonResponse(await fetch(`${REST_BASE}${pathname}`, {
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_CAPACITY_REST");
}

async function queue(endpointId, inferenceKey, pathname) {
  return readJsonResponse(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: {
      Authorization: `Bearer ${inferenceKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_CAPACITY_QUEUE");
}

async function endpointBoundTemplates(managementKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_CAPACITY_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VOICE_TTS_CAPACITY_TEMPLATE_ID_REQUIRED");
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_CAPACITY_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`,
    );
  }
  return matches[0];
}

async function discoverDatacenters(managementKey) {
  const queryText = `
    query AvantiqoVoiceTtsBlackwellCapacity($input: GpuAvailabilityInput) {
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
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query: queryText,
      variables: {
        input: {
          gpuCount: 1,
          minDisk: 5,
          minMemoryInGb: 20,
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
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    const detail = text(
      body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw,
    ).slice(0, 1000);
    throw new Error(`AVANTIQO_VOICE_TTS_CAPACITY_GRAPHQL_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.dataCenters;
}

function healthSummary(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      retried: finite(jobs.retried, 0),
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

function endpointVolumeIds(endpoint = {}) {
  return unique([
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ]);
}

function blackwellFamily(row = {}) {
  const label = [row.gpu_type_id, row.gpu_name].filter(Boolean).join(" ");
  if (/\b5090\b/i.test(label)) return "RTX_5090_32GB_SM120";
  if (/RTX\s*PRO\s*4500.*BLACKWELL|BLACKWELL.*RTX\s*PRO\s*4500/i.test(label)) {
    return "RTX_PRO_4500_BLACKWELL_32GB_SM120";
  }
  if (/RTX\s*(?:PRO\s*6000|6000\s*PRO)/i.test(label) && /BLACKWELL|PRO\s*6000|6000\s*PRO/i.test(label)) {
    return "RTX_PRO_6000_BLACKWELL_96GB_SM120";
  }
  if (/\bB200\b/i.test(label)) return "B200_BLACKWELL";
  if (/\bB300\b/i.test(label)) return "B300_BLACKWELL";
  return null;
}

function capacityRow(dataCenter = {}, gpu = {}) {
  const row = {
    data_center_id: text(dataCenter?.id) || null,
    data_center_name: text(dataCenter?.name) || null,
    location: text(dataCenter?.location) || null,
    storage_support: dataCenter?.storageSupport === true,
    gpu_type_id: text(gpu?.gpuTypeId) || null,
    gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName || gpu?.gpuTypeId) || null,
    available: gpu?.available === true,
    stock_status: text(gpu?.stockStatus) || "UNAVAILABLE",
    stock_rank: stockRank(gpu?.stockStatus),
  };
  return { ...row, blackwell_family: blackwellFamily(row) };
}

function rankRows(rows) {
  return [...rows].sort((left, right) =>
    right.stock_rank - left.stock_rank ||
    Number(right.available) - Number(left.available) ||
    String(left.data_center_id).localeCompare(String(right.data_center_id)) ||
    String(left.gpu_type_id).localeCompare(String(right.gpu_type_id)),
  );
}

const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
if (lock?.contract !== LOCK_CONTRACT) throw new Error("AVANTIQO_VOICE_TTS_CAPACITY_LOCK_CONTRACT_MISMATCH");
if (lock?.generation_submitted !== true || Number(lock?.accepted_generation_count) !== 1) {
  throw new Error("AVANTIQO_VOICE_TTS_CAPACITY_ONE_ACCEPTED_GENERATION_REQUIRED");
}
if (lock?.new_generation_allowed !== false) throw new Error("AVANTIQO_VOICE_TTS_CAPACITY_GENERATION_LOCK_REQUIRED");

const endpointId = text(lock.endpoint_id);
const jobId = text(lock.job_id);
if (!endpointId || !jobId) throw new Error("AVANTIQO_VOICE_TTS_CAPACITY_LOCK_IDS_REQUIRED");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = required("RUNPOD_API_KEY");

const [endpoint, templates, healthRaw, statusRaw, volumesRaw, datacenters] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  endpointBoundTemplates(managementKey),
  queue(endpointId, inferenceKey, "/health"),
  queue(endpointId, inferenceKey, `/status/${encodeURIComponent(jobId)}`),
  rest("/networkvolumes", managementKey),
  discoverDatacenters(managementKey),
]);

if (text(endpoint.id) !== endpointId || text(endpoint.name) !== ENDPOINT_NAME) {
  throw new Error("AVANTIQO_VOICE_TTS_CAPACITY_ENDPOINT_BINDING_MISMATCH");
}
const template = resolveTemplate(endpoint, templates);
const templateImage = text(template.imageName);
if (templateImage !== CERTIFIED_IMAGE) {
  throw new Error(`AVANTIQO_VOICE_TTS_CAPACITY_IMAGE_MISMATCH:actual=${templateImage || "missing"}`);
}

const configuredGpuTypeIds = unique(list(endpoint.gpuTypeIds).map(text));
const explicitDataCenterIds = unique(list(endpoint.dataCenterIds).map(text));
const volumeIds = endpointVolumeIds(endpoint);
const volumes = normalizeListResponse(volumesRaw, ["networkVolumes", "volumes"]) || [];
const attachedVolumes = volumes
  .filter((volume) => volumeIds.includes(text(volume?.id)))
  .map((volume) => ({
    id: text(volume?.id) || null,
    name: text(volume?.name) || null,
    data_center_id: text(volume?.dataCenterId) || null,
    size_gb: finite(volume?.size ?? volume?.sizeGb),
  }));
const volumeDataCenterIds = unique(attachedVolumes.map((volume) => volume.data_center_id));
const effectiveDataCenterIds = volumeDataCenterIds.length ? volumeDataCenterIds : explicitDataCenterIds;
const effectivePlacementSource = volumeDataCenterIds.length
  ? "NETWORK_VOLUME_DATACENTER"
  : explicitDataCenterIds.length
    ? "ENDPOINT_DATACENTER_RESTRICTION"
    : "GLOBAL_SERVERLESS_PLACEMENT";

const allRows = datacenters.flatMap((dc) =>
  list(dc?.gpuAvailability).map((gpu) => capacityRow(dc, gpu)),
);
const blackwellRows = rankRows(allRows.filter((row) => row.blackwell_family));
const configuredRows = rankRows(allRows.filter((row) => configuredGpuTypeIds.includes(row.gpu_type_id)));
const configuredAvailableRows = configuredRows.filter((row) => row.available && row.stock_rank > 0);
const availableBlackwellRows = blackwellRows.filter((row) => row.available && row.stock_rank > 0);
const effectiveConfiguredRows = effectiveDataCenterIds.length
  ? configuredRows.filter((row) => effectiveDataCenterIds.includes(row.data_center_id))
  : configuredRows;
const effectiveConfiguredAvailableRows = effectiveConfiguredRows.filter(
  (row) => row.available && row.stock_rank > 0,
);
const effectiveBlackwellRows = effectiveDataCenterIds.length
  ? blackwellRows.filter((row) => effectiveDataCenterIds.includes(row.data_center_id))
  : blackwellRows;
const effectiveAvailableBlackwellRows = effectiveBlackwellRows.filter(
  (row) => row.available && row.stock_rank > 0,
);

const discoveredBlackwellGpuTypeIds = unique(availableBlackwellRows.map((row) => row.gpu_type_id));
const configuredIdsSeenByAvailabilityApi = configuredGpuTypeIds.filter((id) =>
  allRows.some((row) => row.gpu_type_id === id),
);
const configuredIdsMissingFromAvailabilityApi = configuredGpuTypeIds.filter(
  (id) => !configuredIdsSeenByAvailabilityApi.includes(id),
);

let diagnosis = "CONFIGURED_BLACKWELL_CAPACITY_AVAILABLE_WAIT_FOR_SCHEDULER";
if (volumeDataCenterIds.length && effectiveConfiguredAvailableRows.length === 0 && availableBlackwellRows.length > 0) {
  diagnosis = "NETWORK_VOLUME_DATACENTER_BLOCKS_CONFIGURED_BLACKWELL_CAPACITY";
} else if (configuredAvailableRows.length === 0 && availableBlackwellRows.length > 0) {
  diagnosis = "CONFIGURED_GPU_IDS_HAVE_NO_LIVE_STOCK_BUT_OTHER_BLACKWELL_EXISTS";
} else if (configuredIdsMissingFromAvailabilityApi.length && configuredAvailableRows.length === 0) {
  diagnosis = "CONFIGURED_GPU_IDS_NOT_RETURNED_BY_LIVE_AVAILABILITY_API";
} else if (availableBlackwellRows.length === 0) {
  diagnosis = "NO_LIVE_SECURE_CLOUD_BLACKWELL_STOCK_REPORTED";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  generation_submitted: false,
  accepted_generation_count: 1,
  new_generation_allowed: false,
  queue_mutation_performed: false,
  endpoint_mutation_performed: false,
  storage_mutation_performed: false,
  job_cancelled: false,
  queue_purged: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  job: {
    id: jobId,
    status: upper(statusRaw?.status) || "UNKNOWN",
    delay_ms: finite(statusRaw?.delayTime),
    execution_ms: finite(statusRaw?.executionTime),
  },
  health: healthSummary(healthRaw),
  endpoint: {
    id: endpointId,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    template_image: templateImage,
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    compute_type: text(endpoint.computeType) || null,
    gpu_count: finite(endpoint.gpuCount),
    gpu_type_ids: configuredGpuTypeIds,
    configured_blackwell_gpu_type_ids_match_expected: sameSet(
      configuredGpuTypeIds,
      CONFIGURED_BLACKWELL_GPU_TYPE_IDS,
    ),
    explicit_data_center_ids: explicitDataCenterIds,
    network_volume_ids: volumeIds,
    attached_network_volumes: attachedVolumes,
    effective_data_center_ids: effectiveDataCenterIds,
    effective_placement_source: effectivePlacementSource,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
    flashboot: endpoint.flashboot === true,
  },
  live_capacity: {
    configured_gpu_ids_seen_by_availability_api: configuredIdsSeenByAvailabilityApi,
    configured_gpu_ids_missing_from_availability_api: configuredIdsMissingFromAvailabilityApi,
    configured_available_rows: configuredAvailableRows.slice(0, 40),
    effective_configured_available_rows: effectiveConfiguredAvailableRows.slice(0, 40),
    discovered_available_blackwell_gpu_type_ids: discoveredBlackwellGpuTypeIds,
    available_blackwell_rows: availableBlackwellRows.slice(0, 60),
    effective_available_blackwell_rows: effectiveAvailableBlackwellRows.slice(0, 60),
  },
  diagnosis,
  safe_to_submit_duplicate_job: false,
  next_action: diagnosis === "CONFIGURED_BLACKWELL_CAPACITY_AVAILABLE_WAIT_FOR_SCHEDULER"
    ? "INSPECT_SERVERLESS_SCHEDULER_OR_ACCOUNT_CONSTRAINTS_FOR_EXISTING_JOB"
    : diagnosis === "NETWORK_VOLUME_DATACENTER_BLOCKS_CONFIGURED_BLACKWELL_CAPACITY"
      ? "DETACH_OR_RELOCATE_UNUSED_TTS_NETWORK_VOLUME_WITHOUT_REPLACING_JOB"
      : diagnosis === "CONFIGURED_GPU_IDS_HAVE_NO_LIVE_STOCK_BUT_OTHER_BLACKWELL_EXISTS" || diagnosis === "CONFIGURED_GPU_IDS_NOT_RETURNED_BY_LIVE_AVAILABILITY_API"
        ? "REPLAN_ENDPOINT_GPU_POOL_TO_LIVE_SM120_BLACKWELL_IDS_WITHOUT_NEW_JOB"
        : "KEEP_EXISTING_JOB_LOCKED_AND_RECHECK_CAPACITY",
}, null, 2));
