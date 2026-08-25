import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_RUNPOD_PRIVATE_REGISTRY_DIAGNOSTIC_V1";
const LOCK_PATH = "audits/results/avantiqo-voice-tts-controlled-generation.json";
const LOCK_CONTRACT = "AVANTIQO_VOICE_TTS_CONTROLLED_GENERATION_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function normalizeListResponse(value, candidateKeys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...candidateKeys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const normalized = normalizeListResponse(value[key], candidateKeys, depth + 1);
    if (normalized) return normalized;
  }
  return null;
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}
async function rest(path, key) {
  return readJson(await fetch(`${REST}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_PRIVATE_REGISTRY_REST");
}
async function controlWorkers(endpointId, key) {
  return readJson(await fetch(`${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), "RUNPOD_PRIVATE_REGISTRY_CONTROL");
}
function resolveTemplate(endpoint, templates) {
  const id = text(endpoint?.templateId || endpoint?.template?.id);
  const matches = templates.filter((template) => text(template?.id) === id);
  if (!id || matches.length !== 1) return null;
  return matches[0];
}
function registryHost(image) {
  const value = text(image);
  if (!value) return null;
  const first = value.split("/")[0];
  return first.includes(".") || first.includes(":") ? first : "docker.io";
}
function activeWorkers(body = {}) {
  return list(body?.workers).filter((worker) => {
    const status = text(worker?.status).toUpperCase();
    return !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(status);
  }).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    status: text(worker?.status).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}

const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
if (lock?.contract !== LOCK_CONTRACT) throw new Error("RUNPOD_PRIVATE_REGISTRY_LOCK_CONTRACT_MISMATCH");
if (lock?.generation_submitted !== true || Number(lock?.accepted_generation_count) !== 1) {
  throw new Error("RUNPOD_PRIVATE_REGISTRY_ONE_ACCEPTED_GENERATION_REQUIRED");
}
if (lock?.new_generation_allowed !== false || lock?.stt_submitted !== false) {
  throw new Error("RUNPOD_PRIVATE_REGISTRY_GENERATION_LOCK_REQUIRED");
}

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const [endpointsRaw, templatesRaw, registryAuthsRaw] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", managementKey),
  rest("/containerregistryauth", managementKey),
]);
const endpoints = normalizeListResponse(endpointsRaw, ["endpoints"]) || [];
const templates = normalizeListResponse(templatesRaw, ["templates"]) || [];
const registryAuths = normalizeListResponse(registryAuthsRaw, ["containerRegistryAuths", "registryAuths"]) || [];
const knownRegistryAuthIds = new Set(registryAuths.map((item) => text(item?.id)).filter(Boolean));

const rows = [];
for (const endpoint of endpoints) {
  const id = text(endpoint?.id);
  if (!id) continue;
  const template = resolveTemplate(endpoint, templates) || endpoint?.template || {};
  let workersRaw = {};
  let workerReadError = null;
  try {
    workersRaw = await controlWorkers(id, managementKey);
  } catch (error) {
    workerReadError = text(error?.message || error).slice(0, 500);
  }
  const authId = text(template?.containerRegistryAuthId);
  const image = text(template?.imageName || template?.image);
  rows.push({
    endpoint_id: id,
    endpoint_name: text(endpoint?.name) || null,
    template_id: text(endpoint?.templateId || template?.id) || null,
    image_name: image || null,
    image_registry_host: registryHost(image),
    registry_auth_present: Boolean(authId),
    registry_auth_id: authId || null,
    registry_auth_id_exists: authId ? knownRegistryAuthIds.has(authId) : null,
    registry_auth_name: authId
      ? (text(registryAuths.find((item) => text(item?.id) === authId)?.name) || null)
      : null,
    active_workers: activeWorkers(workersRaw),
    active_worker_count: activeWorkers(workersRaw).length,
    worker_read_error: workerReadError,
  });
}

const exactTts = rows.find((row) => row.endpoint_id === text(lock?.endpoint_id)) || null;
if (!exactTts) throw new Error("RUNPOD_PRIVATE_REGISTRY_TTS_ENDPOINT_NOT_FOUND");
const sameAuthActiveEndpoints = exactTts.registry_auth_id
  ? rows.filter((row) =>
      row.endpoint_id !== exactTts.endpoint_id &&
      row.registry_auth_id === exactTts.registry_auth_id &&
      row.active_worker_count > 0)
  : [];
const activePrivateRegistryEndpoints = rows.filter((row) => row.registry_auth_present && row.active_worker_count > 0);
const activeGhcrEndpoints = rows.filter((row) => row.image_registry_host === "ghcr.io" && row.active_worker_count > 0);

let diagnosis = "PRIVATE_REGISTRY_NOT_PROVEN_AS_BLOCKER";
let nextAction = "OPEN_RUNPOD_SUPPORT_ENDPOINT_SPECIFIC_SCHEDULER_FAILURE_NO_NEW_JOB";
if (!exactTts.registry_auth_present) {
  diagnosis = "TTS_PRIVATE_IMAGE_MISSING_REGISTRY_AUTH_BINDING";
  nextAction = "REPAIR_TTS_TEMPLATE_REGISTRY_AUTH_WITHOUT_NEW_JOB";
} else if (exactTts.registry_auth_id_exists !== true) {
  diagnosis = "TTS_REGISTRY_AUTH_ID_NO_LONGER_EXISTS";
  nextAction = "REPAIR_TTS_TEMPLATE_REGISTRY_AUTH_WITHOUT_NEW_JOB";
} else if (sameAuthActiveEndpoints.length > 0) {
  diagnosis = "SAME_REGISTRY_AUTH_IS_PROVEN_ON_ACTIVE_WORKERS";
  nextAction = "OPEN_RUNPOD_SUPPORT_ENDPOINT_SPECIFIC_SCHEDULER_FAILURE_NO_NEW_JOB";
} else if (activeGhcrEndpoints.length > 0) {
  diagnosis = "GHCR_PROVEN_ACTIVE_BUT_TTS_AUTH_NOT_SHARED_WITH_ACTIVE_ENDPOINT";
  nextAction = "COMPARE_TTS_REGISTRY_AUTH_ID_TO_ACTIVE_GHCR_ENDPOINT_BEFORE_SUPPORT";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  accepted_generation_count: 1,
  generation_submitted: false,
  new_generation_allowed: false,
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  queue_purged: false,
  job_cancelled: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  registry_secret_values_printed: false,
  exact_tts_endpoint: exactTts,
  registry_auth_catalog: registryAuths.map((item) => ({
    id: text(item?.id) || null,
    name: text(item?.name) || null,
  })),
  same_registry_auth_active_endpoints: sameAuthActiveEndpoints,
  active_private_registry_endpoints: activePrivateRegistryEndpoints,
  active_ghcr_endpoints: activeGhcrEndpoints,
  diagnosis,
  safe_to_submit_duplicate_job: false,
  next_action: nextAction,
}, null, 2));
