const CONTRACT = "AVANTIQO_INTELLIGENCE_SAFE_LEASE_MODELS_PROBE_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const REQUIRED_LANE = "intelligence-deep";
const EXPECTED_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const REQUEST_TIMEOUT_MS = Math.max(60_000, Math.min(600_000, Number.parseInt(process.env.AVANTIQO_INTELLIGENCE_MODELS_PROBE_TIMEOUT_MS || "360000", 10) || 360_000));

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;

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

async function requestJson(url, apiKey, timeoutMs = REQUEST_TIMEOUT_MS) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(timeoutMs),
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

function assertSafeLease() {
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE, 40).toUpperCase() !== "YES") {
    throw new Error(`${CONTRACT}_SAFE_LEASE_ACTIVE_REQUIRED`);
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT, 120) !== SAFE_LEASE_CONTRACT) {
    throw new Error(`${CONTRACT}_SAFE_LEASE_V2_REQUIRED`);
  }
  const lane = text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE, 120);
  if (lane !== REQUIRED_LANE) throw new Error(`${CONTRACT}_LANE_MISMATCH:${lane || "NONE"}`);
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

const lease = assertSafeLease();
const endpointId = required("AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID");
const configuredEndpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID, 300);
if (configuredEndpointId && configuredEndpointId !== endpointId) {
  throw new Error(`${CONTRACT}_ENDPOINT_MISMATCH`);
}
const apiKey = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY || process.env.RUNPOD_API_KEY || process.env.RUNPOD_MANAGEMENT_API_KEY, 8000);
if (!apiKey) throw new Error("RUNPOD_INTELLIGENCE_OR_API_KEY_REQUIRED");
const base = `https://api.runpod.ai/v2/${encodeURIComponent(endpointId)}`;

const beforeHealth = healthSummary(await requestJson(`${base}/health`, apiKey, 20_000));
if (beforeHealth.jobs.in_queue !== 0 || beforeHealth.jobs.in_progress !== 0) {
  throw new Error(`${CONTRACT}_ZERO_JOB_BASELINE_REQUIRED:in_queue=${beforeHealth.jobs.in_queue}:in_progress=${beforeHealth.jobs.in_progress}`);
}

const startedAt = Date.now();
const models = await requestJson(`${base}/openai/v1/models`, apiKey, REQUEST_TIMEOUT_MS);
const latencyMs = Date.now() - startedAt;
const modelIds = Array.isArray(models?.data)
  ? models.data.map((entry) => text(entry?.id, 300)).filter(Boolean)
  : [];
if (!modelIds.includes(EXPECTED_MODEL)) {
  throw new Error(`${CONTRACT}_EXPECTED_MODEL_NOT_SERVED:expected=${EXPECTED_MODEL}:served=${modelIds.join(",") || "NONE"}`);
}

const afterHealth = healthSummary(await requestJson(`${base}/health`, apiKey, 20_000));
if (afterHealth.jobs.in_queue > 0 || afterHealth.jobs.in_progress > 0) {
  throw new Error(`${CONTRACT}_MODELS_ROUTE_CREATED_JOB:in_queue=${afterHealth.jobs.in_queue}:in_progress=${afterHealth.jobs.in_progress}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  lane: lease.lane,
  lease_expires_at: lease.expiresAt,
  endpoint_id_present: Boolean(endpointId),
  expected_model: EXPECTED_MODEL,
  expected_model_served: true,
  served_model_count: modelIds.length,
  models_route_latency_ms: latencyMs,
  health_before: beforeHealth,
  health_after: afterHealth,
  scheduler_container_handler_route_proven: true,
  inference_performed: false,
  generation_submitted: false,
  completion_request_performed: false,
  model_download_requested: false,
  storage_mutation_performed: false,
  direct_endpoint_scaling_performed: false,
  workers_max_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log(`${CONTRACT}=PASS`);
