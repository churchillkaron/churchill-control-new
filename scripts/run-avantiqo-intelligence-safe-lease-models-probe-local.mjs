const CONTRACT = "AVANTIQO_INTELLIGENCE_SAFE_LEASE_MODELS_PROBE_V2";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const PROFILES = Object.freeze({
  deep: Object.freeze({
    leaseLane: "intelligence-deep",
    expectedModel: "Qwen/Qwen3-30B-A3B-Thinking-2507",
    endpointEnv: "RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID",
    queueKeyEnvs: [
      "RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY",
      "RUNPOD_API_KEY",
      "RUNPOD_MANAGEMENT_API_KEY",
    ],
  }),
  fast: Object.freeze({
    leaseLane: "intelligence-fast",
    expectedModel: "Qwen/Qwen3-30B-A3B-Instruct-2507",
    endpointEnv: "RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID",
    queueKeyEnvs: [
      "RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY",
      "RUNPOD_API_KEY",
      "RUNPOD_MANAGEMENT_API_KEY",
    ],
  }),
});
const REQUEST_TIMEOUT_MS = Math.max(
  60_000,
  Math.min(
    600_000,
    Number.parseInt(process.env.AVANTIQO_INTELLIGENCE_MODELS_PROBE_TIMEOUT_MS || "360000", 10) || 360_000,
  ),
);
const POLL_MS = Math.max(
  1_000,
  Math.min(
    15_000,
    Number.parseInt(process.env.AVANTIQO_INTELLIGENCE_MODELS_PROBE_POLL_MS || "3000", 10) || 3000,
  ),
);
const TERMINAL_SUCCESS = new Set(["COMPLETED"]);
const TERMINAL_FAILURE = new Set(["FAILED", "CANCELLED", "TIMED_OUT", "TIMEDOUT"]);

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function required(name) {
  const value = text(process.env[name], 8000);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function redact(value) {
  return text(value, 1600)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

async function requestJson(url, apiKey, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeoutMs || REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
  if (!response.ok) {
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(parsed?.error?.message || parsed?.message || raw)}`);
  }
  if (!parsed || typeof parsed !== "object") throw new Error(`${CONTRACT}_INVALID_JSON_RESPONSE`);
  return parsed;
}

function probeProfile() {
  const key = text(process.env.AVANTIQO_INTELLIGENCE_MODELS_PROBE_LANE, 40).toLowerCase() || "deep";
  const profile = PROFILES[key];
  if (!profile) throw new Error(`${CONTRACT}_PROBE_LANE_INVALID:${key || "NONE"}`);
  return { key, ...profile };
}

function assertSafeLease(profile) {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE, 40).toUpperCase() !== "YES") {
    throw new Error(`${CONTRACT}_SAFE_LEASE_ACTIVE_REQUIRED`);
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== SAFE_LEASE_CONTRACT) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_V2_REQUIRED`);
  }
  const lane = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120);
  if (lane !== profile.leaseLane) {
    throw new Error(`${CONTRACT}_LANE_MISMATCH:${lane || "NONE"}:expected=${profile.leaseLane}`);
  }
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT, 160));
  if (!Number.isFinite(expiresAt) || expiresAt - Date.now() < 120_000) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_EXPIRY_INSUFFICIENT`);
  }
  return { lane, expiresAt: new Date(expiresAt).toISOString() };
}

function healthSummary(body = {}) {
  const jobs = body?.jobs || {};
  const workers = body?.workers || {};
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

function workerVisible(health = {}) {
  return [
    health?.workers?.idle,
    health?.workers?.initializing,
    health?.workers?.ready,
    health?.workers?.running,
  ].some((value) => finite(value, 0) > 0) || finite(health?.jobs?.in_progress, 0) > 0;
}

function collectModelIds(value, found = new Set(), depth = 0) {
  if (depth > 8 || value == null) return found;
  if (Array.isArray(value)) {
    for (const entry of value) collectModelIds(entry, found, depth + 1);
    return found;
  }
  if (typeof value !== "object") return found;
  if (Array.isArray(value.data)) {
    for (const entry of value.data) {
      const id = text(entry?.id, 300);
      if (id) found.add(id);
    }
  }
  for (const entry of Object.values(value)) collectModelIds(entry, found, depth + 1);
  return found;
}

async function waitForJob(base, apiKey, jobId) {
  const deadline = Date.now() + REQUEST_TIMEOUT_MS;
  let latest = null;
  let latestHealth = null;
  let workerObserved = false;
  let healthObservationFailures = 0;
  while (Date.now() < deadline) {
    const [statusResult, healthResult] = await Promise.allSettled([
      requestJson(`${base}/status/${encodeURIComponent(jobId)}`, apiKey, { timeoutMs: 20_000 }),
      requestJson(`${base}/health`, apiKey, { timeoutMs: 20_000 }),
    ]);
    if (statusResult.status === "rejected") throw statusResult.reason;
    latest = statusResult.value;
    if (healthResult.status === "fulfilled") {
      latestHealth = healthSummary(healthResult.value);
      if (workerVisible(latestHealth)) workerObserved = true;
    } else {
      healthObservationFailures += 1;
    }
    if (text(latest?.workerId ?? latest?.worker_id, 300)) workerObserved = true;
    const status = text(latest?.status, 80).toUpperCase();
    if (TERMINAL_SUCCESS.has(status)) {
      return { job: latest, workerObserved, latestHealth, healthObservationFailures };
    }
    if (TERMINAL_FAILURE.has(status)) {
      throw new Error(`${CONTRACT}_SCHEDULER_PROBE_JOB_${status}:${redact(latest?.error || latest?.output || "NO_DETAIL")}`);
    }
    await sleep(POLL_MS);
  }
  throw new Error(`${CONTRACT}_SCHEDULER_PROBE_TIMEOUT:${text(latest?.status, 80) || "UNKNOWN"}`);
}

const profile = probeProfile();
const lease = assertSafeLease(profile);
const endpointId = required("AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID");
const configuredEndpointId = text(process.env[profile.endpointEnv], 300);
if (configuredEndpointId && configuredEndpointId !== endpointId) {
  throw new Error(`${CONTRACT}_ENDPOINT_MISMATCH:${profile.key}`);
}
const apiKey = profile.queueKeyEnvs
  .map((name) => text(process.env[name], 8000))
  .find(Boolean);
if (!apiKey) throw new Error(`${CONTRACT}_QUEUE_CREDENTIAL_REQUIRED:${profile.key}`);
const base = `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}`;

const beforeHealth = healthSummary(await requestJson(`${base}/health`, apiKey, { timeoutMs: 20_000 }));
if (beforeHealth.jobs.in_queue !== 0 || beforeHealth.jobs.in_progress !== 0) {
  throw new Error(`${CONTRACT}_ZERO_JOB_BASELINE_REQUIRED:in_queue=${beforeHealth.jobs.in_queue}:in_progress=${beforeHealth.jobs.in_progress}`);
}

const startedAt = Date.now();
const submitted = await requestJson(`${base}/run`, apiKey, {
  method: "POST",
  timeoutMs: 30_000,
  body: {
    input: {
      openai_route: "/v1/models",
    },
  },
});
const jobId = text(submitted?.id, 500);
if (!jobId) throw new Error(`${CONTRACT}_SCHEDULER_PROBE_JOB_ID_REQUIRED`);

const completed = await waitForJob(base, apiKey, jobId);
const latencyMs = Date.now() - startedAt;
const status = text(completed.job?.status, 80).toUpperCase();
if (status !== "COMPLETED") throw new Error(`${CONTRACT}_SCHEDULER_PROBE_NOT_COMPLETED:${status || "UNKNOWN"}`);

const modelIds = [...collectModelIds(completed.job?.output)];
if (!modelIds.includes(profile.expectedModel)) {
  throw new Error(`${CONTRACT}_EXPECTED_MODEL_NOT_SERVED:expected=${profile.expectedModel}:served=${modelIds.join(",") || "NONE"}`);
}

const afterHealth = healthSummary(await requestJson(`${base}/health`, apiKey, { timeoutMs: 20_000 }));
if (afterHealth.jobs.in_queue > 0 || afterHealth.jobs.in_progress > 0) {
  throw new Error(`${CONTRACT}_SCHEDULER_PROBE_QUEUE_NOT_DRAINED:in_queue=${afterHealth.jobs.in_queue}:in_progress=${afterHealth.jobs.in_progress}`);
}
const workerObserved = completed.workerObserved || workerVisible(afterHealth);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  probe_lane: profile.key,
  lane: lease.lane,
  lease_expires_at: lease.expiresAt,
  endpoint_id_present: Boolean(endpointId),
  expected_model: profile.expectedModel,
  expected_model_served: true,
  served_model_count: modelIds.length,
  scheduler_probe_transport: "RUNPOD_QUEUE_OPENAI_ROUTE_GET_V1_MODELS",
  scheduler_probe_job_submitted: true,
  scheduler_probe_job_completed: true,
  scheduler_probe_worker_observed: workerObserved,
  scheduler_worker_execution_proven: true,
  worker_execution_proof_source: workerObserved
    ? "RUNPOD_HEALTH_OR_JOB_WORKER_ID_AND_COMPLETED_MODEL_RESPONSE"
    : "COMPLETED_EXACT_MODEL_RESPONSE",
  scheduler_probe_health_observation_failures: completed.healthObservationFailures,
  scheduler_probe_latency_ms: latencyMs,
  health_before: beforeHealth,
  health_after: afterHealth,
  scheduler_container_handler_route_proven: true,
  inference_performed: false,
  generation_submitted: false,
  completion_request_performed: false,
  token_generation_performed: false,
  model_download_requested: false,
  storage_mutation_performed: false,
  direct_endpoint_scaling_performed: false,
  workers_max_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
