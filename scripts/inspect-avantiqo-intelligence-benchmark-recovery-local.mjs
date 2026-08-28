import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_INTELLIGENCE_BENCHMARK_RECOVERY_INSPECT_V1";
const ENV_PATH = ".env.local";
const RUN_SCOPE = "platform_model_benchmark_runs";
const TRAINER_ENDPOINT_NAME = "avantiqo-intelligence-trainer-v1";
const ACTIVE = new Set(["BENCHMARK_SUBMITTED", "BENCHMARK_RUNNING"]);
const TERMINAL = new Set(["BENCHMARK_COMPLETED", "BENCHMARK_FAILED", "BENCHMARK_STALE"]);
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
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function redact(value) {
  return text(value, 2000)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}

async function parseEnv() {
  const source = await readFile(ENV_PATH, "utf8");
  const parsed = {};
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
    ) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') {
        value = value
          .replace(/\\n/g, "\n")
          .replace(/\\r/g, "\r")
          .replace(/\\t/g, "\t")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, "\\");
      }
    }
    parsed[match[1]] = value;
  }
  return parsed;
}

async function supabaseRows(baseUrl, key, table, search = {}) {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [name, value] of Object.entries(search)) {
    if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
  }
  const response = await fetch(url, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`SUPABASE_READ_ONLY_HTTP_${response.status}:${redact(body?.message || body?.details || body?.hint || raw)}`);
  }
  return Array.isArray(body) ? body : [];
}

async function runpodJson(url, keys) {
  const attempts = [];
  for (const entry of keys) {
    if (!entry?.key) continue;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${entry.key}`, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      const raw = await response.text();
      let body = null;
      try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
      if (response.ok) return { ok: true, source: entry.source, status_code: response.status, body: body ?? {} };
      attempts.push({ source: entry.source, status_code: response.status, detail: redact(body?.message || body?.error || body?.detail || raw).slice(0, 300) });
    } catch (error) {
      attempts.push({ source: entry.source, status_code: null, detail: redact(error?.message || error).slice(0, 300) });
    }
  }
  return { ok: false, attempts };
}

function normalizedProviderStatus(body = {}, statusCode = 200) {
  if (statusCode === 404) return "NOT_FOUND";
  const status = text(body?.status, 100).toUpperCase();
  if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(status)) return "COMPLETED";
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(status)) return status || "FAILED";
  if (["IN_QUEUE", "QUEUED", "PENDING"].includes(status)) return "IN_QUEUE";
  if (["IN_PROGRESS", "RUNNING", "PROCESSING"].includes(status)) return "IN_PROGRESS";
  return status || "UNKNOWN";
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

function recoveryDecision({ dbStatus, providerStatus, endpointFound, workersMin, workersMax, health, activeWorkerCount }) {
  if (TERMINAL.has(dbStatus)) return `DATABASE_ALREADY_TERMINAL:${dbStatus}`;
  if (providerStatus === "COMPLETED") return "EXISTING_JOB_COMPLETED_RECONCILE_RESULT_NO_RESUBMIT";
  if (["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"].includes(providerStatus)) {
    return `EXISTING_JOB_TERMINAL_FAILURE_RECONCILE_NO_RESUBMIT:${providerStatus}`;
  }
  if (providerStatus === "NOT_FOUND" || !endpointFound) return "EXISTING_JOB_OR_ENDPOINT_NOT_FOUND_RECONCILIATION_REQUIRED_NO_RESUBMIT";
  if (providerStatus === "IN_PROGRESS") return "EXISTING_JOB_ACTIVE_DO_NOT_RESUBMIT_MONITOR_ONLY";
  if (providerStatus === "IN_QUEUE") {
    if (workersMin === 0 && workersMax === 0 && activeWorkerCount === 0 && health.jobs.in_progress === 0) {
      return "EXISTING_JOB_QUEUED_AT_RESTING_0_0_REQUIRES_GOVERNED_RESUME_PLAN_NO_RESUBMIT";
    }
    return "EXISTING_JOB_QUEUED_WITH_CAPACITY_OR_WORKER_DO_NOT_RESUBMIT_MONITOR_ONLY";
  }
  return "EXISTING_JOB_STATE_UNCLEAR_NO_RESUBMIT";
}

const env = await parseEnv();
const supabaseUrl = text(env.NEXT_PUBLIC_SUPABASE_URL, 1200);
const supabaseKey = text(env.SUPABASE_SERVICE_ROLE_KEY, 12000);
if (!supabaseUrl || !supabaseKey) throw new Error("SUPABASE_ADMIN_ENV_REQUIRED");

let organizationId = text(env.AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID, 200);
if (!organizationId) {
  const organizations = await supabaseRows(supabaseUrl, supabaseKey, "organizations", {
    select: "id,name,organization_type,status,organization_status",
    name: "eq.Avantiqo Platform",
    organization_type: "eq.enterprise_group",
    status: "eq.active",
    organization_status: "eq.ACTIVE",
    limit: "3",
  });
  if (organizations.length !== 1) throw new Error(`LEARNING_ORGANIZATION_RESOLUTION_FAILED:${organizations.length}`);
  organizationId = text(organizations[0]?.id, 200);
}

const runs = await supabaseRows(supabaseUrl, supabaseKey, "intelligence_memories", {
  select: "id,subject,metadata,active,updated_at",
  organization_id: `eq.${organizationId}`,
  memory_scope: `eq.${RUN_SCOPE}`,
  active: "eq.true",
  order: "updated_at.desc",
  limit: "20",
});
const activeRuns = runs.filter((row) => ACTIVE.has(text(object(row.metadata).status, 100)));
if (activeRuns.length !== 1) throw new Error(`BENCHMARK_ACTIVE_RUN_RESOLUTION_FAILED:${activeRuns.length}`);
const run = activeRuns[0];
const metadata = object(run.metadata);
const providerJobId = text(metadata.paired_provider_job_id, 300);
if (!providerJobId) throw new Error("BENCHMARK_PAIRED_PROVIDER_JOB_ID_REQUIRED");
const submittedEndpointId = text(metadata?.safe_lease?.endpoint_id, 240);
const configuredEndpointId = text(env.RUNPOD_AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_ID || env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID, 240);
const endpointId = submittedEndpointId || configuredEndpointId;
if (!endpointId) throw new Error("BENCHMARK_ENDPOINT_ID_REQUIRED");

const managementKey = text(env.RUNPOD_MANAGEMENT_API_KEY || env.RUNPOD_API_KEY, 12000);
const queueKeys = [
  { source: "RUNPOD_API_KEY", key: text(env.RUNPOD_API_KEY, 12000) },
  { source: "RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY", key: text(env.RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY, 12000) },
  { source: "RUNPOD_MANAGEMENT_API_KEY", key: text(env.RUNPOD_MANAGEMENT_API_KEY, 12000) },
].filter((entry, index, all) => entry.key && all.findIndex((candidate) => candidate.key === entry.key) === index);
if (!queueKeys.length) throw new Error("RUNPOD_READ_ONLY_QUEUE_KEY_REQUIRED");

let endpoint = null;
let endpointFound = false;
if (managementKey) {
  const endpointResult = await runpodJson(`${RUNPOD_REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`, [
    { source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey },
  ]);
  if (endpointResult.ok) {
    endpoint = endpointResult.body;
    endpointFound = true;
  } else if (!endpointResult.attempts.some((attempt) => attempt.status_code === 404)) {
    throw new Error(`RUNPOD_ENDPOINT_READ_FAILED:${JSON.stringify(endpointResult.attempts)}`);
  }
}

const providerResult = await runpodJson(
  `${RUNPOD_QUEUE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(providerJobId)}`,
  queueKeys,
);
let providerStatus = "UNKNOWN";
let providerCredentialSource = null;
let providerTiming = {};
if (providerResult.ok) {
  providerStatus = normalizedProviderStatus(providerResult.body, providerResult.status_code);
  providerCredentialSource = providerResult.source;
  providerTiming = {
    delay_ms: finite(providerResult.body?.delayTime ?? providerResult.body?.delay_time),
    execution_ms: finite(providerResult.body?.executionTime ?? providerResult.body?.execution_time),
  };
} else if (providerResult.attempts.some((attempt) => attempt.status_code === 404)) {
  providerStatus = "NOT_FOUND";
} else {
  throw new Error(`RUNPOD_PROVIDER_STATUS_READ_FAILED:${JSON.stringify(providerResult.attempts)}`);
}

let health = { jobs: { in_queue: 0, in_progress: 0 }, workers: { idle: 0, initializing: 0, ready: 0, running: 0, throttled: 0, unhealthy: 0 } };
let healthCredentialSource = null;
const healthResult = await runpodJson(`${RUNPOD_QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, queueKeys);
if (healthResult.ok) {
  health = healthSummary(healthResult.body);
  healthCredentialSource = healthResult.source;
}

const workersMin = finite(endpoint?.workersMin);
const workersMax = finite(endpoint?.workersMax);
const activeWorkerCount = activeWorkers(endpoint || {}).length;
const dbStatus = text(metadata.status, 100);
const decision = recoveryDecision({ dbStatus, providerStatus, endpointFound, workersMin, workersMax, health, activeWorkerCount });

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  benchmark_run: {
    id: text(run.id, 200),
    subject: text(run.subject, 300),
    database_status: dbStatus,
    updated_at: run.updated_at || null,
    submitted_at: metadata.submitted_at || null,
    provider_job_id: providerJobId,
    provider_job_count: finite(metadata.provider_job_count, 1),
    adapter_artifact_reference: text(metadata.adapter_artifact_reference, 1200) || null,
    submitted_safe_lease_endpoint_id: submittedEndpointId || null,
    submitted_safe_lease_lane: text(metadata?.safe_lease?.lease_lane, 120) || null,
    submitted_safe_lease_expires_at: metadata?.safe_lease?.expires_at || null,
  },
  provider: {
    endpoint_id: endpointId,
    endpoint_found: endpointFound,
    endpoint_name: text(endpoint?.name, 300) || null,
    endpoint_name_matches_trainer: text(endpoint?.name, 300) === TRAINER_ENDPOINT_NAME,
    workers_min: workersMin,
    workers_max: workersMax,
    active_worker_count: activeWorkerCount,
    health,
    provider_status: providerStatus,
    provider_status_credential_source: providerCredentialSource,
    health_credential_source: healthCredentialSource,
    timing: providerTiming,
  },
  recovery_decision: decision,
  safety: {
    provider_job_submitted: false,
    inference_submitted: false,
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
console.log(`AVANTIQO_INTELLIGENCE_BENCHMARK_RECOVERY_DECISION=${decision}`);
console.log("AVANTIQO_INTELLIGENCE_BENCHMARK_RECOVERY_INSPECT=PASS");
