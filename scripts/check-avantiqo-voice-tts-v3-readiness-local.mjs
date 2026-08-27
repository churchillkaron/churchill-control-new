import { spawnSync } from "node:child_process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST = "https://rest.runpod.io/v1";
const CONTROL = "https://api.runpod.io/v2";
const QUEUE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_VOICE_TTS_V3_READINESS_V4";
const SAFE_LEASE_CONTRACT = "AVANTIQO_RUNPOD_SAFE_LEASE_V2";
const EVIDENCE_PATH = "audits/results/avantiqo-voice-worker-images.json";
const REQUIRED_CONSECUTIVE_CLEAR = 3;
const MAX_OBSERVATIONS = 8;
const OBSERVATION_INTERVAL_MS = 5000;
const TERMINAL_WORKER_STATUSES = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function number(value) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }
function required(name) { const value = text(process.env[name]); if (!value) throw new Error(`${name}_REQUIRED`); return value; }
function yes(value) { return ["YES", "TRUE", "1", "APPROVED"].includes(text(value).toUpperCase()); }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function commandList(value) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  const scalar = text(value);
  return scalar ? [scalar] : [];
}
function normalizeList(value, keys = [], depth = 0) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object" || depth > 4) return null;
  for (const key of [...keys, "data", "items", "results"]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const found = normalizeList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}
function runGit(args) {
  const result = spawnSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`GIT_${text(args[0]).toUpperCase()}_FAILED:${text(result.stderr).slice(0, 500)}`);
  return result.stdout;
}
function requireSafeLeaseV2(endpointId) {
  if (!yes(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ACTIVE)) {
    throw new Error("AVANTIQO_VOICE_TTS_READINESS_SAFE_LEASE_ACTIVE_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_CONTRACT) !== SAFE_LEASE_CONTRACT) {
    throw new Error("AVANTIQO_VOICE_TTS_READINESS_SAFE_LEASE_V2_REQUIRED");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_LANE) !== "voice-tts") {
    throw new Error("AVANTIQO_VOICE_TTS_READINESS_SAFE_LEASE_LANE_MISMATCH");
  }
  if (text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_ENDPOINT_ID) !== endpointId) {
    throw new Error("AVANTIQO_VOICE_TTS_READINESS_SAFE_LEASE_ENDPOINT_MISMATCH");
  }
  const expiresAt = Date.parse(text(process.env.AVANTIQO_RUNPOD_SAFE_LEASE_EXPIRES_AT));
  if (!Number.isFinite(expiresAt) || expiresAt - Date.now() < 5000) {
    throw new Error("AVANTIQO_VOICE_TTS_READINESS_SAFE_LEASE_EXPIRY_INVALID");
  }
  return expiresAt;
}

async function parseJson(response, label) {
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    const detail = text(body?.message || body?.error || body?.detail || raw).slice(0, 700);
    throw new Error(`${label}_HTTP_${response.status}:${detail || "EMPTY_BODY"}`);
  }
  return body || {};
}
async function rest(pathname, key) {
  return parseJson(await fetch(`${REST}${pathname}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(30000),
  }), "RUNPOD_VOICE_TTS_READINESS_REST");
}
async function queueRead(endpointId, pathname, credentials) {
  const candidates = [...new Set([credentials.inference, credentials.management].filter(Boolean))];
  let last = null;
  for (const key of candidates) {
    const response = await fetch(`${QUEUE}/${encodeURIComponent(endpointId)}${pathname}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    const raw = await response.text();
    let body = null;
    try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
    if (response.ok) return body || {};
    if (![401, 403].includes(response.status)) {
      throw new Error(`RUNPOD_VOICE_TTS_READINESS_QUEUE_HTTP_${response.status}:${text(body?.message || body?.error || raw).slice(0, 500)}`);
    }
    last = new Error(`RUNPOD_VOICE_TTS_READINESS_QUEUE_HTTP_${response.status}`);
  }
  throw last || new Error("RUNPOD_VOICE_TTS_READINESS_QUEUE_CREDENTIAL_REQUIRED");
}
async function controlWorkers(endpointId, key) {
  const body = await parseJson(await fetch(
    `${CONTROL}/serverless/${encodeURIComponent(endpointId)}/workers`,
    { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(30000) },
  ), "RUNPOD_VOICE_TTS_READINESS_CONTROL");
  return list(body?.workers).map((worker) => ({
    id: text(worker?.id) || null,
    status: text(worker?.status).toUpperCase() || null,
    image: text(worker?.image) || null,
    gpu_type_id: text(worker?.gpuTypeId) || null,
    data_center_id: text(worker?.dataCenterId) || null,
    is_stale: worker?.isStale === true,
  }));
}
function nonTerminalControlWorkers(workers) {
  return workers.filter((worker) => !TERMINAL_WORKER_STATUSES.has(text(worker?.status).toUpperCase()));
}
function managementWorkers(endpointState) {
  return list(endpointState?.workers).map((worker) => ({
    id: text(worker?.id) || null,
    status: text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase() || null,
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
  }));
}
function activeManagementWorkers(workers) {
  return workers.filter((worker) => {
    const status = text(worker?.status).toUpperCase();
    const desired = text(worker?.desired_status).toUpperCase();
    if (status && !TERMINAL_WORKER_STATUSES.has(status)) return true;
    if (desired && !TERMINAL_WORKER_STATUSES.has(desired)) return true;
    return !status && !desired;
  });
}
async function boundTemplates(key) {
  const raw = await rest(
    "/templates?includeEndpointBoundTemplates=true&includePublicTemplates=false&includeRunpodTemplates=false",
    key,
  );
  const templates = normalizeList(raw, ["templates"]);
  if (!templates) throw new Error("AVANTIQO_VOICE_TTS_READINESS_TEMPLATE_LIST_INVALID");
  return templates;
}
function normalizeHealth(healthBody) {
  const jobs = object(healthBody?.jobs);
  const workersHealth = object(healthBody?.workers);
  return {
    jobs: {
      in_queue: number(jobs.inQueue ?? jobs.in_queue),
      in_progress: number(jobs.inProgress ?? jobs.in_progress),
    },
    workers: {
      idle: number(workersHealth.idle),
      initializing: number(workersHealth.initializing),
      ready: number(workersHealth.ready),
      running: number(workersHealth.running),
      throttled: number(workersHealth.throttled),
      unhealthy: number(workersHealth.unhealthy),
    },
  };
}
function healthWorkerTotal(health) {
  return (
    health.workers.idle +
    health.workers.initializing +
    health.workers.ready +
    health.workers.running +
    health.workers.throttled +
    health.workers.unhealthy
  );
}
function reconcileControlWorkers(workerRecords, managementActiveWorkers, health) {
  const terminalWorkerRecords = workerRecords.filter((worker) =>
    TERMINAL_WORKER_STATUSES.has(text(worker?.status).toUpperCase()),
  );
  const nonTerminalWorkers = nonTerminalControlWorkers(workerRecords);
  const noLiveManagementWorker = managementActiveWorkers.length === 0;
  const noHealthWorker = healthWorkerTotal(health) === 0;
  const noJobs = health.jobs.in_queue === 0 && health.jobs.in_progress === 0;
  const staleControlGhosts = nonTerminalWorkers.filter((worker) =>
    worker.is_stale === true && noLiveManagementWorker && noHealthWorker && noJobs,
  );
  const liveWorkers = nonTerminalWorkers.filter((worker) => !staleControlGhosts.includes(worker));
  return { terminalWorkerRecords, staleControlGhosts, liveWorkers };
}
function dynamicBlockers(health, workers, managementActiveWorkers, certifiedImage) {
  const reasons = [];
  if (health.jobs.in_queue !== 0) reasons.push(`JOBS_IN_QUEUE:${health.jobs.in_queue}`);
  if (health.jobs.in_progress !== 0) reasons.push(`JOBS_IN_PROGRESS:${health.jobs.in_progress}`);
  if (health.workers.unhealthy !== 0) reasons.push(`UNHEALTHY_WORKERS:${health.workers.unhealthy}`);
  if (health.workers.throttled !== 0) reasons.push(`HEALTH_THROTTLED_WORKERS:${health.workers.throttled}`);
  if (health.workers.initializing !== 0) reasons.push(`HEALTH_INITIALIZING_WORKERS:${health.workers.initializing}`);

  const throttledWorkers = workers.filter((worker) => worker.status === "THROTTLED");
  if (throttledWorkers.length) reasons.push(`CONTROL_THROTTLED_WORKERS:${throttledWorkers.length}`);
  const unhealthyWorkers = workers.filter((worker) => worker.status === "UNHEALTHY");
  if (unhealthyWorkers.length) reasons.push(`CONTROL_UNHEALTHY_WORKERS:${unhealthyWorkers.length}`);
  const initializingWorkers = workers.filter((worker) => worker.status === "INITIALIZING");
  if (initializingWorkers.length) reasons.push(`CONTROL_INITIALIZING_WORKERS:${initializingWorkers.length}`);
  const mismatchedWorkers = workers.filter((worker) => worker.image && worker.image !== certifiedImage);
  if (mismatchedWorkers.length) reasons.push("LIVE_WORKER_IMAGE_MISMATCH");
  const staleWorkers = workers.filter((worker) => worker.is_stale);
  if (staleWorkers.length) reasons.push("STALE_WORKER_PRESENT");

  const liveHealthyWorkers = workers.filter((worker) => ["IDLE", "READY", "RUNNING"].includes(worker.status));
  const visibleHealthWorkers = healthWorkerTotal(health);
  if (workers.length > 0 && liveHealthyWorkers.length === 0) {
    reasons.push("CONTROL_WORKER_STATE_NOT_HEALTHY");
  }
  if ((workers.length > 0) !== (visibleHealthWorkers > 0)) {
    reasons.push("CONTROL_HEALTH_WORKER_STATE_DISAGREEMENT");
  }
  if ((managementActiveWorkers.length > 0) !== (visibleHealthWorkers > 0)) {
    reasons.push("MANAGEMENT_HEALTH_WORKER_STATE_DISAGREEMENT");
  }
  if ((workers.length > 0) !== (managementActiveWorkers.length > 0)) {
    reasons.push("CONTROL_MANAGEMENT_WORKER_STATE_DISAGREEMENT");
  }

  return [...new Set(reasons)];
}

runGit(["fetch", "origin", "main", "--quiet"]);
const evidence = JSON.parse(runGit(["show", `origin/main:${EVIDENCE_PATH}`]));
const tts = object(evidence?.tts);
const certifiedImage = text(tts?.immutable_image_reference);
const certifiedSourceSha = text(tts?.source_sha);
if (
  evidence?.contract !== "AVANTIQO_VOICE_WORKER_IMAGES_RESULT_V1" ||
  tts?.success !== true ||
  tts?.source_sha_matches_trigger !== true ||
  tts?.startup_probe_outcome !== "success" ||
  tts?.container_startup_probe_passed_by_github_build !== true ||
  tts?.foundation_model !== "resemble-ai/chatterbox:multilingual-v3" ||
  tts?.blackwell_sm120_compiled !== true ||
  !/^ghcr\.io\/.+@sha256:[a-f0-9]{64}$/i.test(certifiedImage)
) {
  throw new Error("AVANTIQO_VOICE_TTS_READINESS_CERTIFIED_V3_IMAGE_REQUIRED");
}

const endpointId = required("RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID");
const leaseExpiresAt = requireSafeLeaseV2(endpointId);
const credentials = {
  management: required("RUNPOD_MANAGEMENT_API_KEY"),
  inference: text(process.env.RUNPOD_API_KEY),
};

const endpoint = await rest(
  `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
  credentials.management,
);
if (text(endpoint?.id) !== endpointId) throw new Error("AVANTIQO_VOICE_TTS_READINESS_ENDPOINT_MISMATCH");
if (!text(endpoint?.name).startsWith("avantiqo-voice-tts-v1")) {
  throw new Error("AVANTIQO_VOICE_TTS_READINESS_ENDPOINT_NAME_UNSAFE");
}
const templateId = text(endpoint?.templateId || endpoint?.template?.id);
const template = (await boundTemplates(credentials.management)).find((item) => text(item?.id) === templateId);
if (!template) throw new Error("AVANTIQO_VOICE_TTS_READINESS_BOUND_TEMPLATE_NOT_FOUND");

const staticReasons = [];
if (Number(endpoint?.workersMin) !== 0) staticReasons.push("WORKERS_MIN_NOT_ZERO");
if (Number(endpoint?.workersMax) !== 1) staticReasons.push("WORKERS_MAX_NOT_ONE_UNDER_SAFE_LEASE");
if (text(template?.imageName) !== certifiedImage) staticReasons.push("BOUND_IMAGE_NOT_CERTIFIED_V3");
if (commandList(template?.dockerEntrypoint).length || commandList(template?.dockerStartCmd).length) {
  staticReasons.push("BOUND_TEMPLATE_LAUNCH_OVERRIDE_PRESENT");
}

const observations = [];
const historicalDynamicBlockers = new Set();
let consecutiveClear = 0;
let stableWindowReached = false;
for (let index = 0; index < MAX_OBSERVATIONS; index += 1) {
  const [healthBody, workerRecords, managementEndpoint] = await Promise.all([
    queueRead(endpointId, "/health", credentials),
    controlWorkers(endpointId, credentials.management),
    rest(`/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=false&includeWorkers=true`, credentials.management),
  ]);
  const health = normalizeHealth(healthBody);
  const managementWorkerRecords = managementWorkers(managementEndpoint);
  const managementActiveWorkerRecords = activeManagementWorkers(managementWorkerRecords);
  const reconciled = reconcileControlWorkers(workerRecords, managementActiveWorkerRecords, health);
  const workers = reconciled.liveWorkers;
  const controlStatusCounts = workerRecords.reduce((counts, worker) => {
    const status = worker.status || "UNKNOWN";
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
  const blockers = dynamicBlockers(health, workers, managementActiveWorkerRecords, certifiedImage);
  for (const blocker of blockers) historicalDynamicBlockers.add(blocker);
  consecutiveClear = blockers.length === 0 ? consecutiveClear + 1 : 0;

  const observation = {
    observation: index + 1,
    clear: blockers.length === 0,
    consecutive_clear: consecutiveClear,
    blockers,
    health,
    workers,
    management_workers: managementWorkerRecords,
    management_active_workers: managementActiveWorkerRecords,
    control_status_counts: controlStatusCounts,
    terminal_worker_records_ignored: reconciled.terminalWorkerRecords.length,
    stale_control_ghost_records_ignored: reconciled.staleControlGhosts.length,
    zero_live_workers_observed: workers.length === 0 && managementActiveWorkerRecords.length === 0 && healthWorkerTotal(health) === 0,
    live_worker_state_valid: blockers.length === 0,
  };
  observations.push(observation);
  console.log(JSON.stringify({
    event: "AVANTIQO_VOICE_TTS_V4_READINESS_OBSERVATION",
    ...observation,
    safe_lease_contract: SAFE_LEASE_CONTRACT,
    generation_submitted: false,
    mutation_performed: false,
    secrets_printed: false,
  }));

  if (consecutiveClear >= REQUIRED_CONSECUTIVE_CLEAR) {
    stableWindowReached = true;
    break;
  }
  if (index + 1 < MAX_OBSERVATIONS) await sleep(OBSERVATION_INTERVAL_MS);
}

const finalObservation = observations.at(-1) || { health: null, workers: [], blockers: [] };
const reasons = [...staticReasons];
if (!stableWindowReached) {
  reasons.push("STABLE_CLEAR_WINDOW_NOT_REACHED");
  reasons.push(...finalObservation.blockers);
}
const uniqueReasons = [...new Set(reasons)];
const ready = uniqueReasons.length === 0 && stableWindowReached;
const result = {
  success: ready,
  contract: CONTRACT,
  safe_lease_contract: SAFE_LEASE_CONTRACT,
  safe_lease_lane: "voice-tts",
  safe_lease_endpoint_id: endpointId,
  safe_lease_expires_at: new Date(leaseExpiresAt).toISOString(),
  ready_for_controlled_generation: ready,
  serverless_cold_start_ready: ready,
  zero_live_workers_allowed: true,
  terminal_worker_history_ignored: true,
  stale_control_ghost_history_ignored_only_when_live_planes_are_zero: true,
  blockers: uniqueReasons,
  stability: {
    required_consecutive_clear: REQUIRED_CONSECUTIVE_CLEAR,
    max_observations: MAX_OBSERVATIONS,
    observations_taken: observations.length,
    interval_ms: OBSERVATION_INTERVAL_MS,
    consecutive_clear_observations: consecutiveClear,
    stable_clear_window_reached: stableWindowReached,
    historical_transient_blockers: [...historicalDynamicBlockers],
  },
  endpoint: {
    id: endpointId,
    name: text(endpoint?.name) || null,
    template_id: templateId,
    workers_min: Number(endpoint?.workersMin),
    workers_max: Number(endpoint?.workersMax),
  },
  certified: {
    source_sha: certifiedSourceSha,
    image: certifiedImage,
    foundation_model: text(tts?.foundation_model) || null,
    cuda_runtime_expected: text(tts?.cuda_runtime_expected) || null,
    torch_runtime_expected: text(tts?.torch_runtime_expected) || null,
    blackwell_sm120_compiled: tts?.blackwell_sm120_compiled === true,
    runpod_fitness_sdk_required: text(tts?.runpod_fitness_sdk_required) || null,
  },
  bound_image: text(template?.imageName) || null,
  health: finalObservation.health,
  workers: finalObservation.workers,
  management_workers: finalObservation.management_workers || [],
  management_active_workers: finalObservation.management_active_workers || [],
  observations,
  read_only: true,
  mutation_performed: false,
  generation_submitted: false,
  job_cancel_requested: false,
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
};

console.log(JSON.stringify(result, null, 2));
if (!result.success) process.exitCode = 2;