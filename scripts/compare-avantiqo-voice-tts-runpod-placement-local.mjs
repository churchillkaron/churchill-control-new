import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const GQL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_VOICE_TTS_RUNPOD_PLACEMENT_COMPARISON_V1";
const LOCK_PATH = "audits/results/avantiqo-voice-tts-controlled-generation.json";
const LOCK_CONTRACT = "AVANTIQO_VOICE_TTS_CONTROLLED_GENERATION_V1";
const COMPARATOR_NAME = "services/avantiqo-voice-tts-v1";
const MIG_GPU = "NVIDIA RTX PRO 6000 Blackwell Server Edition MIG 1g.24gb";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function unique(values) { return [...new Set(values.map(text).filter(Boolean))]; }
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}
async function rest(path, key) {
  return readJson(await fetch(`${REST}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_REST");
}
async function controlWorkers(endpointId, key) {
  return readJson(await fetch(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_CONTROL_WORKERS");
}
async function availability(key) {
  const query = `
    query AvantiqoVoicePlacementCapacity($input: GpuAvailabilityInput) {
      dataCenters {
        id
        name
        location
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
  const response = await fetch(`${GQL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 1, secureCloud: true } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    const detail = text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw).slice(0, 1200);
    throw new Error(`RUNPOD_GPU_AVAILABILITY_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.dataCenters;
}
function safeWorker(worker = {}) {
  return {
    id_present: Boolean(text(worker.id)),
    status: text(worker.status || worker.desiredStatus).toUpperCase() || null,
    gpu_type_id: text(worker.gpuTypeId || worker.gpu?.displayName || worker.machine?.gpuDisplayName) || null,
    data_center_id: text(worker.dataCenterId || worker.machine?.dataCenterId) || null,
    cost_per_hr: finite(worker.costPerHr),
  };
}
function safeTemplate(template = {}) {
  const env = template?.env && typeof template.env === "object" && !Array.isArray(template.env)
    ? template.env
    : {};
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName || template.image) || null,
    container_disk_gb: finite(template.containerDiskInGb),
    volume_gb: finite(template.volumeInGb),
    volume_mount_path: text(template.volumeMountPath) || null,
    docker_entrypoint: list(template.dockerEntrypoint),
    docker_start_cmd: list(template.dockerStartCmd),
    registry_auth_present: Boolean(text(template.containerRegistryAuthId)),
    env_keys: Object.keys(env).sort(),
  };
}
function safeEndpoint(endpoint = {}, templateById = new Map(), control = {}) {
  const templateId = text(endpoint.templateId || endpoint.template?.id);
  const embedded = endpoint?.template && typeof endpoint.template === "object" ? endpoint.template : null;
  const template = embedded && Object.keys(embedded).length ? embedded : templateById.get(templateId) || null;
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    template_id: templateId || null,
    template: template ? safeTemplate(template) : null,
    compute_type: text(endpoint.computeType) || null,
    gpu_count: finite(endpoint.gpuCount),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    allowed_cuda_versions: list(endpoint.allowedCudaVersions),
    data_center_ids: list(endpoint.dataCenterIds).map(text).filter(Boolean),
    network_volume_ids: endpointVolumeIds(endpoint),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
    flashboot: endpoint.flashboot ?? endpoint.flashBoot ?? null,
    rest_workers: list(endpoint.workers).map(safeWorker),
    control_workers: list(control?.workers).map(safeWorker),
  };
}
function capacityRows(dataCenters, gpuIds) {
  const rows = [];
  for (const dc of dataCenters) {
    for (const gpu of list(dc?.gpuAvailability)) {
      const gpuTypeId = text(gpu?.gpuTypeId);
      if (!gpuIds.includes(gpuTypeId)) continue;
      rows.push({
        data_center_id: text(dc?.id) || null,
        location: text(dc?.location || dc?.name) || null,
        gpu_type_id: gpuTypeId,
        available: gpu?.available === true,
        stock_status: text(gpu?.stockStatus).toUpperCase() || "UNKNOWN",
      });
    }
  }
  return rows;
}

const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
if (lock?.contract !== LOCK_CONTRACT) throw new Error("VOICE_PLACEMENT_LOCK_CONTRACT_MISMATCH");
if (Number(lock?.accepted_generation_count) !== 1 || lock?.new_generation_allowed !== false || lock?.stt_submitted !== false) {
  throw new Error("VOICE_PLACEMENT_GENERATION_LOCK_REQUIRED");
}
const canonicalEndpointId = text(lock.endpoint_id);
const certifiedImage = text(lock.immutable_image_reference);
if (!canonicalEndpointId || !certifiedImage) throw new Error("VOICE_PLACEMENT_LOCK_EVIDENCE_REQUIRED");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const [endpoints, templates, dataCenters] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  availability(managementKey),
]);
if (!Array.isArray(endpoints)) throw new Error("VOICE_PLACEMENT_ENDPOINT_LIST_INVALID");
if (!Array.isArray(templates)) throw new Error("VOICE_PLACEMENT_TEMPLATE_LIST_INVALID");

const canonicalRaw = endpoints.find((endpoint) => text(endpoint?.id) === canonicalEndpointId);
if (!canonicalRaw) throw new Error("VOICE_PLACEMENT_CANONICAL_ENDPOINT_NOT_FOUND");
const comparatorMatches = endpoints.filter((endpoint) => text(endpoint?.name) === COMPARATOR_NAME);
if (comparatorMatches.length !== 1) {
  throw new Error(`VOICE_PLACEMENT_COMPARATOR_RESOLUTION_FAILED:matches=${comparatorMatches.length}`);
}
const comparatorRaw = comparatorMatches[0];
const [canonicalControl, comparatorControl] = await Promise.all([
  controlWorkers(canonicalEndpointId, managementKey),
  controlWorkers(text(comparatorRaw.id), managementKey),
]);

const templateById = new Map(templates.map((template) => [text(template?.id), template]));
const canonical = safeEndpoint(canonicalRaw, templateById, canonicalControl);
const comparator = safeEndpoint(comparatorRaw, templateById, comparatorControl);
const allGpuIds = unique([...canonical.gpu_type_ids, ...comparator.gpu_type_ids, MIG_GPU]);
const capacity = capacityRows(dataCenters, allGpuIds);
const migCapacity = capacity.filter((row) => row.gpu_type_id === MIG_GPU);
const comparatorUsesMigNow = comparator.control_workers.some((worker) => worker.gpu_type_id === MIG_GPU);
const comparatorImageMatchesCertified = comparator.template?.image_name === certifiedImage;
const canonicalImageMatchesCertified = canonical.template?.image_name === certifiedImage;
const canonicalAllowsMig = canonical.gpu_type_ids.includes(MIG_GPU);

let diagnosis = "NO_PLACEMENT_DIFFERENCE_PROVEN";
let nextAction = "KEEP_EXISTING_JOB_LOCKED_AND_ESCALATE_ENDPOINT_SPECIFIC_RUNPOD_SCHEDULER_FAILURE";
if (comparatorUsesMigNow && !canonicalAllowsMig) {
  diagnosis = comparatorImageMatchesCertified
    ? "CERTIFIED_IMAGE_ALREADY_PROVISIONING_ON_MIG_BUT_CANONICAL_POOL_EXCLUDES_MIG"
    : "OTHER_TTS_ENDPOINT_PROVISIONING_ON_MIG_BUT_CANONICAL_POOL_EXCLUDES_MIG";
  nextAction = comparatorImageMatchesCertified
    ? "ADD_PROVEN_MIG_GPU_TO_CANONICAL_ENDPOINT_FOR_EXISTING_JOB_ONLY"
    : "VERIFY_CERTIFIED_IMAGE_MEMORY_FIT_THEN_ADD_MIG_GPU_FOR_EXISTING_JOB_ONLY";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  generation_submitted: false,
  accepted_generation_count: 1,
  new_generation_allowed: false,
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  queue_purged: false,
  job_cancelled: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  certified_image_reference: certifiedImage,
  canonical_image_matches_certified: canonicalImageMatchesCertified,
  comparator_image_matches_certified: comparatorImageMatchesCertified,
  canonical_endpoint: canonical,
  comparator_endpoint: comparator,
  placement_difference: {
    canonical_allows_mig: canonicalAllowsMig,
    comparator_uses_mig_now: comparatorUsesMigNow,
    mig_gpu_type_id: MIG_GPU,
    mig_capacity: migCapacity,
  },
  relevant_capacity: capacity,
  diagnosis,
  safe_to_submit_duplicate_job: false,
  next_action: nextAction,
}, null, 2));
