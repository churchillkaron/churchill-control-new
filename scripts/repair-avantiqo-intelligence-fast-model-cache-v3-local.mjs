import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const MODEL_REFERENCE = "https://huggingface.co/Qwen/Qwen3-30B-A3B-Instruct-2507:main";
const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3";
const EXPECTED_MAIN_ENV = "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_EXPECTED_MAIN";
const APPROVAL_ENV = "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_APPROVED";
const VERIFY_TIMEOUT_MS = Math.max(15_000, Math.min(120_000, Number(process.env.AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_VERIFY_TIMEOUT_MS || 60_000)));
const VERIFY_POLL_MS = 3_000;

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = null) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const approved = (name) => text(process.env[name]).toUpperCase() === "YES";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  return text(value)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]");
}

function shell(name, args, code) {
  const result = spawnSync(name, args, { cwd: process.cwd(), encoding: "utf8", env: process.env });
  if (result.status !== 0) {
    throw new Error(`${code}:${redact(result.stderr || result.stdout).slice(0, 700)}`);
  }
  return text(result.stdout);
}

function validateMain() {
  const expectedMain = text(process.env[EXPECTED_MAIN_ENV]);
  if (expectedMain && !/^[0-9a-f]{40}$/i.test(expectedMain)) {
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_EXPECTED_MAIN_INVALID:${expectedMain.slice(0, 80)}`);
  }
  const branch = shell("git", ["branch", "--show-current"], "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_GIT_BRANCH_FAILED");
  if (branch !== "main") {
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }
  const head = shell("git", ["rev-parse", "HEAD"], "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_GIT_HEAD_FAILED");
  if (expectedMain) {
    if (head !== expectedMain) {
      throw new Error(`AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_PINNED_MAIN_MISMATCH:head=${head}:expected=${expectedMain}`);
    }
    return { head, pinned: true };
  }
  shell("git", ["fetch", "origin", "main"], "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_GIT_FETCH_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_GIT_REMOTE_FAILED");
  if (head !== remote) {
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  }
  return { head, pinned: false };
}

function managementCredential() {
  const value = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
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
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok || body === null) {
    const detail = redact(body?.message || body?.error || body?.detail || raw).slice(0, 700);
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
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
  if (Array.isArray(response?.errors) && response.errors.length > 0) {
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_GRAPHQL:${redact(response.errors[0]?.message).slice(0, 700)}`);
  }
  return response;
}

async function queueHealth(endpointId, key) {
  return requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, key, { timeoutMs: 20_000 });
}

function normalizeRows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}

function resolveOne(rows, name, code) {
  const matches = normalizeRows(rows).filter((row) => text(row?.name) === name);
  if (matches.length !== 1) throw new Error(`${code}:name=${name}:matches=${matches.length}`);
  return matches[0];
}

function modelReferences(endpoint) {
  return list(endpoint?.modelReferences)
    .map((entry) => text(typeof entry === "string" ? entry : entry?.url || entry?.reference || entry?.name))
    .filter(Boolean);
}

function hasExpectedReference(endpoint) {
  return modelReferences(endpoint).includes(MODEL_REFERENCE);
}

function normalizedNetworkVolumeIds(endpoint) {
  return list(endpoint?.networkVolumeIds)
    .map((entry) => text(typeof entry === "string" ? entry : entry?.networkVolumeId || entry?.id))
    .filter(Boolean)
    .map((networkVolumeId) => ({ networkVolumeId }));
}

function envMap(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(value
      .map((entry) => [text(entry?.key || entry?.name), String(entry?.value ?? "")])
      .filter(([key]) => key));
  }
  return Object.fromEntries(Object.entries(object(value)).map(([key, entry]) => [key, String(entry ?? "")]));
}

function assertFastModelBinding(endpoint) {
  const env = envMap(endpoint?.template?.env);
  const candidates = ["MODEL_NAME", "MODEL", "MODEL_ID", "HF_MODEL_ID"];
  const match = candidates.find((key) => text(env[key]) === FAST_MODEL);
  if (!match) throw new Error(`AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_MODEL_BINDING_MISMATCH:expected=${FAST_MODEL}`);
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
      initializing: finite(workers.initializing, 0),
      running: finite(workers.running, 0),
      unhealthy: finite(workers.unhealthy, 0),
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
  return deep.workers_min === 0 && deep.workers_max === 1 &&
    fast.workers_min === 0 && fast.workers_max === 0 &&
    deep.health.jobs.in_queue === 0 && deep.health.jobs.in_progress === 0 &&
    fast.health.jobs.in_queue === 0 && fast.health.jobs.in_progress === 0 &&
    deep.health.workers.unhealthy === 0 && fast.health.workers.unhealthy === 0;
}

function saveInput(endpoint, refs) {
  const input = {
    id: text(endpoint?.id),
    name: text(endpoint?.name),
    templateId: text(endpoint?.templateId || endpoint?.template?.id),
    gpuCount: Math.max(1, finite(endpoint?.gpuCount, 1)),
    instanceIds: list(endpoint?.instanceIds).map(text).filter(Boolean),
    workersMin: Math.max(0, finite(endpoint?.workersMin, 0)),
    workersMax: Math.max(0, finite(endpoint?.workersMax, 0)),
    networkVolumeIds: normalizedNetworkVolumeIds(endpoint),
    idleTimeout: Math.max(1, finite(endpoint?.idleTimeout, 5)),
    scalerValue: Math.max(1, finite(endpoint?.scalerValue, 1)),
    executionTimeoutMs: Math.max(1, finite(endpoint?.executionTimeoutMs, 90_000)),
    modelReferences: [...refs],
  };
  const optionalStrings = {
    gpuIds: text(endpoint?.gpuIds),
    locations: text(endpoint?.locations),
    networkVolumeId: text(endpoint?.networkVolumeId),
    scalerType: text(endpoint?.scalerType),
    minCudaVersion: text(endpoint?.minCudaVersion),
    flashBootType: text(endpoint?.flashBootType),
  };
  for (const [key, value] of Object.entries(optionalStrings)) {
    if (value) input[key] = value;
  }
  return input;
}

function invariantSummary(endpoint) {
  const input = saveInput(endpoint, []);
  delete input.modelReferences;
  return input;
}

function differentFields(before, after) {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

const MODEL_REFERENCES_QUERY = `
query AvantiqoFastModelReferences {
  myself {
    endpoints {
      id
      name
      modelReferences
    }
  }
}`;

const SAVE_ENDPOINT_MUTATION = `
mutation SaveEndpoint($input: EndpointInput!) {
  saveEndpoint(input: $input) {
    id
    name
    modelReferences
  }
}`;

async function graphqlModelReferences(endpointId, managementKey) {
  const response = await graphql(MODEL_REFERENCES_QUERY, {}, managementKey);
  const endpoints = list(response?.data?.myself?.endpoints);
  const matches = endpoints.filter((entry) => text(entry?.id) === endpointId);
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_GRAPHQL_ENDPOINT_RESOLUTION_FAILED:id=${endpointId}:matches=${matches.length}`);
  }
  const endpoint = matches[0];
  return {
    id: endpointId,
    name: text(endpoint?.name) || null,
    model_references: modelReferences(endpoint),
    expected_reference_present: hasExpectedReference(endpoint),
  };
}

async function exactEndpoint(endpointId, managementKey) {
  return rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, managementKey);
}

async function saveEndpoint(endpoint, refs, managementKey) {
  const response = await graphql(SAVE_ENDPOINT_MUTATION, { input: saveInput(endpoint, refs) }, managementKey);
  const saved = response?.data?.saveEndpoint;
  if (!saved?.id) throw new Error("AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_SAVE_ENDPOINT_EMPTY");
  return saved;
}

async function readCanonicalLive(managementKey, queueKey) {
  const endpointsRaw = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
  const endpoints = normalizeRows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
  const deepList = resolveOne(endpoints, DEEP_NAME, "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_DEEP_RESOLUTION_FAILED");
  const fastList = resolveOne(endpoints, FAST_NAME, "AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_FAST_RESOLUTION_FAILED");
  const deepId = text(deepList?.id);
  const fastId = text(fastList?.id);
  if (!deepId || !fastId) throw new Error("AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_ENDPOINT_IDS_REQUIRED");
  const [deepEndpoint, fastEndpoint, deepHealthRaw, fastHealthRaw] = await Promise.all([
    exactEndpoint(deepId, managementKey),
    exactEndpoint(fastId, managementKey),
    queueHealth(deepId, queueKey),
    queueHealth(fastId, queueKey),
  ]);
  const deep = endpointRuntimeSummary(deepEndpoint, healthSummary(deepHealthRaw));
  const fast = endpointRuntimeSummary(fastEndpoint, healthSummary(fastHealthRaw));
  return { deepEndpoint, fastEndpoint, deep, fast, deepId, fastId };
}

async function pollModelReferences(endpointId, managementKey) {
  const started = Date.now();
  let lastGraphql = null;
  let lastRest = null;
  while (Date.now() - started <= VERIFY_TIMEOUT_MS) {
    const [graphqlState, restState] = await Promise.all([
      graphqlModelReferences(endpointId, managementKey),
      exactEndpoint(endpointId, managementKey),
    ]);
    lastGraphql = graphqlState;
    lastRest = {
      model_references: modelReferences(restState),
      expected_reference_present: hasExpectedReference(restState),
    };
    const elapsedSeconds = Math.round((Date.now() - started) / 1000);
    console.log(`AVANTIQO_FAST_MODEL_CACHE_VERIFY_PROGRESS=${JSON.stringify({
      elapsed_seconds: elapsedSeconds,
      graphql_reference_present: lastGraphql.expected_reference_present,
      rest_reference_present: lastRest.expected_reference_present,
    })}`);
    if (lastGraphql.expected_reference_present || lastRest.expected_reference_present) {
      return { visible: true, elapsed_ms: Date.now() - started, graphql: lastGraphql, rest: lastRest };
    }
    if (Date.now() - started >= VERIFY_TIMEOUT_MS) break;
    await sleep(VERIFY_POLL_MS);
  }
  return { visible: false, elapsed_ms: Date.now() - started, graphql: lastGraphql, rest: lastRest };
}

async function rollback(beforeEndpoint, beforeRefs, managementKey, queueKey) {
  await saveEndpoint(beforeEndpoint, beforeRefs, managementKey);
  const live = await readCanonicalLive(managementKey, queueKey);
  const state = await graphqlModelReferences(live.fastId, managementKey);
  const invariantDiffs = differentFields(invariantSummary(beforeEndpoint), invariantSummary(live.fastEndpoint));
  return canonicalState(live.deep, live.fast) && invariantDiffs.length === 0 &&
    JSON.stringify(state.model_references) === JSON.stringify(beforeRefs);
}

const apply = process.argv.includes("--apply");
if (apply && !approved(APPROVAL_ENV)) throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);

const main = validateMain();
const managementKey = managementCredential();
const queueKey = runtimeCredential(managementKey);
const live = await readCanonicalLive(managementKey, queueKey);
assertFastModelBinding(live.fastEndpoint);

if (!canonicalState(live.deep, live.fast)) {
  throw new Error(`AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_CANONICAL_STATE_REQUIRED:deep=${JSON.stringify(live.deep)}:fast=${JSON.stringify(live.fast)}`);
}

const beforeGraphqlState = await graphqlModelReferences(live.fastId, managementKey);
const beforeRefs = beforeGraphqlState.model_references;
const expectedAlreadyAttached = beforeGraphqlState.expected_reference_present && beforeRefs.length === 1;
if (beforeRefs.length > 0 && !expectedAlreadyAttached) {
  throw new Error(`AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_EXISTING_MODEL_REFERENCES_REVIEW_REQUIRED:${JSON.stringify(beforeRefs)}`);
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
  verification_sources: ["GRAPHQL_SAVE_RESPONSE", "GRAPHQL_ENDPOINT_MODEL_REFERENCES", "REST_EXACT_ENDPOINT"],
  verify_timeout_ms: VERIFY_TIMEOUT_MS,
  proposed_change: expectedAlreadyAttached ? "NONE" : "SET_FAST_MODEL_REFERENCES_ONLY",
  generation_submitted: false,
  inference_performed: false,
  gpu_activation_performed: false,
  queue_mutation_performed: false,
  template_mutation_performed: false,
  network_volume_mutation_performed: false,
  production_deploy_performed: false,
  secrets_in_output: false,
};

if (!apply || expectedAlreadyAttached) {
  console.log(JSON.stringify({ ...plan, mutation_performed: false }, null, 2));
  console.log(`AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3=${expectedAlreadyAttached ? "ALREADY_APPLIED" : "PLAN_READY"}`);
  process.exit(0);
}

const beforeInvariant = invariantSummary(live.fastEndpoint);
const saved = await saveEndpoint(live.fastEndpoint, [MODEL_REFERENCE], managementKey);
const saveResponse = {
  model_references: modelReferences(saved),
  expected_reference_present: hasExpectedReference(saved),
};
const verification = await pollModelReferences(live.fastId, managementKey);
const afterLive = await readCanonicalLive(managementKey, queueKey);
const afterInvariant = invariantSummary(afterLive.fastEndpoint);
const invariantDifferences = differentFields(beforeInvariant, afterInvariant);
const canonicalAfter = canonicalState(afterLive.deep, afterLive.fast);
const acceptedByAnyAuthoritativeSource = saveResponse.expected_reference_present || verification.visible;

if (!canonicalAfter || invariantDifferences.length > 0 || !acceptedByAnyAuthoritativeSource) {
  let rollbackSucceeded = false;
  try {
    rollbackSucceeded = await rollback(live.fastEndpoint, beforeRefs, managementKey, queueKey);
  } catch {
    rollbackSucceeded = false;
  }
  throw new Error(`AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3_VERIFY_FAILED:canonical=${canonicalAfter}:accepted=${acceptedByAnyAuthoritativeSource}:invariant_differences=${invariantDifferences.join(",") || "NONE"}:rollback=${rollbackSucceeded ? "PASS" : "FAIL"}`);
}

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  save_response: saveResponse,
  verification,
  cache_registration_visibility: verification.visible ? "PERSISTENCE_VISIBLE" : "SAVE_RESPONSE_ACCEPTED",
  invariant_difference_fields: invariantDifferences,
  canonical_deep_active_fast_parked_after: true,
  model_reference_accepted: true,
  mutation_performed: true,
  endpoint_mutation_performed: true,
  generation_submitted: false,
  inference_performed: false,
  gpu_activation_performed: false,
  production_deploy_performed: false,
  next_action: "BENCHMARK_FAST_COLD_MODEL_ROUTE_AFTER_HOST_CACHE",
}, null, 2));
console.log("AVANTIQO_INTELLIGENCE_FAST_MODEL_CACHE_REPAIR_V3=PASS");
