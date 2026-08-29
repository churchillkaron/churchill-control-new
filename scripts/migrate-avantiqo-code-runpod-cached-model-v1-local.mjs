import { spawnSync } from "node:child_process";
import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_RUNPOD_CACHED_MODEL_MIGRATION_V1";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const REQUIRED_NETWORK_VOLUME_ID = "7obluigbr0";
const IMAGE_SOURCE_SHA = "e1a688d73f506778c4d52a91e71030d74cdd3208";
const IMAGE_DIGEST = "sha256:4cbbea028c8bcfae7c955a1b42e90e089e1f0fc1169fd98bbace2670dae4d425";
const IMMUTABLE_IMAGE = `ghcr.io/churchillkaron/avantiqo-code-worker@${IMAGE_DIGEST}`;
const MODEL_REVISION = "dcaee4d4dfc5ee71ad501f01f530e5652438fde0";
const MODEL_REFERENCE = `https://huggingface.co/Qwen/Qwen3-Coder-30B-A3B-Instruct-FP8:${MODEL_REVISION}`;
const APPROVAL_ENV = "AVANTIQO_CODE_CACHED_MODEL_MIGRATION_V1_APPROVED";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const TARGET_GPU_TYPE_IDS = Object.freeze([
  "NVIDIA H100 80GB HBM3",
  "NVIDIA H100 NVL",
  "NVIDIA H200",
  "NVIDIA B200",
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
]);
const TARGET_ALLOWED_CUDA_VERSIONS = Object.freeze(["12.8", "12.9", "13.0"]);
const SERVERLESS_IMAGE_INPUTS = Object.freeze([
  "services/avantiqo-code-engine/Dockerfile.runpod",
  "services/avantiqo-code-engine/handler.py",
  "services/avantiqo-code-engine/serverless_boot.py",
  "services/avantiqo-code-engine/requirements.txt",
]);

const text = (value, maximum = 4000) => String(value ?? "").trim().slice(0, maximum);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout, 1000) || `exit=${result.status}`}`);
  }
  return text(result.stdout);
}

function commandStatus(name, args) {
  return spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function sourceGate() {
  command("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const originMain = command("git", ["rev-parse", "origin/main"], `${CONTRACT}_ORIGIN_MAIN_FAILED`);
  const ancestor = commandStatus("git", ["merge-base", "--is-ancestor", IMAGE_SOURCE_SHA, originMain]);
  if (ancestor.status !== 0) throw new Error(`${CONTRACT}_IMAGE_SOURCE_NOT_ANCESTOR_OF_ORIGIN_MAIN`);
  const moved = command(
    "git",
    ["diff", "--name-only", `${IMAGE_SOURCE_SHA}..${originMain}`, "--", ...SERVERLESS_IMAGE_INPUTS],
    `${CONTRACT}_SOURCE_DIFF_FAILED`,
  ).split("\n").map((value) => value.trim()).filter(Boolean);
  if (moved.length) throw new Error(`${CONTRACT}_SERVERLESS_IMAGE_INPUT_MOVED:${moved.join(",")}`);
  return originMain;
}

async function readJson(response, prefix) {
  const raw = await response.text();
  let body = {};
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { message: raw }; }
  if (!response.ok) {
    const detail = text(body?.detail || body?.error?.message || body?.error || body?.message || raw, 1000);
    const error = new Error(`${prefix}_HTTP_${response.status}:${detail || "UNKNOWN"}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body;
}

async function rest(pathname, credential, options = {}) {
  const response = await fetch(`${REST_BASE}${pathname}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  return readJson(response, `${CONTRACT}_REST`);
}

async function queueHealth(queueKey) {
  const response = await fetch(`${QUEUE_BASE}/${ENDPOINT_ID}/health`, {
    headers: { Authorization: `Bearer ${queueKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  return readJson(response, `${CONTRACT}_HEALTH`);
}

async function graphql(query, variables, credential) {
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${credential}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await readJson(response, `${CONTRACT}_GRAPHQL`);
  if (list(body.errors).length) {
    throw new Error(`${CONTRACT}_GRAPHQL_ERROR:${list(body.errors).map((entry) => text(entry?.message)).join(" | ").slice(0, 1200)}`);
  }
  return body;
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

function assertNoLiveWork(summary, label) {
  if (summary.jobs.in_queue !== 0 || summary.jobs.in_progress !== 0) {
    throw new Error(`${label}_QUEUE_NOT_EMPTY:${JSON.stringify(summary.jobs)}`);
  }
  if (Object.values(summary.workers).some((value) => Number(value) !== 0)) {
    throw new Error(`${label}_WORKER_NOT_ZERO:${JSON.stringify(summary.workers)}`);
  }
}

function stringList(value) {
  if (Array.isArray(value)) return value.map((entry) => text(entry)).filter(Boolean);
  const raw = text(value);
  if (!raw) return [];
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function volumeIds(endpoint = {}) {
  const ids = list(endpoint.networkVolumeIds).map((entry) => {
    if (typeof entry === "string") return text(entry);
    return text(entry?.networkVolumeId);
  }).filter(Boolean);
  const legacy = text(endpoint.networkVolumeId);
  if (legacy && !ids.includes(legacy)) ids.unshift(legacy);
  return ids;
}

function modelRefs(endpoint = {}) {
  return list(endpoint.modelReferences).map((entry) => text(entry)).filter(Boolean);
}

function endpointRestSummary(endpoint = {}) {
  return {
    id: text(endpoint.id),
    name: text(endpoint.name),
    template_id: text(endpoint.templateId || endpoint.template?.id),
    image_name: text(endpoint.template?.imageName),
    workers_min: finite(endpoint.workersMin),
    workers_max: finite(endpoint.workersMax),
    idle_timeout_seconds: finite(endpoint.idleTimeout),
    flashboot: endpoint.flashboot === true || endpoint.flashBoot === true || text(endpoint.flashBootType).toUpperCase() === "FLASHBOOT",
    scaler_type: text(endpoint.scalerType),
    scaler_value: finite(endpoint.scalerValue),
    gpu_type_ids: stringList(endpoint.gpuTypeIds),
    gpu_count: finite(endpoint.gpuCount),
    min_cuda_version: text(endpoint.minCudaVersion),
    allowed_cuda_versions: stringList(endpoint.allowedCudaVersions),
    execution_timeout_ms: finite(endpoint.executionTimeoutMs),
    data_center_ids: stringList(endpoint.dataCenterIds),
    network_volume_id: text(endpoint.networkVolumeId) || null,
    network_volume_ids: volumeIds(endpoint),
    model_references: modelRefs(endpoint),
  };
}

const ENDPOINT_QUERY = `
query AvantiqoCodeCachedModelEndpointRead {
  myself {
    endpoints {
      id
      name
      templateId
      gpuIds
      gpuCount
      instanceIds
      workersMin
      workersMax
      locations
      networkVolumeId
      networkVolumeIds { networkVolumeId dataCenterId }
      idleTimeout
      scalerType
      scalerValue
      executionTimeoutMs
      minCudaVersion
      flashBootType
      modelReferences
    }
  }
}`;

const SAVE_ENDPOINT_MUTATION = `
mutation AvantiqoCodeCachedModelSaveEndpoint($input: EndpointInput!) {
  saveEndpoint(input: $input) {
    id
    name
    templateId
    gpuIds
    gpuCount
    instanceIds
    workersMin
    workersMax
    locations
    networkVolumeId
    networkVolumeIds { networkVolumeId dataCenterId }
    idleTimeout
    scalerType
    scalerValue
    executionTimeoutMs
    minCudaVersion
    flashBootType
    modelReferences
  }
}`;

async function graphqlEndpoint(managementKey) {
  const body = await graphql(ENDPOINT_QUERY, {}, managementKey);
  const matches = list(body?.data?.myself?.endpoints).filter((row) => text(row?.id) === ENDPOINT_ID);
  if (matches.length !== 1) throw new Error(`${CONTRACT}_GRAPHQL_ENDPOINT_RESOLUTION_FAILED:${matches.length}`);
  const endpoint = matches[0];
  if (text(endpoint.name) !== ENDPOINT_NAME) throw new Error(`${CONTRACT}_GRAPHQL_ENDPOINT_NAME_MISMATCH`);
  return endpoint;
}

function saveInput(base, { modelReferences, networkVolumeMode }) {
  const gpuIds = text(base.gpuIds);
  if (!gpuIds) throw new Error(`${CONTRACT}_GRAPHQL_GPU_POOL_IDS_REQUIRED`);
  const flashBootType = text(base.flashBootType).toUpperCase();
  if (!flashBootType) throw new Error(`${CONTRACT}_GRAPHQL_FLASHBOOT_TYPE_REQUIRED`);
  const existingVolumes = list(base.networkVolumeIds).map((entry) => ({
    networkVolumeId: text(entry?.networkVolumeId || entry),
  })).filter((entry) => entry.networkVolumeId);
  const clearVolumes = networkVolumeMode === "CLEAR";
  return {
    id: ENDPOINT_ID,
    name: text(base.name),
    templateId: text(base.templateId),
    gpuIds,
    gpuCount: finite(base.gpuCount, 1),
    instanceIds: list(base.instanceIds),
    workersMin: finite(base.workersMin, 0),
    workersMax: finite(base.workersMax, 1),
    locations: text(base.locations),
    networkVolumeId: clearVolumes ? "" : text(base.networkVolumeId),
    networkVolumeIds: clearVolumes ? [] : existingVolumes,
    idleTimeout: finite(base.idleTimeout, 60),
    scalerType: text(base.scalerType),
    scalerValue: finite(base.scalerValue, 1),
    executionTimeoutMs: finite(base.executionTimeoutMs, 1_260_000),
    minCudaVersion: text(base.minCudaVersion),
    flashBootType,
    modelReferences: [...modelReferences],
  };
}

async function saveEndpoint(managementKey, base, options) {
  const input = saveInput(base, options);
  const body = await graphql(SAVE_ENDPOINT_MUTATION, { input }, managementKey);
  const saved = body?.data?.saveEndpoint;
  if (!saved || text(saved.id) !== ENDPOINT_ID) throw new Error(`${CONTRACT}_SAVE_ENDPOINT_RESPONSE_INVALID`);
  return saved;
}

function expectedRestPolicy({ withNetworkVolume }) {
  return {
    workersMin: 0,
    workersMax: 1,
    idleTimeout: 60,
    flashboot: true,
    scalerType: "QUEUE_DELAY",
    scalerValue: 1,
    gpuTypeIds: [...TARGET_GPU_TYPE_IDS],
    gpuCount: 1,
    minCudaVersion: "12.8",
    allowedCudaVersions: [...TARGET_ALLOWED_CUDA_VERSIONS],
    dataCenterIds: [],
    executionTimeoutMs: 1_260_000,
    ...(withNetworkVolume ? {
      networkVolumeId: REQUIRED_NETWORK_VOLUME_ID,
      networkVolumeIds: [REQUIRED_NETWORK_VOLUME_ID],
    } : {
      networkVolumeIds: [],
    }),
  };
}

async function reassertRestPolicy(managementKey, { withNetworkVolume }) {
  return rest(`/endpoints/${ENDPOINT_ID}`, managementKey, {
    method: "PATCH",
    body: expectedRestPolicy({ withNetworkVolume }),
  });
}

function assertCorePolicy(summary, { withNetworkVolume }, label) {
  if (summary.id !== ENDPOINT_ID || summary.name !== ENDPOINT_NAME) throw new Error(`${label}_IDENTITY_MISMATCH`);
  if (summary.image_name !== IMMUTABLE_IMAGE) throw new Error(`${label}_IMAGE_MISMATCH:${summary.image_name}`);
  if (summary.workers_min !== 0 || summary.workers_max !== 1) throw new Error(`${label}_WORKER_POLICY_MISMATCH`);
  if (!summary.flashboot) throw new Error(`${label}_FLASHBOOT_REQUIRED`);
  if (summary.scaler_type !== "QUEUE_DELAY" || summary.scaler_value !== 1) throw new Error(`${label}_SCALER_MISMATCH`);
  if (JSON.stringify(summary.gpu_type_ids) !== JSON.stringify(TARGET_GPU_TYPE_IDS)) {
    throw new Error(`${label}_GPU_POOL_MISMATCH:${JSON.stringify(summary.gpu_type_ids)}`);
  }
  if (summary.gpu_count !== 1) throw new Error(`${label}_GPU_COUNT_MISMATCH:${summary.gpu_count}`);
  if (summary.min_cuda_version !== "12.8") throw new Error(`${label}_MIN_CUDA_MISMATCH:${summary.min_cuda_version}`);
  if (JSON.stringify(summary.allowed_cuda_versions) !== JSON.stringify(TARGET_ALLOWED_CUDA_VERSIONS)) {
    throw new Error(`${label}_ALLOWED_CUDA_MISMATCH:${JSON.stringify(summary.allowed_cuda_versions)}`);
  }
  if (summary.execution_timeout_ms !== 1_260_000) throw new Error(`${label}_EXECUTION_TIMEOUT_MISMATCH:${summary.execution_timeout_ms}`);
  if (summary.data_center_ids.length !== 0) throw new Error(`${label}_DATACENTER_RESTRICTION_PRESENT:${summary.data_center_ids.join(",")}`);
  if (withNetworkVolume) {
    if (summary.network_volume_id !== REQUIRED_NETWORK_VOLUME_ID) throw new Error(`${label}_NETWORK_VOLUME_ID_MISMATCH`);
    if (!summary.network_volume_ids.includes(REQUIRED_NETWORK_VOLUME_ID)) throw new Error(`${label}_NETWORK_VOLUME_LIST_MISMATCH`);
  } else {
    if (summary.network_volume_id) throw new Error(`${label}_LEGACY_NETWORK_VOLUME_STILL_ATTACHED:${summary.network_volume_id}`);
    if (summary.network_volume_ids.length) throw new Error(`${label}_NETWORK_VOLUMES_STILL_ATTACHED:${summary.network_volume_ids.join(",")}`);
  }
}

async function snapshot(managementKey, queueKey) {
  const [restEndpoint, gqlEndpoint, rawHealth] = await Promise.all([
    rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`, managementKey),
    graphqlEndpoint(managementKey),
    queueHealth(queueKey),
  ]);
  return {
    rest: restEndpoint,
    rest_summary: endpointRestSummary(restEndpoint),
    graphql: gqlEndpoint,
    health: healthSummary(rawHealth),
  };
}

async function verifyModelReference(managementKey, queueKey, { withNetworkVolume, label }) {
  const current = await snapshot(managementKey, queueKey);
  assertNoLiveWork(current.health, `${label}_HEALTH`);
  assertCorePolicy(current.rest_summary, { withNetworkVolume }, `${label}_POLICY`);
  const refs = modelRefs(current.graphql);
  if (refs.length !== 1 || refs[0] !== MODEL_REFERENCE) {
    throw new Error(`${label}_MODEL_REFERENCE_MISMATCH:${JSON.stringify(refs)}`);
  }
  return current;
}

async function rollback(managementKey, queueKey, original) {
  let graphqlRestored = false;
  let restRestored = false;
  let verified = false;
  let reason = null;
  try {
    await saveEndpoint(managementKey, original.graphql, {
      modelReferences: modelRefs(original.graphql),
      networkVolumeMode: "PRESERVE",
    });
    graphqlRestored = true;
    await reassertRestPolicy(managementKey, { withNetworkVolume: true });
    restRestored = true;
    const current = await snapshot(managementKey, queueKey);
    assertNoLiveWork(current.health, `${CONTRACT}_ROLLBACK_HEALTH`);
    assertCorePolicy(current.rest_summary, { withNetworkVolume: true }, `${CONTRACT}_ROLLBACK_POLICY`);
    if (JSON.stringify(modelRefs(current.graphql)) !== JSON.stringify(modelRefs(original.graphql))) {
      throw new Error(`${CONTRACT}_ROLLBACK_MODEL_REFERENCE_MISMATCH`);
    }
    verified = true;
  } catch (error) {
    reason = text(error?.message || error, 1200);
  }
  return { graphql_restored: graphqlRestored, rest_restored: restRestored, verified, reason };
}

const apply = process.argv.includes("--apply");
if (apply && text(process.env[APPROVAL_ENV]).toUpperCase() !== "YES") {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY || managementKey);
if (!managementKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
if (!queueKey) throw new Error("RUNPOD_CODE_RUNTIME_KEY_REQUIRED");

const originMain = sourceGate();
const initial = await snapshot(managementKey, queueKey);
assertNoLiveWork(initial.health, `${CONTRACT}_PREFLIGHT_HEALTH`);
assertCorePolicy(initial.rest_summary, { withNetworkVolume: true }, `${CONTRACT}_PREFLIGHT_POLICY`);
if (text(initial.graphql.gpuIds) === "") throw new Error(`${CONTRACT}_PREFLIGHT_GRAPHQL_GPU_IDS_REQUIRED`);
if (modelRefs(initial.graphql).some((ref) => ref !== MODEL_REFERENCE)) {
  throw new Error(`${CONTRACT}_PREFLIGHT_UNEXPECTED_MODEL_REFERENCE:${JSON.stringify(modelRefs(initial.graphql))}`);
}

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  validated_origin_main: originMain,
  endpoint_id: ENDPOINT_ID,
  endpoint_before: initial.rest_summary,
  health_before: initial.health,
  model_reference: MODEL_REFERENCE,
  model_revision_pinned: MODEL_REVISION,
  model_reference_current: modelRefs(initial.graphql).includes(MODEL_REFERENCE),
  source_image_locked: true,
  cached_model_runtime_path_already_supported: true,
  target: {
    workers_min: 0,
    workers_max: 1,
    flashboot: true,
    scaler_type: "QUEUE_DELAY",
    scaler_value: 1,
    gpu_type_ids: TARGET_GPU_TYPE_IDS,
    min_cuda_version: "12.8",
    allowed_cuda_versions: TARGET_ALLOWED_CUDA_VERSIONS,
    network_volume_attached: false,
    data_center_ids: [],
    runpod_model_reference: MODEL_REFERENCE,
  },
  mutation_performed: false,
  model_reference_mutation_performed: false,
  network_volume_detach_performed: false,
  generation_submitted: false,
  provider_inference_performed: false,
  reasoning_call_consumed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

console.log(`AVANTIQO_CODE_RUNPOD_CACHED_MODEL_MIGRATION_V1_MODE=${apply ? "APPLY" : "PLAN"}`);
console.log("AVANTIQO_CODE_RUNPOD_CACHED_MODEL_MIGRATION_V1_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_CODE_RUNPOD_CACHED_MODEL_MIGRATION_V1_PROVIDER_INFERENCE_PERFORMED=false");

if (!apply) {
  console.log(JSON.stringify(plan, null, 2));
  process.exit(0);
}

let phase = "PREFLIGHT";
let attached = false;
let detached = false;
try {
  sourceGate();

  phase = "ATTACH_MODEL_REFERENCE";
  let currentGql = await graphqlEndpoint(managementKey);
  if (!modelRefs(currentGql).includes(MODEL_REFERENCE)) {
    await saveEndpoint(managementKey, currentGql, {
      modelReferences: [MODEL_REFERENCE],
      networkVolumeMode: "PRESERVE",
    });
    attached = true;
  }
  await reassertRestPolicy(managementKey, { withNetworkVolume: true });
  const withModel = await verifyModelReference(managementKey, queueKey, {
    withNetworkVolume: true,
    label: `${CONTRACT}_MODEL_ATTACHED`,
  });

  phase = "DETACH_NETWORK_VOLUME";
  currentGql = withModel.graphql;
  await saveEndpoint(managementKey, currentGql, {
    modelReferences: [MODEL_REFERENCE],
    networkVolumeMode: "CLEAR",
  });
  detached = true;
  await reassertRestPolicy(managementKey, { withNetworkVolume: false });

  phase = "VERIFY_FINAL";
  const final = await verifyModelReference(managementKey, queueKey, {
    withNetworkVolume: false,
    label: `${CONTRACT}_FINAL`,
  });
  const finalOriginMain = sourceGate();

  console.log(JSON.stringify({
    ...plan,
    success: true,
    mode: "APPLY",
    validated_origin_main: finalOriginMain,
    mutation_performed: attached || detached,
    model_reference_mutation_performed: attached,
    network_volume_detach_performed: detached,
    model_reference_after: modelRefs(final.graphql),
    endpoint_after: final.rest_summary,
    health_after: final.health,
    zero_idle_serverless_preserved: true,
    preload_image_preserved: true,
    one_second_queue_delay_preserved: true,
    certified_gpu_fallback_pool_preserved: true,
    network_volume_removed: true,
    datacenter_pin_removed: true,
    runpod_host_cached_model_enabled: true,
    next_action: "RUN_ONE_GENERATION_FREE_COLD_START_RUNTIME_PROBE",
    generation_submitted: false,
    provider_inference_performed: false,
    reasoning_call_consumed: false,
    wallet_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
} catch (error) {
  const failure = text(error?.message || error, 1600);
  const rollbackResult = await rollback(managementKey, queueKey, initial);
  console.error(JSON.stringify({
    success: false,
    contract: CONTRACT,
    mode: "APPLY",
    failed_phase: phase,
    error: failure,
    model_reference_mutation_performed: attached,
    network_volume_detach_attempted: detached,
    rollback: rollbackResult,
    generation_submitted: false,
    provider_inference_performed: false,
    reasoning_call_consumed: false,
    wallet_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  if (!rollbackResult.verified) {
    throw new Error(`${CONTRACT}_FAILED_AND_ROLLBACK_UNVERIFIED:${failure}:${rollbackResult.reason || "UNKNOWN"}`);
  }
  throw new Error(`${CONTRACT}_FAILED_ROLLBACK_VERIFIED:${failure}`);
}
