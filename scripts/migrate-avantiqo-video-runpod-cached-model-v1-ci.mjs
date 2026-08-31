const CONTRACT = "AVANTIQO_VIDEO_RUNPOD_CACHED_MODEL_MIGRATION_V1";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const ENDPOINT_ID = "xmey8y2hofexyp";
const ENDPOINT_NAME = "avantiqo-cinema-production-v1";
const MODEL_REFERENCE = "https://huggingface.co/Lightricks/LTX-2.5:main";
const TARGET_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA H100 NVL",
  "NVIDIA H200",
  "NVIDIA B200",
]);
const TARGET_ALLOWED_CUDA_VERSIONS = Object.freeze(["12.8", "12.9", "13.0"]);

const text = (value, maximum = 4000) => String(value ?? "").trim().slice(0, maximum);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function readJson(response, prefix) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) {
    const detail = text(body?.detail || body?.error?.message || body?.error || body?.message || raw, 1200);
    const error = new Error(`${prefix}_HTTP_${response.status}:${detail || "UNKNOWN"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body;
}

async function rest(pathname, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJson(response, `${CONTRACT}_REST`);
}

async function queueHealth(endpointId, queueKey) {
  const response = await fetch(`${QUEUE_BASE}/${endpointId}/health`, {
    headers: { Authorization: `Bearer ${queueKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, `${CONTRACT}_HEALTH`);
}

async function graphql(query, variables, credential) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 AvantiqoVideoMigration",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readJson(response, `${CONTRACT}_GRAPHQL`);
  if (list(body.errors).length) {
    throw new Error(`${CONTRACT}_GRAPHQL_ERROR:${list(body.errors).map((entry) => text(entry?.message)).join(" | ").slice(0, 1200)}`);
  }
  return body;
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
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
        .filter(([key]) => Boolean(key)),
    );
  }
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]));
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

function managementWorkers(endpoint = {}) {
  const terminal = new Set(["EXITED", "TERMINATED", "DELETED", "STOPPED"]);
  return list(endpoint.workers).filter((worker) => {
    const status = text(worker?.status || worker?.workerStatus || worker?.runtimeStatus || worker?.desiredStatus).toUpperCase();
    return !terminal.has(status);
  });
}

function assertDrained(endpoint, health, label) {
  const summary = healthSummary(health);
  if (summary.jobs.in_queue !== 0 || summary.jobs.in_progress !== 0) {
    throw new Error(`${label}_QUEUE_NOT_EMPTY:${JSON.stringify(summary.jobs)}`);
  }
  if (Object.values(summary.workers).some((value) => Number(value) !== 0)) {
    throw new Error(`${label}_QUEUE_WORKERS_NOT_ZERO:${JSON.stringify(summary.workers)}`);
  }
  const management = managementWorkers(endpoint);
  if (management.length) throw new Error(`${label}_MANAGEMENT_WORKERS_NOT_ZERO:${management.length}`);
}

function stringList(value) {
  if (Array.isArray(value)) return value.map((entry) => text(entry)).filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function volumeIds(endpoint = {}) {
  const ids = list(endpoint.networkVolumeIds).map((entry) => {
    if (typeof entry === "string") return text(entry);
    return text(entry?.networkVolumeId || entry?.id);
  }).filter(Boolean);
  const legacy = text(endpoint.networkVolumeId);
  if (legacy && !ids.includes(legacy)) ids.unshift(legacy);
  return ids;
}

function modelRefs(endpoint = {}) {
  return list(endpoint.modelReferences).map((entry) => text(entry)).filter(Boolean);
}

function templateUpdateBody(template, imageName, hfToken) {
  const env = {
    ...normalizeEnv(template.env),
    HF_TOKEN: hfToken,
    MODEL_NAME: "Lightricks/LTX-2.5",
    HF_HUB_OFFLINE: "1",
    TRANSFORMERS_OFFLINE: "1",
    AVANTIQO_VIDEO_LTX25_PIPELINE_ROOT: "/opt/LTX-2",
    AVANTIQO_VIDEO_LTX25_HARD_TIMEOUT_SECONDS: "1800",
  };
  const body = {
    containerDiskInGb: Math.max(1, finite(template.containerDiskInGb, 30)),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: [],
    env,
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
  if (!body.name) throw new Error(`${CONTRACT}_TEMPLATE_NAME_REQUIRED`);
  return body;
}

function originalTemplateBody(template) {
  const body = {
    containerDiskInGb: Math.max(1, finite(template.containerDiskInGb, 30)),
    dockerEntrypoint: list(template.dockerEntrypoint),
    dockerStartCmd: list(template.dockerStartCmd),
    env: normalizeEnv(template.env),
    imageName: text(template.imageName),
    isPublic: template.isPublic === true,
    name: text(template.name),
    ports: list(template.ports),
    readme: text(template.readme),
    volumeInGb: Math.max(0, finite(template.volumeInGb, 0)),
    volumeMountPath: text(template.volumeMountPath) || "/workspace",
  };
  const registryAuthId = text(template.containerRegistryAuthId);
  if (registryAuthId) body.containerRegistryAuthId = registryAuthId;
  return body;
}

const ENDPOINT_QUERY = `
query AvantiqoVideoCachedModelEndpointRead {
  myself {
    endpoints {
      id
      name
      templateId
      gpuIds
      gpuCount
      instanceIds
      workersMin
      workersMax
      locations
      networkVolumeId
      networkVolumeIds { networkVolumeId dataCenterId }
      idleTimeout
      scalerType
      scalerValue
      executionTimeoutMs
      minCudaVersion
      flashBootType
      modelReferences
    }
  }
}`;

const SAVE_ENDPOINT_MUTATION = `
mutation AvantiqoVideoCachedModelSaveEndpoint($input: EndpointInput!) {
  saveEndpoint(input: $input) {
    id
    name
    templateId
    gpuIds
    gpuCount
    instanceIds
    workersMin
    workersMax
    locations
    networkVolumeId
    networkVolumeIds { networkVolumeId dataCenterId }
    idleTimeout
    scalerType
    scalerValue
    executionTimeoutMs
    minCudaVersion
    flashBootType
    modelReferences
  }
}`;

async function graphqlEndpoint(managementKey) {
  const body = await graphql(ENDPOINT_QUERY, {}, managementKey);
  const matches = list(body?.data?.myself?.endpoints).filter((row) => text(row?.id) === ENDPOINT_ID);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_GRAPHQL_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  const endpoint = matches[0];
  if (text(endpoint.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_GRAPHQL_ENDPOINT_NAME_MISMATCH`);
  return endpoint;
}

function graphqlSaveInput(base, { clearVolumes, modelReferences, workersMax, idleTimeout, scalerType, scalerValue }) {
  const gpuIds = text(base.gpuIds);
  const templateId = text(base.templateId);
  const flashBootType = text(base.flashBootType).toUpperCase();
  if (!gpuIds || !templateId || !flashBootType) throw new Error(`${CONTRACT}_GRAPHQL_BASE_INCOMPLETE`);
  const existingVolumes = list(base.networkVolumeIds).map((entry) => ({
    networkVolumeId: text(entry?.networkVolumeId || entry),
  })).filter((entry) => entry.networkVolumeId);
  return {
    id: ENDPOINT_ID,
    name: ENDPOINT_NAME,
    templateId,
    gpuIds,
    gpuCount: finite(base.gpuCount, 1),
    instanceIds: list(base.instanceIds),
    workersMin: 0,
    workersMax,
    locations: clearVolumes ? "" : text(base.locations),
    networkVolumeId: clearVolumes ? "" : text(base.networkVolumeId),
    networkVolumeIds: clearVolumes ? [] : existingVolumes,
    idleTimeout,
    scalerType,
    scalerValue,
    executionTimeoutMs: 2_100_000,
    minCudaVersion: "12.8",
    flashBootType,
    modelReferences: [...modelReferences],
  };
}

async function saveEndpoint(managementKey, input) {
  const body = await graphql(SAVE_ENDPOINT_MUTATION, { input }, managementKey);
  const saved = body?.data?.saveEndpoint;
  if (!saved || text(saved.id) !== ENDPOINT_ID) throw new Error(`${CONTRACT}_SAVE_ENDPOINT_RESPONSE_INVALID`);
  return saved;
}

function restPolicy({ workersMax, networkVolumeIds }) {
  return {
    gpuTypeIds: [...TARGET_GPU_TYPE_IDS],
    gpuCount: 1,
    workersMin: 0,
    workersMax,
    idleTimeout: 5,
    scalerType: "QUEUE_DELAY",
    scalerValue: 1,
    flashboot: true,
    minCudaVersion: "12.8",
    allowedCudaVersions: [...TARGET_ALLOWED_CUDA_VERSIONS],
    dataCenterIds: [],
    executionTimeoutMs: 2_100_000,
    networkVolumeIds: [...networkVolumeIds],
  };
}

function originalRestPolicy(endpoint) {
  return {
    gpuTypeIds: stringList(endpoint.gpuTypeIds),
    gpuCount: Math.max(1, finite(endpoint.gpuCount, 1)),
    workersMin: finite(endpoint.workersMin, 0),
    workersMax: finite(endpoint.workersMax, 0),
    idleTimeout: finite(endpoint.idleTimeout, 5),
    scalerType: text(endpoint.scalerType) || "QUEUE_DELAY",
    scalerValue: finite(endpoint.scalerValue, 1),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true || text(endpoint.flashBootType).toUpperCase() === "FLASHBOOT",
    minCudaVersion: text(endpoint.minCudaVersion) || "12.8",
    allowedCudaVersions: stringList(endpoint.allowedCudaVersions),
    dataCenterIds: stringList(endpoint.dataCenterIds),
    executionTimeoutMs: finite(endpoint.executionTimeoutMs, 2_100_000),
    networkVolumeIds: volumeIds(endpoint),
  };
}

function assertTarget(restEndpoint, graphEndpoint, template, imageName) {
  if (text(restEndpoint.id) !== ENDPOINT_ID || text(restEndpoint.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_VERIFY_IDENTITY`);
  if (finite(restEndpoint.workersMin, -1) !== 0 || finite(restEndpoint.workersMax, -1) !== 1) throw new Error(`${CONTRACT}_VERIFY_SCALING`);
  if (finite(restEndpoint.idleTimeout, -1) !== 5) throw new Error(`${CONTRACT}_VERIFY_IDLE_TIMEOUT`);
  if (text(restEndpoint.scalerType) !== "QUEUE_DELAY" || finite(restEndpoint.scalerValue, -1) !== 1) throw new Error(`${CONTRACT}_VERIFY_SCALER`);
  const flashboot = restEndpoint.flashboot === true || restEndpoint.flashBoot === true || text(restEndpoint.flashBootType).toUpperCase() === "FLASHBOOT";
  if (!flashboot) throw new Error(`${CONTRACT}_VERIFY_FLASHBOOT`);
  if (volumeIds(restEndpoint).length) throw new Error(`${CONTRACT}_VERIFY_NETWORK_VOLUME_STILL_ATTACHED:${volumeIds(restEndpoint).join(",")}`);
  if (stringList(restEndpoint.dataCenterIds).length) throw new Error(`${CONTRACT}_VERIFY_DATACENTER_RESTRICTION`);
  const gpuTypes = stringList(restEndpoint.gpuTypeIds);
  if (JSON.stringify(gpuTypes) !== JSON.stringify(TARGET_GPU_TYPE_IDS)) throw new Error(`${CONTRACT}_VERIFY_GPU_POOL:${JSON.stringify(gpuTypes)}`);
  if (modelRefs(graphEndpoint).length !== 1 || modelRefs(graphEndpoint)[0] !== MODEL_REFERENCE) throw new Error(`${CONTRACT}_VERIFY_MODEL_REFERENCE:${JSON.stringify(modelRefs(graphEndpoint))}`);
  if (text(template.imageName) !== imageName) throw new Error(`${CONTRACT}_VERIFY_TEMPLATE_IMAGE`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = required("RUNPOD_INFERENCE_KEY");
const hfToken = required("HF_TOKEN");
const imageName = required("AVANTIQO_VIDEO_SERVERLESS_IMAGE");
if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-ltx25-native-master-serverless@sha256:[0-9a-f]{64}$/i.test(imageName)) {
  throw new Error(`${CONTRACT}_IMMUTABLE_IMAGE_INVALID`);
}
if (text(process.env.AVANTIQO_VIDEO_CACHED_MODEL_MIGRATION_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_VIDEO_CACHED_MODEL_MIGRATION_APPROVED=YES_REQUIRED");
}

console.log("AVANTIQO_VIDEO_CACHED_MODEL_MIGRATION_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_VIDEO_CACHED_MODEL_MIGRATION_PRODUCTION_WEB_DEPLOY=false");

const [initialRest, initialHealth, endpointRowsRaw, templateRowsRaw, initialGraph] = await Promise.all([
  rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
  queueHealth(ENDPOINT_ID, queueKey),
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  graphqlEndpoint(managementKey),
]);

if (text(initialRest.id) !== ENDPOINT_ID || text(initialRest.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_INITIAL_IDENTITY_MISMATCH`);
assertDrained(initialRest, initialHealth, `${CONTRACT}_INITIAL`);
if (finite(initialRest.workersMin, -1) !== 0) throw new Error(`${CONTRACT}_INITIAL_WORKERS_MIN_NOT_ZERO`);

const templateId = text(initialRest.templateId || initialRest.template?.id);
if (!templateId || templateId !== text(initialGraph.templateId)) throw new Error(`${CONTRACT}_TEMPLATE_ID_MISMATCH`);
const endpointRows = normalizeListResponse(endpointRowsRaw, ["endpoints", "serverlessEndpoints"]);
const templateRows = normalizeListResponse(templateRowsRaw, ["templates"]);
if (!endpointRows || !templateRows) throw new Error(`${CONTRACT}_LIST_RESPONSE_INVALID`);
const consumers = endpointRows.filter((row) => text(row?.templateId || row?.template?.id) === templateId);
if (consumers.length !== 1 || text(consumers[0]?.id) !== ENDPOINT_ID) throw new Error(`${CONTRACT}_SHARED_TEMPLATE_BLOCKED:${consumers.length}`);
const templateMatches = templateRows.filter((row) => text(row?.id) === templateId);
if (templateMatches.length !== 1) throw new Error(`${CONTRACT}_TEMPLATE_RESOLUTION_FAILED:${templateMatches.length}`);
const initialTemplate = await rest(`/templates/${templateId}`, managementKey);
const originalTemplate = originalTemplateBody(initialTemplate);
const originalRest = originalRestPolicy(initialRest);
const originalGraphInput = graphqlSaveInput(initialGraph, {
  clearVolumes: false,
  modelReferences: modelRefs(initialGraph),
  workersMax: finite(initialGraph.workersMax, 0),
  idleTimeout: finite(initialGraph.idleTimeout, 5),
  scalerType: text(initialGraph.scalerType) || "QUEUE_DELAY",
  scalerValue: finite(initialGraph.scalerValue, 1),
});

let templateChanged = false;
let graphChanged = false;
let restChanged = false;
try {
  const updatedTemplate = await rest(`/templates/${templateId}/update`, managementKey, {
    method: "POST",
    body: templateUpdateBody(initialTemplate, imageName, hfToken),
  });
  templateChanged = true;
  const updatedImage = text(updatedTemplate?.imageName || (await rest(`/templates/${templateId}`, managementKey)).imageName);
  if (updatedImage !== imageName) throw new Error(`${CONTRACT}_TEMPLATE_IMAGE_UPDATE_NOT_VISIBLE`);
  console.log("AVANTIQO_VIDEO_CACHED_MODEL_TEMPLATE_IMAGE=PASS");

  const graphInput = graphqlSaveInput(initialGraph, {
    clearVolumes: true,
    modelReferences: [MODEL_REFERENCE],
    workersMax: 1,
    idleTimeout: 5,
    scalerType: "QUEUE_DELAY",
    scalerValue: 1,
  });
  await saveEndpoint(managementKey, graphInput);
  graphChanged = true;
  console.log("AVANTIQO_VIDEO_CACHED_MODEL_REFERENCE_BIND=PASS");

  await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, {
    method: "PATCH",
    body: restPolicy({ workersMax: 1, networkVolumeIds: [] }),
  });
  restChanged = true;
  console.log("AVANTIQO_VIDEO_CACHED_MODEL_GLOBAL_POOL_BIND=PASS");

  const [verifiedRest, verifiedHealth, verifiedGraph, verifiedTemplate] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    queueHealth(ENDPOINT_ID, queueKey),
    graphqlEndpoint(managementKey),
    rest(`/templates/${templateId}`, managementKey),
  ]);
  assertDrained(verifiedRest, verifiedHealth, `${CONTRACT}_VERIFIED`);
  assertTarget(verifiedRest, verifiedGraph, verifiedTemplate, imageName);

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: ENDPOINT_ID,
    endpoint_name: ENDPOINT_NAME,
    workers_min: 0,
    workers_max: 1,
    idle_timeout_seconds: 5,
    scaler_type: "QUEUE_DELAY",
    scaler_value: 1,
    flashboot: true,
    model_reference: MODEL_REFERENCE,
    gpu_type_ids: TARGET_GPU_TYPE_IDS,
    allowed_cuda_versions: TARGET_ALLOWED_CUDA_VERSIONS,
    network_volume_attached: false,
    datacenter_restriction: false,
    active_workers: 0,
    queued_jobs: 0,
    generation_submitted: false,
    inference_performed: false,
    production_web_deploy: false,
  }, null, 2));
} catch (error) {
  const rollbackErrors = [];
  if (graphChanged || restChanged) {
    try { await saveEndpoint(managementKey, originalGraphInput); } catch (rollbackError) { rollbackErrors.push(`graphql:${text(rollbackError?.message || rollbackError, 800)}`); }
    try { await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, { method: "PATCH", body: originalRest }); } catch (rollbackError) { rollbackErrors.push(`rest:${text(rollbackError?.message || rollbackError, 800)}`); }
  }
  if (templateChanged) {
    try { await rest(`/templates/${templateId}/update`, managementKey, { method: "POST", body: originalTemplate }); } catch (rollbackError) { rollbackErrors.push(`template:${text(rollbackError?.message || rollbackError, 800)}`); }
  }
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    error: text(error?.message || error, 1600),
    rollback_attempted: templateChanged || graphChanged || restChanged,
    rollback_errors: rollbackErrors,
    generation_submitted: false,
    inference_performed: false,
    production_web_deploy: false,
  }));
  throw error;
}
