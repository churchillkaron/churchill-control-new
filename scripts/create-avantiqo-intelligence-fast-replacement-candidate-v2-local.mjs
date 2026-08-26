import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_REPLACEMENT_CANDIDATE_CREATE_V2";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const CANDIDATE_NAME = "avantiqo-intelligence-fast-replacement-candidate-v1";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_FAST_REPLACEMENT_CANDIDATE_V2_EXPECTED_MAIN";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_REPLACEMENT_CANDIDATE_V2_APPROVED";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const yes = (value) => ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, { cwd: process.cwd(), env: process.env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${code}:${redact(result.stderr || result.stdout).slice(0, 1000)}`);
  return text(result.stdout);
}

function validateMain() {
  const expected = text(process.env[EXPECTED_MAIN_ENV]);
  if (expected && !/^[0-9a-f]{40}$/i.test(expected)) throw new Error(`${CONTRACT}_EXPECTED_MAIN_INVALID`);
  const branch = shell("git", ["branch", "--show-current"], `${CONTRACT}_GIT_BRANCH_FAILED`);
  if (branch !== "main") throw new Error(`${CONTRACT}_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], `${CONTRACT}_GIT_HEAD_FAILED`);
  if (expected) {
    if (head !== expected) throw new Error(`${CONTRACT}_PINNED_MAIN_MISMATCH:head=${head}:expected=${expected}`);
    return { head, pinned: true };
  }
  shell("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const remote = shell("git", ["rev-parse", "origin/main"], `${CONTRACT}_GIT_REMOTE_FAILED`);
  if (head !== remote) throw new Error(`${CONTRACT}_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  return { head, pinned: false };
}

function managementKey() {
  const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!key) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return key;
}

function runtimeKey(management) {
  return text(process.env.RUNPOD_API_KEY) || management;
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = redact(body?.message || body?.error || body?.detail || raw).slice(0, 900);
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  if (options.allowEmpty && !raw) return null;
  if (body === null) throw new Error(`${CONTRACT}_HTTP_${response.status}:INVALID_JSON`);
  return body;
}

async function rest(path, key, options = {}) {
  return requestJson(`${REST_BASE}${path}`, key, options);
}

async function graphql(query, variables, key) {
  const response = await requestJson(GRAPHQL_URL, key, {
    method: "POST",
    body: { query, variables },
    timeoutMs: 30_000,
  });
  if (Array.isArray(response?.errors) && response.errors.length) {
    throw new Error(`${CONTRACT}_GRAPHQL:${redact(response.errors.map((x) => x?.message).join(" | ")).slice(0, 900)}`);
  }
  return response;
}

async function health(endpointId, key) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key, { timeoutMs: 20_000 });
}

function normalizeRows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) if (Array.isArray(value[key])) return value[key];
  return [];
}

function resolveOne(rows, name, code) {
  const matches = normalizeRows(rows).filter((row) => text(row?.name) === name);
  if (matches.length !== 1) throw new Error(`${code}:name=${name}:matches=${matches.length}`);
  return matches[0];
}

function healthSummary(raw = {}) {
  const jobs = object(raw?.jobs);
  const workers = object(raw?.workers);
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

function canonical(deep, fast, deepHealth, fastHealth) {
  return finite(deep?.workersMin, -1) === 0 &&
    finite(deep?.workersMax, -1) === 1 &&
    finite(fast?.workersMin, -1) === 0 &&
    finite(fast?.workersMax, -1) === 0 &&
    deepHealth.jobs.in_queue === 0 && deepHealth.jobs.in_progress === 0 &&
    fastHealth.jobs.in_queue === 0 && fastHealth.jobs.in_progress === 0;
}

function templateId(endpoint = {}) {
  return text(endpoint?.templateId || endpoint?.template?.id);
}

function assertFastTemplate(endpoint, code) {
  const serialized = JSON.stringify(object(endpoint?.template));
  if (!templateId(endpoint)) throw new Error(`${code}_TEMPLATE_ID_REQUIRED`);
  if (!serialized.includes(FAST_MODEL)) throw new Error(`${code}_FAST_MODEL_BINDING_MISSING`);
  if (serialized.includes(DEEP_MODEL)) throw new Error(`${code}_DEEP_MODEL_BINDING_PRESENT`);
  if (/reasoning[_-]?parser|--reasoning-parser/i.test(serialized)) throw new Error(`${code}_REASONING_PARSER_PRESENT`);
}

const ENDPOINTS_QUERY = `
query AvantiqoFastReplacementCandidateSource {
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
      networkVolumeIds { networkVolumeId }
      idleTimeout
      scalerType
      scalerValue
      executionTimeoutMs
      minCudaVersion
      flashBootType
    }
  }
}`;

const GPU_POOLS_QUERY = `
query AvantiqoFastReplacementGpuPools {
  serverlessGpuPools {
    id
    gpuTypeIds
  }
}`;

const CREATE_MUTATION = `
mutation AvantiqoFastReplacementSaveEndpoint($input: EndpointInput!) {
  saveEndpoint(input: $input) {
    id
    name
    templateId
    gpuIds
    gpuCount
    workersMin
    workersMax
    flashBootType
  }
}`;

async function graphqlEndpoints(key) {
  const response = await graphql(ENDPOINTS_QUERY, {}, key);
  return list(response?.data?.myself?.endpoints);
}

async function resolveGpuIds(fastGraphql, fastRest, key) {
  const existing = text(fastGraphql?.gpuIds);
  if (existing) return existing;
  const gpuTypeIds = list(fastRest?.gpuTypeIds).map(text).filter(Boolean);
  if (!gpuTypeIds.length) throw new Error(`${CONTRACT}_GPU_TYPE_IDS_REQUIRED`);
  const response = await graphql(GPU_POOLS_QUERY, {}, key);
  const pools = list(response?.data?.serverlessGpuPools);
  const ids = [];
  for (const gpuTypeId of gpuTypeIds) {
    const pool = pools.find((entry) => list(entry?.gpuTypeIds).map(text).includes(gpuTypeId));
    const poolId = text(pool?.id);
    if (!poolId) throw new Error(`${CONTRACT}_GPU_POOL_RESOLUTION_FAILED:${gpuTypeId}`);
    if (!ids.includes(poolId)) ids.push(poolId);
  }
  return ids.join(",");
}

function networkVolumeIds(endpoint) {
  return list(endpoint?.networkVolumeIds)
    .map((entry) => text(typeof entry === "string" ? entry : entry?.networkVolumeId || entry?.id))
    .filter(Boolean)
    .map((networkVolumeId) => ({ networkVolumeId }));
}

function createInput(source, gpuIds) {
  const input = {
    name: CANDIDATE_NAME,
    templateId: text(source?.templateId),
    gpuIds,
    gpuCount: Math.max(1, finite(source?.gpuCount, 1)),
    workersMin: 0,
    workersMax: 0,
  };
  const instanceIds = list(source?.instanceIds).map(text).filter(Boolean);
  if (instanceIds.length) input.instanceIds = instanceIds;
  const locations = text(source?.locations);
  if (locations) input.locations = locations;
  const networkVolumeId = text(source?.networkVolumeId);
  if (networkVolumeId) input.networkVolumeId = networkVolumeId;
  const volumeIds = networkVolumeIds(source);
  if (volumeIds.length) input.networkVolumeIds = volumeIds;
  const idleTimeout = finite(source?.idleTimeout);
  if (idleTimeout !== null && idleTimeout > 0) input.idleTimeout = idleTimeout;
  const scalerType = text(source?.scalerType);
  if (scalerType) input.scalerType = scalerType;
  const scalerValue = finite(source?.scalerValue);
  if (scalerValue !== null && scalerValue > 0) input.scalerValue = scalerValue;
  const executionTimeoutMs = finite(source?.executionTimeoutMs);
  if (executionTimeoutMs !== null && executionTimeoutMs >= 0) input.executionTimeoutMs = executionTimeoutMs;
  const minCudaVersion = text(source?.minCudaVersion);
  if (minCudaVersion) input.minCudaVersion = minCudaVersion;
  input.flashBootType = text(source?.flashBootType) || "FLASHBOOT";
  if (!input.templateId) throw new Error(`${CONTRACT}_TEMPLATE_ID_REQUIRED`);
  return input;
}

async function deleteEndpoint(endpointId, key) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, key, { method: "DELETE", allowEmpty: true });
}

async function candidateSafety(endpointId, key, qKey) {
  const [endpoint, rawHealth] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, key),
    health(endpointId, qKey),
  ]);
  const summary = healthSummary(rawHealth);
  const workerTotal = Object.values(summary.workers).reduce((sum, value) => sum + value, 0);
  return {
    endpoint,
    health: summary,
    safe: finite(endpoint?.workersMin, -1) === 0 &&
      finite(endpoint?.workersMax, -1) === 0 &&
      summary.jobs.in_queue === 0 && summary.jobs.in_progress === 0 && workerTotal === 0,
  };
}

const apply = process.argv.includes("--apply");
if (apply && !yes(process.env[APPROVAL_ENV])) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

const main = validateMain();
const mKey = managementKey();
const qKey = runtimeKey(mKey);

const [restRaw, gqlRows] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", mKey),
  graphqlEndpoints(mKey),
]);
const restRows = normalizeRows(restRaw, ["endpoints", "serverlessEndpoints"]);
const deepRest = resolveOne(restRows, DEEP_NAME, `${CONTRACT}_DEEP_REST_RESOLUTION_FAILED`);
const fastRest = resolveOne(restRows, FAST_NAME, `${CONTRACT}_FAST_REST_RESOLUTION_FAILED`);
const fastGraphql = resolveOne(gqlRows, FAST_NAME, `${CONTRACT}_FAST_GRAPHQL_RESOLUTION_FAILED`);
assertFastTemplate(fastRest, `${CONTRACT}_FAST_TEMPLATE`);

const [deepHealthRaw, fastHealthRaw] = await Promise.all([
  health(text(deepRest?.id), qKey),
  health(text(fastRest?.id), qKey),
]);
const deepHealth = healthSummary(deepHealthRaw);
const fastHealth = healthSummary(fastHealthRaw);
if (!canonical(deepRest, fastRest, deepHealth, fastHealth)) {
  throw new Error(`${CONTRACT}_CANONICAL_DEEP_ACTIVE_FAST_PARKED_ZERO_QUEUE_REQUIRED`);
}

const expectedGpuTypes = [
  "NVIDIA RTX PRO 6000 Blackwell Server Edition",
  "NVIDIA H200",
  "NVIDIA B200",
];
const actualGpuTypes = list(fastRest?.gpuTypeIds).map(text).filter(Boolean);
if (JSON.stringify(actualGpuTypes) !== JSON.stringify(expectedGpuTypes)) {
  throw new Error(`${CONTRACT}_FAST_GPU_PRIORITY_UNEXPECTED:${JSON.stringify(actualGpuTypes)}`);
}

const existing = restRows.filter((row) => text(row?.name) === CANDIDATE_NAME);
if (existing.length > 1) throw new Error(`${CONTRACT}_MULTIPLE_CANDIDATES:${existing.length}`);
let existingState = null;
if (existing[0]) {
  existingState = await candidateSafety(text(existing[0]?.id), mKey, qKey);
  if (!existingState.safe) throw new Error(`${CONTRACT}_EXISTING_CANDIDATE_NOT_SAFE`);
}

const gpuIds = await resolveGpuIds(fastGraphql, fastRest, mKey);
const input = createInput(fastGraphql, gpuIds);
const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_commit: main.head,
  pinned_main: main.pinned,
  canonical_deep_active_fast_parked_zero_queue: true,
  source_fast_endpoint_id: text(fastRest?.id),
  source_fast_template_id: templateId(fastRest),
  source_fast_gpu_type_ids: actualGpuTypes,
  source_fast_gpu_pool_ids: gpuIds,
  candidate_name: CANDIDATE_NAME,
  candidate_existing: Boolean(existing[0]),
  candidate_existing_id: text(existing[0]?.id) || null,
  candidate_existing_safe_parked: existingState?.safe ?? null,
  proposed_action: existing[0] ? "NONE" : "GRAPHQL_SAVE_PARKED_CANDIDATE",
  workers_min: 0,
  workers_max: 0,
  generation_submitted: false,
  inference_performed: false,
  gpu_activation_performed: false,
  queue_mutation_performed: false,
  canonical_fast_mutation_performed: false,
  deep_endpoint_mutation_performed: false,
  template_mutation_performed: false,
  env_mutation_performed: false,
  production_deploy_performed: false,
  secrets_in_output: false,
};

if (!apply || existing[0]) {
  console.log(JSON.stringify({ ...plan, mutation_performed: false }, null, 2));
  console.log(`${CONTRACT}=${existing[0] ? "ALREADY_CREATED" : "PLAN_READY"}`);
  process.exit(0);
}

let createdId = "";
try {
  const response = await graphql(CREATE_MUTATION, { input }, mKey);
  const created = response?.data?.saveEndpoint || null;
  createdId = text(created?.id);
  if (!createdId) throw new Error(`${CONTRACT}_CREATE_RETURNED_EMPTY_ENDPOINT`);

  const state = await candidateSafety(createdId, mKey, qKey);
  assertFastTemplate(state.endpoint, `${CONTRACT}_CREATED_TEMPLATE`);
  if (!state.safe) throw new Error(`${CONTRACT}_CREATED_CANDIDATE_NOT_PARKED`);
  if (templateId(state.endpoint) !== templateId(fastRest)) {
    throw new Error(`${CONTRACT}_TEMPLATE_PARITY_FAILED`);
  }
  if (JSON.stringify(list(state.endpoint?.gpuTypeIds).map(text).filter(Boolean)) !== JSON.stringify(actualGpuTypes)) {
    throw new Error(`${CONTRACT}_GPU_PARITY_FAILED`);
  }

  const [deepAfter, fastAfter] = await Promise.all([
    health(text(deepRest?.id), qKey),
    health(text(fastRest?.id), qKey),
  ]);
  const deepAfterSummary = healthSummary(deepAfter);
  const fastAfterSummary = healthSummary(fastAfter);
  const [deepRestAfter, fastRestAfter] = await Promise.all([
    rest(`/endpoints/${encodeURIComponent(text(deepRest?.id))}?includeWorkers=true`, mKey),
    rest(`/endpoints/${encodeURIComponent(text(fastRest?.id))}?includeWorkers=true`, mKey),
  ]);
  if (!canonical(deepRestAfter, fastRestAfter, deepAfterSummary, fastAfterSummary)) {
    throw new Error(`${CONTRACT}_CANONICAL_STATE_CHANGED_AFTER_CREATE`);
  }

  console.log(JSON.stringify({
    ...plan,
    mode: "APPLY",
    candidate_existing: true,
    candidate_existing_id: createdId,
    candidate_existing_safe_parked: true,
    candidate_workers_min: finite(state.endpoint?.workersMin),
    candidate_workers_max: finite(state.endpoint?.workersMax),
    candidate_gpu_type_ids: list(state.endpoint?.gpuTypeIds).map(text).filter(Boolean),
    candidate_queue: state.health.jobs,
    candidate_workers: state.health.workers,
    canonical_deep_active_fast_parked_zero_queue_after: true,
    mutation_performed: true,
    endpoint_candidate_creation_performed: true,
    next_action: "RUN_REPLACEMENT_CANDIDATE_SCHEDULER_CONTROL_PROBE",
  }, null, 2));
  console.log(`${CONTRACT}=PASS`);
} catch (error) {
  let cleanup = createdId ? "NOT_ATTEMPTED" : "NOT_REQUIRED";
  if (createdId) {
    try {
      await deleteEndpoint(createdId, mKey);
      cleanup = "PASS";
    } catch (cleanupError) {
      cleanup = `FAIL:${redact(cleanupError instanceof Error ? cleanupError.message : cleanupError).slice(0, 700)}`;
    }
  }
  throw new Error(`${CONTRACT}_CREATE_VERIFY_FAILED:${redact(error instanceof Error ? error.message : error)}:cleanup=${cleanup}`);
}
