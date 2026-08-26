import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_VOLUME_ATTACHMENT_REPAIR_V2";
const IMAGE_NAME = "avantiqo-image-v1";
const CINEMA_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const IMAGE_LOCK_PATH = "audits/results/avantiqo-image-v9-certification-lock.json";
const VOLUME_ID = "7pcdebhpga";
const VOLUME_NAME = "avantiqo-shared-image-video-cache";
const VOLUME_DC = "US-NC-2";
const MIN_VOLUME_GB = 400;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}
function shell(name, args, code) {
  const result = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env });
  if (result.status !== 0) throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1000)}`);
  return text(result.stdout);
}
function requireCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_VOLUME_V2_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_VOLUME_V2_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_VOLUME_V2_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_VOLUME_V2_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_VOLUME_V2_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_VIDEO_VOLUME_V2_MAIN_NOT_CURRENT:head=${head}:origin=${remote}`);
  return head;
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function sameSet(a, b) {
  const left = unique(a);
  const right = unique(b);
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function stableEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)),
    data_center_ids: unique(list(endpoint.dataCenterIds)),
    network_volume_ids: endpointVolumeIds(endpoint),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
  };
}
function cinemaStableWithoutVolume(endpoint = {}) {
  const value = stableEndpoint(endpoint);
  delete value.network_volume_ids;
  return value;
}
function liveManagementWorkerCount(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const effective = desired || status;
    return Boolean(effective && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(effective));
  }).length;
}
function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const result = normalizeList(value[key], keys, depth + 1);
    if (result) return result;
  }
  return null;
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
  if (!response.ok) throw new Error(`AVANTIQO_VIDEO_VOLUME_V2_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`);
  return body ?? {};
}
async function rest(path, key, options = {}) {
  return requestJson(`${REST_BASE}${path}`, key, options);
}
async function queueHealth(endpointId, key) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key);
}
function healthSummary(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
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
function assertImageSafeForPeerAttachment(healthRaw) {
  const health = healthSummary(healthRaw);
  const unsafeWorkers = health.workers.initializing + health.workers.running + health.workers.throttled + health.workers.unhealthy;
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || unsafeWorkers !== 0) {
    throw new Error(`AVANTIQO_VIDEO_VOLUME_V2_IMAGE_BUSY:queue=${health.jobs.in_queue}:progress=${health.jobs.in_progress}:unsafe_workers=${unsafeWorkers}`);
  }
  return {
    ...health,
    idle_ready_workers_allowed: true,
    idle_ready_workers: health.workers.idle + health.workers.ready,
  };
}
function assertCinemaFullyQuiescent(endpoint, healthRaw) {
  const health = healthSummary(healthRaw);
  const workerTotal = Object.values(health.workers).reduce((sum, value) => sum + Number(value || 0), 0);
  const managementWorkers = liveManagementWorkerCount(endpoint);
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || workerTotal !== 0 || managementWorkers !== 0) {
    throw new Error(`AVANTIQO_VIDEO_VOLUME_V2_CINEMA_NOT_QUIESCENT:queue=${health.jobs.in_queue}:progress=${health.jobs.in_progress}:workers=${workerTotal}:management=${managementWorkers}`);
  }
  return health;
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
  if (!endpoints || !volumes || !templates) throw new Error("AVANTIQO_VIDEO_VOLUME_V2_INVENTORY_INVALID");
  return { endpoints, volumes, templates };
}
function resolveEndpoint(endpoints, configuredId, names, label) {
  const matches = configuredId
    ? endpoints.filter((entry) => text(entry.id) === configuredId && names.has(text(entry.name)))
    : endpoints.filter((entry) => names.has(text(entry.name)));
  if (matches.length !== 1) throw new Error(`${label}_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}
function resolveTemplate(endpoint, templates, label) {
  const id = text(endpoint.templateId || endpoint.template?.id);
  const matches = templates.filter((entry) => text(entry.id) === id);
  if (matches.length !== 1) throw new Error(`${label}_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}
function validateVolume(volumes) {
  const matches = volumes.filter((volume) => text(volume.id) === VOLUME_ID || text(volume.name) === VOLUME_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_VOLUME_V2_VOLUME_RESOLUTION_FAILED:${matches.length}`);
  const volume = matches[0];
  const size = finite(volume.size ?? volume.sizeGb, 0);
  if (text(volume.id) !== VOLUME_ID || text(volume.name) !== VOLUME_NAME || text(volume.dataCenterId) !== VOLUME_DC || size < MIN_VOLUME_GB) {
    throw new Error(`AVANTIQO_VIDEO_VOLUME_V2_VOLUME_INVALID:id=${text(volume.id)}:name=${text(volume.name)}:dc=${text(volume.dataCenterId)}:size=${size}`);
  }
  return volume;
}
function validateImageLock(lock) {
  const immutable = text(lock?.build_evidence?.immutable_image_reference);
  if (
    lock?.success !== true ||
    lock?.production_certified !== true ||
    text(lock?.status) !== "PRODUCTION_CERTIFIED_NOT_DEPLOYED" ||
    text(lock?.generation_default?.foundation_model) !== "Tongyi-MAI/Z-Image" ||
    lock?.release_gate?.image_runtime_certified !== true ||
    lock?.release_gate?.image_default_routing_certified !== true ||
    lock?.release_gate?.image_human_quality_certified !== true ||
    lock?.release_gate?.image_economics_certified !== true ||
    lock?.release_gate?.production_deploy_completed !== false ||
    !immutable
  ) throw new Error("AVANTIQO_VIDEO_VOLUME_V2_IMAGE_LOCK_INVALID");
  return immutable;
}
function validateImage(endpoint, template, immutable) {
  const safe = stableEndpoint(endpoint);
  if (
    safe.name !== IMAGE_NAME ||
    safe.workers_min !== 0 ||
    safe.workers_max !== 1 ||
    !sameSet(safe.network_volume_ids, [VOLUME_ID]) ||
    text(template.imageName) !== immutable ||
    !text(template.name).startsWith("avantiqo-image-immutable-v9-")
  ) throw new Error("AVANTIQO_VIDEO_VOLUME_V2_IMAGE_V9_CHANGED");
}
function validateCinema(endpoint) {
  const safe = stableEndpoint(endpoint);
  if (!CINEMA_NAMES.has(safe.name)) throw new Error("AVANTIQO_VIDEO_VOLUME_V2_CINEMA_NAME_INVALID");
  if (safe.workers_min !== 0 || safe.workers_max !== 0) throw new Error(`AVANTIQO_VIDEO_VOLUME_V2_CINEMA_NOT_DISABLED:min=${safe.workers_min}:max=${safe.workers_max}`);
  if (safe.network_volume_ids.length && !sameSet(safe.network_volume_ids, [VOLUME_ID])) {
    throw new Error(`AVANTIQO_VIDEO_VOLUME_V2_CINEMA_VOLUME_UNEXPECTED:${safe.network_volume_ids.join("|")}`);
  }
}

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_VOLUME_V2_NODE24_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_VIDEO_WAN22_VOLUME_ATTACHMENT_APPROVED)) {
  throw new Error("AVANTIQO_VIDEO_WAN22_VOLUME_ATTACHMENT_APPROVED=YES_REQUIRED");
}
const mainSha = requireCurrentMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY);
if (!managementKey || !queueKey) throw new Error("AVANTIQO_VIDEO_VOLUME_V2_RUNPOD_CREDENTIAL_REQUIRED");
const imageLock = JSON.parse(await readFile(IMAGE_LOCK_PATH, "utf8"));
const imageImmutable = validateImageLock(imageLock);

const initial = await inventory(managementKey);
const volume = validateVolume(initial.volumes);
const image = resolveEndpoint(initial.endpoints, text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_VOLUME_V2_IMAGE");
const cinema = resolveEndpoint(initial.endpoints, text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID), CINEMA_NAMES, "AVANTIQO_VIDEO_VOLUME_V2_CINEMA");
const imageTemplate = resolveTemplate(image, initial.templates, "AVANTIQO_VIDEO_VOLUME_V2_IMAGE");
const cinemaTemplate = resolveTemplate(cinema, initial.templates, "AVANTIQO_VIDEO_VOLUME_V2_CINEMA");
validateImage(image, imageTemplate, imageImmutable);
validateCinema(cinema);
const [imageHealthRaw, cinemaHealthRaw] = await Promise.all([
  queueHealth(text(image.id), queueKey),
  queueHealth(text(cinema.id), queueKey),
]);
const imageHealth = assertImageSafeForPeerAttachment(imageHealthRaw);
const cinemaHealth = assertCinemaFullyQuiescent(cinema, cinemaHealthRaw);
const imageBefore = stableEndpoint(image);
const cinemaBefore = cinemaStableWithoutVolume(cinema);
const attachmentRequired = !sameSet(endpointVolumeIds(cinema), [VOLUME_ID]);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: mainSha,
  shared_volume: { id: VOLUME_ID, name: VOLUME_NAME, data_center_id: VOLUME_DC, size_gb: finite(volume.size ?? volume.sizeGb) },
  image_v9: {
    preserved: true,
    endpoint: imageBefore,
    template_name: text(imageTemplate.name),
    idle_ready_workers_allowed_for_peer_attachment: true,
  },
  cinema: {
    endpoint: stableEndpoint(cinema),
    template_name: text(cinemaTemplate.name),
    attachment_required: attachmentRequired,
    target_network_volume_ids: [VOLUME_ID],
    data_center_ids_before: unique(list(cinema.dataCenterIds)),
    data_center_mutation_planned: false,
  },
  health: { image: imageHealth, cinema: cinemaHealth },
  safety: {
    image_endpoint_mutation: false,
    image_template_mutation: false,
    cinema_template_mutation: false,
    cinema_scaling_mutation: false,
    cinema_data_center_mutation: false,
    provider_jobs_submitted: 0,
    model_download_submitted: false,
    video_generation_submitted: false,
    inference_performed: false,
    production_web_deploy: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_WAN22_VOLUME_ATTACHMENT_V2_APPLIED=false");
  process.exit(0);
}

const fresh = await inventory(managementKey);
validateVolume(fresh.volumes);
const freshImage = resolveEndpoint(fresh.endpoints, text(image.id), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_VOLUME_V2_FRESH_IMAGE");
const freshCinema = resolveEndpoint(fresh.endpoints, text(cinema.id), CINEMA_NAMES, "AVANTIQO_VIDEO_VOLUME_V2_FRESH_CINEMA");
const freshImageTemplate = resolveTemplate(freshImage, fresh.templates, "AVANTIQO_VIDEO_VOLUME_V2_FRESH_IMAGE");
const freshCinemaTemplate = resolveTemplate(freshCinema, fresh.templates, "AVANTIQO_VIDEO_VOLUME_V2_FRESH_CINEMA");
validateImage(freshImage, freshImageTemplate, imageImmutable);
validateCinema(freshCinema);
if (JSON.stringify(stableEndpoint(freshImage)) !== JSON.stringify(imageBefore)) throw new Error("AVANTIQO_VIDEO_VOLUME_V2_IMAGE_CHANGED_BEFORE_WRITE");
if (JSON.stringify(cinemaStableWithoutVolume(freshCinema)) !== JSON.stringify(cinemaBefore)) throw new Error("AVANTIQO_VIDEO_VOLUME_V2_CINEMA_CHANGED_BEFORE_WRITE");
if (text(freshCinemaTemplate.id) !== text(cinemaTemplate.id) || text(freshCinemaTemplate.imageName) !== text(cinemaTemplate.imageName)) {
  throw new Error("AVANTIQO_VIDEO_VOLUME_V2_CINEMA_TEMPLATE_CHANGED_BEFORE_WRITE");
}
const [freshImageHealthRaw, freshCinemaHealthRaw] = await Promise.all([
  queueHealth(text(freshImage.id), queueKey),
  queueHealth(text(freshCinema.id), queueKey),
]);
assertImageSafeForPeerAttachment(freshImageHealthRaw);
assertCinemaFullyQuiescent(freshCinema, freshCinemaHealthRaw);

let mutationPerformed = false;
if (!sameSet(endpointVolumeIds(freshCinema), [VOLUME_ID])) {
  await rest(`/endpoints/${encodeURIComponent(text(freshCinema.id))}`, managementKey, {
    method: "PATCH",
    body: { networkVolumeId: VOLUME_ID, networkVolumeIds: [VOLUME_ID] },
  });
  mutationPerformed = true;
}

const verified = await inventory(managementKey);
validateVolume(verified.volumes);
const verifiedImage = resolveEndpoint(verified.endpoints, text(image.id), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_VOLUME_V2_VERIFY_IMAGE");
const verifiedCinema = resolveEndpoint(verified.endpoints, text(cinema.id), CINEMA_NAMES, "AVANTIQO_VIDEO_VOLUME_V2_VERIFY_CINEMA");
const verifiedImageTemplate = resolveTemplate(verifiedImage, verified.templates, "AVANTIQO_VIDEO_VOLUME_V2_VERIFY_IMAGE");
const verifiedCinemaTemplate = resolveTemplate(verifiedCinema, verified.templates, "AVANTIQO_VIDEO_VOLUME_V2_VERIFY_CINEMA");
validateImage(verifiedImage, verifiedImageTemplate, imageImmutable);
validateCinema(verifiedCinema);
if (!sameSet(endpointVolumeIds(verifiedCinema), [VOLUME_ID])) throw new Error("AVANTIQO_VIDEO_VOLUME_V2_ATTACHMENT_VERIFY_FAILED");
if (JSON.stringify(stableEndpoint(verifiedImage)) !== JSON.stringify(imageBefore)) throw new Error("AVANTIQO_VIDEO_VOLUME_V2_IMAGE_CHANGED_DURING_WRITE");
if (JSON.stringify(cinemaStableWithoutVolume(verifiedCinema)) !== JSON.stringify(cinemaBefore)) throw new Error("AVANTIQO_VIDEO_VOLUME_V2_CINEMA_STABLE_FIELDS_CHANGED");
if (text(verifiedCinemaTemplate.id) !== text(cinemaTemplate.id) || text(verifiedCinemaTemplate.imageName) !== text(cinemaTemplate.imageName)) {
  throw new Error("AVANTIQO_VIDEO_VOLUME_V2_CINEMA_TEMPLATE_CHANGED_DURING_WRITE");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  shared_volume_attached: true,
  endpoint_mutation_performed: mutationPerformed,
  image_v9_preserved: true,
  image_endpoint_mutated: false,
  cinema_template_unchanged: true,
  cinema_scaling_unchanged: true,
  cinema_data_center_ids_unchanged: sameSet(unique(list(verifiedCinema.dataCenterIds)), unique(list(cinema.dataCenterIds))),
  cinema_workers_max_remains_zero: finite(verifiedCinema.workersMax) === 0,
  provider_jobs_submitted: 0,
  model_download_submitted: false,
  video_generation_submitted: false,
  inference_performed: false,
  production_web_deploy: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  next_action: "BIND_V3_CACHE_ONLY_TEMPLATE_AND_CACHE_WAN22_A14B_MODELS",
}, null, 2));
console.log("AVANTIQO_VIDEO_WAN22_VOLUME_ATTACHMENT_V2_APPLIED=true");
