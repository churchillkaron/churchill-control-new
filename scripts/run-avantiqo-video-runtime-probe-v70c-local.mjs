#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  activeManagementWorkers,
  assertVideoProductionUnchanged,
  endpointGpuTypeIds,
  inspectVideo32gbCandidate,
  managementHourlyCost,
  runpodGraphql,
  runpodRest,
  stableEndpointSnapshot,
  text,
  workersMax,
  workersMin,
} from "./lib/avantiqo-video-32gb-candidate-contract-v69.mjs";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VIDEO_RUNTIME_PROBE_V70C";
const APPROVAL_ENV = "AVANTIQO_VIDEO_RUNTIME_PROBE_V70C_APPROVED";
const ENDPOINT_NAME = "avantiqo-video-32gb-candidate-v1";
const DATA_CENTER_ID = "EU-RO-1";
const SAFE_LEASE = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
const SAFE_LEASE_LANE = "video-32gb-candidate";
const CHILD = "scripts/run-avantiqo-video-runtime-probe-v70c-child-local.mjs";
const SERVERLESS_CANDIDATES = Object.freeze([
  { id: "NVIDIA GeForce RTX 5090", memory_gb: 32, priority: 1 },
  { id: "NVIDIA RTX 5000 Ada Generation", memory_gb: 32, priority: 2 },
  { id: "NVIDIA L40S", memory_gb: 48, priority: 3 },
]);

const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const list = (value) => Array.isArray(value) ? value : [];

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function rank(value) {
  return ({ HIGH: 4, MEDIUM: 3, LOW: 2, AVAILABLE: 1 })[text(value).toUpperCase()] || 0;
}

if (text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const productionEndpointId = required("RUNPOD_AVANTIQO_VIDEO_PRODUCTION_ENDPOINT_ID");
const videoQueueKey = required("RUNPOD_AVANTIQO_VIDEO_API_KEY", process.env.RUNPOD_API_KEY);

const inspected = await inspectVideo32gbCandidate({ managementKey, productionEndpointId });
const candidate = inspected?.candidate_endpoint;
const endpointId = text(candidate?.id);
if (!endpointId || text(candidate?.name) !== ENDPOINT_NAME) {
  throw new Error("AVANTIQO_VIDEO_V70C_CANDIDATE_IDENTITY_INVALID");
}
if (workersMin(candidate) !== 0 || workersMax(candidate) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V70C_CANDIDATE_MUST_START_0_0:${workersMin(candidate)}/${workersMax(candidate)}`);
}
if (activeManagementWorkers(candidate).length !== 0 || managementHourlyCost(candidate) !== 0) {
  throw new Error("AVANTIQO_VIDEO_V70C_ACTIVE_WORKER_PRESENT_AT_START");
}

const productionBefore = inspected.production_endpoint_snapshot;

const capacityQuery = `
  query AvantiqoVideoV70cCapacity($input: GpuAvailabilityInput) {
    gpuTypes { id displayName memoryInGb secureCloud communityCloud }
    dataCenters {
      id
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
const capacity = await runpodGraphql(managementKey, capacityQuery, {
  input: { gpuCount: 1, minDisk: 5, minMemoryInGb: 32, secureCloud: true },
});
const gpuMeta = new Map(list(capacity?.gpuTypes).map((gpu) => [text(gpu?.id), gpu]));
const dc = list(capacity?.dataCenters).find((entry) => text(entry?.id) === DATA_CENTER_ID);
if (!dc) throw new Error(`AVANTIQO_VIDEO_V70C_DATA_CENTER_REQUIRED:${DATA_CENTER_ID}`);

const liveRows = SERVERLESS_CANDIDATES.map((candidateGpu) => {
  const meta = gpuMeta.get(candidateGpu.id) || {};
  const row = list(dc?.gpuAvailability).find((entry) => text(entry?.gpuTypeId) === candidateGpu.id) || null;
  return {
    gpu_type_id: candidateGpu.id,
    configured_memory_gb: candidateGpu.memory_gb,
    reported_memory_gb: finite(meta?.memoryInGb, null),
    secure_cloud: meta?.secureCloud === true,
    available: row?.available === true,
    stock_status: text(row?.stockStatus).toUpperCase() || "UNAVAILABLE",
    stock_rank: rank(row?.stockStatus),
    priority: candidateGpu.priority,
  };
});

const viable = liveRows
  .filter((row) =>
    row.secure_cloud === true &&
    row.available === true &&
    row.stock_rank >= 3 &&
    row.reported_memory_gb !== null &&
    row.reported_memory_gb >= 32 &&
    row.reported_memory_gb < 52
  )
  .sort((a, b) => a.priority - b.priority || b.stock_rank - a.stock_rank)
  .slice(0, 3);

console.log(`AVANTIQO_VIDEO_V70C_CAPACITY=${JSON.stringify({
  data_center_id: DATA_CENTER_ID,
  candidates: liveRows,
  viable_medium_or_high: viable,
  worker_opened: false,
  generation_submitted: false,
})}`);

if (!viable.length) {
  throw new Error(`AVANTIQO_VIDEO_V70C_NO_MEDIUM_HIGH_SERVERLESS_CAPACITY:${JSON.stringify(liveRows)}`);
}

const requestedGpuTypes = viable.map((row) => row.gpu_type_id);
await runpodRest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}`, {
  method: "PATCH",
  body: {
    gpuTypeIds: requestedGpuTypes,
    workersMin: 0,
    workersMax: 0,
  },
});

const configured = await runpodRest(
  managementKey,
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
);
const persistedGpuTypes = endpointGpuTypeIds(configured);
const persistedApproved =
  persistedGpuTypes.length >= 1 &&
  persistedGpuTypes.every((gpu) => requestedGpuTypes.includes(gpu));
const firstChoicePersisted = persistedGpuTypes.includes(requestedGpuTypes[0]);
if (
  text(configured?.id) !== endpointId ||
  text(configured?.name) !== ENDPOINT_NAME ||
  !persistedApproved ||
  !firstChoicePersisted ||
  workersMin(configured) !== 0 ||
  workersMax(configured) !== 0 ||
  activeManagementWorkers(configured).length !== 0 ||
  managementHourlyCost(configured) !== 0
) {
  throw new Error(`AVANTIQO_VIDEO_V70C_CONFIG_INVALID:${JSON.stringify({
    requested_gpu_type_ids: requestedGpuTypes,
    persisted_gpu_type_ids: persistedGpuTypes,
    workers_min: workersMin(configured),
    workers_max: workersMax(configured),
    active_workers: activeManagementWorkers(configured).length,
    hourly_cost_usd: managementHourlyCost(configured),
  })}`);
}

await assertVideoProductionUnchanged({
  managementKey,
  productionEndpointId,
  before: productionBefore,
});

console.log(`AVANTIQO_VIDEO_V70C_SCHEDULER_CONFIGURED=${JSON.stringify({
  endpoint_id: endpointId,
  endpoint_name: ENDPOINT_NAME,
  requested_gpu_priority: requestedGpuTypes,
  persisted_gpu_types: persistedGpuTypes,
  exact_32gb_preferred: requestedGpuTypes.some((gpu) =>
    SERVERLESS_CANDIDATES.find((entry) => entry.id === gpu)?.memory_gb === 32
  ),
  workers_min: 0,
  workers_max: 0,
  active_workers: 0,
  safe_lease_owns_scaling: true,
  generation_submitted: false,
  model_load_performed: false,
})}`);

const child = spawnSync(process.execPath, [SAFE_LEASE,
  `--lane=${SAFE_LEASE_LANE}`,
  "--ttl-ms=900000",
  "--",
  process.execPath,
  CHILD,
], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED: "YES",
    AVANTIQO_RUNPOD_SAFE_LEASE_TARGET_QUEUE_API_KEY: videoQueueKey,
    AVANTIQO_VIDEO_V70C_APPROVED_RUNTIME_GPUS_JSON: JSON.stringify(persistedGpuTypes),
  },
  stdio: "inherit",
});

if (child?.error) throw child.error;

const finalCandidate = await runpodRest(
  managementKey,
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
);
const productionAfter = await assertVideoProductionUnchanged({
  managementKey,
  productionEndpointId,
  before: productionBefore,
});
const finalClean =
  workersMin(finalCandidate) === 0 &&
  workersMax(finalCandidate) === 0 &&
  activeManagementWorkers(finalCandidate).length === 0 &&
  managementHourlyCost(finalCandidate) === 0;
if (!finalClean) {
  throw new Error(`AVANTIQO_VIDEO_V70C_FINAL_CANDIDATE_NOT_CLEAN:${JSON.stringify({
    workers_min: workersMin(finalCandidate),
    workers_max: workersMax(finalCandidate),
    active_workers: activeManagementWorkers(finalCandidate).length,
    hourly_cost_usd: managementHourlyCost(finalCandidate),
  })}`);
}

if (child?.status !== 0) {
  console.log(JSON.stringify({
    success: false,
    contract: CONTRACT,
    endpoint_id: endpointId,
    requested_gpu_priority: requestedGpuTypes,
    persisted_gpu_types: persistedGpuTypes,
    live_capacity_evidence: liveRows,
    safe_lease_child_status: child?.status,
    final_candidate_state: stableEndpointSnapshot(finalCandidate),
    production_endpoint_after: productionAfter,
    permanent_rest_state: "0/0",
    safe_lease_owns_scaling: true,
    generation_requested: false,
    inference_performed: false,
    model_load_performed: false,
    external_paid_provider_contacted: false,
    image_endpoint_mutated: false,
    safe_lease_modified: false,
    secrets_printed: false,
    next_action: "TREAT_AS_LIVE_SERVERLESS_PLACEMENT_OR_RUNTIME_EVIDENCE",
  }, null, 2));
  console.log(`${CONTRACT}=FAIL`);
  process.exit(child?.status || 3);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint_id: endpointId,
  requested_gpu_priority: requestedGpuTypes,
  persisted_gpu_types: persistedGpuTypes,
  live_capacity_evidence: liveRows,
  safe_lease_owned_scaling: true,
  child_scaling_mutation_allowed: false,
  final_candidate_state: stableEndpointSnapshot(finalCandidate),
  production_endpoint_after: productionAfter,
  permanent_rest_state: "0/0",
  generation_requested: false,
  inference_performed: false,
  model_load_performed: false,
  external_paid_provider_contacted: false,
  image_endpoint_mutated: false,
  safe_lease_modified: false,
  secrets_printed: false,
  next_action: "V71_MODEL_LOAD_PROBE_ON_PROVEN_MINIMUM_32GB_RUNTIME",
}, null, 2));
console.log(`${CONTRACT}=PASS`);
