import { spawnSync } from "node:child_process";
import {
  classifyManagedVolumeName,
  sharedVolumeGroup,
  sharedVolumePolicySummary,
} from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_IMAGE_SHARED_RELOCATION_RESUME_V1";
const ENDPOINT_NAME = "avantiqo-image-v1";
const GROUP = sharedVolumeGroup("IMAGE_VIDEO");
const MIN_GPU_GB = 80;
const MIN_VOLUME_GB = 80;

const GPU_PROFILES = Object.freeze([
  Object.freeze({ key: "RTX_PRO_6000_96GB", match: /RTX\s*PRO\s*6000/i, exclude: null, vram_gb: 96, cost: 3.49, preference: 5000 }),
  Object.freeze({ key: "H100_NVL_94GB", match: /H100.*NVL|NVL.*H100/i, exclude: null, vram_gb: 94, cost: 4.79, preference: 4800 }),
  Object.freeze({ key: "H100_80GB", match: /\bH100\b/i, exclude: /NVL/i, vram_gb: 80, cost: 4.79, preference: 4700 }),
  Object.freeze({ key: "H200_141GB", match: /\bH200\b/i, exclude: null, vram_gb: 141, cost: 5.93, preference: 4600 }),
  Object.freeze({ key: "B200_180GB", match: /\bB200\b/i, exclude: null, vram_gb: 180, cost: 8.64, preference: 4500 }),
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
function endpointVolumeIds(endpoint = {}) { return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]); }
function stockRank(value) { return ({ HIGH: 4, MEDIUM: 3, LOW: 2 }[text(value).toUpperCase()] || 0); }
function profileForGpu(gpu = {}) {
  const label = [gpu?.gpuTypeId, gpu?.gpuTypeDisplayName, gpu?.displayName].map(text).filter(Boolean).join(" ");
  if (/\bMIG\b/i.test(label)) return null;
  return GPU_PROFILES.find((profile) => profile.match.test(label) && !(profile.exclude && profile.exclude.test(label))) || null;
}
function capacityRow(dataCenter, gpu) {
  const profile = profileForGpu(gpu);
  return {
    data_center_id: text(dataCenter?.id) || null,
    location: text(dataCenter?.location) || null,
    gpu_type_id: text(gpu?.gpuTypeId) || null,
    gpu_name: text(gpu?.gpuTypeDisplayName || gpu?.displayName || gpu?.gpuTypeId) || null,
    profile: profile?.key || null,
    vram_gb: profile?.vram_gb || null,
    cost_reference: profile?.cost ?? null,
    preference: profile?.preference || 0,
    available: gpu?.available === true,
    stock_status: text(gpu?.stockStatus) || null,
    stock_rank: stockRank(gpu?.stockStatus),
  };
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
function command(name, args, errorCode) {
  const result = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`${errorCode}:${text(result.stderr || result.stdout).slice(0, 1200) || `exit=${result.status}`}`);
  return text(result.stdout);
}
function requireCurrentMain() {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_IMAGE_SHARED_RESUME_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_IMAGE_SHARED_RESUME_BRANCH_READ_FAILED");
  if (branch !== "main") throw new Error(`AVANTIQO_IMAGE_SHARED_RESUME_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_IMAGE_SHARED_RESUME_HEAD_READ_FAILED");
  const origin = command("git", ["rev-parse", "origin/main"], "AVANTIQO_IMAGE_SHARED_RESUME_ORIGIN_READ_FAILED");
  if (head !== origin) throw new Error(`AVANTIQO_IMAGE_SHARED_RESUME_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${origin}`);
  return head;
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
  const query = `query ImageSharedResume($input: GpuAvailabilityInput) { dataCenters { id location storageSupport gpuAvailability(input: $input) { available stockStatus gpuTypeId gpuTypeDisplayName displayName } } }`;
  const response = await fetch(`${GRAPHQL_URL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
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
function resolveEndpoint(endpoints, configuredId) {
  if (configuredId) {
    const matches = endpoints.filter((endpoint) => text(endpoint?.id) === configuredId);
    if (matches.length !== 1 || text(matches[0]?.name) !== ENDPOINT_NAME) throw new Error(`AVANTIQO_IMAGE_SHARED_RESUME_CONFIGURED_ENDPOINT_INVALID:matches=${matches.length}`);
    return matches[0];
  }
  const matches = endpoints.filter((endpoint) => text(endpoint?.name) === ENDPOINT_NAME);
  if (matches.length !== 1) throw new Error(`AVANTIQO_IMAGE_SHARED_RESUME_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  return matches[0];
}
function healthCounters(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
    in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    idle: finite(workers.idle, 0),
    initializing: finite(workers.initializing, 0),
    ready: finite(workers.ready, 0),
    running: finite(workers.running, 0),
    throttled: finite(workers.throttled, 0),
    unhealthy: finite(workers.unhealthy, 0),
  };
}
function activeExecution(health) { return health.in_queue + health.in_progress + health.idle + health.initializing + health.ready + health.running; }
function endpointUsers(endpoints, volumeId) {
  return array(endpoints)
    .filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId))
    .map((endpoint) => ({ id: text(endpoint?.id) || null, name: text(endpoint?.name) || null }));
}
function runChild(script, args, label) {
  console.log(`AVANTIQO_IMAGE_SHARED_RESUME_CHILD_START=${label}`);
  const result = spawnSync(process.execPath, [script, ...args], { cwd: process.cwd(), env: process.env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${label}_FAILED:exit=${result.status ?? "UNKNOWN"}`);
  console.log(`AVANTIQO_IMAGE_SHARED_RESUME_CHILD_COMPLETE=${label}`);
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_IMAGE_SHARED_RELOCATION_APPROVED)) throw new Error("AVANTIQO_IMAGE_SHARED_RELOCATION_APPROVED=YES_REQUIRED");
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = text(process.env.RUNPOD_AVANTIQO_IMAGE_API_KEY) || required("RUNPOD_API_KEY");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID);
const mainSha = requireCurrentMain();

console.log(`AVANTIQO_IMAGE_SHARED_RESUME_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log(`AVANTIQO_IMAGE_SHARED_RESUME_CONTRACT=${CONTRACT}`);
console.log("AVANTIQO_IMAGE_SHARED_RESUME_DATACENTER_PATCH_FIELD_USED=false");
console.log("AVANTIQO_IMAGE_SHARED_RESUME_REUSES_EXISTING_CANONICAL_VOLUME=true");
console.log("AVANTIQO_IMAGE_SHARED_RESUME_CODE_VOLUME_MUTATION=false");
console.log("AVANTIQO_IMAGE_SHARED_RESUME_IMAGE_GENERATION=false");
console.log("AVANTIQO_IMAGE_SHARED_RESUME_PRODUCTION_DEPLOY=false");
console.log("AVANTIQO_IMAGE_SHARED_RESUME_SECRETS_PRINTED=false");

let [endpoints, volumes, dataCenters] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  discoverDatacenters(managementKey),
]);
if (!Array.isArray(endpoints) || !Array.isArray(volumes)) throw new Error("AVANTIQO_IMAGE_SHARED_RESUME_RUNPOD_LIST_INVALID");
let endpoint = resolveEndpoint(endpoints, configuredEndpointId);
const endpointId = text(endpoint.id);
const originalStable = stableEndpoint(endpoint);
const sourceIds = endpointVolumeIds(endpoint);
if (sourceIds.length !== 1) throw new Error(`AVANTIQO_IMAGE_SHARED_RESUME_EXACTLY_ONE_SOURCE_VOLUME_REQUIRED:count=${sourceIds.length}`);
const sourceVolume = volumes.find((volume) => text(volume?.id) === sourceIds[0]);
if (!sourceVolume || classifyManagedVolumeName(sourceVolume?.name)?.id !== GROUP.id) throw new Error("AVANTIQO_IMAGE_SHARED_RESUME_SOURCE_VOLUME_INVALID");
const sourceVolumeId = text(sourceVolume.id);
const sourceDcId = text(sourceVolume.dataCenterId);
const canonical = volumes.filter((volume) => text(volume?.name) === GROUP.canonical_name);
if (canonical.length !== 1) throw new Error(`AVANTIQO_IMAGE_SHARED_RESUME_EXACTLY_ONE_CANONICAL_TARGET_REQUIRED:count=${canonical.length}`);
const targetVolume = canonical[0];
const targetVolumeId = text(targetVolume.id);
const targetDcId = text(targetVolume.dataCenterId);
if (!targetVolumeId || targetVolumeId === sourceVolumeId || finite(targetVolume?.size, 0) < MIN_VOLUME_GB) throw new Error("AVANTIQO_IMAGE_SHARED_RESUME_CANONICAL_TARGET_INVALID");
const currentGpuTypes = list(endpoint?.gpuTypeIds);
if (!currentGpuTypes.length) throw new Error("AVANTIQO_IMAGE_SHARED_RESUME_CURRENT_GPU_REQUIRED");
const rows = dataCenters.flatMap((dc) => array(dc?.gpuAvailability).map((gpu) => capacityRow(dc, gpu))).filter((row) => row.profile && row.vram_gb >= MIN_GPU_GB);
const sourceRows = rows.filter((row) => row.data_center_id === sourceDcId && currentGpuTypes.includes(row.gpu_type_id));
const sourceRank = Math.max(0, ...sourceRows.filter((row) => row.available).map((row) => row.stock_rank));
const targetRows = rows.filter((row) => row.data_center_id === targetDcId && row.available && row.stock_rank > sourceRank);
if (!targetRows.length) throw new Error(`AVANTIQO_IMAGE_SHARED_RESUME_TARGET_NO_LONGER_BETTER:source_rank=${sourceRank}:target=${targetDcId}`);
targetRows.sort((a, b) => Number(currentGpuTypes.includes(b.gpu_type_id)) - Number(currentGpuTypes.includes(a.gpu_type_id)) || b.stock_rank - a.stock_rank || a.cost_reference - b.cost_reference || b.preference - a.preference);
const bestRank = targetRows[0].stock_rank;
const targetGpuTypes = unique(targetRows.filter((row) => row.stock_rank === bestRank).slice(0, 4).map((row) => row.gpu_type_id));
const targetUsers = endpointUsers(endpoints, targetVolumeId);
if (targetUsers.length) throw new Error(`AVANTIQO_IMAGE_SHARED_RESUME_TARGET_VOLUME_ALREADY_IN_USE:${targetUsers.map((user) => user.name || user.id).join("|")}`);
const health = healthCounters(await queue(endpointId, "/health", inferenceKey));
if (activeExecution(health) !== 0) throw new Error(`AVANTIQO_IMAGE_SHARED_RESUME_ENDPOINT_BUSY:${JSON.stringify(health)}`);

const report = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_sha: mainSha,
  endpoint_before: safeEndpoint(endpoint),
  source_volume: safeVolume(sourceVolume),
  target_volume: safeVolume(targetVolume),
  source_capacity: sourceRows,
  source_stock_rank: sourceRank,
  target_capacity: targetRows,
  target_gpu_type_ids: targetGpuTypes,
  current_health: health,
  shared_policy: sharedVolumePolicySummary(volumes),
  datacenter_patch_field_used: false,
  cache_strategy: "PER_ATTACHED_VOLUME_CACHE_OR_VERIFY",
  code_volume_mutation: false,
  image_generation: false,
  production_deploy: false,
  mutation_performed: false,
  next_action: apply ? "MOVE_EXISTING_TARGET_CACHE_PROBE_RETIRE_SOURCE" : "RUN_RESUME_WITH_APPROVAL",
};
if (!apply) {
  console.log("AVANTIQO_IMAGE_SHARED_RESUME_PLAN=READY");
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

requireCurrentMain();
[endpoints, volumes, dataCenters] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/networkvolumes", managementKey),
  discoverDatacenters(managementKey),
]);
endpoint = resolveEndpoint(endpoints, endpointId);
if (!sameSet(endpointVolumeIds(endpoint), [sourceVolumeId])) throw new Error("AVANTIQO_IMAGE_SHARED_RESUME_SOURCE_BINDING_CHANGED_REPLAN_REQUIRED");
if (JSON.stringify(stableEndpoint(endpoint)) !== JSON.stringify(originalStable)) throw new Error("AVANTIQO_IMAGE_SHARED_RESUME_STABLE_FIELDS_CHANGED_REPLAN_REQUIRED");
const freshCanonical = volumes.filter((volume) => text(volume?.id) === targetVolumeId && text(volume?.name) === GROUP.canonical_name && text(volume?.dataCenterId) === targetDcId);
if (freshCanonical.length !== 1) throw new Error("AVANTIQO_IMAGE_SHARED_RESUME_TARGET_VOLUME_CHANGED_REPLAN_REQUIRED");
const freshRows = dataCenters.flatMap((dc) => array(dc?.gpuAvailability).map((gpu) => capacityRow(dc, gpu))).filter((row) => row.profile && row.vram_gb >= MIN_GPU_GB);
const freshSourceRows = freshRows.filter((row) => row.data_center_id === sourceDcId && currentGpuTypes.includes(row.gpu_type_id));
const freshSourceRank = Math.max(0, ...freshSourceRows.filter((row) => row.available).map((row) => row.stock_rank));
const freshTargetRows = freshRows.filter((row) => row.data_center_id === targetDcId && row.available && row.stock_rank > freshSourceRank);
if (!freshTargetRows.length) throw new Error(`AVANTIQO_IMAGE_SHARED_RESUME_TARGET_CAPACITY_LOST:source_rank=${freshSourceRank}:target=${targetDcId}`);
freshTargetRows.sort((a, b) => Number(currentGpuTypes.includes(b.gpu_type_id)) - Number(currentGpuTypes.includes(a.gpu_type_id)) || b.stock_rank - a.stock_rank || a.cost_reference - b.cost_reference || b.preference - a.preference);
const freshBestRank = freshTargetRows[0].stock_rank;
const freshGpuTypes = unique(freshTargetRows.filter((row) => row.stock_rank === freshBestRank).slice(0, 4).map((row) => row.gpu_type_id));
const freshHealth = healthCounters(await queue(endpointId, "/health", inferenceKey));
if (activeExecution(freshHealth) !== 0) throw new Error(`AVANTIQO_IMAGE_SHARED_RESUME_ENDPOINT_BECAME_BUSY:${JSON.stringify(freshHealth)}`);

// Network volume datacenter is authoritative. Intentionally omit dataCenterIds.
await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
  method: "PATCH",
  body: {
    networkVolumeId: targetVolumeId,
    networkVolumeIds: [targetVolumeId],
    gpuTypeIds: freshGpuTypes,
    workersMin: 0,
    workersMax: 1,
  },
});
const moved = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
if (!sameSet(endpointVolumeIds(moved), [targetVolumeId])) throw new Error("AVANTIQO_IMAGE_SHARED_RESUME_TARGET_BINDING_VERIFY_FAILED");
if (!sameSet(list(moved?.gpuTypeIds), freshGpuTypes)) throw new Error("AVANTIQO_IMAGE_SHARED_RESUME_GPU_POOL_VERIFY_FAILED");
if (finite(moved?.workersMin) !== 0 || finite(moved?.workersMax) !== 1) throw new Error("AVANTIQO_IMAGE_SHARED_RESUME_SCALING_VERIFY_FAILED");
if (JSON.stringify(stableEndpoint(moved)) !== JSON.stringify(originalStable)) throw new Error("AVANTIQO_IMAGE_SHARED_RESUME_STABLE_FIELDS_CHANGED_DURING_MOVE");
console.log(`AVANTIQO_IMAGE_SHARED_RESUME_ENDPOINT_MOVED_TO_VOLUME=${targetVolumeId}`);
console.log(`AVANTIQO_IMAGE_SHARED_RESUME_EFFECTIVE_DATACENTER=${targetDcId}`);
console.log(`AVANTIQO_IMAGE_SHARED_RESUME_GPU_POOL=${freshGpuTypes.join("|")}`);

runChild("scripts/cache-avantiqo-image-2512-local.mjs", ["--apply"], "AVANTIQO_IMAGE_SHARED_RESUME_CACHE");
let probePassed = false;
try {
  runChild("scripts/probe-avantiqo-image-runtime-local.mjs", [], "AVANTIQO_IMAGE_SHARED_RESUME_PROBE");
  probePassed = true;
} catch (error) {
  console.error(`AVANTIQO_IMAGE_SHARED_RESUME_PROBE_FAILED=${text(error?.message || error)}`);
}
if (!probePassed) {
  console.log(JSON.stringify({ ...report, success: false, mode: "APPLY", mutation_performed: true, target_cache_verified: true, target_runtime_probe_passed: false, source_volume_deleted: false, next_action: "TARGET_CACHE_READY_PROBE_FAILED_KEEP_SOURCE_BACKUP" }, null, 2));
  process.exitCode = 2;
  process.exit(0);
}

requireCurrentMain();
const finalEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
const finalImage = resolveEndpoint(finalEndpoints, endpointId);
if (!sameSet(endpointVolumeIds(finalImage), [targetVolumeId])) throw new Error("AVANTIQO_IMAGE_SHARED_RESUME_FINAL_TARGET_BINDING_LOST");
const sourceUsers = endpointUsers(finalEndpoints, sourceVolumeId);
let sourceDeleted = false;
if (!sourceUsers.length) {
  await rest(`/networkvolumes/${encodeURIComponent(sourceVolumeId)}`, managementKey, { method: "DELETE" });
  sourceDeleted = true;
}
const finalVolumes = await rest("/networkvolumes", managementKey);
console.log("AVANTIQO_IMAGE_SHARED_RELOCATION_RESUME=COMPLETE");
console.log(JSON.stringify({
  ...report,
  success: sourceDeleted,
  mode: "APPLY",
  mutation_performed: true,
  endpoint_after: safeEndpoint(finalImage),
  target_cache_verified: true,
  target_runtime_probe_passed: true,
  source_volume_deleted: sourceDeleted,
  source_volume_remaining_users: sourceUsers,
  final_shared_policy: sharedVolumePolicySummary(finalVolumes),
  next_action: sourceDeleted ? "RUN_ONE_IMAGE_QUALITY_CERTIFICATION" : "SOURCE_VOLUME_STILL_IN_USE_REVIEW_BEFORE_DELETE",
}, null, 2));
if (!sourceDeleted) process.exitCode = 2;
