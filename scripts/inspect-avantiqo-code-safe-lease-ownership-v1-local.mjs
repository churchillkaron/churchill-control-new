import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CONTRACT = "AVANTIQO_CODE_SAFE_LEASE_OWNERSHIP_INSPECTOR_V1";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const ENDPOINT_NAME = "avantiqo-code-v1";
const ORGANIZATION_ID = "916fd3e7-b00b-4dd6-aaf3-bd01dd588e94";
const SERVICE_ID = "ai.code.debug";
const DISTRIBUTED_CONTRACT = "AVANTIQO_CODE_DISTRIBUTED_RUNPOD_LEASE_V1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const LEASE_DIR = String(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_DIR || "").trim() ||
  path.join(os.tmpdir(), "avantiqo-runpod-safe-leases-v2");
const LEASE_FILE = path.join(LEASE_DIR, `lease-${ENDPOINT_ID}.json`);
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function list(value) { return Array.isArray(value) ? value : []; }
function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function required(name, fallback = null) {
  const value = text(process.env[name] || fallback);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function terminalStatus(value) {
  return ["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(text(value).toUpperCase());
}
function processAlive(pid) {
  const parsed = Number(pid);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  try {
    process.kill(parsed, 0);
    return true;
  } catch {
    return false;
  }
}
async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 500)}`);
  }
  return body ?? {};
}
async function supabaseControlRow() {
  const base = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const key = required("SUPABASE_SERVICE_ROLE_KEY");
  const url = `${base}/rest/v1/organization_services?select=id,organization_id,service_id,managed_by,default_provider_id,metadata,updated_at&organization_id=eq.${encodeURIComponent(ORGANIZATION_ID)}&service_id=eq.${encodeURIComponent(SERVICE_ID)}&limit=2`;
  const response = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      "Cache-Control": "no-store",
    },
    signal: AbortSignal.timeout(15_000),
  });
  const rows = await readJson(response, `${CONTRACT}_SUPABASE`);
  if (!Array.isArray(rows)) throw new Error(`${CONTRACT}_CONTROL_ROW_LIST_INVALID`);
  if (rows.length !== 1) throw new Error(`${CONTRACT}_CONTROL_ROW_RESOLUTION_FAILED:${rows.length}`);
  return rows[0];
}
async function localLease() {
  try {
    const parsed = JSON.parse(await readFile(LEASE_FILE, "utf8"));
    const sameHost = text(parsed?.hostname) === os.hostname();
    return {
      present: true,
      raw: parsed,
      same_host: sameHost,
      pid: finite(parsed?.pid),
      pid_alive: sameHost ? processAlive(parsed?.pid) : null,
      expires_at: text(parsed?.expires_at) || null,
      expired: Number.isFinite(Date.parse(text(parsed?.expires_at)))
        ? Date.parse(text(parsed?.expires_at)) <= Date.now()
        : null,
      owner_request_id: text(parsed?.owner_request_id) || null,
      lane: text(parsed?.lane) || null,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        present: false,
        raw: null,
        same_host: null,
        pid: null,
        pid_alive: null,
        expires_at: null,
        expired: null,
        owner_request_id: null,
        lane: null,
      };
    }
    throw error;
  }
}
async function runpodState() {
  const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
  const queueKey = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY) || text(process.env.RUNPOD_API_KEY) || managementKey;
  const [endpointResponse, healthResponse] = await Promise.all([
    fetch(`${REST_BASE}/endpoints/${encodeURIComponent(ENDPOINT_ID)}?includeTemplate=false&includeWorkers=true`, {
      headers: { Authorization: `Bearer ${managementKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    }),
    fetch(`${QUEUE_BASE}/${encodeURIComponent(ENDPOINT_ID)}/health`, {
      headers: { Authorization: `Bearer ${queueKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    }),
  ]);
  const endpoint = await readJson(endpointResponse, `${CONTRACT}_RUNPOD_ENDPOINT`);
  const health = await readJson(healthResponse, `${CONTRACT}_RUNPOD_HEALTH`);
  if (text(endpoint?.id) !== ENDPOINT_ID || text(endpoint?.name) !== ENDPOINT_NAME) {
    throw new Error(`${CONTRACT}_ENDPOINT_IDENTITY_MISMATCH`);
  }
  const workers = list(endpoint?.workers);
  const activeWorkers = workers.filter((worker) => {
    const desired = worker?.desiredStatus ?? worker?.desired_status;
    const status = worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus;
    if (text(desired) && !terminalStatus(desired)) return true;
    if (text(status) && !terminalStatus(status)) return true;
    return !text(desired) && !text(status);
  });
  const jobs = object(health?.jobs);
  const healthWorkers = object(health?.workers);
  return {
    workers_min: finite(endpoint?.workersMin),
    workers_max: finite(endpoint?.workersMax),
    active_management_workers: activeWorkers.length,
    management_workers: workers.map((worker) => ({
      id_present: Boolean(text(worker?.id)),
      desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
      status: text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase() || null,
      gpu_type: text(worker?.gpuTypeId ?? worker?.gpu?.displayName ?? worker?.machine?.gpuDisplayName) || null,
      data_center_id: text(worker?.dataCenterId ?? worker?.machine?.dataCenterId) || null,
      cost_per_hr: finite(worker?.costPerHr ?? worker?.adjustedCostPerHr),
    })),
    jobs: {
      in_queue: finite(jobs?.inQueue ?? jobs?.in_queue, 0),
      in_progress: finite(jobs?.inProgress ?? jobs?.in_progress, 0),
    },
    health_workers: {
      idle: finite(healthWorkers?.idle, 0),
      initializing: finite(healthWorkers?.initializing, 0),
      ready: finite(healthWorkers?.ready, 0),
      running: finite(healthWorkers?.running, 0),
      throttled: finite(healthWorkers?.throttled, 0),
      unhealthy: finite(healthWorkers?.unhealthy, 0),
    },
  };
}

console.log("AVANTIQO_CODE_SAFE_LEASE_OWNERSHIP_MODE=READ_ONLY");
console.log("AVANTIQO_CODE_SAFE_LEASE_OWNERSHIP_RUNPOD_MUTATION=false");
console.log("AVANTIQO_CODE_SAFE_LEASE_OWNERSHIP_SUPABASE_MUTATION=false");
console.log("AVANTIQO_CODE_SAFE_LEASE_OWNERSHIP_JOB_SUBMISSION=false");
console.log("AVANTIQO_CODE_SAFE_LEASE_OWNERSHIP_INFERENCE=false");

const [row, local, runpod] = await Promise.all([
  supabaseControlRow(),
  localLease(),
  runpodState(),
]);

const metadata = object(row?.metadata);
const distributed = object(metadata?.runpod_safe_lease_v2);
const distributedExpiryMs = Date.parse(text(distributed?.expires_at));
const distributedValidContract =
  text(distributed?.distributed_contract) === DISTRIBUTED_CONTRACT &&
  text(distributed?.contract) === SAFE_LEASE_CONTRACT &&
  text(distributed?.lane) === "code" &&
  text(distributed?.endpoint_id) === ENDPOINT_ID;
const distributedActive =
  distributedValidContract &&
  text(distributed?.state).toUpperCase() === "ACTIVE" &&
  Number.isFinite(distributedExpiryMs) &&
  distributedExpiryMs > Date.now();
const distributedExpired =
  distributedValidContract &&
  text(distributed?.state).toUpperCase() === "ACTIVE" &&
  Number.isFinite(distributedExpiryMs) &&
  distributedExpiryMs <= Date.now();
const localOwnerMatchesDistributed =
  local.present &&
  Boolean(local.owner_request_id) &&
  local.owner_request_id === text(distributed?.owner_request_id);
const localLiveOwner =
  local.present &&
  local.same_host === true &&
  local.pid_alive === true &&
  local.expired !== true;
const runpodOpen = runpod.workers_min !== 0 || runpod.workers_max !== 0;
const runpodBusy =
  runpod.jobs.in_queue > 0 ||
  runpod.jobs.in_progress > 0 ||
  runpod.active_management_workers > 0 ||
  Object.values(runpod.health_workers).some((value) => Number(value) > 0);

let diagnosis = "CLEAN_REST_STATE";
let nextAction = "RUN_READ_ONLY_CAPACITY_PLAN";
if (distributedActive && localLiveOwner && localOwnerMatchesDistributed) {
  diagnosis = "LIVE_CODE_SAFE_LEASE_OWNER_PRESENT";
  nextAction = "DO_NOT_MUTATE_OR_RUN_CAPACITY_PLAN_WHILE_OWNER_IS_LIVE";
} else if (distributedActive && (!localLiveOwner || !localOwnerMatchesDistributed)) {
  diagnosis = "ACTIVE_DISTRIBUTED_LEASE_WITHOUT_MATCHING_LIVE_LOCAL_OWNER";
  nextAction = "TREAT_AS_POTENTIALLY_STALE;DO_NOT_FORCE_RELEASE_BEFORE_OWNERSHIP_REPAIR";
} else if (distributedExpired && runpodOpen && !runpodBusy) {
  diagnosis = "EXPIRED_DISTRIBUTED_LEASE_WITH_ORPHANED_0_1";
  nextAction = "RUN_OWNERSHIP_SAFE_ORPHAN_REPAIR_THEN_CAPACITY_PLAN";
} else if (!distributedActive && !distributedExpired && runpodOpen && !runpodBusy) {
  diagnosis = "UNOWNED_RUNPOD_0_1";
  nextAction = "RUN_OWNERSHIP_SAFE_ORPHAN_REPAIR_THEN_CAPACITY_PLAN";
} else if (!distributedActive && !runpodOpen && !runpodBusy) {
  diagnosis = "CLEAN_REST_STATE";
  nextAction = "RUN_READ_ONLY_CAPACITY_PLAN";
} else if (!distributedActive && runpodBusy) {
  diagnosis = "RUNPOD_ACTIVITY_WITHOUT_ACTIVE_DISTRIBUTED_LEASE";
  nextAction = "DO_NOT_MUTATE;INSPECT_ORPHAN_ACTIVITY_FIRST";
}

const report = {
  success: true,
  contract: CONTRACT,
  diagnosis,
  next_action: nextAction,
  now: new Date().toISOString(),
  distributed_lease: {
    valid_contract: distributedValidContract,
    state: text(distributed?.state).toUpperCase() || null,
    active_now: distributedActive,
    expired_while_still_marked_active: distributedExpired,
    owner_request_id_present: Boolean(text(distributed?.owner_request_id)),
    acquired_at: text(distributed?.acquired_at) || null,
    expires_at: text(distributed?.expires_at) || null,
    milliseconds_until_expiry: Number.isFinite(distributedExpiryMs)
      ? distributedExpiryMs - Date.now()
      : null,
    endpoint_id: text(distributed?.endpoint_id) || null,
  },
  local_lease: {
    file: LEASE_FILE,
    present: local.present,
    same_host: local.same_host,
    pid: local.pid,
    pid_alive: local.pid_alive,
    expired: local.expired,
    owner_request_id_present: Boolean(local.owner_request_id),
    owner_matches_distributed: localOwnerMatchesDistributed,
    lane: local.lane,
    expires_at: local.expires_at,
  },
  runpod,
  safeguards: {
    runpod_mutation_performed: false,
    supabase_mutation_performed: false,
    provider_job_submitted: false,
    inference_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
};

console.log(JSON.stringify(report, null, 2));
console.log(`${CONTRACT}=PASS`);
