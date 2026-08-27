import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VOICE_STT_RUNTIME_PROBE_NATIVE_BIND_V1";
const APPROVAL_ENV = "AVANTIQO_VOICE_STT_RUNTIME_PROBE_NATIVE_BIND_APPROVED";
const ENDPOINT_NAME = "avantiqo-voice-stt-v1";
const TARGET_SOURCE_SHA = "889c5e7e64aa20048e0b36edbdefa783eea12c63";
const TARGET_SOURCE_REF = TARGET_SOURCE_SHA.slice(0, 9);
const NATIVE_IMAGE_PREFIX = "registry.runpod.net/churchillkaron-churchill-control-new-main-services-avantiqo-voice-stt-dockerfile:";
const TARGET_IMAGE = `${NATIVE_IMAGE_PREFIX}${TARGET_SOURCE_REF}`;
const SERVICE_PATH = "services/avantiqo-voice-stt";
const SOURCE_LOCK = Object.freeze({
  handler_path: `${SERVICE_PATH}/handler.py`,
  handler_blob_sha: "f525911eaa1678761392c5f556c59c2881da7a9d",
  dockerfile_path: `${SERVICE_PATH}/Dockerfile`,
  dockerfile_blob_sha: "fe1ceb09e246a3ad1d851bbba3aaa3f5822e9d2d",
  requirements_path: `${SERVICE_PATH}/requirements.txt`,
  requirements_blob_sha: "9b1f4d662a7b13b65d192493ed738998d2172698",
});
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const TERMINAL_WORKER_STATUSES = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const approved = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .slice(0, 1000);
}

function runGit(args, { allowStatus1 = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (allowStatus1 && result.status === 1) return { status: 1, stdout: text(result.stdout), stderr: text(result.stderr) };
  if (result.status !== 0) {
    throw new Error(`GIT_${String(args[0] || "COMMAND").toUpperCase()}_FAILED:${redact(result.stderr || result.stdout)}`);
  }
  return { status: 0, stdout: text(result.stdout), stderr: text(result.stderr) };
}

function gitText(args) {
  return runGit(args).stdout;
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

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
        .filter(([key]) => Boolean(key)),
    );
  }
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  }
  return body ?? {};
}

async function rest(pathname, key, options = {}) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VOICE_STT_NATIVE_BIND_REST");
}

async function queueHealth(endpointId, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VOICE_STT_NATIVE_BIND_QUEUE");
}

async function controlWorkers(endpointId, key) {
  const body = await readJson(await fetch(`${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VOICE_STT_NATIVE_BIND_CONTROL");
  return list(body?.workers);
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

function activeControlWorkers(workers) {
  return workers.filter((worker) => {
    if (worker?.isStale === true) return false;
    const status = text(worker?.status || worker?.workerStatus || worker?.runtimeStatus || worker?.desiredStatus).toUpperCase();
    return status && !TERMINAL_WORKER_STATUSES.has(status);
  });
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean))];
}

function endpointPreservationKey(endpoint = {}) {
  return JSON.stringify({
    id: text(endpoint.id),
    name: text(endpoint.name),
    template_id: text(endpoint.templateId || endpoint.template?.id),
    compute_type: text(endpoint.computeType),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true,
    gpu_count: finite(endpoint.gpuCount, 1),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    idle_timeout: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType),
    scaler_value: finite(endpoint.scalerValue),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    network_volume_ids: endpointVolumeIds(endpoint),
    data_center_ids: list(endpoint.dataCenterIds).map(text).filter(Boolean),
    allowed_cuda_versions: list(endpoint.allowedCudaVersions).map(text).filter(Boolean),
    min_cuda_version: text(endpoint.minCudaVersion),
  });
}

function templatePreservationKey(template = {}) {
  return JSON.stringify({
    id: text(template.id),
    name: text(template.name),
    container_disk_gb: finite(template.containerDiskInGb, 0),
    docker_entrypoint: list(template.dockerEntrypoint),
    docker_start_cmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    is_public: template.isPublic === true,
    ports: list(template.ports),
    readme: text(template.readme),
    volume_gb: finite(template.volumeInGb, 0),
    volume_mount_path: text(template.volumeMountPath),
  });
}

function templateUpdateBody(template, imageName) {
  const name = text(template.name);
  if (!name) throw new Error("AVANTIQO_VOICE_STT_NATIVE_BIND_TEMPLATE_NAME_REQUIRED");
  return {
    containerDiskInGb: Math.max(1, finite(template.containerDiskInGb, 30)),
    containerRegistryAuthId: "",
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    imageName,
    isPublic: template.isPublic === true,
    name,
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: Math.max(0, finite(template.volumeInGb, 0)),
    volumeMountPath: text(template.volumeMountPath) || "/workspace",
  };
}

function verifyTargetSource() {
  runGit(["fetch", "origin", "main", "--quiet"]);
  const resolved = gitText(["rev-parse", `${TARGET_SOURCE_SHA}^{commit}`]);
  if (resolved !== TARGET_SOURCE_SHA) {
    throw new Error(`AVANTIQO_VOICE_STT_NATIVE_BIND_TARGET_SHA_RESOLUTION_INVALID:${resolved}`);
  }
  const handlerBlob = gitText(["rev-parse", `${TARGET_SOURCE_SHA}:${SOURCE_LOCK.handler_path}`]);
  const dockerfileBlob = gitText(["rev-parse", `${TARGET_SOURCE_SHA}:${SOURCE_LOCK.dockerfile_path}`]);
  const requirementsBlob = gitText(["rev-parse", `${TARGET_SOURCE_SHA}:${SOURCE_LOCK.requirements_path}`]);
  if (handlerBlob !== SOURCE_LOCK.handler_blob_sha) {
    throw new Error(`AVANTIQO_VOICE_STT_NATIVE_BIND_HANDLER_LOCK_INVALID:${handlerBlob}`);
  }
  if (dockerfileBlob !== SOURCE_LOCK.dockerfile_blob_sha) {
    throw new Error(`AVANTIQO_VOICE_STT_NATIVE_BIND_DOCKERFILE_LOCK_INVALID:${dockerfileBlob}`);
  }
  if (requirementsBlob !== SOURCE_LOCK.requirements_blob_sha) {
    throw new Error(`AVANTIQO_VOICE_STT_NATIVE_BIND_REQUIREMENTS_LOCK_INVALID:${requirementsBlob}`);
  }
  const drift = runGit(["diff", "--quiet", TARGET_SOURCE_SHA, "origin/main", "--", SERVICE_PATH], { allowStatus1: true });
  if (drift.status === 1) {
    throw new Error(`AVANTIQO_VOICE_STT_NATIVE_BIND_VOICE_SOURCE_MOVED:target=${TARGET_SOURCE_SHA}:origin=${gitText(["rev-parse", "origin/main"])}`);
  }
  return {
    source_sha: TARGET_SOURCE_SHA,
    source_ref: TARGET_SOURCE_REF,
    handler_blob_sha: handlerBlob,
    dockerfile_blob_sha: dockerfileBlob,
    requirements_blob_sha: requirementsBlob,
    newest_main_voice_equivalent: true,
  };
}

async function inventory(managementKey, queueKey) {
  const [endpointsRaw, templatesRaw] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  ]);
  const endpoints = normalizeList(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const templates = normalizeList(templatesRaw, ["templates"]);
  if (!endpoints || !templates) throw new Error("AVANTIQO_VOICE_STT_NATIVE_BIND_INVENTORY_INVALID");
  const endpointMatches = endpoints.filter((entry) => text(entry?.name) === ENDPOINT_NAME);
  if (endpointMatches.length !== 1) {
    throw new Error(`AVANTIQO_VOICE_STT_NATIVE_BIND_ENDPOINT_RESOLUTION_FAILED:${endpointMatches.length}`);
  }
  const endpoint = endpointMatches[0];
  const endpointId = text(endpoint.id);
  const templateId = text(endpoint.templateId || endpoint.template?.id);
  if (!endpointId || !templateId) throw new Error("AVANTIQO_VOICE_STT_NATIVE_BIND_ENDPOINT_TEMPLATE_REQUIRED");
  const templateMatches = templates.filter((entry) => text(entry?.id) === templateId);
  if (templateMatches.length !== 1) {
    throw new Error(`AVANTIQO_VOICE_STT_NATIVE_BIND_TEMPLATE_RESOLUTION_FAILED:${templateMatches.length}`);
  }
  const consumers = endpoints.filter((entry) => text(entry?.templateId || entry?.template?.id) === templateId);
  const [healthRaw, workers] = await Promise.all([
    queueHealth(endpointId, queueKey),
    controlWorkers(endpointId, managementKey),
  ]);
  return {
    endpoints,
    endpoint,
    endpointId,
    template: templateMatches[0],
    templateId,
    consumers,
    health: healthSummary(healthRaw),
    workers,
  };
}

function assertSafeRest(state) {
  const failures = [];
  if (finite(state.endpoint?.workersMin, -1) !== 0) failures.push("WORKERS_MIN_NOT_ZERO");
  if (finite(state.endpoint?.workersMax, -1) !== 0) failures.push("WORKERS_MAX_NOT_ZERO");
  if (state.health.jobs.in_queue !== 0) failures.push("JOBS_IN_QUEUE");
  if (state.health.jobs.in_progress !== 0) failures.push("JOBS_IN_PROGRESS");
  const workerTotal = Object.values(state.health.workers).reduce((sum, value) => sum + finite(value, 0), 0);
  if (workerTotal !== 0) failures.push(`QUEUE_WORKERS_PRESENT_${workerTotal}`);
  const active = activeControlWorkers(state.workers);
  if (active.length) failures.push(`CONTROL_WORKERS_PRESENT_${active.length}`);
  if (state.consumers.length !== 1 || text(state.consumers[0]?.id) !== state.endpointId) failures.push(`TEMPLATE_NOT_EXCLUSIVE_${state.consumers.length}`);
  if (text(state.template?.containerRegistryAuthId)) failures.push("REGISTRY_AUTH_PRESENT");
  if (list(state.template?.dockerEntrypoint).length) failures.push("DOCKER_ENTRYPOINT_OVERRIDE_PRESENT");
  if (list(state.template?.dockerStartCmd).length) failures.push("DOCKER_START_CMD_OVERRIDE_PRESENT");
  if (failures.length) throw new Error(`AVANTIQO_VOICE_STT_NATIVE_BIND_UNSAFE_STATE:${failures.join(",")}`);
}

const apply = process.argv.includes("--apply");
if (apply && !approved(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_API_KEY) || managementKey;
const source = verifyTargetSource();
const initial = await inventory(managementKey, queueKey);
assertSafeRest(initial);

const originalEndpointKey = endpointPreservationKey(initial.endpoint);
const originalTemplateKey = templatePreservationKey(initial.template);
const currentImage = text(initial.template.imageName);
const mutationRequired = currentImage !== TARGET_IMAGE;

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint: {
    name: ENDPOINT_NAME,
    id_present: true,
    template_id_present: true,
    template_exclusive: true,
    workers_min: finite(initial.endpoint.workersMin),
    workers_max: finite(initial.endpoint.workersMax),
    gpu_type_ids: list(initial.endpoint.gpuTypeIds).map(text).filter(Boolean),
    network_volume_ids: endpointVolumeIds(initial.endpoint),
    data_center_ids: list(initial.endpoint.dataCenterIds).map(text).filter(Boolean),
    allowed_cuda_versions: list(initial.endpoint.allowedCudaVersions).map(text).filter(Boolean),
  },
  image: {
    current: currentImage || null,
    target: TARGET_IMAGE,
    source,
    mutation_required: mutationRequired,
  },
  registry_auth_present_before: false,
  launch_overrides_present_before: false,
  queue_before: initial.health,
  provider_job_submitted: false,
  stt_jobs_submitted: 0,
  transcription_jobs_submitted: 0,
  endpoint_scaling_mutation: false,
  tts_touched: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  next_action: mutationRequired ? "APPLY_NATIVE_BIND_THEN_RUN_ZERO_JOB_PULL_CAPTURE" : "RUN_ZERO_JOB_PULL_CAPTURE",
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

const beforeWrite = await inventory(managementKey, queueKey);
assertSafeRest(beforeWrite);
if (endpointPreservationKey(beforeWrite.endpoint) !== originalEndpointKey) {
  throw new Error("AVANTIQO_VOICE_STT_NATIVE_BIND_ENDPOINT_CHANGED_BEFORE_WRITE");
}
if (templatePreservationKey(beforeWrite.template) !== originalTemplateKey) {
  throw new Error("AVANTIQO_VOICE_STT_NATIVE_BIND_TEMPLATE_CHANGED_BEFORE_WRITE");
}
if (text(beforeWrite.template.imageName) !== currentImage) {
  throw new Error("AVANTIQO_VOICE_STT_NATIVE_BIND_IMAGE_CHANGED_BEFORE_WRITE");
}

if (mutationRequired) {
  await rest(`/templates/${encodeURIComponent(beforeWrite.templateId)}/update`, managementKey, {
    method: "POST",
    body: templateUpdateBody(beforeWrite.template, TARGET_IMAGE),
  });
}

const verified = await inventory(managementKey, queueKey);
assertSafeRest(verified);
if (text(verified.template.imageName) !== TARGET_IMAGE) {
  throw new Error(`AVANTIQO_VOICE_STT_NATIVE_BIND_IMAGE_VERIFY_FAILED:${text(verified.template.imageName) || "MISSING"}`);
}
if (text(verified.template.containerRegistryAuthId)) {
  throw new Error("AVANTIQO_VOICE_STT_NATIVE_BIND_REGISTRY_AUTH_REAPPEARED");
}
if (endpointPreservationKey(verified.endpoint) !== originalEndpointKey) {
  throw new Error("AVANTIQO_VOICE_STT_NATIVE_BIND_ENDPOINT_CONTRACT_NOT_PRESERVED");
}
if (templatePreservationKey(verified.template) !== originalTemplateKey) {
  throw new Error("AVANTIQO_VOICE_STT_NATIVE_BIND_TEMPLATE_CONTRACT_NOT_PRESERVED");
}

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  mutation_performed: mutationRequired,
  verified_image: text(verified.template.imageName),
  verified_registry_auth_present: false,
  verified_workers_min: finite(verified.endpoint.workersMin),
  verified_workers_max: finite(verified.endpoint.workersMax),
  verified_queue: verified.health,
  endpoint_contract_preserved: true,
  template_contract_preserved: true,
  permanent_rest_state: "VOICE_STT_0_0",
  provider_job_submitted: false,
  stt_jobs_submitted: 0,
  transcription_jobs_submitted: 0,
  endpoint_scaling_mutation: false,
  tts_touched: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  next_action: "RUN_ZERO_JOB_PULL_CAPTURE",
}, null, 2));
console.log("AVANTIQO_VOICE_STT_RUNTIME_PROBE_NATIVE_BIND=PASS");
