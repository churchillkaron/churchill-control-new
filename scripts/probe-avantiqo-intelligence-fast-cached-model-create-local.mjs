import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const GRAPHQL_URL = "https://api.runpod.io/graphql";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const CANDIDATE_NAME = "avantiqo-intelligence-fast-cache-candidate";
const FAST_MODEL = "Qwen/Qwen3-30B-A3B-Instruct-2507";
const MODEL_REFERENCE =
  "https://huggingface.co/Qwen/Qwen3-30B-A3B-Instruct-2507:main";
const CONTRACT =
  "AVANTIQO_INTELLIGENCE_FAST_CACHED_MODEL_CREATE_PROBE_V1";
const EXPECTED_MAIN_ENV =
  "AVANTIQO_INTELLIGENCE_FAST_CACHED_MODEL_CREATE_PROBE_EXPECTED_MAIN";
const APPROVAL_ENV =
  "AVANTIQO_INTELLIGENCE_FAST_CACHED_MODEL_CREATE_PROBE_APPROVED";

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
    throw new Error(
      `${code}:${redact(result.stderr || result.stdout).slice(0, 700)}`,
    );
  }
  return text(result.stdout);
}

function validateMain() {
  const expectedMain = text(process.env[EXPECTED_MAIN_ENV]);
  if (expectedMain && !/^[0-9a-f]{40}$/i.test(expectedMain)) {
    throw new Error(`${EXPECTED_MAIN_ENV}_INVALID`);
  }

  const branch = shell(
    "git",
    ["branch", "--show-current"],
    `${CONTRACT}_GIT_BRANCH_FAILED`,
  );
  if (branch !== "main") {
    throw new Error(`${CONTRACT}_MAIN_REQUIRED:actual=${branch || "DETACHED"}`);
  }

  const head = shell(
    "git",
    ["rev-parse", "HEAD"],
    `${CONTRACT}_GIT_HEAD_FAILED`,
  );

  if (expectedMain) {
    if (head !== expectedMain) {
      throw new Error(
        `${CONTRACT}_PINNED_MAIN_MISMATCH:head=${head}:expected=${expectedMain}`,
      );
    }
    return { head, pinned: true };
  }

  shell("git", ["fetch", "origin", "main"], `${CONTRACT}_GIT_FETCH_FAILED`);
  const remote = shell(
    "git",
    ["rev-parse", "origin/main"],
    `${CONTRACT}_GIT_REMOTE_FAILED`,
  );
  if (head !== remote) {
    throw new Error(
      `${CONTRACT}_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`,
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

  if (!response.ok) {
    const detail = redact(
      body?.message || body?.error || body?.detail || raw,
    ).slice(0, 700);
    throw new Error(
      `${CONTRACT}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`,
    );
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
  if (Array.isArray(response?.errors) && response.errors.length > 0) {
    throw new Error(
      `${CONTRACT}_GRAPHQL:${redact(response.errors[0]?.message).slice(0, 700)}`,
    );
  }
  return response;
}

async function queueHealth(endpointId, key) {
  return requestJson(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
    key,
    { timeoutMs: 20_000 },
  );
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
  if (matches.length !== 1) {
    throw new Error(`${code}:name=${name}:matches=${matches.length}`);
  }
  return matches[0];
}

function modelReferences(endpoint) {
  return list(endpoint?.modelReferences)
    .map((entry) =>
      text(
        typeof entry === "string"
          ? entry
          : entry?.url || entry?.reference || entry?.name,
      ),
    )
    .filter(Boolean);
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

function canonicalState(deepEndpoint, fastEndpoint, deepHealth, fastHealth) {
  return (
    finite(deepEndpoint?.workersMin, -1) === 0 &&
    finite(deepEndpoint?.workersMax, -1) === 1 &&
    finite(fastEndpoint?.workersMin, -1) === 0 &&
    finite(fastEndpoint?.workersMax, -1) === 0 &&
    deepHealth.jobs.in_queue === 0 &&
    deepHealth.jobs.in_progress === 0 &&
    fastHealth.jobs.in_queue === 0 &&
    fastHealth.jobs.in_progress === 0 &&
    deepHealth.workers.unhealthy === 0 &&
    fastHealth.workers.unhealthy === 0
  );
}

function envMap(value) {
  if (Array.isArray(value)) {
    return Object.fromEntries(
      value
        .map((entry) => [
          text(entry?.key || entry?.name),
          String(entry?.value ?? ""),
        ])
        .filter(([key]) => key),
    );
  }
  return Object.fromEntries(
    Object.entries(object(value)).map(([key, entry]) => [key, String(entry ?? "")]),
  );
}

function assertFastModelBinding(endpoint) {
  const env = envMap(endpoint?.template?.env);
  const keys = ["MODEL_NAME", "MODEL", "MODEL_ID", "HF_MODEL_ID"];
  if (!keys.some((key) => text(env[key]) === FAST_MODEL)) {
    throw new Error(`${CONTRACT}_FAST_TEMPLATE_MODEL_BINDING_MISMATCH`);
  }
}

const ENDPOINT_STATE_QUERY = `
query AvantiqoFastEndpointCreateSource {
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
      modelReferences
    }
  }
}`;

const GPU_POOLS_QUERY = `
query AvantiqoServerlessGpuPools {
  serverlessGpuPools {
    id
    gpuTypeIds
  }
}`;

const CREATE_ENDPOINT_MUTATION = `
mutation SaveEndpoint($input: EndpointInput!) {
  saveEndpoint(input: $input) {
    id
    name
    templateId
    gpuIds
    gpuCount
    workersMin
    workersMax
    flashBootType
    modelReferences
  }
}`;

async function graphqlEndpoints(managementKey) {
  const response = await graphql(ENDPOINT_STATE_QUERY, {}, managementKey);
  return list(response?.data?.myself?.endpoints);
}

async function resolveGpuPoolId(fastGraphql, fastRest, managementKey) {
  const existing = text(fastGraphql?.gpuIds);
  if (existing) return existing;

  const gpuTypeIds = list(fastRest?.gpuTypeIds).map(text).filter(Boolean);
  if (gpuTypeIds.length === 0) {
    throw new Error(`${CONTRACT}_GPU_SOURCE_REQUIRED`);
  }

  const response = await graphql(GPU_POOLS_QUERY, {}, managementKey);
  const pools = list(response?.data?.serverlessGpuPools);
  const resolved = [];
  for (const gpuTypeId of gpuTypeIds) {
    const pool = pools.find((entry) =>
      list(entry?.gpuTypeIds).map(text).some((id) => id === gpuTypeId),
    );
    const poolId = text(pool?.id);
    if (!poolId) {
      throw new Error(`${CONTRACT}_GPU_POOL_RESOLUTION_FAILED:${gpuTypeId}`);
    }
    if (!resolved.includes(poolId)) resolved.push(poolId);
  }
  return resolved.join(",");
}

function normalizedNetworkVolumeIds(endpoint) {
  return list(endpoint?.networkVolumeIds)
    .map((entry) =>
      text(
        typeof entry === "string"
          ? entry
          : entry?.networkVolumeId || entry?.id,
      ),
    )
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
    modelReferences: [MODEL_REFERENCE],
  };

  const instanceIds = list(source?.instanceIds).map(text).filter(Boolean);
  if (instanceIds.length > 0) input.instanceIds = instanceIds;

  const locations = text(source?.locations);
  if (locations) input.locations = locations;

  const networkVolumeId = text(source?.networkVolumeId);
  if (networkVolumeId) input.networkVolumeId = networkVolumeId;

  const networkVolumeIds = normalizedNetworkVolumeIds(source);
  if (networkVolumeIds.length > 0) input.networkVolumeIds = networkVolumeIds;

  const idleTimeout = finite(source?.idleTimeout);
  if (idleTimeout !== null && idleTimeout > 0) input.idleTimeout = idleTimeout;

  const scalerType = text(source?.scalerType);
  if (scalerType) input.scalerType = scalerType;

  const scalerValue = finite(source?.scalerValue);
  if (scalerValue !== null && scalerValue > 0) input.scalerValue = scalerValue;

  const executionTimeoutMs = finite(source?.executionTimeoutMs);
  if (executionTimeoutMs !== null && executionTimeoutMs >= 0) {
    input.executionTimeoutMs = executionTimeoutMs;
  }

  const minCudaVersion = text(source?.minCudaVersion);
  if (minCudaVersion) input.minCudaVersion = minCudaVersion;

  const flashBootType = text(source?.flashBootType);
  input.flashBootType = flashBootType || "FLASHBOOT";

  if (!input.templateId) throw new Error(`${CONTRACT}_TEMPLATE_ID_REQUIRED`);
  return input;
}

async function deleteEndpoint(endpointId, managementKey) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
    method: "DELETE",
    allowEmpty: true,
  });
}

async function candidateSafety(endpointId, managementKey, queueKey) {
  const [endpoint, healthRaw] = await Promise.all([
    rest(
      `/endpoints/${encodeURIComponent(endpointId)}?includeWorkers=true`,
      managementKey,
    ),
    queueHealth(endpointId, queueKey),
  ]);
  const health = healthSummary(healthRaw);
  return {
    safe:
      finite(endpoint?.workersMin, -1) === 0 &&
      finite(endpoint?.workersMax, -1) === 0 &&
      health.jobs.in_queue === 0 &&
      health.jobs.in_progress === 0 &&
      health.workers.running === 0 &&
      health.workers.initializing === 0,
    endpoint,
    health,
  };
}

const apply = process.argv.includes("--apply");
if (apply && !approved(APPROVAL_ENV)) {
  throw new Error(`${APPROVAL_ENV}=YES_REQUIRED`);
}

const main = validateMain();
const managementKey = managementCredential();
const queueKey = runtimeCredential(managementKey);

const [restEndpointsRaw, gqlEndpoints] = await Promise.all([
  rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
  graphqlEndpoints(managementKey),
]);
const restEndpoints = normalizeRows(restEndpointsRaw, [
  "endpoints",
  "serverlessEndpoints",
]);
const deepRest = resolveOne(
  restEndpoints,
  DEEP_NAME,
  `${CONTRACT}_DEEP_RESOLUTION_FAILED`,
);
const fastRest = resolveOne(
  restEndpoints,
  FAST_NAME,
  `${CONTRACT}_FAST_RESOLUTION_FAILED`,
);
const deepId = text(deepRest?.id);
const fastId = text(fastRest?.id);
const fastGraphql = resolveOne(
  gqlEndpoints,
  FAST_NAME,
  `${CONTRACT}_FAST_GRAPHQL_RESOLUTION_FAILED`,
);

assertFastModelBinding(fastRest);
const [deepHealthRaw, fastHealthRaw] = await Promise.all([
  queueHealth(deepId, queueKey),
  queueHealth(fastId, queueKey),
]);
const deepHealth = healthSummary(deepHealthRaw);
const fastHealth = healthSummary(fastHealthRaw);
const canonical = canonicalState(deepRest, fastRest, deepHealth, fastHealth);
if (!canonical) {
  throw new Error(`${CONTRACT}_CANONICAL_DEEP_ACTIVE_FAST_PARKED_REQUIRED`);
}

const gpuIds = await resolveGpuPoolId(fastGraphql, fastRest, managementKey);
const proposedInput = createInput(fastGraphql, gpuIds);
const existingCandidates = restEndpoints.filter(
  (endpoint) => text(endpoint?.name) === CANDIDATE_NAME,
);
if (existingCandidates.length > 1) {
  throw new Error(`${CONTRACT}_MULTIPLE_CANDIDATES_REVIEW_REQUIRED`);
}

let existingCandidate = existingCandidates[0] || null;
let existingCandidateState = null;
if (existingCandidate) {
  existingCandidateState = await candidateSafety(
    text(existingCandidate.id),
    managementKey,
    queueKey,
  );
  if (!existingCandidateState.safe) {
    throw new Error(`${CONTRACT}_EXISTING_CANDIDATE_NOT_SAFE_TO_REUSE_OR_DELETE`);
  }
}

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_commit: main.head,
  pinned_main: main.pinned,
  source_fast_endpoint_id: fastId,
  source_fast_endpoint_name: FAST_NAME,
  source_fast_model: FAST_MODEL,
  candidate_name: CANDIDATE_NAME,
  candidate_existing: Boolean(existingCandidate),
  candidate_existing_id: existingCandidate ? text(existingCandidate.id) : null,
  candidate_existing_safe_parked: existingCandidateState?.safe ?? null,
  model_reference: MODEL_REFERENCE,
  gpu_pool_ids: gpuIds,
  template_id: proposedInput.templateId,
  workers_min: 0,
  workers_max: 0,
  canonical_deep_active_fast_parked: true,
  proposed_action: existingCandidate
    ? "DELETE_SAFE_STALE_CANDIDATE_THEN_CREATE_WITH_MODEL_REFERENCE"
    : "CREATE_PARKED_CANDIDATE_WITH_MODEL_REFERENCE",
  generation_submitted: false,
  inference_performed: false,
  gpu_activation_performed: false,
  queue_mutation_performed: false,
  production_deploy_performed: false,
  secrets_in_output: false,
};

if (!apply) {
  console.log(JSON.stringify({ ...plan, mutation_performed: false }, null, 2));
  console.log(`${CONTRACT}=PLAN_READY`);
  process.exit(0);
}

let staleCandidateDeleted = false;
if (existingCandidate) {
  await deleteEndpoint(text(existingCandidate.id), managementKey);
  staleCandidateDeleted = true;
}

let created = null;
try {
  const response = await graphql(
    CREATE_ENDPOINT_MUTATION,
    { input: proposedInput },
    managementKey,
  );
  created = response?.data?.saveEndpoint || null;
  if (!created?.id) throw new Error(`${CONTRACT}_CREATE_RETURNED_EMPTY_ENDPOINT`);

  const createdId = text(created.id);
  const refsFromCreate = modelReferences(created);
  const gqlAfter = resolveOne(
    await graphqlEndpoints(managementKey),
    CANDIDATE_NAME,
    `${CONTRACT}_CANDIDATE_GRAPHQL_RESOLUTION_FAILED`,
  );
  const refsAfter = modelReferences(gqlAfter);
  const candidateState = await candidateSafety(
    createdId,
    managementKey,
    queueKey,
  );
  const referencePersisted =
    refsFromCreate.includes(MODEL_REFERENCE) || refsAfter.includes(MODEL_REFERENCE);

  const [restAfterRaw, deepHealthAfterRaw, fastHealthAfterRaw] = await Promise.all([
    rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    queueHealth(deepId, queueKey),
    queueHealth(fastId, queueKey),
  ]);
  const restAfter = normalizeRows(restAfterRaw, ["endpoints", "serverlessEndpoints"]);
  const deepAfter = resolveOne(
    restAfter,
    DEEP_NAME,
    `${CONTRACT}_DEEP_AFTER_RESOLUTION_FAILED`,
  );
  const fastAfter = resolveOne(
    restAfter,
    FAST_NAME,
    `${CONTRACT}_FAST_AFTER_RESOLUTION_FAILED`,
  );
  const canonicalAfter = canonicalState(
    deepAfter,
    fastAfter,
    healthSummary(deepHealthAfterRaw),
    healthSummary(fastHealthAfterRaw),
  );

  if (!referencePersisted || !candidateState.safe || !canonicalAfter) {
    let cleanup = "NOT_ATTEMPTED";
    try {
      await deleteEndpoint(createdId, managementKey);
      cleanup = "PASS";
    } catch {
      cleanup = "FAIL";
    }
    throw new Error(
      `${CONTRACT}_CREATE_VERIFY_FAILED:reference_persisted=${referencePersisted}:candidate_safe=${candidateState.safe}:canonical=${canonicalAfter}:cleanup=${cleanup}`,
    );
  }

  console.log(
    JSON.stringify(
      {
        ...plan,
        mode: "APPLY",
        stale_candidate_deleted: staleCandidateDeleted,
        candidate_endpoint_id: createdId,
        create_response_model_references: refsFromCreate,
        persisted_graphql_model_references: refsAfter,
        model_reference_persisted: true,
        candidate_safe_parked: true,
        canonical_deep_active_fast_parked_after: true,
        mutation_performed: true,
        endpoint_created: true,
        endpoint_deleted: staleCandidateDeleted,
        generation_submitted: false,
        inference_performed: false,
        gpu_activation_performed: false,
        production_deploy_performed: false,
        classification:
          "RUNPOD_CACHED_MODEL_CREATION_PATH_SUPPORTED_EXISTING_FAST_UPDATE_PATH_BROKEN",
        next_action:
          "BENCHMARK_PARKED_CACHE_CANDIDATE_WITH_GOVERNED_SINGLE_WORKER_ACTIVATION",
      },
      null,
      2,
    ),
  );
  console.log(`${CONTRACT}=PASS`);
} catch (error) {
  throw error;
}
