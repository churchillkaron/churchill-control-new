import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_VIDEO_WAN22_TEMPLATE_CONVERGENCE_V24";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CINEMA_NAME = "avantiqo-cinema-v1";
const EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const EVIDENCE_CONTRACT = "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V2";
const APPROVAL_ENV = "AVANTIQO_VIDEO_WAN22_TEMPLATE_CONVERGENCE_APPROVED";
const VOLUME_ID = "7pcdebhpga";
const CACHE_MOUNT = "/runpod-volume";
const CACHE_ROOT = "/runpod-volume/huggingface-cache/hub";
const T2V_MODEL = "Wan-AI/Wan2.2-T2V-A14B-Diffusers";
const I2V_MODEL = "Wan-AI/Wan2.2-I2V-A14B-Diffusers";
const CERTIFIED_CAPABILITIES = "ai.video.generate,ai.video.image_to_video";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
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
  return [...new Set([text(endpoint.networkVolumeId), ...list(endpoint.networkVolumeIds).map(text)].filter(Boolean))];
}

function activeManagementWorkers(endpoint = {}) {
  const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return list(endpoint.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase();
    if (status && !terminal.has(status)) return true;
    if (desired && !terminal.has(desired)) return true;
    return !status && !desired;
  });
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
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
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V24_REST");
}

async function queue(endpointId, pathname, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V24_QUEUE");
}

async function queueCredentialWorks(endpointId, key) {
  if (!key) return false;
  try {
    const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
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
  throw new Error("AVANTIQO_VIDEO_V24_QUEUE_CREDENTIAL_NOT_FOUND");
}

function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  const workerCounts = {
    idle: finite(workers.idle, 0),
    initializing: finite(workers.initializing, 0),
    ready: finite(workers.ready, 0),
    running: finite(workers.running, 0),
    throttled: finite(workers.throttled, 0),
    unhealthy: finite(workers.unhealthy, 0),
  };
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: workerCounts,
    worker_total: Object.values(workerCounts).reduce((sum, value) => sum + value, 0),
  };
}

function templateUpdatePayload(template, immutableImage, env) {
  const body = {
    containerDiskInGb: finite(template.containerDiskInGb, 50),
    dockerEntrypoint: Array.isArray(template.dockerEntrypoint) ? template.dockerEntrypoint : [],
    dockerStartCmd: Array.isArray(template.dockerStartCmd) ? template.dockerStartCmd : [],
    env,
    imageName: immutableImage,
    isPublic: template.isPublic === true,
    name: requiredTemplateField(template.name, "AVANTIQO_VIDEO_V24_TEMPLATE_NAME_REQUIRED"),
    ports: Array.isArray(template.ports) ? template.ports : [],
    readme: text(template.readme),
    volumeInGb: finite(template.volumeInGb, 20),
    volumeMountPath: CACHE_MOUNT,
  };
  if (text(template.containerRegistryAuthId)) body.containerRegistryAuthId = text(template.containerRegistryAuthId);
  return body;
}

function requiredTemplateField(value, code) {
  const result = text(value);
  if (!result) throw new Error(code);
  return result;
}

function withoutKeys(env, keys) {
  const skip = new Set(keys);
  return Object.fromEntries(Object.entries(env).filter(([key]) => !skip.has(key)));
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_V24_NODE24_REQUIRED:${process.version}`);
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
if (
  evidence?.success !== true ||
  text(evidence.contract) !== EVIDENCE_CONTRACT ||
  evidence.source_sha_matches_trigger !== true ||
  text(evidence.entrypoint) !== "handler_v3.py" ||
  text(evidence.configured_text_to_video_foundation) !== T2V_MODEL ||
  text(evidence.configured_image_to_video_foundation) !== I2V_MODEL ||
  evidence.partial_snapshot_satisfies_final_worker_fitness !== false
) {
  throw new Error("AVANTIQO_VIDEO_V24_WORKER_IMAGE_EVIDENCE_INVALID");
}
const immutableImage = text(evidence.immutable_image_reference);
if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(immutableImage)) {
  throw new Error("AVANTIQO_VIDEO_V24_IMMUTABLE_IMAGE_INVALID");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const [endpointsRaw, templatesRaw] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
]);
const endpoints = normalizeList(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const templates = normalizeList(templatesRaw, ["templates"]);
if (!endpoints || !templates) throw new Error("AVANTIQO_VIDEO_V24_INVENTORY_INVALID");

const configuredId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
const endpointMatches = configuredId
  ? endpoints.filter((entry) => text(entry?.id) === configuredId && text(entry?.name) === CINEMA_NAME)
  : endpoints.filter((entry) => text(entry?.name) === CINEMA_NAME);
if (endpointMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V24_CINEMA_RESOLUTION_FAILED:${endpointMatches.length}`);
const endpoint = endpointMatches[0];
const endpointId = text(endpoint.id);
const templateId = text(endpoint.templateId || endpoint.template?.id);
if (!templateId) throw new Error("AVANTIQO_VIDEO_V24_TEMPLATE_ID_REQUIRED");
const templateMatches = templates.filter((entry) => text(entry?.id) === templateId);
if (templateMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V24_TEMPLATE_RESOLUTION_FAILED:${templateMatches.length}`);
const template = templateMatches[0];

const consumers = endpoints.filter((entry) => text(entry?.templateId || entry?.template?.id) === templateId);
if (consumers.length !== 1 || text(consumers[0]?.id) !== endpointId) {
  throw new Error(`AVANTIQO_VIDEO_V24_SHARED_TEMPLATE_MUTATION_BLOCKED:${consumers.length}`);
}
if (finite(endpoint.workersMin, -1) !== 0 || finite(endpoint.workersMax, -1) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V24_CINEMA_MUST_REST_0_0:${finite(endpoint.workersMin)}/${finite(endpoint.workersMax)}`);
}
if (!endpointVolumeIds(endpoint).includes(VOLUME_ID)) {
  throw new Error(`AVANTIQO_VIDEO_V24_SHARED_VOLUME_BINDING_REQUIRED:${JSON.stringify(endpointVolumeIds(endpoint))}`);
}
if (activeManagementWorkers(endpoint).length !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V24_ACTIVE_MANAGEMENT_WORKERS_BLOCKED:${activeManagementWorkers(endpoint).length}`);
}

const queueCredential = await selectQueueCredential(endpointId, managementKey);
const healthBefore = healthSummary(await queue(endpointId, "/health", queueCredential.key));
if (healthBefore.jobs.in_queue !== 0 || healthBefore.jobs.in_progress !== 0 || healthBefore.worker_total !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V24_CINEMA_NOT_QUIESCENT:${JSON.stringify(healthBefore)}`);
}

const envBefore = normalizeEnv(template.env);
const TARGET_ENV = Object.freeze({
  AVANTIQO_VIDEO_T2V_MODEL: T2V_MODEL,
  AVANTIQO_VIDEO_I2V_MODEL: I2V_MODEL,
  AVANTIQO_VIDEO_HF_CACHE_ROOT: CACHE_ROOT,
  AVANTIQO_VIDEO_NETWORK_VOLUME_QUOTA_GB: "400",
  AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL: "1",
  AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES: CERTIFIED_CAPABILITIES,
  AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED: "0",
});
const envAfterTarget = { ...envBefore, ...TARGET_ENV };
const targetKeys = Object.keys(TARGET_ENV);
const nonTargetEnvBefore = withoutKeys(envBefore, targetKeys);
const imageBefore = text(template.imageName);
const mountBefore = text(template.volumeMountPath);
const requiresMutation =
  imageBefore !== immutableImage ||
  mountBefore !== CACHE_MOUNT ||
  targetKeys.some((key) => text(envBefore[key]) !== TARGET_ENV[key]);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint: {
    id: endpointId,
    name: CINEMA_NAME,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    network_volume_ids: endpointVolumeIds(endpoint),
  },
  template: {
    id: templateId,
    name: text(template.name),
    unique_consumer_confirmed: true,
    current_image: imageBefore || null,
    target_immutable_image: immutableImage,
    current_volume_mount_path: mountBefore || null,
    target_volume_mount_path: CACHE_MOUNT,
  },
  runtime_contract: {
    target_env: TARGET_ENV,
    required_fitness_models: [T2V_MODEL, I2V_MODEL],
    future_video_models_not_required_by_fitness: true,
  },
  clean_state: healthBefore,
  mutation_required: requiresMutation,
  endpoint_capacity_change: false,
  runpod_job_submission: false,
  gpu_compute: false,
  storage_mutation: false,
  production_web_deploy: false,
  secrets_printed: false,
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_VIDEO_WAN22_TEMPLATE_CONVERGENCE_V24_APPLIED=false");
  process.exit(0);
}

if (requiresMutation) {
  await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
    method: "POST",
    body: templateUpdatePayload(template, immutableImage, envAfterTarget),
  });
}

const [endpointFinal, templateFinal, healthFinalRaw] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  rest(`/templates/${encodeURIComponent(templateId)}`, managementKey),
  queue(endpointId, "/health", queueCredential.key),
]);
const envFinal = normalizeEnv(templateFinal.env);
const healthFinal = healthSummary(healthFinalRaw);

if (text(templateFinal.imageName) !== immutableImage) throw new Error("AVANTIQO_VIDEO_V24_FINAL_IMAGE_BINDING_INVALID");
if (text(templateFinal.volumeMountPath) !== CACHE_MOUNT) throw new Error("AVANTIQO_VIDEO_V24_FINAL_VOLUME_MOUNT_INVALID");
for (const [key, expected] of Object.entries(TARGET_ENV)) {
  if (text(envFinal[key]) !== expected) throw new Error(`AVANTIQO_VIDEO_V24_FINAL_ENV_INVALID:${key}`);
}
if (!sameJson(withoutKeys(envFinal, targetKeys), nonTargetEnvBefore)) {
  throw new Error("AVANTIQO_VIDEO_V24_NON_TARGET_ENV_CHANGED");
}
if (finite(endpointFinal.workersMin, -1) !== 0 || finite(endpointFinal.workersMax, -1) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V24_ENDPOINT_CAPACITY_CHANGED:${finite(endpointFinal.workersMin)}/${finite(endpointFinal.workersMax)}`);
}
if (activeManagementWorkers(endpointFinal).length !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V24_FINAL_MANAGEMENT_WORKERS_PRESENT:${activeManagementWorkers(endpointFinal).length}`);
}
if (healthFinal.jobs.in_queue !== 0 || healthFinal.jobs.in_progress !== 0 || healthFinal.worker_total !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V24_FINAL_QUEUE_NOT_QUIESCENT:${JSON.stringify(healthFinal)}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  template_id: templateId,
  immutable_handler_v3_image_bound: true,
  immutable_image_reference: immutableImage,
  volume_mount_path: CACHE_MOUNT,
  certified_capabilities: CERTIFIED_CAPABILITIES.split(","),
  required_fitness_models: [T2V_MODEL, I2V_MODEL],
  require_cached_model: true,
  certification_execution_enabled: false,
  unrelated_template_env_preserved: true,
  endpoint_workers_min: 0,
  endpoint_workers_max: 0,
  queue_and_workers_zero: true,
  endpoint_capacity_change: false,
  runpod_job_submission: false,
  gpu_compute: false,
  storage_mutation: false,
  production_web_deploy: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_VIDEO_WAN22_TEMPLATE_CONVERGENCE_V24=PASS");
console.log("AVANTIQO_VIDEO_WAN22_TEMPLATE_CONVERGENCE_V24_APPLIED=true");
