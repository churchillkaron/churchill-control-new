import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvFile } from "node:process";

const CONTRACT = "AVANTIQO_CODE_AUTONOMOUS_REPAIR_RUNPOD_INSPECTOR_V1";
const CODE_ENDPOINT_NAME = "avantiqo-code-v1";
const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";
const GRAPHQL = "https://api.runpod.io/graphql";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function loadLocalEnvironment() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return false;
  loadEnvFile(path);
  return true;
}

function endpointVolumeIds(endpoint = {}) {
  return [...new Set([
    text(endpoint.networkVolumeId),
    ...list(endpoint.networkVolumeIds).map(text),
  ].filter(Boolean))];
}

function endpointDataCenters(endpoint = {}) {
  if (Array.isArray(endpoint.dataCenterIds)) return endpoint.dataCenterIds.map(text).filter(Boolean);
  if (text(endpoint.dataCenterIds)) {
    return text(endpoint.dataCenterIds).split(",").map((entry) => entry.trim()).filter(Boolean);
  }
  return [];
}

function endpointGpuTypes(endpoint = {}) {
  return list(endpoint.gpuTypeIds).map(text).filter(Boolean);
}

function healthCounters(health = {}) {
  const jobs = health.jobs || {};
  const workers = health.workers || {};
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

function stockRank(value) {
  return ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[text(value).toUpperCase()] || 0);
}

async function jsonRequest(url, { key, method = "GET", body = null } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
  if (!response.ok) {
    throw new Error(`RUNPOD_HTTP_${response.status}:${text(parsed?.message || parsed?.error || raw).slice(0, 500)}`);
  }
  return parsed;
}

async function resolveEndpoint(managementKey, configuredId) {
  const endpoints = await jsonRequest(`${REST}/endpoints?includeTemplate=true&includeWorkers=true`, { key: managementKey });
  if (!Array.isArray(endpoints)) throw new Error("RUNPOD_ENDPOINT_LIST_INVALID");
  const matches = configuredId
    ? endpoints.filter((endpoint) => text(endpoint?.id) === configuredId)
    : endpoints.filter((endpoint) => text(endpoint?.name) === CODE_ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`RUNPOD_CODE_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  if (text(matches[0]?.name) !== CODE_ENDPOINT_NAME) {
    throw new Error(`RUNPOD_CODE_ENDPOINT_NAME_MISMATCH:${text(matches[0]?.name) || "missing"}`);
  }
  return matches[0];
}

async function gpuAvailability(managementKey) {
  const query = `
    query AvantiqoCodeRepairQueueInspection($input: GpuAvailabilityInput) {
      dataCenters {
        id
        name
        location
        storageSupport
        gpuAvailability(input: $input) {
          available
          stockStatus
          gpuTypeId
          gpuTypeDisplayName
          displayName
        }
      }
    }
  `;
  const response = await fetch(`${GRAPHQL}?api_key=${encodeURIComponent(managementKey)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      variables: {
        input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 80, secureCloud: true },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    throw new Error(`RUNPOD_GPU_AVAILABILITY_FAILED:${response.status}:${text(body?.errors?.[0]?.message || raw).slice(0, 500)}`);
  }
  return body.data.dataCenters;
}

function classify({ status, health, capacity }) {
  const queued = status === "IN_QUEUE" || health.jobs.in_queue > 0;
  if (health.workers.unhealthy > 0) return "WORKER_UNHEALTHY";
  if (queued && health.workers.initializing > 0) return "WORKER_COLD_START_IN_PROGRESS";
  if (queued && (health.workers.ready + health.workers.running + health.workers.idle) > 0) {
    return "QUEUE_DELAY_WITH_AVAILABLE_WORKER";
  }
  const stocked = capacity.filter((entry) => entry.available && entry.stock_rank > 0);
  if (queued && capacity.length > 0 && stocked.length === 0) return "NO_BOUND_GPU_STOCK";
  if (queued && stocked.length > 0 && health.workers.initializing === 0 && health.workers.ready === 0 && health.workers.running === 0 && health.workers.idle === 0) {
    return "GPU_STOCK_REPORTED_BUT_NO_WORKER_STARTED";
  }
  if (queued) return "QUEUE_WITHOUT_WORKER_SIGNAL";
  return "NO_QUEUE_BLOCKER_DETECTED";
}

function classifyExecution(status, output = {}) {
  if (status !== "COMPLETED") return "JOB_NOT_COMPLETED";
  if (text(output?.status).toLowerCase() === "engine_load_failed") return "ENGINE_LOAD_FAILED_PAYLOAD";
  if (text(output?.error_code)) return "WORKER_ERROR_PAYLOAD";
  if (!text(output?.result)) return "COMPLETED_WITHOUT_RESULT";
  return "RESULT_PRESENT";
}

const localEnvLoaded = loadLocalEnvironment();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY);
const apiKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || text(process.env.RUNPOD_API_KEY);
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID);
const jobId = text(process.argv[2] || process.env.AVANTIQO_CODE_AUTONOMOUS_REPAIR_JOB_ID);

if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_API_KEY_REQUIRED");
if (!apiKey) throw new Error("RUNPOD_AVANTIQO_CODE_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");
if (!jobId) throw new Error("CODE_AUTONOMOUS_REPAIR_JOB_ID_REQUIRED");

const [endpoint, volumes, dataCenters] = await Promise.all([
  resolveEndpoint(managementKey, configuredEndpointId),
  jsonRequest(`${REST}/networkvolumes`, { key: managementKey }),
  gpuAvailability(managementKey),
]);

const endpointId = text(endpoint?.id);
if (!endpointId) throw new Error("RUNPOD_CODE_ENDPOINT_ID_REQUIRED_AFTER_RESOLUTION");

const [healthRaw, job] = await Promise.all([
  jsonRequest(`${SERVERLESS}/${encodeURIComponent(endpointId)}/health`, { key: apiKey }),
  jsonRequest(`${SERVERLESS}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`, { key: apiKey }),
]);

const health = healthCounters(healthRaw || {});
const volumeIds = endpointVolumeIds(endpoint);
const attachedVolumes = list(volumes)
  .filter((volume) => volumeIds.includes(text(volume?.id)))
  .map((volume) => ({
    id: text(volume?.id) || null,
    name: text(volume?.name) || null,
    data_center_id: text(volume?.dataCenterId || volume?.data_center_id) || null,
    size_gb: number(volume?.size ?? volume?.sizeGb, null),
  }));
const volumeDataCenters = [...new Set(attachedVolumes.map((volume) => volume.data_center_id).filter(Boolean))];
const explicitDataCenters = endpointDataCenters(endpoint);
const effectiveDataCenters = volumeDataCenters.length ? volumeDataCenters : explicitDataCenters;
const gpuTypeIds = endpointGpuTypes(endpoint);
const capacity = [];
for (const dataCenterId of effectiveDataCenters) {
  const dataCenter = list(dataCenters).find((candidate) => text(candidate?.id) === dataCenterId);
  for (const gpuTypeId of gpuTypeIds) {
    const gpu = list(dataCenter?.gpuAvailability).find((candidate) => text(candidate?.gpuTypeId) === gpuTypeId) || null;
    capacity.push({
      data_center_id: dataCenterId,
      gpu_type_id: gpuTypeId,
      gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName) || null,
      available: gpu?.available === true,
      stock_status: text(gpu?.stockStatus) || "UNAVAILABLE",
      stock_rank: stockRank(gpu?.stockStatus),
      returned_by_api: Boolean(gpu),
    });
  }
}

const status = text(job?.status).toUpperCase() || "UNKNOWN";
const output = job?.output && typeof job.output === "object" ? job.output : {};
const result = text(output?.result);
const diagnosis = classify({ status, health, capacity });
const executionDiagnosis = classifyExecution(status, output);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  local_env_loaded: localEnvLoaded,
  provider_job_submitted: false,
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
  job: {
    id: jobId,
    status,
    delay_ms: number(job?.delayTime, null),
    execution_ms: number(job?.executionTime, null),
    output: {
      status: text(output?.status) || null,
      provider: text(output?.provider) || null,
      model: text(output?.model) || null,
      engine_contract: text(output?.engine_contract) || null,
      capability: text(output?.capability) || null,
      foundation_model: text(output?.foundation_model) || null,
      runtime_model: text(output?.runtime_model) || null,
      serving_runtime: text(output?.serving_runtime) || null,
      quantization: text(output?.quantization) || null,
      error_code: text(output?.error_code) || null,
      error_type: text(output?.error_type) || null,
      error_message: text(output?.error_message).slice(0, 1000) || null,
      result_present: Boolean(result),
      result_length: result.length,
      result_preview: result ? result.slice(0, 400) : null,
      usage: output?.usage && typeof output.usage === "object" ? output.usage : null,
      raw_reasoning_persisted: output?.raw_reasoning_persisted ?? null,
    },
  },
  endpoint: {
    id: endpointId,
    name: text(endpoint?.name) || null,
    workers_min: number(endpoint?.workersMin),
    workers_max: number(endpoint?.workersMax),
    scaler_type: text(endpoint?.scalerType) || null,
    scaler_value: number(endpoint?.scalerValue, null),
    idle_timeout_seconds: number(endpoint?.idleTimeout, null),
    gpu_type_ids: gpuTypeIds,
    explicit_data_center_ids: explicitDataCenters,
    effective_data_center_ids: effectiveDataCenters,
    effective_placement_source: volumeDataCenters.length ? "NETWORK_VOLUME_DATACENTER" : "ENDPOINT_DATACENTER_RESTRICTION",
    attached_network_volumes: attachedVolumes,
  },
  health,
  bound_gpu_capacity: capacity,
  diagnosis,
  execution_diagnosis: executionDiagnosis,
}, null, 2));
