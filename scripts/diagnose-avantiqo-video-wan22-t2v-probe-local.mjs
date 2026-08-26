import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_T2V_PROBE_DIAGNOSTIC_V1";
const VIDEO_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const IMAGE_LOCK_PATH = "audits/results/avantiqo-image-v9-certification-lock.json";
const IMAGE_NAME = "avantiqo-image-v1";
const CINEMA_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const VOLUME_ID = "7pcdebhpga";
const VOLUME_NAME = "avantiqo-shared-image-video-cache";
const VOLUME_DC = "US-NC-2";
const MIN_VOLUME_GB = 400;
const EXPECTED_TEMPLATE = "avantiqo-video-cache-v3-f91e402fca17";
const EXPECTED_IMAGE = "ghcr.io/churchillkaron/avantiqo-video-worker@sha256:f91e402fca17ed2caf941e115b61b6ac8f7680c2f920b2c5a4aa0a034ecb5c2e";
const T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";
const CACHE_ROOT = "/runpod-volume/huggingface-cache/hub";
const CACHE_GPU_PATTERN = /(RTX\s*(?:PRO\s*)?6000|RTX\s*4090|RTX\s*3090|A5000|A6000|6000\s*Ada|\bA10\b|\bA40\b|\bL4\b|\bL40S?\b|\bA100\b|\bH100\b|\bH200\b|\bB200\b)/i;

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${redact(text(result.stderr || result.stdout)).slice(0, 1000)}`);
  }
  return text(result.stdout);
}

function requireCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_PROBE_DIAG_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_PROBE_DIAG_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_PROBE_DIAG_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_PROBE_DIAG_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_PROBE_DIAG_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_VIDEO_PROBE_DIAG_MAIN_NOT_CURRENT:head=${head}:origin=${remote}`);
  return head;
}

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(value.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => key));
  }
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]));
}

function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)),
    data_center_ids: unique(list(endpoint.dataCenterIds)),
    network_volume_ids: endpointVolumeIds(endpoint),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
  };
}

function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
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

function workerCount(health) {
  return Object.values(health.workers).reduce((sum, value) => sum + Number(value || 0), 0);
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${redact(text(body?.message || body?.error || body?.detail || raw)).slice(0, 1000)}`);
  }
  return body ?? {};
}

async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_PROBE_DIAG_REST");
}

async function queue(endpointId, pathname, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_PROBE_DIAG_QUEUE");
}

async function queueCredentialWorks(endpointId, key) {
  if (!key) return false;
  try {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    await response.arrayBuffer();
    return response.ok;
  } catch {
    return false;
  }
}

async function selectQueueCredential(endpointId, managementKey) {
  const candidates = [
    ["RUNPOD_AVANTIQO_VIDEO_API_KEY", text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)],
    ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
    ["RUNPOD_MANAGEMENT_API_KEY", managementKey],
  ];
  const seen = new Set();
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (await queueCredentialWorks(endpointId, key)) return { source, key };
  }
  throw new Error("AVANTIQO_VIDEO_PROBE_DIAG_QUEUE_CREDENTIAL_NOT_FOUND");
}

async function inventory(key) {
  const [endpointsRaw, volumesRaw, templatesRaw] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", key),
    rest("/networkvolumes", key),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key),
  ]);
  const endpoints = normalizeList(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const volumes = normalizeList(volumesRaw, ["networkVolumes", "volumes"]);
  const templates = normalizeList(templatesRaw, ["templates"]);
  if (!endpoints || !volumes || !templates) throw new Error("AVANTIQO_VIDEO_PROBE_DIAG_INVENTORY_INVALID");
  return { endpoints, volumes, templates };
}

function resolveEndpoint(endpoints, configuredId, names, label) {
  const matches = configuredId
    ? endpoints.filter((entry) => text(entry.id) === configuredId && names.has(text(entry.name)))
    : endpoints.filter((entry) => names.has(text(entry.name)));
  if (matches.length !== 1) throw new Error(`${label}_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function resolveTemplate(templates, id, label) {
  const matches = templates.filter((entry) => text(entry.id) === id);
  if (matches.length !== 1) throw new Error(`${label}_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function resolveVolume(volumes) {
  const matches = volumes.filter((entry) => text(entry.id) === VOLUME_ID || text(entry.name) === VOLUME_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_PROBE_DIAG_VOLUME_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

async function discoverGpuAvailability(managementKey) {
  const queryText = `
    query AvantiqoVideoProbeDiagnosticGpuPool($input: GpuAvailabilityInput) {
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
      query: queryText,
      variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 16, secureCloud: true } },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    return { available: false, reason: redact(text(body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw)).slice(0, 700), candidates: [] };
  }
  const dataCenter = body.data.dataCenters.find((entry) => text(entry?.id) === VOLUME_DC);
  if (!dataCenter) return { available: false, reason: `DATACENTER_NOT_FOUND:${VOLUME_DC}`, candidates: [] };
  const candidates = list(dataCenter.gpuAvailability)
    .map((gpu) => ({
      id: text(gpu?.gpuTypeId),
      name: text(gpu?.gpuTypeDisplayName || gpu?.displayName || gpu?.gpuTypeId),
      stock: text(gpu?.stockStatus) || "UNKNOWN",
    }))
    .filter((gpu) => gpu.id && CACHE_GPU_PATTERN.test(`${gpu.id} ${gpu.name}`));
  return { available: true, reason: null, candidates };
}

function jobIdFromArgs() {
  const arg = process.argv.find((entry) => entry.startsWith("--job-id="));
  return text(arg ? arg.slice("--job-id=".length) : process.env.AVANTIQO_VIDEO_WAN22_PROBE_JOB_ID);
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_PROBE_DIAG_NODE24_REQUIRED:${process.version}`);
}

const jobId = jobIdFromArgs();
if (!jobId) throw new Error("AVANTIQO_VIDEO_PROBE_DIAG_JOB_ID_REQUIRED_USE_--job-id=<id>");
const mainSha = requireCurrentMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error("AVANTIQO_VIDEO_PROBE_DIAG_MANAGEMENT_CREDENTIAL_REQUIRED");

const videoEvidence = JSON.parse(await readFile(VIDEO_EVIDENCE_PATH, "utf8"));
const imageLock = JSON.parse(await readFile(IMAGE_LOCK_PATH, "utf8"));
const inv = await inventory(managementKey);
const volume = resolveVolume(inv.volumes);
const image = resolveEndpoint(inv.endpoints, text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_PROBE_DIAG_IMAGE");
const cinema = resolveEndpoint(inv.endpoints, text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID), CINEMA_NAMES, "AVANTIQO_VIDEO_PROBE_DIAG_CINEMA");
const imageTemplate = resolveTemplate(inv.templates, text(image.templateId || image.template?.id), "AVANTIQO_VIDEO_PROBE_DIAG_IMAGE_TEMPLATE");
const cinemaTemplate = resolveTemplate(inv.templates, text(cinema.templateId || cinema.template?.id), "AVANTIQO_VIDEO_PROBE_DIAG_CINEMA_TEMPLATE");
const queueCredential = await selectQueueCredential(text(cinema.id), managementKey);
const [job, healthRaw, gpuAvailability] = await Promise.all([
  queue(text(cinema.id), `/status/${encodeURIComponent(jobId)}`, queueCredential.key),
  queue(text(cinema.id), "/health", queueCredential.key),
  discoverGpuAvailability(managementKey),
]);
const health = healthSummary(healthRaw);
const env = normalizeEnv(cinemaTemplate.env);
const volumeSize = finite(volume.size ?? volume.sizeGb, 0);
const currentGpuTypes = unique(list(cinema.gpuTypeIds));
const currentGpuStock = gpuAvailability.candidates.filter((gpu) => currentGpuTypes.includes(gpu.id) || currentGpuTypes.includes(gpu.name));
const otherCompatibleStock = gpuAvailability.candidates.filter((gpu) => !currentGpuTypes.includes(gpu.id) && !currentGpuTypes.includes(gpu.name));

const guards = {
  video_evidence_exact_v3: videoEvidence?.success === true && text(videoEvidence.immutable_image_reference) === EXPECTED_IMAGE,
  image_v9_lock_preserved: imageLock?.production_certified === true && text(imageLock?.status) === "PRODUCTION_CERTIFIED_NOT_DEPLOYED",
  image_endpoint_preserved: text(image.name) === IMAGE_NAME && finite(image.workersMin) === 0 && finite(image.workersMax) === 1 && endpointVolumeIds(image).includes(VOLUME_ID),
  image_template_preserved: text(imageTemplate.imageName) === text(imageLock?.build_evidence?.immutable_image_reference),
  cinema_cache_template_bound: text(cinemaTemplate.name) === EXPECTED_TEMPLATE && text(cinemaTemplate.imageName) === EXPECTED_IMAGE,
  cinema_cache_only: text(env.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES) === "__cache_only__" && text(env.AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED) === "0",
  cinema_models_exact: text(env.AVANTIQO_VIDEO_T2V_MODEL) === T2V_MODEL && text(env.AVANTIQO_VIDEO_I2V_MODEL) === I2V_MODEL,
  cinema_cache_root_exact: text(env.AVANTIQO_VIDEO_HF_CACHE_ROOT) === CACHE_ROOT,
  shared_volume_exact: text(volume.id) === VOLUME_ID && text(volume.name) === VOLUME_NAME && text(volume.dataCenterId) === VOLUME_DC && volumeSize >= MIN_VOLUME_GB && endpointVolumeIds(cinema).includes(VOLUME_ID),
};

const jobStatus = text(job.status).toUpperCase();
const activeWorkers = workerCount(health);
let diagnosis = "UNKNOWN";
if (["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(jobStatus)) diagnosis = `JOB_${jobStatus}`;
else if (jobStatus === "IN_PROGRESS" || health.jobs.in_progress > 0 || activeWorkers > 0) diagnosis = "PROGRESSING";
else if (jobStatus === "IN_QUEUE" && health.jobs.in_queue > 0 && health.jobs.in_progress === 0 && activeWorkers === 0) diagnosis = "CAPACITY_BLOCKED_NO_WORKER_ASSIGNED";

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  main_sha: mainSha,
  scope: "VIDEO_ONLY",
  existing_job: {
    id: jobId,
    status: jobStatus || null,
    error_present: Boolean(text(job.error || job.output?.error)),
  },
  diagnosis,
  cinema: safeEndpoint(cinema),
  queue_health: health,
  shared_volume: {
    id: text(volume.id),
    name: text(volume.name),
    data_center_id: text(volume.dataCenterId),
    size_gb: volumeSize,
  },
  current_gpu_pool: currentGpuTypes,
  gpu_availability: {
    query_available: gpuAvailability.available,
    query_reason: gpuAvailability.reason,
    current_pool_candidates: currentGpuStock,
    other_compatible_candidates: otherCompatibleStock,
  },
  guards,
  all_guards_pass: Object.values(guards).every(Boolean),
  queue_credential_source: queueCredential.source,
  safety: {
    endpoint_mutation_performed: false,
    template_mutation_performed: false,
    volume_mutation_performed: false,
    worker_scaling_mutation_performed: false,
    new_job_submitted: false,
    job_cancelled: false,
    model_download_submitted: false,
    video_generation_submitted: false,
    inference_performed: false,
    image_mutation_performed: false,
    production_web_deploy: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
}, null, 2));
console.log("AVANTIQO_VIDEO_WAN22_T2V_PROBE_DIAGNOSTIC=PASS");
