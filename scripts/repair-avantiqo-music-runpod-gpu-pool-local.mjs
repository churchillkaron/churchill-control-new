#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_MUSIC_RUNPOD_GPU_POOL_REPAIR_V1";
const REPAIR_REVISION = "AVANTIQO_MUSIC_PERSISTENT_IMAGE_STYLE_GPU_POOL_V1";
const SCHEDULABILITY_SCRIPT = resolve("scripts/assert-avantiqo-music-runpod-schedulability-local.mjs");
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const SHARED_VOLUME_NAME = "avantiqo-shared-audio-voice-cache";
const PERSISTENT_COST_GUARDED_GPU_TYPES = Object.freeze([
  "NVIDIA L4",
  "NVIDIA RTX A5000",
  "NVIDIA GeForce RTX 3090",
  "NVIDIA GeForce RTX 4090",
]);

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function list(value) {
  return Array.isArray(value) ? value.map(text).filter(Boolean) : [];
}

function rawList(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function sorted(values) {
  return unique(values).sort();
}

function sameSet(left, right) {
  const a = sorted(left);
  const b = sorted(right);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function endpointVolumeIds(endpoint = {}) {
  return unique([
    endpoint.networkVolumeId ?? endpoint.network_volume_id,
    ...list(endpoint.networkVolumeIds ?? endpoint.network_volume_ids),
  ]);
}

function endpointSnapshot(endpoint = {}) {
  return {
    id: text(endpoint?.id),
    name: text(endpoint?.name),
    template_id: text(endpoint?.templateId || endpoint?.template?.id),
    shared_volume_ids: sorted(endpointVolumeIds(endpoint)),
    workers_min: finite(endpoint?.workersMin, -1),
    workers_max: finite(endpoint?.workersMax, -1),
    idle_timeout: endpoint?.idleTimeout ?? null,
    execution_timeout_ms: endpoint?.executionTimeoutMs ?? null,
    scaler_type: endpoint?.scalerType ?? null,
    scaler_value: endpoint?.scalerValue ?? null,
    data_center_ids: sorted(endpoint?.dataCenterIds),
    gpu_type_ids: sorted(endpoint?.gpuTypeIds),
  };
}

function invariantSnapshot(snapshot = {}) {
  return {
    id: snapshot.id,
    name: snapshot.name,
    template_id: snapshot.template_id,
    shared_volume_ids: snapshot.shared_volume_ids,
    workers_min: snapshot.workers_min,
    workers_max: snapshot.workers_max,
    idle_timeout: snapshot.idle_timeout,
    execution_timeout_ms: snapshot.execution_timeout_ms,
    scaler_type: snapshot.scaler_type,
    scaler_value: snapshot.scaler_value,
    data_center_ids: snapshot.data_center_ids,
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertEndpointInvariant(expected, actual, code, { requireGpuPool = false } = {}) {
  const expectedSnapshot = endpointSnapshot(expected);
  const actualSnapshot = endpointSnapshot(actual);
  if (!sameJson(invariantSnapshot(expectedSnapshot), invariantSnapshot(actualSnapshot))) {
    throw new Error(`${code}:ENDPOINT_INVARIANT_CHANGED`);
  }
  if (requireGpuPool && !sameSet(expectedSnapshot.gpu_type_ids, actualSnapshot.gpu_type_ids)) {
    throw new Error(`${code}:GPU_POOL_CHANGED`);
  }
  return actualSnapshot;
}

async function requestJson(url, init, label) {
  const response = await fetch(url, {
    ...init,
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
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body;
}

async function rest(path, key, options = {}) {
  return requestJson(
    `${REST_BASE}${path}`,
    {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    },
    "RUNPOD_REST",
  );
}

async function queueHealth(endpointId, key) {
  return requestJson(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
    { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } },
    "RUNPOD_QUEUE_HEALTH",
  );
}

function healthActivity(health = {}) {
  const jobs = health?.jobs && typeof health.jobs === "object" ? health.jobs : {};
  const workers = health?.workers && typeof health.workers === "object" ? health.workers : {};
  return {
    in_queue: finite(jobs.inQueue ?? jobs.in_queue),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress),
    initializing: finite(workers.initializing),
    ready: finite(workers.ready),
    running: finite(workers.running),
    idle: finite(workers.idle),
    throttled: finite(workers.throttled),
    unhealthy: finite(workers.unhealthy),
  };
}

function assertNoActiveJobs(health, code) {
  const activity = healthActivity(health);
  if (activity.in_queue !== 0 || activity.in_progress !== 0) {
    throw new Error(`${code}:${JSON.stringify(activity)}`);
  }
  return activity;
}

function runSchedulability() {
  let raw = "";
  try {
    raw = execFileSync(process.execPath, [SCHEDULABILITY_SCRIPT], {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60_000,
    });
  } catch (error) {
    const detail = text(error?.stderr || error?.stdout || error?.message).slice(0, 1600);
    throw new Error(`AVANTIQO_MUSIC_GPU_POOL_REPAIR_SCHEDULABILITY_FAILED:${detail || "UNKNOWN"}`);
  }
  let result = null;
  try {
    result = JSON.parse(raw);
  } catch {
    throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_SCHEDULABILITY_OUTPUT_INVALID");
  }
  if (
    result?.success !== true ||
    result?.contract !== "AVANTIQO_MUSIC_RUNPOD_SCHEDULABILITY_V1" ||
    result?.safety?.read_only !== true ||
    result?.safety?.endpoint_mutation_performed !== false ||
    result?.safety?.network_volume_mutation_performed !== false ||
    result?.safety?.generation_submitted !== false
  ) {
    throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_SCHEDULABILITY_INVALID");
  }
  return result;
}

function supportedPersistentPool(schedulability = {}) {
  const supported = new Set(
    rawList(schedulability?.current_region?.approved_capacity)
      .filter((entry) => entry && typeof entry === "object" && entry.approved_24gb_plus === true)
      .map((entry) => text(entry.gpu_type_id))
      .filter(Boolean),
  );
  return PERSISTENT_COST_GUARDED_GPU_TYPES.filter((gpuType) => supported.has(gpuType));
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");
const initialSchedulability = runSchedulability();
const endpointId = text(initialSchedulability?.endpoint?.id);
if (!endpointId) throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_ENDPOINT_ID_REQUIRED");
if (text(initialSchedulability?.endpoint?.name) !== AUDIO_ENDPOINT_NAME) {
  throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_ENDPOINT_NAME_MISMATCH");
}

const desiredPool = supportedPersistentPool(initialSchedulability);
if (desiredPool.length < 2) {
  throw new Error(
    `AVANTIQO_MUSIC_GPU_POOL_REPAIR_PERSISTENT_POOL_INSUFFICIENT:${desiredPool.join("|") || "NONE"}:migration=${initialSchedulability?.repair?.shared_cache_region_migration_required === true}`,
  );
}

const [beforeEndpoint, beforeHealth, volumes] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  queueHealth(endpointId, runtimeKey),
  rest("/networkvolumes", managementKey),
]);
const beforeActivity = assertNoActiveJobs(beforeHealth, "AVANTIQO_MUSIC_GPU_POOL_REPAIR_ACTIVE_JOB_PRESENT");
const before = endpointSnapshot(beforeEndpoint);
if (before.id !== endpointId || before.name !== AUDIO_ENDPOINT_NAME || !before.template_id) {
  throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_ENDPOINT_IDENTITY_INVALID");
}
if (before.shared_volume_ids.length !== 1) {
  throw new Error(`AVANTIQO_MUSIC_GPU_POOL_REPAIR_SINGLE_VOLUME_REQUIRED:${before.shared_volume_ids.length}`);
}
if (before.workers_min !== 0 || before.workers_max !== 1) {
  throw new Error(`AVANTIQO_MUSIC_GPU_POOL_REPAIR_SCALING_INVALID:min=${before.workers_min}:max=${before.workers_max}`);
}
if (!before.gpu_type_ids.length) {
  throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_BASELINE_GPU_POOL_REQUIRED");
}
if (before.gpu_type_ids.some((gpuType) => !PERSISTENT_COST_GUARDED_GPU_TYPES.includes(gpuType))) {
  throw new Error(`AVANTIQO_MUSIC_GPU_POOL_REPAIR_BASELINE_GPU_OUTSIDE_COST_GUARD:${before.gpu_type_ids.join("|")}`);
}
if (before.gpu_type_ids.some((gpuType) => !desiredPool.includes(gpuType))) {
  throw new Error(`AVANTIQO_MUSIC_GPU_POOL_REPAIR_BASELINE_GPU_UNSUPPORTED_IN_CACHE_REGION:${before.gpu_type_ids.join("|")}`);
}

if (!Array.isArray(volumes)) throw new Error("RUNPOD_NETWORK_VOLUME_LIST_INVALID");
const sharedVolume = volumes.find((volume) => text(volume?.id) === before.shared_volume_ids[0]);
if (!sharedVolume || text(sharedVolume?.name) !== SHARED_VOLUME_NAME) {
  throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_SHARED_CACHE_MISMATCH");
}
const sharedDataCenterId = text(sharedVolume?.dataCenterId);
if (!sharedDataCenterId || sharedDataCenterId !== text(initialSchedulability?.shared_cache?.data_center_id)) {
  throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_CACHE_DATACENTER_CHANGED");
}

let action = "NO_CHANGE_PERSISTENT_POOL_ALREADY_APPLIED";
let endpointMutationPerformed = false;
let beforeWriteActivity = beforeActivity;

if (!sameSet(before.gpu_type_ids, desiredPool)) {
  const freshSchedulability = runSchedulability();
  const freshDesiredPool = supportedPersistentPool(freshSchedulability);
  if (
    text(freshSchedulability?.endpoint?.id) !== endpointId ||
    text(freshSchedulability?.shared_cache?.data_center_id) !== sharedDataCenterId ||
    !sameSet(freshDesiredPool, desiredPool)
  ) {
    throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_STALE_CAPACITY_OR_PLACEMENT");
  }

  const [beforeWriteEndpoint, beforeWriteHealth] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
    queueHealth(endpointId, runtimeKey),
  ]);
  beforeWriteActivity = assertNoActiveJobs(
    beforeWriteHealth,
    "AVANTIQO_MUSIC_GPU_POOL_REPAIR_ACTIVE_JOB_APPEARED_BEFORE_WRITE",
  );
  assertEndpointInvariant(
    beforeEndpoint,
    beforeWriteEndpoint,
    "AVANTIQO_MUSIC_GPU_POOL_REPAIR_CONCURRENT_ENDPOINT_CHANGE",
    { requireGpuPool: true },
  );

  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "PATCH",
    body: { gpuTypeIds: desiredPool },
  });
  endpointMutationPerformed = true;
  action = "GPU_POOL_EXPANDED_IN_PLACE";
}

const afterEndpoint = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
const after = assertEndpointInvariant(
  beforeEndpoint,
  afterEndpoint,
  "AVANTIQO_MUSIC_GPU_POOL_REPAIR_VERIFY_INVARIANTS_FAILED",
);
if (!sameSet(after.gpu_type_ids, desiredPool)) {
  throw new Error(`AVANTIQO_MUSIC_GPU_POOL_REPAIR_VERIFY_GPU_POOL_FAILED:${after.gpu_type_ids.join("|")}`);
}

const afterSchedulability = runSchedulability();
const readyForControlledBenchmark = afterSchedulability?.ready_for_controlled_benchmark === true;

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  repair_revision: REPAIR_REVISION,
  action,
  persistent_scheduler_pool: {
    policy: "IMAGE_STYLE_COST_GUARDED_REGION_SUPPORTED_POOL",
    allowed_gpu_type_ids: PERSISTENT_COST_GUARDED_GPU_TYPES,
    desired_gpu_type_ids: desiredPool,
    runpod_schedules_from_persistent_pool: true,
    transient_single_gpu_stock_not_authoritative: true,
  },
  endpoint: {
    id: endpointId,
    name: AUDIO_ENDPOINT_NAME,
    before_gpu_type_ids: before.gpu_type_ids,
    after_gpu_type_ids: after.gpu_type_ids,
    template_id: after.template_id,
    template_id_preserved: after.template_id === before.template_id,
    shared_volume_ids: after.shared_volume_ids,
    shared_cache_preserved: sameSet(after.shared_volume_ids, before.shared_volume_ids),
    workers_min: after.workers_min,
    workers_max: after.workers_max,
    idle_timeout: after.idle_timeout,
    execution_timeout_ms: after.execution_timeout_ms,
    scaler_type: after.scaler_type,
    scaler_value: after.scaler_value,
    data_center_ids: after.data_center_ids,
    endpoint_invariants_preserved: true,
  },
  shared_cache: {
    id: before.shared_volume_ids[0],
    name: SHARED_VOLUME_NAME,
    data_center_id: sharedDataCenterId,
    moved: false,
  },
  observed_health: {
    before: beforeActivity,
    immediately_before_write: beforeWriteActivity,
    worker_state_allowed_when_jobs_zero: true,
  },
  schedulability: {
    capacity_sufficient: afterSchedulability?.capacity_sufficient === true,
    resilience_ready: afterSchedulability?.resilience_ready === true,
    ready_for_controlled_benchmark: readyForControlledBenchmark,
    schedulable_gpu_types: rawList(afterSchedulability?.current_region?.endpoint_schedulable_gpu_types),
  },
  safety: {
    endpoint_mutation_performed: endpointMutationPerformed,
    only_gpu_type_ids_changed: endpointMutationPerformed,
    queued_or_in_progress_job_present_at_write: false,
    network_volume_mutation_performed: false,
    template_mutation_performed: false,
    scaling_mutation_performed: false,
    generation_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
}, null, 2));
