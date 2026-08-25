import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const QUEUE = "https://api.runpod.ai/v2";
const CONTROL = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_INTELLIGENCE_RUNPOD_COMPARISON_V1";
const LOCK_PATH = "audits/results/avantiqo-voice-tts-controlled-generation.json";
const LOCK_CONTRACT = "AVANTIQO_VOICE_TTS_CONTROLLED_GENERATION_V1";
const TTS_NAME = "avantiqo-voice-tts-v1";
const INTELLIGENCE_NAME = "avantiqo-intelligence-v1";
const CERTIFIED_TTS_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:c9ce291cc27bb7de119cf1120a92dd6466962b6d79fd5728a1266a743bad1a06";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function unique(values) { return [...new Set(values.map(text).filter(Boolean))]; }
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

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    const error = new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body || {};
}

async function rest(path, key) {
  return readJson(await fetch(`${REST}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_INTELLIGENCE_COMPARE_REST");
}

async function queueRead(endpointId, managementKey, path) {
  const credentials = unique([text(process.env.RUNPOD_API_KEY), managementKey]);
  let lastError = null;
  for (const credential of credentials) {
    try {
      return await readJson(await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}${path}`, {
        headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      }), "RUNPOD_VOICE_TTS_INTELLIGENCE_COMPARE_QUEUE");
    } catch (error) {
      lastError = error;
      if (![401, 403].includes(Number(error?.httpStatus))) throw error;
    }
  }
  throw lastError || new Error("RUNPOD_VOICE_TTS_INTELLIGENCE_COMPARE_QUEUE_CREDENTIAL_REQUIRED");
}

async function controlWorkers(endpointId, key) {
  return readJson(await fetch(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_VOICE_TTS_INTELLIGENCE_COMPARE_CONTROL");
}

function resolveEndpoint(endpoints, id, name) {
  const byId = endpoints.filter((endpoint) => text(endpoint?.id) === id);
  if (id && byId.length === 1) return byId[0];
  const byName = endpoints.filter((endpoint) => text(endpoint?.name) === name);
  if (byName.length !== 1) throw new Error(`RUNPOD_VOICE_TTS_INTELLIGENCE_COMPARE_ENDPOINT_RESOLUTION_FAILED:${name}:matches=${byName.length}`);
  return byName[0];
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (!templateId || matches.length !== 1) {
    throw new Error(`RUNPOD_VOICE_TTS_INTELLIGENCE_COMPARE_TEMPLATE_RESOLUTION_FAILED:${templateId || "missing"}:${matches.length}`);
  }
  return matches[0];
}

function safeTemplate(template = {}) {
  const env = template?.env && typeof template.env === "object" && !Array.isArray(template.env) ? template.env : {};
  return {
    id: text(template?.id) || null,
    name: text(template?.name) || null,
    image_name: text(template?.imageName || template?.image) || null,
    container_disk_gb: finite(template?.containerDiskInGb),
    volume_gb: finite(template?.volumeInGb),
    volume_mount_path: text(template?.volumeMountPath) || null,
    registry_auth_present: Boolean(text(template?.containerRegistryAuthId)),
    docker_entrypoint: list(template?.dockerEntrypoint),
    docker_start_cmd: list(template?.dockerStartCmd),
    env_keys: Object.keys(env).sort(),
    is_serverless: template?.isServerless ?? null,
  };
}

function safeWorkers(body = {}) {
  return list(body?.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    status: text(worker?.status).toUpperCase() || null,
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}

function safeEndpoint(endpoint = {}, template = {}, workers = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    version: finite(endpoint?.version),
    template_id: text(endpoint?.templateId || endpoint?.template?.id) || null,
    template: safeTemplate(template),
    gpu_count: finite(endpoint?.gpuCount),
    gpu_type_ids: list(endpoint?.gpuTypeIds).map(text).filter(Boolean),
    min_cuda_version: text(endpoint?.minCudaVersion) || null,
    allowed_cuda_versions: list(endpoint?.allowedCudaVersions),
    data_center_ids: list(endpoint?.dataCenterIds).map(text).filter(Boolean),
    network_volume_ids: unique([endpoint?.networkVolumeId, ...list(endpoint?.networkVolumeIds)]),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    scaler_type: text(endpoint?.scalerType) || null,
    scaler_value: finite(endpoint?.scalerValue),
    idle_timeout_seconds: finite(endpoint?.idleTimeout),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout),
    flashboot: endpoint?.flashboot ?? endpoint?.flashBoot ?? null,
    compute_type: text(endpoint?.computeType) || null,
    control_workers: safeWorkers(workers),
  };
}

function diff(left, right, field) {
  const a = left[field];
  const b = right[field];
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  return { field, voice_tts: a, intelligence: b };
}

const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
if (lock?.contract !== LOCK_CONTRACT) throw new Error("RUNPOD_VOICE_TTS_INTELLIGENCE_COMPARE_LOCK_CONTRACT_MISMATCH");
if (lock?.generation_submitted !== true || Number(lock?.accepted_generation_count) !== 1 || lock?.new_generation_allowed !== false || lock?.stt_submitted !== false) {
  throw new Error("RUNPOD_VOICE_TTS_INTELLIGENCE_COMPARE_GENERATION_LOCK_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const [endpointsRaw, templatesRaw] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
]);
const endpoints = normalizeListResponse(endpointsRaw, ["endpoints"]) || [];
const templates = normalizeListResponse(templatesRaw, ["templates"]) || [];

const ttsRaw = resolveEndpoint(endpoints, text(lock?.endpoint_id), TTS_NAME);
const intelligenceRaw = resolveEndpoint(endpoints, "", INTELLIGENCE_NAME);
const ttsTemplate = resolveTemplate(ttsRaw, templates);
const intelligenceTemplate = resolveTemplate(intelligenceRaw, templates);
const [ttsWorkersRaw, intelligenceWorkersRaw, ttsStatusRaw, ttsHealthRaw] = await Promise.all([
  controlWorkers(text(ttsRaw?.id), managementKey),
  controlWorkers(text(intelligenceRaw?.id), managementKey),
  queueRead(text(ttsRaw?.id), managementKey, `/status/${encodeURIComponent(text(lock?.job_id))}`),
  queueRead(text(ttsRaw?.id), managementKey, "/health"),
]);

const tts = safeEndpoint(ttsRaw, ttsTemplate, ttsWorkersRaw);
const intelligence = safeEndpoint(intelligenceRaw, intelligenceTemplate, intelligenceWorkersRaw);
const comparisonFields = [
  "gpu_count",
  "gpu_type_ids",
  "min_cuda_version",
  "allowed_cuda_versions",
  "data_center_ids",
  "network_volume_ids",
  "workers_min",
  "workers_max",
  "scaler_type",
  "scaler_value",
  "idle_timeout_seconds",
  "execution_timeout_ms",
  "flashboot",
  "compute_type",
];
const endpointDiffs = comparisonFields.map((field) => diff(tts, intelligence, field)).filter(Boolean);
const templateDiffs = [
  "container_disk_gb",
  "volume_gb",
  "volume_mount_path",
  "registry_auth_present",
  "docker_entrypoint",
  "docker_start_cmd",
  "is_serverless",
].map((field) => diff(tts.template, intelligence.template, field)).filter(Boolean);

const ttsJobStatus = text(ttsStatusRaw?.status).toUpperCase() || "UNKNOWN";
const ttsHealthWorkers = ttsHealthRaw?.workers && typeof ttsHealthRaw.workers === "object" ? ttsHealthRaw.workers : {};
const ttsHasWorker = tts.control_workers.some((worker) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(worker.status)) || Object.values(ttsHealthWorkers).some((value) => Number(value) > 0);
const intelligenceHasWorker = intelligence.control_workers.some((worker) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(worker.status));

let diagnosis = "NO_SINGLE_CONFIG_DIFFERENCE_PROVES_TTS_FAILURE";
let nextAction = "OPEN_RUNPOD_SUPPORT_WITH_STRUCTURAL_COMPARISON_NO_NEW_JOB";
if (tts.template.image_name !== CERTIFIED_TTS_IMAGE) {
  diagnosis = "TTS_BOUND_TEMPLATE_IMAGE_DOES_NOT_MATCH_CERTIFIED_IMAGE";
  nextAction = "STOP_AND_REPAIR_TTS_TEMPLATE_BINDING_WITHOUT_NEW_JOB";
} else if (ttsJobStatus !== "IN_QUEUE") {
  diagnosis = "EXISTING_ACCEPTED_TTS_JOB_LEFT_QUEUE";
  nextAction = "RESUME_EXISTING_ACCEPTED_JOB_ONLY";
} else if (ttsHasWorker) {
  diagnosis = "TTS_WORKER_NOW_EXISTS";
  nextAction = "RESUME_EXISTING_ACCEPTED_JOB_ONLY";
} else if (intelligenceHasWorker) {
  diagnosis = "HEALTHY_BLACKWELL_ENDPOINT_PROVISIONS_WHILE_TTS_ENDPOINT_CREATES_NO_WORKER";
  nextAction = "OPEN_RUNPOD_SUPPORT_ENDPOINT_SPECIFIC_CONTROL_PLANE_FAILURE_NO_NEW_JOB";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  accepted_generation_count: 1,
  generation_submitted: false,
  new_generation_allowed: false,
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  queue_purged: false,
  job_cancelled: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  exact_tts_job: {
    job_id: text(lock?.job_id),
    status: ttsJobStatus,
    health_workers: ttsHealthWorkers,
  },
  voice_tts_endpoint: tts,
  intelligence_endpoint: intelligence,
  endpoint_differences: endpointDiffs,
  template_differences: templateDiffs,
  tts_certified_image_binding: tts.template.image_name === CERTIFIED_TTS_IMAGE,
  intelligence_worker_present: intelligenceHasWorker,
  tts_worker_present: ttsHasWorker,
  diagnosis,
  safe_to_submit_duplicate_job: false,
  next_action: nextAction,
}, null, 2));
