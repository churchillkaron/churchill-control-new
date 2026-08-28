import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CONTRACT = "AVANTIQO_INTELLIGENCE_DEEP_SAFE_LEASE_BASELINE_INSPECTOR_V1";
const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const DEEP_NAME = "avantiqo-intelligence-v1";
const FAST_NAME = "avantiqo-intelligence-fast-v1";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const EXPECTED_DEEP_MODEL = "Qwen/Qwen3-30B-A3B-Thinking-2507";
const EXPECTED_PARSER = "qwen3";
const LEASE_DIR = String(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_DIR || "").trim() ||
  path.join(os.tmpdir(), "avantiqo-runpod-safe-leases-v2");

const text = (value, limit = 4000) => String(value ?? "").trim().slice(0, limit);
const list = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
function required(name, fallback = null) {
  const value = text(process.env[name] || fallback, 12000);
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
function redact(value) {
  return text(value, 1600)
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, "Bearer [REDACTED]")
    .replace(/((?:api[_-]?key|token|password|secret|authorization)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
}
async function fetchJson(url, key, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(options.timeoutMs || 30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`HTTP_${response.status}:${redact(body?.message || body?.error || body?.detail || raw)}`);
  }
  return body ?? {};
}
function rows(value, keys = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  for (const key of [...keys, "data", "items", "results"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  return [];
}
function resolveOne(items, name, code) {
  const matches = rows(items, ["endpoints", "serverlessEndpoints"])
    .filter((entry) => text(entry?.name, 300) === name);
  if (matches.length !== 1) throw new Error(`${code}:name=${name}:matches=${matches.length}`);
  return matches[0];
}
function templateId(endpoint) {
  return text(endpoint?.templateId || endpoint?.template?.id, 300) || null;
}
function envMap(value) {
  const pairs = Array.isArray(value)
    ? value.map((entry) => [text(entry?.key || entry?.name, 300), String(entry?.value ?? "")])
    : Object.entries(object(value)).map(([key, entryValue]) => [String(key), String(entryValue ?? "")]);
  return Object.fromEntries(pairs.filter(([key]) => key));
}
function resolveTemplate(endpoint, templates) {
  const id = templateId(endpoint);
  if (!id) return null;
  const inline = object(endpoint?.template);
  if (Object.keys(inline).length && text(inline?.imageName, 1200)) return { id, ...inline };
  const matches = rows(templates, ["templates"]).filter((entry) => text(entry?.id, 300) === id);
  return matches.length === 1 ? matches[0] : null;
}
function activeManagementWorkers(endpoint = {}) {
  return list(endpoint?.workers).filter((worker) => {
    const desired = worker?.desiredStatus ?? worker?.desired_status;
    const status = worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus;
    if (text(desired) && !terminalStatus(desired)) return true;
    if (text(status) && !terminalStatus(status)) return true;
    return !text(desired) && !text(status);
  });
}
function healthSummary(body = {}) {
  const jobs = object(body?.jobs);
  const workers = object(body?.workers);
  return {
    jobs: {
      in_queue: numberOrNull(jobs?.inQueue ?? jobs?.in_queue) ?? 0,
      in_progress: numberOrNull(jobs?.inProgress ?? jobs?.in_progress) ?? 0,
    },
    workers: {
      idle: numberOrNull(workers?.idle) ?? 0,
      initializing: numberOrNull(workers?.initializing) ?? 0,
      ready: numberOrNull(workers?.ready) ?? 0,
      running: numberOrNull(workers?.running) ?? 0,
      throttled: numberOrNull(workers?.throttled) ?? 0,
      unhealthy: numberOrNull(workers?.unhealthy) ?? 0,
    },
  };
}
async function endpointHealth(endpointId, queueKey) {
  try {
    const body = await fetchJson(
      `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
      queueKey,
      { timeoutMs: 20_000 },
    );
    return { readable: true, error: null, ...healthSummary(body) };
  } catch (error) {
    return {
      readable: false,
      error: redact(error?.message).slice(0, 500),
      jobs: { in_queue: null, in_progress: null },
      workers: {
        idle: null,
        initializing: null,
        ready: null,
        running: null,
        throttled: null,
        unhealthy: null,
      },
    };
  }
}
async function localLease(endpointId) {
  const file = path.join(LEASE_DIR, `lease-${endpointId}.json`);
  try {
    const parsed = JSON.parse(await readFile(file, "utf8"));
    const sameHost = text(parsed?.hostname) === os.hostname();
    const expiresMs = Date.parse(text(parsed?.expires_at));
    return {
      file,
      present: true,
      contract: text(parsed?.contract, 200) || null,
      valid_contract: text(parsed?.contract, 200) === SAFE_LEASE_CONTRACT,
      lane: text(parsed?.lane, 120) || null,
      same_host: sameHost,
      pid: numberOrNull(parsed?.pid),
      pid_alive: sameHost ? processAlive(parsed?.pid) : null,
      acquired_at: text(parsed?.acquired_at, 160) || null,
      expires_at: text(parsed?.expires_at, 160) || null,
      expired: Number.isFinite(expiresMs) ? expiresMs <= Date.now() : null,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        file,
        present: false,
        contract: null,
        valid_contract: false,
        lane: null,
        same_host: null,
        pid: null,
        pid_alive: null,
        acquired_at: null,
        expires_at: null,
        expired: null,
      };
    }
    throw error;
  }
}
function endpointState(endpoint, health) {
  const active = activeManagementWorkers(endpoint);
  const managementWorkers = list(endpoint?.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    status: text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase() || null,
    gpu_type: text(worker?.gpuTypeId ?? worker?.gpu?.displayName ?? worker?.machine?.gpuDisplayName, 300) || null,
    data_center_id: text(worker?.dataCenterId ?? worker?.machine?.dataCenterId, 300) || null,
    cost_per_hr: numberOrNull(worker?.adjustedCostPerHr ?? worker?.costPerHr),
  }));
  const healthWorkerBusy = health.readable && Object.values(health.workers).some((value) => Number(value) > 0);
  const jobsBusy = health.readable && (health.jobs.in_queue > 0 || health.jobs.in_progress > 0);
  return {
    id: text(endpoint?.id, 300),
    name: text(endpoint?.name, 300),
    template_id: templateId(endpoint),
    workers_min: numberOrNull(endpoint?.workersMin),
    workers_max: numberOrNull(endpoint?.workersMax),
    active_management_workers: active.length,
    management_workers: managementWorkers,
    health,
    runpod_open: numberOrNull(endpoint?.workersMin) !== 0 || numberOrNull(endpoint?.workersMax) !== 0,
    runpod_busy: active.length > 0 || healthWorkerBusy || jobsBusy,
    clean_0_0:
      numberOrNull(endpoint?.workersMin) === 0 &&
      numberOrNull(endpoint?.workersMax) === 0 &&
      active.length === 0 &&
      health.readable === true &&
      health.jobs.in_queue === 0 &&
      health.jobs.in_progress === 0 &&
      !healthWorkerBusy,
  };
}

console.log("AVANTIQO_INTELLIGENCE_DEEP_SAFE_LEASE_BASELINE_MODE=READ_ONLY");
console.log("AVANTIQO_INTELLIGENCE_DEEP_SAFE_LEASE_BASELINE_RUNPOD_MUTATION=false");
console.log("AVANTIQO_INTELLIGENCE_DEEP_SAFE_LEASE_BASELINE_JOB_SUBMISSION=false");
console.log("AVANTIQO_INTELLIGENCE_DEEP_SAFE_LEASE_BASELINE_INFERENCE=false");

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY", process.env.RUNPOD_API_KEY);
const queueKey = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY, 12000) ||
  text(process.env.RUNPOD_API_KEY, 12000) || managementKey;
const configuredDeepId = required("RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID");
const configuredFastId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_ID, 300) || null;

const [endpointBody, templatesBody] = await Promise.all([
  fetchJson(`${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`, managementKey),
  fetchJson(`${REST_BASE}/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false`, managementKey),
]);
const deep = resolveOne(endpointBody, DEEP_NAME, "AVANTIQO_INTELLIGENCE_DEEP_ENDPOINT_RESOLUTION_FAILED");
const fast = resolveOne(endpointBody, FAST_NAME, "AVANTIQO_INTELLIGENCE_FAST_ENDPOINT_RESOLUTION_FAILED");
if (text(deep?.id, 300) !== configuredDeepId) throw new Error("AVANTIQO_INTELLIGENCE_DEEP_CONFIGURED_ENDPOINT_ID_MISMATCH");
if (configuredFastId && text(fast?.id, 300) !== configuredFastId) throw new Error("AVANTIQO_INTELLIGENCE_FAST_CONFIGURED_ENDPOINT_ID_MISMATCH");

const [deepHealth, fastHealth, deepLease] = await Promise.all([
  endpointHealth(text(deep?.id, 300), queueKey),
  endpointHealth(text(fast?.id, 300), queueKey),
  localLease(text(deep?.id, 300)),
]);
const deepState = endpointState(deep, deepHealth);
const fastState = endpointState(fast, fastHealth);
const deepTemplate = resolveTemplate(deep, templatesBody);
const deepEnv = envMap(deepTemplate?.env);
const deepTemplateSerialized = JSON.stringify({
  imageName: deepTemplate?.imageName,
  dockerEntrypoint: deepTemplate?.dockerEntrypoint,
  dockerStartCmd: deepTemplate?.dockerStartCmd,
  env: deepEnv,
});
const deepTemplateContract = {
  readable: Boolean(deepTemplate),
  model_expected: deepTemplateSerialized.includes(EXPECTED_DEEP_MODEL),
  reasoning_parser: text(deepEnv.REASONING_PARSER, 80) || null,
  reasoning_parser_qwen3: text(deepEnv.REASONING_PARSER, 80).toLowerCase() === EXPECTED_PARSER,
  auto_tool_choice: text(deepEnv.ENABLE_AUTO_TOOL_CHOICE, 40).toLowerCase() || null,
  tool_call_parser: text(deepEnv.TOOL_CALL_PARSER, 80).toLowerCase() || null,
};
const liveLocalLease =
  deepLease.present &&
  deepLease.valid_contract &&
  deepLease.lane === "intelligence-deep" &&
  deepLease.same_host === true &&
  deepLease.pid_alive === true &&
  deepLease.expired !== true;

let diagnosis = "UNKNOWN";
let nextAction = "DO_NOT_MUTATE_UNTIL_DIAGNOSIS_RESOLVED";
if (!deepHealth.readable) {
  diagnosis = "DEEP_HEALTH_UNREADABLE";
  nextAction = "FIX_OR_SELECT_CORRECT_INTELLIGENCE_QUEUE_CREDENTIAL_BEFORE_SAFE_LEASE";
} else if (liveLocalLease) {
  diagnosis = "LIVE_LOCAL_SAFE_LEASE_OWNER_PRESENT";
  nextAction = "DO_NOT_MUTATE;ALLOW_OR_INSPECT_LIVE_OWNER";
} else if (deepState.clean_0_0) {
  diagnosis = "CLEAN_REST_STATE";
  nextAction = "RETRY_SAFE_LEASE_NO_INFERENCE_MODELS_PROBE";
} else if (deepLease.present && (deepLease.pid_alive === false || deepLease.expired === true)) {
  diagnosis = deepState.runpod_open || deepState.runpod_busy
    ? "STALE_LOCAL_LEASE_WITH_NONRESTING_DEEP"
    : "STALE_LOCAL_LEASE_RECORD_ONLY";
  nextAction = deepState.runpod_open || deepState.runpod_busy
    ? "DO_NOT_FORCE;RUN_OWNERSHIP_SAFE_ORPHAN_DIAGNOSIS"
    : "SAFE_LEASE_CAN_PRUNE_STALE_LOCAL_RECORD_ON_NEXT_ACQUIRE";
} else if (!deepState.runpod_busy && deepState.runpod_open) {
  diagnosis = "UNOWNED_OPEN_IDLE_DEEP_ENDPOINT";
  nextAction = "RUN_OWNERSHIP_SAFE_DEEP_ORPHAN_REST_REPAIR";
} else if (deepState.runpod_busy) {
  diagnosis = "DEEP_ACTIVITY_WITHOUT_LIVE_LOCAL_SAFE_LEASE_OWNER";
  nextAction = "DO_NOT_MUTATE;IDENTIFY_ORPHAN_OR_EXTERNAL_OWNER_FIRST";
} else {
  diagnosis = "NONCANONICAL_DEEP_BASELINE";
  nextAction = "DO_NOT_MUTATE;INSPECT_REPORTED_SCALING_AND_HEALTH_FIELDS";
}

const report = {
  success: true,
  contract: CONTRACT,
  mode: "READ_ONLY",
  diagnosis,
  next_action: nextAction,
  now: new Date().toISOString(),
  deep: deepState,
  fast: fastState,
  deep_template_contract: deepTemplateContract,
  local_safe_lease: deepLease,
  safeguards: {
    runpod_mutation_performed: false,
    queue_mutation_performed: false,
    worker_scaling_mutated: false,
    provider_job_submitted: false,
    inference_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  },
};
console.log(JSON.stringify(report, null, 2));
console.log(`${CONTRACT}=PASS`);
