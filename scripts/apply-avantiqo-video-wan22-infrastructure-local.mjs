import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  groupCacheVolumes,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_INFRASTRUCTURE_APPLY_V1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const VIDEO_ENDPOINT_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const IMAGE_LOCK_PATH = "audits/results/avantiqo-image-v9-certification-lock.json";
const SHARED_GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const TARGET_SIZE_GB = 400;
const EXPECTED_DATA_CENTER_ID = "US-NC-2";
const T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";

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
  command("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_WAN22_INFRA_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_WAN22_INFRA_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_WAN22_INFRA_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_WAN22_INFRA_HEAD_READ_FAILED");
  const origin = command("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_WAN22_INFRA_ORIGIN_READ_FAILED");
  if (head !== origin) throw new Error(`AVANTIQO_VIDEO_WAN22_INFRA_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${origin}`);
  return head;
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function managementLiveWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const effective = desired || status;
    return effective && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(effective);
  });
}
function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    data_center_ids: list(endpoint.dataCenterIds).map(text).filter(Boolean),
    network_volume_ids: endpointVolumeIds(endpoint),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
    live_management_workers: managementLiveWorkers(endpoint).length,
  };
}
function stableVideoFields(endpoint = {}) {
  const safe = safeEndpoint(endpoint);
  return {
    template_id: safe.template_id,
    workers_min: safe.workers_min,
    workers_max: safe.workers_max,
    gpu_type_ids: safe.gpu_type_ids,
    idle_timeout_seconds: safe.idle_timeout_seconds,
    scaler_type: safe.scaler_type,
    scaler_value: safe.scaler_value,
    execution_timeout_ms: safe.execution_timeout_ms,
  };
}
function imageLockStableFields(endpoint = {}) {
  const safe = safeEndpoint(endpoint);
  return {
    template_id: safe.template_id,
    workers_min: safe.workers_min,
    workers_max: safe.workers_max,
    gpu_type_ids: safe.gpu_type_ids,
    network_volume_ids: safe.network_volume_ids,
    idle_timeout_seconds: safe.idle_timeout_seconds,
    scaler_type: safe.scaler_type,
    scaler_value: safe.scaler_value,
  };
}
function normalizeListResponse(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeListResponse(value[key], keys, depth + 1);
    if (found) return found;
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
  }), "AVANTIQO_VIDEO_WAN22_INFRA_REST");
}
async function queueHealth(endpointId, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_WAN22_INFRA_QUEUE");
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
  throw new Error(`AVANTIQO_VIDEO_WAN22_INFRA_QUEUE_CREDENTIAL_NOT_FOUND:${endpointId}`);
}
function queueJobs(body = {}) {
  const jobs = object(body.jobs);
  return {
    in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
  };
}
function assertQuiescent(endpoint, health, label) {
  const jobs = queueJobs(health);
  if (jobs.in_queue !== 0 || jobs.in_progress !== 0) {
    throw new Error(`${label}_ACTIVE_JOBS_BLOCKED:queue=${jobs.in_queue}:progress=${jobs.in_progress}`);
  }
  const live = managementLiveWorkers(endpoint);
  if (live.length) throw new Error(`${label}_LIVE_MANAGEMENT_WORKERS_BLOCKED:${live.length}`);
}
function resolveEndpoint(endpoints, configuredId, names, label) {
  if (configuredId) {
    const matches = endpoints.filter((entry) => text(entry.id) === configuredId && names.has(text(entry.name)));
    if (matches.length !== 1) throw new Error(`${label}_CONFIGURED_ENDPOINT_INVALID:${matches.length}`);
    return matches[0];
  }
  const matches = endpoints.filter((entry) => names.has(text(entry.name)));
  if (matches.length !== 1) throw new Error(`${label}_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}
async function endpointBoundTemplates(key) {
  const raw = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key);
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_TEMPLATE_LIST_INVALID");
  return templates;
}
function resolveTemplate(endpoint, templates, label) {
  const id = text(endpoint.templateId || endpoint.template?.id);
  const matches = templates.filter((entry) => text(entry.id) === id);
  if (matches.length !== 1) throw new Error(`${label}_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}
async function inventory(managementKey) {
  const [endpointsRaw, volumesRaw, templates] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    rest("/networkvolumes", managementKey),
    endpointBoundTemplates(managementKey),
  ]);
  const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const volumes = normalizeListResponse(volumesRaw, ["networkVolumes", "volumes"]);
  if (!endpoints || !volumes) throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_INVENTORY_INVALID");
  return { endpoints, volumes, templates };
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
  ) throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_IMAGE_V9_LOCK_INVALID");
  const image = text(lock?.build_evidence?.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-image-worker@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_IMAGE_V9_IMMUTABLE_REFERENCE_INVALID");
  }
  return image;
}
function validateImageEndpoint(endpoint, template, immutableImage, sharedVolumeId) {
  const safe = safeEndpoint(endpoint);
  if (safe.name !== IMAGE_ENDPOINT_NAME) throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_IMAGE_NAME_INVALID");
  if (safe.workers_min !== 0 || safe.workers_max !== 1) throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_IMAGE_SCALING_CHANGED");
  if (!sameSet(safe.network_volume_ids, [sharedVolumeId])) throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_IMAGE_VOLUME_CHANGED");
  if (text(template.imageName) !== immutableImage || !text(template.name).startsWith("avantiqo-image-immutable-v9-")) {
    throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_IMAGE_V9_TEMPLATE_CHANGED");
  }
}
function validateVideoPreCache(endpoint, sharedVolumeId, allowAttached) {
  const safe = safeEndpoint(endpoint);
  if (!VIDEO_ENDPOINT_NAMES.has(safe.name)) throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_VIDEO_NAME_INVALID");
  if (safe.workers_min !== 0 || safe.workers_max !== 0) {
    throw new Error(`AVANTIQO_VIDEO_WAN22_INFRA_VIDEO_MUST_REMAIN_DISABLED:min=${safe.workers_min}:max=${safe.workers_max}`);
  }
  const ids = safe.network_volume_ids;
  if (ids.length && (!allowAttached || !sameSet(ids, [sharedVolumeId]))) {
    throw new Error(`AVANTIQO_VIDEO_WAN22_INFRA_VIDEO_VOLUME_UNEXPECTED:${ids.join("|")}`);
  }
}

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_WAN22_INFRA_NODE24_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_VIDEO_WAN22_INFRASTRUCTURE_APPROVED)) {
  throw new Error("AVANTIQO_VIDEO_WAN22_INFRASTRUCTURE_APPROVED=YES_REQUIRED");
}
const mainSha = requireCurrentMain();
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const imageEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const videoEndpointId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
const imageLock = JSON.parse(await readFile(IMAGE_LOCK_PATH, "utf8"));
const imageImmutable = validateImageLock(imageLock);

const initial = await inventory(managementKey);
const policy = sharedVolumePolicySummary(initial.volumes);
if (!policy.policy_compliant) throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_SHARED_VOLUME_POLICY_INVALID");
const groupVolumes = groupCacheVolumes(initial.volumes, SHARED_GROUP);
if (groupVolumes.length !== 1) throw new Error(`AVANTIQO_VIDEO_WAN22_INFRA_SHARED_VOLUME_COUNT_INVALID:${groupVolumes.length}`);
const volume = groupVolumes[0];
const volumeId = text(volume.id);
const volumeName = text(volume.name);
const dataCenterId = text(volume.dataCenterId);
const currentSizeGb = finite(volume.size ?? volume.sizeGb, 0);
if (!volumeId || volumeName !== SHARED_GROUP.canonical_name || dataCenterId !== EXPECTED_DATA_CENTER_ID) {
  throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_SHARED_VOLUME_IDENTITY_INVALID");
}
if (currentSizeGb < 160 || currentSizeGb > TARGET_SIZE_GB) {
  throw new Error(`AVANTIQO_VIDEO_WAN22_INFRA_SHARED_VOLUME_SIZE_UNEXPECTED:${currentSizeGb}`);
}

const image = resolveEndpoint(initial.endpoints, imageEndpointId, new Set([IMAGE_ENDPOINT_NAME]), "AVANTIQO_VIDEO_WAN22_INFRA_IMAGE");
const video = resolveEndpoint(initial.endpoints, videoEndpointId, VIDEO_ENDPOINT_NAMES, "AVANTIQO_VIDEO_WAN22_INFRA_VIDEO");
const imageTemplate = resolveTemplate(image, initial.templates, "AVANTIQO_VIDEO_WAN22_INFRA_IMAGE");
const videoTemplate = resolveTemplate(video, initial.templates, "AVANTIQO_VIDEO_WAN22_INFRA_VIDEO");
validateImageEndpoint(image, imageTemplate, imageImmutable, volumeId);
validateVideoPreCache(video, volumeId, true);

const imageCredential = await selectQueueCredential(text(image.id), [
  text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) ? { source: "RUNPOD_AVANTIQO_IMAGE_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) } : null,
  text(process.env.RUNPOD_API_KEY) ? { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) } : null,
  { source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey },
]);
const videoCredential = await selectQueueCredential(text(video.id), [
  text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) ? { source: "RUNPOD_AVANTIQO_VIDEO_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) } : null,
  text(process.env.RUNPOD_API_KEY) ? { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) } : null,
  { source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey },
]);
const [imageHealth, videoHealth] = await Promise.all([
  queueHealth(text(image.id), imageCredential.key),
  queueHealth(text(video.id), videoCredential.key),
]);
assertQuiescent(image, imageHealth, "AVANTIQO_VIDEO_WAN22_INFRA_IMAGE");
assertQuiescent(video, videoHealth, "AVANTIQO_VIDEO_WAN22_INFRA_VIDEO");

const imageStableBefore = imageLockStableFields(image);
const videoStableBefore = stableVideoFields(video);
const resizeRequired = currentSizeGb < TARGET_SIZE_GB;
const attachRequired = !sameSet(endpointVolumeIds(video), [volumeId]);
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: mainSha,
  image_v9_lock_verified: true,
  shared_volume_policy_compliant: true,
  shared_volume: {
    id: volumeId,
    name: volumeName,
    data_center_id: dataCenterId,
    current_size_gb: currentSizeGb,
    target_size_gb: TARGET_SIZE_GB,
    resize_required: resizeRequired,
  },
  image: {
    ...safeEndpoint(image),
    v9_immutable_image: imageImmutable,
    template_name: text(imageTemplate.name),
    mutation_planned: false,
  },
  cinema: {
    ...safeEndpoint(video),
    current_template_name: text(videoTemplate.name),
    current_template_image: text(videoTemplate.imageName),
    attach_shared_volume_required: attachRequired,
    target_network_volume_ids: [volumeId],
    target_data_center_ids: [dataCenterId],
    workers_max_after_this_step: 0,
  },
  target_foundations_after_cache_step: {
    text_to_video: T2V_MODEL,
    image_to_video: I2V_MODEL,
  },
  safety: {
    image_endpoint_mutation: false,
    image_template_mutation: false,
    cinema_template_mutation: false,
    cinema_scaling_mutation: false,
    provider_jobs_submitted: 0,
    video_generation_submitted: false,
    inference_performed: false,
    model_download_submitted: false,
    production_web_deploy: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
  next_action: apply ? "APPLY_RESIZE_AND_CINEMA_ATTACHMENT" : "APPROVE_RESIZE_AND_CINEMA_ATTACHMENT",
};
console.log(JSON.stringify(plan, null, 2));
if (!apply) {
  console.log("AVANTIQO_VIDEO_WAN22_INFRASTRUCTURE_APPLIED=false");
  process.exit(0);
}

const fresh = await inventory(managementKey);
const freshVolumes = groupCacheVolumes(fresh.volumes, SHARED_GROUP);
if (freshVolumes.length !== 1) throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_FRESH_SHARED_VOLUME_INVALID");
const freshVolume = freshVolumes[0];
if (
  text(freshVolume.id) !== volumeId ||
  text(freshVolume.name) !== volumeName ||
  text(freshVolume.dataCenterId) !== dataCenterId ||
  finite(freshVolume.size ?? freshVolume.sizeGb, 0) !== currentSizeGb
) throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_CONCURRENT_VOLUME_STATE_CHANGED");
const freshImage = resolveEndpoint(fresh.endpoints, text(image.id), new Set([IMAGE_ENDPOINT_NAME]), "AVANTIQO_VIDEO_WAN22_INFRA_FRESH_IMAGE");
const freshVideo = resolveEndpoint(fresh.endpoints, text(video.id), VIDEO_ENDPOINT_NAMES, "AVANTIQO_VIDEO_WAN22_INFRA_FRESH_VIDEO");
const freshImageTemplate = resolveTemplate(freshImage, fresh.templates, "AVANTIQO_VIDEO_WAN22_INFRA_FRESH_IMAGE");
validateImageEndpoint(freshImage, freshImageTemplate, imageImmutable, volumeId);
validateVideoPreCache(freshVideo, volumeId, true);
if (JSON.stringify(imageLockStableFields(freshImage)) !== JSON.stringify(imageStableBefore)) throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_IMAGE_STATE_CHANGED_BEFORE_WRITE");
if (JSON.stringify(stableVideoFields(freshVideo)) !== JSON.stringify(videoStableBefore)) throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_VIDEO_STATE_CHANGED_BEFORE_WRITE");
const [freshImageHealth, freshVideoHealth] = await Promise.all([
  queueHealth(text(freshImage.id), imageCredential.key),
  queueHealth(text(freshVideo.id), videoCredential.key),
]);
assertQuiescent(freshImage, freshImageHealth, "AVANTIQO_VIDEO_WAN22_INFRA_FRESH_IMAGE");
assertQuiescent(freshVideo, freshVideoHealth, "AVANTIQO_VIDEO_WAN22_INFRA_FRESH_VIDEO");

let volumeMutated = false;
let cinemaEndpointMutated = false;
if (resizeRequired) {
  await rest(`/networkvolumes/${encodeURIComponent(volumeId)}/update`, managementKey, {
    method: "POST",
    body: { name: volumeName, size: TARGET_SIZE_GB },
  });
  const verifiedVolume = await rest(`/networkvolumes/${encodeURIComponent(volumeId)}`, managementKey);
  if (
    text(verifiedVolume.id) !== volumeId ||
    text(verifiedVolume.name) !== volumeName ||
    text(verifiedVolume.dataCenterId) !== dataCenterId ||
    finite(verifiedVolume.size ?? verifiedVolume.sizeGb, 0) < TARGET_SIZE_GB
  ) throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_VOLUME_RESIZE_VERIFY_FAILED");
  volumeMutated = true;
  console.log(`AVANTIQO_VIDEO_WAN22_SHARED_VOLUME_RESIZED_GB=${finite(verifiedVolume.size ?? verifiedVolume.sizeGb)}`);
} else {
  console.log("AVANTIQO_VIDEO_WAN22_SHARED_VOLUME_ALREADY_400GB=true");
}

if (attachRequired) {
  await rest(`/endpoints/${encodeURIComponent(text(video.id))}`, managementKey, {
    method: "PATCH",
    body: {
      networkVolumeId: volumeId,
      networkVolumeIds: [volumeId],
      dataCenterIds: [dataCenterId],
    },
  });
  cinemaEndpointMutated = true;
}

const verified = await inventory(managementKey);
const verifiedImage = resolveEndpoint(verified.endpoints, text(image.id), new Set([IMAGE_ENDPOINT_NAME]), "AVANTIQO_VIDEO_WAN22_INFRA_VERIFY_IMAGE");
const verifiedVideo = resolveEndpoint(verified.endpoints, text(video.id), VIDEO_ENDPOINT_NAMES, "AVANTIQO_VIDEO_WAN22_INFRA_VERIFY_VIDEO");
const verifiedImageTemplate = resolveTemplate(verifiedImage, verified.templates, "AVANTIQO_VIDEO_WAN22_INFRA_VERIFY_IMAGE");
const verifiedVideoTemplate = resolveTemplate(verifiedVideo, verified.templates, "AVANTIQO_VIDEO_WAN22_INFRA_VERIFY_VIDEO");
const verifiedGroupVolumes = groupCacheVolumes(verified.volumes, SHARED_GROUP);
if (verifiedGroupVolumes.length !== 1 || finite(verifiedGroupVolumes[0].size ?? verifiedGroupVolumes[0].sizeGb, 0) < TARGET_SIZE_GB) {
  throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_FINAL_VOLUME_VERIFY_FAILED");
}
validateImageEndpoint(verifiedImage, verifiedImageTemplate, imageImmutable, volumeId);
validateVideoPreCache(verifiedVideo, volumeId, true);
if (JSON.stringify(imageLockStableFields(verifiedImage)) !== JSON.stringify(imageStableBefore)) {
  throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_IMAGE_V9_CHANGED_DURING_APPLY");
}
if (JSON.stringify(stableVideoFields(verifiedVideo)) !== JSON.stringify(videoStableBefore)) {
  throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_VIDEO_STABLE_FIELDS_CHANGED_DURING_APPLY");
}
if (!sameSet(endpointVolumeIds(verifiedVideo), [volumeId])) throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_CINEMA_VOLUME_ATTACH_VERIFY_FAILED");
if (!list(verifiedVideo.dataCenterIds).map(text).includes(dataCenterId)) throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_CINEMA_DATACENTER_VERIFY_FAILED");
if (text(verifiedVideoTemplate.id) !== text(videoTemplate.id) || text(verifiedVideoTemplate.imageName) !== text(videoTemplate.imageName)) {
  throw new Error("AVANTIQO_VIDEO_WAN22_INFRA_CINEMA_TEMPLATE_CHANGED_DURING_APPLY");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  main_sha: mainSha,
  shared_volume: {
    id: volumeId,
    name: volumeName,
    data_center_id: dataCenterId,
    final_size_gb: finite(verifiedGroupVolumes[0].size ?? verifiedGroupVolumes[0].sizeGb),
    mutated: volumeMutated,
  },
  image_v9: {
    preserved: true,
    endpoint: safeEndpoint(verifiedImage),
    template_name: text(verifiedImageTemplate.name),
    immutable_image: imageImmutable,
    endpoint_mutated: false,
    template_mutated: false,
  },
  cinema: {
    endpoint: safeEndpoint(verifiedVideo),
    template_name: text(verifiedVideoTemplate.name),
    template_image: text(verifiedVideoTemplate.imageName),
    shared_volume_attached: true,
    endpoint_mutated: cinemaEndpointMutated,
    template_mutated: false,
    workers_max_remains_zero: finite(verifiedVideo.workersMax) === 0,
  },
  provider_jobs_submitted: 0,
  video_generation_submitted: false,
  inference_performed: false,
  model_download_submitted: false,
  production_web_deploy: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  next_action: "CACHE_WAN22_A14B_T2V_AND_I2V_ON_SHARED_VOLUME",
}, null, 2));
console.log("AVANTIQO_VIDEO_WAN22_INFRASTRUCTURE_APPLIED=true");
