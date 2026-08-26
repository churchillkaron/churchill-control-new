import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_ORPHAN_PROBE_REPAIR_V1";
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
const WAIT_MS = Math.max(30_000, Number(process.env.AVANTIQO_VIDEO_WAN22_ORPHAN_CANCEL_WAIT_MS || 120_000));
const POLL_MS = Math.max(2_000, Number(process.env.AVANTIQO_VIDEO_WAN22_ORPHAN_CANCEL_POLL_MS || 5_000));

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
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
  if (result.status !== 0) {
    throw new Error(`${code}:${redact(text(result.stderr || result.stdout)).slice(0, 1000)}`);
  }
  return text(result.stdout);
}

function requireCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_ORPHAN_REPAIR_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_ORPHAN_REPAIR_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_ORPHAN_REPAIR_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_ORPHAN_REPAIR_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_ORPHAN_REPAIR_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_VIDEO_ORPHAN_REPAIR_MAIN_NOT_CURRENT:head=${head}:origin=${remote}`);
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

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (options.allow404 && response.status === 404) return { __not_found: true };
  if (!response.ok) {
    throw new Error(`AVANTIQO_VIDEO_ORPHAN_REPAIR_HTTP_${response.status}:${redact(text(body?.message || body?.error || body?.detail || raw)).slice(0, 1000)}`);
  }
  return body ?? {};
}

async function rest(pathname, key) {
  return requestJson(`${REST_BASE}${pathname}`, key);
}

async function queue(endpointId, pathname, key, options = {}) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, key, options);
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
  throw new Error("AVANTIQO_VIDEO_ORPHAN_REPAIR_QUEUE_CREDENTIAL_NOT_FOUND");
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
  if (!endpoints || !volumes || !templates) throw new Error("AVANTIQO_VIDEO_ORPHAN_REPAIR_INVENTORY_INVALID");
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

function validateVolume(volumes) {
  const matches = volumes.filter((entry) => text(entry.id) === VOLUME_ID || text(entry.name) === VOLUME_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_ORPHAN_REPAIR_VOLUME_COUNT:${matches.length}`);
  const volume = matches[0];
  const size = finite(volume.size ?? volume.sizeGb, 0);
  if (text(volume.id) !== VOLUME_ID || text(volume.name) !== VOLUME_NAME || text(volume.dataCenterId) !== VOLUME_DC || size < MIN_VOLUME_GB) {
    throw new Error(`AVANTIQO_VIDEO_ORPHAN_REPAIR_VOLUME_INVALID:id=${text(volume.id)}:dc=${text(volume.dataCenterId)}:size=${size}`);
  }
  return volume;
}

function validateVideoEvidence(evidence) {
  if (
    evidence?.success !== true ||
    text(evidence.contract) !== "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V2" ||
    text(evidence.evidence_revision) !== "AVANTIQO_VIDEO_WORKER_IMAGE_V3_WAN22_A14B_DEFAULT_ROUTING_CACHE_V2" ||
    text(evidence.immutable_image_reference) !== EXPECTED_IMAGE ||
    text(evidence.entrypoint) !== "handler_v3.py" ||
    text(evidence.configured_text_to_video_foundation) !== T2V_MODEL ||
    text(evidence.configured_image_to_video_foundation) !== I2V_MODEL ||
    Number(evidence.minimum_network_volume_quota_gb_for_cache) !== 400 ||
    evidence.partial_snapshot_satisfies_final_worker_fitness !== false
  ) throw new Error("AVANTIQO_VIDEO_ORPHAN_REPAIR_BUILD_EVIDENCE_INVALID");
}

function validateImageLock(lock) {
  const immutable = text(lock?.build_evidence?.immutable_image_reference);
  if (
    lock?.success !== true ||
    lock?.production_certified !== true ||
    text(lock?.status) !== "PRODUCTION_CERTIFIED_NOT_DEPLOYED" ||
    lock?.release_gate?.image_runtime_certified !== true ||
    lock?.release_gate?.image_default_routing_certified !== true ||
    lock?.release_gate?.image_human_quality_certified !== true ||
    lock?.release_gate?.image_economics_certified !== true ||
    !immutable
  ) throw new Error("AVANTIQO_VIDEO_ORPHAN_REPAIR_IMAGE_LOCK_INVALID");
  return immutable;
}

function validateImage(endpoint, template, immutable) {
  if (
    text(endpoint.name) !== IMAGE_NAME ||
    finite(endpoint.workersMin) !== 0 ||
    finite(endpoint.workersMax) !== 1 ||
    !endpointVolumeIds(endpoint).includes(VOLUME_ID) ||
    text(template.imageName) !== immutable ||
    !text(template.name).startsWith("avantiqo-image-immutable-v9-")
  ) throw new Error("AVANTIQO_VIDEO_ORPHAN_REPAIR_IMAGE_V9_CHANGED");
}

function validateCinema(endpoint, template) {
  const env = normalizeEnv(template.env);
  const failures = [];
  if (!CINEMA_NAMES.has(text(endpoint.name))) failures.push("name");
  if (finite(endpoint.workersMin) !== 0 || finite(endpoint.workersMax) !== 0) failures.push("scaling");
  if (!endpointVolumeIds(endpoint).includes(VOLUME_ID)) failures.push("volume");
  if (text(template.name) !== EXPECTED_TEMPLATE) failures.push("templateName");
  if (text(template.imageName) !== EXPECTED_IMAGE) failures.push("image");
  if (text(env.AVANTIQO_VIDEO_T2V_MODEL) !== T2V_MODEL) failures.push("t2v");
  if (text(env.AVANTIQO_VIDEO_I2V_MODEL) !== I2V_MODEL) failures.push("i2v");
  if (text(env.AVANTIQO_VIDEO_HF_CACHE_ROOT) !== CACHE_ROOT) failures.push("cacheRoot");
  if (text(env.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES) !== "__cache_only__") failures.push("cacheOnly");
  if (text(env.AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED) !== "0") failures.push("certificationExecution");
  if (failures.length) throw new Error(`AVANTIQO_VIDEO_ORPHAN_REPAIR_CINEMA_INVALID:${failures.join(",")}`);
}

function jobIdFromArgs() {
  const arg = process.argv.find((entry) => entry.startsWith("--job-id="));
  return text(arg ? arg.slice("--job-id=".length) : process.env.AVANTIQO_VIDEO_WAN22_ORPHAN_PROBE_JOB_ID);
}

function isTerminal(status) {
  return ["COMPLETED", "FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(text(status).toUpperCase());
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_ORPHAN_REPAIR_NODE24_REQUIRED:${process.version}`);
}
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_VIDEO_WAN22_ORPHAN_PROBE_CANCEL_APPROVED)) {
  throw new Error("AVANTIQO_VIDEO_WAN22_ORPHAN_PROBE_CANCEL_APPROVED=YES_REQUIRED");
}
const jobId = jobIdFromArgs();
if (!jobId) throw new Error("AVANTIQO_VIDEO_ORPHAN_REPAIR_JOB_ID_REQUIRED_USE_--job-id=<id>");
const mainSha = requireCurrentMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
if (!managementKey) throw new Error("AVANTIQO_VIDEO_ORPHAN_REPAIR_MANAGEMENT_CREDENTIAL_REQUIRED");

const videoEvidence = JSON.parse(await readFile(VIDEO_EVIDENCE_PATH, "utf8"));
validateVideoEvidence(videoEvidence);
const imageLock = JSON.parse(await readFile(IMAGE_LOCK_PATH, "utf8"));
const imageImmutable = validateImageLock(imageLock);

const initial = await inventory(managementKey);
const volume = validateVolume(initial.volumes);
const image = resolveEndpoint(initial.endpoints, text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_ORPHAN_REPAIR_IMAGE");
const cinema = resolveEndpoint(initial.endpoints, text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID), CINEMA_NAMES, "AVANTIQO_VIDEO_ORPHAN_REPAIR_CINEMA");
const imageTemplate = resolveTemplate(initial.templates, text(image.templateId || image.template?.id), "AVANTIQO_VIDEO_ORPHAN_REPAIR_IMAGE_TEMPLATE");
const cinemaTemplate = resolveTemplate(initial.templates, text(cinema.templateId || cinema.template?.id), "AVANTIQO_VIDEO_ORPHAN_REPAIR_CINEMA_TEMPLATE");
validateImage(image, imageTemplate, imageImmutable);
validateCinema(cinema, cinemaTemplate);
const cinemaBaseline = JSON.stringify(safeEndpoint(cinema));
const imageBaseline = JSON.stringify(safeEndpoint(image));
const queueCredential = await selectQueueCredential(text(cinema.id), managementKey);
const [jobBefore, healthBeforeRaw] = await Promise.all([
  queue(text(cinema.id), `/status/${encodeURIComponent(jobId)}`, queueCredential.key, { allow404: true }),
  queue(text(cinema.id), "/health", queueCredential.key),
]);
const healthBefore = healthSummary(healthBeforeRaw);
const jobStatusBefore = jobBefore.__not_found ? "NOT_FOUND" : text(jobBefore.status).toUpperCase();

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  scope: "VIDEO_ONLY",
  main_sha: mainSha,
  existing_job: { id: jobId, status: jobStatusBefore },
  queue_health: healthBefore,
  cinema: safeEndpoint(cinema),
  shared_volume: { id: text(volume.id), name: text(volume.name), size_gb: finite(volume.size ?? volume.sizeGb), data_center_id: text(volume.dataCenterId) },
  image_v9_preserved: true,
  safety: {
    endpoint_mutation_planned: false,
    template_mutation_planned: false,
    volume_mutation_planned: false,
    scaling_mutation_planned: false,
    gpu_pool_mutation_planned: false,
    existing_job_cancel_only: true,
    new_job_submitted: false,
    model_download_submitted: false,
    video_generation_submitted: false,
    inference_performed: false,
    production_web_deploy: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_WAN22_ORPHAN_PROBE_REPAIR_APPLIED=false");
  process.exit(0);
}

if (jobStatusBefore === "NOT_FOUND" || isTerminal(jobStatusBefore)) {
  if (healthBefore.jobs.in_queue !== 0 || healthBefore.jobs.in_progress !== 0 || workerCount(healthBefore) !== 0) {
    throw new Error(`AVANTIQO_VIDEO_ORPHAN_REPAIR_TERMINAL_JOB_BUT_QUEUE_NOT_CLEAN:${JSON.stringify(healthBefore)}`);
  }
  console.log("AVANTIQO_VIDEO_ORPHAN_REPAIR_CANCEL_PERFORMED=false");
} else {
  if (
    jobStatusBefore !== "IN_QUEUE" ||
    healthBefore.jobs.in_queue !== 1 ||
    healthBefore.jobs.in_progress !== 0 ||
    workerCount(healthBefore) !== 0
  ) {
    throw new Error(`AVANTIQO_VIDEO_ORPHAN_REPAIR_NOT_SAFE_TO_CANCEL:job=${jobStatusBefore}:health=${JSON.stringify(healthBefore)}`);
  }

  const fresh = await inventory(managementKey);
  validateVolume(fresh.volumes);
  const freshImage = resolveEndpoint(fresh.endpoints, text(image.id), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_ORPHAN_REPAIR_FRESH_IMAGE");
  const freshCinema = resolveEndpoint(fresh.endpoints, text(cinema.id), CINEMA_NAMES, "AVANTIQO_VIDEO_ORPHAN_REPAIR_FRESH_CINEMA");
  const freshImageTemplate = resolveTemplate(fresh.templates, text(freshImage.templateId || freshImage.template?.id), "AVANTIQO_VIDEO_ORPHAN_REPAIR_FRESH_IMAGE_TEMPLATE");
  const freshCinemaTemplate = resolveTemplate(fresh.templates, text(freshCinema.templateId || freshCinema.template?.id), "AVANTIQO_VIDEO_ORPHAN_REPAIR_FRESH_CINEMA_TEMPLATE");
  validateImage(freshImage, freshImageTemplate, imageImmutable);
  validateCinema(freshCinema, freshCinemaTemplate);
  if (JSON.stringify(safeEndpoint(freshCinema)) !== cinemaBaseline) throw new Error("AVANTIQO_VIDEO_ORPHAN_REPAIR_CINEMA_CHANGED_BEFORE_CANCEL");
  if (JSON.stringify(safeEndpoint(freshImage)) !== imageBaseline) throw new Error("AVANTIQO_VIDEO_ORPHAN_REPAIR_IMAGE_CHANGED_BEFORE_CANCEL");
  const [freshJob, freshHealthRaw] = await Promise.all([
    queue(text(freshCinema.id), `/status/${encodeURIComponent(jobId)}`, queueCredential.key, { allow404: true }),
    queue(text(freshCinema.id), "/health", queueCredential.key),
  ]);
  const freshHealth = healthSummary(freshHealthRaw);
  const freshStatus = freshJob.__not_found ? "NOT_FOUND" : text(freshJob.status).toUpperCase();
  if (
    freshStatus !== "IN_QUEUE" ||
    freshHealth.jobs.in_queue !== 1 ||
    freshHealth.jobs.in_progress !== 0 ||
    workerCount(freshHealth) !== 0
  ) {
    throw new Error(`AVANTIQO_VIDEO_ORPHAN_REPAIR_STATE_CHANGED_BEFORE_CANCEL:job=${freshStatus}:health=${JSON.stringify(freshHealth)}`);
  }

  await queue(text(freshCinema.id), `/cancel/${encodeURIComponent(jobId)}`, queueCredential.key, { method: "POST" });
  console.log("AVANTIQO_VIDEO_ORPHAN_REPAIR_CANCEL_PERFORMED=true");

  const deadline = Date.now() + WAIT_MS;
  let lastJobStatus = "UNKNOWN";
  let lastHealth = freshHealth;
  while (Date.now() <= deadline) {
    const [jobNow, healthNowRaw] = await Promise.all([
      queue(text(freshCinema.id), `/status/${encodeURIComponent(jobId)}`, queueCredential.key, { allow404: true }),
      queue(text(freshCinema.id), "/health", queueCredential.key),
    ]);
    lastHealth = healthSummary(healthNowRaw);
    lastJobStatus = jobNow.__not_found ? "NOT_FOUND" : text(jobNow.status).toUpperCase();
    if (
      (lastJobStatus === "NOT_FOUND" || isTerminal(lastJobStatus)) &&
      lastHealth.jobs.in_queue === 0 &&
      lastHealth.jobs.in_progress === 0 &&
      workerCount(lastHealth) === 0
    ) break;
    await sleep(POLL_MS);
  }
  if (
    !((lastJobStatus === "NOT_FOUND" || isTerminal(lastJobStatus)) &&
      lastHealth.jobs.in_queue === 0 &&
      lastHealth.jobs.in_progress === 0 &&
      workerCount(lastHealth) === 0)
  ) {
    throw new Error(`AVANTIQO_VIDEO_ORPHAN_REPAIR_CANCEL_DID_NOT_DRAIN:job=${lastJobStatus}:health=${JSON.stringify(lastHealth)}`);
  }
}

const verified = await inventory(managementKey);
const verifiedVolume = validateVolume(verified.volumes);
const verifiedImage = resolveEndpoint(verified.endpoints, text(image.id), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_ORPHAN_REPAIR_VERIFY_IMAGE");
const verifiedCinema = resolveEndpoint(verified.endpoints, text(cinema.id), CINEMA_NAMES, "AVANTIQO_VIDEO_ORPHAN_REPAIR_VERIFY_CINEMA");
const verifiedImageTemplate = resolveTemplate(verified.templates, text(verifiedImage.templateId || verifiedImage.template?.id), "AVANTIQO_VIDEO_ORPHAN_REPAIR_VERIFY_IMAGE_TEMPLATE");
const verifiedCinemaTemplate = resolveTemplate(verified.templates, text(verifiedCinema.templateId || verifiedCinema.template?.id), "AVANTIQO_VIDEO_ORPHAN_REPAIR_VERIFY_CINEMA_TEMPLATE");
validateImage(verifiedImage, verifiedImageTemplate, imageImmutable);
validateCinema(verifiedCinema, verifiedCinemaTemplate);
if (JSON.stringify(safeEndpoint(verifiedCinema)) !== cinemaBaseline) throw new Error("AVANTIQO_VIDEO_ORPHAN_REPAIR_CINEMA_CHANGED_DURING_CANCEL");
if (JSON.stringify(safeEndpoint(verifiedImage)) !== imageBaseline) throw new Error("AVANTIQO_VIDEO_ORPHAN_REPAIR_IMAGE_CHANGED_DURING_CANCEL");
const finalHealth = healthSummary(await queue(text(verifiedCinema.id), "/health", queueCredential.key));
if (finalHealth.jobs.in_queue !== 0 || finalHealth.jobs.in_progress !== 0 || workerCount(finalHealth) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_ORPHAN_REPAIR_FINAL_QUEUE_NOT_CLEAN:${JSON.stringify(finalHealth)}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  scope: "VIDEO_ONLY",
  orphan_probe_cleared: true,
  queue_health: finalHealth,
  cinema: safeEndpoint(verifiedCinema),
  shared_volume: { id: text(verifiedVolume.id), size_gb: finite(verifiedVolume.size ?? verifiedVolume.sizeGb), data_center_id: text(verifiedVolume.dataCenterId) },
  image_v9_preserved: true,
  endpoint_mutation_performed: false,
  template_mutation_performed: false,
  volume_mutation_performed: false,
  scaling_mutation_performed: false,
  gpu_pool_mutation_performed: false,
  new_job_submitted: false,
  model_download_submitted: false,
  video_generation_submitted: false,
  inference_performed: false,
  production_web_deploy: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  next_action: "RUN_CAPACITY_AWARE_T2V_A14B_CACHE_FILL",
}, null, 2));
console.log("AVANTIQO_VIDEO_WAN22_ORPHAN_PROBE_REPAIR_APPLIED=true");
