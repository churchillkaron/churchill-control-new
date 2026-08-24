const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const BASELINE_GPU_TYPES = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
];

function text(value) {
  return String(value ?? "").trim();
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function jobIdFromArgs() {
  const entry = process.argv.find((value) => value.startsWith("--job-id="));
  return text(entry ? entry.slice("--job-id=".length) : process.env.AVANTIQO_IMAGE_GENERATION_JOB_ID);
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

async function readJson(response, prefix) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    throw new Error(`${prefix}_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function rest(path, key) {
  const response = await fetch(`${REST_BASE}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "RUNPOD_REST_HTTP");
}

async function queue(endpointId, path, key) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "RUNPOD_QUEUE_HTTP");
}

async function gpuAvailability(managementKey) {
  const query = `
    query AvantiqoImage96GbCapacity($input: GpuAvailabilityInput) {
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
    const detail = text(
      body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw,
    ).slice(0, 1200);
    throw new Error(`RUNPOD_GPU_AVAILABILITY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.dataCenters;
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const jobId = jobIdFromArgs();

console.log("AVANTIQO_IMAGE_96GB_DIAGNOSTIC_MODE=READ_ONLY");
console.log("AVANTIQO_IMAGE_96GB_DIAGNOSTIC_ENDPOINT_MUTATION=false");
console.log("AVANTIQO_IMAGE_96GB_DIAGNOSTIC_JOB_SUBMISSION=false");
console.log("AVANTIQO_IMAGE_96GB_DIAGNOSTIC_VOLUME_MUTATION=false");
console.log("AVANTIQO_IMAGE_96GB_DIAGNOSTIC_TEMPLATE_MUTATION=false");
console.log("AVANTIQO_IMAGE_96GB_DIAGNOSTIC_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_96GB_DIAGNOSTIC_SECRETS_PRINTED=false");

const endpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=false", managementKey);
if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
const matches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
if (matches.length !== 1) {
  throw new Error(`AVANTIQO_IMAGE_96GB_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
}
const endpointId = text(matches[0]?.id);
if (!endpointId) throw new Error("AVANTIQO_IMAGE_96GB_ENDPOINT_ID_MISSING");

const [endpoint, volumes, availability, health, job] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  rest("/networkvolumes", managementKey),
  gpuAvailability(managementKey),
  queue(endpointId, "/health", inferenceKey),
  jobId ? queue(endpointId, `/status/${encodeURIComponent(jobId)}`, inferenceKey) : Promise.resolve(null),
]);

if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");
const volumeIds = endpointVolumeIds(endpoint);
const attachedVolumes = volumeIds.map((id) => volumes.find((volume) => text(volume?.id) === id));
if (attachedVolumes.some((volume) => !volume)) {
  throw new Error("AVANTIQO_IMAGE_96GB_ATTACHED_VOLUME_NOT_FOUND");
}
const dataCenterIds = unique(attachedVolumes.map((volume) => volume?.dataCenterId));
const endpointGpuTypes = unique(list(endpoint?.gpuTypeIds));

const perRegion = dataCenterIds.map((dataCenterId) => {
  const dc = availability.find((candidate) => text(candidate?.id) === dataCenterId);
  const entries = list(dc?.gpuAvailability);
  const baseline = BASELINE_GPU_TYPES.map((gpuTypeId) => {
    const candidate = entries.find((entry) => text(entry?.gpuTypeId) === gpuTypeId);
    return {
      gpu_type_id: gpuTypeId,
      stock_status: text(candidate?.stockStatus) || "UNAVAILABLE",
      display_name: text(candidate?.gpuTypeDisplayName || candidate?.displayName) || null,
      returned_by_api: Boolean(candidate),
    };
  });
  return {
    data_center_id: dataCenterId,
    baseline_96gb_pro: baseline,
    any_baseline_returned: baseline.some((entry) => entry.returned_by_api),
    any_baseline_stock: baseline.some((entry) => !["", "NONE", "UNAVAILABLE"].includes(entry.stock_status.toUpperCase())),
  };
});

const jobs = health?.jobs && typeof health.jobs === "object" ? health.jobs : {};
const workers = health?.workers && typeof health.workers === "object" ? health.workers : {};
const report = {
  success: true,
  contract: "AVANTIQO_IMAGE_96GB_REGIONAL_CAPACITY_DIAGNOSTIC_V1",
  endpoint_name: IMAGE_ENDPOINT_NAME,
  endpoint_id_present: true,
  endpoint_gpu_types: endpointGpuTypes,
  expected_96gb_pro_gpu_types: BASELINE_GPU_TYPES,
  endpoint_matches_expected_96gb_pool: BASELINE_GPU_TYPES.every((gpu) => endpointGpuTypes.includes(gpu)),
  attached_volume_count: volumeIds.length,
  attached_data_centers: dataCenterIds,
  regional_capacity: perRegion,
  health: {
    in_queue: Number(jobs.inQueue ?? jobs.in_queue ?? 0),
    in_progress: Number(jobs.inProgress ?? jobs.in_progress ?? 0),
    initializing: Number(workers.initializing ?? 0),
    ready: Number(workers.ready ?? 0),
    running: Number(workers.running ?? 0),
    idle: Number(workers.idle ?? 0),
    throttled: Number(workers.throttled ?? 0),
    unhealthy: Number(workers.unhealthy ?? 0),
  },
  job: job
    ? {
        id: jobId,
        status: text(job?.status).toUpperCase() || "UNKNOWN",
        delay_ms: Number.isFinite(Number(job?.delayTime)) ? Number(job.delayTime) : null,
        execution_ms: Number.isFinite(Number(job?.executionTime)) ? Number(job.executionTime) : null,
      }
    : null,
  mutations_performed: false,
};

console.log("AVANTIQO_IMAGE_96GB_DIAGNOSTIC_COMPLETE=YES");
console.log(JSON.stringify(report, null, 2));
