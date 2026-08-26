import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_STALLED_ACTIVE_PROBE_REPAIR_V2";
const VIDEO_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const IMAGE_LOCK_PATH = "audits/results/avantiqo-image-v9-certification-lock.json";
const IMAGE_NAME = "avantiqo-image-v1";
const CINEMA_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const VOLUME_ID = "7pcdebhpga";
const VOLUME_NAME = "avantiqo-shared-image-video-cache";
const VOLUME_DC = "US-NC-2";
const EXPECTED_TEMPLATE = "avantiqo-video-cache-v3-f91e402fca17";
const EXPECTED_IMAGE = "ghcr.io/churchillkaron/avantiqo-video-worker@sha256:f91e402fca17ed2caf941e115b61b6ac8f7680c2f920b2c5a4aa0a034ecb5c2e";
const T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";
const CACHE_ROOT = "/runpod-volume/huggingface-cache/hub";
const TEMP_TIMEOUT_MS = 7_200_000;
const BASELINE_TIMEOUT_MS = 1_800_000;
const ORIGINAL_BLACKWELL_POOL = [
  "NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
];
const EXPECTED_TEMP_POOL = ["NVIDIA B200", ...ORIGINAL_BLACKWELL_POOL].sort();

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
  if (result.status !== 0) throw new Error(`${code}:${redact(text(result.stderr || result.stdout)).slice(0, 1000)}`);
  return text(result.stdout);
}

function requireCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_STALLED_PROBE_V2_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_STALLED_PROBE_V2_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_VIDEO_STALLED_PROBE_V2_MAIN_NOT_CURRENT:head=${head}:origin=${remote}`);
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

function sameSet(left, right) {
  const a = unique(left);
  const b = unique(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
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

function healthWorkerCount(health) {
  return Object.values(health.workers).reduce((sum, value) => sum + Number(value || 0), 0);
}

function activeManagementWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const effective = desired || status;
    return effective && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(effective);
  });
}

function activeControlWorkers(body = {}) {
  return list(body.workers).filter((worker) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(text(worker?.status).toUpperCase()));
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${redact(text(body?.message || body?.error || body?.detail || raw)).slice(0, 1000)}`);
  return body ?? {};
}

async function rest(pathname, key, options = {}) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_STALLED_PROBE_V2_REST");
}

async function queueRequest(endpointId, pathname, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_STALLED_PROBE_V2_QUEUE");
}

async function optionalControlWorkers(endpointId, candidates) {
  const seen = new Set();
  for (const [source, key] of candidates) {
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      const response = await fetch(`${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`, {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(20_000),
      });
      const raw = await response.text();
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      if (response.ok) return { available: true, source, body: body ?? {} };
    } catch {}
  }
  return { available: false, source: null, body: {} };
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
    try {
      const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
        headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      await response.arrayBuffer();
      if (response.ok) return { source, key };
    } catch {}
  }
  throw new Error("AVANTIQO_VIDEO_STALLED_PROBE_V2_QUEUE_CREDENTIAL_NOT_FOUND");
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
  if (!endpoints || !volumes || !templates) throw new Error("AVANTIQO_VIDEO_STALLED_PROBE_V2_INVENTORY_INVALID");
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
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_STALLED_PROBE_V2_VOLUME_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function validateInvariantState(inv, imageImmutable, label) {
  const volume = resolveVolume(inv.volumes);
  const image = resolveEndpoint(inv.endpoints, text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID), new Set([IMAGE_NAME]), `${label}_IMAGE`);
  const cinema = resolveEndpoint(inv.endpoints, text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID), CINEMA_NAMES, `${label}_CINEMA`);
  const imageTemplate = resolveTemplate(inv.templates, text(image.templateId || image.template?.id), `${label}_IMAGE_TEMPLATE`);
  const cinemaTemplate = resolveTemplate(inv.templates, text(cinema.templateId || cinema.template?.id), `${label}_CINEMA_TEMPLATE`);
  const env = normalizeEnv(cinemaTemplate.env);
  const failures = [];
  if (text(volume.id) !== VOLUME_ID || text(volume.name) !== VOLUME_NAME || text(volume.dataCenterId) !== VOLUME_DC || finite(volume.size ?? volume.sizeGb, 0) < 400) failures.push("volume");
  if (text(image.name) !== IMAGE_NAME || finite(image.workersMin) !== 0 || finite(image.workersMax) !== 1 || !endpointVolumeIds(image).includes(VOLUME_ID) || text(imageTemplate.imageName) !== imageImmutable) failures.push("imageV9");
  if (!CINEMA_NAMES.has(text(cinema.name)) || finite(cinema.workersMin) !== 0 || !endpointVolumeIds(cinema).includes(VOLUME_ID)) failures.push("cinemaBase");
  if (text(cinemaTemplate.name) !== EXPECTED_TEMPLATE || text(cinemaTemplate.imageName) !== EXPECTED_IMAGE) failures.push("template");
  if (text(env.AVANTIQO_VIDEO_T2V_MODEL) !== T2V_MODEL || text(env.AVANTIQO_VIDEO_I2V_MODEL) !== I2V_MODEL) failures.push("models");
  if (text(env.AVANTIQO_VIDEO_HF_CACHE_ROOT) !== CACHE_ROOT || text(env.AVANTIQO_VIDEO_NETWORK_VOLUME_QUOTA_GB) !== "400") failures.push("cache");
  if (text(env.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES) !== "__cache_only__" || text(env.AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED) !== "0") failures.push("cacheOnly");
  if (failures.length) throw new Error(`${label}_INVARIANT_STATE_INVALID:${failures.join(",")}`);
  return { volume, image, cinema, imageTemplate, cinemaTemplate };
}

function classifyCinema(endpoint) {
  const gpu = unique(list(endpoint.gpuTypeIds));
  const workersMax = finite(endpoint.workersMax);
  const timeout = finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout);
  if (workersMax === 0 && timeout === BASELINE_TIMEOUT_MS && sameSet(gpu, ORIGINAL_BLACKWELL_POOL)) return "BASELINE";
  if (workersMax === 1 && timeout === TEMP_TIMEOUT_MS && sameSet(gpu, EXPECTED_TEMP_POOL)) return "TEMPORARY_CACHE_STATE";
  return "UNKNOWN";
}

function jobIdFromArgs() {
  const arg = process.argv.find((entry) => entry.startsWith("--job-id="));
  return text(arg ? arg.slice("--job-id=".length) : process.env.AVANTIQO_VIDEO_WAN22_STALLED_PROBE_JOB_ID);
}

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_STALLED_PROBE_V2_NODE24_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
if (apply && !approved(process.env.AVANTIQO_VIDEO_WAN22_STALLED_PROBE_RECOVERY_APPROVED)) {
  throw new Error("AVANTIQO_VIDEO_WAN22_STALLED_PROBE_RECOVERY_APPROVED=YES_REQUIRED");
}
const jobId = jobIdFromArgs();
if (!jobId) throw new Error("AVANTIQO_VIDEO_STALLED_PROBE_V2_JOB_ID_REQUIRED_USE_--job-id=<id>");
const mainSha = requireCurrentMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error("AVANTIQO_VIDEO_STALLED_PROBE_V2_MANAGEMENT_CREDENTIAL_REQUIRED");
const [videoEvidence, imageLock] = await Promise.all([
  readFile(VIDEO_EVIDENCE_PATH, "utf8").then(JSON.parse),
  readFile(IMAGE_LOCK_PATH, "utf8").then(JSON.parse),
]);
if (videoEvidence?.success !== true || text(videoEvidence.immutable_image_reference) !== EXPECTED_IMAGE) throw new Error("AVANTIQO_VIDEO_STALLED_PROBE_V2_VIDEO_EVIDENCE_INVALID");
const imageImmutable = text(imageLock?.build_evidence?.immutable_image_reference);
if (imageLock?.production_certified !== true || text(imageLock?.status) !== "PRODUCTION_CERTIFIED_NOT_DEPLOYED" || !imageImmutable) throw new Error("AVANTIQO_VIDEO_STALLED_PROBE_V2_IMAGE_LOCK_INVALID");

const initial = await inventory(managementKey);
const owned = validateInvariantState(initial, imageImmutable, "AVANTIQO_VIDEO_STALLED_PROBE_V2_INITIAL");
const cinemaState = classifyCinema(owned.cinema);
if (cinemaState === "UNKNOWN") throw new Error(`AVANTIQO_VIDEO_STALLED_PROBE_V2_CINEMA_STATE_UNKNOWN:${JSON.stringify(safeEndpoint(owned.cinema))}`);
const queueCredential = await selectQueueCredential(text(owned.cinema.id), managementKey);
const controlCandidates = [
  ["RUNPOD_API_KEY", text(process.env.RUNPOD_API_KEY)],
  ["RUNPOD_MANAGEMENT_API_KEY", managementKey],
  ["RUNPOD_AVANTIQO_VIDEO_API_KEY", text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)],
];
const [job, healthRaw, control] = await Promise.all([
  queueRequest(text(owned.cinema.id), `/status/${encodeURIComponent(jobId)}`, queueCredential.key),
  queueRequest(text(owned.cinema.id), "/health", queueCredential.key),
  optionalControlWorkers(text(owned.cinema.id), controlCandidates),
]);
const health = healthSummary(healthRaw);
const jobStatus = text(job.status).toUpperCase();
const terminal = ["CANCELLED", "CANCELED", "FAILED", "TIMED_OUT", "COMPLETED"].includes(jobStatus);
const managementWorkers = activeManagementWorkers(owned.cinema).length;
const controlWorkers = activeControlWorkers(control.body).length;

if (!terminal) throw new Error(`AVANTIQO_VIDEO_STALLED_PROBE_V2_JOB_NOT_TERMINAL:${jobStatus || "EMPTY"}`);
if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || healthWorkerCount(health) !== 0 || managementWorkers !== 0 || controlWorkers !== 0) {
  throw new Error(`AVANTIQO_VIDEO_STALLED_PROBE_V2_NOT_SAFE_TO_RESTORE:health=${JSON.stringify(health)}:management=${managementWorkers}:control=${controlWorkers}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  scope: "VIDEO_ONLY",
  main_sha: mainSha,
  cancelled_probe: { id: jobId, status: jobStatus },
  cinema_state: cinemaState,
  cinema: safeEndpoint(owned.cinema),
  queue_health: health,
  management_workers: managementWorkers,
  control_workers: controlWorkers,
  image_v9_preserved: true,
  shared_volume_preserved: true,
  recovery: {
    endpoint_patch_required: cinemaState === "TEMPORARY_CACHE_STATE",
    patch_fields: cinemaState === "TEMPORARY_CACHE_STATE" ? ["workersMax", "executionTimeoutMs", "gpuTypeIds"] : [],
    workers_max_target: 0,
    execution_timeout_ms_target: BASELINE_TIMEOUT_MS,
    gpu_pool_target: ORIGINAL_BLACKWELL_POOL,
  },
  safety: {
    new_job_submitted: false,
    job_cancelled_by_v2: false,
    template_mutation_planned: false,
    volume_mutation_planned: false,
    image_mutation_planned: false,
    video_generation_submitted: false,
    inference_performed: false,
    production_web_deploy: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_WAN22_STALLED_ACTIVE_PROBE_REPAIR_V2_APPLIED=false");
  process.exit(0);
}

if (cinemaState === "TEMPORARY_CACHE_STATE") {
  const freshMain = requireCurrentMain();
  if (freshMain !== mainSha) throw new Error(`AVANTIQO_VIDEO_STALLED_PROBE_V2_MAIN_MOVED_BEFORE_WRITE:before=${mainSha}:after=${freshMain}`);
  const fresh = await inventory(managementKey);
  const freshOwned = validateInvariantState(fresh, imageImmutable, "AVANTIQO_VIDEO_STALLED_PROBE_V2_FRESH");
  if (classifyCinema(freshOwned.cinema) !== "TEMPORARY_CACHE_STATE") throw new Error("AVANTIQO_VIDEO_STALLED_PROBE_V2_CINEMA_CHANGED_BEFORE_WRITE");
  const [freshJob, freshHealthRaw, freshControl] = await Promise.all([
    queueRequest(text(freshOwned.cinema.id), `/status/${encodeURIComponent(jobId)}`, queueCredential.key),
    queueRequest(text(freshOwned.cinema.id), "/health", queueCredential.key),
    optionalControlWorkers(text(freshOwned.cinema.id), controlCandidates),
  ]);
  const freshHealth = healthSummary(freshHealthRaw);
  const freshStatus = text(freshJob.status).toUpperCase();
  const freshTerminal = ["CANCELLED", "CANCELED", "FAILED", "TIMED_OUT", "COMPLETED"].includes(freshStatus);
  if (!freshTerminal || freshHealth.jobs.in_queue !== 0 || freshHealth.jobs.in_progress !== 0 || healthWorkerCount(freshHealth) !== 0 || activeManagementWorkers(freshOwned.cinema).length !== 0 || activeControlWorkers(freshControl.body).length !== 0) {
    throw new Error("AVANTIQO_VIDEO_STALLED_PROBE_V2_STATE_CHANGED_BEFORE_WRITE");
  }

  await rest(`/endpoints/${encodeURIComponent(text(freshOwned.cinema.id))}`, managementKey, {
    method: "PATCH",
    body: {
      workersMax: 0,
      executionTimeoutMs: BASELINE_TIMEOUT_MS,
      gpuTypeIds: ORIGINAL_BLACKWELL_POOL,
    },
  });
  console.log("AVANTIQO_VIDEO_STALLED_PROBE_V2_BASELINE_PATCH_PERFORMED=true");
}

let finalOwned = null;
let finalHealth = null;
let finalControl = null;
for (let attempt = 0; attempt < 20; attempt += 1) {
  const finalInv = await inventory(managementKey);
  const candidate = validateInvariantState(finalInv, imageImmutable, "AVANTIQO_VIDEO_STALLED_PROBE_V2_FINAL");
  const healthNow = healthSummary(await queueRequest(text(candidate.cinema.id), "/health", queueCredential.key));
  const controlNow = await optionalControlWorkers(text(candidate.cinema.id), controlCandidates);
  if (
    classifyCinema(candidate.cinema) === "BASELINE" &&
    healthNow.jobs.in_queue === 0 &&
    healthNow.jobs.in_progress === 0 &&
    healthWorkerCount(healthNow) === 0 &&
    activeManagementWorkers(candidate.cinema).length === 0 &&
    activeControlWorkers(controlNow.body).length === 0
  ) {
    finalOwned = candidate;
    finalHealth = healthNow;
    finalControl = controlNow;
    break;
  }
  await sleep(1500);
}
if (!finalOwned) throw new Error("AVANTIQO_VIDEO_STALLED_PROBE_V2_BASELINE_VERIFY_FAILED");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  scope: "VIDEO_ONLY",
  cancelled_probe: { id: jobId, status: jobStatus },
  baseline_restored: true,
  cinema: safeEndpoint(finalOwned.cinema),
  queue_health: finalHealth,
  management_workers: activeManagementWorkers(finalOwned.cinema).length,
  control_workers: activeControlWorkers(finalControl.body).length,
  image_v9_preserved: true,
  shared_volume_preserved: true,
  endpoint_mutation_performed: cinemaState === "TEMPORARY_CACHE_STATE",
  endpoint_mutation_fields: cinemaState === "TEMPORARY_CACHE_STATE" ? ["workersMax", "executionTimeoutMs", "gpuTypeIds"] : [],
  template_mutation_performed: false,
  volume_mutation_performed: false,
  image_mutation_performed: false,
  new_job_submitted: false,
  model_download_submitted: false,
  video_generation_submitted: false,
  inference_performed: false,
  production_web_deploy: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  next_action: "RUN_SINGLE_GPU_T2V_A14B_CACHE_RETRY",
}, null, 2));
console.log("AVANTIQO_VIDEO_WAN22_STALLED_ACTIVE_PROBE_REPAIR_V2_APPLIED=true");
