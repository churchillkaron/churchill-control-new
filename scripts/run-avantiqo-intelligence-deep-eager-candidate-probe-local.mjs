const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_EAGER_CANDIDATE_PROBE_V2";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const SAFE_LEASE_LANE = "intelligence-deep-eager-candidate";
const DEEP_NAME = "avantiqo-intelligence-v1";
const CANDIDATE_NAME = "avantiqo-intelligence-deep-eager-candidate-v1";
const MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const OBSERVE_MS = 240_000;
const POLL_MS = 5_000;

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => (Array.isArray(value) ? value : []);
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const upper = (value) => text(value, 120).toUpperCase();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function redact(value) {
  return String(value ?? "")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/([?&](?:token|key|api_key|apikey|sig|signature)=)[^&\s]+/gi, "$1[REDACTED]")
    .slice(0, 1200);
}

function requireLease() {
  if (upper(process.env.AVANTIQO_INTELLIGENCE_DEEP_EAGER_CANDIDATE_PROBE_APPROVED) !== "YES") {
    throw new Error("AVANTIQO_INTELLIGENCE_DEEP_EAGER_CANDIDATE_PROBE_APPROVED=YES_REQUIRED");
  }
  if (upper(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE) !== "YES") {
    throw new Error(`${CONTRACT}_SAFE_LEASE_ACTIVE_REQUIRED`);
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== SAFE_LEASE_CONTRACT) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_CONTRACT_MISMATCH`);
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120) !== SAFE_LEASE_LANE) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_LANE_MISMATCH`);
  }
  const endpointId = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID, 300);
  if (!endpointId) throw new Error(`${CONTRACT}_SAFE_LEASE_ENDPOINT_ID_REQUIRED`);
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT, 120));
  if (!Number.isFinite(expiresAt) || expiresAt - Date.now() < 260_000) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_REMAINING_TIME_INSUFFICIENT`);
  }
  return endpointId;
}

async function requestJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(options.timeoutMs || 20_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${CONTRACT}_HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  }
  return body ?? {};
}

function rows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) if (Array.isArray(value[key])) return value[key];
  return [];
}

function resolveOne(items, name, code) {
  const matches = rows(items).filter((entry) => text(entry?.name, 300) === name);
  if (matches.length !== 1) throw new Error(`${code}:matches=${matches.length}`);
  return matches[0];
}

function templateId(endpoint = {}) {
  return text(endpoint?.templateId || endpoint?.template?.id, 300);
}

function resolveBoundTemplate(endpoint, templates, code) {
  const id = templateId(endpoint);
  if (!id) throw new Error(`${code}_TEMPLATE_ID_REQUIRED`);
  const matches = rows(templates).filter((entry) => text(entry?.id, 300) === id);
  if (matches.length !== 1) throw new Error(`${code}_AUTHORITATIVE_TEMPLATE_RESOLUTION_FAILED:id=${id}:matches=${matches.length}`);
  return matches[0];
}

function envMap(value) {
  const pairs = Array.isArray(value)
    ? value.map((entry) => [text(entry?.key || entry?.name, 300), String(entry?.value ?? "")])
    : Object.entries(object(value)).map(([key, entryValue]) => [text(key, 300), String(entryValue ?? "")]);
  return Object.fromEntries(pairs.filter(([key]) => key));
}

function healthSummary(raw = {}) {
  const jobs = object(raw?.jobs);
  const workers = object(raw?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress),
    },
    workers: {
      initializing: finite(workers.initializing),
      running: finite(workers.running),
      idle: finite(workers.idle),
      ready: finite(workers.ready),
      unhealthy: finite(workers.unhealthy),
    },
  };
}

function statusName(raw = {}) {
  return upper(raw?.status || raw?.state);
}

const endpointId = requireLease();
const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY, 2000);
const runtimeKey = text(process.env.RUNPOD_API_KEY || managementKey, 2000);
if (!managementKey || !runtimeKey) throw new Error("RUNPOD_MANAGEMENT_OR_API_KEY_REQUIRED");

const [endpointsRaw, templatesRaw] = await Promise.all([
  requestJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey),
  requestJson(`${REST_BASE}/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false`, managementKey),
]);
const endpoints = rows(endpointsRaw, ["endpoints", "serverlessEndpoints"]);
const templates = rows(templatesRaw, ["templates"]);
const candidate = resolveOne(endpoints, CANDIDATE_NAME, `${CONTRACT}_CANDIDATE_RESOLUTION_FAILED`);
const deep = resolveOne(endpoints, DEEP_NAME, `${CONTRACT}_DEEP_RESOLUTION_FAILED`);
if (text(candidate?.id, 300) !== endpointId) throw new Error(`${CONTRACT}_LEASE_ENDPOINT_MISMATCH`);
if (finite(candidate?.workersMin, -1) !== 0 || finite(candidate?.workersMax, -1) !== 1) {
  throw new Error(`${CONTRACT}_CANDIDATE_LEASE_CAPACITY_INVALID`);
}
if (finite(deep?.workersMin, -1) !== 0 || finite(deep?.workersMax, -1) !== 0) {
  throw new Error(`${CONTRACT}_PRODUCTION_DEEP_MUST_REMAIN_PARKED_0_0`);
}

const candidateTemplate = resolveBoundTemplate(candidate, templates, `${CONTRACT}_CANDIDATE`);
const deepTemplate = resolveBoundTemplate(deep, templates, `${CONTRACT}_DEEP`);
const candidateEnv = envMap(candidateTemplate?.env);
const deepEnv = envMap(deepTemplate?.env);
if (text(candidateEnv.ENFORCE_EAGER, 40).toLowerCase() !== "true") {
  throw new Error(`${CONTRACT}_CANDIDATE_ENFORCE_EAGER_TRUE_REQUIRED`);
}
if (text(deepEnv.ENFORCE_EAGER, 40).toLowerCase() === "true") {
  throw new Error(`${CONTRACT}_PRODUCTION_DEEP_ALREADY_EAGER_UNEXPECTED`);
}
if (!text(candidateTemplate?.imageName, 1000) || text(candidateTemplate?.imageName, 1000) !== text(deepTemplate?.imageName, 1000)) {
  throw new Error(`${CONTRACT}_IMAGE_PARITY_REQUIRED`);
}
if (text(candidateEnv.MODEL_NAME, 500) !== MODEL || text(deepEnv.MODEL_NAME, 500) !== MODEL) {
  throw new Error(`${CONTRACT}_MODEL_PARITY_REQUIRED`);
}

const before = healthSummary(await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, runtimeKey));
if (before.jobs.in_queue !== 0 || before.jobs.in_progress !== 0) {
  throw new Error(`${CONTRACT}_ZERO_QUEUE_REQUIRED`);
}

console.log(JSON.stringify({
  contract: CONTRACT,
  phase: "START",
  candidate_name: CANDIDATE_NAME,
  enforce_eager: true,
  same_image_as_production_deep: true,
  same_model_as_production_deep: true,
  authoritative_template_collection_verified: true,
  production_deep_parked_0_0: true,
  max_observation_ms: OBSERVE_MS,
  generation_submitted: false,
  production_deep_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

const startedAt = Date.now();
const submitted = await requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/run`, runtimeKey, {
  method: "POST",
  body: {
    input: {
      route: "/v1/chat/completions",
      method: "POST",
      body: {
        model: MODEL,
        messages: [{ role: "user", content: "Reply only READY." }],
        temperature: 0.6,
        top_p: 0.95,
        max_tokens: 8,
      },
    },
  },
});
const jobId = text(submitted?.id, 300);
if (!jobId) throw new Error(`${CONTRACT}_JOB_ID_REQUIRED`);

let firstWorkerMs = null;
let firstProgressMs = null;
let completedMs = null;
let latestHealth = before;
let finalStatus = "IN_QUEUE";
let finalPayload = null;

while (Date.now() - startedAt <= OBSERVE_MS) {
  const elapsed = Date.now() - startedAt;
  const [healthRaw, statusRaw] = await Promise.all([
    requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, runtimeKey).catch(() => ({})),
    requestJson(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`, runtimeKey).catch(() => ({})),
  ]);
  latestHealth = healthSummary(healthRaw);
  finalPayload = statusRaw;
  finalStatus = statusName(statusRaw) || finalStatus;
  const workerCount = latestHealth.workers.initializing + latestHealth.workers.running + latestHealth.workers.idle + latestHealth.workers.ready;
  if (firstWorkerMs === null && workerCount > 0) firstWorkerMs = elapsed;
  if (firstProgressMs === null && latestHealth.jobs.in_progress > 0) firstProgressMs = elapsed;
  if (finalStatus === "COMPLETED") {
    completedMs = elapsed;
    break;
  }
  if (["FAILED", "TIMED_OUT", "CANCELLED", "CANCELED"].includes(finalStatus)) break;
  console.log(`AVANTIQO_DEEP_EAGER_CANDIDATE_PROGRESS=${JSON.stringify({
    elapsed_seconds: Math.floor(elapsed / 1000),
    status: finalStatus,
    health: latestHealth,
    first_worker_ms: firstWorkerMs,
    first_progress_ms: firstProgressMs,
  })}`);
  await sleep(POLL_MS);
}

let diagnosis = "EAGER_COLDSTART_TIMEOUT_BEFORE_HANDLER_READY";
if (finalStatus === "COMPLETED" && completedMs !== null) diagnosis = "EAGER_COLDSTART_PASS";
else if (firstProgressMs !== null) diagnosis = "EAGER_JOB_STARTED_BUT_NOT_COMPLETED";
else if (firstWorkerMs !== null) diagnosis = "EAGER_WORKER_STARTED_BUT_HANDLER_NOT_READY";
else diagnosis = "EAGER_WORKER_NOT_VISIBLE";

const success = diagnosis === "EAGER_COLDSTART_PASS";
console.log(JSON.stringify({
  success,
  contract: CONTRACT,
  diagnosis,
  final_status: finalStatus,
  elapsed_ms: Date.now() - startedAt,
  first_worker_ms: firstWorkerMs,
  first_progress_ms: firstProgressMs,
  completed_ms: completedMs,
  latest_health: latestHealth,
  runpod_delay_ms: finite(finalPayload?.delayTime, null),
  runpod_execution_ms: finite(finalPayload?.executionTime, null),
  enforce_eager: true,
  authoritative_template_collection_verified: true,
  provider_timeout_reference_ms: 300000,
  completed_within_provider_timeout: completedMs !== null && completedMs < 300000,
  generation_submitted: true,
  generation_scope: "DIAGNOSTIC_8_TOKEN_NATIVE_RUN_ONLY",
  production_deep_mutation_performed: false,
  candidate_template_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`AVANTIQO_INTELLIGENCE_DEEP_EAGER_CANDIDATE_PROBE=${diagnosis}`);
if (!success) process.exit(3);
