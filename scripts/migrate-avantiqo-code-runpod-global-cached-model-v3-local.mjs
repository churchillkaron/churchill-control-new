const CONTRACT = "AVANTIQO_CODE_RUNPOD_GLOBAL_CACHED_MODEL_MIGRATION_V3";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const MODEL_REPO = "Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8";
const APPROVAL_ENV = "AVANTIQO_CODE_GLOBAL_CACHED_MODEL_MIGRATION_APPROVED";
const TARGET_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA H200",
  "NVIDIA H100 80GB HBM3",
]);
const TARGET_ALLOWED_CUDA_VERSIONS = Object.freeze(["12.8", "12.9", "13.0"]);

const text = (value, maximum = 4000) => String(value ?? "").trim().slice(0, maximum);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name) {
  const value = text(process.env[name], 2000);
  if (!value) throw new Error(`${CONTRACT}_${name}_REQUIRED`);
  return value;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.detail || body?.error?.message || body?.error || body?.message || raw, 1400) || "UNKNOWN"}`);
  return body;
}

async function rest(pathname, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json", ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJson(response, `${CONTRACT}_REST`);
}

async function queue(pathname, credential, options = {}) {
  const response = await fetch(`${QUEUE_BASE}/${ENDPOINT_ID}${pathname}`, {
    method: options.method || "GET",
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJson(response, `${CONTRACT}_QUEUE`);
}

async function graphql(query, variables, credential) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${credential}`, Accept: "application/json", "Content-Type": "application/json", "User-Agent": "AvantiqoCodeGlobalCachedModelRecoveryV3" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readJson(response, `${CONTRACT}_GRAPHQL`);
  if (list(body.errors).length) throw new Error(`${CONTRACT}_GRAPHQL_ERROR:${list(body.errors).map((entry) => text(entry?.message)).join(" | ").slice(0, 1800)}`);
  return body;
}

function rows(raw, keys = []) {
  if (Array.isArray(raw)) return raw;
  for (const key of [...keys, "data", "items", "results", "networkVolumes", "volumes"]) if (Array.isArray(raw?.[key])) return raw[key];
  return [];
}

function endpointVolumeIds(endpoint = {}) {
  const ids = [text(endpoint.networkVolumeId), ...list(endpoint.networkVolumeIds).map((entry) => text(typeof entry === "string" ? entry : entry?.networkVolumeId || entry?.id))].filter(Boolean);
  return [...new Set(ids)];
}

function normalizeLocations(value) {
  if (Array.isArray(value)) return value.map((entry) => text(entry)).filter(Boolean);
  const raw = text(value);
  return raw ? raw.split(",").map((entry) => entry.trim()).filter(Boolean) : [];
}

function normalizeModelReference(value) {
  let result = text(value, 1000);
  result = result.replace(/^https?:\/\/huggingface\.co\//i, "");
  result = result.replace(/\/(?:tree|resolve)\/main\/?$/i, "");
  result = result.replace(/:(?:main|[0-9a-f]{40,64})$/i, "");
  result = result.replace(/\/$/, "");
  return result;
}

function modelRevision(value) {
  let result = text(value, 1000).replace(/^https?:\/\/huggingface\.co\//i, "").replace(/\/$/, "");
  const match = result.match(/:([0-9a-f]{40,64}|main)$/i);
  return match ? match[1] : null;
}

function modelMatches(value) {
  return normalizeModelReference(value).toLowerCase() === MODEL_REPO.toLowerCase();
}

function healthSummary(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return { jobs: { in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0), in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0) }, workers: { idle: finite(workers.idle, 0), initializing: finite(workers.initializing, 0), ready: finite(workers.ready, 0), running: finite(workers.running, 0), throttled: finite(workers.throttled, 0), unhealthy: finite(workers.unhealthy, 0) } };
}

function workerCount(summary) {
  return Object.values(summary.workers).reduce((sum, value) => sum + Math.max(0, finite(value, 0)), 0);
}

const ENDPOINT_QUERY = `query AvantiqoCodeEndpointReadV3 { myself { endpoints { id name templateId gpuIds gpuCount instanceIds workersMin workersMax locations networkVolumeId networkVolumeIds { networkVolumeId dataCenterId } idleTimeout scalerType scalerValue executionTimeoutMs minCudaVersion flashBootType modelReferences } } }`;
const SAVE_ENDPOINT_MUTATION = `mutation AvantiqoCodeSaveEndpointV3($input: EndpointInput!) { saveEndpoint(input:$input) { id name templateId gpuIds gpuCount instanceIds workersMin workersMax locations networkVolumeId networkVolumeIds { networkVolumeId dataCenterId } idleTimeout scalerType scalerValue executionTimeoutMs minCudaVersion flashBootType modelReferences } }`;

async function graphEndpoint(key) {
  const body = await graphql(ENDPOINT_QUERY, {}, key);
  const matches = list(body?.data?.myself?.endpoints).filter((entry) => text(entry?.id) === ENDPOINT_ID);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_GRAPH_ENDPOINT_RESOLUTION:${matches.length}`);
  if (text(matches[0]?.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_GRAPH_ENDPOINT_NAME_MISMATCH`);
  return matches[0];
}

function endpointInput(base) {
  const templateId = text(base.templateId);
  const gpuIds = text(base.gpuIds);
  if (!templateId || !gpuIds) throw new Error(`${CONTRACT}_GRAPH_BASE_INCOMPLETE`);
  return { id: ENDPOINT_ID, name: ENDPOINT_NAME, templateId, gpuIds, gpuCount: finite(base.gpuCount, 1), instanceIds: list(base.instanceIds), workersMin: 0, workersMax: 0, locations: "", networkVolumeId: "", networkVolumeIds: [], idleTimeout: 5, scalerType: "REQUEST_COUNT", scalerValue: 1, executionTimeoutMs: finite(base.executionTimeoutMs, 600_000), minCudaVersion: "12.8", flashBootType: "FLASHBOOT", modelReferences: [MODEL_REPO] };
}

async function saveEndpoint(key, input) {
  const body = await graphql(SAVE_ENDPOINT_MUTATION, { input }, key);
  const saved = body?.data?.saveEndpoint;
  if (!saved || text(saved.id) !== ENDPOINT_ID) throw new Error(`${CONTRACT}_SAVE_ENDPOINT_INVALID`);
  return saved;
}

async function waitForIdle(queueKey, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let summary = healthSummary(await queue("/health", queueKey));
  while (Date.now() < deadline && workerCount(summary) > 0) { await sleep(1500); summary = healthSummary(await queue("/health", queueKey)); }
  return summary;
}

if (text(process.env.NODE_ENV).toLowerCase() === "production") throw new Error(`${CONTRACT}_PRODUCTION_ENV_FORBIDDEN`);
if (text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") throw new Error(`${CONTRACT}_APPROVAL_REQUIRED:set_${APPROVAL_ENV}=YES`);
const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const queueKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || managementKey, 2000);
if (!queueKey) throw new Error(`${CONTRACT}_QUEUE_KEY_REQUIRED`);

console.log(JSON.stringify({ event: `${CONTRACT}_START`, endpoint_id: ENDPOINT_ID, endpoint_name: ENDPOINT_NAME, model_repo: MODEL_REPO, accepts_partial_prior_migration_state: true, accepts_immutable_cached_model_revision: true, target_scheduling: "GLOBAL_RUNPOD_CACHED_MODEL", target_scaler_type: "REQUEST_COUNT", target_scaler_value: 1, target_gpu_type_ids: TARGET_GPU_TYPE_IDS, preserve_existing_code_storage: true, create_storage: false, inference_performed: false, production_deploy_performed: false, secrets_printed: false }));

const [initialRest, initialGraph, volumesBeforeRaw] = await Promise.all([rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey), graphEndpoint(managementKey), rest("/networkvolumes", managementKey)]);
if (text(initialRest.id) !== ENDPOINT_ID || text(initialRest.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_INITIAL_ENDPOINT_IDENTITY_INVALID`);
const codeVolumes = rows(volumesBeforeRaw, ["networkVolumes"]).filter((entry) => /avantiqo.*code.*cache/i.test(text(entry?.name)));
if (codeVolumes.length !== 1) throw new Error(`${CONTRACT}_ONE_CANONICAL_CODE_STORAGE_REQUIRED:${codeVolumes.length}`);
const canonicalVolume = codeVolumes[0];
const canonicalVolumeId = text(canonicalVolume?.id);
const canonicalVolumeName = text(canonicalVolume?.name);
if (!canonicalVolumeId) throw new Error(`${CONTRACT}_CANONICAL_CODE_STORAGE_ID_REQUIRED`);

let health = healthSummary(await queue("/health", queueKey));
if (health.jobs.in_progress > 0) throw new Error(`${CONTRACT}_ACTIVE_INFERENCE_PRESENT:${health.jobs.in_progress}`);
if (health.jobs.in_queue > 0) {
  const purged = await queue("/purge-queue", queueKey, { method: "POST" });
  console.log(JSON.stringify({ event: `${CONTRACT}_STALE_QUEUE_PURGED`, removed: finite(purged?.removed, 0), inference_performed: false, secrets_printed: false }));
  await sleep(750);
  health = healthSummary(await queue("/health", queueKey));
  if (health.jobs.in_queue > 0 || health.jobs.in_progress > 0) throw new Error(`${CONTRACT}_QUEUE_DRAIN_FAILED`);
}

await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, { method: "PATCH", body: { workersMin: 0, workersMax: 0, idleTimeout: 5 } });
health = await waitForIdle(queueKey);
if (health.jobs.in_queue > 0 || health.jobs.in_progress > 0 || workerCount(health) > 0) throw new Error(`${CONTRACT}_PRE_MIGRATION_NOT_IDLE:${JSON.stringify(health)}`);

const attachedBefore = endpointVolumeIds(initialRest);
const modelRefsBefore = list(initialGraph.modelReferences).map((entry) => text(entry)).filter(Boolean);
console.log(JSON.stringify({ event: `${CONTRACT}_RECOVERY_STATE`, endpoint_volume_ids_before: attachedBefore, model_references_before: modelRefsBefore.map(normalizeModelReference), model_revisions_before: modelRefsBefore.map(modelRevision), endpoint_was_partially_detached: attachedBefore.length === 0, canonical_storage_id: canonicalVolumeId, canonical_storage_name: canonicalVolumeName, secrets_printed: false }));

await saveEndpoint(managementKey, endpointInput(initialGraph));
await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, { method: "PATCH", body: { gpuTypeIds: [...TARGET_GPU_TYPE_IDS], gpuCount: 1, workersMin: 0, workersMax: 0, idleTimeout: 5, scalerType: "REQUEST_COUNT", scalerValue: 1, flashboot: true, minCudaVersion: "12.8", allowedCudaVersions: [...TARGET_ALLOWED_CUDA_VERSIONS], dataCenterIds: [], networkVolumeIds: [] } });

const [verifiedRest, verifiedGraph, verifiedHealthRaw, volumesAfterRaw] = await Promise.all([rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey), graphEndpoint(managementKey), queue("/health", queueKey), rest("/networkvolumes", managementKey)]);
const verifiedHealth = healthSummary(verifiedHealthRaw);
const verifiedModels = list(verifiedGraph.modelReferences).map((entry) => text(entry)).filter(Boolean);
if (endpointVolumeIds(verifiedRest).length !== 0) throw new Error(`${CONTRACT}_VERIFY_ENDPOINT_VOLUME_DETACH_FAILED`);
if (normalizeLocations(verifiedGraph.locations ?? verifiedRest.dataCenterIds).length !== 0) throw new Error(`${CONTRACT}_VERIFY_GLOBAL_DATACENTER_FAILED`);
if (!verifiedModels.some(modelMatches)) throw new Error(`${CONTRACT}_VERIFY_MODEL_REFERENCE_FAILED:${verifiedModels.map(normalizeModelReference).join(",") || "NONE"}`);
if (finite(verifiedRest.workersMin, -1) !== 0 || finite(verifiedRest.workersMax, -1) !== 0) throw new Error(`${CONTRACT}_VERIFY_ZERO_IDLE_FAILED`);
if (text(verifiedRest.scalerType).toUpperCase() !== "REQUEST_COUNT" || finite(verifiedRest.scalerValue, -1) !== 1) throw new Error(`${CONTRACT}_VERIFY_RESPONSIVE_SCALER_FAILED:${text(verifiedRest.scalerType)}:${verifiedRest.scalerValue}`);
if (JSON.stringify(list(verifiedRest.gpuTypeIds)) !== JSON.stringify(TARGET_GPU_TYPE_IDS)) throw new Error(`${CONTRACT}_VERIFY_GPU_PRIORITY_FAILED:${JSON.stringify(verifiedRest.gpuTypeIds)}`);
if (verifiedHealth.jobs.in_queue > 0 || verifiedHealth.jobs.in_progress > 0 || workerCount(verifiedHealth) > 0) throw new Error(`${CONTRACT}_VERIFY_HEALTH_NOT_IDLE`);
const codeVolumesAfter = rows(volumesAfterRaw, ["networkVolumes"]).filter((entry) => /avantiqo.*code.*cache/i.test(text(entry?.name)));
if (codeVolumesAfter.length !== 1) throw new Error(`${CONTRACT}_VERIFY_ONE_CODE_STORAGE_REQUIRED:${codeVolumesAfter.length}`);
if (text(codeVolumesAfter[0]?.id) !== canonicalVolumeId || text(codeVolumesAfter[0]?.name) !== canonicalVolumeName) throw new Error(`${CONTRACT}_VERIFY_CANONICAL_CODE_STORAGE_CHANGED`);

console.log(JSON.stringify({ success: true, contract: CONTRACT, migration_performed: true, recovered_partial_prior_state: attachedBefore.length === 0, endpoint_id: ENDPOINT_ID, endpoint_name: ENDPOINT_NAME, model_repo: MODEL_REPO, model_reference_returned_by_runpod: verifiedModels, model_revision_returned_by_runpod: verifiedModels.map(modelRevision), scheduling_scope: "GLOBAL", scaler_type: text(verifiedRest.scalerType), scaler_value: finite(verifiedRest.scalerValue, null), gpu_type_ids: list(verifiedRest.gpuTypeIds), endpoint_network_volume_attached: false, endpoint_datacenter_restricted: false, canonical_code_storage_preserved: true, canonical_code_storage_id: canonicalVolumeId, canonical_code_storage_name: canonicalVolumeName, code_storage_count: 1, new_storage_created: false, storage_deleted: false, workers_min: 0, workers_max: 0, active_workers: 0, queued_jobs: 0, inference_performed: false, production_deploy_performed: false, secrets_printed: false }, null, 2));
console.log(`${CONTRACT}=PASS`);