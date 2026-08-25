import { readFile } from "node:fs/promises";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VIDEO_RUNPOD_IMMUTABLE_IMAGE_BIND_V2";
const ENDPOINT_NAMES = new Set(["avantiqo-video-v1", "avantiqo-cinema-v1"]);
const RESULT_PATH = "audits/results/avantiqo-video-worker-image.json";
const DEFAULT_DRAIN_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_POLL_MS = 3_000;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function assertEndpointName(endpoint) {
  const name = text(endpoint?.name);
  if (!ENDPOINT_NAMES.has(name)) {
    throw new Error(`AVANTIQO_VIDEO_IMAGE_BIND_ENDPOINT_NAME_INVALID:${name || "MISSING"}`);
  }
}

function resolveEndpoint(endpoints) {
  const configuredId = text(process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID);
  if (configuredId) {
    const matches = endpoints.filter((entry) => text(entry?.id) === configuredId);
    if (matches.length !== 1) {
      throw new Error(`AVANTIQO_VIDEO_IMAGE_BIND_CONFIGURED_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
    }
    assertEndpointName(matches[0]);
    return { endpoint: matches[0], resolution: "CONFIGURED_ID" };
  }
  const matches = endpoints.filter((entry) => ENDPOINT_NAMES.has(text(entry?.name)));
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_VIDEO_IMAGE_BIND_CANONICAL_NAME_RESOLUTION_FAILED:${matches.length}`,
    );
  }
  return { endpoint: matches[0], resolution: "CANONICAL_NAME" };
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
      throttled: finite(workers.throttled, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

function managementSummary(endpoint = {}) {
  const workers = list(endpoint.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    desired_status: text(worker?.desiredStatus || worker?.desired_status).toUpperCase() || null,
    status: text(worker?.status || worker?.workerStatus || worker?.runtimeStatus).toUpperCase() || null,
  }));
  return {
    worker_count: workers.length,
    non_exited_worker_count: workers.filter((worker) => worker.desired_status !== "EXITED").length,
    workers,
  };
}

function drained(snapshot) {
  return (
    snapshot.health.jobs.in_queue === 0 &&
    snapshot.health.jobs.in_progress === 0 &&
    snapshot.health.workers.idle === 0 &&
    snapshot.health.workers.initializing === 0 &&
    snapshot.health.workers.ready === 0 &&
    snapshot.health.workers.running === 0 &&
    snapshot.health.workers.throttled === 0 &&
    snapshot.health.workers.unhealthy === 0 &&
    snapshot.management.non_exited_worker_count === 0
  );
}

function templatePreservationKey(template = {}) {
  return JSON.stringify({
    id: text(template.id),
    name: text(template.name),
    containerDiskInGb: finite(template.containerDiskInGb, 0),
    containerRegistryAuthId: text(template.containerRegistryAuthId),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: finite(template.volumeInGb, 0),
    volumeMountPath: text(template.volumeMountPath),
    isPublic: template.isPublic === true,
  });
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

async function snapshot(managementKey, queueKey, endpointId) {
  const [endpoint, templates, healthRaw] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    endpointBoundTemplates(managementKey),
    queueHealth(endpointId, queueKey),
  ]);
  assertEndpointName(endpoint);
  return {
    endpoint,
    template: resolveTemplate(endpoint, templates),
    health: healthSummary(healthRaw),
    management: managementSummary(endpoint),
  };
}

async function waitForDrain(managementKey, queueKey, endpointId) {
  const timeoutMs = Math.max(
    30_000,
    Math.min(
      10 * 60 * 1000,
      finite(process.env.AVANTIQO_VIDEO_IMAGE_BIND_DRAIN_TIMEOUT_MS, DEFAULT_DRAIN_TIMEOUT_MS),
    ),
  );
  const pollMs = Math.max(
    1_000,
    Math.min(15_000, finite(process.env.AVANTIQO_VIDEO_IMAGE_BIND_POLL_MS, DEFAULT_POLL_MS)),
  );
  const started = Date.now();
  let stable = 0;
  let latest = await snapshot(managementKey, queueKey, endpointId);
  while (Date.now() - started < timeoutMs) {
    if (drained(latest)) {
      stable += 1;
      if (stable >= 2) return latest;
    } else {
      stable = 0;
    }
    console.log(JSON.stringify({
      event: "AVANTIQO_VIDEO_IMAGE_BIND_DRAIN_PROGRESS",
      elapsed_seconds: Math.round((Date.now() - started) / 1000),
      stable_drain_observations: stable,
      health: latest.health,
      management: latest.management,
    }));
    await sleep(pollMs);
    latest = await snapshot(managementKey, queueKey, endpointId);
  }
  throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_DRAIN_TIMEOUT");
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
const endpointId = text(resolution.endpoint.id);
const initial = await snapshot(managementKey, queueKey, endpointId);
const templateId = text(initial.template.id);
const consumers = endpoints.filter(
  (entry) => text(entry?.templateId || entry?.template?.id) === templateId,
);
const templateExclusive = consumers.length === 1 && text(consumers[0]?.id) === endpointId;
const mutationRequired = text(initial.template.imageName) !== immutableImage;

const result = {
  success: templateExclusive,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_resolution: resolution.resolution,
  endpoint: safeEndpoint(initial.endpoint),
  template: safeTemplate(initial.template),
  template_consumer_count: consumers.length,
  template_exclusive_to_video_endpoint: templateExclusive,
  health: initial.health,
  management: initial.management,
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
  endpoint_temporarily_drained: false,
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
if (initial.health.jobs.in_queue > 0 || initial.health.jobs.in_progress > 0) {
  throw new Error(
    `AVANTIQO_VIDEO_IMAGE_BIND_LIVE_JOBS_BLOCK:in_queue=${initial.health.jobs.in_queue}:in_progress=${initial.health.jobs.in_progress}`,
  );
}
if (!mutationRequired) {
  console.log(JSON.stringify({ ...result, success: true }, null, 2));
  process.exit();
}

const originalWorkersMin = finite(initial.endpoint.workersMin, 0);
const originalWorkersMax = finite(initial.endpoint.workersMax, 0);
const originalImage = text(initial.template.imageName);
const originalPreservationKey = templatePreservationKey(initial.template);
let scalingChanged = false;
let imageChanged = false;

try {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 0 },
  });
  scalingChanged = originalWorkersMin !== 0 || originalWorkersMax !== 0;
  console.log("AVANTIQO_VIDEO_IMMUTABLE_IMAGE_BIND_DRAIN_REQUESTED=true");
  const drainedState = await waitForDrain(managementKey, queueKey, endpointId);

  const freshEndpointsRaw = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
  const freshEndpoints = normalizeListResponse(freshEndpointsRaw, ["endpoints", "serverlessEndpoints"]);
  if (!freshEndpoints) throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_FRESH_ENDPOINT_LIST_INVALID");
  const freshResolution = resolveEndpoint(freshEndpoints);
  if (text(freshResolution.endpoint.id) !== endpointId) {
    throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_ENDPOINT_MOVED_REPLAN_REQUIRED");
  }
  const fresh = await snapshot(managementKey, queueKey, endpointId);
  if (!drained(fresh) || !drained(drainedState)) {
    throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_DRAIN_NOT_STABLE");
  }
  if (text(fresh.template.id) !== templateId) {
    throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_TEMPLATE_MOVED_REPLAN_REQUIRED");
  }
  if (text(fresh.template.imageName) !== originalImage) {
    throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_TEMPLATE_IMAGE_CHANGED_REPLAN_REQUIRED");
  }
  if (templatePreservationKey(fresh.template) !== originalPreservationKey) {
    throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_TEMPLATE_CONTENT_CHANGED_REPLAN_REQUIRED");
  }
  const freshConsumers = freshEndpoints.filter(
    (entry) => text(entry?.templateId || entry?.template?.id) === templateId,
  );
  if (freshConsumers.length !== 1 || text(freshConsumers[0]?.id) !== endpointId) {
    throw new Error(`AVANTIQO_VIDEO_IMAGE_BIND_TEMPLATE_SHARING_CHANGED:${freshConsumers.length}`);
  }

  await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
    method: "POST",
    body: templateUpdateBody(fresh.template, immutableImage),
  });
  imageChanged = true;

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { workersMin: originalWorkersMin, workersMax: originalWorkersMax },
  });
  scalingChanged = false;

  const verified = await snapshot(managementKey, queueKey, endpointId);
  if (text(verified.template.imageName) !== immutableImage) {
    throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_VERIFY_IMAGE_FAILED");
  }
  if (templatePreservationKey(verified.template) !== originalPreservationKey) {
    throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_VERIFY_TEMPLATE_PRESERVATION_FAILED");
  }
  if (
    finite(verified.endpoint.workersMin, 0) !== originalWorkersMin ||
    finite(verified.endpoint.workersMax, 0) !== originalWorkersMax
  ) {
    throw new Error("AVANTIQO_VIDEO_IMAGE_BIND_VERIFY_SCALING_FAILED");
  }

  console.log(JSON.stringify({
    ...result,
    success: true,
    mode: "APPLY",
    endpoint: safeEndpoint(verified.endpoint),
    template: safeTemplate(verified.template),
    health_after: verified.health,
    management_after: verified.management,
    mutation_performed: true,
    endpoint_temporarily_drained: true,
    image_bind_verified: true,
    provider_job_submitted: false,
    video_generation_submitted: false,
    model_download_submitted: false,
    production_web_deploy: false,
    secrets_in_output: false,
    next_action: "RUN_RUNTIME_PROBE_THEN_ONE_BOUNDED_VIDEO_GENERATION",
  }, null, 2));
} catch (error) {
  const rollbackErrors = [];
  if (imageChanged) {
    try {
      const rollback = await snapshot(managementKey, queueKey, endpointId);
      await rest(`/templates/${encodeURIComponent(templateId)}/update`, managementKey, {
        method: "POST",
        body: templateUpdateBody(rollback.template, originalImage),
      });
    } catch (rollbackError) {
      rollbackErrors.push(`image:${text(rollbackError?.message || rollbackError)}`);
    }
  }
  if (scalingChanged || originalWorkersMin !== 0 || originalWorkersMax !== 0) {
    try {
      await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: { workersMin: originalWorkersMin, workersMax: originalWorkersMax },
      });
    } catch (rollbackError) {
      rollbackErrors.push(`scaling:${text(rollbackError?.message || rollbackError)}`);
    }
  }
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    error: text(error?.message || error),
    rollback_attempted: imageChanged || scalingChanged,
    rollback_errors: rollbackErrors,
    provider_job_submitted: false,
    video_generation_submitted: false,
    production_web_deploy: false,
    secrets_in_output: false,
  }));
  throw error;
}
