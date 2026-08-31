const CONTRACT = "AVANTIQO_CODE_RUNPOD_GLOBAL_CACHED_MODEL_MIGRATION_V1";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const MODEL_REFERENCE = "https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8:main";
const APPROVAL_ENV = "AVANTIQO_CODE_GLOBAL_CACHED_MODEL_MIGRATION_APPROVED";
const TARGET_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA B200",
  "NVIDIA H200",
  "NVIDIA H100 NVL",
  "NVIDIA H100 80GB HBM3",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
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

async function queue(pathname, credential, options = {}) {
  const response = await fetch(`${QUEUE_BASE}/${ENDPOINT_ID}${pathname}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJson(response, `${CONTRACT}_QUEUE`);
}

async function graphql(query, variables, credential) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "AvantiqoCodeCachedModelMigration",
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

function normalizeRows(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const key of [...keys, "data", "items", "results", "endpoints", "networkVolumes", "volumes"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const rows = normalizeRows(value[key], keys, depth + 1);
    if (rows.length || Array.isArray(value[key])) return rows;
  }
  return [];
}

function stringList(value) {
  if (Array.isArray(value)) return value.map((entry) => text(entry)).filter(Boolean);
  const raw = text(value);
  return raw ? raw.split(",").map((entry) => entry.trim()).filter(Boolean) : [];
}

function volumeEntries(endpoint = {}) {
  const entries = list(endpoint.networkVolumeIds).map((entry) => ({
    networkVolumeId: typeof entry === "string" ? text(entry) : text(entry?.networkVolumeId || entry?.id),
    dataCenterId: typeof entry === "object" ? text(entry?.dataCenterId) : "",
  })).filter((entry) => entry.networkVolumeId);
  const legacy = text(endpoint.networkVolumeId);
  if (legacy && !entries.some((entry) => entry.networkVolumeId === legacy)) entries.unshift({ networkVolumeId: legacy, dataCenterId: "" });
  return entries;
}

function volumeIds(endpoint = {}) {
  return [...new Set(volumeEntries(endpoint).map((entry) => entry.networkVolumeId))];
}

function modelRefs(endpoint = {}) {
  return list(endpoint.modelReferences).map((entry) => text(entry)).filter(Boolean);
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

function workerCount(summary) {
  return Object.values(summary.workers).reduce((sum, value) => sum + Math.max(0, finite(value, 0)), 0);
}

const ENDPOINT_QUERY = `query AvantiqoCodeEndpointRead {
  myself { endpoints {
    id name templateId gpuIds gpuCount instanceIds workersMin workersMax locations
    networkVolumeId networkVolumeIds { networkVolumeId dataCenterId }
    idleTimeout scalerType scalerValue executionTimeoutMs minCudaVersion flashBootType modelReferences
  } }
}`;

const SAVE_ENDPOINT_MUTATION = `mutation AvantiqoCodeSaveEndpoint($input: EndpointInput!) {
  saveEndpoint(input:$input) {
    id name templateId gpuIds gpuCount instanceIds workersMin workersMax locations
    networkVolumeId networkVolumeIds { networkVolumeId dataCenterId }
    idleTimeout scalerType scalerValue executionTimeoutMs minCudaVersion flashBootType modelReferences
  }
}`;

async function graphEndpoint(key) {
  const body = await graphql(ENDPOINT_QUERY, {}, key);
  const matches = list(body?.data?.myself?.endpoints).filter((entry) => text(entry?.id) === ENDPOINT_ID);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_GRAPH_ENDPOINT_RESOLUTION:${matches.length}`);
  if (text(matches[0]?.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_GRAPH_ENDPOINT_NAME_MISMATCH`);
  return matches[0];
}

function endpointInput(base, overrides = {}) {
  const input = {
    id: ENDPOINT_ID,
    name: ENDPOINT_NAME,
    templateId: text(base.templateId),
    gpuIds: text(base.gpuIds),
    gpuCount: finite(base.gpuCount, 1),
    instanceIds: list(base.instanceIds),
    workersMin: finite(overrides.workersMin ?? base.workersMin, 0),
    workersMax: finite(overrides.workersMax ?? base.workersMax, 0),
    locations: String(overrides.locations ?? base.locations ?? ""),
    networkVolumeId: String(overrides.networkVolumeId ?? base.networkVolumeId ?? ""),
    networkVolumeIds: overrides.networkVolumeIds ?? volumeEntries(base),
    idleTimeout: finite(overrides.idleTimeout ?? base.idleTimeout, 5),
    scalerType: text(overrides.scalerType ?? base.scalerType) || "QUEUE_DELAY",
    scalerValue: finite(overrides.scalerValue ?? base.scalerValue, 1),
    executionTimeoutMs: finite(overrides.executionTimeoutMs ?? base.executionTimeoutMs, 600_000),
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

async function waitForNoWorkers(queueKey, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let summary = healthSummary(await queue("/health", queueKey));
  while (Date.now() < deadline && workerCount(summary) > 0) {
    await sleep(1500);
    summary = healthSummary(await queue("/health", queueKey));
  }
  return summary;
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
if (!queueKey) throw new Error(`${CONTRACT}_QUEUE_KEY_REQUIRED`);
if (text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") throw new Error(`${CONTRACT}_APPROVAL_REQUIRED:set_${APPROVAL_ENV}=YES`);
if (text(process.env.NODE_ENV).toLowerCase() === "production") throw new Error(`${CONTRACT}_PRODUCTION_ENV_FORBIDDEN`);

console.log(JSON.stringify({
  event: `${CONTRACT}_START`,
  endpoint_id: ENDPOINT_ID,
  endpoint_name: ENDPOINT_NAME,
  model_reference: MODEL_REFERENCE,
  target_scheduling: "GLOBAL_RUNPOD_CACHED_MODEL",
  preserve_existing_code_storage: true,
  create_storage: false,
  inference_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}));

const [initialRest, initialGraph, volumesBeforeRaw] = await Promise.all([
  rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
  graphEndpoint(managementKey),
  rest("/networkvolumes", managementKey),
]);
if (text(initialRest.id) !== ENDPOINT_ID || text(initialRest.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_INITIAL_ENDPOINT_IDENTITY_INVALID`);
const attachedBefore = volumeIds(initialRest);
if (attachedBefore.length !== 1) throw new Error(`${CONTRACT}_INITIAL_SINGLE_CODE_STORAGE_REQUIRED:${attachedBefore.length}`);
const allVolumesBefore = normalizeRows(volumesBeforeRaw, ["networkVolumes"]);
const canonicalMatches = allVolumesBefore.filter((entry) => text(entry?.id) === attachedBefore[0]);
if (canonicalMatches.length !== 1) throw new Error(`${CONTRACT}_CANONICAL_STORAGE_RESOLUTION:${canonicalMatches.length}`);
const canonicalVolume = canonicalMatches[0];
const canonicalVolumeName = text(canonicalVolume?.name);
if (!/avantiqo.*code.*cache/i.test(canonicalVolumeName)) throw new Error(`${CONTRACT}_CANONICAL_STORAGE_NAME_INVALID:${canonicalVolumeName}`);

let health = healthSummary(await queue("/health", queueKey));
if (health.jobs.in_progress > 0) throw new Error(`${CONTRACT}_ACTIVE_INFERENCE_PRESENT:${health.jobs.in_progress}`);
if (health.jobs.in_queue > 0) {
  const purged = await queue("/purge-queue", queueKey, { method: "POST" });
  console.log(JSON.stringify({
    event: `${CONTRACT}_STALE_QUEUE_PURGED`,
    removed: finite(purged?.removed, 0),
    inference_performed: false,
    secrets_printed: false,
  }));
  await sleep(750);
  health = healthSummary(await queue("/health", queueKey));
  if (health.jobs.in_queue > 0 || health.jobs.in_progress > 0) throw new Error(`${CONTRACT}_QUEUE_DRAIN_FAILED`);
}

await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, {
  method: "PATCH",
  body: { workersMin: 0, workersMax: 0, idleTimeout: 5 },
});
health = await waitForNoWorkers(queueKey);
if (health.jobs.in_queue > 0 || health.jobs.in_progress > 0 || workerCount(health) > 0) {
  throw new Error(`${CONTRACT}_PRE_MIGRATION_NOT_IDLE:${JSON.stringify(health)}`);
}

let migrated = false;
try {
  await saveEndpoint(managementKey, endpointInput(initialGraph, {
    workersMin: 0,
    workersMax: 0,
    locations: "",
    networkVolumeId: "",
    networkVolumeIds: [],
    idleTimeout: 5,
    scalerType: "QUEUE_DELAY",
    scalerValue: 1,
    minCudaVersion: "12.8",
    flashBootType: "FLASHBOOT",
    modelReferences: [MODEL_REFERENCE],
  }));
  migrated = true;

  await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, {
    method: "PATCH",
    body: {
      gpuTypeIds: [...TARGET_GPU_TYPE_IDS],
      gpuCount: 1,
      workersMin: 0,
      workersMax: 0,
      idleTimeout: 5,
      scalerType: "QUEUE_DELAY",
      scalerValue: 1,
      flashboot: true,
      minCudaVersion: "12.8",
      allowedCudaVersions: [...TARGET_ALLOWED_CUDA_VERSIONS],
      dataCenterIds: [],
      networkVolumeIds: [],
    },
  });

  const [verifiedRest, verifiedGraph, verifiedHealthRaw, volumesAfterRaw] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    graphEndpoint(managementKey),
    queue("/health", queueKey),
    rest("/networkvolumes", managementKey),
  ]);
  const verifiedHealth = healthSummary(verifiedHealthRaw);
  if (volumeIds(verifiedRest).length !== 0) throw new Error(`${CONTRACT}_VERIFY_ENDPOINT_VOLUME_DETACH_FAILED`);
  if (stringList(verifiedRest.dataCenterIds).length !== 0) throw new Error(`${CONTRACT}_VERIFY_GLOBAL_DATACENTER_FAILED`);
  if (modelRefs(verifiedGraph).length !== 1 || modelRefs(verifiedGraph)[0] !== MODEL_REFERENCE) throw new Error(`${CONTRACT}_VERIFY_MODEL_REFERENCE_FAILED`);
  if (finite(verifiedRest.workersMin, -1) !== 0 || finite(verifiedRest.workersMax, -1) !== 0) throw new Error(`${CONTRACT}_VERIFY_ZERO_IDLE_FAILED`);
  if (verifiedHealth.jobs.in_queue > 0 || verifiedHealth.jobs.in_progress > 0 || workerCount(verifiedHealth) > 0) throw new Error(`${CONTRACT}_VERIFY_HEALTH_NOT_IDLE`);
  const allVolumesAfter = normalizeRows(volumesAfterRaw, ["networkVolumes"]);
  const beforeIds = allVolumesBefore.map((entry) => text(entry?.id)).filter(Boolean).sort();
  const afterIds = allVolumesAfter.map((entry) => text(entry?.id)).filter(Boolean).sort();
  if (JSON.stringify(beforeIds) !== JSON.stringify(afterIds)) throw new Error(`${CONTRACT}_NETWORK_VOLUME_SET_CHANGED`);
  if (!allVolumesAfter.some((entry) => text(entry?.id) === attachedBefore[0] && text(entry?.name) === canonicalVolumeName)) throw new Error(`${CONTRACT}_CANONICAL_STORAGE_NOT_PRESERVED`);

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    endpoint_id: ENDPOINT_ID,
    endpoint_name: ENDPOINT_NAME,
    model_reference: MODEL_REFERENCE,
    scheduling_scope: "GLOBAL",
    endpoint_network_volume_attached: false,
    endpoint_datacenter_restricted: false,
    canonical_code_storage_preserved: true,
    canonical_code_storage_id: attachedBefore[0],
    canonical_code_storage_name: canonicalVolumeName,
    new_storage_created: false,
    storage_deleted: false,
    workers_min: 0,
    workers_max: 0,
    active_workers: 0,
    queued_jobs: 0,
    inference_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  console.log(`${CONTRACT}=PASS`);
} catch (error) {
  if (migrated) {
    try {
      await saveEndpoint(managementKey, endpointInput(initialGraph));
      await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, {
        method: "PATCH",
        body: {
          workersMin: 0,
          workersMax: 0,
          networkVolumeId: attachedBefore[0],
          networkVolumeIds: [{ networkVolumeId: attachedBefore[0] }],
        },
      });
    } catch (rollbackError) {
      throw new Error(`${text(error?.message || error, 1800)} | ROLLBACK_FAILED:${text(rollbackError?.message || rollbackError, 1200)}`);
    }
  }
  throw error;
}
