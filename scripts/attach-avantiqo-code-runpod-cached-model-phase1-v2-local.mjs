import { spawnSync } from "node:child_process";
import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_RUNPOD_CACHED_MODEL_PHASE1_V2";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const REQUIRED_NETWORK_VOLUME_ID = "7obluigbr0";
const MODEL_REVISION = "dcaee4d4dfc5ee71ad501f01f530e5652438fde0";
const MODEL_REFERENCE = `https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8:${MODEL_REVISION}`;
const APPROVAL_ENV = "AVANTIQO_CODE_CACHED_MODEL_PHASE1_V2_APPROVED";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const IMAGE_SOURCE_SHA = "e1a688d73f506778c4d52a91e71030d74cdd3208";
const IMMUTABLE_IMAGE = "ghcr.io/churchillkaron/avantiqo-code-worker@sha256:4cbbea028c8bcfae7c955a1b42e90e089e1f0fc1169fd98bbace2670dae4d425";
const TARGET_GPUS = Object.freeze([
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H100 NVL",
  "NVIDIA H200",
  "NVIDIA B200",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
]);
const TARGET_CUDA = Object.freeze(["12.8", "12.9", "13.0"]);
const SERVERLESS_IMAGE_INPUTS = Object.freeze([
  "services/avantiqo-code-engine/Dockerfile.runpod",
  "services/avantiqo-code-engine/handler.py",
  "services/avantiqo-code-engine/serverless_boot.py",
  "services/avantiqo-code-engine/requirements.txt",
]);

const text = (value, max = 4000) => String(value ?? "").trim().slice(0, max);
const rows = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function stringList(value) {
  if (Array.isArray(value)) return value.map((entry) => text(entry)).filter(Boolean);
  const raw = text(value);
  return raw ? raw.split(",").map((entry) => entry.trim()).filter(Boolean) : [];
}

function modelReferences(value) {
  return rows(value).map((entry) => text(entry)).filter(Boolean);
}

function sameMembers(left, right) {
  return JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout, 1200) || `exit=${result.status}`}`);
  }
  return text(result.stdout, 100000);
}

function sourceGate() {
  command("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const originMain = command("git", ["rev-parse", "origin/main"], `${CONTRACT}_ORIGIN_MAIN_FAILED`).toLowerCase();
  const ancestor = spawnSync("git", ["merge-base", "--is-ancestor", IMAGE_SOURCE_SHA, originMain], {
    cwd: process.cwd(), encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"],
  });
  if (ancestor.status !== 0) throw new Error(`${CONTRACT}_IMAGE_SOURCE_NOT_ANCESTOR_OF_MAIN`);
  const changed = command(
    "git",
    ["diff", "--name-only", `${IMAGE_SOURCE_SHA}..${originMain}`, "--", ...SERVERLESS_IMAGE_INPUTS],
    `${CONTRACT}_IMAGE_SOURCE_DIFF_FAILED`,
  ).split("\n").map((entry) => entry.trim()).filter(Boolean);
  if (changed.length) throw new Error(`${CONTRACT}_SERVERLESS_IMAGE_INPUT_MOVED:${changed.join(",")}`);
  return originMain;
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.detail || body?.error?.message || body?.error || body?.message || raw, 1200)}`);
  }
  return body;
}

async function rest(pathname, key, options = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, `${CONTRACT}_REST`);
}

async function queueHealth(key) {
  const response = await fetch(`${QUEUE_BASE}/${ENDPOINT_ID}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, `${CONTRACT}_HEALTH`);
}

async function graphql(query, variables, key) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readJson(response, `${CONTRACT}_GRAPHQL`);
  if (rows(body.errors).length) {
    throw new Error(`${CONTRACT}_GRAPHQL_ERROR:${rows(body.errors).map((entry) => text(entry?.message)).join(" | ").slice(0, 1200)}`);
  }
  return body;
}

function normalizeRows(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const nested = normalizeRows(value[key], keys, depth + 1);
    if (nested.length || Array.isArray(value[key])) return nested;
  }
  return [];
}

function healthSummary(body = {}) {
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
  if (summary.jobs.in_queue !== 0 || summary.jobs.in_progress !== 0) {
    throw new Error(`${label}_QUEUE_NOT_EMPTY:${JSON.stringify(summary.jobs)}`);
  }
  if (Object.values(summary.workers).some((value) => Number(value) !== 0)) {
    throw new Error(`${label}_WORKERS_NOT_ZERO:${JSON.stringify(summary.workers)}`);
  }
}

function volumeIds(endpoint = {}) {
  const ids = rows(endpoint.networkVolumeIds).map((entry) =>
    typeof entry === "string" ? text(entry) : text(entry?.networkVolumeId)
  ).filter(Boolean);
  const legacy = text(endpoint.networkVolumeId);
  if (legacy && !ids.includes(legacy)) ids.unshift(legacy);
  return ids;
}

async function resolveTemplate(endpoint, key) {
  const templateId = text(endpoint.templateId || endpoint.template?.id);
  if (!templateId) throw new Error(`${CONTRACT}_TEMPLATE_ID_REQUIRED`);
  const body = await rest("/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false", key);
  const matches = normalizeRows(body, ["templates"]).filter((entry) => text(entry?.id) === templateId);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_TEMPLATE_RESOLUTION_FAILED:${templateId}:${matches.length}`);
  return matches[0];
}

const ENDPOINT_QUERY = `
query AvantiqoCodeCachedModelPhase1V2Read {
  myself { endpoints {
    id name templateId gpuIds gpuCount instanceIds workersMin workersMax locations
    networkVolumeId networkVolumeIds { networkVolumeId dataCenterId }
    idleTimeout scalerType scalerValue executionTimeoutMs minCudaVersion flashBootType modelReferences
  } }
}`;

const SAVE_ENDPOINT = `
mutation AvantiqoCodeCachedModelPhase1V2Save($input: EndpointInput!) {
  saveEndpoint(input: $input) {
    id name templateId gpuIds gpuCount instanceIds workersMin workersMax locations
    networkVolumeId networkVolumeIds { networkVolumeId dataCenterId }
    idleTimeout scalerType scalerValue executionTimeoutMs minCudaVersion flashBootType modelReferences
  }
}`;

async function readGraphqlEndpoint(key) {
  const body = await graphql(ENDPOINT_QUERY, {}, key);
  const matches = rows(body?.data?.myself?.endpoints).filter((entry) => text(entry?.id) === ENDPOINT_ID);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_GRAPHQL_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  if (text(matches[0]?.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_GRAPHQL_ENDPOINT_NAME_MISMATCH`);
  return matches[0];
}

function endpointPolicy(endpoint = {}) {
  return {
    id: text(endpoint.id),
    name: text(endpoint.name),
    template_id: text(endpoint.templateId || endpoint.template?.id),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout: finite(endpoint.idleTimeout),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true || text(endpoint.flashBootType).toUpperCase() === "FLASHBOOT",
    scaler_type: text(endpoint.scalerType),
    scaler_value: finite(endpoint.scalerValue),
    gpu_type_ids: stringList(endpoint.gpuTypeIds),
    gpu_count: finite(endpoint.gpuCount),
    min_cuda_version: text(endpoint.minCudaVersion),
    allowed_cuda_versions: stringList(endpoint.allowedCudaVersions),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
    data_center_ids: stringList(endpoint.dataCenterIds),
    network_volume_ids: volumeIds(endpoint),
  };
}

function assertPolicy(endpoint, template, label, { allowParkedZero = false } = {}) {
  const policy = endpointPolicy(endpoint);
  if (policy.id !== ENDPOINT_ID || policy.name !== ENDPOINT_NAME) throw new Error(`${label}_IDENTITY`);
  if (policy.template_id !== text(template?.id)) throw new Error(`${label}_TEMPLATE_ID`);
  if (text(template?.imageName) !== IMMUTABLE_IMAGE) throw new Error(`${label}_IMAGE:${text(template?.imageName)}`);
  if (policy.workers_min !== 0 || (policy.workers_max !== 1 && !(allowParkedZero && policy.workers_max === 0))) {
    throw new Error(`${label}_WORKERS:${policy.workers_min}/${policy.workers_max}`);
  }
  if (!policy.flashboot) throw new Error(`${label}_FLASHBOOT`);
  if (policy.scaler_type !== "QUEUE_DELAY" || policy.scaler_value !== 1) throw new Error(`${label}_SCALER`);
  if (!sameMembers(policy.gpu_type_ids, TARGET_GPUS)) throw new Error(`${label}_GPU_POOL:${JSON.stringify(policy.gpu_type_ids)}`);
  if (policy.gpu_count !== 1) throw new Error(`${label}_GPU_COUNT:${policy.gpu_count}`);
  if (policy.min_cuda_version !== "12.8" || !sameMembers(policy.allowed_cuda_versions, TARGET_CUDA)) {
    throw new Error(`${label}_CUDA:${JSON.stringify({ minimum: policy.min_cuda_version, allowed: policy.allowed_cuda_versions })}`);
  }
  if (policy.execution_timeout_ms !== 1_260_000) throw new Error(`${label}_EXECUTION_TIMEOUT:${policy.execution_timeout_ms}`);
  if (policy.data_center_ids.length) throw new Error(`${label}_DATACENTER_RESTRICTION:${policy.data_center_ids.join(",")}`);
  if (!policy.network_volume_ids.includes(REQUIRED_NETWORK_VOLUME_ID)) throw new Error(`${label}_NETWORK_VOLUME`);
  return policy;
}

async function readSnapshot(managementKey, queueKey) {
  const [endpoint, graphqlEndpoint, rawHealth] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    readGraphqlEndpoint(managementKey),
    queueHealth(queueKey),
  ]);
  const template = await resolveTemplate(endpoint, managementKey);
  return { endpoint, template, graphql: graphqlEndpoint, health: healthSummary(rawHealth) };
}

function restPolicyBody() {
  return {
    workersMin: 0,
    workersMax: 1,
    idleTimeout: 60,
    flashboot: true,
    scalerType: "QUEUE_DELAY",
    scalerValue: 1,
    gpuTypeIds: [...TARGET_GPUS],
    gpuCount: 1,
    minCudaVersion: "12.8",
    allowedCudaVersions: [...TARGET_CUDA],
    dataCenterIds: [],
    executionTimeoutMs: 1_260_000,
    networkVolumeId: REQUIRED_NETWORK_VOLUME_ID,
    networkVolumeIds: [REQUIRED_NETWORK_VOLUME_ID],
  };
}

function saveInput(endpoint) {
  const volumes = rows(endpoint.networkVolumeIds).map((entry) => ({
    networkVolumeId: text(entry?.networkVolumeId || entry),
  })).filter((entry) => entry.networkVolumeId);
  if (!volumes.some((entry) => entry.networkVolumeId === REQUIRED_NETWORK_VOLUME_ID)) {
    throw new Error(`${CONTRACT}_NETWORK_VOLUME_MUST_REMAIN_ATTACHED`);
  }
  const gpuIds = text(endpoint.gpuIds);
  const flashBootType = text(endpoint.flashBootType);
  if (!gpuIds || !flashBootType) throw new Error(`${CONTRACT}_GRAPHQL_FULL_REPLACE_FIELDS_MISSING`);
  return {
    id: ENDPOINT_ID,
    name: text(endpoint.name),
    templateId: text(endpoint.templateId),
    gpuIds,
    gpuCount: finite(endpoint.gpuCount, 1),
    instanceIds: rows(endpoint.instanceIds),
    workersMin: 0,
    workersMax: 1,
    locations: text(endpoint.locations),
    networkVolumeId: text(endpoint.networkVolumeId) || REQUIRED_NETWORK_VOLUME_ID,
    networkVolumeIds: volumes,
    idleTimeout: finite(endpoint.idleTimeout, 60),
    scalerType: text(endpoint.scalerType),
    scalerValue: finite(endpoint.scalerValue, 1),
    executionTimeoutMs: finite(endpoint.executionTimeoutMs, 1_260_000),
    minCudaVersion: text(endpoint.minCudaVersion),
    flashBootType,
    modelReferences: [MODEL_REFERENCE],
  };
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey || !queueKey) throw new Error(`${CONTRACT}_RUNPOD_CREDENTIAL_REQUIRED`);

const originMain = sourceGate();
let snapshot = await readSnapshot(managementKey, queueKey);
assertIdle(snapshot.health, `${CONTRACT}_PREFLIGHT`);
let policy = assertPolicy(snapshot.endpoint, snapshot.template, `${CONTRACT}_PREFLIGHT`, { allowParkedZero: true });
let refs = modelReferences(snapshot.graphql.modelReferences);
if (refs.some((entry) => entry !== MODEL_REFERENCE)) throw new Error(`${CONTRACT}_UNEXPECTED_MODEL_REFERENCE:${JSON.stringify(refs)}`);

const needsCapacityRepair = policy.workers_max === 0;
const needsModelReference = !refs.includes(MODEL_REFERENCE);

if (!apply) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "PLAN",
    validated_origin_main: originMain,
    endpoint_id: ENDPOINT_ID,
    endpoint_policy: policy,
    health: snapshot.health,
    immutable_image_verified: true,
    zero_idle_capacity_repair_required: needsCapacityRepair,
    model_reference_attach_required: needsModelReference,
    model_reference: MODEL_REFERENCE,
    network_volume_preserved: true,
    network_volume_detach_performed: false,
    generation_submitted: false,
    provider_inference_performed: false,
    reasoning_call_consumed: false,
    wallet_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  process.exit(0);
}

let restCapacityRepaired = false;
let modelReferenceAttached = false;

if (needsCapacityRepair) {
  sourceGate();
  await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, { method: "PATCH", body: { workersMin: 0, workersMax: 1 } });
  restCapacityRepaired = true;
  snapshot = await readSnapshot(managementKey, queueKey);
  assertIdle(snapshot.health, `${CONTRACT}_CAPACITY_REPAIR`);
  policy = assertPolicy(snapshot.endpoint, snapshot.template, `${CONTRACT}_CAPACITY_REPAIR`);
}

refs = modelReferences(snapshot.graphql.modelReferences);
if (!refs.includes(MODEL_REFERENCE)) {
  sourceGate();
  const body = await graphql(SAVE_ENDPOINT, { input: saveInput(snapshot.graphql) }, managementKey);
  if (text(body?.data?.saveEndpoint?.id) !== ENDPOINT_ID) throw new Error(`${CONTRACT}_SAVE_ENDPOINT_RESPONSE_INVALID`);
  modelReferenceAttached = true;

  // saveEndpoint is a full replace. Immediately reassert every REST-owned field and preserve the current volume.
  await rest(`/endpoints/${ENDPOINT_ID}`, managementKey, { method: "PATCH", body: restPolicyBody() });
}

snapshot = await readSnapshot(managementKey, queueKey);
assertIdle(snapshot.health, `${CONTRACT}_POST`);
policy = assertPolicy(snapshot.endpoint, snapshot.template, `${CONTRACT}_POST`);
refs = modelReferences(snapshot.graphql.modelReferences);
if (refs.length !== 1 || refs[0] !== MODEL_REFERENCE) {
  throw new Error(`${CONTRACT}_MODEL_REFERENCE_VERIFY_FAILED:${JSON.stringify(refs)}`);
}
const finalOriginMain = sourceGate();

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  validated_origin_main: finalOriginMain,
  endpoint_id: ENDPOINT_ID,
  endpoint_policy_after: policy,
  health_after: snapshot.health,
  immutable_image_verified: true,
  rest_capacity_repaired: restCapacityRepaired,
  model_reference_mutation_performed: modelReferenceAttached,
  model_reference_after: refs,
  cached_model_requested_from_runpod: true,
  cached_model_ready_not_assumed: true,
  network_volume_preserved: true,
  network_volume_detach_performed: false,
  zero_idle_policy_preserved: true,
  generation_submitted: false,
  provider_inference_performed: false,
  reasoning_call_consumed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
  next_action: "VERIFY_RUNPOD_CACHED_MODEL_READINESS_BEFORE_VOLUME_DETACH",
}, null, 2));
