import { spawnSync } from "node:child_process";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_UNPAUSE_V1";
const ENDPOINT_NAME = "avantiqo-intelligence-trainer-v1";
const PROPAGATION_WAIT_MS = 30_000;

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value, 40).toUpperCase());
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function shell(name, args, label) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`${label}:${text(result.stderr || result.stdout, 1000)}`);
  }
  return text(result.stdout, 1200);
}
function validateMain() {
  shell("git", ["fetch", "origin", "main"], "BENCHMARK_UNPAUSE_GIT_FETCH_FAILED");
  const branch = shell("git", ["branch", "--show-current"], "BENCHMARK_UNPAUSE_GIT_BRANCH_FAILED");
  if (branch !== "main") throw new Error(`BENCHMARK_UNPAUSE_MAIN_REQUIRED:${branch || "DETACHED"}`);
  const head = shell("git", ["rev-parse", "HEAD"], "BENCHMARK_UNPAUSE_GIT_HEAD_FAILED");
  const remote = shell("git", ["rev-parse", "origin/main"], "BENCHMARK_UNPAUSE_GIT_REMOTE_FAILED");
  if (head !== remote) {
    throw new Error(`BENCHMARK_UNPAUSE_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin_main=${remote}`);
  }
  return head;
}

const managementKey = text(process.env.RUNPOD_MANAGEMENT_API_KEY, 4000) || text(process.env.RUNPOD_API_KEY, 4000);
const queueKey = text(process.env.RUNPOD_API_KEY, 4000) || managementKey;
const endpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_ID, 240);
const trainerEndpointId = text(process.env.RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID, 240);
if (!managementKey) throw new Error("BENCHMARK_UNPAUSE_MANAGEMENT_KEY_REQUIRED");
if (!queueKey) throw new Error("BENCHMARK_UNPAUSE_QUEUE_KEY_REQUIRED");
if (!endpointId) throw new Error("BENCHMARK_UNPAUSE_ENDPOINT_ID_REQUIRED");
if (trainerEndpointId && trainerEndpointId !== endpointId) {
  throw new Error("BENCHMARK_UNPAUSE_ENDPOINT_TRAINER_ID_MISMATCH");
}

async function readJson(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    const detail = typeof body?.message === "string"
      ? body.message
      : typeof body?.detail === "string"
        ? body.detail
        : typeof body?.error === "string"
          ? body.error
          : raw;
    throw new Error(`${label}_HTTP_${response.status}:${text(detail, 900) || "EMPTY_BODY"}`);
  }
  return body ?? {};
}

async function rest(path, options = {}) {
  return readJson(
    await fetch(`${REST_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${managementKey}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(30_000),
    }),
    "BENCHMARK_UNPAUSE_REST",
  );
}

async function health() {
  return readJson(
    await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
      headers: {
        Authorization: `Bearer ${queueKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(30_000),
    }),
    "BENCHMARK_UNPAUSE_HEALTH",
  );
}

function counters(raw) {
  const jobs = object(raw?.jobs);
  const workers = object(raw?.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress),
    },
    workers: {
      idle: finite(workers.idle),
      initializing: finite(workers.initializing),
      ready: finite(workers.ready),
      running: finite(workers.running),
      throttled: finite(workers.throttled),
      unhealthy: finite(workers.unhealthy),
    },
  };
}

function liveManagementWorkers(endpoint) {
  const exited = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
  return list(endpoint?.workers).filter((worker) => {
    const desired = text(worker?.desiredStatus ?? worker?.desired_status, 80).toUpperCase();
    const status = text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus, 80).toUpperCase();
    if (desired && !exited.has(desired)) return true;
    return Boolean(status && !exited.has(status));
  });
}

const mainCommit = validateMain();
const apply = process.argv.includes("--apply");
if (apply && !yes(process.env.AVANTIQO_INTELLIGENCE_BENCHMARK_UNPAUSE_APPROVED)) {
  throw new Error("AVANTIQO_INTELLIGENCE_BENCHMARK_UNPAUSE_APPROVED=YES_REQUIRED");
}

const [endpoint, rawHealth] = await Promise.all([
  rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`),
  health(),
]);
if (text(endpoint?.id, 240) !== endpointId) throw new Error("BENCHMARK_UNPAUSE_ENDPOINT_ID_MISMATCH");
if (text(endpoint?.name, 240) !== ENDPOINT_NAME) throw new Error("BENCHMARK_UNPAUSE_ENDPOINT_NAME_MISMATCH");
const template = object(endpoint?.template);
if (text(template?.env?.AVANTIQO_INTELLIGENCE_BENCHMARK_ENABLED, 40).toLowerCase() !== "true") {
  throw new Error("BENCHMARK_UNPAUSE_BENCHMARK_TEMPLATE_NOT_ENABLED");
}
if (text(template?.env?.AVANTIQO_INTELLIGENCE_TRAINER_ENABLED, 40).toLowerCase() === "true") {
  throw new Error("BENCHMARK_UNPAUSE_TRAINER_TEMPLATE_STILL_ENABLED");
}
const before = {
  template_id: text(endpoint?.templateId || template?.id, 240),
  network_volume_id: text(endpoint?.networkVolumeId, 240) || null,
  gpu_type_ids: list(endpoint?.gpuTypeIds).map((value) => text(value, 160)).filter(Boolean),
  workers_min: finite(endpoint?.workersMin, -1),
  workers_max: finite(endpoint?.workersMax, -1),
};
if (!before.template_id) throw new Error("BENCHMARK_UNPAUSE_TEMPLATE_ID_REQUIRED");
if (before.workers_min !== 0) throw new Error(`BENCHMARK_UNPAUSE_WORKERS_MIN_INVALID:${before.workers_min}`);
if (![0, 1].includes(before.workers_max)) {
  throw new Error(`BENCHMARK_UNPAUSE_WORKERS_MAX_INVALID:${before.workers_max}`);
}
const beforeHealth = counters(rawHealth);
const liveWorkers = liveManagementWorkers(endpoint);
const queueWorkerCount = Object.values(beforeHealth.workers).reduce((sum, value) => sum + value, 0);
if (beforeHealth.jobs.in_queue || beforeHealth.jobs.in_progress) {
  throw new Error(`BENCHMARK_UNPAUSE_ACTIVE_JOBS:queue=${beforeHealth.jobs.in_queue}:progress=${beforeHealth.jobs.in_progress}`);
}
if (liveWorkers.length || queueWorkerCount) {
  throw new Error(`BENCHMARK_UNPAUSE_ACTIVE_WORKERS:management=${liveWorkers.length}:queue=${queueWorkerCount}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: apply ? "APPLY" : "PLAN",
  main_commit: mainCommit,
  endpoint: {
    id: endpointId,
    name: ENDPOINT_NAME,
    workers_min: before.workers_min,
    workers_max: before.workers_max,
    template_id: before.template_id,
    network_volume_present: Boolean(before.network_volume_id),
    gpu_type_count: before.gpu_type_ids.length,
  },
  health: beforeHealth,
  target_workers_min: 0,
  target_workers_max: 1,
  provider_job_submitted: false,
  queue_mutation_performed: false,
  production_model_promoted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (!apply) {
  console.log("AVANTIQO_INTELLIGENCE_BENCHMARK_UNPAUSE_APPLIED=false");
  process.exit(0);
}

if (before.workers_max !== 1) {
  await rest(`/endpoints/${encodeURIComponent(endpointId)}`, {
    method: "PATCH",
    body: { workersMin: 0, workersMax: 1 },
  });
}
const verified = await rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`);
if (finite(verified?.workersMin, -1) !== 0 || finite(verified?.workersMax, -1) !== 1) {
  throw new Error(`BENCHMARK_UNPAUSE_VERIFY_WORKERS_FAILED:min=${finite(verified?.workersMin, -1)}:max=${finite(verified?.workersMax, -1)}`);
}
if (text(verified?.templateId || verified?.template?.id, 240) !== before.template_id) {
  throw new Error("BENCHMARK_UNPAUSE_TEMPLATE_CHANGED");
}
if (text(verified?.networkVolumeId, 240) !== text(before.network_volume_id, 240)) {
  throw new Error("BENCHMARK_UNPAUSE_VOLUME_CHANGED");
}
if (JSON.stringify(list(verified?.gpuTypeIds)) !== JSON.stringify(list(endpoint?.gpuTypeIds))) {
  throw new Error("BENCHMARK_UNPAUSE_GPU_POOL_CHANGED");
}

console.log(JSON.stringify({
  contract: CONTRACT,
  event: "AVANTIQO_INTELLIGENCE_BENCHMARK_GATEWAY_PROPAGATION_WAIT",
  wait_ms: PROPAGATION_WAIT_MS,
  workers_min: 0,
  workers_max: 1,
  provider_job_submitted: false,
  secrets_printed: false,
}, null, 2));
await sleep(PROPAGATION_WAIT_MS);

const afterHealth = counters(await health());
if (afterHealth.jobs.in_queue || afterHealth.jobs.in_progress) {
  throw new Error(`BENCHMARK_UNPAUSE_UNEXPECTED_JOB_AFTER_WAIT:queue=${afterHealth.jobs.in_queue}:progress=${afterHealth.jobs.in_progress}`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  event: "AVANTIQO_INTELLIGENCE_BENCHMARK_ENDPOINT_READY_FOR_SUBMISSION",
  endpoint_id: endpointId,
  workers_min: 0,
  workers_max: 1,
  health: afterHealth,
  provider_job_submitted: false,
  queue_mutation_performed: false,
  production_model_promoted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
console.log("AVANTIQO_INTELLIGENCE_BENCHMARK_UNPAUSE=PASS");
