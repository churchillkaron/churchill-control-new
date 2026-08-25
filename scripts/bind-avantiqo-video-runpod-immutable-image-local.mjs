import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_RUNPOD_IMMUTABLE_IMAGE_BIND_V1";
const ENDPOINT_NAME = "avantiqo-video-v1";
const RESULT_PATH = "audits/results/avantiqo-video-worker-image.json";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

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

async function readJson(response, prefix) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 800);
    throw new Error(`${prefix}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body ?? {};
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
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "RUNPOD_VIDEO_IMAGE_BIND_REST");
}

async function queueHealth(endpointId, credential) {
  const response = await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, "RUNPOD_VIDEO_IMAGE_BIND_QUEUE");
}

async function endpointBoundTemplates(managementKey) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    managementKey,
  );
  const templates = normalizeListResponse(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_TEMPLATE_LIST_INVALID");
  return templates;
}

function resolveEndpoint(endpoints) {
  const configuredId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
  if (configuredId) {
    const matches = endpoints.filter((entry) => text(entry?.id) === configuredId);
    if (matches.length !== 1) {
      throw new Error(`AVANTIQO_VIDEO_IMAGE_BIND_CONFIGURED_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
    }
    return { endpoint: matches[0], resolution: "CONFIGURED_ID" };
  }
  const matches = endpoints.filter((entry) => text(entry?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_IMAGE_BIND_EXACT_NAME_RESOLUTION_FAILED:${matches.length}`);
  }
  return { endpoint: matches[0], resolution: "EXACT_NAME" };
}

function resolveTemplate(endpoint, templates) {
  const templateId = text(endpoint?.templateId || endpoint?.template?.id);
  if (!templateId) throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_TEMPLATE_ID_REQUIRED");
  const matches = templates.filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_VIDEO_IMAGE_BIND_TEMPLATE_RESOLUTION_FAILED:${matches.length}`);
  }
  return matches[0];
}

function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    version: finite(endpoint.version),
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    network_volume_id: text(endpoint.networkVolumeId) || null,
    network_volume_ids: list(endpoint.networkVolumeIds).map(text).filter(Boolean),
    gpu_type_ids: list(endpoint.gpuTypeIds).map(text).filter(Boolean),
  };
}

function safeTemplate(template = {}) {
  return {
    id: text(template.id) || null,
    name: text(template.name) || null,
    image_name: text(template.imageName) || null,
    registry_auth_configured: Boolean(text(template.containerRegistryAuthId)),
    volume_mount_path: text(template.volumeMountPath) || null,
    env_keys: Object.keys(normalizeEnv(template.env)).sort(),
  };
}

function healthSummary(value = {}) {
  const jobs = object(value.jobs);
  const workers = object(value.workers);
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
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

function templateUpdateBody(template, imageName) {
  const body = {
    containerDiskInGb: Math.max(1, finite(template.containerDiskInGb, 5)),
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
  if (registryAuthId) body.containerRegistryAuthId = registryAuthId;
  if (!body.name) throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_TEMPLATE_NAME_REQUIRED");
  return body;
}

const evidence = JSON.parse(await readFile(RESULT_PATH, "utf8"));
if (evidence?.success !== true || evidence?.contract !== "AVANTIQO_VIDEO_WORKER_IMAGE_RESULT_V1") {
  throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_VALID_IMAGE_EVIDENCE_REQUIRED");
}
if (evidence?.source_sha_matches_trigger !== true) {
  throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_SOURCE_TRIGGER_MATCH_REQUIRED");
}
const immutableImage = text(evidence?.immutable_image_reference);
if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-worker@sha256:[0-9a-f]{64}$/i.test(immutableImage)) {
  throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_IMMUTABLE_REFERENCE_INVALID");
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env.AVANTIQO_VIDEO_IMMUTABLE_IMAGE_BIND_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_VIDEO_IMMUTABLE_IMAGE_BIND_APPROVED=YES_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_AVANTIQO_VIDEO_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
const endpointsRaw = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
const endpoints = normalizeListResponse(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
if (!endpoints) throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_ENDPOINT_LIST_INVALID");
const resolution = resolveEndpoint(endpoints);
const endpoint = resolution.endpoint;
const endpointId = text(endpoint.id);
const templates = await endpointBoundTemplates(managementKey);
const template = resolveTemplate(endpoint, templates);
const templateId = text(template.id);
const consumers = endpoints.filter(
  (entry) => text(entry?.templateId || entry?.template?.id) === templateId,
);
const templateExclusive = consumers.length === 1 && text(consumers[0]?.id) === endpointId;
const health = healthSummary(await queueHealth(endpointId, queueKey));
const mutationRequired = text(template.imageName) !== immutableImage;

const result = {
  success: templateExclusive,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_resolution: resolution.resolution,
  endpoint: safeEndpoint(endpoint),
  template: safeTemplate(template),
  template_consumer_count: consumers.length,
  template_exclusive_to_video_endpoint: templateExclusive,
  health,
  immutable_image: {
    reference: immutableImage,
    digest: text(evidence.image_digest),
    source_sha: text(evidence.source_sha),
    github_run_id: text(evidence.github_run_id),
    entrypoint: text(evidence.entrypoint),
    engine_contract: text(evidence.engine_contract),
  },
  mutation_required: mutationRequired,
  mutation_performed: false,
  provider_job_submitted: false,
  video_generation_submitted: false,
  model_download_submitted: false,
  production_web_deploy: false,
  secrets_in_output: false,
  next_action: mutationRequired
    ? "APPLY_IMMUTABLE_VIDEO_IMAGE_BIND_THEN_RUN_RUNTIME_PROBE"
    : "RUN_RUNTIME_PROBE",
};

if (!apply) {
  console.log(JSON.stringify(result, null, 2));
  if (!result.success) process.exitCode = 2;
  process.exit();
}

if (!templateExclusive) {
  throw new Error(`AVANTIQO_VIDEO_IMAGE_BIND_SHARED_TEMPLATE_BLOCKED:${consumers.length}`);
}
if (health.jobs.in_queue > 0 || health.jobs.in_progress > 0) {
  throw new Error(
    `AVANTIQO_VIDEO_IMAGE_BIND_LIVE_JOBS_BLOCK:in_queue=${health.jobs.in_queue}:in_progress=${health.jobs.in_progress}`,
  );
}
if (!mutationRequired) {
  console.log(JSON.stringify({ ...result, success: true }, null, 2));
  process.exit();
}

await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
  method: "POST",
  body: templateUpdateBody(template, immutableImage),
});

const verifiedEndpoint = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
const verifiedTemplates = await endpointBoundTemplates(managementKey);
const verifiedTemplate = resolveTemplate(verifiedEndpoint, verifiedTemplates);
if (text(verifiedTemplate.imageName) !== immutableImage) {
  throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_VERIFY_IMAGE_FAILED");
}

console.log(JSON.stringify({
  ...result,
  success: true,
  mode: "APPLY",
  endpoint: safeEndpoint(verifiedEndpoint),
  template: safeTemplate(verifiedTemplate),
  mutation_performed: true,
  image_bind_verified: true,
  provider_job_submitted: false,
  video_generation_submitted: false,
  model_download_submitted: false,
  production_web_deploy: false,
  secrets_in_output: false,
  next_action: "RUN_RUNTIME_PROBE_THEN_ONE_BOUNDED_VIDEO_GENERATION",
}, null, 2));
