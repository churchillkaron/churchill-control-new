import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_INTELLIGENCE_LEGACY_BENCHMARK_EXPIRY_RECONCILIATION_V1";
const ENV_PATH = ".env.local";
const RUN_SCOPE = "platform_model_benchmark_runs";
const TRAINER_ENDPOINT_NAME = "avantiqo-intelligence-trainer-v1";
const RUNPOD_REST_BASE = "https://rest.runpod.io/v1";
const RUNPOD_QUEUE_BASE = "https://api.runpod.ai/v2";
const REQUIRED_APPROVAL = "YES";

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

function envValue(env, name) {
  return text(process.env[name] || env[name], 12000);
}

async function supabaseJson(baseUrl, key, table, { method = "GET", search = {}, body = null, prefer = null } = {}) {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}/rest/v1/${table}`);
  for (const [name, value] of Object.entries(search)) {
    if (value !== undefined && value !== null) url.searchParams.set(name, String(value));
  }
  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
  };
  if (body !== null) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(url, {
    method,
    headers,
    body: body === null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let parsed = null;
  try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
  if (!response.ok) {
    throw new Error(
      `SUPABASE_RECONCILIATION_HTTP_${response.status}:${redact(parsed?.message || parsed?.details || parsed?.hint || raw)}`,
    );
  }
  return parsed;
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
      if (response.ok) {
        return { ok: true, source: entry.source, status_code: response.status, body: body ?? {} };
      }
      attempts.push({
        source: entry.source,
        status_code: response.status,
        detail: redact(body?.message || body?.error || body?.detail || raw).slice(0, 300),
      });
    } catch (error) {
      attempts.push({
        source: entry.source,
        status_code: null,
        detail: redact(error?.message || error).slice(0, 300),
      });
    }
  }
  return { ok: false, attempts };
}

function providerStatus(result) {
  if (result.ok) {
    const status = text(result.body?.status, 100).toUpperCase();
    return status || "UNKNOWN";
  }
  if (result.attempts.some((attempt) => attempt.status_code === 404)) return "NOT_FOUND";
  throw new Error(`RUNPOD_PROVIDER_STATUS_READ_FAILED:${JSON.stringify(result.attempts)}`);
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

const env = await parseEnv();
if (envValue(env, "AVANTIQO_INTELLIGENCE_BENCHMARK_EXPIRED_RECONCILIATION_APPROVED") !== REQUIRED_APPROVAL) {
  throw new Error("BENCHMARK_EXPIRED_RECONCILIATION_EXPLICIT_APPROVAL_REQUIRED");
}

const expectedRunId = envValue(env, "AVANTIQO_INTELLIGENCE_BENCHMARK_RECOVERY_RUN_ID");
if (!expectedRunId) throw new Error("BENCHMARK_RECOVERY_RUN_ID_REQUIRED");

const supabaseUrl = envValue(env, "NEXT_PUBLIC_SUPABASE_URL");
const supabaseKey = envValue(env, "SUPABASE_SERVICE_ROLE_KEY");
if (!supabaseUrl || !supabaseKey) throw new Error("SUPABASE_ADMIN_ENV_REQUIRED");

let organizationId = envValue(env, "AVANTIQO_INTELLIGENCE_LEARNING_ORGANIZATION_ID");
if (!organizationId) {
  const organizations = await supabaseJson(supabaseUrl, supabaseKey, "organizations", {
    search: {
      select: "id,name,organization_type,status,organization_status",
      name: "eq.Avantiqo Platform",
      organization_type: "eq.enterprise_group",
      status: "eq.active",
      organization_status: "eq.ACTIVE",
      limit: "3",
    },
  });
  if (!Array.isArray(organizations) || organizations.length !== 1) {
    throw new Error(`LEARNING_ORGANIZATION_RESOLUTION_FAILED:${Array.isArray(organizations) ? organizations.length : 0}`);
  }
  organizationId = text(organizations[0]?.id, 200);
}

const rows = await supabaseJson(supabaseUrl, supabaseKey, "intelligence_memories", {
  search: {
    select: "id,subject,metadata,active,updated_at",
    id: `eq.${expectedRunId}`,
    organization_id: `eq.${organizationId}`,
    memory_scope: `eq.${RUN_SCOPE}`,
    active: "eq.true",
    limit: "2",
  },
});
if (!Array.isArray(rows) || rows.length !== 1) {
  throw new Error(`BENCHMARK_RECOVERY_RUN_RESOLUTION_FAILED:${Array.isArray(rows) ? rows.length : 0}`);
}
const run = rows[0];
const metadata = object(run.metadata);
if (text(metadata.status, 100) !== "BENCHMARK_RUNNING") {
  throw new Error(`BENCHMARK_RECOVERY_STATUS_CHANGED:${text(metadata.status, 100) || "UNKNOWN"}`);
}
const baselineJobId = text(metadata.baseline_provider_job_id, 300);
const candidateJobId = text(metadata.candidate_provider_job_id, 300);
if (!baselineJobId || !candidateJobId || text(metadata.paired_provider_job_id, 300)) {
  throw new Error("BENCHMARK_RECOVERY_LEGACY_TWO_JOB_BINDING_REQUIRED");
}

const endpointId = envValue(env, "RUNPOD_AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_ID") ||
  envValue(env, "RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID");
if (!endpointId) throw new Error("BENCHMARK_RECOVERY_ENDPOINT_ID_REQUIRED");

const managementKey = envValue(env, "RUNPOD_MANAGEMENT_API_KEY") || envValue(env, "RUNPOD_API_KEY");
const queueKeys = [
  { source: "RUNPOD_API_KEY", key: envValue(env, "RUNPOD_API_KEY") },
  { source: "RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY", key: envValue(env, "RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY") },
  { source: "RUNPOD_MANAGEMENT_API_KEY", key: envValue(env, "RUNPOD_MANAGEMENT_API_KEY") },
].filter((entry, index, all) => entry.key && all.findIndex((candidate) => candidate.key === entry.key) === index);
if (!managementKey || !queueKeys.length) throw new Error("RUNPOD_READ_ONLY_CREDENTIALS_REQUIRED");

const endpointResult = await runpodJson(
  `${RUNPOD_REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  [{ source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey }],
);
if (!endpointResult.ok) {
  throw new Error(`RUNPOD_ENDPOINT_READ_FAILED:${JSON.stringify(endpointResult.attempts)}`);
}
const endpoint = endpointResult.body;
if (text(endpoint?.name, 300) !== TRAINER_ENDPOINT_NAME) {
  throw new Error(`BENCHMARK_RECOVERY_ENDPOINT_NAME_MISMATCH:${text(endpoint?.name, 300) || "UNKNOWN"}`);
}

const workersMin = finite(endpoint?.workersMin);
const workersMax = finite(endpoint?.workersMax);
const activeWorkerCount = activeWorkers(endpoint).length;
if (workersMin !== 0 || workersMax !== 0 || activeWorkerCount !== 0) {
  throw new Error(
    `BENCHMARK_RECOVERY_ENDPOINT_NOT_RESTING:workersMin=${workersMin}:workersMax=${workersMax}:activeWorkers=${activeWorkerCount}`,
  );
}

const healthResult = await runpodJson(`${RUNPOD_QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, queueKeys);
if (!healthResult.ok) throw new Error(`RUNPOD_HEALTH_READ_FAILED:${JSON.stringify(healthResult.attempts)}`);
const health = healthSummary(healthResult.body);
if (health.jobs.in_queue !== 0 || health.jobs.in_progress !== 0) {
  throw new Error(
    `BENCHMARK_RECOVERY_ENDPOINT_QUEUE_NOT_EMPTY:in_queue=${health.jobs.in_queue}:in_progress=${health.jobs.in_progress}`,
  );
}

const [baselineResult, candidateResult] = await Promise.all([
  runpodJson(
    `${RUNPOD_QUEUE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(baselineJobId)}`,
    queueKeys,
  ),
  runpodJson(
    `${RUNPOD_QUEUE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(candidateJobId)}`,
    queueKeys,
  ),
]);
const baselineProviderStatus = providerStatus(baselineResult);
const candidateProviderStatus = providerStatus(candidateResult);
if (baselineProviderStatus !== "NOT_FOUND" || candidateProviderStatus !== "NOT_FOUND") {
  throw new Error(
    `BENCHMARK_RECOVERY_RESULTS_NOT_BOTH_EXPIRED:baseline=${baselineProviderStatus}:candidate=${candidateProviderStatus}`,
  );
}

const now = new Date().toISOString();
const nextMetadata = {
  ...metadata,
  status: "BENCHMARK_RECOVERY_REQUIRED",
  baseline_status: "completed_result_expired",
  candidate_status: "completed_result_expired",
  baseline_result_missing: true,
  candidate_result_missing: true,
  recovery_required_modes: ["baseline", "candidate"],
  recovery_reason: "RUNPOD_RESULTS_EXPIRED_BEFORE_PERSISTENCE",
  recovery_reconciliation: {
    contract: CONTRACT,
    reconciled_at: now,
    previous_database_status: text(metadata.status, 100),
    previous_baseline_status: text(metadata.baseline_status, 100) || null,
    previous_candidate_status: text(metadata.candidate_status, 100) || null,
    baseline_provider_status: baselineProviderStatus,
    candidate_provider_status: candidateProviderStatus,
    endpoint_id: endpointId,
    endpoint_name: TRAINER_ENDPOINT_NAME,
    workers_min: workersMin,
    workers_max: workersMax,
    active_worker_count: activeWorkerCount,
    health,
    provider_job_submitted: false,
    inference_submitted: false,
    worker_scaling_mutated: false,
    runpod_mutation_performed: false,
    production_model_promoted: false,
  },
  production_model_promotion_effect: "NONE",
  updated_at: now,
};

const updatedRows = await supabaseJson(supabaseUrl, supabaseKey, "intelligence_memories", {
  method: "PATCH",
  search: {
    id: `eq.${run.id}`,
    organization_id: `eq.${organizationId}`,
    memory_scope: `eq.${RUN_SCOPE}`,
    active: "eq.true",
    updated_at: `eq.${run.updated_at}`,
  },
  body: { metadata: nextMetadata, updated_at: now },
  prefer: "return=representation",
});
if (!Array.isArray(updatedRows) || updatedRows.length !== 1) {
  throw new Error("BENCHMARK_RECOVERY_OPTIMISTIC_CONCURRENCY_GUARD_FAILED");
}
const saved = updatedRows[0];
const savedMetadata = object(saved.metadata);
if (
  text(savedMetadata.status, 100) !== "BENCHMARK_RECOVERY_REQUIRED" ||
  savedMetadata.baseline_result_missing !== true ||
  savedMetadata.candidate_result_missing !== true ||
  text(savedMetadata?.recovery_reconciliation?.contract, 200) !== CONTRACT
) {
  throw new Error("BENCHMARK_RECOVERY_WRITE_VERIFICATION_FAILED");
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  event: "AVANTIQO_INTELLIGENCE_LEGACY_BENCHMARK_EXPIRY_RECONCILED",
  benchmark_run: {
    id: text(saved.id, 200),
    subject: text(saved.subject, 300),
    status: text(savedMetadata.status, 100),
    baseline_status: text(savedMetadata.baseline_status, 100),
    candidate_status: text(savedMetadata.candidate_status, 100),
    recovery_required_modes: list(savedMetadata.recovery_required_modes),
    recovery_reason: text(savedMetadata.recovery_reason, 300),
  },
  provider: {
    endpoint_id: endpointId,
    endpoint_name: TRAINER_ENDPOINT_NAME,
    workers_min: workersMin,
    workers_max: workersMax,
    active_worker_count: activeWorkerCount,
    health,
    baseline_provider_status: baselineProviderStatus,
    candidate_provider_status: candidateProviderStatus,
  },
  safety: {
    explicit_reconciliation_approval_observed: true,
    provider_job_submitted: false,
    inference_submitted: false,
    benchmark_output_printed: false,
    worker_scaling_mutated: false,
    runpod_endpoint_mutated: false,
    runpod_template_mutated: false,
    runpod_job_cancelled: false,
    supabase_write_performed: true,
    production_model_promoted: false,
    production_endpoint_mutated: false,
    secrets_printed: false,
  },
}, null, 2));
console.log("AVANTIQO_INTELLIGENCE_LEGACY_BENCHMARK_EXPIRY_RECONCILIATION=PASS");
