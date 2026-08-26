import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  groupCacheVolumes,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_VOLUME_ATTACHMENT_REPAIR_V1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const VIDEO_ENDPOINT_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const IMAGE_LOCK_PATH = "audits/results/avantiqo-image-v9-certification-lock.json";
const SHARED_GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const EXPECTED_VOLUME_NAME = "avantiqo-shared-image-video-cache";
const EXPECTED_VOLUME_ID = "7pcdebhpga";
const EXPECTED_VOLUME_DATA_CENTER = "US-NC-2";
const MINIMUM_VOLUME_GB = 400;

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}
function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1200)}`);
  }
  return text(result.stdout);
}
function requireCurrentMain() {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_VOLUME_ATTACH_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_VOLUME_ATTACH_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_VOLUME_ATTACH_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_VOLUME_ATTACH_HEAD_READ_FAILED");
  const origin = command("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_VOLUME_ATTACH_ORIGIN_READ_FAILED");
  if (head !== origin) {
    throw new Error(`AVANTIQO_VIDEO_VOLUME_ATTACH_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${origin}`);
  }
  return head;
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]).sort();
}
function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function liveManagementWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const value = desired || status;
    return Boolean(value && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(value));
  });
}
function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)).sort(),
    data_center_ids: unique(list(endpoint.dataCenterIds)).sort(),
    network_volume_ids: endpointVolumeIds(endpoint),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
    live_management_workers: liveManagementWorkers(endpoint).length,
  };
}
function cinemaStableFields(endpoint = {}) {
  const safe = safeEndpoint(endpoint);
  return {
    template_id: safe.template_id,
    workers_min: safe.workers_min,
    workers_max: safe.workers_max,
    gpu_type_ids: safe.gpu_type_ids,
    data_center_ids: safe.data_center_ids,
    idle_timeout_seconds: safe.idle_timeout_seconds,
    scaler_type: safe.scaler_type,
    scaler_value: safe.scaler_value,
    execution_timeout_ms: safe.execution_timeout_ms,
  };
}
function imageStableFields(endpoint = {}) {
  const safe = safeEndpoint(endpoint);
  return {
    template_id: safe.template_id,
    workers_min: safe.workers_min,
    workers_max: safe.workers_max,
    gpu_type_ids: safe.gpu_type_ids,
    data_center_ids: safe.data_center_ids,
    network_volume_ids: safe.network_volume_ids,
    idle_timeout_seconds: safe.idle_timeout_seconds,
    scaler_type: safe.scaler_type,
    scaler_value: safe.scaler_value,
    execution_timeout_ms: safe.execution_timeout_ms,
  };
}
function normalizeListResponse(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], keys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`);
  }
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
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "AVANTIQO_VIDEO_VOLUME_ATTACH_REST");
}
async function queueHealth(endpointId, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_VOLUME_ATTACH_QUEUE");
}
async function queueCredentialWorks(endpointId, key) {
  try {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    await response.arrayBuffer();
    return response.ok;
  } catch {
    return false;
  }
}
async function selectQueueCredential(endpointId, candidates) {
  const seen = new Set();
  for (const candidate of candidates.filter(Boolean)) {
    if (!candidate.key || seen.has(candidate.key)) continue;
    seen.add(candidate.key);
    if (await queueCredentialWorks(endpointId, candidate.key)) return candidate;
  }
  throw new Error(`AVANTIQO_VIDEO_VOLUME_ATTACH_QUEUE_CREDENTIAL_NOT_FOUND:${endpointId}`);
}
function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
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
function assertQuiescent(endpoint, healthRaw, label) {
  const health = healthSummary(healthRaw);
  const activeWorkers = Object.values(health.workers).reduce((sum, value) => sum + finite(value, 0), 0);
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || activeWorkers !== 0) {
    throw new Error(`${label}_QUEUE_NOT_QUIESCENT:queue=${health.jobs.in_queue}:progress=${health.jobs.in_progress}:workers=${activeWorkers}`);
  }
  const managementWorkers = liveManagementWorkers(endpoint).length;
  if (managementWorkers !== 0) throw new Error(`${label}_MANAGEMENT_WORKERS_NOT_QUIESCENT:${managementWorkers}`);
  return health;
}
async function endpointBoundTemplates(key) {
  const raw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key);
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VIDEO_VOLUME_ATTACH_TEMPLATE_LIST_INVALID");
  return templates;
}
async function inventory(key) {
  const [endpointsRaw, volumesRaw, templates] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", key),
    rest("/networkvolumes", key),
    endpointBoundTemplates(key),
  ]);
  const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const volumes = normalizeListResponse(volumesRaw, ["networkVolumes", "volumes"]);
  if (!endpoints || !volumes) throw new Error("AVANTIQO_VIDEO_VOLUME_ATTACH_INVENTORY_INVALID");
  return { endpoints, volumes, templates };
}
function resolveEndpoint(endpoints, configuredId, names, label) {
  const matches = configuredId
    ? endpoints.filter((entry) => text(entry.id) === configuredId && names.has(text(entry.name)))
    : endpoints.filter((entry) => names.has(text(entry.name)));
  if (matches.length !== 1) throw new Error(`${label}_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}
function resolveTemplate(endpoint, templates, label) {
  const templateId = text(endpoint.templateId || endpoint.template?.id);
  const matches = templates.filter((entry) => text(entry.id) === templateId);
  if (matches.length !== 1) throw new Error(`${label}_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}
function validateImageLock(lock) {
  if (
    lock?.success !== true ||
    lock?.production_certified !== true ||
    text(lock?.status) !== "PRODUCTION_CERTIFIED_NOT_DEPLOYED" ||
    text(lock?.generation_default?.foundation_model) !== "Tongyi-MAI/Z-Image" ||
    lock?.release_gate?.image_runtime_certified !== true ||
    lock?.release_gate?.image_default_routing_certified !== true ||
    lock?.release_gate?.image_human_quality_certified !== true ||
    lock?.release_gate?.image_economics_certified !== true ||
    lock?.release_gate?.production_deploy_completed !== false
  ) throw new Error("AVANTIQO_VIDEO_VOLUME_ATTACH_IMAGE_V9_LOCK_INVALID");
  return text(lock?.build_evidence?.immutable_image_reference);
}
function validateSharedVolume(volumes) {
  const policy = sharedVolumePolicySummary(volumes);
  if (!policy.policy_compliant) throw new Error("AVANTIQO_VIDEO_VOLUME_ATTACH_SHARED_POLICY_INVALID");
  const candidates = groupCacheVolumes(volumes, SHARED_GROUP);
  if (candidates.length !== 1) throw new Error(`AVANTIQO_VIDEO_VOLUME_ATTACH_SHARED_VOLUME_COUNT_INVALID:${candidates.length}`);
  const volume = candidates[0];
  if (
    text(volume.id) !== EXPECTED_VOLUME_ID ||
    text(volume.name) !== EXPECTED_VOLUME_NAME ||
    text(volume.dataCenterId) !== EXPECTED_VOLUME_DATA_CENTER ||
    finite(volume.size ?? volume.sizeGb, 0) < MINIMUM_VOLUME_GB
  ) throw new Error("AVANTIQO_VIDEO_VOLUME_ATTACH_SHARED_VOLUME_INVALID");
  return volume;
}
function validateImage(endpoint, template, immutableImage, volumeId) {
  const safe = safeEndpoint(endpoint);
  if (
    safe.name !== IMAGE_ENDPOINT_NAME ||
    safe.workers_min !== 0 ||
    safe.workers_max !== 1 ||
    !sameSet(safe.network_volume_ids, [volumeId]) ||
    text(template.imageName) !== immutableImage ||
    !text(template.name).startsWith("avantiqo-image-immutable-v9-")
  ) throw new Error("AVANTIQO_VIDEO_VOLUME_ATTACH_IMAGE_V9_CHANGED");
}
function validateCinema(endpoint, volumeId) {
  const safe = safeEndpoint(endpoint);
  if (!VIDEO_ENDPOINT_NAMES.has(safe.name)) throw new Error("AVANTIQO_VIDEO_VOLUME_ATTACH_CINEMA_NAME_INVALID");
  if (safe.workers_min !== 0 || safe.workers_max !== 0) {
    throw new Error(`AVANTIQO_VIDEO_VOLUME_ATTACH_CINEMA_MUST_REMAIN_DISABLED:min=${safe.workers_min}:max=${safe.workers_max}`);
  }
  if (safe.network_volume_ids.length && !sameSet(safe.network_volume_ids, [volumeId])) {
    throw new Error(`AVANTIQO_VIDEO_VOLUME_ATTACH_CINEMA_UNEXPECTED_VOLUME:${safe.network_volume_ids.join("|")}`);
  }
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_VOLUME_ATTACH_NODE24_REQUIRED:${process.version}`);
}
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_VIDEO_WAN22_VOLUME_ATTACHMENT_APPROVED)) {
  throw new Error("AVANTIQO_VIDEO_WAN22_VOLUME_ATTACHMENT_APPROVED=YES_REQUIRED");
}
const mainSha = requireCurrentMain();
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const imageLock = JSON.parse(await readFile(IMAGE_LOCK_PATH, "utf8"));
const imageImmutable = validateImageLock(imageLock);
const configuredImageId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const configuredVideoId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);

const initial = await inventory(managementKey);
const volume = validateSharedVolume(initial.volumes);
const volumeId = text(volume.id);
const image = resolveEndpoint(initial.endpoints, configuredImageId, new Set([IMAGE_ENDPOINT_NAME]), "AVANTIQO_VIDEO_VOLUME_ATTACH_IMAGE");
const cinema = resolveEndpoint(initial.endpoints, configuredVideoId, VIDEO_ENDPOINT_NAMES, "AVANTIQO_VIDEO_VOLUME_ATTACH_CINEMA");
const imageTemplate = resolveTemplate(image, initial.templates, "AVANTIQO_VIDEO_VOLUME_ATTACH_IMAGE");
const cinemaTemplate = resolveTemplate(cinema, initial.templates, "AVANTIQO_VIDEO_VOLUME_ATTACH_CINEMA");
validateImage(image, imageTemplate, imageImmutable, volumeId);
validateCinema(cinema, volumeId);

const imageQueueCredential = await selectQueueCredential(text(image.id), [
  text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) ? { source: "RUNPOD_AVANTIQO_IMAGE_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) } : null,
  text(process.env.RUNPOD_API_KEY) ? { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) } : null,
  { source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey },
]);
const cinemaQueueCredential = await selectQueueCredential(text(cinema.id), [
  text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) ? { source: "RUNPOD_AVANTIQO_VIDEO_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) } : null,
  text(process.env.RUNPOD_API_KEY) ? { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) } : null,
  { source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey },
]);
const [imageHealthRaw, cinemaHealthRaw] = await Promise.all([
  queueHealth(text(image.id), imageQueueCredential.key),
  queueHealth(text(cinema.id), cinemaQueueCredential.key),
]);
const imageHealth = assertQuiescent(image, imageHealthRaw, "AVANTIQO_VIDEO_VOLUME_ATTACH_IMAGE");
const cinemaHealth = assertQuiescent(cinema, cinemaHealthRaw, "AVANTIQO_VIDEO_VOLUME_ATTACH_CINEMA");
const imageStableBefore = imageStableFields(image);
const cinemaStableBefore = cinemaStableFields(cinema);
const attachmentRequired = !sameSet(endpointVolumeIds(cinema), [volumeId]);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: mainSha,
  shared_volume: {
    id: volumeId,
    name: text(volume.name),
    data_center_id: text(volume.dataCenterId),
    size_gb: finite(volume.size ?? volume.sizeGb),
    already_resized_to_400gb: finite(volume.size ?? volume.sizeGb, 0) >= MINIMUM_VOLUME_GB,
  },
  image_v9: {
    preserved: true,
    endpoint: safeEndpoint(image),
    template_name: text(imageTemplate.name),
    immutable_image: imageImmutable,
  },
  cinema: {
    endpoint: safeEndpoint(cinema),
    template_name: text(cinemaTemplate.name),
    template_image: text(cinemaTemplate.imageName),
    attachment_required: attachmentRequired,
    target_network_volume_ids: [volumeId],
    data_center_ids_before: safeEndpoint(cinema).data_center_ids,
    data_center_mutation_planned: false,
    endpoint_patch_fields: attachmentRequired ? ["networkVolumeId", "networkVolumeIds"] : [],
  },
  queue_health: { image: imageHealth, cinema: cinemaHealth },
  safety: {
    volume_resize_performed: false,
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
  next_action: apply ? "ATTACH_SHARED_VOLUME_WITHOUT_REGION_PIN" : "APPROVE_SHARED_VOLUME_ATTACHMENT_WITHOUT_REGION_PIN",
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_WAN22_VOLUME_ATTACHMENT_APPLIED=false");
  process.exit(0);
}

const fresh = await inventory(managementKey);
const freshVolume = validateSharedVolume(fresh.volumes);
if (text(freshVolume.id) !== volumeId) throw new Error("AVANTIQO_VIDEO_VOLUME_ATTACH_VOLUME_CHANGED_BEFORE_WRITE");
const freshImage = resolveEndpoint(fresh.endpoints, text(image.id), new Set([IMAGE_ENDPOINT_NAME]), "AVANTIQO_VIDEO_VOLUME_ATTACH_FRESH_IMAGE");
const freshCinema = resolveEndpoint(fresh.endpoints, text(cinema.id), VIDEO_ENDPOINT_NAMES, "AVANTIQO_VIDEO_VOLUME_ATTACH_FRESH_CINEMA");
const freshImageTemplate = resolveTemplate(freshImage, fresh.templates, "AVANTIQO_VIDEO_VOLUME_ATTACH_FRESH_IMAGE");
const freshCinemaTemplate = resolveTemplate(freshCinema, fresh.templates, "AVANTIQO_VIDEO_VOLUME_ATTACH_FRESH_CINEMA");
validateImage(freshImage, freshImageTemplate, imageImmutable, volumeId);
validateCinema(freshCinema, volumeId);
if (JSON.stringify(imageStableFields(freshImage)) !== JSON.stringify(imageStableBefore)) {
  throw new Error("AVANTIQO_VIDEO_VOLUME_ATTACH_IMAGE_STATE_CHANGED_BEFORE_WRITE");
}
if (JSON.stringify(cinemaStableFields(freshCinema)) !== JSON.stringify(cinemaStableBefore)) {
  throw new Error("AVANTIQO_VIDEO_VOLUME_ATTACH_CINEMA_STATE_CHANGED_BEFORE_WRITE");
}
if (text(freshCinemaTemplate.id) !== text(cinemaTemplate.id) || text(freshCinemaTemplate.imageName) !== text(cinemaTemplate.imageName)) {
  throw new Error("AVANTIQO_VIDEO_VOLUME_ATTACH_CINEMA_TEMPLATE_CHANGED_BEFORE_WRITE");
}
const [freshImageHealthRaw, freshCinemaHealthRaw] = await Promise.all([
  queueHealth(text(freshImage.id), imageQueueCredential.key),
  queueHealth(text(freshCinema.id), cinemaQueueCredential.key),
]);
assertQuiescent(freshImage, freshImageHealthRaw, "AVANTIQO_VIDEO_VOLUME_ATTACH_FRESH_IMAGE");
assertQuiescent(freshCinema, freshCinemaHealthRaw, "AVANTIQO_VIDEO_VOLUME_ATTACH_FRESH_CINEMA");

let mutationPerformed = false;
if (!sameSet(endpointVolumeIds(freshCinema), [volumeId])) {
  await rest(`/endpoints/${encodeURIComponent(text(freshCinema.id))}`, managementKey, {
    method: "PATCH",
    body: {
      networkVolumeId: volumeId,
      networkVolumeIds: [volumeId],
    },
  });
  mutationPerformed = true;
}

const verified = await inventory(managementKey);
const verifiedVolume = validateSharedVolume(verified.volumes);
const verifiedImage = resolveEndpoint(verified.endpoints, text(image.id), new Set([IMAGE_ENDPOINT_NAME]), "AVANTIQO_VIDEO_VOLUME_ATTACH_VERIFY_IMAGE");
const verifiedCinema = resolveEndpoint(verified.endpoints, text(cinema.id), VIDEO_ENDPOINT_NAMES, "AVANTIQO_VIDEO_VOLUME_ATTACH_VERIFY_CINEMA");
const verifiedImageTemplate = resolveTemplate(verifiedImage, verified.templates, "AVANTIQO_VIDEO_VOLUME_ATTACH_VERIFY_IMAGE");
const verifiedCinemaTemplate = resolveTemplate(verifiedCinema, verified.templates, "AVANTIQO_VIDEO_VOLUME_ATTACH_VERIFY_CINEMA");
validateImage(verifiedImage, verifiedImageTemplate, imageImmutable, volumeId);
validateCinema(verifiedCinema, volumeId);
if (!sameSet(endpointVolumeIds(verifiedCinema), [volumeId])) {
  throw new Error(`AVANTIQO_VIDEO_VOLUME_ATTACH_VERIFY_FAILED:${endpointVolumeIds(verifiedCinema).join("|") || "NONE"}`);
}
if (JSON.stringify(imageStableFields(verifiedImage)) !== JSON.stringify(imageStableBefore)) {
  throw new Error("AVANTIQO_VIDEO_VOLUME_ATTACH_IMAGE_V9_CHANGED_DURING_WRITE");
}
if (JSON.stringify(cinemaStableFields(verifiedCinema)) !== JSON.stringify(cinemaStableBefore)) {
  throw new Error(`AVANTIQO_VIDEO_VOLUME_ATTACH_CINEMA_STABLE_FIELDS_CHANGED:${JSON.stringify({ before: cinemaStableBefore, after: cinemaStableFields(verifiedCinema) })}`);
}
if (text(verifiedCinemaTemplate.id) !== text(cinemaTemplate.id) || text(verifiedCinemaTemplate.imageName) !== text(cinemaTemplate.imageName)) {
  throw new Error("AVANTIQO_VIDEO_VOLUME_ATTACH_CINEMA_TEMPLATE_CHANGED_DURING_WRITE");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  main_sha: mainSha,
  shared_volume: {
    id: text(verifiedVolume.id),
    name: text(verifiedVolume.name),
    data_center_id: text(verifiedVolume.dataCenterId),
    size_gb: finite(verifiedVolume.size ?? verifiedVolume.sizeGb),
  },
  image_v9: {
    preserved: true,
    endpoint: safeEndpoint(verifiedImage),
    template_name: text(verifiedImageTemplate.name),
    endpoint_mutated: false,
    template_mutated: false,
  },
  cinema: {
    endpoint: safeEndpoint(verifiedCinema),
    template_name: text(verifiedCinemaTemplate.name),
    shared_volume_attached: true,
    endpoint_mutation_performed: mutationPerformed,
    data_center_ids_unchanged: sameSet(safeEndpoint(verifiedCinema).data_center_ids, cinemaStableBefore.data_center_ids),
    workers_max_remains_zero: finite(verifiedCinema.workersMax) === 0,
    template_unchanged: true,
  },
  provider_jobs_submitted: 0,
  model_download_submitted: false,
  video_generation_submitted: false,
  inference_performed: false,
  production_web_deploy: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  next_action: "BIND_V3_CACHE_ONLY_TEMPLATE_AND_CACHE_WAN22_A14B_MODELS",
}, null, 2));
console.log("AVANTIQO_VIDEO_WAN22_VOLUME_ATTACHMENT_APPLIED=true");
