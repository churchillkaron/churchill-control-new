const CONTRACT = "AVANTIQO_VIDEO_RUNPOD_CACHED_MODEL_MIGRATION_V3";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const ENDPOINT_ID = "xmey8y2hofexyp";
const ENDPOINT_NAME = "avantiqo-cinema-production-v1";
const MODEL_REFERENCE = "https://huggingface.co/Lightricks/LTX-2.5:main";
const NEW_TEMPLATE_NAME = "avantiqo-video-ltx25-native-master-serverless-v1";
const TARGET_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA RTX PRO 6000 Blackwell Workstation Edition",
  "NVIDIA B200",
]);
const TARGET_ALLOWED_CUDA_VERSIONS = Object.freeze(["12.8", "12.9", "13.0"]);

const text = (value, maximum = 4000) => String(value ?? "").trim().slice(0, maximum);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const detail = text(body?.detail || body?.error?.message || body?.error || body?.message || raw, 1400);
    throw new Error(`${prefix}_HTTP_${response.status}:${detail || "UNKNOWN"}`);
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

async function queueHealth(queueKey) {
  const response = await fetch(`${QUEUE_BASE}/${ENDPOINT_ID}/health`, {
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
    throw new Error(`${CONTRACT}_GRAPHQL_ERROR:${list(body.errors).map((entry) => text(entry?.message)).join(" | ").slice(0, 1400)}`);
  }
  return body;
}

function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const result = normalizeList(value[key], keys, depth + 1);
    if (result) return result;
  }
  return null;
}

function normalizeEnv(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value.map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")]).filter(([key]) => Boolean(key)),
    );
  }
  return Object.fromEntries(Object.entries(object(value)).map(([key, child]) => [String(key), String(child ?? "")]));
}

function stringList(value) {
  if (Array.isArray(value)) return value.map((entry) => text(entry)).filter(Boolean);
  const raw = text(value);
  return raw ? raw.split(",").map((entry) => entry.trim()).filter(Boolean) : [];
}

function volumeEntries(endpoint = {}) {
  const entries = list(endpoint.networkVolumeIds).map((entry) => ({
    networkVolumeId: typeof entry === "string" ? text(entry) : text(entry?.networkVolumeId || entry?.id),
  })).filter((entry) => entry.networkVolumeId);
  const legacy = text(endpoint.networkVolumeId);
  if (legacy && !entries.some((entry) => entry.networkVolumeId === legacy)) {
    entries.unshift({ networkVolumeId: legacy });
  }
  return entries;
}

function volumeIds(endpoint = {}) {
  return volumeEntries(endpoint).map((entry) => entry.networkVolumeId);
}

function modelRefs(endpoint = {}) {
  return list(endpoint.modelReferences).map((entry) => text(entry)).filter(Boolean);
}

function activeManagementWorkers(endpoint = {}) {
  const terminal = new Set(["EXITED", "TERMINATED", "DELETED", "STOPPED"]);
  return list(endpoint.workers).filter((worker) => {
    const status = text(worker?.status || worker?.workerStatus || worker?.runtimeStatus || worker?.desiredStatus).toUpperCase();
    return !terminal.has(status);
  });
}

function assertDrained(endpoint, health, label) {
  const jobs = object(health.jobs);
  const workers = object(health.workers);
  const queued = finite(jobs.inQueue ?? jobs.in_queue, 0);
  const progress = finite(jobs.inProgress ?? jobs.in_progress, 0);
  const workerTotal = ["idle", "initializing", "ready", "running", "throttled", "unhealthy"]
    .reduce((sum, key) => sum + finite(workers[key], 0), 0);
  if (queued !== 0 || progress !== 0) throw new Error(`${label}_QUEUE_NOT_EMPTY:${queued}:${progress}`);
  if (workerTotal !== 0) throw new Error(`${label}_HEALTH_WORKERS_NOT_ZERO:${workerTotal}`);
  const active = activeManagementWorkers(endpoint);
  if (active.length) throw new Error(`${label}_MANAGEMENT_WORKERS_NOT_ZERO:${active.length}`);
}

const ENDPOINT_QUERY = `query AvantiqoVideoEndpointRead {
  myself { endpoints {
    id name templateId gpuIds gpuCount instanceIds workersMin workersMax locations
    networkVolumeId networkVolumeIds { networkVolumeId dataCenterId }
    idleTimeout scalerType scalerValue executionTimeoutMs minCudaVersion flashBootType modelReferences
  } }
}`;

const SAVE_ENDPOINT_MUTATION = `mutation AvantiqoVideoSaveEndpoint($input: EndpointInput!) {
  saveEndpoint(input:$input) {
    id name templateId gpuIds gpuCount instanceIds workersMin workersMax locations
    networkVolumeId networkVolumeIds { networkVolumeId dataCenterId }
    idleTimeout scalerType scalerValue executionTimeoutMs minCudaVersion flashBootType modelReferences
  }
}`;

const UPDATE_TEMPLATE_MUTATION = `mutation AvantiqoVideoSwapTemplate($input: UpdateEndpointTemplateInput) {
  updateEndpointTemplate(input:$input) { id templateId }
}`;

async function graphEndpoint(key) {
  const body = await graphql(ENDPOINT_QUERY, {}, key);
  const matches = list(body?.data?.myself?.endpoints).filter((entry) => text(entry?.id) === ENDPOINT_ID);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_GRAPH_ENDPOINT_RESOLUTION:${matches.length}`);
  if (text(matches[0]?.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_GRAPH_ENDPOINT_NAME_MISMATCH`);
  return matches[0];
}

async function swapTemplate(key, templateId) {
  const body = await graphql(UPDATE_TEMPLATE_MUTATION, { input: { endpointId: ENDPOINT_ID, templateId } }, key);
  const saved = body?.data?.updateEndpointTemplate;
  if (!saved || text(saved.id) !== ENDPOINT_ID || text(saved.templateId) !== templateId) {
    throw new Error(`${CONTRACT}_TEMPLATE_SWAP_INVALID`);
  }
}

function endpointInput(base, overrides = {}) {
  const input = {
    id: ENDPOINT_ID,
    name: ENDPOINT_NAME,
    templateId: text(overrides.templateId ?? base.templateId),
    gpuIds: text(base.gpuIds),
    gpuCount: finite(base.gpuCount, 1),
    instanceIds: list(base.instanceIds),
    workersMin: finite(overrides.workersMin ?? base.workersMin, 0),
    workersMax: finite(overrides.workersMax ?? base.workersMax, 0),
    locations: String(overrides.locations ?? base.locations ?? ""),
    networkVolumeId: String(overrides.networkVolumeId ?? base.networkVolumeId ?? ""),
    networkVolumeIds: overrides.networkVolumeIds ?? volumeEntries(base),
    idleTimeout: finite(overrides.idleTimeout ?? base.idleTimeout, 5),
    scalerType: text(overrides.scalerType ?? base.scalerType) || "REQUEST_COUNT",
    scalerValue: finite(overrides.scalerValue ?? base.scalerValue, 1),
    executionTimeoutMs: finite(overrides.executionTimeoutMs ?? base.executionTimeoutMs, 2_100_000),
    minCudaVersion: text(overrides.minCudaVersion ?? base.minCudaVersion) || "12.8",
    flashBootType: text(overrides.flashBootType ?? base.flashBootType).toUpperCase() || "FLASHBOOT",
    modelReferences: overrides.modelReferences ?? modelRefs(base),
  };
  if (!input.templateId || !input.gpuIds) throw new Error(`${CONTRACT}_GRAPH_BASE_INCOMPLETE`);
  return input;
}

async function saveEndpoint(key, input) {
  const body = await graphql(SAVE_ENDPOINT_MUTATION, { input }, key);
  const saved = body?.data?.saveEndpoint;
  if (!saved || text(saved.id) !== ENDPOINT_ID) throw new Error(`${CONTRACT}_SAVE_ENDPOINT_INVALID`);
  return saved;
}

function createTemplateBody(oldTemplate, image, hfToken) {
  const body = {
    name: NEW_TEMPLATE_NAME,
    imageName: image,
    isServerless: true,
    ports: [],
    dockerEntrypoint: list(oldTemplate.dockerEntrypoint),
    dockerStartCmd: [],
    env: {
      HF_TOKEN: hfToken,
      MODEL_NAME: "Lightricks/LTX-2.5",
      HF_HUB_OFFLINE: "1",
      TRANSFORMERS_OFFLINE: "1",
      AVANTIQO_VIDEO_LTX25_PIPELINE_ROOT: "/opt/LTX-2",
      AVANTIQO_VIDEO_LTX25_HARD_TIMEOUT_SECONDS: "1800",
    },
    containerDiskInGb: Math.max(1, finite(oldTemplate.containerDiskInGb, 30)),
    volumeInGb: 0,
    volumeMountPath: "/runpod-volume",
    readme: "Avantiqo Video LTX-2.5 native 3840x2176 zero-idle cached-model worker.",
  };
  const registryAuthId = text(oldTemplate.containerRegistryAuthId);
  if (registryAuthId) body.containerRegistryAuthId = registryAuthId;
  return body;
}

function restTargetPolicy() {
  return {
    gpuTypeIds: [...TARGET_GPU_TYPE_IDS],
    gpuCount: 1,
    workersMin: 0,
    workersMax: 1,
    idleTimeout: 5,
    scalerType: "REQUEST_COUNT",
    scalerValue: 1,
    flashboot: true,
    minCudaVersion: "12.8",
    allowedCudaVersions: [...TARGET_ALLOWED_CUDA_VERSIONS],
    dataCenterIds: [],
    executionTimeoutMs: 2_100_000,
    networkVolumeIds: [],
  };
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = required("RUNPOD_INFERENCE_KEY");
const hfToken = required("HF_TOKEN");
const image = required("AVANTIQO_VIDEO_SERVERLESS_IMAGE");
if (!/^ghcr\.io\/churchillkaron\/avantiqo-video-ltx25-native-master-serverless@sha256:[0-9a-f]{64}$/i.test(image)) {
  throw new Error(`${CONTRACT}_IMMUTABLE_IMAGE_INVALID`);
}
if (text(process.env.AVANTIQO_VIDEO_CACHED_MODEL_MIGRATION_APPROVED).toUpperCase() !== "YES") {
  throw new Error(`${CONTRACT}_APPROVAL_REQUIRED`);
}

console.log("AVANTIQO_VIDEO_MIGRATION_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_VIDEO_MIGRATION_INFERENCE_PERFORMED=false");
console.log("AVANTIQO_VIDEO_MIGRATION_PRODUCTION_WEB_DEPLOY=false");

const [initialRest, initialHealth, initialGraph, templatesRaw, endpointsRaw] = await Promise.all([
  rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
  queueHealth(queueKey),
  graphEndpoint(managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
]);

if (text(initialRest.id) !== ENDPOINT_ID || text(initialRest.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_INITIAL_IDENTITY`);
assertDrained(initialRest, initialHealth, `${CONTRACT}_INITIAL`);
if (finite(initialRest.workersMin, -1) !== 0) throw new Error(`${CONTRACT}_INITIAL_WORKERS_MIN`);

const oldTemplateId = text(initialRest.templateId || initialRest.template?.id);
if (!oldTemplateId || oldTemplateId !== text(initialGraph.templateId)) throw new Error(`${CONTRACT}_OLD_TEMPLATE_ID_MISMATCH`);
const oldTemplate = await rest(`/templates/${oldTemplateId}`, managementKey);
const endpointRows = normalizeList(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const templateRows = normalizeList(templatesRaw, ["templates"]);
if (!endpointRows || !templateRows) throw new Error(`${CONTRACT}_LIST_RESPONSE_INVALID`);
const oldConsumers = endpointRows.filter((entry) => text(entry?.templateId || entry?.template?.id) === oldTemplateId);
if (oldConsumers.length !== 1 || text(oldConsumers[0]?.id) !== ENDPOINT_ID) throw new Error(`${CONTRACT}_OLD_TEMPLATE_SHARED:${oldConsumers.length}`);

for (const stale of templateRows.filter((entry) => text(entry?.name) === NEW_TEMPLATE_NAME && text(entry?.id) !== oldTemplateId)) {
  const staleId = text(stale?.id);
  const consumers = endpointRows.filter((entry) => text(entry?.templateId || entry?.template?.id) === staleId);
  if (consumers.length) throw new Error(`${CONTRACT}_CANONICAL_TEMPLATE_ALREADY_BOUND:${staleId}`);
  await rest(`/templates/${staleId}`, managementKey, { method: "DELETE" });
  console.log("AVANTIQO_VIDEO_STALE_UNBOUND_TEMPLATE_REMOVED=true");
}

let newTemplateId = "";
let endpointSwapped = false;
let modelAttached = false;
try {
  const created = await rest("/templates", managementKey, {
    method: "POST",
    body: createTemplateBody(oldTemplate, image, hfToken),
  });
  newTemplateId = text(created?.id || created?.template?.id || created?.data?.id);
  if (!newTemplateId || newTemplateId === oldTemplateId) throw new Error(`${CONTRACT}_NEW_TEMPLATE_ID_INVALID`);

  const createdTemplate = await rest(`/templates/${newTemplateId}`, managementKey);
  const createdEnv = normalizeEnv(createdTemplate.env);
  if (!createdEnv.HF_TOKEN) throw new Error(`${CONTRACT}_NEW_TEMPLATE_HF_TOKEN_MISSING`);
  if (text(createdTemplate.imageName) !== image) throw new Error(`${CONTRACT}_NEW_TEMPLATE_IMAGE_MISMATCH`);
  console.log("AVANTIQO_VIDEO_NEW_CANONICAL_TEMPLATE_CREATED=true");
  console.log(`AVANTIQO_VIDEO_TEMPLATE_REGISTRY_AUTH=${text(createdTemplate.containerRegistryAuthId) ? "PRESERVED" : "NOT_REQUIRED"}`);

  await swapTemplate(managementKey, newTemplateId);
  endpointSwapped = true;
  await sleep(750);

  const swappedGraph = await graphEndpoint(managementKey);
  if (text(swappedGraph.templateId) !== newTemplateId) throw new Error(`${CONTRACT}_GRAPH_SWAP_NOT_VISIBLE`);

  await saveEndpoint(managementKey, endpointInput(swappedGraph, {
    templateId: newTemplateId,
    workersMin: 0,
    workersMax: 1,
    locations: "",
    networkVolumeId: "",
    networkVolumeIds: [],
    idleTimeout: 5,
    scalerType: "REQUEST_COUNT",
    scalerValue: 1,
    executionTimeoutMs: 2_100_000,
    minCudaVersion: "12.8",
    flashBootType: "FLASHBOOT",
    modelReferences: [MODEL_REFERENCE],
  }));
  modelAttached = true;
  console.log("AVANTIQO_VIDEO_GATED_CACHED_MODEL_ATTACHED=true");

  await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, { method: "PATCH", body: restTargetPolicy() });

  const [verifiedRest, verifiedHealth, verifiedGraph, verifiedTemplate] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    queueHealth(queueKey),
    graphEndpoint(managementKey),
    rest(`/templates/${newTemplateId}`, managementKey),
  ]);
  assertDrained(verifiedRest, verifiedHealth, `${CONTRACT}_VERIFIED`);
  if (finite(verifiedRest.workersMin, -1) !== 0 || finite(verifiedRest.workersMax, -1) !== 1) throw new Error(`${CONTRACT}_VERIFY_SCALING`);
  if (finite(verifiedRest.idleTimeout, -1) !== 5) throw new Error(`${CONTRACT}_VERIFY_IDLE_TIMEOUT`);
  if (text(verifiedRest.scalerType) !== "REQUEST_COUNT" || finite(verifiedRest.scalerValue, -1) !== 1) throw new Error(`${CONTRACT}_VERIFY_SCALER`);
  if (volumeIds(verifiedRest).length) throw new Error(`${CONTRACT}_VERIFY_VOLUME_ATTACHED:${volumeIds(verifiedRest).join(",")}`);
  if (stringList(verifiedRest.dataCenterIds).length) throw new Error(`${CONTRACT}_VERIFY_DC_RESTRICTION`);
  if (JSON.stringify(stringList(verifiedRest.gpuTypeIds)) !== JSON.stringify(TARGET_GPU_TYPE_IDS)) throw new Error(`${CONTRACT}_VERIFY_GPU_POOL`);
  if (modelRefs(verifiedGraph).length !== 1 || modelRefs(verifiedGraph)[0] !== MODEL_REFERENCE) throw new Error(`${CONTRACT}_VERIFY_MODEL_REFERENCE`);
  if (text(verifiedTemplate.imageName) !== image) throw new Error(`${CONTRACT}_VERIFY_IMAGE`);
  if (!normalizeEnv(verifiedTemplate.env).HF_TOKEN) throw new Error(`${CONTRACT}_VERIFY_HF_TOKEN_MISSING`);

  await rest(`/templates/${oldTemplateId}`, managementKey, { method: "DELETE" });
  console.log("AVANTIQO_VIDEO_OLD_UNBOUND_TEMPLATE_REMOVED=true");
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: ENDPOINT_ID,
    endpoint_name: ENDPOINT_NAME,
    template_id: newTemplateId,
    workers_min: 0,
    workers_max: 1,
    idle_timeout_seconds: 5,
    scaler_type: "REQUEST_COUNT",
    scaler_value: 1,
    model_reference: MODEL_REFERENCE,
    gpu_type_ids: TARGET_GPU_TYPE_IDS,
    network_volume_attached: false,
    datacenter_restriction: false,
    active_workers: 0,
    generation_submitted: false,
    inference_performed: false,
    production_web_deploy: false,
  }, null, 2));
} catch (error) {
  const rollbackErrors = [];
  if (endpointSwapped) {
    try {
      await swapTemplate(managementKey, oldTemplateId);
      await sleep(500);
      await saveEndpoint(managementKey, endpointInput(initialGraph));
    } catch (rollbackError) {
      rollbackErrors.push(`endpoint:${text(rollbackError?.message || rollbackError, 900)}`);
    }
  }
  if (newTemplateId) {
    try {
      const current = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true`, managementKey);
      if (text(current.templateId || current.template?.id) !== newTemplateId) {
        await rest(`/templates/${newTemplateId}`, managementKey, { method: "DELETE" });
      }
    } catch (rollbackError) {
      rollbackErrors.push(`template:${text(rollbackError?.message || rollbackError, 900)}`);
    }
  }
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    error: text(error?.message || error, 1800),
    rollback_attempted: endpointSwapped || Boolean(newTemplateId),
    rollback_errors: rollbackErrors,
    model_attached_before_failure: modelAttached,
    generation_submitted: false,
    inference_performed: false,
    production_web_deploy: false,
  }));
  throw error;
}
