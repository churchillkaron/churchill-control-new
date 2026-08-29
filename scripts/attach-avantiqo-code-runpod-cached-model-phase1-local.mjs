import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_RUNPOD_CACHED_MODEL_PHASE1_V1";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const REQUIRED_NETWORK_VOLUME_ID = "7obluigbr0";
const MODEL_REVISION = "dcaee4d4dfc5ee71ad501f01f530e5652438fde0";
const MODEL_REFERENCE = `https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8:${MODEL_REVISION}`;
const APPROVAL_ENV = "AVANTIQO_CODE_CACHED_MODEL_PHASE1_V1_APPROVED";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const IMAGE_DIGEST = "sha256:4cbbea028c8bcfae7c955a1b42e90e089e1f0fc1169fd98bbace2670dae4d425";
const IMMUTABLE_IMAGE = `ghcr.io/churchillkaron/avantiqo-code-worker@${IMAGE_DIGEST}`;
const TARGET_GPUS = [
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H100 NVL",
  "NVIDIA H200",
  "NVIDIA B200",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
];
const TARGET_CUDA = ["12.8", "12.9", "13.0"];

const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

async function jsonResponse(response, label) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) throw new Error(`${label}_HTTP_${response.status}:${text(body?.detail || body?.error || body?.message || raw, 1000)}`);
  return body;
}

async function rest(path, key, options = {}) {
  return jsonResponse(await fetch(`${REST_BASE}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_REST`);
}

async function graphql(query, variables, key) {
  const body = await jsonResponse(await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_GRAPHQL`);
  if (list(body.errors).length) throw new Error(`${CONTRACT}_GRAPHQL_ERROR:${list(body.errors).map((e) => text(e?.message)).join(" | ").slice(0, 1200)}`);
  return body;
}

async function health(key) {
  return jsonResponse(await fetch(`${QUEUE_BASE}/${ENDPOINT_ID}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }), `${CONTRACT}_HEALTH`);
}

function counters(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      idle: finite(workers.idle, 0),
      initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0),
      running: finite(workers.running, 0),
      throttled: finite(workers.throttled, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}

function assertIdle(summary, label) {
  if (summary.jobs.in_queue || summary.jobs.in_progress || Object.values(summary.workers).some(Number)) {
    throw new Error(`${label}_NOT_IDLE:${JSON.stringify(summary)}`);
  }
}

function stringList(value) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const raw = text(value);
  return raw ? raw.split(",").map((v) => v.trim()).filter(Boolean) : [];
}

function sameMembers(a, b) {
  return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
}

function volumeIds(endpoint = {}) {
  const ids = list(endpoint.networkVolumeIds).map((v) => typeof v === "string" ? text(v) : text(v?.networkVolumeId)).filter(Boolean);
  const legacy = text(endpoint.networkVolumeId);
  if (legacy && !ids.includes(legacy)) ids.push(legacy);
  return ids;
}

const QUERY = `
query CodeCachedModelPhase1Read {
  myself { endpoints {
    id name templateId gpuIds gpuCount instanceIds workersMin workersMax locations
    networkVolumeId networkVolumeIds { networkVolumeId dataCenterId }
    idleTimeout scalerType scalerValue executionTimeoutMs minCudaVersion flashBootType modelReferences
  } }
}`;
const MUTATION = `
mutation CodeCachedModelPhase1Save($input: EndpointInput!) {
  saveEndpoint(input: $input) {
    id name templateId gpuIds gpuCount instanceIds workersMin workersMax locations
    networkVolumeId networkVolumeIds { networkVolumeId dataCenterId }
    idleTimeout scalerType scalerValue executionTimeoutMs minCudaVersion flashBootType modelReferences
  }
}`;

async function gqlEndpoint(key) {
  const body = await graphql(QUERY, {}, key);
  const matches = list(body?.data?.myself?.endpoints).filter((e) => text(e?.id) === ENDPOINT_ID);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  return matches[0];
}

function saveInput(endpoint) {
  const volumes = list(endpoint.networkVolumeIds).map((v) => ({ networkVolumeId: text(v?.networkVolumeId || v) })).filter((v) => v.networkVolumeId);
  if (!volumes.some((v) => v.networkVolumeId === REQUIRED_NETWORK_VOLUME_ID)) {
    throw new Error(`${CONTRACT}_NETWORK_VOLUME_MUST_REMAIN_ATTACHED`);
  }
  return {
    id: ENDPOINT_ID,
    name: text(endpoint.name),
    templateId: text(endpoint.templateId),
    gpuIds: text(endpoint.gpuIds),
    gpuCount: finite(endpoint.gpuCount, 1),
    instanceIds: list(endpoint.instanceIds),
    workersMin: finite(endpoint.workersMin, 0),
    workersMax: finite(endpoint.workersMax, 1),
    locations: text(endpoint.locations),
    networkVolumeId: text(endpoint.networkVolumeId) || REQUIRED_NETWORK_VOLUME_ID,
    networkVolumeIds: volumes,
    idleTimeout: finite(endpoint.idleTimeout, 60),
    scalerType: text(endpoint.scalerType),
    scalerValue: finite(endpoint.scalerValue, 1),
    executionTimeoutMs: finite(endpoint.executionTimeoutMs, 1_260_000),
    minCudaVersion: text(endpoint.minCudaVersion),
    flashBootType: text(endpoint.flashBootType),
    modelReferences: [MODEL_REFERENCE],
  };
}

function assertRestPolicy(endpoint, label) {
  if (text(endpoint.id) !== ENDPOINT_ID || text(endpoint.name) !== ENDPOINT_NAME) throw new Error(`${label}_IDENTITY`);
  if (text(endpoint.template?.imageName) !== IMMUTABLE_IMAGE) throw new Error(`${label}_IMAGE:${text(endpoint.template?.imageName)}`);
  if (finite(endpoint.workersMin) !== 0 || finite(endpoint.workersMax) !== 1) throw new Error(`${label}_WORKERS`);
  const flash = endpoint.flashboot === true || endpoint.flashBoot === true || text(endpoint.flashBootType).toUpperCase() === "FLASHBOOT";
  if (!flash) throw new Error(`${label}_FLASHBOOT`);
  if (text(endpoint.scalerType) !== "QUEUE_DELAY" || finite(endpoint.scalerValue) !== 1) throw new Error(`${label}_SCALER`);
  if (!sameMembers(stringList(endpoint.gpuTypeIds), TARGET_GPUS)) throw new Error(`${label}_GPU_POOL:${JSON.stringify(stringList(endpoint.gpuTypeIds))}`);
  if (text(endpoint.minCudaVersion) !== "12.8" || !sameMembers(stringList(endpoint.allowedCudaVersions), TARGET_CUDA)) throw new Error(`${label}_CUDA`);
  if (!volumeIds(endpoint).includes(REQUIRED_NETWORK_VOLUME_ID)) throw new Error(`${label}_NETWORK_VOLUME`);
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey || !queueKey) throw new Error(`${CONTRACT}_RUNPOD_CREDENTIAL_REQUIRED`);

const beforeRest = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey);
const beforeHealth = counters(await health(queueKey));
const beforeGql = await gqlEndpoint(managementKey);
assertIdle(beforeHealth, `${CONTRACT}_PREFLIGHT`);
assertRestPolicy(beforeRest, `${CONTRACT}_PREFLIGHT`);
const existingRefs = list(beforeGql.modelReferences).map(text).filter(Boolean);
if (existingRefs.some((r) => r !== MODEL_REFERENCE)) throw new Error(`${CONTRACT}_UNEXPECTED_MODEL_REFERENCE:${JSON.stringify(existingRefs)}`);

const base = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_id: ENDPOINT_ID,
  model_reference: MODEL_REFERENCE,
  model_revision: MODEL_REVISION,
  model_reference_already_present: existingRefs.includes(MODEL_REFERENCE),
  network_volume_preserved: true,
  network_volume_detach_performed: false,
  generation_submitted: false,
  provider_inference_performed: false,
  reasoning_call_consumed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
  health_before: beforeHealth,
};

if (!apply || existingRefs.includes(MODEL_REFERENCE)) {
  console.log(JSON.stringify({ ...base, mutation_performed: false, next_action: "VERIFY_RUNPOD_CACHED_MODEL_READINESS_BEFORE_VOLUME_DETACH" }, null, 2));
  process.exit(0);
}

const saved = await graphql(MUTATION, { input: saveInput(beforeGql) }, managementKey);
if (text(saved?.data?.saveEndpoint?.id) !== ENDPOINT_ID) throw new Error(`${CONTRACT}_SAVE_RESPONSE_INVALID`);

// GraphQL saveEndpoint is a full replace. Reassert the exact REST-owned policy while deliberately preserving the current volume.
await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, {
  method: "PATCH",
  body: {
    workersMin: 0,
    workersMax: 1,
    idleTimeout: 60,
    flashboot: true,
    scalerType: "QUEUE_DELAY",
    scalerValue: 1,
    gpuTypeIds: TARGET_GPUS,
    gpuCount: 1,
    minCudaVersion: "12.8",
    allowedCudaVersions: TARGET_CUDA,
    dataCenterIds: [],
    executionTimeoutMs: 1_260_000,
    networkVolumeId: REQUIRED_NETWORK_VOLUME_ID,
    networkVolumeIds: [REQUIRED_NETWORK_VOLUME_ID],
  },
});

const afterRest = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey);
const afterGql = await gqlEndpoint(managementKey);
const afterHealth = counters(await health(queueKey));
assertIdle(afterHealth, `${CONTRACT}_POST`);
assertRestPolicy(afterRest, `${CONTRACT}_POST`);
const afterRefs = list(afterGql.modelReferences).map(text).filter(Boolean);
if (afterRefs.length !== 1 || afterRefs[0] !== MODEL_REFERENCE) throw new Error(`${CONTRACT}_MODEL_REFERENCE_VERIFY_FAILED:${JSON.stringify(afterRefs)}`);

console.log(JSON.stringify({
  ...base,
  success: true,
  mode: "APPLY",
  mutation_performed: true,
  model_reference_after: afterRefs,
  health_after: afterHealth,
  network_volume_preserved: true,
  network_volume_detach_performed: false,
  zero_idle_policy_preserved: true,
  preload_image_preserved: true,
  cached_model_requested_from_runpod: true,
  cached_model_ready_not_assumed: true,
  next_action: "VERIFY_RUNPOD_CACHED_MODEL_READINESS_BEFORE_VOLUME_DETACH",
}, null, 2));
