import { readFile } from "node:fs/promises";

const CONTRACT = "AVANTIQO_INTELLIGENCE_BENCHMARK_RECOVERY_INSPECT_V2";
const ENV_PATH = ".env.local";
const RUN_SCOPE = "platform_model_benchmark_runs";
const TRAINER_ENDPOINT_NAME = "avantiqo-intelligence-trainer-v1";
const ACTIVE = new Set(["BENCHMARK_SUBMITTED", "BENCHMARK_RUNNING"]);
const TERMINAL = new Set(["BENCHMARK_COMPLETED", "BENCHMARK_FAILED", "BENCHMARK_STALE", "BENCHMARK_RECOVERY_REQUIRED"]);
const FAILED_PROVIDER_STATES = new Set(["FAILED", "ERROR", "CANCELLED", "CANCELED", "TIMED_OUT"]);
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
      if (response.ok) {
        return {
          ok: true,
          source: entry.source,
          status_code: response.status,
          body: body ?? {},
        };
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

function normalizedProviderStatus(body = {}) {
  const status = text(body?.status, 100).toUpperCase();
  if (["COMPLETED", "COMPLETE", "SUCCEEDED", "SUCCESS", "DONE"].includes(status)) return "COMPLETED";
  if (FAILED_PROVIDER_STATES.has(status)) return status || "FAILED";
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

function resultSummary(result) {
  if (!result.ok) {
    if (result.attempts.some((attempt) => attempt.status_code === 404)) {
      return {
        provider_status: "NOT_FOUND",
        result_available: false,
        credential_source: null,
        timing: { delay_ms: null, execution_ms: null },
      };
    }
    throw new Error(`RUNPOD_PROVIDER_STATUS_READ_FAILED:${JSON.stringify(result.attempts)}`);
  }
  return {
    provider_status: normalizedProviderStatus(result.body),
    result_available: result.body?.output !== undefined && result.body?.output !== null,
    credential_source: result.source,
    timing: {
      delay_ms: finite(result.body?.delayTime ?? result.body?.delay_time),
      execution_ms: finite(result.body?.executionTime ?? result.body?.execution_time),
    },
  };
}

async function inspectProviderJob(endpointId, jobId, queueKeys) {
  if (!jobId) return null;
  const result = await runpodJson(
    `${RUNPOD_QUEUE_BASE}/${encodeURIComponent(endpointId)}/status/${encodeURIComponent(jobId)}`,
    queueKeys,
  );
  return { job_id: jobId, ...resultSummary(result) };
}

function pairedDecision({ dbStatus, paired, endpointFound, workersMin, workersMax, health, activeWorkerCount }) {
  if (TERMINAL.has(dbStatus)) return `DATABASE_ALREADY_TERMINAL:${dbStatus}`;
  const status = paired?.provider_status || "UNKNOWN";
  if (status === "COMPLETED") return "PAIRED_JOB_COMPLETED_RECONCILE_RESULT_NO_RESUBMIT";
  if (FAILED_PROVIDER_STATES.has(status)) return `PAIRED_JOB_TERMINAL_FAILURE_RECONCILE_NO_RESUBMIT:${status}`;
  if (status === "NOT_FOUND" || !endpointFound) return "PAIRED_JOB_OR_ENDPOINT_NOT_FOUND_RECONCILIATION_REQUIRED_NO_RESUBMIT";
  if (status === "IN_PROGRESS") return "PAIRED_JOB_ACTIVE_DO_NOT_RESUBMIT_MONITOR_ONLY";
  if (status === "IN_QUEUE") {
    if (workersMin === 0 && workersMax === 0 && activeWorkerCount === 0 && health.jobs.in_progress === 0) {
      return "PAIRED_JOB_QUEUED_AT_RESTING_0_0_REQUIRES_GOVERNED_RESUME_PLAN_NO_RESUBMIT";
    }
    return "PAIRED_JOB_QUEUED_WITH_CAPACITY_OR_WORKER_DO_NOT_RESUBMIT_MONITOR_ONLY";
  }
  return "PAIRED_JOB_STATE_UNCLEAR_NO_RESUBMIT";
}

function legacyDecision({ dbStatus, baseline, candidate, endpointFound, workersMin, workersMax, health, activeWorkerCount }) {
  if (TERMINAL.has(dbStatus)) return `DATABASE_ALREADY_TERMINAL:${dbStatus}`;
  const baselineStatus = baseline?.provider_status || "UNKNOWN";
  const candidateStatus = candidate?.provider_status || "UNKNOWN";

  if (baselineStatus === "COMPLETED" && candidateStatus === "COMPLETED") {
    return "LEGACY_TWO_JOB_BOTH_COMPLETED_RECONCILE_NO_RESUBMIT";
  }
  if (baselineStatus === "NOT_FOUND" && candidateStatus === "COMPLETED") {
    return "LEGACY_BASELINE_EXPIRED_CANDIDATE_COMPLETED_CAPTURE_CANDIDATE_THEN_BASELINE_RECOVERY_REQUIRED_NO_RESUBMIT";
  }
  if (baselineStatus === "COMPLETED" && candidateStatus === "NOT_FOUND") {
    return "LEGACY_CANDIDATE_EXPIRED_BASELINE_COMPLETED_RECOVERY_REQUIRED_NO_RESUBMIT";
  }
  if (baselineStatus === "NOT_FOUND" && candidateStatus === "NOT_FOUND") {
    return "LEGACY_BOTH_RESULTS_EXPIRED_RECOVERY_REQUIRED_NO_RESUBMIT";
  }
  if (FAILED_PROVIDER_STATES.has(baselineStatus) || FAILED_PROVIDER_STATES.has(candidateStatus)) {
    return `LEGACY_PROVIDER_JOB_FAILURE_RECONCILE_NO_RESUBMIT:baseline=${baselineStatus}:candidate=${candidateStatus}`;
  }
  if (candidateStatus === "IN_PROGRESS" || baselineStatus === "IN_PROGRESS") {
    return "LEGACY_EXISTING_JOB_ACTIVE_DO_NOT_RESUBMIT_MONITOR_ONLY";
  }
  if (candidateStatus === "IN_QUEUE" || baselineStatus === "IN_QUEUE") {
    if (workersMin === 0 && workersMax === 0 && activeWorkerCount === 0 && health.jobs.in_progress === 0) {
      return "LEGACY_EXISTING_JOB_QUEUED_AT_RESTING_0_0_REQUIRES_GOVERNED_RESUME_PLAN_NO_RESUBMIT";
    }
    return "LEGACY_EXISTING_JOB_QUEUED_WITH_CAPACITY_OR_WORKER_DO_NOT_RESUBMIT_MONITOR_ONLY";
  }
  if (!endpointFound) return "LEGACY_ENDPOINT_NOT_FOUND_RECONCILIATION_REQUIRED_NO_RESUBMIT";
  return `LEGACY_EXISTING_JOB_STATE_UNCLEAR_NO_RESUBMIT:baseline=${baselineStatus}:candidate=${candidateStatus}`;
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

const pairedProviderJobId = text(metadata.paired_provider_job_id, 300);
const baselineProviderJobId = text(metadata.baseline_provider_job_id, 300);
const candidateProviderJobId = text(metadata.candidate_provider_job_id, 300);
const benchmarkFormat = pairedProviderJobId
  ? "PAIRED_SINGLE_JOB_V1"
  : baselineProviderJobId && candidateProviderJobId
    ? "LEGACY_TWO_JOB_V1"
    : "UNKNOWN";
if (benchmarkFormat === "UNKNOWN") throw new Error("BENCHMARK_PROVIDER_JOB_BINDING_FORMAT_UNKNOWN");

const managementKey = text(env.RUNPOD_MANAGEMENT_API_KEY || env.RUNPOD_API_KEY, 12000);
const queueKeys = [
  { source: "RUNPOD_API_KEY", key: text(env.RUNPOD_API_KEY, 12000) },
  { source: "RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY", key: text(env.RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY, 12000) },
  { source: "RUNPOD_MANAGEMENT_API_KEY", key: text(env.RUNPOD_MANAGEMENT_API_KEY, 12000) },
].filter((entry, index, all) => entry.key && all.findIndex((candidate) => candidate.key === entry.key) === index);
if (!queueKeys.length) throw new Error("RUNPOD_READ_ONLY_QUEUE_KEY_REQUIRED");

const submittedEndpointId = text(metadata?.safe_lease?.endpoint_id, 240);
let endpointId = submittedEndpointId || text(
  env.RUNPOD_AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_ID ||
  env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID,
  240,
);
let endpoint = null;
let endpointFound = false;
let endpointResolutionSource = endpointId
  ? submittedEndpointId ? "STORED_SAFE_LEASE" : "LOCAL_ENVIRONMENT"
  : null;

if (managementKey) {
  if (endpointId) {
    const endpointResult = await runpodJson(
      `${RUNPOD_REST_BASE}/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
      [{ source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey }],
    );
    if (endpointResult.ok) {
      endpoint = endpointResult.body;
      endpointFound = true;
    } else if (!endpointResult.attempts.some((attempt) => attempt.status_code === 404)) {
      throw new Error(`RUNPOD_ENDPOINT_READ_FAILED:${JSON.stringify(endpointResult.attempts)}`);
    }
  } else {
    const endpointListResult = await runpodJson(
      `${RUNPOD_REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`,
      [{ source: "RUNPOD_MANAGEMENT_API_KEY", key: managementKey }],
    );
    if (!endpointListResult.ok) throw new Error(`RUNPOD_ENDPOINT_LIST_READ_FAILED:${JSON.stringify(endpointListResult.attempts)}`);
    const endpoints = Array.isArray(endpointListResult.body)
      ? endpointListResult.body
      : list(endpointListResult.body?.data || endpointListResult.body?.endpoints);
    const matches = endpoints.filter((entry) => text(entry?.name, 300) === TRAINER_ENDPOINT_NAME);
    if (matches.length !== 1) throw new Error(`BENCHMARK_TRAINER_ENDPOINT_NAME_RESOLUTION_FAILED:${matches.length}`);
    endpoint = matches[0];
    endpointId = text(endpoint?.id, 240);
    endpointFound = Boolean(endpointId);
    endpointResolutionSource = "RUNPOD_NAME_LOOKUP";
  }
}
if (!endpointId) throw new Error("BENCHMARK_ENDPOINT_ID_REQUIRED");

const providerJobs = benchmarkFormat === "PAIRED_SINGLE_JOB_V1"
  ? {
      paired: await inspectProviderJob(endpointId, pairedProviderJobId, queueKeys),
      baseline: null,
      candidate: null,
    }
  : {
      paired: null,
      baseline: await inspectProviderJob(endpointId, baselineProviderJobId, queueKeys),
      candidate: await inspectProviderJob(endpointId, candidateProviderJobId, queueKeys),
    };

let health = {
  jobs: { in_queue: 0, in_progress: 0 },
  workers: { idle: 0, initializing: 0, ready: 0, running: 0, throttled: 0, unhealthy: 0 },
};
let healthCredentialSource = null;
const healthResult = await runpodJson(
  `${RUNPOD_QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
  queueKeys,
);
if (healthResult.ok) {
  health = healthSummary(healthResult.body);
  healthCredentialSource = healthResult.source;
}

const workersMin = finite(endpoint?.workersMin);
const workersMax = finite(endpoint?.workersMax);
const activeWorkerCount = activeWorkers(endpoint || {}).length;
const dbStatus = text(metadata.status, 100);
const decision = benchmarkFormat === "PAIRED_SINGLE_JOB_V1"
  ? pairedDecision({
      dbStatus,
      paired: providerJobs.paired,
      endpointFound,
      workersMin,
      workersMax,
      health,
      activeWorkerCount,
    })
  : legacyDecision({
      dbStatus,
      baseline: providerJobs.baseline,
      candidate: providerJobs.candidate,
      endpointFound,
      workersMin,
      workersMax,
      health,
      activeWorkerCount,
    });

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  benchmark_run: {
    id: text(run.id, 200),
    subject: text(run.subject, 300),
    database_status: dbStatus,
    benchmark_format: benchmarkFormat,
    updated_at: run.updated_at || null,
    submitted_at: metadata.submitted_at || null,
    provider_job_count: finite(metadata.provider_job_count, benchmarkFormat === "PAIRED_SINGLE_JOB_V1" ? 1 : 2),
    stored_baseline_status: text(metadata.baseline_status, 100) || null,
    stored_candidate_status: text(metadata.candidate_status, 100) || null,
    adapter_artifact_reference: text(metadata.adapter_artifact_reference, 1200) || null,
    safe_lease_present: Object.keys(object(metadata.safe_lease)).length > 0,
  },
  provider: {
    endpoint_id: endpointId,
    endpoint_resolution_source: endpointResolutionSource,
    endpoint_found: endpointFound,
    endpoint_name: text(endpoint?.name, 300) || null,
    endpoint_name_matches_trainer: text(endpoint?.name, 300) === TRAINER_ENDPOINT_NAME,
    workers_min: workersMin,
    workers_max: workersMax,
    active_worker_count: activeWorkerCount,
    health,
    health_credential_source: healthCredentialSource,
    jobs: providerJobs,
  },
  recovery_decision: decision,
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
console.log(`AVANTIQO_INTELLIGENCE_BENCHMARK_RECOVERY_DECISION=${decision}`);
console.log("AVANTIQO_INTELLIGENCE_BENCHMARK_RECOVERY_INSPECT=PASS");
