import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_INTELLIGENCE_FAILED_PAIRED_BENCHMARK_INSPECT_V1";
const ENV_PATH = ".env.local";
const RUN_SCOPE = "platform_model_benchmark_runs";
const TRAINER_ENDPOINT_NAME = "avantiqo-intelligence-trainer-v1";
const RUNPOD_REST_BASE = "https://rest.runpod.io/v1";
const RUNPOD_QUEUE_BASE = "https://api.runpod.ai/v2";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function finite(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function redact(value) {
  return text(value, 8000)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/ghp_[A-Za-z0-9]{20,}/g, "[REDACTED]")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[REDACTED]");
}

async function parseEnv() {
  const source = await readFile(ENV_PATH, "utf8");
  const values = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = rawLine.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) value = value.slice(1, -1);
    values[match[1]] = value;
  }
  return values;
}
function envValue(env, name) {
  return text(process.env[name] || env[name], 12000);
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = { message: raw }; }
  if (!response.ok) {
    const error = new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 1000)}`);
    error.httpStatus = response.status;
    throw error;
  }
  return body ?? {};
}

async function supabaseJson(baseUrl, key, table, search) {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [name, value] of Object.entries(search)) url.searchParams.set(name, String(value));
  return readJson(
    await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    }),
    "FAILED_BENCHMARK_SUPABASE_READ",
  );
}

async function runpodJson(url, key, label) {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = { message: raw }; }
    if (response.ok) return { ok: true, status_code: response.status, body: body ?? {} };
    if (response.status === 404) return { ok: false, status_code: 404, body: body ?? {} };
    throw new Error(`${label}_HTTP_${response.status}:${redact(body?.message || body?.error || raw).slice(0, 1000)}`);
  } catch (error) {
    if (error?.httpStatus === 404) return { ok: false, status_code: 404, body: {} };
    throw error;
  }
}

function activeWorkers(endpoint = {}) {
  const terminal = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return list(endpoint.workers).filter((worker) => {
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus, 100).toUpperCase();
    const desired = text(worker?.desiredStatus ?? worker?.desired_status, 100).toUpperCase();
    if (status && !terminal.has(status)) return true;
    if (desired && !terminal.has(desired)) return true;
    return !status && !desired;
  });
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

function safeFailure(body = {}) {
  const error = body?.error;
  const message =
    (typeof error === "string" ? error : null) ||
    error?.message ||
    error?.error ||
    body?.message ||
    body?.detail ||
    body?.statusMessage ||
    null;
  return {
    provider_status: text(body?.status, 120).toUpperCase() || null,
    error_message: message ? redact(message).slice(0, 4000) : null,
    error_type: text(error?.type || error?.name || body?.error_type, 300) || null,
    delay_ms: finite(body?.delayTime ?? body?.delay_time ?? body?.delayMs, null),
    execution_ms: finite(body?.executionTime ?? body?.execution_time ?? body?.executionMs, null),
    worker_id: text(body?.workerId ?? body?.worker_id, 300) || null,
    output_present: body?.output !== undefined && body?.output !== null,
    output_printed: false,
    top_level_keys: Object.keys(object(body)).sort(),
  };
}

const env = await parseEnv();
const runId = envValue(env, "AVANTIQO_INTELLIGENCE_FAILED_BENCHMARK_RUN_ID");
if (!runId) throw new Error("AVANTIQO_INTELLIGENCE_FAILED_BENCHMARK_RUN_ID_REQUIRED");
const supabaseUrl = envValue(env, "NEXT_PUBLIC_SUPABASE_URL");
const supabaseKey = envValue(env, "SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !supabaseKey) throw new Error("FAILED_BENCHMARK_SUPABASE_ADMIN_ENV_REQUIRED");

let organizationId = envValue(env, "AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID");
if (!organizationId) {
  const organizations = await supabaseJson(supabaseUrl, supabaseKey, "organizations", {
    select: "id",
    name: "eq.Avantiqo Platform",
    organization_type: "eq.enterprise_group",
    status: "eq.active",
    organization_status: "eq.ACTIVE",
    limit: "2",
  });
  if (!Array.isArray(organizations) || organizations.length !== 1) {
    throw new Error(`FAILED_BENCHMARK_ORGANIZATION_RESOLUTION_FAILED:${Array.isArray(organizations) ? organizations.length : 0}`);
  }
  organizationId = text(organizations[0]?.id, 200);
}

const rows = await supabaseJson(supabaseUrl, supabaseKey, "intelligence_memories", {
  select: "id,subject,metadata,updated_at",
  id: `eq.${runId}`,
  organization_id: `eq.${organizationId}`,
  memory_scope: `eq.${RUN_SCOPE}`,
  active: "eq.true",
  limit: "2",
});
if (!Array.isArray(rows) || rows.length !== 1) {
  throw new Error(`FAILED_BENCHMARK_RUN_RESOLUTION_FAILED:${Array.isArray(rows) ? rows.length : 0}`);
}
const run = rows[0];
const metadata = object(run.metadata);
if (text(metadata.status, 100) !== "BENCHMARK_FAILED") {
  throw new Error(`FAILED_BENCHMARK_TERMINAL_STATUS_REQUIRED:${text(metadata.status, 100) || "UNKNOWN"}`);
}
if (Number(metadata.provider_job_count || 0) !== 1 || metadata.paired_single_job !== true) {
  throw new Error("FAILED_BENCHMARK_PAIRED_SINGLE_JOB_BINDING_REQUIRED");
}
const providerJobId = text(metadata.paired_provider_job_id, 300);
if (!providerJobId) throw new Error("FAILED_BENCHMARK_PROVIDER_JOB_ID_REQUIRED");

const endpointId = text(metadata?.safe_lease?.endpoint_id, 300) ||
  envValue(env, "RUNPOD_AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_ID") ||
  envValue(env, "RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID");
if (!endpointId) throw new Error("FAILED_BENCHMARK_ENDPOINT_ID_REQUIRED");
const managementKey = envValue(env, "RUNPOD_MANAGEMENT_API_KEY") || envValue(env, "RUNPOD_API_KEY");
const queueKey = envValue(env, "RUNPOD_API_KEY") || managementKey;
if (!managementKey || !queueKey) throw new Error("FAILED_BENCHMARK_RUNPOD_READ_CREDENTIALS_REQUIRED");

const endpoint = await readJson(
  await fetch(`${RUNPOD_REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, {
    headers: { Authorization: `Bearer ${managementKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }),
  "FAILED_BENCHMARK_ENDPOINT_READ",
);
if (text(endpoint?.name, 300) !== TRAINER_ENDPOINT_NAME) {
  throw new Error(`FAILED_BENCHMARK_ENDPOINT_NAME_MISMATCH:${text(endpoint?.name, 300) || "UNKNOWN"}`);
}
const health = healthSummary(await readJson(
  await fetch(`${RUNPOD_QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
    headers: { Authorization: `Bearer ${queueKey}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  }),
  "FAILED_BENCHMARK_HEALTH_READ",
));

const provider = await runpodJson(
  `${RUNPOD_QUEUE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(providerJobId)}`,
  queueKey,
  "FAILED_BENCHMARK_PROVIDER_STATUS_READ",
);

const providerEvidence = provider.ok
  ? safeFailure(provider.body)
  : {
      provider_status: provider.status_code === 404 ? "NOT_FOUND" : "UNKNOWN",
      error_message: null,
      error_type: null,
      delay_ms: null,
      execution_ms: null,
      worker_id: null,
      output_present: false,
      output_printed: false,
      top_level_keys: [],
    };

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  benchmark_run: {
    id: run.id,
    subject: text(run.subject, 300),
    database_status: text(metadata.status, 100),
    paired_status: text(metadata.paired_status, 100) || null,
    provider_job_count: Number(metadata.provider_job_count || 0),
    provider_job_id: providerJobId,
    safe_lease_present: Boolean(metadata.safe_lease),
    production_model_promotion_effect: text(metadata.production_model_promotion_effect, 100) || null,
  },
  endpoint: {
    id: endpointId,
    name: text(endpoint?.name, 300),
    workers_min: finite(endpoint?.workersMin, null),
    workers_max: finite(endpoint?.workersMax, null),
    active_management_worker_count: activeWorkers(endpoint).length,
    health,
  },
  provider_failure: providerEvidence,
  safety: {
    provider_job_submitted: false,
    inference_submitted: false,
    benchmark_output_printed: false,
    worker_scaling_mutated: false,
    runpod_endpoint_mutated: false,
    runpod_template_mutated: false,
    runpod_job_cancelled: false,
    supabase_write_performed: false,
    production_model_promoted: false,
    production_endpoint_mutated: false,
    secrets_printed: false,
  },
}, null, 2));
console.log("AVANTIQO_INTELLIGENCE_FAILED_PAIRED_BENCHMARK_INSPECT=PASS");
