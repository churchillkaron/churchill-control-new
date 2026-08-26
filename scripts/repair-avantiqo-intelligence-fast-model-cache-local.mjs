import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const MODEL_REFERENCE =
  "https://huggingface.co/Qwen/Qwen3-30B-A3B-Instruct-2507:main";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V1";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_EXPECTED_MAIN";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_APPROVED";

const text = (value) => String(value ?? "").trim();
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const approved = (name) => text(process.env[name]).toUpperCase() === "YES";

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(
      /((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi,
      "$1[REDACTED]",
    );
}

function shell(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${redact(result.stderr || result.stdout).slice(0, 700)}`);
  }
  return text(result.stdout);
}

function validateMain() {
  const expectedMain = text(process.env[EXPECTED_MAIN_ENV]);
  if (expectedMain && !/^[0-9a-f]{40}$/i.test(expectedMain)) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_EXPECTED_MAIN_INVALID:${expectedMain.slice(0, 80)}`,
    );
  }

  const branch = shell(
    "git",
    ["branch", "--show-current"],
    "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_GIT_BRANCH_FAILED",
  );
  if (branch !== "main") {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_MAIN_REQUIRED:actual=${branch || "DETACHED"}`,
    );
  }

  const head = shell(
    "git",
    ["rev-parse", "HEAD"],
    "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_GIT_HEAD_FAILED",
  );

  if (expectedMain) {
    if (head !== expectedMain) {
      throw new Error(
        `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_PINNED_MAIN_MISMATCH:head=${head}:expected=${expectedMain}`,
      );
    }
    return { head, pinned: true };
  }

  shell(
    "git",
    ["fetch", "origin", "main"],
    "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_GIT_FETCH_FAILED",
  );
  const remote = shell(
    "git",
    ["rev-parse", "origin/main"],
    "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_GIT_REMOTE_FAILED",
  );
  if (head !== remote) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`,
    );
  }
  return { head, pinned: false };
}

function managementCredential() {
  const value = text(
    process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
  );
  if (!value) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");
  return value;
}

function runtimeCredential(managementKey) {
  return text(process.env.RUNPOD_API_KEY) || managementKey;
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
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok || body === null) {
    const detail = redact(body?.message || body?.error || body?.detail || raw).slice(
      0,
      700,
    );
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
  }
  return body;
}

async function rest(path, key, options = {}) {
  return requestJson(`${REST_BASE}${path}`, key, options);
}

async function queueHealth(endpointId, key) {
  return requestJson(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
    key,
    { timeoutMs: 20_000 },
  );
}

async function graphql(query, variables, key) {
  const response = await requestJson(GRAPHQL_URL, key, {
    method: "POST",
    body: { query, variables },
    timeoutMs: 30_000,
  });
  if (Array.isArray(response?.errors) && response.errors.length > 0) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_GRAPHQL:${redact(response.errors[0]?.message).slice(0, 700)}`,
    );
  }
  return response;
}

function normalizeRows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function resolveOne(rows, name) {
  const matches = normalizeRows(rows).filter((row) => text(row?.name) === name);
  if (matches.length !== 1) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_ENDPOINT_RESOLUTION_FAILED:name=${name}:matches=${matches.length}`,
    );
  }
  return matches[0];
}

function modelReferences(endpoint) {
  return list(endpoint?.modelReferences)
    .map((entry) => text(typeof entry === "string" ? entry : entry?.url || entry?.reference))
    .filter(Boolean);
}

function normalizedNetworkVolumeIds(endpoint) {
  return list(endpoint?.networkVolumeIds)
    .map((entry) =>
      text(typeof entry === "string" ? entry : entry?.networkVolumeId || entry?.id),
    )
    .filter(Boolean)
    .map((networkVolumeId) => ({ networkVolumeId }));
}

function envMap(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
        .filter(([key]) => key),
    );
  }
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, entry]) => [key, String(entry ?? "")]),
  );
}

function assertFastModelBinding(endpoint) {
  const env = envMap(endpoint?.template?.env);
  const candidates = ["MODEL_NAME", "MODEL", "MODEL_ID", "HF_MODEL_ID"];
  const match = candidates.find((key) => text(env[key]) === FAST_MODEL);
  if (!match) {
    throw new Error(
      `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_MODEL_BINDING_MISMATCH:expected=${FAST_MODEL}`,
    );
  }
  return match;
}

function healthSummary(value = {}) {
  const jobs = object(value?.jobs);
  const workers = object(value?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
    },
    workers: {
      unhealthy: finite(workers.unhealthy, 0),
      initializing: finite(workers.initializing, 0),
      running: finite(workers.running, 0),
    },
  };
}

function endpointRuntimeSummary(endpoint, health) {
  return {
    name: text(endpoint?.name) || null,
    workers_min: finite(endpoint?.workersMin, -1),
    workers_max: finite(endpoint?.workersMax, -1),
    health,
  };
}

function canonicalState(deep, fast) {
  return (
    deep.workers_min === 0 &&
    deep.workers_max === 1 &&
    fast.workers_min === 0 &&
    fast.workers_max === 0 &&
    deep.health.jobs.in_queue === 0 &&
    deep.health.jobs.in_progress === 0 &&
    fast.health.jobs.in_queue === 0 &&
    fast.health.jobs.in_progress === 0 &&
    deep.health.workers.unhealthy === 0 &&
    fast.health.workers.unhealthy === 0
  );
}

function saveInput(endpoint, refs) {
  return {
    id: text(endpoint?.id),
    name: text(endpoint?.name),
    templateId: text(endpoint?.templateId || endpoint?.template?.id),
    gpuIds: text(endpoint?.gpuIds),
    gpuCount: Math.max(1, finite(endpoint?.gpuCount, 1)),
    instanceIds: list(endpoint?.instanceIds).map(text).filter(Boolean),
    workersMin: Math.max(0, finite(endpoint?.workersMin, 0)),
    workersMax: Math.max(0, finite(endpoint?.workersMax, 0)),
    locations: text(endpoint?.locations),
    networkVolumeId: text(endpoint?.networkVolumeId),
    networkVolumeIds: normalizedNetworkVolumeIds(endpoint),
    idleTimeout: Math.max(1, finite(endpoint?.idleTimeout, 5)),
    scalerType: text(endpoint?.scalerType),
    scalerValue: Math.max(1, finite(endpoint?.scalerValue, 1)),
    executionTimeoutMs: Math.max(1, finite(endpoint?.executionTimeoutMs, 90_000)),
    minCudaVersion: text(endpoint?.minCudaVersion),
    flashBootType: text(endpoint?.flashBootType),
    modelReferences: [...refs],
  };
}

function invariantSummary(endpoint) {
  const input = saveInput(endpoint, []);
  delete input.modelReferences;
  return input;
}

function differentFields(before, after) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.filter(
    (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

const SAVE_ENDPOINT_MUTATION = `
mutation SaveEndpoint($input: EndpointInput!) {
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
    networkVolumeIds { networkVolumeId }
    idleTimeout
    scalerType
    scalerValue
    executionTimeoutMs
    minCudaVersion
    flashBootType
    modelReferences
  }
}`;

async function saveEndpoint(endpoint, refs, managementKey) {
  const result = await graphql(
    SAVE_ENDPOINT_MUTATION,
    { input: saveInput(endpoint, refs) },
    managementKey,
  );
  const saved = result?.data?.saveEndpoint;
  if (!saved?.id) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_SAVE_ENDPOINT_EMPTY");
  }
  return saved;
}

async function readLive(managementKey, queueKey) {
  const endpointsRaw = await rest(
    "/endpoints?includeTemplate=true&includeWorkers=true",
    managementKey,
  );
  const endpoints = normalizeRows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const deepEndpoint = resolveOne(endpoints, DEEP_NAME);
  const fastEndpoint = resolveOne(endpoints, FAST_NAME);
  const deepId = text(deepEndpoint?.id);
  const fastId = text(fastEndpoint?.id);
  if (!deepId || !fastId) {
    throw new Error("AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_ENDPOINT_IDS_REQUIRED");
  }
  const [deepHealthRaw, fastHealthRaw] = await Promise.all([
    queueHealth(deepId, queueKey),
    queueHealth(fastId, queueKey),
  ]);
  const deep = endpointRuntimeSummary(deepEndpoint, healthSummary(deepHealthRaw));
  const fast = endpointRuntimeSummary(fastEndpoint, healthSummary(fastHealthRaw));
  return { endpoints, deepEndpoint, fastEndpoint, deep, fast };
}

const apply = process.argv.includes("--apply");
if (apply && !approved(APPROVAL_ENV)) {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const main = validateMain();
const managementKey = managementCredential();
const queueKey = runtimeCredential(managementKey);
const live = await readLive(managementKey, queueKey);
assertFastModelBinding(live.fastEndpoint);

if (!canonicalState(live.deep, live.fast)) {
  throw new Error(
    `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_CANONICAL_STATE_REQUIRED:deep=${JSON.stringify(live.deep)}:fast=${JSON.stringify(live.fast)}`,
  );
}

const beforeRefs = modelReferences(live.fastEndpoint);
const expectedAlreadyAttached =
  beforeRefs.length === 1 && beforeRefs[0] === MODEL_REFERENCE;
if (beforeRefs.length > 0 && !expectedAlreadyAttached) {
  throw new Error(
    `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_EXISTING_MODEL_REFERENCES_REVIEW_REQUIRED:${JSON.stringify(beforeRefs)}`,
  );
}

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_commit: main.head,
  pinned_main: main.pinned,
  fast_model: FAST_MODEL,
  expected_model_reference: MODEL_REFERENCE,
  before_model_references: beforeRefs,
  expected_model_reference_already_attached: expectedAlreadyAttached,
  canonical_deep_active_fast_parked: true,
  proposed_change: expectedAlreadyAttached ? "NONE" : "SET_FAST_MODEL_REFERENCES_ONLY",
  generation_submitted: false,
  inference_performed: false,
  queue_mutation_performed: false,
  template_mutation_performed: false,
  network_volume_mutation_performed: false,
  production_deploy_performed: false,
  secrets_in_output: false,
};

if (!apply || expectedAlreadyAttached) {
  console.log(JSON.stringify({ ...plan, mutation_performed: false }, null, 2));
  console.log(
    `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR=${expectedAlreadyAttached ? "ALREADY_APPLIED" : "PLAN_READY"}`,
  );
  process.exit(0);
}

const beforeInvariant = invariantSummary(live.fastEndpoint);
await saveEndpoint(live.fastEndpoint, [MODEL_REFERENCE], managementKey);

let afterLive;
try {
  afterLive = await readLive(managementKey, queueKey);
} catch (error) {
  let rollback = "NOT_ATTEMPTED";
  try {
    await saveEndpoint(live.fastEndpoint, beforeRefs, managementKey);
    rollback = "REQUESTED";
  } catch {
    rollback = "FAILED";
  }
  throw new Error(
    `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_POST_SAVE_READ_FAILED:rollback=${rollback}:${redact(error?.message).slice(0, 700)}`,
  );
}

const afterRefs = modelReferences(afterLive.fastEndpoint);
const afterInvariant = invariantSummary(afterLive.fastEndpoint);
const invariantDifferences = differentFields(beforeInvariant, afterInvariant);
const canonicalAfter = canonicalState(afterLive.deep, afterLive.fast);
const modelReferenceVerified =
  afterRefs.length === 1 && afterRefs[0] === MODEL_REFERENCE;

if (!canonicalAfter || !modelReferenceVerified || invariantDifferences.length > 0) {
  let rollbackSucceeded = false;
  try {
    await saveEndpoint(afterLive.fastEndpoint, beforeRefs, managementKey);
    const rolled = await readLive(managementKey, queueKey);
    rollbackSucceeded =
      canonicalState(rolled.deep, rolled.fast) &&
      JSON.stringify(invariantSummary(rolled.fastEndpoint)) ===
        JSON.stringify(beforeInvariant) &&
      JSON.stringify(modelReferences(rolled.fastEndpoint)) === JSON.stringify(beforeRefs);
  } catch {
    rollbackSucceeded = false;
  }
  throw new Error(
    `AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_VERIFY_FAILED:canonical=${canonicalAfter}:model_reference=${modelReferenceVerified}:invariant_differences=${invariantDifferences.join(",") || "NONE"}:rollback=${rollbackSucceeded ? "PASS" : "FAIL"}`,
  );
}

console.log(
  JSON.stringify(
    {
      ...plan,
      mode: "APPLY",
      before_model_references: beforeRefs,
      after_model_references: afterRefs,
      invariant_difference_fields: invariantDifferences,
      model_reference_verified: true,
      canonical_deep_active_fast_parked_after: true,
      mutation_performed: true,
      endpoint_mutation_performed: true,
      generation_submitted: false,
      inference_performed: false,
      production_deploy_performed: false,
      next_action: "BENCHMARK_FAST_COLD_MODEL_ROUTE_AFTER_HOST_CACHE",
    },
    null,
    2,
  ),
);
console.log("AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR=PASS");