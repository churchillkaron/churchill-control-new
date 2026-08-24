import { spawnSync } from "node:child_process";
import {
  AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY,
  classifyManagedVolumeName,
  groupCacheVolumes,
  managedCacheVolumes,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_IMAGE_SHARED_CAPACITY_RELOCATION_V1";
const IMAGE_ENDPOINT_NAME = "avantiqo-image-v1";
const SHARED_GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const MIN_GPU_GB = 80;
const MIN_VOLUME_GB = 80;
const POLL_MS = 5_000;
const QUIESCENCE_TIMEOUT_MS = Math.max(
  30_000,
  Number(process.env.AVANTIQO_IMAGE_SHARED_RELOCATION_QUIESCENCE_MS || 5 * 60 * 1000),
);

const GPU_PROFILES = Object.freeze([
  Object.freeze({ key: "RTX_PRO_6000_96GB", match: /RTX\s*PRO\s*6000/i, exclude: null, vram_gb: 96, usd_per_hour_reference: 3.49, preference: 5000 }),
  Object.freeze({ key: "H100_NVL_94GB", match: /H100.*NVL|NVL.*H100/i, exclude: null, vram_gb: 94, usd_per_hour_reference: 4.79, preference: 4800 }),
  Object.freeze({ key: "H100_80GB", match: /\bH100\b/i, exclude: /NVL/i, vram_gb: 80, usd_per_hour_reference: 4.79, preference: 4700 }),
  Object.freeze({ key: "H200_141GB", match: /\bH200\b/i, exclude: null, vram_gb: 141, usd_per_hour_reference: 5.93, preference: 4600 }),
  Object.freeze({ key: "B200_180GB", match: /\bB200\b/i, exclude: null, vram_gb: 180, usd_per_hour_reference: 8.64, preference: 4500 }),
]);

function text(value) { return String(value ?? "").trim(); }
function array(value) { return Array.isArray(value) ? value : []; }
function list(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value) ? text(value).split(",").map((entry) => entry.trim()).filter(Boolean) : [];
}
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function unique(values) { return [...new Set(values.map(text).filter(Boolean))]; }
function sameSet(left, right) {
  const a = unique(left).sort();
  const b = unique(right).sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
function yes(value) { return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase()); }
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function endpointVolumeIds(endpoint = {}) { return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]); }
function stockRank(value) { return ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[text(value).toUpperCase()] || 0); }
function command(commandName, args, errorCode) {
  const result = spawnSync(commandName, args, { cwd: process.cwd(), encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error(`${errorCode}:${text(result.stderr || result.stdout).slice(0, 1200) || `exit=${result.status}`}`);
  }
  return text(result.stdout);
}
function requireCurrentMain() {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_SHARED_RELOCATION_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_IMAGE_SHARED_RELOCATION_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_IMAGE_SHARED_RELOCATION_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_IMAGE_SHARED_RELOCATION_HEAD_READ_FAILED");
  const origin = command("git", ["rev-parse", "origin/main"], "AVANTIQO_IMAGE_SHARED_RELOCATION_ORIGIN_READ_FAILED");
  if (head !== origin) throw new Error(`AVANTIQO_IMAGE_SHARED_RELOCATION_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${origin}`);
  return head;
}
function profileForGpu(gpu = {}) {
  const label = [gpu?.gpuTypeId, gpu?.gpuTypeDisplayName, gpu?.displayName].map(text).filter(Boolean).join(" ");
  if (/\bMIG\b/i.test(label)) return null;
  return GPU_PROFILES.find((profile) => profile.match.test(label) && !(profile.exclude && profile.exclude.test(label))) || null;
}
function capacityRow(dataCenter, gpu) {
  const profile = profileForGpu(gpu);
  return {
    data_center_id: text(dataCenter?.id) || null,
    data_center_name: text(dataCenter?.name) || null,
    location: text(dataCenter?.location) || null,
    storage_support: dataCenter?.storageSupport === true,
    gpu_type_id: text(gpu?.gpuTypeId) || null,
    gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName || gpu?.gpuTypeId) || null,
    profile: profile?.key || null,
    vram_gb: profile?.vram_gb || null,
    usd_per_hour_reference: profile?.usd_per_hour_reference ?? null,
    preference: profile?.preference || 0,
    available: gpu?.available === true,
    stock_status: text(gpu?.stockStatus) || null,
    stock_rank: stockRank(gpu?.stockStatus),
  };
}
function healthCounters(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    jobs: { in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0), in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0) },
    workers: {
      idle: finite(workers.idle, 0), initializing: finite(workers.initializing, 0), ready: finite(workers.ready, 0),
      running: finite(workers.running, 0), throttled: finite(workers.throttled, 0), unhealthy: finite(workers.unhealthy, 0),
    },
  };
}
function activeExecution(counters) {
  return counters.jobs.in_queue + counters.jobs.in_progress + counters.workers.idle + counters.workers.initializing + counters.workers.ready + counters.workers.running;
}
function safeVolume(volume = {}) {
  return {
    id: text(volume?.id) || null,
    name: text(volume?.name) || null,
    size_gb: finite(volume?.size ?? volume?.sizeGb),
    data_center_id: text(volume?.dataCenterId) || null,
    group: classifyManagedVolumeName(volume?.name)?.id || null,
  };
}
function safeEndpoint(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    template_id: text(endpoint?.templateId || endpoint?.template?.id) || null,
    network_volume_ids: endpointVolumeIds(endpoint),
    data_center_ids: list(endpoint?.dataCenterIds),
    gpu_type_ids: list(endpoint?.gpuTypeIds),
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    scaler_type: text(endpoint?.scalerType) || null,
    scaler_value: finite(endpoint?.scalerValue),
    idle_timeout_seconds: finite(endpoint?.idleTimeout),
    execution_timeout_ms: finite(endpoint?.executionTimeoutMs ?? endpoint?.executionTimeout),
    flashboot: endpoint?.flashBoot ?? endpoint?.flashboot ?? null,
  };
}
function stableEndpoint(endpoint = {}) {
  const row = safeEndpoint(endpoint);
  return {
    template_id: row.template_id,
    scaler_type: row.scaler_type,
    scaler_value: row.scaler_value,
    idle_timeout_seconds: row.idle_timeout_seconds,
    execution_timeout_ms: row.execution_timeout_ms,
    flashboot: row.flashboot,
  };
}
function endpointUsers(endpoints, volumeId, ignoredEndpointId = null) {
  return array(endpoints)
    .filter((endpoint) => text(endpoint?.id) !== text(ignoredEndpointId))
    .filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId))
    .map((endpoint) => ({ id: text(endpoint?.id) || null, name: text(endpoint?.name) || null }));
}
async function parseResponse(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1200)}`);
  return body;
}
async function rest(path, key, options = {}) {
  return parseResponse(await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  }), "RUNPOD_REST");
}
async function queue(endpointId, path, key) {
  return parseResponse(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_QUEUE");
}
async function discoverDatacenters(key) {
  const query = `query ImageSharedRelocation($input: GpuAvailabilityInput) { dataCenters { id name location storageSupport gpuAvailability(input: $input) { available stockStatus gpuTypeId gpuTypeDisplayName displayName } } }`;
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { input: { gpuCount: 1, minDisk: 5, minMemoryInGb: MIN_GPU_GB, secureCloud: true } } }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body?.errors?.length || !Array.isArray(body?.data?.dataCenters)) {
    throw new Error(`RUNPOD_GPU_AVAILABILITY_FAILED:${response.status}:${text(body?.errors?.map((entry) => entry?.message).join(" | ") || raw).slice(0, 1200)}`);
  }
  return body.data.dataCenters;
}
function resolveImageEndpoint(endpoints, configuredId) {
  if (configuredId) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredId);
    if (matches.length !== 1 || text(matches[0]?.name) !== IMAGE_ENDPOINT_NAME) throw new Error(`AVANTIQO_IMAGE_SHARED_RELOCATION_CONFIGURED_ENDPOINT_INVALID:matches=${matches.length}`);
    return { endpoint: matches[0], source: "ENV_VERIFIED" };
  }
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === IMAGE_ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_SHARED_RELOCATION_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  return { endpoint: matches[0], source: "EXACT_NAME" };
}
function selectCapacity(dataCenters, sourceDcId, sourceLocation, currentGpuTypes) {
  const rows = dataCenters
    .flatMap((dc) => array(dc?.gpuAvailability).map((gpu) => capacityRow(dc, gpu)))
    .filter((row) => row.storage_support && row.profile && row.vram_gb >= MIN_GPU_GB && row.gpu_type_id);
  const sourceRows = rows.filter((row) => row.data_center_id === sourceDcId && currentGpuTypes.includes(row.gpu_type_id));
  const sourceRank = Math.max(0, ...sourceRows.filter((row) => row.available).map((row) => row.stock_rank));
  const candidates = rows
    .filter((row) => row.data_center_id !== sourceDcId && row.available && row.stock_rank > sourceRank)
    .sort((a, b) =>
      b.stock_rank - a.stock_rank ||
      Number(currentGpuTypes.includes(b.gpu_type_id)) - Number(currentGpuTypes.includes(a.gpu_type_id)) ||
      Number(b.location === sourceLocation) - Number(a.location === sourceLocation) ||
      a.usd_per_hour_reference - b.usd_per_hour_reference ||
      b.preference - a.preference ||
      a.data_center_id.localeCompare(b.data_center_id)
    );
  const selected = candidates[0] || null;
  const targetPool = selected
    ? rows.filter((row) => row.data_center_id === selected.data_center_id && row.available && row.stock_rank >= selected.stock_rank)
      .sort((a, b) => Number(currentGpuTypes.includes(b.gpu_type_id)) - Number(currentGpuTypes.includes(a.gpu_type_id)) || a.usd_per_hour_reference - b.usd_per_hour_reference || b.preference - a.preference)
      .slice(0, 4)
    : [];
  return { rows, sourceRows, sourceRank, candidates, selected, targetPool };
}
function runChild(script, args, label) {
  console.log(`AVANTIQO_IMAGE_SHARED_RELOCATION_CHILD_START=${label}`);
  const result = spawnSync(process.execPath, [script, ...args], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${label}_FAILED:exit=${result.status ?? "UNKNOWN"}`);
  console.log(`AVANTIQO_IMAGE_SHARED_RELOCATION_CHILD_COMPLETE=${label}`);
}
async function waitForQuiescence(endpointId, inferenceKey, label) {
  const deadline = Date.now() + QUIESCENCE_TIMEOUT_MS;
  let last = null;
  while (Date.now() < deadline) {
    last = healthCounters(await queue(endpointId, "/health", inferenceKey));
    if (activeExecution(last) === 0) return last;
    console.log(`AVANTIQO_IMAGE_SHARED_RELOCATION_QUIESCENCE_WAIT label=${label} health=${JSON.stringify(last)}`);
    await sleep(POLL_MS);
  }
  throw new Error(`AVANTIQO_IMAGE_SHARED_RELOCATION_QUIESCENCE_TIMEOUT:${label}:${JSON.stringify(last)}`);
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_IMAGE_SHARED_RELOCATION_APPROVED)) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_APPROVED=YES_REQUIRED");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const mainSha = requireCurrentMain();

console.log(`AVANTIQO_IMAGE_SHARED_RELOCATION_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_IMAGE_SHARED_RELOCATION_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_IMAGE_SHARED_RELOCATION_MIG_SLICES_ALLOWED=false");
console.log("AVANTIQO_IMAGE_SHARED_RELOCATION_MIN_GPU_GB=80");
console.log("AVANTIQO_IMAGE_SHARED_RELOCATION_PER_ENGINE_VOLUME_CREATION=false");
console.log("AVANTIQO_IMAGE_SHARED_RELOCATION_IMAGE_GENERATION=false");
console.log("AVANTIQO_IMAGE_SHARED_RELOCATION_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_SHARED_RELOCATION_CODE_VOLUME_MUTATION=false");
console.log("AVANTIQO_IMAGE_SHARED_RELOCATION_SECRETS_PRINTED=false");

let endpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
let volumes = await rest("/networkvolumes", managementKey);
let dataCenters = await discoverDatacenters(managementKey);
if (!Array.isArray(endpoints) || !Array.isArray(volumes)) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_RUNPOD_LIST_INVALID");
let resolved = resolveImageEndpoint(endpoints, configuredEndpointId);
let endpoint = resolved.endpoint;
const endpointId = text(endpoint.id);
const originalStable = stableEndpoint(endpoint);
const sourceIds = endpointVolumeIds(endpoint);
if (sourceIds.length !== 1) throw new Error(`AVANTIQO_IMAGE_SHARED_RELOCATION_EXACTLY_ONE_SOURCE_VOLUME_REQUIRED:count=${sourceIds.length}`);
let sourceVolume = volumes.find((volume) => text(volume?.id) === sourceIds[0]);
if (!sourceVolume || classifyManagedVolumeName(sourceVolume?.name)?.id !== SHARED_GROUP.id) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_SOURCE_GROUP_INVALID");
if (finite(sourceVolume?.size, 0) < MIN_VOLUME_GB) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_SOURCE_VOLUME_TOO_SMALL");
const sourceVolumeId = text(sourceVolume.id);
const sourceDcId = text(sourceVolume.dataCenterId);
const sourceDc = dataCenters.find((dc) => text(dc?.id) === sourceDcId);
if (!sourceDc) throw new Error(`AVANTIQO_IMAGE_SHARED_RELOCATION_SOURCE_DC_NOT_FOUND:${sourceDcId}`);
const currentGpuTypes = list(endpoint?.gpuTypeIds);
if (!currentGpuTypes.length) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_CURRENT_GPU_REQUIRED");
let capacity = selectCapacity(dataCenters, sourceDcId, text(sourceDc?.location), currentGpuTypes);
if (!capacity.selected) throw new Error(`AVANTIQO_IMAGE_SHARED_RELOCATION_NO_STRICTLY_BETTER_TARGET:source_rank=${capacity.sourceRank}`);
const targetDcId = capacity.selected.data_center_id;
const targetGpuTypes = unique(capacity.targetPool.map((row) => row.gpu_type_id));
const groupVolumes = groupCacheVolumes(volumes, SHARED_GROUP);
const canonicalVolumes = groupVolumes.filter((volume) => text(volume?.name) === SHARED_GROUP.canonical_name);
if (canonicalVolumes.length > 1) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_MULTIPLE_CANONICAL_VOLUMES");
let targetVolume = canonicalVolumes[0] || null;
if (targetVolume && text(targetVolume?.dataCenterId) !== targetDcId) throw new Error(`AVANTIQO_IMAGE_SHARED_RELOCATION_CANONICAL_TARGET_CONFLICT:dc=${text(targetVolume?.dataCenterId)}:selected=${targetDcId}`);
const staleImageVolumes = groupVolumes
  .filter((volume) => text(volume?.id) !== sourceVolumeId && text(volume?.id) !== text(targetVolume?.id))
  .map((volume) => ({ volume, users: endpointUsers(endpoints, text(volume?.id), null) }));
const cleanupCandidates = staleImageVolumes.filter((entry) => entry.users.length === 0);
const blockedStaleVolumes = staleImageVolumes.filter((entry) => entry.users.length > 0);
const managedCount = managedCacheVolumes(volumes).length;
const projectedAfterCleanup = managedCount - cleanupCandidates.length;
const projectedWithTarget = projectedAfterCleanup + (targetVolume ? 0 : 1);
if (blockedStaleVolumes.length) throw new Error(`AVANTIQO_IMAGE_SHARED_RELOCATION_STALE_IMAGE_VOLUME_IN_USE:${blockedStaleVolumes.map((entry) => text(entry.volume?.id)).join("|")}`);
if (projectedAfterCleanup > AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes) throw new Error(`AVANTIQO_IMAGE_SHARED_RELOCATION_STORAGE_CLEANUP_INSUFFICIENT:projected=${projectedAfterCleanup}`);
if (projectedWithTarget > AVANTIQO_RUNPOD_SHARED_VOLUME_POLICY.maximum_managed_cache_volumes + 1) throw new Error(`AVANTIQO_IMAGE_SHARED_RELOCATION_TRANSIENT_VOLUME_LIMIT_EXCEEDED:projected=${projectedWithTarget}`);
const initialHealth = healthCounters(await queue(endpointId, "/health", inferenceKey));
if (activeExecution(initialHealth) !== 0) throw new Error(`AVANTIQO_IMAGE_SHARED_RELOCATION_ENDPOINT_BUSY:${JSON.stringify(initialHealth)}`);

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: mainSha,
  endpoint_resolution: resolved.source,
  endpoint_before: safeEndpoint(endpoint),
  source_volume: safeVolume(sourceVolume),
  source_capacity_for_current_gpu: capacity.sourceRows,
  source_stock_rank: capacity.sourceRank,
  selected_target: capacity.selected,
  target_gpu_pool: capacity.targetPool,
  target_gpu_type_ids: targetGpuTypes,
  target_volume_existing: targetVolume ? safeVolume(targetVolume) : null,
  target_volume_will_be_created: !targetVolume,
  stale_detached_image_volumes_to_delete_before_create: cleanupCandidates.map((entry) => safeVolume(entry.volume)),
  code_volumes_touched: false,
  managed_volume_count_before: managedCount,
  managed_volume_count_after_stale_image_cleanup: projectedAfterCleanup,
  transient_managed_volume_count_with_source_and_target: projectedWithTarget,
  steady_state_managed_volume_count_after_source_retirement: projectedWithTarget - (sourceVolumeId === text(targetVolume?.id) ? 0 : 1),
  current_shared_policy: sharedVolumePolicySummary(volumes),
  current_health: initialHealth,
  cache_strategy: "PER_ATTACHED_VOLUME_CACHE_OR_VERIFY",
  cache_bootstrap_required: true,
  runtime_probe_required: true,
  image_generation: false,
  production_deploy: false,
  mutation_performed: false,
  next_action: apply ? "CLEAN_STALE_IMAGE_VOLUME_CREATE_TARGET_CACHE_PROBE_CONSOLIDATE" : "RUN_WITH_RELOCATION_APPROVAL",
};

if (!apply) {
  console.log("AVANTIQO_IMAGE_SHARED_RELOCATION_PLAN=READY");
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

// Replan immediately before provider mutation.
requireCurrentMain();
endpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
volumes = await rest("/networkvolumes", managementKey);
dataCenters = await discoverDatacenters(managementKey);
resolved = resolveImageEndpoint(endpoints, endpointId);
endpoint = resolved.endpoint;
if (!sameSet(endpointVolumeIds(endpoint), [sourceVolumeId])) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_SOURCE_BINDING_CHANGED_REPLAN_REQUIRED");
if (JSON.stringify(stableEndpoint(endpoint)) !== JSON.stringify(originalStable)) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_ENDPOINT_STABLE_FIELDS_CHANGED_REPLAN_REQUIRED");
sourceVolume = volumes.find((volume) => text(volume?.id) === sourceVolumeId);
if (!sourceVolume) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_SOURCE_VOLUME_DISAPPEARED");
const freshSourceDc = dataCenters.find((dc) => text(dc?.id) === sourceDcId);
capacity = selectCapacity(dataCenters, sourceDcId, text(freshSourceDc?.location), currentGpuTypes);
if (!capacity.selected || capacity.selected.data_center_id !== targetDcId) throw new Error(`AVANTIQO_IMAGE_SHARED_RELOCATION_BEST_TARGET_CHANGED_REPLAN_REQUIRED:selected=${capacity.selected?.data_center_id || "NONE"}:planned=${targetDcId}`);
const freshTargetGpuTypes = unique(capacity.targetPool.map((row) => row.gpu_type_id));
if (!freshTargetGpuTypes.length) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_TARGET_GPU_POOL_LOST");
await waitForQuiescence(endpointId, inferenceKey, "PRE_MUTATION");

// Remove only detached IMAGE_VIDEO legacy volumes. Never touch Code volumes.
for (const planned of cleanupCandidates) {
  requireCurrentMain();
  const freshEndpoints = await rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey);
  const users = endpointUsers(freshEndpoints, text(planned.volume?.id), null);
  if (users.length) throw new Error(`AVANTIQO_IMAGE_SHARED_RELOCATION_STALE_VOLUME_GAINED_USER:id=${text(planned.volume?.id)}`);
  await rest(`/networkvolumes/${encodeURIComponent(text(planned.volume?.id))}`, managementKey, { method: "DELETE" });
  console.log(`AVANTIQO_IMAGE_SHARED_RELOCATION_STALE_IMAGE_VOLUME_DELETED=${text(planned.volume?.id)}`);
}

requireCurrentMain();
volumes = await rest("/networkvolumes", managementKey);
const canonicalAfterCleanup = groupCacheVolumes(volumes, SHARED_GROUP).filter((volume) => text(volume?.name) === SHARED_GROUP.canonical_name);
if (canonicalAfterCleanup.length > 1) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_CANONICAL_AMBIGUOUS_AFTER_CLEANUP");
targetVolume = canonicalAfterCleanup[0] || null;
if (!targetVolume) {
  targetVolume = await rest("/networkvolumes", managementKey, {
    method: "POST",
    body: { dataCenterId: targetDcId, name: SHARED_GROUP.canonical_name, size: Math.max(MIN_VOLUME_GB, finite(sourceVolume?.size, MIN_VOLUME_GB)) },
  });
  console.log(`AVANTIQO_IMAGE_SHARED_RELOCATION_TARGET_VOLUME_CREATED=${text(targetVolume?.id) || "MISSING"}`);
}
const targetVolumeId = text(targetVolume?.id);
if (!targetVolumeId || text(targetVolume?.dataCenterId) !== targetDcId) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_TARGET_VOLUME_VERIFY_FAILED");

requireCurrentMain();
await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, { method: "PATCH", body: { workersMin: 0, workersMax: 0 } });
await waitForQuiescence(endpointId, inferenceKey, "DRAIN");
requireCurrentMain();
const beforeMove = resolveImageEndpoint(await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey), endpointId).endpoint;
if (JSON.stringify(stableEndpoint(beforeMove)) !== JSON.stringify(originalStable)) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_ENDPOINT_CHANGED_AFTER_DRAIN");
await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
  method: "PATCH",
  body: { networkVolumeId: targetVolumeId, networkVolumeIds: [targetVolumeId], dataCenterIds: [targetDcId], gpuTypeIds: freshTargetGpuTypes, workersMin: 0, workersMax: 1 },
});
const moved = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
if (!sameSet(endpointVolumeIds(moved), [targetVolumeId])) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_TARGET_BINDING_VERIFY_FAILED");
if (!sameSet(list(moved?.gpuTypeIds), freshTargetGpuTypes)) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_GPU_POOL_VERIFY_FAILED");
if (JSON.stringify(stableEndpoint(moved)) !== JSON.stringify(originalStable)) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_STABLE_FIELDS_CHANGED_DURING_MOVE");
console.log(`AVANTIQO_IMAGE_SHARED_RELOCATION_ENDPOINT_MOVED_TO=${targetDcId}`);
console.log(`AVANTIQO_IMAGE_SHARED_RELOCATION_ENDPOINT_GPU_POOL=${freshTargetGpuTypes.join("|")}`);

runChild("scripts/cache-avantiqo-image-2512-local.mjs", ["--apply"], "AVANTIQO_IMAGE_SHARED_RELOCATION_CACHE");
let probePassed = false;
try {
  runChild("scripts/probe-avantiqo-image-runtime-local.mjs", [], "AVANTIQO_IMAGE_SHARED_RELOCATION_PROBE");
  probePassed = true;
} catch (error) {
  console.error(`AVANTIQO_IMAGE_SHARED_RELOCATION_PROBE_FAILED=${text(error?.message || error)}`);
}

if (!probePassed) {
  console.log(JSON.stringify({ ...plan, success: false, mode: "APPLY", mutation_performed: true, target_volume: safeVolume(targetVolume), target_cache_verified: true, target_runtime_probe_passed: false, source_volume_deleted: false, next_action: "TARGET_CACHE_READY_PROBE_FAILED_KEEP_SOURCE_BACKUP" }, null, 2));
  process.exitCode = 2;
  process.exit(0);
}

requireCurrentMain();
const finalEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
const finalImage = resolveImageEndpoint(finalEndpoints, endpointId).endpoint;
if (!sameSet(endpointVolumeIds(finalImage), [targetVolumeId])) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_FINAL_BINDING_LOST");
const sourceUsers = endpointUsers(finalEndpoints, sourceVolumeId, null);
let sourceDeleted = false;
if (!sourceUsers.length && sourceVolumeId !== targetVolumeId) {
  await rest(`/networkvolumes/${encodeURIComponent(sourceVolumeId)}`, managementKey, { method: "DELETE" });
  sourceDeleted = true;
}
const finalVolumes = await rest("/networkvolumes", managementKey);
console.log("AVANTIQO_IMAGE_SHARED_CAPACITY_RELOCATION=COMPLETE");
console.log(JSON.stringify({
  ...plan,
  success: sourceDeleted || sourceVolumeId === targetVolumeId,
  mode: "APPLY",
  mutation_performed: true,
  endpoint_after: safeEndpoint(finalImage),
  target_volume: safeVolume(targetVolume),
  target_cache_verified: true,
  target_runtime_probe_passed: true,
  source_volume_deleted: sourceDeleted,
  source_volume_remaining_users: sourceUsers,
  final_shared_policy: sharedVolumePolicySummary(finalVolumes),
  image_generation: false,
  production_deploy: false,
  next_action: sourceDeleted || sourceVolumeId === targetVolumeId ? "RUN_ONE_IMAGE_QUALITY_CERTIFICATION" : "SOURCE_VOLUME_STILL_IN_USE_REVIEW_BEFORE_DELETE",
}, null, 2));
if (!sourceDeleted && sourceVolumeId !== targetVolumeId) process.exitCode = 2;
