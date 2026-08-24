import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_RUNPOD_IMAGE_REPAIR_V1";
const IMAGE_EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1";
const FOUNDATION_MODEL = "resemble-ai/chatterbox:multilingual-v3";
const REQUIRED_CUDA = "12.4";
const OLD_FAILED_IMAGE = "ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:7f0d0310d4d2904c18fee4eee46b3bd04e928bd1ebe5d5af5adc7b3015247aa2";
const DEFAULT_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA L4",
  "NVIDIA RTX A5000",
  "NVIDIA GeForce RTX 3090",
]);
const DEFAULT_IDLE_TIMEOUT_SECONDS = 10;

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function commaList(value) {
  return text(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

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

function normalizeEnv(value) {
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}

function sameList(left, right) {
  const a = [...left].map(text).filter(Boolean).sort();
  const b = [...right].map(text).filter(Boolean).sort();
  return JSON.stringify(a) === JSON.stringify(b);
}

async function rest(pathname, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1000);
    throw new Error(`RUNPOD_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function queueRequest(endpointId, credential, pathname, options = {}) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || raw).slice(0, 1000);
    throw new Error(`RUNPOD_QUEUE_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function queueHealth(endpointId, credential) {
  return queueRequest(endpointId, credential, "/health");
}

async function purgeQueue(endpointId, credential) {
  return queueRequest(endpointId, credential, "/purge-queue", { method: "POST" });
}

function healthCounters(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
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

function assertNoExecutingWork(health) {
  if (health.jobs.in_progress > 0) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_IMAGE_REPAIR_BLOCKED_IN_PROGRESS_JOBS:in_progress=${health.jobs.in_progress}`,
    );
  }
  if (health.workers.running > 0 || health.workers.throttled > 0) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_IMAGE_REPAIR_BLOCKED_EXECUTING_WORKERS:running=${health.workers.running}:throttled=${health.workers.throttled}`,
    );
  }
}

function assertNoLiveExecution(health) {
  assertNoExecutingWork(health);
  if (health.jobs.in_queue > 0) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_IMAGE_REPAIR_BLOCKED_QUEUED_JOBS:in_queue=${health.jobs.in_queue}`,
    );
  }
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    min_cuda_version: text(endpoint.minCudaVersion) || null,
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    flashboot: endpoint.flashboot === true,
  };
}

function safeTemplate(template = {}) {
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    container_disk_gb: finite(template.containerDiskInGb),
    registry_auth_configured: Boolean(text(template.containerRegistryAuthId)),
    env_keys: Object.keys(normalizeEnv(template.env)).sort(),
    docker_entrypoint: list(template.dockerEntrypoint),
    docker_start_cmd: list(template.dockerStartCmd),
  };
}

function templateStateKey(template = {}) {
  return JSON.stringify({
    id: text(template.id),
    name: text(template.name),
    image_name: text(template.imageName),
    container_disk_gb: finite(template.containerDiskInGb, 0),
    registry_auth_id: text(template.containerRegistryAuthId),
    docker_entrypoint: list(template.dockerEntrypoint),
    docker_start_cmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    ports: list(template.ports),
    readme: text(template.readme),
    volume_gb: finite(template.volumeInGb, 0),
    volume_mount_path: text(template.volumeMountPath),
    is_public: template.isPublic === true,
  });
}

function templateUpdateBody(template, imageName) {
  const body = {
    containerDiskInGb: Math.max(1, finite(template.containerDiskInGb, 30)),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    imageName,
    isPublic: template.isPublic === true,
    name: text(template.name),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: Math.max(0, finite(template.volumeInGb, 0)),
    volumeMountPath: text(template.volumeMountPath) || "/workspace",
  };
  const registryAuthId = text(template.containerRegistryAuthId);
  if (!body.name) throw new Error("AVANTIQO_VOICE_TTS_TEMPLATE_NAME_REQUIRED");
  if (!registryAuthId) throw new Error("AVANTIQO_VOICE_TTS_GHCR_REGISTRY_AUTH_REQUIRED");
  body.containerRegistryAuthId = registryAuthId;
  return body;
}

async function endpointBoundTemplates(managementKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("RUNPOD_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VOICE_TTS_TEMPLATE_ID_REQUIRED");
  const matches = templates.filter((template) => text(template?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_VOICE_TTS_ENDPOINT_BOUND_TEMPLATE_RESOLUTION_FAILED:id=${templateId}:matches=${matches.length}`,
    );
  }
  return matches[0];
}

async function refreshedTtsEvidence() {
  let parsed = null;
  try {
    parsed = JSON.parse(await readFile(IMAGE_EVIDENCE_PATH, "utf8"));
  } catch {
    throw new Error("AVANTIQO_VOICE_WORKER_IMAGE_EVIDENCE_REQUIRED");
  }
  const tts = object(parsed.tts);
  if (parsed?.contract !== "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1") {
    throw new Error("AVANTIQO_VOICE_WORKER_IMAGE_EVIDENCE_CONTRACT_INVALID");
  }
  if (parsed?.success !== true || tts?.success !== true) {
    throw new Error("AVANTIQO_VOICE_TTS_REFRESH_EVIDENCE_NOT_PASSED");
  }
  if (
    tts?.source_sha_matches_trigger !== true ||
    text(tts.source_sha) !== text(parsed.trigger_sha) ||
    tts?.preflight_outcome !== "success" ||
    tts?.build_outcome !== "success" ||
    tts?.startup_probe_outcome !== "success" ||
    tts?.import_smoke_passed_by_docker_build !== true ||
    tts?.container_startup_probe_passed_by_github_build !== true ||
    tts?.bootstrap_breadcrumb_baked !== true ||
    text(tts.image_platform) !== "linux/amd64" ||
    text(tts.foundation_model) !== FOUNDATION_MODEL ||
    text(tts.cuda_runtime_expected) !== REQUIRED_CUDA ||
    parsed?.production_web_deploy !== false ||
    parsed?.provider_job_submitted !== false ||
    parsed?.pricing_activation_performed !== false
  ) {
    throw new Error("AVANTIQO_VOICE_TTS_REFRESH_RUNTIME_EVIDENCE_INVALID");
  }
  const sourceSha = text(tts.source_sha);
  const image = text(tts.immutable_image_reference);
  if (!/^[a-f0-9]{40}$/i.test(sourceSha)) {
    throw new Error("AVANTIQO_VOICE_TTS_REFRESH_SOURCE_SHA_INVALID");
  }
  if (!/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("AVANTIQO_VOICE_TTS_REFRESH_IMMUTABLE_IMAGE_INVALID");
  }
  if (image === OLD_FAILED_IMAGE) {
    throw new Error("AVANTIQO_VOICE_TTS_REFRESH_EVIDENCE_STILL_POINTS_TO_FAILED_IMAGE");
  }
  return {
    image,
    source_sha: sourceSha,
    trigger_sha: text(parsed.trigger_sha),
    github_run_id: text(parsed.github_run_id) || null,
    image_digest: text(tts.image_digest),
  };
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const apply = process.argv.includes("--apply");
const approved =
  text(process.env.AVANTIQO_VOICE_TTS_RUNPOD_IMAGE_REPAIR_APPROVED).toUpperCase() === "YES";
if (apply && !approved) {
  throw new Error("AVANTIQO_VOICE_TTS_RUNPOD_IMAGE_REPAIR_APPROVED=YES_REQUIRED");
}

const configuredGpuTypeIds = commaList(process.env.AVANTIQO_VOICE_TTS_GPU_TYPE_IDS);
const desiredGpuTypeIds = configuredGpuTypeIds.length
  ? configuredGpuTypeIds.slice(0, 3)
  : [...DEFAULT_GPU_TYPE_IDS];
const desiredIdleTimeout = Math.max(
  1,
  Math.min(3600, finite(process.env.AVANTIQO_VOICE_TTS_IDLE_TIMEOUT_SECONDS, DEFAULT_IDLE_TIMEOUT_SECONDS)),
);

const evidence = await refreshedTtsEvidence();
const [endpoint, templates, allEndpointsRaw, healthRaw] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  endpointBoundTemplates(managementKey),
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  queueHealth(endpointId, managementKey),
]);
if (text(endpoint.id) !== endpointId || text(endpoint.name) !== ENDPOINT_NAME) {
  throw new Error("AVANTIQO_VOICE_TTS_ENDPOINT_BINDING_MISMATCH");
}
const allEndpoints = normalizeListResponse(allEndpointsRaw, ["endpoints", "serverlessEndpoints"]);
if (!allEndpoints) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
const template = resolveTemplate(endpoint, templates);
const templateId = text(template.id);
const templateConsumers = allEndpoints.filter(
  (candidate) => text(candidate?.templateId || candidate?.template?.id) === templateId,
);
const templateExclusive =
  templateConsumers.length === 1 && text(templateConsumers[0]?.id) === endpointId;
const health = healthCounters(healthRaw);
const currentGpuTypeIds = list(endpoint.gpuTypeIds).map(text).filter(Boolean);
const imageChangeRequired = text(template.imageName) !== evidence.image;
const endpointPatch = {};
if (text(endpoint.minCudaVersion) !== REQUIRED_CUDA) endpointPatch.minCudaVersion = REQUIRED_CUDA;
if (!sameList(currentGpuTypeIds, desiredGpuTypeIds)) endpointPatch.gpuTypeIds = desiredGpuTypeIds;
if (finite(endpoint.workersMin, 0) !== 0) endpointPatch.workersMin = 0;
if (finite(endpoint.workersMax, 0) !== 1) endpointPatch.workersMax = 1;
if (finite(endpoint.idleTimeout, 0) !== desiredIdleTimeout) endpointPatch.idleTimeout = desiredIdleTimeout;
const endpointChangeRequired = Object.keys(endpointPatch).length > 0;
const staleQueueDetected = health.jobs.in_queue > 0;

const plan = {
  success: templateExclusive,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint: safeEndpoint(endpoint),
  template: safeTemplate(template),
  health,
  template_consumer_count: templateConsumers.length,
  template_exclusive_to_tts_endpoint: templateExclusive,
  immutable_tts_image: {
    reference: evidence.image,
    source_sha: evidence.source_sha,
    trigger_sha: evidence.trigger_sha,
    github_run_id: evidence.github_run_id,
    image_digest: evidence.image_digest,
    platform: "linux/amd64",
    github_container_startup_probe_passed: true,
    bootstrap_breadcrumb_baked: true,
  },
  failed_image_rejected: OLD_FAILED_IMAGE,
  desired_endpoint: {
    min_cuda_version: REQUIRED_CUDA,
    gpu_type_ids: desiredGpuTypeIds,
    workers_min: 0,
    workers_max: 1,
    idle_timeout_seconds: desiredIdleTimeout,
  },
  image_change_required: imageChangeRequired,
  endpoint_change_required: endpointChangeRequired,
  endpoint_patch_fields: Object.keys(endpointPatch),
  stale_queue_detected: staleQueueDetected,
  stale_queue_purge_allowed_only_when_no_execution: true,
  mutation_required: imageChangeRequired || endpointChangeRequired || staleQueueDetected,
  mutation_performed: false,
  queue_purged: false,
  queue_removed_count: 0,
  broken_nonexecuting_workers_may_be_replaced: true,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  next_action: imageChangeRequired || endpointChangeRequired || staleQueueDetected
    ? "APPLY_TTS_IMAGE_REPAIR_THEN_RUN_READ_ONLY_STARTUP_DIAGNOSTIC"
    : "RUN_READ_ONLY_TTS_STARTUP_DIAGNOSTIC",
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  if (!templateExclusive) process.exitCode = 2;
  process.exit();
}

if (!templateExclusive) {
  throw new Error(`AVANTIQO_VOICE_TTS_SHARED_TEMPLATE_REPAIR_BLOCKED:consumers=${templateConsumers.length}`);
}
assertNoExecutingWork(health);

let queuePurged = false;
let queueRemovedCount = 0;
if (health.jobs.in_queue > 0) {
  const purge = await purgeQueue(endpointId, managementKey);
  queuePurged = true;
  queueRemovedCount = finite(purge?.removed, health.jobs.in_queue);
  const postPurgeHealth = healthCounters(await queueHealth(endpointId, managementKey));
  assertNoLiveExecution(postPurgeHealth);
}

const freshEvidence = await refreshedTtsEvidence();
if (
  freshEvidence.image !== evidence.image ||
  freshEvidence.source_sha !== evidence.source_sha ||
  freshEvidence.trigger_sha !== evidence.trigger_sha
) {
  throw new Error("AVANTIQO_VOICE_TTS_IMAGE_EVIDENCE_CHANGED_REPLAN_REQUIRED");
}

const [freshEndpoint, freshTemplates, freshAllEndpointsRaw, freshHealthRaw] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  endpointBoundTemplates(managementKey),
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  queueHealth(endpointId, managementKey),
]);
if (text(freshEndpoint.id) !== endpointId || text(freshEndpoint.name) !== ENDPOINT_NAME) {
  throw new Error("AVANTIQO_VOICE_TTS_ENDPOINT_CHANGED_REPLAN_REQUIRED");
}
const freshTemplate = resolveTemplate(freshEndpoint, freshTemplates);
if (text(freshTemplate.id) !== templateId) {
  throw new Error("AVANTIQO_VOICE_TTS_TEMPLATE_CHANGED_REPLAN_REQUIRED");
}
if (templateStateKey(freshTemplate) !== templateStateKey(template)) {
  throw new Error("AVANTIQO_VOICE_TTS_TEMPLATE_CONTENT_CHANGED_REPLAN_REQUIRED");
}
const freshAllEndpoints = normalizeListResponse(
  freshAllEndpointsRaw,
  ["endpoints", "serverlessEndpoints"],
);
if (!freshAllEndpoints) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
const freshConsumers = freshAllEndpoints.filter(
  (candidate) => text(candidate?.templateId || candidate?.template?.id) === templateId,
);
if (freshConsumers.length !== 1 || text(freshConsumers[0]?.id) !== endpointId) {
  throw new Error(`AVANTIQO_VOICE_TTS_SHARED_TEMPLATE_CHANGED_REPLAN_REQUIRED:consumers=${freshConsumers.length}`);
}
assertNoLiveExecution(healthCounters(freshHealthRaw));

let mutationPerformed = queuePurged;
if (text(freshTemplate.imageName) !== evidence.image) {
  await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
    method: "POST",
    body: templateUpdateBody(freshTemplate, evidence.image),
  });
  mutationPerformed = true;
}

const freshGpuTypeIds = list(freshEndpoint.gpuTypeIds).map(text).filter(Boolean);
const freshPatch = {};
if (text(freshEndpoint.minCudaVersion) !== REQUIRED_CUDA) freshPatch.minCudaVersion = REQUIRED_CUDA;
if (!sameList(freshGpuTypeIds, desiredGpuTypeIds)) freshPatch.gpuTypeIds = desiredGpuTypeIds;
if (finite(freshEndpoint.workersMin, 0) !== 0) freshPatch.workersMin = 0;
if (finite(freshEndpoint.workersMax, 0) !== 1) freshPatch.workersMax = 1;
if (finite(freshEndpoint.idleTimeout, 0) !== desiredIdleTimeout) freshPatch.idleTimeout = desiredIdleTimeout;
if (Object.keys(freshPatch).length) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: freshPatch,
  });
  mutationPerformed = true;
}

const [verifiedEndpoint, verifiedTemplates, verifiedHealthRaw] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  endpointBoundTemplates(managementKey),
  queueHealth(endpointId, managementKey),
]);
const verifiedTemplate = resolveTemplate(verifiedEndpoint, verifiedTemplates);
const verifiedGpuTypeIds = list(verifiedEndpoint.gpuTypeIds).map(text).filter(Boolean);
const verifiedHealth = healthCounters(verifiedHealthRaw);
if (text(verifiedTemplate.imageName) !== evidence.image) {
  throw new Error("AVANTIQO_VOICE_TTS_IMAGE_REPAIR_VERIFY_IMAGE_FAILED");
}
if (text(verifiedEndpoint.minCudaVersion) !== REQUIRED_CUDA) {
  throw new Error("AVANTIQO_VOICE_TTS_IMAGE_REPAIR_VERIFY_CUDA_FAILED");
}
if (!sameList(verifiedGpuTypeIds, desiredGpuTypeIds)) {
  throw new Error("AVANTIQO_VOICE_TTS_IMAGE_REPAIR_VERIFY_GPU_POOL_FAILED");
}
if (finite(verifiedEndpoint.workersMin, 0) !== 0 || finite(verifiedEndpoint.workersMax, 0) !== 1) {
  throw new Error("AVANTIQO_VOICE_TTS_IMAGE_REPAIR_VERIFY_SCALING_FAILED");
}
if (finite(verifiedEndpoint.idleTimeout, 0) !== desiredIdleTimeout) {
  throw new Error("AVANTIQO_VOICE_TTS_IMAGE_REPAIR_VERIFY_IDLE_TIMEOUT_FAILED");
}
assertNoLiveExecution(verifiedHealth);

console.log(JSON.stringify({
  ...plan,
  success: true,
  mode: "APPLY",
  endpoint: safeEndpoint(verifiedEndpoint),
  template: safeTemplate(verifiedTemplate),
  health_after: verifiedHealth,
  mutation_performed: mutationPerformed,
  queue_purged: queuePurged,
  queue_removed_count: queueRemovedCount,
  generation_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  next_action: "RUN_READ_ONLY_TTS_STARTUP_DIAGNOSTIC_AND_REQUIRE_BOOTSTRAP_BREADCRUMB_BEFORE_SMOKE",
}, null, 2));