#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  activeManagementWorkers,
  assertVideoProductionUnchanged,
  endpointGpuTypeIds,
  inspectVideo32gbCandidate,
  managementHourlyCost,
  runpodRest,
  stableEndpointSnapshot,
  text,
  workersMax,
  workersMin,
} from "./lib/avantiqo-video-32gb-candidate-contract-v69.mjs";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_VIDEO_32GB_RUNTIME_PROBE_V70B";
const APPROVAL_ENV = "AVANTIQO_VIDEO_32GB_RUNTIME_PROBE_V70B_APPROVED";
const ENDPOINT_NAME = "avantiqo-video-32gb-candidate-v1";
const SAFE_LEASE = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
const SAFE_LEASE_LANE = "video-32gb-candidate";
const CHILD = "scripts/run-avantiqo-video-32gb-runtime-probe-v70b-child-local.mjs";
const GPU_PRIORITY = Object.freeze([
  "NVIDIA GeForce RTX 5090",
  "NVIDIA RTX 5000 Ada Generation",
]);

function required(name, fallback = "") {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function sameOrder(left, right) {
  return Array.isArray(left) && Array.isArray(right) &&
    left.length === right.length && left.every((value, index) => text(value) === text(right[index]));
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
  throw new Error("AVANTIQO_VIDEO_V70B_CANDIDATE_IDENTITY_INVALID");
}
if (workersMin(candidate) !== 0 || workersMax(candidate) !== 0) {
  throw new Error(`AVANTIQO_VIDEO_V70B_CANDIDATE_MUST_START_0_0:${workersMin(candidate)}/${workersMax(candidate)}`);
}
if (activeManagementWorkers(candidate).length !== 0 || managementHourlyCost(candidate) !== 0) {
  throw new Error("AVANTIQO_VIDEO_V70B_ACTIVE_WORKER_PRESENT_AT_START");
}

const productionBefore = inspected.production_endpoint_snapshot;

await runpodRest(managementKey, `/endpoints/${encodeURIComponent(endpointId)}`, {
  method: "PATCH",
  body: {
    gpuTypeIds: [...GPU_PRIORITY],
    workersMin: 0,
    workersMax: 0,
  },
});

const configured = await runpodRest(
  managementKey,
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
);
if (
  text(configured?.id) !== endpointId ||
  text(configured?.name) !== ENDPOINT_NAME ||
  !sameOrder(endpointGpuTypeIds(configured), GPU_PRIORITY) ||
  workersMin(configured) !== 0 ||
  workersMax(configured) !== 0 ||
  activeManagementWorkers(configured).length !== 0 ||
  managementHourlyCost(configured) !== 0
) {
  throw new Error(`AVANTIQO_VIDEO_V70B_PRIORITY_CONFIG_INVALID:${JSON.stringify({
    gpu_type_ids: endpointGpuTypeIds(configured),
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

console.log(`AVANTIQO_VIDEO_V70B_PRIORITY_CONFIGURED=${JSON.stringify({
  endpoint_id: endpointId,
  endpoint_name: ENDPOINT_NAME,
  gpu_priority: GPU_PRIORITY,
  workers_min: 0,
  workers_max: 0,
  active_workers: 0,
  hourly_cost_usd: 0,
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
  throw new Error(`AVANTIQO_VIDEO_V70B_FINAL_CANDIDATE_NOT_CLEAN:${JSON.stringify({
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
    endpoint_name: ENDPOINT_NAME,
    gpu_priority: GPU_PRIORITY,
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
    next_action: "TREAT_AS_SERVERLESS_32GB_PLACEMENT_EVIDENCE",
  }, null, 2));
  console.log(`${CONTRACT}=FAIL`);
  process.exit(child?.status || 3);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  endpoint_id: endpointId,
  endpoint_name: ENDPOINT_NAME,
  gpu_priority: GPU_PRIORITY,
  exact_32gb_serverless_types_only: true,
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
  next_action: "V71_MODEL_LOAD_PROBE_ON_PROVEN_32GB_RUNTIME",
}, null, 2));
console.log(`${CONTRACT}=PASS`);
