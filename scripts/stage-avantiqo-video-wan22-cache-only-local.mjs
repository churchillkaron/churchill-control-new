import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_ONLY_TEMPLATE_STAGE_V1";
const ENDPOINT_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const IMAGE_NAME = "avantiqo-image-v1";
const VIDEO_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const IMAGE_LOCK_PATH = "audits/results/avantiqo-image-v9-certification-lock.json";
const EVIDENCE_CONTRACT = "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V2";
const EVIDENCE_REVISION = "AVANTIQO_VIDEO_WORKER_IMAGE_V3_WAN22_A14B_DEFAULT_ROUTING_CACHE_V2";
const ENTRYPOINT = "handler_v3.py";
const ENTRYPOINT_REVISION = "AVANTIQO_VIDEO_HANDLER_V3_WAN22_A14B_DEFAULT_ROUTING_V1";
const RUNTIME_REVISION = "AVANTIQO_VIDEO_WAN22_A14B_DEFAULT_ROUTING_CACHE_V1";
const ROUTING_CONTRACT = "AVANTIQO_VIDEO_WAN22_A14B_DEFAULT_GENERATION_ROUTING_V1";
const CACHE_AUTHORIZATION_CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_AUTHORIZATION_V1";
const CACHE_COMPLETION_CONTRACT = "AVANTIQO_VIDEO_WAN22_CACHE_COMPLETION_V1";
const T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";
const VOLUME_ID = "7pcdebhpga";
const VOLUME_NAME = "avantiqo-shared-image-video-cache";
const VOLUME_DATA_CENTER = "US-NC-2";
const VOLUME_MIN_GB = 400;
const CACHE_ROOT = "/runpod-volume/huggingface-cache/hub";
const CACHE_VOLUME_MOUNT = "/runpod-volume";

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
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
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_VIDEO_CACHE_STAGE_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_VIDEO_CACHE_STAGE_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_VIDEO_CACHE_STAGE_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_VIDEO_CACHE_STAGE_REMOTE_FAILED");
  if (head !== remote) throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_MAIN_NOT_CURRENT:head=${head}:origin=${remote}`);
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
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs ?? endpoint.executionTimeout),
  };
}
function stableCinemaFields(endpoint = {}) {
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
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "AVANTIQO_VIDEO_CACHE_STAGE_REST");
}
async function queueHealth(endpointId, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_CACHE_STAGE_QUEUE");
}
function healthSummary(raw = {}) {
  const jobs = object(raw.jobs);
  const workers = object(raw.workers);
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
function liveManagementWorkers(endpoint = {}) {
  return list(endpoint.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const value = desired || status;
    return Boolean(value && !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(value));
  }).length;
}
function assertCinemaQuiescent(endpoint, raw) {
  const health = healthSummary(raw);
  const workers = Object.values(health.workers).reduce((sum, value) => sum + Number(value || 0), 0);
  const management = liveManagementWorkers(endpoint);
  if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0 || workers !== 0 || management !== 0) {
    throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_CINEMA_NOT_QUIESCENT:queue=${health.jobs.in_queue}:progress=${health.jobs.in_progress}:workers=${workers}:management=${management}`);
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
  if (!endpoints || !volumes || !templates) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_INVENTORY_INVALID");
  return { endpoints, volumes, templates };
}
function resolveEndpoint(endpoints, configuredId, names, label) {
  const matches = configuredId
    ? endpoints.filter((entry) => text(entry.id) === configuredId && names.has(text(entry.name)))
    : endpoints.filter((entry) => names.has(text(entry.name)));
  if (matches.length !== 1) throw new Error(`${label}_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}
function resolveTemplate(templates, templateId, label) {
  const matches = templates.filter((entry) => text(entry.id) === templateId);
  if (matches.length !== 1) throw new Error(`${label}_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}
function validateVideoEvidence(evidence) {
  if (
    evidence?.success !== true ||
    text(evidence.contract) !== EVIDENCE_CONTRACT ||
    text(evidence.evidence_revision) !== EVIDENCE_REVISION ||
    evidence.source_sha_matches_trigger !== true ||
    text(evidence.entrypoint) !== ENTRYPOINT ||
    text(evidence.entrypoint_revision) !== ENTRYPOINT_REVISION ||
    text(evidence.runtime_revision) !== RUNTIME_REVISION ||
    text(evidence.default_generation_routing_contract) !== ROUTING_CONTRACT ||
    evidence.default_generation_routing_enabled !== true ||
    text(evidence.configured_text_to_video_foundation) !== T2V_MODEL ||
    text(evidence.configured_image_to_video_foundation) !== I2V_MODEL ||
    text(evidence.cache_operation) !== "cache_foundation_model" ||
    text(evidence.cache_authorization_contract) !== CACHE_AUTHORIZATION_CONTRACT ||
    text(evidence.cache_completion_contract) !== CACHE_COMPLETION_CONTRACT ||
    Number(evidence.minimum_network_volume_quota_gb_for_cache) !== 400 ||
    evidence.partial_snapshot_satisfies_final_worker_fitness !== false ||
    evidence.provider_job_submitted !== false ||
    evidence.video_generation_submitted !== false ||
    evidence.inference_performed !== false ||
    evidence.model_download_submitted !== false ||
    evidence.runpod_endpoint_mutation_performed !== false ||
    evidence.production_web_deploy !== false
  ) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_V3_EVIDENCE_INVALID");
  const immutable = text(evidence.immutable_image_reference);
  if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(immutable)) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_IMMUTABLE_IMAGE_INVALID");
  return immutable;
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
  ) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_IMAGE_V9_LOCK_INVALID");
  return immutable;
}
function validateVolume(volumes) {
  const matches = volumes.filter((volume) => text(volume.id) === VOLUME_ID || text(volume.name) === VOLUME_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_VOLUME_RESOLUTION_FAILED:${matches.length}`);
  const volume = matches[0];
  const size = finite(volume.size ?? volume.sizeGb, 0);
  if (text(volume.id) !== VOLUME_ID || text(volume.name) !== VOLUME_NAME || text(volume.dataCenterId) !== VOLUME_DATA_CENTER || size < VOLUME_MIN_GB) {
    throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_VOLUME_INVALID:id=${text(volume.id)}:name=${text(volume.name)}:dc=${text(volume.dataCenterId)}:size=${size}`);
  }
  return volume;
}
function validateImage(endpoint, template, immutable) {
  const safe = safeEndpoint(endpoint);
  if (
    safe.name !== IMAGE_NAME ||
    safe.workers_min !== 0 || safe.workers_max !== 1 ||
    !sameSet(safe.network_volume_ids, [VOLUME_ID]) ||
    text(template.imageName) !== immutable ||
    !text(template.name).startsWith("avantiqo-image-immutable-v9-")
  ) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_IMAGE_V9_CHANGED");
}
function validateCinemaBase(endpoint) {
  const safe = safeEndpoint(endpoint);
  if (!ENDPOINT_NAMES.has(safe.name)) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_CINEMA_NAME_INVALID");
  if (safe.workers_min !== 0 || safe.workers_max !== 0) throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_CINEMA_MUST_BE_DISABLED:min=${safe.workers_min}:max=${safe.workers_max}`);
  if (!sameSet(safe.network_volume_ids, [VOLUME_ID])) throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_CINEMA_VOLUME_REQUIRED:${safe.network_volume_ids.join("|") || "NONE"}`);
}
function desiredEnv(baseTemplate) {
  return {
    ...normalizeEnv(baseTemplate.env),
    AVANTIQO_VIDEO_T2V_MODEL: T2V_MODEL,
    AVANTIQO_VIDEO_I2V_MODEL: I2V_MODEL,
    AVANTIQO_VIDEO_HF_CACHE_ROOT: CACHE_ROOT,
    AVANTIQO_VIDEO_NETWORK_VOLUME_QUOTA_GB: "400",
    AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL: "0",
    AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES: "__cache_only__",
    AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED: "0",
    AVANTIQO_VIDEO_CACHE_DOWNLOAD_WORKERS: "2",
  };
}
function templateBody(base, immutable, name) {
  const body = {
    containerDiskInGb: Math.max(1, finite(base.containerDiskInGb, 30)),
    dockerEntrypoint: list(base.dockerEntrypoint),
    dockerStartCmd: list(base.dockerStartCmd),
    env: desiredEnv(base),
    imageName: immutable,
    isPublic: false,
    isServerless: true,
    name,
    ports: list(base.ports),
    readme: "Temporary Avantiqo Cinema V3 cache-only template. Normal Cinema capabilities are fail-closed. Used only to populate the governed Wan2.2 A14B shared cache before final fail-closed runtime binding.",
    volumeInGb: Math.max(0, finite(base.volumeInGb, 0)),
    volumeMountPath: CACHE_VOLUME_MOUNT,
    category: "NVIDIA",
  };
  const registryAuth = text(base.containerRegistryAuthId);
  if (registryAuth) body.containerRegistryAuthId = registryAuth;
  return body;
}
function templateMatches(template, immutable, desiredName, base) {
  const env = normalizeEnv(template.env);
  const expected = desiredEnv(base);
  return (
    text(template.name) === desiredName &&
    text(template.imageName) === immutable &&
    text(template.volumeMountPath) === CACHE_VOLUME_MOUNT &&
    template.isServerless === true &&
    Object.entries(expected).every(([key, value]) => text(env[key]) === text(value))
  );
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
  const dataCenters = list(endpoint.dataCenterIds).map(text).filter(Boolean);
  if (dataCenters.length) body.dataCenterIds = dataCenters;
  const cuda = list(endpoint.allowedCudaVersions).map(text).filter(Boolean);
  if (cuda.length) body.allowedCudaVersions = cuda;
  if (text(endpoint.minCudaVersion)) body.minCudaVersion = text(endpoint.minCudaVersion);
  return body;
}

if (Number(process.versions.node.split(".")[0]) < 24) throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_NODE24_REQUIRED:${process.version}`);
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_VIDEO_WAN22_CACHE_TEMPLATE_APPROVED)) throw new Error("AVANTIQO_VIDEO_WAN22_CACHE_TEMPLATE_APPROVED=YES_REQUIRED");
const mainSha = requireCurrentMain();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY || process.env.RUNPOD_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY);
if (!managementKey || !queueKey) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_RUNPOD_CREDENTIAL_REQUIRED");
const evidence = JSON.parse(await readFile(VIDEO_EVIDENCE_PATH, "utf8"));
const immutable = validateVideoEvidence(evidence);
const imageLock = JSON.parse(await readFile(IMAGE_LOCK_PATH, "utf8"));
const imageImmutable = validateImageLock(imageLock);
const shortDigest = text(evidence.image_digest).replace("sha256:", "").slice(0, 12);
const desiredName = `avantiqo-video-cache-v3-${shortDigest}`;

const initial = await inventory(managementKey);
const volume = validateVolume(initial.volumes);
const image = resolveEndpoint(initial.endpoints, text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_CACHE_STAGE_IMAGE");
const cinema = resolveEndpoint(initial.endpoints, text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID), ENDPOINT_NAMES, "AVANTIQO_VIDEO_CACHE_STAGE_CINEMA");
const imageTemplate = resolveTemplate(initial.templates, text(image.templateId || image.template?.id), "AVANTIQO_VIDEO_CACHE_STAGE_IMAGE");
const currentTemplate = resolveTemplate(initial.templates, text(cinema.templateId || cinema.template?.id), "AVANTIQO_VIDEO_CACHE_STAGE_CINEMA");
validateImage(image, imageTemplate, imageImmutable);
validateCinemaBase(cinema);
const health = assertCinemaQuiescent(cinema, await queueHealth(text(cinema.id), queueKey));
const cinemaBefore = stableCinemaFields(cinema);

const namedTemplates = initial.templates.filter((entry) => text(entry.name) === desiredName);
if (namedTemplates.length > 1) throw new Error(`AVANTIQO_VIDEO_CACHE_STAGE_DUPLICATE_CACHE_TEMPLATES:${namedTemplates.length}`);
if (namedTemplates.length === 1 && !templateMatches(namedTemplates[0], immutable, desiredName, currentTemplate)) {
  throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_EXISTING_TEMPLATE_CONTRACT_MISMATCH");
}
const existingTemplate = namedTemplates[0] || null;

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: mainSha,
  immutable_v3: {
    image: immutable,
    source_sha: text(evidence.source_sha),
    github_run_id: text(evidence.github_run_id),
    entrypoint: ENTRYPOINT,
    runtime_revision: RUNTIME_REVISION,
    text_to_video_model: T2V_MODEL,
    image_to_video_model: I2V_MODEL,
  },
  shared_volume: {
    id: text(volume.id),
    name: text(volume.name),
    size_gb: finite(volume.size ?? volume.sizeGb),
    data_center_id: text(volume.dataCenterId),
  },
  image_v9: { preserved: true, endpoint: safeEndpoint(image), template_name: text(imageTemplate.name) },
  cinema: {
    endpoint: safeEndpoint(cinema),
    current_template_name: text(currentTemplate.name),
    target_cache_template_name: desiredName,
    target_template_already_exists: Boolean(existingTemplate),
    target_volume_mount_path: CACHE_VOLUME_MOUNT,
    target_workers_min: 0,
    target_workers_max: 0,
  },
  cache_only_policy: {
    certified_capabilities_env: "__cache_only__",
    certification_execution_enabled: false,
    require_cached_model_during_cache_fill: false,
    normal_generation_fail_closed: true,
    cache_authorization_contract: CACHE_AUTHORIZATION_CONTRACT,
    cache_completion_contract: CACHE_COMPLETION_CONTRACT,
  },
  queue_health: health,
  safety: {
    provider_jobs_submitted: 0,
    model_download_submitted: false,
    video_generation_submitted: false,
    inference_performed: false,
    image_endpoint_mutation: false,
    production_web_deploy: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
  next_action: apply ? "CREATE_OR_BIND_CACHE_ONLY_V3_TEMPLATE" : "APPROVE_CACHE_ONLY_V3_TEMPLATE_STAGE",
}, null, 2));
if (!apply) {
  console.log("AVANTIQO_VIDEO_WAN22_CACHE_ONLY_TEMPLATE_STAGED=false");
  process.exit(0);
}

const fresh = await inventory(managementKey);
validateVolume(fresh.volumes);
const freshImage = resolveEndpoint(fresh.endpoints, text(image.id), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_CACHE_STAGE_FRESH_IMAGE");
const freshCinema = resolveEndpoint(fresh.endpoints, text(cinema.id), ENDPOINT_NAMES, "AVANTIQO_VIDEO_CACHE_STAGE_FRESH_CINEMA");
const freshImageTemplate = resolveTemplate(fresh.templates, text(freshImage.templateId || freshImage.template?.id), "AVANTIQO_VIDEO_CACHE_STAGE_FRESH_IMAGE");
const freshCinemaTemplate = resolveTemplate(fresh.templates, text(freshCinema.templateId || freshCinema.template?.id), "AVANTIQO_VIDEO_CACHE_STAGE_FRESH_CINEMA");
validateImage(freshImage, freshImageTemplate, imageImmutable);
validateCinemaBase(freshCinema);
if (JSON.stringify(stableCinemaFields(freshCinema)) !== JSON.stringify(cinemaBefore)) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_CINEMA_CHANGED_BEFORE_WRITE");
assertCinemaQuiescent(freshCinema, await queueHealth(text(freshCinema.id), queueKey));

let targetTemplate = fresh.templates.find((entry) => text(entry.name) === desiredName) || null;
let templateCreated = false;
if (targetTemplate) {
  if (!templateMatches(targetTemplate, immutable, desiredName, freshCinemaTemplate)) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_FRESH_TEMPLATE_CONTRACT_MISMATCH");
} else {
  targetTemplate = await rest("/templates", managementKey, {
    method: "POST",
    body: templateBody(freshCinemaTemplate, immutable, desiredName),
  });
  templateCreated = true;
}
const targetTemplateId = text(targetTemplate.id);
if (!targetTemplateId) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_TARGET_TEMPLATE_ID_REQUIRED");
if (!templateMatches(targetTemplate, immutable, desiredName, freshCinemaTemplate)) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_TARGET_TEMPLATE_VERIFY_FAILED");

let endpointMutated = false;
if (text(freshCinema.templateId || freshCinema.template?.id) !== targetTemplateId) {
  await rest(`/endpoints/${encodeURIComponent(text(freshCinema.id))}`, managementKey, {
    method: "PATCH",
    body: endpointPatch(freshCinema, targetTemplateId),
  });
  endpointMutated = true;
}

const verified = await inventory(managementKey);
const verifiedImage = resolveEndpoint(verified.endpoints, text(image.id), new Set([IMAGE_NAME]), "AVANTIQO_VIDEO_CACHE_STAGE_VERIFY_IMAGE");
const verifiedCinema = resolveEndpoint(verified.endpoints, text(cinema.id), ENDPOINT_NAMES, "AVANTIQO_VIDEO_CACHE_STAGE_VERIFY_CINEMA");
const verifiedImageTemplate = resolveTemplate(verified.templates, text(verifiedImage.templateId || verifiedImage.template?.id), "AVANTIQO_VIDEO_CACHE_STAGE_VERIFY_IMAGE");
const verifiedTarget = resolveTemplate(verified.templates, targetTemplateId, "AVANTIQO_VIDEO_CACHE_STAGE_VERIFY_TARGET");
validateImage(verifiedImage, verifiedImageTemplate, imageImmutable);
validateCinemaBase(verifiedCinema);
if (JSON.stringify(stableCinemaFields(verifiedCinema)) !== JSON.stringify(cinemaBefore)) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_CINEMA_STABLE_FIELDS_CHANGED");
if (text(verifiedCinema.templateId || verifiedCinema.template?.id) !== targetTemplateId) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_ENDPOINT_BIND_VERIFY_FAILED");
if (!templateMatches(verifiedTarget, immutable, desiredName, freshCinemaTemplate)) throw new Error("AVANTIQO_VIDEO_CACHE_STAGE_TEMPLATE_FINAL_VERIFY_FAILED");
assertCinemaQuiescent(verifiedCinema, await queueHealth(text(verifiedCinema.id), queueKey));

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  cache_template_id: targetTemplateId,
  cache_template_name: desiredName,
  immutable_image: immutable,
  template_created: templateCreated,
  cinema_endpoint_mutated: endpointMutated,
  cinema_endpoint_id: text(verifiedCinema.id),
  cinema_workers_min: finite(verifiedCinema.workersMin),
  cinema_workers_max: finite(verifiedCinema.workersMax),
  shared_volume_attached: sameSet(endpointVolumeIds(verifiedCinema), [VOLUME_ID]),
  cache_volume_mount_path: text(verifiedTarget.volumeMountPath),
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
console.log("AVANTIQO_VIDEO_WAN22_CACHE_ONLY_TEMPLATE_STAGED=true");
