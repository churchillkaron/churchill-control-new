import process from "node:process";

const CONTRACT = "AVANTIQO_CODE_ZERO_IDLE_SERVERLESS_ACTIVATION_V1";
const ENDPOINT_ID = "r79dtnjnrilrlc";
const REST = "https://rest.runpod.io/v1";
const SERVERLESS = "https://api.runpod.ai/v2";

function text(value, maximum = 1200) {
  return String(value ?? "").trim().slice(0, maximum);
}

function yes(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stable(endpoint = {}) {
  return {
    template_id: text(endpoint.templateId || endpoint.template_id) || null,
    network_volume_id: text(endpoint.networkVolumeId || endpoint.network_volume_id) || null,
    gpu_type_ids: Array.isArray(endpoint.gpuTypeIds) ? [...endpoint.gpuTypeIds].sort() : [],
    workers_min: Number(endpoint.workersMin ?? endpoint.workers_min ?? -1),
    idle_timeout: Number(endpoint.idleTimeout ?? endpoint.idle_timeout ?? -1),
    flashboot:
      endpoint.flashboot === true ||
      endpoint.flashBoot === true ||
      text(endpoint.flashBootType).toUpperCase() === "FLASHBOOT",
  };
}

async function rest(path, { method = "GET", body = null } = {}) {
  const key = text(process.env.RUNPOD_MANAGEMENT_API_KEY || process.env.RUNPOD_API_KEY);
  if (!key) throw new Error("RUNPOD_MANAGEMENT_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");
  const response = await fetch(`${REST}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let parsed = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { message: raw }; }
  if (!response.ok) {
    throw new Error(`CODE_ZERO_IDLE_ACTIVATION_HTTP_${response.status}:${text(parsed?.detail || parsed?.error || parsed?.message) || "UNKNOWN"}`);
  }
  return parsed;
}

async function health() {
  const key = text(process.env.RUNPOD_AVANTIQO_CODE_API_KEY || process.env.RUNPOD_API_KEY);
  if (!key) throw new Error("RUNPOD_AVANTIQO_CODE_API_KEY_OR_RUNPOD_API_KEY_REQUIRED");
  const response = await fetch(`${SERVERLESS}/${ENDPOINT_ID}/health`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let parsed = {};
  try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { message: raw }; }
  if (!response.ok) throw new Error(`CODE_ZERO_IDLE_HEALTH_HTTP_${response.status}:${text(parsed?.error || parsed?.message) || "UNKNOWN"}`);
  return parsed;
}

function counters(value = {}) {
  const jobs = object(value.jobs);
  const workers = object(value.workers);
  return {
    jobs: {
      in_queue: Number(jobs.inQueue ?? jobs.in_queue ?? 0),
      in_progress: Number(jobs.inProgress ?? jobs.in_progress ?? 0),
    },
    workers: {
      initializing: Number(workers.initializing ?? 0),
      running: Number(workers.running ?? 0),
      unhealthy: Number(workers.unhealthy ?? 0),
    },
  };
}

function assertIdle(value) {
  const current = counters(value);
  if (current.jobs.in_queue || current.jobs.in_progress) {
    throw new Error(`CODE_ZERO_IDLE_ACTIVATION_LIVE_JOBS:queue=${current.jobs.in_queue}:progress=${current.jobs.in_progress}`);
  }
  if (current.workers.initializing || current.workers.running || current.workers.unhealthy) {
    throw new Error(`CODE_ZERO_IDLE_ACTIVATION_ACTIVE_WORKERS:init=${current.workers.initializing}:running=${current.workers.running}:unhealthy=${current.workers.unhealthy}`);
  }
  return current;
}

const apply = process.argv.includes("--apply");
const approved = text(process.env.AVANTIQO_CODE_ZERO_IDLE_ACTIVATION_APPROVED).toUpperCase() === "YES";
if (apply && !approved) throw new Error("AVANTIQO_CODE_ZERO_IDLE_ACTIVATION_APPROVED=YES_REQUIRED");

const before = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`);
const beforeStable = stable(before);
const beforeWorkersMax = Number(before.workersMax ?? before.workers_max ?? -1);
const beforeHealth = assertIdle(await health());

if (beforeStable.workers_min !== 0) throw new Error(`CODE_ZERO_IDLE_WORKERS_MIN_MUST_BE_ZERO:${beforeStable.workers_min}`);
if (beforeStable.flashboot !== true) throw new Error("CODE_ZERO_IDLE_FLASHBOOT_REQUIRED");
if (!beforeStable.template_id) throw new Error("CODE_ZERO_IDLE_TEMPLATE_REQUIRED");
if (!beforeStable.network_volume_id) throw new Error("CODE_ZERO_IDLE_NETWORK_VOLUME_REQUIRED");
if (!beforeStable.gpu_type_ids.length) throw new Error("CODE_ZERO_IDLE_GPU_POOL_REQUIRED");
if (![0, 1].includes(beforeWorkersMax)) {
  throw new Error(`CODE_ZERO_IDLE_WORKERS_MAX_UNEXPECTED:${beforeWorkersMax}`);
}

const plan = {
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  endpoint_id: ENDPOINT_ID,
  before: { ...beforeStable, workers_max: beforeWorkersMax },
  health: beforeHealth,
  requested_change: { workersMin: 0, workersMax: 1 },
  idle_gpu_cost_target: "ZERO_WHEN_NO_WORKER_RUNNING",
  flashboot_preserved: true,
  stable_fields_preserved: true,
  generation_submitted: false,
  provider_inference_performed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  mutation_performed: false,
  secrets_printed: false,
};

if (!apply || beforeWorkersMax === 1) {
  console.log(JSON.stringify({
    ...plan,
    mode: apply ? "APPLY" : "PLAN",
    mutation_performed: false,
    reason: beforeWorkersMax === 1 ? "ZERO_IDLE_SERVERLESS_ALREADY_ACTIVE" : "APPROVAL_REQUIRED_FOR_APPLY",
  }, null, 2));
  process.exit(0);
}

const fresh = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`);
if (JSON.stringify(stable(fresh)) !== JSON.stringify(beforeStable)) {
  throw new Error("CODE_ZERO_IDLE_ENDPOINT_STABLE_FIELDS_CHANGED_REPLAN_REQUIRED");
}
if (Number(fresh.workersMax ?? fresh.workers_max ?? -1) !== 0) {
  throw new Error("CODE_ZERO_IDLE_WORKERS_MAX_CHANGED_REPLAN_REQUIRED");
}
assertIdle(await health());

await rest(`/endpoints/${ENDPOINT_ID}`, {
  method: "PATCH",
  body: { workersMin: 0, workersMax: 1 },
});

const after = await rest(`/endpoints/${ENDPOINT_ID}?includeTemplate=true&includeWorkers=true`);
const afterStable = stable(after);
const afterWorkersMax = Number(after.workersMax ?? after.workers_max ?? -1);
if (JSON.stringify(afterStable) !== JSON.stringify(beforeStable)) {
  throw new Error("CODE_ZERO_IDLE_STABLE_FIELDS_CHANGED_DURING_ACTIVATION");
}
if (afterWorkersMax !== 1) throw new Error(`CODE_ZERO_IDLE_WORKERS_MAX_VERIFY_FAILED:${afterWorkersMax}`);
const afterHealth = counters(await health());
if (afterHealth.jobs.in_queue || afterHealth.jobs.in_progress || afterHealth.workers.initializing || afterHealth.workers.running) {
  throw new Error("CODE_ZERO_IDLE_ACTIVATION_UNEXPECTEDLY_STARTED_WORKER");
}

console.log(JSON.stringify({
  ...plan,
  mode: "APPLY",
  mutation_performed: true,
  after: { ...afterStable, workers_max: afterWorkersMax },
  after_health: afterHealth,
  zero_idle_serverless_active: true,
  gpu_worker_started_by_activation: false,
  generation_submitted: false,
  provider_inference_performed: false,
  wallet_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));