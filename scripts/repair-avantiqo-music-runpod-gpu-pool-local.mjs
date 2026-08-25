#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_MUSIC_RUNPOD_GPU_POOL_REPAIR_V1";
const SCHEDULABILITY_SCRIPT = resolve("scripts/assert-avantiqo-music-runpod-schedulability-local.mjs");
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const SHARED_VOLUME_NAME = "avantiqo-shared-audio-voice-cache";

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

function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
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

async function requestJson(url, init, label) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
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
  };
}

function assertQuiet(health) {
  const activity = healthActivity(health);
  if (
    activity.in_queue !== 0 ||
    activity.in_progress !== 0 ||
    activity.initializing !== 0 ||
    activity.running !== 0
  ) {
    throw new Error(`AVANTIQO_MUSIC_GPU_POOL_REPAIR_ENDPOINT_NOT_QUIET:${JSON.stringify(activity)}`);
  }
}

function runSchedulability() {
  const raw = execFileSync(process.execPath, [SCHEDULABILITY_SCRIPT], {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 60_000,
  });
  const result = JSON.parse(raw);
  if (
    result?.success !== true ||
    result?.contract !== "AVANTIQO_MUSIC_RUNPOD_SCHEDULABILITY_V1" ||
    result?.safety?.read_only !== true
  ) {
    throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_SCHEDULABILITY_INVALID");
  }
  return result;
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const runtimeKey = text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) || required("RUNPOD_API_KEY");
const schedulability = runSchedulability();

if (schedulability.ready_for_controlled_benchmark === true) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    action: "NO_CHANGE_ALREADY_RESILIENT",
    endpoint: schedulability.endpoint,
    shared_cache: schedulability.shared_cache,
    generation_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  }, null, 2));
  process.exit(0);
}

if (schedulability?.repair?.in_place_gpu_pool_expansion_possible !== true) {
  throw new Error(
    `AVANTIQO_MUSIC_GPU_POOL_REPAIR_NOT_IN_PLACE:${schedulability?.repair?.shared_cache_region_migration_required === true ? "REGION_MIGRATION_REQUIRED" : "NO_SAFE_REPAIR"}`,
  );
}

const recommendedPool = unique(schedulability.repair.recommended_in_place_gpu_pool || []);
if (recommendedPool.length < 2) {
  throw new Error(`AVANTIQO_MUSIC_GPU_POOL_REPAIR_RECOMMENDED_POOL_INVALID:${recommendedPool.join("|") || "NONE"}`);
}

const endpointId = text(schedulability?.endpoint?.id);
if (!endpointId) throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_ENDPOINT_ID_REQUIRED");

const [before, beforeHealth, volumes] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey),
  queueHealth(endpointId, runtimeKey),
  rest("/networkvolumes", managementKey),
]);
assertQuiet(beforeHealth);
if (text(before?.name) !== AUDIO_ENDPOINT_NAME) throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_ENDPOINT_NAME_CHANGED");

const beforeTemplateId = text(before?.templateId || before?.template?.id);
const beforeVolumeIds = endpointVolumeIds(before);
const beforeWorkersMin = finite(before?.workersMin, -1);
const beforeWorkersMax = finite(before?.workersMax, -1);
const beforeGpuTypes = list(before?.gpuTypeIds);
if (!beforeTemplateId) throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_TEMPLATE_REQUIRED");
if (beforeVolumeIds.length !== 1) throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_SINGLE_VOLUME_REQUIRED");
if (beforeWorkersMin !== 0 || beforeWorkersMax !== 1) {
  throw new Error(`AVANTIQO_MUSIC_GPU_POOL_REPAIR_SCALING_INVALID:min=${beforeWorkersMin}:max=${beforeWorkersMax}`);
}

const sharedVolume = Array.isArray(volumes)
  ? volumes.find((volume) => text(volume?.id) === beforeVolumeIds[0])
  : null;
if (!sharedVolume || text(sharedVolume?.name) !== SHARED_VOLUME_NAME) {
  throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_SHARED_CACHE_MISMATCH");
}
if (text(sharedVolume?.dataCenterId) !== text(schedulability?.shared_cache?.data_center_id)) {
  throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_CACHE_DATACENTER_CHANGED");
}

if (!beforeGpuTypes.every((gpuType) => recommendedPool.includes(gpuType))) {
  throw new Error(`AVANTIQO_MUSIC_GPU_POOL_REPAIR_BASELINE_NOT_SUBSET:${beforeGpuTypes.join("|")}`);
}

const freshSchedulability = runSchedulability();
const freshRecommendedPool = unique(freshSchedulability?.repair?.recommended_in_place_gpu_pool || []);
if (
  freshSchedulability?.repair?.in_place_gpu_pool_expansion_possible !== true ||
  !sameSet(freshRecommendedPool, recommendedPool)
) {
  throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_STALE_RECOMMENDATION");
}
const freshHealth = await queueHealth(endpointId, runtimeKey);
assertQuiet(freshHealth);

await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
  method: "PATCH",
  body: { gpuTypeIds: recommendedPool },
});

const after = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  managementKey,
);
if (text(after?.name) !== AUDIO_ENDPOINT_NAME) throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_VERIFY_NAME_FAILED");
if (text(after?.templateId || after?.template?.id) !== beforeTemplateId) {
  throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_VERIFY_TEMPLATE_FAILED");
}
if (!sameSet(endpointVolumeIds(after), beforeVolumeIds)) {
  throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_VERIFY_VOLUME_FAILED");
}
if (finite(after?.workersMin, -1) !== beforeWorkersMin || finite(after?.workersMax, -1) !== beforeWorkersMax) {
  throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_VERIFY_SCALING_FAILED");
}
if (!sameSet(list(after?.gpuTypeIds), recommendedPool)) {
  throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_VERIFY_GPU_POOL_FAILED");
}

const afterSchedulability = runSchedulability();
if (
  afterSchedulability?.capacity_sufficient !== true ||
  afterSchedulability?.resilience_ready !== true ||
  afterSchedulability?.ready_for_controlled_benchmark !== true
) {
  throw new Error("AVANTIQO_MUSIC_GPU_POOL_REPAIR_POSTCHECK_NOT_READY");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  action: "GPU_POOL_EXPANDED_IN_PLACE",
  endpoint: {
    id: endpointId,
    name: AUDIO_ENDPOINT_NAME,
    before_gpu_type_ids: beforeGpuTypes,
    after_gpu_type_ids: list(after?.gpuTypeIds),
    template_id_preserved: true,
    shared_cache_preserved: true,
    workers_min_preserved: beforeWorkersMin,
    workers_max_preserved: beforeWorkersMax,
  },
  shared_cache: {
    id: beforeVolumeIds[0],
    name: SHARED_VOLUME_NAME,
    data_center_id: text(sharedVolume?.dataCenterId),
    moved: false,
  },
  schedulability: {
    capacity_sufficient: true,
    resilience_ready: true,
    ready_for_controlled_benchmark: true,
    schedulable_gpu_types: afterSchedulability.current_region.endpoint_schedulable_gpu_types,
  },
  safety: {
    endpoint_mutation_performed: true,
    only_gpu_type_ids_changed: true,
    network_volume_mutation_performed: false,
    template_mutation_performed: false,
    scaling_mutation_performed: false,
    generation_submitted: false,
    production_deploy_performed: false,
    pricing_activation_performed: false,
    secrets_printed: false,
  },
}, null, 2));
