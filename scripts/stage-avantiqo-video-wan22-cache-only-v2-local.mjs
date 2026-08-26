import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_ONLY_TEMPLATE_STAGE_V2";
const CINEMA_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const IMAGE_NAME = "avantiqo-image-v1";
const EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const IMAGE_LOCK_PATH = "audits/results/avantiqo-image-v9-certification-lock.json";
const VOLUME_ID = "7pcdebhpga";
const VOLUME_NAME = "avantiqo-shared-image-video-cache";
const VOLUME_DC = "US-NC-2";
const VOLUME_MIN_GB = 400;
const CACHE_MOUNT = "/runpod-volume";
const CACHE_ROOT = "/runpod-volume/huggingface-cache/hub";
const T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";
const CACHE_AUTH = "AVANTIQO_VIDEO_WAN22_CACHE_AUTHORIZATION_V1";
const CACHE_COMPLETION = "AVANTIQO_VIDEO_WAN22_CACHE_COMPLETION_V1";

const text = (v) => String(v ?? "").trim();
const list = (v) => Array.isArray(v) ? v : [];
const object = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const finite = (v, fallback = null) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))].sort();
const yes = (v) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(v).toUpperCase());

function shell(name, args, code) {
  const r = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env });
  if (r.status !== 0) throw new Error(`${code}:${text(r.stderr || r.stdout).slice(0, 1000)}`);
  return text(r.stdout);
}
function requireCurrentMain() {
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_CACHE_STAGE_V2_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_CACHE_STAGE_V2_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_V2_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_CACHE_STAGE_V2_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_CACHE_STAGE_V2_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_V2_MAIN_NOT_CURRENT:head=${head}:origin=${remote}`);
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
    const out = normalizeList(value[key], keys, depth + 1);
    if (out) return out;
  }
  return null;
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function sameSet(a, b) {
  const x = unique(a); const y = unique(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
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
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
  };
}
function stableCinema(endpoint = {}) {
  const value = safeEndpoint(endpoint);
  delete value.template_id;
  return value;
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`);
  return body ?? {};
}
async function rest(path, key, options = {}) {
  return readJson(await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_CACHE_STAGE_V2_REST");
}
async function queueHealth(endpointId, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_CACHE_STAGE_V2_QUEUE");
}
function healthSummary(raw = {}) {
  const jobs = object(raw.jobs); const workers = object(raw.workers);
  return {
    jobs: { in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0), in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0) },
    workers: {
      idle: finite(workers.idle, 0), initializing: finite(workers.initializing, 0), ready: finite(workers.ready, 0),
      running: finite(workers.running, 0), throttled: finite(workers.throttled, 0), unhealthy: finite(workers.unhealthy, 0),
    },
  };
}
function liveManagementWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const effective = desired || status;
    return effective && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(effective);
  }).length;
}
function assertCinemaQuiescent(endpoint, raw) {
  const health = healthSummary(raw);
  const count = Object.values(health.workers).reduce((sum, n) => sum + Number(n || 0), 0);
  const management = liveManagementWorkers(endpoint);
  if (health.jobs.in_queue || health.jobs.in_progress || count || management) {
    throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_V2_CINEMA_NOT_QUIESCENT:queue=${health.jobs.in_queue}:progress=${health.jobs.in_progress}:workers=${count}:management=${management}`);
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
  if (!endpoints || !volumes || !templates) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_V2_INVENTORY_INVALID");
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
  if (matches.length !== 1) throw new Error(`${label}_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}
function validateVolume(volumes) {
  const matches = volumes.filter((v) => text(v.id) === VOLUME_ID || text(v.name) === VOLUME_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_V2_VOLUME_RESOLUTION_FAILED:${matches.length}`);
  const volume = matches[0];
  if (text(volume.id) !== VOLUME_ID || text(volume.name) !== VOLUME_NAME || text(volume.dataCenterId) !== VOLUME_DC || finite(volume.size ?? volume.sizeGb, 0) < VOLUME_MIN_GB) {
    throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_V2_VOLUME_INVALID");
  }
  return volume;
}
function validateEvidence(evidence) {
  if (
    evidence?.success !== true || text(evidence.contract) !== "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V2" ||
    text(evidence.entrypoint) !== "handler_v3.py" || text(evidence.configured_text_to_video_foundation) !== T2V_MODEL ||
    text(evidence.configured_image_to_video_foundation) !== I2V_MODEL || text(evidence.cache_authorization_contract) !== CACHE_AUTH ||
    text(evidence.cache_completion_contract) !== CACHE_COMPLETION || Number(evidence.minimum_network_volume_quota_gb_for_cache) !== 400 ||
    evidence.partial_snapshot_satisfies_final_worker_fitness !== false
  ) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_V2_EVIDENCE_INVALID");
  const immutable = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(immutable)) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_V2_IMMUTABLE_INVALID");
  return immutable;
}
function validateImageLock(lock) {
  const immutable = text(lock?.build_evidence?.immutable_image_reference);
  if (lock?.production_certified !== true || text(lock?.status) !== "PRODUCTION_CERTIFIED_NOT_DEPLOYED" || !immutable) {
    throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_V2_IMAGE_LOCK_INVALID");
  }
  return immutable;
}
function validateImage(endpoint, template, immutable) {
  const safe = safeEndpoint(endpoint);
  if (safe.name !== IMAGE_NAME || safe.workers_min !== 0 || safe.workers_max !== 1 || !sameSet(safe.network_volume_ids, [VOLUME_ID]) || text(template.imageName) !== immutable) {
    throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_V2_IMAGE_V9_CHANGED");
  }
}
function validateCinema(endpoint) {
  const safe = safeEndpoint(endpoint);
  if (!CINEMA_NAMES.has(safe.name) || safe.workers_min !== 0 || safe.workers_max !== 0 || !sameSet(safe.network_volume_ids, [VOLUME_ID])) {
    throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_V2_CINEMA_BASE_INVALID");
  }
}
function validateCacheTemplate(template, immutable, expectedName) {
  const env = normalizeEnv(template.env);
  const failures = [];
  if (text(template.name) !== expectedName) failures.push("name");
  if (text(template.imageName) !== immutable) failures.push("image");
  if (text(template.volumeMountPath) !== CACHE_MOUNT) failures.push("volumeMountPath");
  if (template.isServerless !== true) failures.push("isServerless");
  if (text(env.AVANTIQO_VIDEO_T2V_MODEL) !== T2V_MODEL) failures.push("t2v");
  if (text(env.AVANTIQO_VIDEO_I2V_MODEL) !== I2V_MODEL) failures.push("i2v");
  if (text(env.AVANTIQO_VIDEO_HF_CACHE_ROOT) !== CACHE_ROOT) failures.push("cacheRoot");
  if (text(env.AVANTIQO_VIDEO_NETWORK_VOLUME_QUOTA_GB) !== "400") failures.push("quota");
  if (text(env.AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL) !== "0") failures.push("requireCached");
  if (text(env.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES) !== "__cache_only__") failures.push("capabilities");
  if (text(env.AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED) !== "0") failures.push("certExecution");
  if (failures.length) throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_V2_TEMPLATE_INVALID:${failures.join(",")}`);
}
function endpointPatch(endpoint, templateId) {
  const body = {
    templateId,
    computeType: text(endpoint.computeType) || "GPU",
    executionTimeoutMs: finite(endpoint.executionTimeoutMs, 1_800_000),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true,
    gpuCount: finite(endpoint.gpuCount, 1),
    gpuTypeIds: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    idleTimeout: finite(endpoint.idleTimeout, 5),
    name: text(endpoint.name),
    scalerType: text(endpoint.scalerType) || "QUEUE_DELAY",
    scalerValue: finite(endpoint.scalerValue, 4),
    workersMax: 0,
    workersMin: 0,
    networkVolumeId: VOLUME_ID,
  };
  const dcs = list(endpoint.dataCenterIds).map(text).filter(Boolean);
  if (dcs.length) body.dataCenterIds = dcs;
  const cuda = list(endpoint.allowedCudaVersions).map(text).filter(Boolean);
  if (cuda.length) body.allowedCudaVersions = cuda;
  if (text(endpoint.minCudaVersion)) body.minCudaVersion = text(endpoint.minCudaVersion);
  return body;
}

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_V2_NODE24_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_VIDEO_WAN22_CACHE_TEMPLATE_APPROVED)) throw new Error("AVANTIQO_VIDEO_WAN22_CACHE_TEMPLATE_APPROVED=YES_REQUIRED");
const mainSha = requireCurrentMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY || process.env.RUNPOD_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY);
if (!managementKey || !queueKey) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_V2_CREDENTIAL_REQUIRED");
const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
const immutable = validateEvidence(evidence);
const imageLock = JSON.parse(await readFile(IMAGE_LOCK_PATH, "utf8"));
const imageImmutable = validateImageLock(imageLock);
const expectedName = `avantiqo-video-cache-v3-${text(evidence.image_digest).replace("sha256:", "").slice(0, 12)}`;

const initial = await inventory(managementKey);
const volume = validateVolume(initial.volumes);
const image = resolveEndpoint(initial.endpoints, text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_CACHE_STAGE_V2_IMAGE");
const cinema = resolveEndpoint(initial.endpoints, text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID), CINEMA_NAMES, "AVANTIQO_VIDEO_CACHE_STAGE_V2_CINEMA");
const imageTemplate = resolveTemplate(initial.templates, text(image.templateId || image.template?.id), "AVANTIQO_VIDEO_CACHE_STAGE_V2_IMAGE");
validateImage(image, imageTemplate, imageImmutable);
validateCinema(cinema);
const health = assertCinemaQuiescent(cinema, await queueHealth(text(cinema.id), queueKey));
const cinemaBefore = stableCinema(cinema);
const candidates = initial.templates.filter((t) => text(t.name) === expectedName);
if (candidates.length !== 1) throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_V2_EXPECTED_TEMPLATE_COUNT:${candidates.length}`);
const target = candidates[0];
validateCacheTemplate(target, immutable, expectedName);
const targetId = text(target.id);
if (!targetId) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_V2_TARGET_ID_REQUIRED");

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: mainSha,
  recovered_existing_cache_template: true,
  cache_template_id: targetId,
  cache_template_name: expectedName,
  immutable_image: immutable,
  shared_volume: { id: text(volume.id), size_gb: finite(volume.size ?? volume.sizeGb), data_center_id: text(volume.dataCenterId) },
  image_v9_preserved: true,
  cinema: { ...safeEndpoint(cinema), target_template_id: targetId },
  normal_generation_fail_closed: true,
  queue_health: health,
  provider_jobs_submitted: 0,
  model_download_submitted: false,
  video_generation_submitted: false,
  inference_performed: false,
  production_web_deploy: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
}, null, 2));
if (!apply) {
  console.log("AVANTIQO_VIDEO_WAN22_CACHE_ONLY_TEMPLATE_V2_STAGED=false");
  process.exit(0);
}

const fresh = await inventory(managementKey);
validateVolume(fresh.volumes);
const freshImage = resolveEndpoint(fresh.endpoints, text(image.id), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_CACHE_STAGE_V2_FRESH_IMAGE");
const freshCinema = resolveEndpoint(fresh.endpoints, text(cinema.id), CINEMA_NAMES, "AVANTIQO_VIDEO_CACHE_STAGE_V2_FRESH_CINEMA");
const freshImageTemplate = resolveTemplate(fresh.templates, text(freshImage.templateId || freshImage.template?.id), "AVANTIQO_VIDEO_CACHE_STAGE_V2_FRESH_IMAGE");
validateImage(freshImage, freshImageTemplate, imageImmutable);
validateCinema(freshCinema);
if (JSON.stringify(stableCinema(freshCinema)) !== JSON.stringify(cinemaBefore)) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_V2_CINEMA_CHANGED_BEFORE_WRITE");
assertCinemaQuiescent(freshCinema, await queueHealth(text(freshCinema.id), queueKey));
const freshTargets = fresh.templates.filter((t) => text(t.name) === expectedName);
if (freshTargets.length !== 1) throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_V2_FRESH_TEMPLATE_COUNT:${freshTargets.length}`);
validateCacheTemplate(freshTargets[0], immutable, expectedName);

let endpointMutated = false;
if (text(freshCinema.templateId || freshCinema.template?.id) !== targetId) {
  await rest(`/endpoints/${encodeURIComponent(text(freshCinema.id))}`, managementKey, {
    method: "PATCH",
    body: endpointPatch(freshCinema, targetId),
  });
  endpointMutated = true;
}

const verified = await inventory(managementKey);
validateVolume(verified.volumes);
const verifiedImage = resolveEndpoint(verified.endpoints, text(image.id), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_CACHE_STAGE_V2_VERIFY_IMAGE");
const verifiedCinema = resolveEndpoint(verified.endpoints, text(cinema.id), CINEMA_NAMES, "AVANTIQO_VIDEO_CACHE_STAGE_V2_VERIFY_CINEMA");
const verifiedImageTemplate = resolveTemplate(verified.templates, text(verifiedImage.templateId || verifiedImage.template?.id), "AVANTIQO_VIDEO_CACHE_STAGE_V2_VERIFY_IMAGE");
validateImage(verifiedImage, verifiedImageTemplate, imageImmutable);
validateCinema(verifiedCinema);
if (JSON.stringify(stableCinema(verifiedCinema)) !== JSON.stringify(cinemaBefore)) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_V2_CINEMA_STABLE_FIELDS_CHANGED");
if (text(verifiedCinema.templateId || verifiedCinema.template?.id) !== targetId) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_V2_BIND_VERIFY_FAILED");
const verifiedTarget = resolveTemplate(verified.templates, targetId, "AVANTIQO_VIDEO_CACHE_STAGE_V2_VERIFY_TARGET");
validateCacheTemplate(verifiedTarget, immutable, expectedName);
assertCinemaQuiescent(verifiedCinema, await queueHealth(text(verifiedCinema.id), queueKey));

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  cache_template_id: targetId,
  cache_template_name: expectedName,
  immutable_image: immutable,
  recovered_existing_template: true,
  cinema_endpoint_mutated: endpointMutated,
  cinema_workers_min: finite(verifiedCinema.workersMin),
  cinema_workers_max: finite(verifiedCinema.workersMax),
  shared_volume_attached: sameSet(endpointVolumeIds(verifiedCinema), [VOLUME_ID]),
  normal_generation_fail_closed: normalizeEnv(verifiedTarget.env).AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES === "__cache_only__",
  image_v9_preserved: true,
  provider_jobs_submitted: 0,
  model_download_submitted: false,
  video_generation_submitted: false,
  inference_performed: false,
  production_web_deploy: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  next_action: "RUN_CONTROLLED_WAN22_A14B_CACHE_FILL",
}, null, 2));
console.log("AVANTIQO_VIDEO_WAN22_CACHE_ONLY_TEMPLATE_V2_STAGED=true");
