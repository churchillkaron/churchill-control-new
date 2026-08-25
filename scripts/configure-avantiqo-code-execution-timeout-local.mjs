import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_CODE_EXECUTION_TIMEOUT_GUARD_V1";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const TARGET_EXECUTION_TIMEOUT_MS = 21 * 60 * 1000;
const AVANTIQO_CONTROLLER_JOB_TIMEOUT_MS = 20 * 60 * 1000;

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value)
    ? text(value).split(",").map((entry) => entry.trim()).filter(Boolean)
    : [];
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}

function snapshot(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    template_id: text(endpoint?.templateId || endpoint?.template?.id) || null,
    gpu_type_ids: unique(list(endpoint?.gpuTypeIds)),
    data_center_ids: unique(list(endpoint?.dataCenterIds)),
    network_volume_ids: endpointVolumeIds(endpoint),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    idle_timeout_seconds: finite(endpoint?.idleTimeout),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout),
    scaler_type: text(endpoint?.scalerType) || null,
    scaler_value: finite(endpoint?.scalerValue),
    flashboot: endpoint?.flashBoot ?? endpoint?.flashboot ?? null,
  };
}

function healthCounters(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      initializing: finite(workers.initializing, 0),
      running: finite(workers.running, 0),
      unhealthy: finite(workers.unhealthy, 0),
      ready: finite(workers.ready, 0),
      idle: finite(workers.idle, 0),
      throttled: finite(workers.throttled, 0),
    },
  };
}

function blockingActivity(health) {
  return (
    health.jobs.in_queue +
    health.jobs.in_progress +
    health.workers.initializing +
    health.workers.running +
    health.workers.unhealthy
  );
}

function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function assertUnrelatedPreserved(before, after, prefix) {
  for (const key of [
    "id",
    "name",
    "template_id",
    "workers_min",
    "workers_max",
    "idle_timeout_seconds",
    "scaler_type",
    "scaler_value",
    "flashboot",
  ]) {
    if (before[key] !== after[key]) {
      throw new Error(`${prefix}_UNRELATED_FIELD_CHANGED:${key}`);
    }
  }
  if (!sameSet(before.gpu_type_ids, after.gpu_type_ids)) {
    throw new Error(`${prefix}_GPU_POOL_CHANGED`);
  }
  if (!sameSet(before.data_center_ids, after.data_center_ids)) {
    throw new Error(`${prefix}_DATACENTER_CHANGED`);
  }
  if (!sameSet(before.network_volume_ids, after.network_volume_ids)) {
    throw new Error(`${prefix}_NETWORK_VOLUME_CHANGED`);
  }
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`);
  }
  return body;
}

async function rest(path, key, options = {}) {
  return readJson(await fetch(`${REST}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_CODE_EXECUTION_TIMEOUT_REST");
}

async function health(endpointId, key) {
  return readJson(await fetch(`${SERVERLESS}/${encodeURIComponent(endpointId)}/health`, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_CODE_EXECUTION_TIMEOUT_HEALTH");
}

function resolveEndpoint(endpoints, configuredId) {
  const matches = configuredId
    ? endpoints.filter((endpoint) => text(endpoint?.id) === configuredId)
    : endpoints.filter((endpoint) => text(endpoint?.name) === CODE_ENDPOINT_NAME);
  if (matches.length !== 1 || text(matches[0]?.name) !== CODE_ENDPOINT_NAME) {
    throw new Error(`AVANTIQO_CODE_EXECUTION_TIMEOUT_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  return matches[0];
}

const envPath = resolve(process.cwd(), ".env.local");
const localEnvLoaded = existsSync(envPath);
if (localEnvLoaded) loadEnvFile(envPath);

const apply = process.argv.includes("--apply");
if (apply && text(process.env.AVANTIQO_CODE_EXECUTION_TIMEOUT_APPROVED).toUpperCase() !== "YES") {
  throw new Error("AVANTIQO_CODE_EXECUTION_TIMEOUT_APPROVED=YES_REQUIRED");
}

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
const apiKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || text(process.env.RUNPOD_API_KEY);
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
if (!apiKey) throw new Error("RUNPOD_AVANTIQO_CODE_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");

const endpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
if (!Array.isArray(endpoints)) throw new Error("AVANTIQO_CODE_EXECUTION_TIMEOUT_ENDPOINT_LIST_INVALID");
const endpoint = resolveEndpoint(endpoints, configuredEndpointId);
const endpointId = text(endpoint?.id);
const before = snapshot(endpoint);
const beforeHealth = healthCounters(await health(endpointId, apiKey));

if (blockingActivity(beforeHealth) !== 0) {
  throw new Error(`AVANTIQO_CODE_EXECUTION_TIMEOUT_LIVE_WORK_BLOCKS_CHANGE:${JSON.stringify(beforeHealth)}`);
}

const mutationRequired = finite(before.execution_timeout_ms, 0) < TARGET_EXECUTION_TIMEOUT_MS;
console.log(JSON.stringify({
  event: "AVANTIQO_CODE_EXECUTION_TIMEOUT_GUARD_START",
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  local_env_loaded: localEnvLoaded,
  endpoint_id: endpointId,
  endpoint_before: before,
  health_before: beforeHealth,
  target_execution_timeout_ms: TARGET_EXECUTION_TIMEOUT_MS,
  target_execution_timeout_seconds: TARGET_EXECUTION_TIMEOUT_MS / 1000,
  avantiqo_controller_job_timeout_ms: AVANTIQO_CONTROLLER_JOB_TIMEOUT_MS,
  provider_timeout_headroom_ms: TARGET_EXECUTION_TIMEOUT_MS - AVANTIQO_CONTROLLER_JOB_TIMEOUT_MS,
  mutation_required: mutationRequired,
  provider_job_submitted: false,
  generation_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_CODE_EXECUTION_TIMEOUT_GUARD_PLAN=READY");
  process.exit(0);
}

if (!mutationRequired) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    status: "ALREADY_SUFFICIENT",
    mutation_performed: false,
    endpoint: before,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  process.exit(0);
}

const fresh = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
const freshSnapshot = snapshot(fresh);
assertUnrelatedPreserved(before, freshSnapshot, "AVANTIQO_CODE_EXECUTION_TIMEOUT_CONCURRENT_STATE");
if (freshSnapshot.execution_timeout_ms !== before.execution_timeout_ms) {
  throw new Error(
    `AVANTIQO_CODE_EXECUTION_TIMEOUT_CONCURRENT_CHANGE:before=${before.execution_timeout_ms}:fresh=${freshSnapshot.execution_timeout_ms}`,
  );
}
const freshHealth = healthCounters(await health(endpointId, apiKey));
if (blockingActivity(freshHealth) !== 0) {
  throw new Error(`AVANTIQO_CODE_EXECUTION_TIMEOUT_BECAME_BUSY:${JSON.stringify(freshHealth)}`);
}

await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
  method: "PATCH",
  body: { executionTimeoutMs: TARGET_EXECUTION_TIMEOUT_MS },
});

const verified = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
const after = snapshot(verified);
assertUnrelatedPreserved(before, after, "AVANTIQO_CODE_EXECUTION_TIMEOUT_VERIFY");
if (after.execution_timeout_ms !== TARGET_EXECUTION_TIMEOUT_MS) {
  throw new Error(
    `AVANTIQO_CODE_EXECUTION_TIMEOUT_VERIFY_FAILED:actual=${after.execution_timeout_ms}:expected=${TARGET_EXECUTION_TIMEOUT_MS}`,
  );
}

console.log("AVANTIQO_CODE_EXECUTION_TIMEOUT_GUARD=COMPLETE");
console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  status: "CONFIGURED",
  mutation_performed: true,
  before_execution_timeout_ms: before.execution_timeout_ms,
  after_execution_timeout_ms: after.execution_timeout_ms,
  endpoint_after: after,
  preserved: {
    template: true,
    gpu_pool: true,
    data_centers: true,
    network_volume: true,
    workers_min: true,
    workers_max: true,
    idle_timeout: true,
    scaler: true,
    flashboot: true,
  },
  provider_job_submitted: false,
  generation_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
