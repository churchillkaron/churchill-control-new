import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_VIDEO_WORKER_FITNESS_AUDIT_V23";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CINEMA_NAME = "avantiqo-cinema-v1";
const ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1";
const EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const EVIDENCE_CONTRACT = "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V2";
const EXPECTED_ENTRYPOINT = "handler_v3.py";
const DEFAULT_CERTIFIED_CAPABILITIES = [
  "ai.video.generate",
  "ai.video.image_to_video",
];
const DEFAULTS = Object.freeze({
  t2v: "Wan-AI/Wan2.2-T2V-A14B-Diffusers",
  i2v: "Wan-AI/Wan2.2-I2V-A14B-Diffusers",
  firstLast: "Wan-AI/Wan2.1-FLF2V-14B-720P-diffusers",
  v2v: "Wan-AI/Wan2.1-VACE-14B-diffusers",
  upscale: "caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr",
});
const SAFE_ENV_KEYS = [
  "AVANTIQO_VIDEO_FOUNDATION_MODEL",
  "AVANTIQO_VIDEO_T2V_MODEL",
  "AVANTIQO_VIDEO_I2V_MODEL",
  "AVANTIQO_VIDEO_FIRST_LAST_MODEL",
  "AVANTIQO_VIDEO_V2V_MODEL",
  "AVANTIQO_VIDEO_EDIT_MODEL",
  "AVANTIQO_VIDEO_INPAINT_MODEL",
  "AVANTIQO_VIDEO_UPSCALE_MODEL",
  "AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES",
  "AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL",
  "AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED",
  "AVANTIQO_VIDEO_HF_CACHE_ROOT",
  "AVANTIQO_VIDEO_NETWORK_VOLUME_QUOTA_GB",
];

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const unique = (values) => [...new Set(values.map(text).filter(Boolean))];

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

function parseCapabilities(value) {
  const configured = text(value)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return configured.length ? unique(configured) : [...DEFAULT_CERTIFIED_CAPABILITIES];
}

function effectiveModels(env) {
  const generic = text(env.AVANTIQO_VIDEO_FOUNDATION_MODEL);
  const t2v = text(env.AVANTIQO_VIDEO_T2V_MODEL) || generic || DEFAULTS.t2v;
  const i2v = text(env.AVANTIQO_VIDEO_I2V_MODEL) || generic || DEFAULTS.i2v;
  const firstLast = text(env.AVANTIQO_VIDEO_FIRST_LAST_MODEL) || DEFAULTS.firstLast;
  const v2v = text(env.AVANTIQO_VIDEO_V2V_MODEL) || DEFAULTS.v2v;
  const edit = text(env.AVANTIQO_VIDEO_EDIT_MODEL) || v2v;
  const inpaint = text(env.AVANTIQO_VIDEO_INPAINT_MODEL) || edit || v2v;
  const upscale = text(env.AVANTIQO_VIDEO_UPSCALE_MODEL) || DEFAULTS.upscale;
  return { t2v, i2v, firstLast, v2v, edit, inpaint, extend: i2v, upscale };
}

function requiredModels(capabilities, models) {
  const required = [];
  for (const capability of capabilities) {
    if (capability === "ai.video.generate") required.push(models.t2v);
    else if (capability === "ai.video.image_to_video") required.push(models.i2v);
    else if (capability === "ai.video.first_last_frame_to_video") required.push(models.firstLast);
    else if (capability === "ai.video.video_to_video") required.push(models.v2v);
    else if (capability === "ai.video.edit") required.push(models.edit);
    else if (capability === "ai.video.inpaint") required.push(models.inpaint);
    else if (capability === "ai.video.extend") required.push(models.extend);
    else if (capability === "ai.video.upscale") required.push(models.upscale);
  }
  return unique(required);
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function rest(pathname, key) {
  return readJson(await fetch(`${REST_BASE}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V23_REST");
}

async function queue(endpointId, pathname, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_V23_QUEUE");
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
  throw new Error("AVANTIQO_VIDEO_V23_QUEUE_CREDENTIAL_NOT_FOUND");
}

function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  const normalizedWorkers = {
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
    workers: normalizedWorkers,
    worker_total: Object.values(normalizedWorkers).reduce((sum, value) => sum + value, 0),
  };
}

if (Number(process.versions.node.split(".")[0]) < 24) {
  throw new Error(`AVANTIQO_VIDEO_V23_NODE24_REQUIRED:${process.version}`);
}

const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
if (
  evidence?.success !== true ||
  text(evidence.contract) !== EVIDENCE_CONTRACT ||
  evidence.source_sha_matches_trigger !== true ||
  text(evidence.entrypoint) !== EXPECTED_ENTRYPOINT ||
  text(evidence.engine_contract) !== ENGINE_CONTRACT
) {
  throw new Error("AVANTIQO_VIDEO_V23_WORKER_IMAGE_EVIDENCE_INVALID");
}
const immutableImage = text(evidence.immutable_image_reference);
if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(immutableImage)) {
  throw new Error("AVANTIQO_VIDEO_V23_IMMUTABLE_IMAGE_INVALID");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const [endpointsRaw, templatesRaw] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
]);
const endpoints = normalizeList(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const templates = normalizeList(templatesRaw, ["templates"]);
if (!endpoints || !templates) throw new Error("AVANTIQO_VIDEO_V23_LIST_RESPONSE_INVALID");

const configuredId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
const endpointMatches = configuredId
  ? endpoints.filter((entry) => text(entry?.id) === configuredId && text(entry?.name) === CINEMA_NAME)
  : endpoints.filter((entry) => text(entry?.name) === CINEMA_NAME);
if (endpointMatches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V23_CINEMA_RESOLUTION_FAILED:${endpointMatches.length}`);
const endpoint = endpointMatches[0];
const endpointId = text(endpoint.id);
const templateId = text(endpoint.templateId || endpoint.template?.id);
if (!templateId) throw new Error("AVANTIQO_VIDEO_V23_TEMPLATE_ID_REQUIRED");
let template = object(endpoint.template);
if (!Object.keys(template).length || text(template.id) !== templateId || !Object.keys(normalizeEnv(template.env)).length) {
  const matches = templates.filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) throw new Error(`AVANTIQO_VIDEO_V23_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  template = matches[0];
}

const queueCredential = await selectQueueCredential(endpointId, managementKey);
const health = healthSummary(await queue(endpointId, "/health", queueCredential.key));
const rawEnv = normalizeEnv(template.env);
const safeEnv = Object.fromEntries(
  SAFE_ENV_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(rawEnv, key)).map((key) => [key, text(rawEnv[key]) || null]),
);
const capabilities = parseCapabilities(rawEnv.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES);
const models = effectiveModels(rawEnv);
const fitnessModels = requiredModels(capabilities, models);
const approvedCachedNow = new Set([DEFAULTS.t2v, DEFAULTS.i2v]);
const extraFitnessModels = fitnessModels.filter((model) => !approvedCachedNow.has(model));
const imageMatches = text(template.imageName) === immutableImage;
const capacityClean = finite(endpoint.workersMin, -1) === 0 && finite(endpoint.workersMax, -1) === 0;
const queueClean = health.jobs.in_queue === 0 && health.jobs.in_progress === 0 && health.worker_total === 0;
const requireCachedModel = text(rawEnv.AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL || "1").toLowerCase() not in [];
const requireCachedNormalized = !["0", "false", "no", "off"].includes(text(rawEnv.AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL || "1").toLowerCase());
const certificationExecutionEnabled = ["1", "true", "yes", "on"].includes(text(rawEnv.AVANTIQO_VIDEO_CERTIFICATION_EXECUTION_ENABLED || "0").toLowerCase());

let diagnosis = "RUNTIME_PROBE_SHOULD_BE_FITNESS_ELIGIBLE";
if (!imageMatches) diagnosis = "LIVE_TEMPLATE_IMAGE_DOES_NOT_MATCH_HANDLER_V3_IMMUTABLE_BUILD";
else if (extraFitnessModels.length) diagnosis = "LIVE_TEMPLATE_CERTIFIED_CAPABILITIES_REQUIRE_UNCACHED_FUTURE_MODELS";
else if (!capacityClean || !queueClean) diagnosis = "CINEMA_NOT_CLEAN_RESTING_STATE";

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  endpoint: {
    id: endpointId,
    name: text(endpoint.name),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    template_id: templateId,
    network_volume_id: text(endpoint.networkVolumeId) || null,
  },
  queue: {
    credential_source: queueCredential.source,
    ...health,
  },
  worker_image: {
    evidence_contract: text(evidence.contract),
    entrypoint: text(evidence.entrypoint),
    runtime_revision: text(evidence.runtime_revision),
    immutable_image: immutableImage,
    live_template_image: text(template.imageName) || null,
    exact_match: imageMatches,
  },
  live_template: {
    safe_env: safeEnv,
    certified_capabilities: capabilities,
    require_cached_model: requireCachedNormalized,
    certification_execution_enabled: certificationExecutionEnabled,
  },
  fitness: {
    required_models: fitnessModels,
    known_completed_t2v_i2v_models: [...approvedCachedNow],
    extra_models_beyond_completed_t2v_i2v: extraFitnessModels,
    t2v_i2v_only: extraFitnessModels.length === 0,
    image_match_required: true,
    cuda_required: true,
  },
  clean_state: {
    capacity_0_0: capacityClean,
    queue_and_workers_zero: queueClean,
  },
  diagnosis,
  endpoint_mutation_performed: false,
  template_mutation_performed: false,
  runpod_job_submitted: false,
  gpu_compute_used: false,
  production_web_deploy: false,
  secrets_printed: false,
}, null, 2));
console.log(`AVANTIQO_VIDEO_WORKER_FITNESS_AUDIT_V23=${diagnosis}`);
