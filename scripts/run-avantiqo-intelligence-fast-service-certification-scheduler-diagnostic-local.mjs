import { spawn } from "node:child_process";

const CONTRACT = "AVANTIQO_INTELLIGENCE_FAST_SERVICE_CERTIFICATION_SCHEDULER_DIAGNOSTIC_V1";
const ENDPOINT_NAME = "avantiqo-intelligence-fast-v1";
const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const RUNPOD_REST_BASE = "https://rest.runpod.io/v1";
const CHILD = "scripts/run-avantiqo-intelligence-code-mission-production-fast-service-certification-local.mjs";
const POLL_MS = 5000;
const HEALTH_TIMEOUT_MS = 15000;
const CLEANUP_TIMEOUT_MS = 60000;

function text(value, limit = 2000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJson(raw) {
  const source = text(raw, 200000);
  if (!source) return {};
  try {
    return JSON.parse(source);
  } catch {
    return null;
  }
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

function requireKey(name, value) {
  const resolved = text(value, 2000);
  if (!resolved) throw new Error(`${CONTRACT}_${name}_REQUIRED`);
  return resolved;
}

async function requestJson(url, key, timeoutMs = HEALTH_TIMEOUT_MS) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  const body = parseJson(raw);
  if (!response.ok) {
    throw new Error(`${CONTRACT}_RUNPOD_REQUEST_FAILED:${response.status}`);
  }
  if (body === null) {
    throw new Error(`${CONTRACT}_RUNPOD_NON_JSON_RESPONSE`);
  }
  return body;
}

async function discoverEndpointId(managementKey) {
  const body = await requestJson(
    `${RUNPOD_REST_BASE}/endpoints?includeTemplate=false&includeWorkers=false`,
    managementKey,
    30000,
  );
  const endpoints = normalizeListResponse(body, ["endpoints", "serverlessEndpoints"]);
  if (!endpoints) throw new Error(`${CONTRACT}_ENDPOINT_LIST_INVALID`);
  const matches = endpoints.filter((endpoint) => text(endpoint?.name, 300) === ENDPOINT_NAME);
  if (matches.length !== 1) {
    throw new Error(`${CONTRACT}_ENDPOINT_RESOLUTION_FAILED:matches=${matches.length}`);
  }
  const endpointId = text(matches[0]?.id, 300);
  if (!/^[A-Za-z0-9_-]+$/.test(endpointId)) {
    throw new Error(`${CONTRACT}_ENDPOINT_ID_INVALID`);
  }
  return endpointId;
}

function classifyHealth(health = {}) {
  const workers = object(health.workers);
  const jobs = object(health.jobs);
  const initializing = finite(workers.initializing, 0);
  const ready = finite(workers.ready, 0);
  const running = finite(workers.running, 0);
  const idle = finite(workers.idle, 0);
  const throttled = finite(workers.throttled, 0);
  const unhealthy = finite(workers.unhealthy, 0);
  const inQueue = finite(jobs.inQueue ?? jobs.in_queue, 0);
  const inProgress = finite(jobs.inProgress ?? jobs.in_progress, 0);

  let classification = "REST";
  if (initializing + ready + running + idle > 0 || inProgress > 0) {
    classification = "SCHEDULED";
  } else if (unhealthy > 0) {
    classification = "WORKER_UNHEALTHY";
  } else if (throttled > 0) {
    classification = "WORKER_THROTTLED";
  } else if (inQueue > 0) {
    classification = "QUEUED_NO_WORKER";
  }

  return {
    classification,
    workers: {
      initializing,
      ready,
      running,
      idle,
      throttled,
      unhealthy,
    },
    jobs: {
      in_queue: inQueue,
      in_progress: inProgress,
    },
  };
}

async function endpointHealth(endpointId, queueKey) {
  const body = await requestJson(
    `${RUNPOD_API_BASE}/${endpointId}/health`,
    queueKey,
    HEALTH_TIMEOUT_MS,
  );
  return {
    workers: object(body?.workers),
    jobs: object(body?.jobs),
  };
}

async function endpointState(endpointId, managementKey) {
  const body = await requestJson(
    `${RUNPOD_REST_BASE}/endpoints/${endpointId}`,
    managementKey,
    30000,
  );
  const source = Object.keys(object(body?.data)).length ? object(body.data) : object(body);
  return {
    workers_min: finite(source.workersMin ?? source.workers_min, -1),
    workers_max: finite(source.workersMax ?? source.workers_max, -1),
  };
}

function mergeMaxima(maxima, sample) {
  for (const [key, value] of Object.entries(sample.workers || {})) {
    maxima.workers[key] = Math.max(finite(maxima.workers[key], 0), finite(value, 0));
  }
  for (const [key, value] of Object.entries(sample.jobs || {})) {
    maxima.jobs[key] = Math.max(finite(maxima.jobs[key], 0), finite(value, 0));
  }
}

const queueKey = requireKey("RUNPOD_API_KEY", process.env.RUNPOD_API_KEY);
const managementKey = requireKey(
  "RUNPOD_MANAGEMENT_API_KEY_OR_RUNPOD_API_KEY",
  process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY,
);
const endpointId = await discoverEndpointId(managementKey);
const startedAt = Date.now();
const transitions = [];
const maxima = { workers: {}, jobs: {} };
let healthObservationFailures = 0;
let lastClassification = null;
let childExitCode = null;
let childSignal = null;
let childError = null;
let childSettled = false;

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  phase: "START",
  endpoint_name: ENDPOINT_NAME,
  endpoint_id_printed: false,
  child_certification: CHILD,
  extra_inference_requests: 0,
  runpod_mutation_added_by_diagnostic: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

const child = spawn(process.execPath, [CHILD, "--execute"], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

const childDone = new Promise((resolve) => {
  child.once("error", (error) => {
    childError = text(error?.message, 1000) || "CHILD_SPAWN_FAILED";
    childSettled = true;
    resolve();
  });
  child.once("exit", (code, signal) => {
    childExitCode = Number.isInteger(code) ? code : null;
    childSignal = signal || null;
    childSettled = true;
    resolve();
  });
});

while (!childSettled) {
  try {
    const classified = classifyHealth(await endpointHealth(endpointId, queueKey));
    const sample = {
      at_ms: Date.now() - startedAt,
      ...classified,
    };
    mergeMaxima(maxima, sample);
    if (sample.classification !== lastClassification) {
      lastClassification = sample.classification;
      transitions.push(sample);
      console.log(JSON.stringify({
        contract: CONTRACT,
        phase: "SCHEDULER_TRANSITION",
        ...sample,
        endpoint_id_printed: false,
        secrets_printed: false,
      }));
    }
  } catch {
    healthObservationFailures += 1;
    if (lastClassification !== "HEALTH_UNREADABLE") {
      lastClassification = "HEALTH_UNREADABLE";
      const sample = {
        at_ms: Date.now() - startedAt,
        classification: "HEALTH_UNREADABLE",
        workers: {},
        jobs: {},
      };
      transitions.push(sample);
      console.log(JSON.stringify({
        contract: CONTRACT,
        phase: "SCHEDULER_TRANSITION",
        ...sample,
        endpoint_id_printed: false,
        secrets_printed: false,
      }));
    }
  }
  if (!childSettled) await sleep(POLL_MS);
}

await childDone;

let cleanupVerified = false;
let finalEndpointState = null;
let finalHealth = null;
const cleanupStartedAt = Date.now();
while (Date.now() - cleanupStartedAt <= CLEANUP_TIMEOUT_MS) {
  try {
    finalEndpointState = await endpointState(endpointId, managementKey);
    finalHealth = classifyHealth(await endpointHealth(endpointId, queueKey));
    cleanupVerified =
      finalEndpointState.workers_min === 0 &&
      finalEndpointState.workers_max === 0 &&
      finite(finalHealth?.jobs?.in_queue, 0) === 0 &&
      finite(finalHealth?.jobs?.in_progress, 0) === 0;
    if (cleanupVerified) break;
  } catch {
    healthObservationFailures += 1;
  }
  await sleep(POLL_MS);
}

const summary = {
  success: childExitCode === 0 && !childError && cleanupVerified,
  contract: CONTRACT,
  child_exit_code: childExitCode,
  child_signal: childSignal,
  child_spawn_error: childError,
  endpoint_name: ENDPOINT_NAME,
  endpoint_id_printed: false,
  transitions,
  maxima,
  health_observation_failures: healthObservationFailures,
  final_endpoint_state: finalEndpointState,
  final_health: finalHealth,
  cleanup_verified_0_0_and_empty_queue: cleanupVerified,
  extra_inference_requests: 0,
  runpod_mutation_added_by_diagnostic: false,
  production_deploy_performed: false,
  secrets_printed: false,
};

console.log(JSON.stringify(summary, null, 2));
console.log(`${CONTRACT}=${summary.success ? "PASS" : "FAIL"}`);

if (childError) process.exitCode = 1;
else if (childExitCode !== 0) process.exitCode = childExitCode || 1;
else if (!cleanupVerified) process.exitCode = 2;
