import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_LIVE_RUNTIME_AUDIT_V1";
const VIDEO_EVIDENCE_PATH = "audits/results/avantiqo-video-worker-image.json";
const VIDEO_EVIDENCE_CONTRACT = "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V1";
const VIDEO_ENDPOINT_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const ENGINE_CONTRACT = "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1";
const DEFAULT_CERTIFIED_CAPABILITIES = [
  "ai.video.generate",
  "ai.video.image_to_video",
];
const SOURCE_DEFAULTS = Object.freeze({
  first_last: "Wan-AI/Wan2.1-FLF2V-14B-720P-diffusers",
  v2v: "Wan-AI/Wan2.1-VACE-14B-diffusers",
  upscale: "caidas/swin2SR-realworld-sr-x4-64-bsrgan-psnr",
});
const SAFE_TEMPLATE_ENV_KEYS = Object.freeze([
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
  "AVANTIQO_VIDEO_DEVICE",
  "AVANTIQO_VIDEO_DTYPE",
  "AVANTIQO_VIDEO_INFERENCE_STEPS",
  "AVANTIQO_VIDEO_GUIDANCE_SCALE",
  "AVANTIQO_VIDEO_EXPORT_QUALITY",
]);

const text = (value) => String(value ?? "").trim();
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value : [];
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
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]),
  );
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

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
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
  }), "AVANTIQO_VIDEO_LIVE_AUDIT_REST");
}

async function queueHealth(endpointId, key) {
  return readJson(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_VIDEO_LIVE_AUDIT_QUEUE");
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

async function selectQueueCredential(endpointId, managementKey) {
  const candidates = [
    text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY)
      ? { source: "RUNPOD_AVANTIQO_VIDEO_API_KEY", key: text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) }
      : null,
    text(process.env.RUNPOD_API_KEY)
      ? { source: "RUNPOD_API_KEY", key: text(process.env.RUNPOD_API_KEY) }
      : null,
    { source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey },
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (await queueCredentialWorks(endpointId, candidate.key)) return candidate;
  }
  throw new Error("AVANTIQO_VIDEO_LIVE_AUDIT_QUEUE_CREDENTIAL_NOT_FOUND");
}

async function anonymousPullProof(reference) {
  const match = text(reference).match(/^ghcr\.io\/(.+)@(sha256:[a-f0-9]{64})$/i);
  if (!match) return { public_pull: false, invalid_reference: true };
  const repository = match[1];
  const digest = match[2];
  try {
    const tokenUrl = new URL("https://ghcr.io/token");
    tokenUrl.searchParams.set("service", "ghcr.io");
    tokenUrl.searchParams.set("scope", `repository:${repository}:pull`);
    const tokenResponse = await fetch(tokenUrl, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    const tokenBody = object(await tokenResponse.json().catch(() => ({})));
    const token = text(tokenBody.token || tokenBody.access_token);
    if (!tokenResponse.ok || !token) {
      return { public_pull: false, token_status: tokenResponse.status, manifest_status: null };
    }
    const manifestResponse = await fetch(
      `https://ghcr.io/v2/${repository}/manifests/${encodeURIComponent(digest)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.oci.image.index.v1+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json",
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
    const contentDigest = text(manifestResponse.headers.get("docker-content-digest"));
    await manifestResponse.arrayBuffer();
    const digestMatches = !contentDigest || contentDigest.toLowerCase() === digest.toLowerCase();
    return {
      public_pull: manifestResponse.ok && digestMatches,
      token_status: tokenResponse.status,
      manifest_status: manifestResponse.status,
      digest_matches: digestMatches,
    };
  } catch (error) {
    return {
      public_pull: false,
      token_status: null,
      manifest_status: null,
      network_error: text(error?.cause?.code || error?.code || error?.message).slice(0, 120),
    };
  }
}

function resolveEndpoint(endpoints) {
  const configuredId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
  if (configuredId) {
    const matches = endpoints.filter((entry) => text(entry?.id) === configuredId);
    if (matches.length !== 1 || !VIDEO_ENDPOINT_NAMES.has(text(matches[0]?.name))) {
      throw new Error(`AVANTIQO_VIDEO_LIVE_AUDIT_CONFIGURED_ENDPOINT_INVALID:${matches.length}`);
    }
    return { endpoint: matches[0], resolution: "CONFIGURED_ID" };
  }
  const matches = endpoints.filter((entry) => VIDEO_ENDPOINT_NAMES.has(text(entry?.name)));
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_LIVE_AUDIT_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  }
  return { endpoint: matches[0], resolution: "CANONICAL_NAME" };
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VIDEO_LIVE_AUDIT_TEMPLATE_ID_REQUIRED");
  const inline = object(endpoint?.template);
  if (Object.keys(inline).length && text(inline.id) === templateId && Object.keys(normalizeEnv(inline.env)).length) {
    return inline;
  }
  const matches = templates.filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_LIVE_AUDIT_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  }
  return matches[0];
}

function safeTemplateEnv(template) {
  const env = normalizeEnv(template?.env);
  return Object.fromEntries(
    SAFE_TEMPLATE_ENV_KEYS
      .filter((key) => Object.prototype.hasOwnProperty.call(env, key))
      .map((key) => [key, text(env[key]) || null]),
  );
}

function parseCapabilities(value, fallback = DEFAULT_CERTIFIED_CAPABILITIES) {
  const configured = text(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return configured.length ? unique(configured) : [...fallback];
}

function effectiveModels(env) {
  const generic = text(env.AVANTIQO_VIDEO_FOUNDATION_MODEL);
  const t2v = text(env.AVANTIQO_VIDEO_T2V_MODEL) || generic;
  const i2v = text(env.AVANTIQO_VIDEO_I2V_MODEL) || generic;
  const firstLast = text(env.AVANTIQO_VIDEO_FIRST_LAST_MODEL) || SOURCE_DEFAULTS.first_last;
  const v2v = text(env.AVANTIQO_VIDEO_V2V_MODEL) || SOURCE_DEFAULTS.v2v;
  const edit = text(env.AVANTIQO_VIDEO_EDIT_MODEL) || v2v;
  const inpaint = text(env.AVANTIQO_VIDEO_INPAINT_MODEL) || edit || v2v;
  const upscale = text(env.AVANTIQO_VIDEO_UPSCALE_MODEL) || SOURCE_DEFAULTS.upscale;
  return {
    generic: generic || null,
    text_to_video: t2v || null,
    image_to_video: i2v || null,
    first_last_frame: firstLast || null,
    video_to_video: v2v || null,
    edit: edit || null,
    inpaint: inpaint || null,
    extend: i2v || null,
    upscale: upscale || null,
  };
}

function localRuntimeConfig() {
  const env = Object.fromEntries(SAFE_TEMPLATE_ENV_KEYS.map((key) => [key, text(process.env[key])]).filter(([, value]) => value));
  return {
    engine_enabled: ["1", "true", "yes", "on"].includes(text(process.env.AVANTIQO_VIDEO_ENGINE_ENABLED).toLowerCase()),
    endpoint_configured: Boolean(text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID)),
    queue_key_configured: Boolean(text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) || text(process.env.RUNPOD_API_KEY)),
    certified_capabilities: parseCapabilities(process.env.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES),
    models: effectiveModels(env),
  };
}

function healthSummary(value = {}) {
  const jobs = object(value.jobs);
  const workers = object(value.workers);
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

function managementSummary(endpoint = {}) {
  const workers = list(endpoint.workers).map((worker) => ({
    desired_status: text(worker?.desiredStatus || worker?.desired_status).toUpperCase() || null,
    status: text(worker?.status || worker?.workerStatus || worker?.runtimeStatus).toUpperCase() || null,
    gpu_type: text(worker?.gpuTypeId || worker?.gpu?.displayName || worker?.machine?.gpuDisplayName) || null,
    data_center_id: text(worker?.dataCenterId || worker?.machine?.dataCenterId) || null,
    cost_per_hr: finite(worker?.costPerHr),
  }));
  return {
    count: workers.length,
    non_exited: workers.filter((worker) => worker.desired_status !== "EXITED").length,
    workers,
  };
}

function endpointVolumeIds(endpoint = {}) {
  return unique([text(endpoint.networkVolumeId), ...list(endpoint.networkVolumeIds).map(text)]);
}

function safeVolume(volume = {}) {
  return {
    id: text(volume.id) || null,
    name: text(volume.name) || null,
    size_gb: finite(volume.size ?? volume.sizeGb),
    data_center_id: text(volume.dataCenterId ?? volume.data_center_id) || null,
  };
}

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (!Number.isFinite(nodeMajor) || nodeMajor < 24) {
  throw new Error(`AVANTIQO_VIDEO_LIVE_AUDIT_NODE24_REQUIRED:actual=${process.version}`);
}

const evidence = JSON.parse(await readFile(VIDEO_EVIDENCE_PATH, "utf8"));
if (
  evidence?.success !== true ||
  text(evidence?.contract) !== VIDEO_EVIDENCE_CONTRACT ||
  evidence?.source_sha_matches_trigger !== true ||
  text(evidence?.entrypoint) !== "handler_v2.py" ||
  text(evidence?.engine_contract) !== ENGINE_CONTRACT ||
  evidence?.provider_job_submitted !== false ||
  evidence?.video_generation_submitted !== false ||
  evidence?.model_download_submitted !== false ||
  evidence?.production_web_deploy !== false
) {
  throw new Error("AVANTIQO_VIDEO_LIVE_AUDIT_BUILD_EVIDENCE_INVALID");
}
const immutableImage = text(evidence.immutable_image_reference);
if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[a-f0-9]{64}$/i.test(immutableImage)) {
  throw new Error("AVANTIQO_VIDEO_LIVE_AUDIT_IMMUTABLE_IMAGE_INVALID");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const [endpointsRaw, templatesRaw, volumesRaw, pullProof] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/networkvolumes", managementKey).catch(() => []),
  anonymousPullProof(immutableImage),
]);
const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const templates = normalizeListResponse(templatesRaw, ["templates"]);
const volumes = normalizeListResponse(volumesRaw, ["networkVolumes", "volumes"]) || [];
if (!endpoints || !templates) throw new Error("AVANTIQO_VIDEO_LIVE_AUDIT_LIST_RESPONSE_INVALID");

const resolved = resolveEndpoint(endpoints);
const endpoint = resolved.endpoint;
const endpointId = text(endpoint.id);
const template = resolveTemplate(endpoint, templates);
const templateEnv = safeTemplateEnv(template);
const workerModels = effectiveModels(templateEnv);
const workerCertifiedCapabilities = parseCapabilities(templateEnv.AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES);
const localConfig = localRuntimeConfig();
const queueCredential = await selectQueueCredential(endpointId, managementKey);
const health = healthSummary(await queueHealth(endpointId, queueCredential.key));
const management = managementSummary(endpoint);
const volumeIds = endpointVolumeIds(endpoint);
const attachedVolumes = volumes.filter((volume) => volumeIds.includes(text(volume?.id))).map(safeVolume);
const templateImage = text(template.imageName);

const checks = {
  immutable_build_matches_live_template: templateImage === immutableImage,
  immutable_image_public_pull: pullProof.public_pull === true,
  t2v_worker_model_configured: Boolean(workerModels.text_to_video),
  i2v_worker_model_configured: Boolean(workerModels.image_to_video),
  t2v_default_certified: workerCertifiedCapabilities.includes("ai.video.generate"),
  i2v_default_certified: workerCertifiedCapabilities.includes("ai.video.image_to_video"),
  cached_model_required: text(templateEnv.AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL || "1").toLowerCase() !== "0" &&
    !["false", "no", "off"].includes(text(templateEnv.AVANTIQO_VIDEO_REQUIRE_CACHED_MODEL || "1").toLowerCase()),
  local_service_runtime_t2v_matches_worker: !localConfig.models.text_to_video || localConfig.models.text_to_video === workerModels.text_to_video,
  local_service_runtime_i2v_matches_worker: !localConfig.models.image_to_video || localConfig.models.image_to_video === workerModels.image_to_video,
  endpoint_has_network_volume: volumeIds.length > 0,
  queue_has_no_active_jobs: health.jobs.in_queue === 0 && health.jobs.in_progress === 0,
  no_unhealthy_workers: health.workers.unhealthy === 0,
};
const hardReady = Object.values(checks).every(Boolean);
const nextAction = !checks.immutable_build_matches_live_template
  ? "REPAIR_VIDEO_IMMUTABLE_TEMPLATE_BINDING"
  : !checks.t2v_worker_model_configured || !checks.i2v_worker_model_configured
    ? "LOCK_VIDEO_T2V_I2V_FOUNDATION_MODELS"
    : !checks.local_service_runtime_t2v_matches_worker || !checks.local_service_runtime_i2v_matches_worker
      ? "CONVERGE_SERVICE_RUNTIME_AND_WORKER_MODEL_CONFIGURATION"
      : !checks.endpoint_has_network_volume
        ? "ATTACH_VIDEO_MODEL_CACHE_VOLUME"
        : "ADD_NON_INFERENCE_VIDEO_RUNTIME_AND_CACHE_PROBE";

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  node: process.version,
  endpoint_resolution: resolved.resolution,
  endpoint: {
    id: endpointId,
    name: text(endpoint.name),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    gpu_count: finite(endpoint.gpuCount),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: finite(endpoint.scalerValue),
    network_volume_ids: volumeIds,
    attached_network_volumes: attachedVolumes,
  },
  live_template: {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: templateImage || null,
    exact_immutable_build_match: templateImage === immutableImage,
    volume_mount_path: text(template.volumeMountPath) || null,
    safe_runtime_env: templateEnv,
  },
  immutable_build_evidence: {
    source_sha: text(evidence.source_sha),
    github_run_id: text(evidence.github_run_id),
    entrypoint: text(evidence.entrypoint),
    engine_contract: text(evidence.engine_contract),
    immutable_image: immutableImage,
    public_pull_proof: pullProof,
    default_certified_capabilities: list(evidence.default_certified_capabilities),
    implemented_extended_capabilities: list(evidence.implemented_extended_capabilities),
  },
  worker_runtime: {
    certified_capabilities: workerCertifiedCapabilities,
    models: workerModels,
    require_cached_model: checks.cached_model_required,
    cache_contents_verified: false,
    cache_verification_status: "REQUIRES_NON_INFERENCE_RUNTIME_PROBE",
  },
  local_service_runtime: localConfig,
  configuration_alignment: {
    t2v: {
      local: localConfig.models.text_to_video,
      worker: workerModels.text_to_video,
      matches_or_local_unspecified: checks.local_service_runtime_t2v_matches_worker,
    },
    i2v: {
      local: localConfig.models.image_to_video,
      worker: workerModels.image_to_video,
      matches_or_local_unspecified: checks.local_service_runtime_i2v_matches_worker,
    },
  },
  queue_health: health,
  management_workers: management,
  checks,
  hard_readiness_pass: hardReady,
  provider_jobs_submitted: 0,
  video_generation_submitted: false,
  inference_performed: false,
  model_download_submitted: false,
  endpoint_mutation_performed: false,
  template_mutation_performed: false,
  production_web_deploy: false,
  pricing_activation_performed: false,
  secrets_in_output: false,
  next_action: nextAction,
}, null, 2));
console.log(`AVANTIQO_VIDEO_LIVE_RUNTIME_AUDIT=${hardReady ? "PASS" : "NEEDS_REPAIR"}`);
console.log(`AVANTIQO_VIDEO_LIVE_RUNTIME_AUDIT_NEXT_ACTION=${nextAction}`);
