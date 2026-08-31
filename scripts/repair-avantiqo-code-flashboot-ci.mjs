import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_FLASHBOOT_REPAIR_V1";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const APPROVAL_ENV = "AVANTIQO_CODE_FLASHBOOT_REPAIR_APPROVED";
const REPORT_PATH = process.env.AVANTIQO_CODE_FLASHBOOT_REPAIR_REPORT || "/tmp/avantiqo-code-flashboot-repair.json";

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function approved() {
  return text(process.env[APPROVAL_ENV], 20).toUpperCase() === "YES";
}

function managementKey() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 2000);
  if (!value) throw new Error("RUNPOD_MANAGEMENT_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");
  return value;
}

function queueKey() {
  const value = text(
    process.env.RUNPOD_AVANTIQO_CODE_API_KEY ||
      process.env.RUNPOD_API_KEY ||
      process.env.RUNPOD_MANAGEMENT_API_KEY,
    2000,
  );
  if (!value) throw new Error("RUNPOD_CODE_RUNTIME_KEY_REQUIRED");
  return value;
}

async function responseJson(response, label) {
  const raw = await response.text();
  let body = {};
  try {
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = { message: raw };
  }
  if (!response.ok) {
    throw new Error(
      `${label}_HTTP_${response.status}:${text(body?.detail || body?.error?.message || body?.error || body?.message || raw, 1200) || "UNKNOWN"}`,
    );
  }
  return body;
}

async function graphql(query, variables, key) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await responseJson(response, `${CONTRACT}_GRAPHQL`);
  if (list(body.errors).length) {
    throw new Error(
      `${CONTRACT}_GRAPHQL_ERROR:${list(body.errors)
        .map((entry) => text(entry?.message, 500))
        .filter(Boolean)
        .join(" | ")
        .slice(0, 1400)}`,
    );
  }
  return body;
}

async function health(key) {
  const response = await fetch(`${QUEUE_BASE}/${ENDPOINT_ID}/health`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  return responseJson(response, `${CONTRACT}_HEALTH`);
}

function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: number(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      idle: number(workers.idle, 0),
      initializing: number(workers.initializing, 0),
      ready: number(workers.ready, 0),
      running: number(workers.running, 0),
      throttled: number(workers.throttled, 0),
      unhealthy: number(workers.unhealthy, 0),
    },
  };
}

function assertNoLiveWork(summary, phase) {
  if (summary.jobs.in_queue !== 0 || summary.jobs.in_progress !== 0) {
    throw new Error(`${phase}_LIVE_JOBS_PRESENT:${JSON.stringify(summary.jobs)}`);
  }
  const workerCount = Object.values(summary.workers).reduce(
    (sum, value) => sum + Math.max(0, number(value, 0)),
    0,
  );
  if (workerCount !== 0) {
    throw new Error(`${phase}_LIVE_WORKERS_PRESENT:${JSON.stringify(summary.workers)}`);
  }
}

const ENDPOINT_QUERY = `
query AvantiqoCodeFlashBootEndpointRead {
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
mutation AvantiqoCodeFlashBootEndpointSave($input: EndpointInput!) {
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

async function endpoint(key) {
  const body = await graphql(ENDPOINT_QUERY, {}, key);
  const matches = list(body?.data?.myself?.endpoints).filter(
    (candidate) => text(candidate?.id) === ENDPOINT_ID,
  );
  if (matches.length !== 1) {
    throw new Error(`${CONTRACT}_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  }
  const value = matches[0];
  if (text(value.name) !== ENDPOINT_NAME) {
    throw new Error(`${CONTRACT}_ENDPOINT_NAME_MISMATCH:${text(value.name) || "NONE"}`);
  }
  return value;
}

function endpointSummary(value = {}) {
  return {
    id: text(value.id),
    name: text(value.name),
    template_id: text(value.templateId) || null,
    gpu_ids: text(value.gpuIds) || null,
    gpu_count: number(value.gpuCount, 1),
    workers_min: number(value.workersMin, -1),
    workers_max: number(value.workersMax, -1),
    idle_timeout_seconds: number(value.idleTimeout, -1),
    scaler_type: text(value.scalerType) || null,
    scaler_value: number(value.scalerValue, null),
    flashboot_type: text(value.flashBootType).toUpperCase() || null,
    network_volume_id: text(value.networkVolumeId) || null,
    network_volume_ids: list(value.networkVolumeIds)
      .map((entry) => text(entry?.networkVolumeId || entry))
      .filter(Boolean),
    model_references: list(value.modelReferences).map((entry) => text(entry)).filter(Boolean),
  };
}

function preservedInput(value = {}) {
  const name = text(value.name);
  const templateId = text(value.templateId);
  const gpuIds = text(value.gpuIds);
  if (!name || !templateId || !gpuIds) {
    throw new Error(`${CONTRACT}_REQUIRED_ENDPOINT_FIELDS_MISSING`);
  }
  if (number(value.workersMin, -1) !== 0) {
    throw new Error(`${CONTRACT}_WORKERS_MIN_MUST_REMAIN_ZERO:${number(value.workersMin, -1)}`);
  }
  const workersMax = number(value.workersMax, -1);
  if (![0, 1].includes(workersMax)) {
    throw new Error(`${CONTRACT}_WORKERS_MAX_UNEXPECTED:${workersMax}`);
  }

  const networkVolumeIds = list(value.networkVolumeIds)
    .map((entry) => ({
      networkVolumeId: text(entry?.networkVolumeId || entry),
    }))
    .filter((entry) => entry.networkVolumeId);

  return {
    id: ENDPOINT_ID,
    name,
    templateId,
    gpuIds,
    gpuCount: Math.max(1, number(value.gpuCount, 1)),
    instanceIds: list(value.instanceIds),
    workersMin: 0,
    workersMax,
    locations: text(value.locations),
    networkVolumeId: text(value.networkVolumeId),
    networkVolumeIds,
    idleTimeout: Math.max(1, number(value.idleTimeout, 60)),
    scalerType: text(value.scalerType) || "QUEUE_DELAY",
    scalerValue: Math.max(1, number(value.scalerValue, 1)),
    executionTimeoutMs: Math.max(1, number(value.executionTimeoutMs, 1_260_000)),
    minCudaVersion: text(value.minCudaVersion),
    flashBootType: "FLASHBOOT",
    modelReferences: list(value.modelReferences).map((entry) => text(entry)).filter(Boolean),
  };
}

function preserved(before, after) {
  const fields = [
    "id",
    "name",
    "template_id",
    "gpu_ids",
    "gpu_count",
    "workers_min",
    "workers_max",
    "idle_timeout_seconds",
    "scaler_type",
    "scaler_value",
    "network_volume_id",
  ];
  return fields.every((field) => JSON.stringify(before[field]) === JSON.stringify(after[field])) &&
    JSON.stringify(before.network_volume_ids) === JSON.stringify(after.network_volume_ids) &&
    JSON.stringify(before.model_references) === JSON.stringify(after.model_references);
}

async function writeReport(value) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(REPORT_PATH, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

if (!approved()) {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const management = managementKey();
const runtime = queueKey();
const beforeRaw = await endpoint(management);
const before = endpointSummary(beforeRaw);
const healthBefore = healthSummary(await health(runtime));
assertNoLiveWork(healthBefore, `${CONTRACT}_BEFORE`);

if (before.flashboot_type === "FLASHBOOT") {
  const report = {
    success: true,
    contract: CONTRACT,
    endpoint_id: ENDPOINT_ID,
    status: "FLASHBOOT_ALREADY_ENABLED",
    before,
    after: before,
    health_before: healthBefore,
    health_after: healthBefore,
    mutation_performed: false,
    generation_submitted: false,
    provider_inference_performed: false,
    wallet_mutation_performed: false,
    gpu_worker_started_by_repair: false,
    production_deploy_performed: false,
    secrets_printed: false,
  };
  await writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const input = preservedInput(beforeRaw);
const savedBody = await graphql(SAVE_ENDPOINT_MUTATION, { input }, management);
const saved = savedBody?.data?.saveEndpoint;
if (!saved || text(saved.id) !== ENDPOINT_ID) {
  throw new Error(`${CONTRACT}_SAVE_RESPONSE_INVALID`);
}

const afterRaw = await endpoint(management);
const after = endpointSummary(afterRaw);
const healthAfter = healthSummary(await health(runtime));
assertNoLiveWork(healthAfter, `${CONTRACT}_AFTER`);

if (after.flashboot_type !== "FLASHBOOT") {
  throw new Error(`${CONTRACT}_FLASHBOOT_VERIFY_FAILED:${after.flashboot_type || "NONE"}`);
}
if (!preserved(before, after)) {
  throw new Error(`${CONTRACT}_NON_FLASHBOOT_CONFIGURATION_CHANGED`);
}

const report = {
  success: true,
  contract: CONTRACT,
  endpoint_id: ENDPOINT_ID,
  status: "FLASHBOOT_ENABLED_VERIFIED",
  before,
  after,
  health_before: healthBefore,
  health_after: healthAfter,
  mutation_performed: true,
  generation_submitted: false,
  provider_inference_performed: false,
  wallet_mutation_performed: false,
  gpu_worker_started_by_repair: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

await writeReport(report);
console.log(JSON.stringify(report, null, 2));
