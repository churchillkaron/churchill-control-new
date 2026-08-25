import { readFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const GRAPHQL_URL = "https://api.runpod.io/graphql";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTROL_BASE = "https://api.runpod.io/v2";
const CONTRACT = "AVANTIQO_RUNPOD_SERVERLESS_ACCOUNT_DIAGNOSTIC_V1";
const LOCK_PATH = "audits/results/avantiqo-voice-tts-controlled-generation.json";
const LOCK_CONTRACT = "AVANTIQO_VOICE_TTS_CONTROLLED_GENERATION_V1";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
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

async function readJsonResponse(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 1200);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}

async function graphql(managementKey) {
  const query = `
    query AvantiqoRunpodServerlessAccountDiagnostic {
      myself {
        underBalance
        minBalance
        maxServerlessConcurrency
        clientBalance
        currentSpendPerHr
        spendLimit
        clientLifetimeSpend
        signedTermsOfService
        hasActivated
        isTeam
        isAutoPayEnabled
        endpoints {
          id
          name
          version
          workersMin
          workersMax
          workersStandby
          gpuCount
          minCudaVersion
          scalerType
          scalerValue
          instanceIds
          modelStatus
        }
      }
    }
  `;
  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok || body?.errors?.length || !body?.data?.myself) {
    const detail = text(
      body?.errors?.map((entry) => entry?.message).filter(Boolean).join(" | ") || raw,
    ).slice(0, 1200);
    throw new Error(`AVANTIQO_RUNPOD_ACCOUNT_GRAPHQL_FAILED:${response.status}:${detail || "INVALID_RESPONSE"}`);
  }
  return body.data.myself;
}

async function rest(pathname, managementKey) {
  return readJsonResponse(await fetch(`${REST_BASE}${pathname}`, {
    headers: {
      Authorization: `Bearer ${managementKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_RUNPOD_ACCOUNT_REST");
}

async function queue(endpointId, inferenceKey, pathname) {
  return readJsonResponse(await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}${pathname}`, {
    headers: {
      Authorization: `Bearer ${inferenceKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  }), "AVANTIQO_RUNPOD_ACCOUNT_QUEUE");
}

async function controlWorkers(endpointId, managementKey) {
  return readJsonResponse(await fetch(
    `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`,
    {
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    },
  ), "AVANTIQO_RUNPOD_ACCOUNT_CONTROL");
}

function healthSummary(body = {}) {
  const jobs = body?.jobs && typeof body.jobs === "object" ? body.jobs : {};
  const workers = body?.workers && typeof body.workers === "object" ? body.workers : {};
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
      retried: finite(jobs.retried, 0),
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

function safeControlWorkers(body = {}) {
  return list(body?.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    status: text(worker?.status).toUpperCase() || null,
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}

function activeControlWorkerCount(body = {}) {
  return safeControlWorkers(body).filter(
    (worker) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(worker.status),
  ).length;
}

function publicEndpointSummary(endpoint = {}) {
  return {
    id: text(endpoint?.id) || null,
    name: text(endpoint?.name) || null,
    version: finite(endpoint?.version),
    workers_min: finite(endpoint?.workersMin, 0),
    workers_max: finite(endpoint?.workersMax, 0),
    gpu_count: finite(endpoint?.gpuCount, 0),
    min_cuda_version: text(endpoint?.minCudaVersion) || null,
    scaler_type: text(endpoint?.scalerType) || null,
    scaler_value: finite(endpoint?.scalerValue),
    management_worker_count: list(endpoint?.workers).length,
  };
}

function selfServeBalanceBand(balance) {
  if (!Number.isFinite(balance)) return "UNKNOWN";
  if (balance >= 300) return "BALANCE_AT_LEAST_300";
  if (balance >= 200) return "BALANCE_200_TO_299";
  if (balance >= 100) return "BALANCE_100_TO_199";
  return "BALANCE_BELOW_100";
}

const lock = JSON.parse(await readFile(LOCK_PATH, "utf8"));
if (lock?.contract !== LOCK_CONTRACT) throw new Error("AVANTIQO_RUNPOD_ACCOUNT_LOCK_CONTRACT_MISMATCH");
if (lock?.generation_submitted !== true || Number(lock?.accepted_generation_count) !== 1) {
  throw new Error("AVANTIQO_RUNPOD_ACCOUNT_ONE_ACCEPTED_GENERATION_REQUIRED");
}
if (lock?.new_generation_allowed !== false || lock?.stt_submitted !== false) {
  throw new Error("AVANTIQO_RUNPOD_ACCOUNT_GENERATION_LOCK_REQUIRED");
}

const endpointId = text(lock.endpoint_id);
const jobId = text(lock.job_id);
if (!endpointId || !jobId) throw new Error("AVANTIQO_RUNPOD_ACCOUNT_LOCK_IDS_REQUIRED");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const inferenceKey = required("RUNPOD_API_KEY");

const [account, endpointsRaw, exactStatusRaw, exactHealthRaw, exactWorkersRaw] = await Promise.all([
  graphql(managementKey),
  rest("/endpoints?includeTemplate=false&includeWorkers=true", managementKey),
  queue(endpointId, inferenceKey, `/status/${encodeURIComponent(jobId)}`),
  queue(endpointId, inferenceKey, "/health"),
  controlWorkers(endpointId, managementKey),
]);

const restEndpoints = normalizeListResponse(endpointsRaw, ["endpoints"]) || [];
const endpointSummaries = restEndpoints.map(publicEndpointSummary);
const exactRestEndpoint = endpointSummaries.find((endpoint) => endpoint.id === endpointId) || null;
const graphqlEndpoints = list(account?.endpoints).map((endpoint) => ({
  id: text(endpoint?.id) || null,
  name: text(endpoint?.name) || null,
  version: finite(endpoint?.version),
  workers_min: finite(endpoint?.workersMin, 0),
  workers_max: finite(endpoint?.workersMax, 0),
  workers_standby: finite(endpoint?.workersStandby, 0),
  gpu_count: finite(endpoint?.gpuCount, 0),
  min_cuda_version: text(endpoint?.minCudaVersion) || null,
  scaler_type: text(endpoint?.scalerType) || null,
  scaler_value: finite(endpoint?.scalerValue),
  instance_id_count: list(endpoint?.instanceIds).length,
  model_status: text(endpoint?.modelStatus) || null,
}));

const allControlRows = [];
for (const endpoint of endpointSummaries) {
  try {
    const raw = await controlWorkers(endpoint.id, managementKey);
    allControlRows.push({
      endpoint_id: endpoint.id,
      endpoint_name: endpoint.name,
      active_control_workers: activeControlWorkerCount(raw),
      control_workers: safeControlWorkers(raw),
      error: null,
    });
  } catch (error) {
    allControlRows.push({
      endpoint_id: endpoint.id,
      endpoint_name: endpoint.name,
      active_control_workers: null,
      control_workers: [],
      error: text(error?.message || error).slice(0, 500),
    });
  }
}

const totalActiveControlWorkers = allControlRows.reduce(
  (sum, row) => sum + (Number.isFinite(row.active_control_workers) ? row.active_control_workers : 0),
  0,
);
const maxServerlessConcurrency = finite(account?.maxServerlessConcurrency, null);
const clientBalance = finite(account?.clientBalance, null);
const minBalance = finite(account?.minBalance, null);
const hardBlockers = [];

if (account?.signedTermsOfService === false) hardBlockers.push("TERMS_OF_SERVICE_NOT_SIGNED");
if (account?.hasActivated === false) hardBlockers.push("ACCOUNT_NOT_ACTIVATED");
if (account?.underBalance === true) hardBlockers.push("ACCOUNT_UNDER_BALANCE");
if (maxServerlessConcurrency !== null && maxServerlessConcurrency <= 0) {
  hardBlockers.push("SERVERLESS_CONCURRENCY_LIMIT_ZERO");
}
if (clientBalance !== null && clientBalance <= 0) hardBlockers.push("CLIENT_BALANCE_NON_POSITIVE");
if (
  maxServerlessConcurrency !== null &&
  maxServerlessConcurrency > 0 &&
  totalActiveControlWorkers >= maxServerlessConcurrency
) {
  hardBlockers.push("SERVERLESS_CONCURRENCY_LIMIT_EXHAUSTED");
}

const exactStatus = text(exactStatusRaw?.status).toUpperCase() || "UNKNOWN";
const exactHealth = healthSummary(exactHealthRaw);
const exactControlWorkers = safeControlWorkers(exactWorkersRaw);

let diagnosis = "RUNPOD_ACCOUNT_ELIGIBLE_CONTROL_PLANE_WORKER_CREATION_FAILURE";
let nextAction = "OPEN_RUNPOD_SUPPORT_WITH_ACCOUNT_AND_ENDPOINT_EVIDENCE_NO_NEW_JOB";
if (hardBlockers.includes("ACCOUNT_UNDER_BALANCE") || hardBlockers.includes("CLIENT_BALANCE_NON_POSITIVE")) {
  diagnosis = "RUNPOD_ACCOUNT_BALANCE_BLOCKER_CONFIRMED";
  nextAction = "RESTORE_RUNPOD_ACCOUNT_FUNDING_THEN_RESUME_EXISTING_JOB_ONLY";
} else if (
  hardBlockers.includes("SERVERLESS_CONCURRENCY_LIMIT_ZERO") ||
  hardBlockers.includes("SERVERLESS_CONCURRENCY_LIMIT_EXHAUSTED")
) {
  diagnosis = "RUNPOD_SERVERLESS_CONCURRENCY_BLOCKER_CONFIRMED";
  nextAction = "INCREASE_OR_FREE_RUNPOD_SERVERLESS_WORKER_CONCURRENCY_THEN_RESUME_EXISTING_JOB_ONLY";
} else if (hardBlockers.includes("TERMS_OF_SERVICE_NOT_SIGNED") || hardBlockers.includes("ACCOUNT_NOT_ACTIVATED")) {
  diagnosis = "RUNPOD_ACCOUNT_ACTIVATION_BLOCKER_CONFIRMED";
  nextAction = "FIX_RUNPOD_ACCOUNT_ACTIVATION_THEN_RESUME_EXISTING_JOB_ONLY";
} else if (exactStatus !== "IN_QUEUE") {
  diagnosis = "EXISTING_ACCEPTED_JOB_LEFT_QUEUE";
  nextAction = "RESUME_EXISTING_ACCEPTED_JOB_ONLY";
} else if (exactControlWorkers.length > 0 || Object.values(exactHealth.workers).some((value) => value > 0)) {
  diagnosis = "WORKER_NOW_EXISTS_FOR_EXISTING_ACCEPTED_JOB";
  nextAction = "RESUME_EXISTING_ACCEPTED_JOB_ONLY";
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  accepted_generation_count: 1,
  generation_submitted: false,
  new_generation_allowed: false,
  endpoint_mutation_performed: false,
  queue_mutation_performed: false,
  queue_purged: false,
  job_cancelled: false,
  stt_submitted: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
  account_identity_printed: false,
  account: {
    under_balance: account?.underBalance === true,
    min_balance_usd: minBalance,
    client_balance_usd: clientBalance,
    balance_minus_minimum_usd:
      clientBalance !== null && minBalance !== null ? Number((clientBalance - minBalance).toFixed(6)) : null,
    max_serverless_concurrency: maxServerlessConcurrency,
    current_spend_per_hour_usd: finite(account?.currentSpendPerHr, null),
    spend_limit_usd: finite(account?.spendLimit, null),
    client_lifetime_spend_usd: finite(account?.clientLifetimeSpend, null),
    signed_terms_of_service: account?.signedTermsOfService === true,
    activated: account?.hasActivated === true,
    is_team_context: account?.isTeam === true,
    autopay_enabled: account?.isAutoPayEnabled === true,
    self_serve_worker_limit_balance_band: selfServeBalanceBand(clientBalance),
  },
  exact_voice_job: {
    endpoint_id: endpointId,
    job_id: jobId,
    status: exactStatus,
    health: exactHealth,
    control_workers: exactControlWorkers,
    rest_endpoint: exactRestEndpoint,
    graphql_endpoint: graphqlEndpoints.find((endpoint) => endpoint.id === endpointId) || null,
  },
  account_serverless_usage: {
    endpoint_count: endpointSummaries.length,
    configured_workers_min_total: endpointSummaries.reduce((sum, endpoint) => sum + Number(endpoint.workers_min || 0), 0),
    configured_workers_max_total: endpointSummaries.reduce((sum, endpoint) => sum + Number(endpoint.workers_max || 0), 0),
    total_active_control_workers: totalActiveControlWorkers,
    max_serverless_concurrency: maxServerlessConcurrency,
    concurrency_remaining:
      maxServerlessConcurrency !== null ? maxServerlessConcurrency - totalActiveControlWorkers : null,
    endpoints_with_active_control_workers: allControlRows.filter((row) => Number(row.active_control_workers) > 0),
    control_worker_read_errors: allControlRows.filter((row) => row.error),
  },
  hard_blockers: hardBlockers,
  diagnosis,
  safe_to_submit_duplicate_job: false,
  next_action: nextAction,
}, null, 2));
