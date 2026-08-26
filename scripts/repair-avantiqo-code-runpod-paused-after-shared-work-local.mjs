import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

const CONTRACT = "AVANTIQO_CODE_RUNPOD_SHARED_RESOURCE_RESUME_V1";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const ALLOWED_SHARED_ENDPOINTS = new Set([
  "avantiqo-intelligence-v1",
  "avantiqo-intelligence-trainer-v1",
  "avantiqo-intelligence-candidate-v1",
  CODE_ENDPOINT_NAME,
]);

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  if (!text(value)) return [];
  return text(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function stableEndpoint(endpoint = {}) {
  return {
    id: text(endpoint.id) || null,
    name: text(endpoint.name) || null,
    template_id: text(endpoint.templateId || endpoint.template?.id) || null,
    gpu_type_ids: unique(list(endpoint.gpuTypeIds)).sort(),
    data_center_ids: unique(list(endpoint.dataCenterIds)).sort(),
    network_volume_ids: endpointVolumeIds(endpoint).sort(),
    idle_timeout_seconds: number(endpoint.idleTimeout, null),
    execution_timeout_ms: number(endpoint.executionTimeoutMs ?? endpoint.executionTimeout, null),
    scaler_type: text(endpoint.scalerType) || null,
    scaler_value: number(endpoint.scalerValue, null),
    flashboot: endpoint.flashBoot ?? endpoint.flashboot ?? null,
  };
}

function healthCounters(body = {}) {
  const jobs = body.jobs || {};
  const workers = body.workers || {};
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
      completed: number(jobs.completed),
      failed: number(jobs.failed),
      retried: number(jobs.retried),
    },
    workers: {
      idle: number(workers.idle),
      initializing: number(workers.initializing),
      ready: number(workers.ready),
      running: number(workers.running),
      throttled: number(workers.throttled),
      unhealthy: number(workers.unhealthy),
    },
  };
}

function activeSharedWork(health) {
  return (
    health.jobs.in_queue > 0 ||
    health.jobs.in_progress > 0 ||
    health.workers.idle > 0 ||
    health.workers.initializing > 0 ||
    health.workers.ready > 0 ||
    health.workers.running > 0 ||
    health.workers.throttled > 0 ||
    health.workers.unhealthy > 0
  );
}

function codeExecutionActivity(health) {
  return Boolean(health) && (
    health.jobs.in_progress > 0 ||
    health.workers.idle > 0 ||
    health.workers.initializing > 0 ||
    health.workers.ready > 0 ||
    health.workers.running > 0 ||
    health.workers.throttled > 0 ||
    health.workers.unhealthy > 0
  );
}

function runpodErrorDetail(body, raw = "") {
  const candidates = [
    body?.detail,
    body?.message?.detail,
    body?.error?.detail,
    body?.message,
    body?.error?.message,
    body?.error,
    raw,
  ];
  const detail = candidates
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .find(Boolean) || "UNKNOWN";
  const code = text(body?.code || body?.message?.code || body?.error?.code);
  const title = text(body?.title || body?.message?.title || body?.error?.title);
  return [code, title, detail].filter(Boolean).join(":").slice(0, 1200);
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`RUNPOD_HTTP_${response.status}:${runpodErrorDetail(body, raw)}`);
  }
  return body ?? {};
}

async function managementEndpoints(key) {
  const body = await requestJson(
    `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`,
    key,
  );
  if (!Array.isArray(body)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  return body;
}

async function queueHealth(endpointId, key) {
  return healthCounters(
    await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key),
  );
}

const envPath = resolve(process.cwd(), ".env.local");
const localEnvLoaded = existsSync(envPath);
if (localEnvLoaded) loadEnvFile(envPath);

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const queueKey = text(
  process.env.RUNPOD_AVANTIQO_CODE_API_KEY ||
  process.env.RUNPOD_API_KEY ||
  process.env.RUNPOD_MANAGEMENT_API_KEY,
);
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
const apply = process.argv.includes("--apply");

if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");
if (!queueKey) throw new Error("RUNPOD_CODE_QUEUE_API_KEY_REQUIRED");
if (apply && !yes(process.env.AVANTIQO_CODE_SHARED_RESOURCE_RESUME_APPROVED)) {
  throw new Error("AVANTIQO_CODE_SHARED_RESOURCE_RESUME_APPROVED=YES_REQUIRED");
}

let endpoints = await managementEndpoints(managementKey);
let codeMatches = configuredEndpointId
  ? endpoints.filter((endpoint) => text(endpoint.id) === configuredEndpointId)
  : endpoints.filter((endpoint) => text(endpoint.name) === CODE_ENDPOINT_NAME);
if (codeMatches.length !== 1 || text(codeMatches[0].name) !== CODE_ENDPOINT_NAME) {
  throw new Error(`AVANTIQO_CODE_SHARED_RESUME_ENDPOINT_RESOLUTION_FAILED:matches=${codeMatches.length}`);
}

let code = codeMatches[0];
const beforeStable = stableEndpoint(code);
const beforeWorkers = {
  min: number(code.workersMin, null),
  max: number(code.workersMax, null),
};
if (beforeWorkers.min !== 0) {
  throw new Error(`AVANTIQO_CODE_SHARED_RESUME_WORKERS_MIN_INVALID:${beforeWorkers.min}`);
}
if (![0, 1].includes(beforeWorkers.max)) {
  throw new Error(`AVANTIQO_CODE_SHARED_RESUME_WORKERS_MAX_INVALID:${beforeWorkers.max}`);
}
if (!beforeStable.network_volume_ids.length) {
  throw new Error("AVANTIQO_CODE_SHARED_RESUME_NETWORK_VOLUME_REQUIRED");
}

const sharedPeers = endpoints.filter((endpoint) =>
  endpointVolumeIds(endpoint).some((volumeId) => beforeStable.network_volume_ids.includes(volumeId)),
);
for (const peer of sharedPeers) {
  if (!ALLOWED_SHARED_ENDPOINTS.has(text(peer.name))) {
    throw new Error(`AVANTIQO_CODE_SHARED_RESUME_UNEXPECTED_VOLUME_USER:${text(peer.name) || "UNKNOWN"}`);
  }
}

const peerHealth = [];
for (const peer of sharedPeers) {
  const id = text(peer.id);
  if (!id) continue;
  const health = await queueHealth(id, queueKey);
  const name = text(peer.name) || null;
  peerHealth.push({
    id,
    name,
    workers_min: number(peer.workersMin, null),
    workers_max: number(peer.workersMax, null),
    health,
    active_shared_work: activeSharedWork(health),
    code_execution_activity: name === CODE_ENDPOINT_NAME
      ? codeExecutionActivity(health)
      : null,
  });
}

const blockingPeers = peerHealth.filter(
  (peer) => peer.name !== CODE_ENDPOINT_NAME && peer.active_shared_work,
);
const codeHealth = peerHealth.find((peer) => peer.name === CODE_ENDPOINT_NAME) || null;
const codeResumeConflict = codeExecutionActivity(codeHealth?.health);
const codeQueuedJobs = number(codeHealth?.health?.jobs?.in_queue);

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  local_env_loaded: localEnvLoaded,
  endpoint: {
    id: beforeStable.id,
    name: beforeStable.name,
    workers_min: beforeWorkers.min,
    workers_max: beforeWorkers.max,
    network_volume_ids: beforeStable.network_volume_ids,
  },
  shared_peers: peerHealth,
  blocking_peer_count: blockingPeers.length,
  code_queued_jobs: codeQueuedJobs,
  code_execution_activity: codeResumeConflict,
  own_queued_jobs_allowed_during_resume: true,
  paused: beforeWorkers.max === 0,
  safe_to_resume: beforeWorkers.max === 0 && blockingPeers.length === 0 && !codeResumeConflict,
  mutation_required: beforeWorkers.max === 0,
  provider_job_submitted: false,
  queue_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

if (beforeWorkers.max === 1) {
  console.log(JSON.stringify({
    ...plan,
    success: true,
    mutation_performed: false,
    reason: "ALREADY_RESUMED",
  }, null, 2));
  process.exit(0);
}
if (blockingPeers.length) {
  throw new Error(
    `AVANTIQO_CODE_SHARED_RESUME_BLOCKED_BY_ACTIVE_PEER:${blockingPeers.map((peer) => peer.name).join("|")}`,
  );
}
if (codeResumeConflict) {
  throw new Error("AVANTIQO_CODE_SHARED_RESUME_CODE_EXECUTION_ALREADY_ACTIVE");
}

endpoints = await managementEndpoints(managementKey);
codeMatches = endpoints.filter((endpoint) => text(endpoint.id) === beforeStable.id);
if (codeMatches.length !== 1 || text(codeMatches[0].name) !== CODE_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_CODE_SHARED_RESUME_ENDPOINT_CHANGED_BEFORE_WRITE");
}
code = codeMatches[0];
const freshStable = stableEndpoint(code);
if (JSON.stringify(freshStable) !== JSON.stringify(beforeStable)) {
  throw new Error("AVANTIQO_CODE_SHARED_RESUME_STABLE_ENDPOINT_CHANGED_BEFORE_WRITE");
}
if (number(code.workersMin, null) !== 0 || number(code.workersMax, null) !== 0) {
  throw new Error(
    `AVANTIQO_CODE_SHARED_RESUME_SCALING_CHANGED_BEFORE_WRITE:min=${number(code.workersMin, null)}:max=${number(code.workersMax, null)}`,
  );
}

const freshPeers = endpoints.filter((endpoint) =>
  endpointVolumeIds(endpoint).some((volumeId) => beforeStable.network_volume_ids.includes(volumeId)),
);
for (const peer of freshPeers) {
  const peerName = text(peer.name);
  const health = await queueHealth(text(peer.id), queueKey);
  if (peerName === CODE_ENDPOINT_NAME) {
    if (codeExecutionActivity(health)) {
      throw new Error("AVANTIQO_CODE_SHARED_RESUME_CODE_BECAME_ACTIVE_BEFORE_WRITE");
    }
    continue;
  }
  if (activeSharedWork(health)) {
    throw new Error(`AVANTIQO_CODE_SHARED_RESUME_PEER_BECAME_ACTIVE:${peerName}`);
  }
}

await requestJson(
  `${REST_BASE}/endpoints/${encodeURIComponent(beforeStable.id)}`,
  managementKey,
  {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 1 },
  },
);

const verifiedEndpoints = await managementEndpoints(managementKey);
const verified = verifiedEndpoints.find((endpoint) => text(endpoint.id) === beforeStable.id);
if (!verified) throw new Error("AVANTIQO_CODE_SHARED_RESUME_VERIFY_ENDPOINT_MISSING");
const afterStable = stableEndpoint(verified);
if (JSON.stringify(afterStable) !== JSON.stringify(beforeStable)) {
  throw new Error("AVANTIQO_CODE_SHARED_RESUME_UNRELATED_ENDPOINT_FIELD_CHANGED");
}
if (number(verified.workersMin, null) !== 0 || number(verified.workersMax, null) !== 1) {
  throw new Error(
    `AVANTIQO_CODE_SHARED_RESUME_VERIFY_FAILED:min=${number(verified.workersMin, null)}:max=${number(verified.workersMax, null)}`,
  );
}

console.log(JSON.stringify({
  ...plan,
  success: true,
  mutation_performed: true,
  before: { workers_min: 0, workers_max: 0 },
  after: { workers_min: 0, workers_max: 1 },
  existing_queued_code_jobs_preserved: true,
  unrelated_endpoint_fields_preserved: true,
  provider_job_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));