import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { sharedVolumeGroup } from "./lib/avantiqo-runpod-shared-volumes.mjs";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_AND_EXPAND_V6";
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const RETIRED_AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1-github-retired";
const SHARED_GROUP = sharedVolumeGroup("AUDIO_VOICE");
const EXPANSION_SCRIPT = resolve("scripts/expand-avantiqo-audio-voice-volume-local.mjs");
const POLL_MS = 3_000;
const REQUIRED_STABLE_DRAIN_OBSERVATIONS = 2;
const ORPHAN_CONTROL_OBSERVATIONS_BEFORE_PAUSE = 2;
const DEFAULT_DRAIN_TIMEOUT_MS = 120_000;
const CONTROL_TERMINAL_STATUSES = new Set(["EXITED", "STOPPED", "TERMINATED", "DELETED"]);
const DRAIN_TIMEOUT_MS = Math.max(
  15_000,
  Math.min(
    5 * 60_000,
    Number(process.env.AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_TIMEOUT_MS || DEFAULT_DRAIN_TIMEOUT_MS),
  ),
);

function text(value) {
  return String(value ?? "").trim();
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function unique(values) {
  return [...new Set(values.map(text).filter(Boolean))];
}
function yes(value) {
  return ["YES", "TRUE", "1", "APPROVED", "ON"].includes(text(value).toUpperCase());
}
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}
function command(name, args, code) {
  const result = spawnSync(name, args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    throw new Error(`${code}:${text(result.stderr || result.stdout).slice(0, 1200)}`);
  }
  return text(result.stdout);
}
function requireCurrentMainSnapshot() {
  command("git", ["fetch", "origin", "main"], "AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_FETCH_MAIN_FAILED");
  const branch = command("git", ["branch", "--show-current"], "AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_BRANCH_READ_FAILED");
  if (branch !== "main") {
    throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_MAIN_REQUIRED:${branch || "DETACHED"}`);
  }
  const head = command("git", ["rev-parse", "HEAD"], "AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_HEAD_READ_FAILED");
  const origin = command("git", ["rev-parse", "origin/main"], "AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_ORIGIN_READ_FAILED");
  if (head !== origin) {
    throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_LOCAL_MAIN_NOT_CURRENT:head=${head}:origin=${origin}`);
  }
  return head;
}
function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
function endpointVolumeIds(endpoint = {}) {
  return unique([endpoint.networkVolumeId, ...list(endpoint.networkVolumeIds)]);
}
function managementWorkers(endpoint = {}) {
  return list(endpoint.workers).map((worker) => ({
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    runtime_status: text(worker?.status ?? worker?.workerStatus ?? worker?.runtimeStatus).toUpperCase() || null,
  }));
}
function healthCounters(body = {}) {
  const jobs = object(body.jobs);
  const workers = object(body.workers);
  return {
    jobs: {
      in_queue: finite(jobs.inQueue ?? jobs.in_queue, 0),
      in_progress: finite(jobs.inProgress ?? jobs.in_progress, 0),
      completed: finite(jobs.completed, 0),
      failed: finite(jobs.failed, 0),
    },
    workers: {
      initializing: finite(workers.initializing, 0),
      ready: finite(workers.ready, 0),
      idle: finite(workers.idle, 0),
      running: finite(workers.running, 0),
      throttled: finite(workers.throttled, 0),
      unhealthy: finite(workers.unhealthy, 0),
    },
  };
}
function activeRuntimeWorkers(health) {
  return (
    health.workers.initializing +
    health.workers.ready +
    health.workers.idle +
    health.workers.running +
    health.workers.throttled
  );
}
function safeControlWorkers(body = {}) {
  return list(body?.workers).map((worker) => ({
    id_present: Boolean(text(worker?.id)),
    status: text(worker?.status).toUpperCase() || null,
    desired_status: text(worker?.desiredStatus ?? worker?.desired_status).toUpperCase() || null,
    is_stale: worker?.isStale === true,
  }));
}
function controlWorkerBlocksDrain(worker) {
  if (CONTROL_TERMINAL_STATUSES.has(worker.status || "")) return false;
  if (worker.desired_status === "EXITED") return false;
  if (worker.is_stale === true) return false;
  return true;
}
function activeControlWorkers(body = {}) {
  return safeControlWorkers(body).filter(controlWorkerBlocksDrain);
}
function toleratedStaleControlWorkers(body = {}) {
  return safeControlWorkers(body).filter((worker) =>
    !CONTROL_TERMINAL_STATUSES.has(worker.status || "") &&
    (worker.desired_status === "EXITED" || worker.is_stale === true),
  );
}
function allowedVolumeConsumer(name) {
  return SHARED_GROUP.endpoint_names.includes(name) || name === RETIRED_AUDIO_ENDPOINT_NAME;
}
async function parseResponse(response, label) {
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(`${label}_HTTP_${response.status}:${text(body?.message || body?.error || body?.detail || raw).slice(0, 1000)}`);
  }
  return body ?? {};
}
async function rest(path, credential, options = {}) {
  return parseResponse(
    await fetch(`${REST_BASE}${path}`, {
      method: options.method || "GET",
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(options.timeoutMs || 30_000),
    }),
    "RUNPOD_REST",
  );
}
function credentialCandidates(entries, missingCode) {
  const seen = new Set();
  const candidates = entries
    .map(([source, credential]) => ({ source, credential: text(credential) }))
    .filter((entry) => entry.credential)
    .filter((entry) => {
      if (seen.has(entry.credential)) return false;
      seen.add(entry.credential);
      return true;
    });
  if (!candidates.length) throw new Error(missingCode);
  return candidates;
}
function managementCandidates() {
  return credentialCandidates(
    [
      ["DEDICATED_MANAGEMENT", process.env.RUNPOD_MANAGEMENT_API_KEY],
      ["ACCOUNT", process.env.RUNPOD_API_KEY],
    ],
    "RUNPOD_MANAGEMENT_OR_ACCOUNT_API_KEY_REQUIRED",
  );
}
function inferenceCandidates() {
  return credentialCandidates(
    [
      ["AUDIO_DEDICATED", process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY],
      ["ACCOUNT", process.env.RUNPOD_API_KEY],
      ["DEDICATED_MANAGEMENT", process.env.RUNPOD_MANAGEMENT_API_KEY],
    ],
    "RUNPOD_AUDIO_INFERENCE_API_KEY_REQUIRED",
  );
}
async function readWithCandidates(url, candidates, label) {
  const attempts = [];
  for (const candidate of candidates) {
    try {
      const body = await parseResponse(
        await fetch(url, {
          headers: { Authorization: `Bearer ${candidate.credential}`, Accept: "application/json" },
          signal: AbortSignal.timeout(30_000),
        }),
        label,
      );
      return {
        body,
        credential_source: candidate.source,
        credential: candidate.credential,
        fallback_used: candidate !== candidates[0],
      };
    } catch (error) {
      attempts.push(`${candidate.source}:${text(error?.message || error)}`);
    }
  }
  throw new Error(`${label}_CREDENTIALS_FAILED:${attempts.join("|")}`);
}
async function queueHealth(endpointId, candidates) {
  return readWithCandidates(
    `${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`,
    candidates,
    "RUNPOD_QUEUE_HEALTH",
  );
}
async function controlWorkers(endpointId, candidates) {
  return readWithCandidates(
    `${CONTROL_BASE}/serverless/${encodeURIComponent(endpointId)}/workers`,
    candidates,
    "RUNPOD_CONTROL_WORKERS",
  );
}
async function proveManagementCredential(candidates) {
  const result = await readWithCandidates(
    `${REST_BASE}/endpoints?includeTemplate=true&includeWorkers=true`,
    candidates,
    "RUNPOD_MANAGEMENT_ENDPOINT_LIST",
  );
  if (!Array.isArray(result.body)) {
    throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_ENDPOINT_LIST_INVALID");
  }
  return result;
}
function resolveAudioEndpoint(endpoints, configuredId) {
  const matches = endpoints.filter(
    (endpoint) =>
      text(endpoint?.id) === configuredId &&
      text(endpoint?.name) === AUDIO_ENDPOINT_NAME,
  );
  if (matches.length !== 1) {
    throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_AUDIO_ENDPOINT_INVALID:matches=${matches.length}`);
  }
  return matches[0];
}
function consumersForVolume(endpoints, volumeId) {
  return endpoints
    .filter((endpoint) => endpointVolumeIds(endpoint).includes(volumeId))
    .map((endpoint) => ({
      id: text(endpoint?.id) || null,
      name: text(endpoint?.name) || null,
      workers_min: finite(endpoint?.workersMin, -1),
      workers_max: finite(endpoint?.workersMax, -1),
      workers: managementWorkers(endpoint),
    }));
}
function validateConsumers(consumers) {
  for (const consumer of consumers) {
    if (!allowedVolumeConsumer(consumer.name)) {
      throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_UNEXPECTED_CONSUMER:${consumer.name || "MISSING"}`);
    }
    if (consumer.workers_min !== 0) {
      throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_WORKERS_MIN_BLOCKED:${consumer.name}:min=${consumer.workers_min}`);
    }
  }
}
function activeManagementWorkers(consumers) {
  return consumers.flatMap((consumer) =>
    consumer.workers
      .filter((worker) => worker.desired_status && worker.desired_status !== "EXITED")
      .map((worker) => ({ endpoint_name: consumer.name, ...worker })),
  );
}
async function verifyAudioScaling(endpointId, managementKey, expectedMax) {
  const endpoint = await rest(
    `/endpoints/${encodeURIComponent(endpointId)}?includeTemplate=true&includeWorkers=true`,
    managementKey,
  );
  if (text(endpoint?.id) !== endpointId || text(endpoint?.name) !== AUDIO_ENDPOINT_NAME) {
    throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_SCALE_VERIFY_ENDPOINT_MISMATCH");
  }
  const min = finite(endpoint?.workersMin, -1);
  const max = finite(endpoint?.workersMax, -1);
  if (min !== 0 || max !== expectedMax) {
    throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_SCALE_VERIFY_FAILED:min=${min}:max=${max}:expected_max=${expectedMax}`);
  }
  return endpoint;
}

const operationMainSha = requireCurrentMainSnapshot();
const endpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
const managementCredentialRead = await proveManagementCredential(managementCandidates());
const managementKey = managementCredentialRead.credential;
const managementCredentialSource = managementCredentialRead.credential_source;
const candidates = inferenceCandidates();
const apply = process.argv.includes("--apply");
const expansionApproved = yes(process.env.AVANTIQO_AUDIO_VOICE_VOLUME_EXPANSION_APPROVED);

console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_OPERATION_MAIN_SHA=${operationMainSha}`);
console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_TIMEOUT_MS=${DRAIN_TIMEOUT_MS}`);
console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_STABLE_OBSERVATIONS_REQUIRED=${REQUIRED_STABLE_DRAIN_OBSERVATIONS}`);
console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_MANAGEMENT_CREDENTIAL_SOURCE=${managementCredentialSource}`);
console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_MANAGEMENT_CREDENTIAL_FALLBACK=${managementCredentialRead.fallback_used}`);
console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_ORPHAN_PAUSE_ALLOWED=${apply && expansionApproved}`);
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_DIRECT_FORCE_STOP_PERFORMED=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_SECRETS_PRINTED=false");

const initialEndpoints = managementCredentialRead.body;
const initialAudio = resolveAudioEndpoint(initialEndpoints, endpointId);
const initialWorkersMin = finite(initialAudio?.workersMin, -1);
const initialWorkersMax = finite(initialAudio?.workersMax, -1);
if (initialWorkersMin !== 0 || initialWorkersMax !== 1) {
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_SCALING_BASELINE_REQUIRED:min=${initialWorkersMin}:max=${initialWorkersMax}`);
}
const volumeIds = endpointVolumeIds(initialAudio);
if (volumeIds.length !== 1) {
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_SINGLE_VOLUME_REQUIRED:count=${volumeIds.length}`);
}
const volumeId = volumeIds[0];

const startedAt = Date.now();
let observations = 0;
let stableDrainObservations = 0;
let orphanControlObservations = 0;
let finalHealth = null;
let finalHealthCredentialSource = null;
let finalControlCredentialSource = null;
let finalControlWorkers = null;
let finalConsumers = null;
let staleHealthCountersTolerated = false;
let staleControlRowsTolerated = false;
let maxToleratedStaleControlRows = 0;
let endpointPausePerformed = false;
let endpointRestorePerformed = false;
let operationFailure = null;
let childStatus = null;

try {
  while (true) {
    observations += 1;
    const [healthRead, controlRead, endpoints] = await Promise.all([
      queueHealth(endpointId, candidates),
      controlWorkers(endpointId, candidates),
      rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey),
    ]);
    if (!Array.isArray(endpoints)) throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_ENDPOINT_LIST_INVALID");
    const audio = resolveAudioEndpoint(endpoints, endpointId);
    const currentVolumeIds = endpointVolumeIds(audio);
    if (currentVolumeIds.length !== 1 || currentVolumeIds[0] !== volumeId) {
      throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_AUDIO_ATTACHMENT_CHANGED");
    }
    const workersMin = finite(audio?.workersMin, -1);
    const workersMax = finite(audio?.workersMax, -1);
    const expectedWorkersMax = endpointPausePerformed ? 0 : initialWorkersMax;
    if (workersMin !== 0 || workersMax !== expectedWorkersMax) {
      throw new Error(
        `AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_SCALING_CHANGED:min=${workersMin}:max=${workersMax}:expected_max=${expectedWorkersMax}`,
      );
    }

    const health = healthCounters(healthRead.body);
    if (health.jobs.in_queue > 0 || health.jobs.in_progress > 0) {
      throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_NEW_JOB_BLOCKED:in_queue=${health.jobs.in_queue}:in_progress=${health.jobs.in_progress}`);
    }
    if (health.workers.unhealthy > 0) {
      throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_UNHEALTHY_WORKER_BLOCKED:count=${health.workers.unhealthy}`);
    }

    const consumers = consumersForVolume(endpoints, volumeId);
    validateConsumers(consumers);
    const managementLive = activeManagementWorkers(consumers);
    const controlLive = activeControlWorkers(controlRead.body);
    const toleratedControl = toleratedStaleControlWorkers(controlRead.body);
    const runtimeLive = activeRuntimeWorkers(health);
    const elapsedMs = Date.now() - startedAt;

    const orphanPauseCandidate =
      !endpointPausePerformed &&
      managementLive.length === 0 &&
      controlLive.length > 0 &&
      health.jobs.in_queue === 0 &&
      health.jobs.in_progress === 0 &&
      health.workers.running === 0 &&
      health.workers.unhealthy === 0 &&
      workersMin === 0 &&
      workersMax === initialWorkersMax;
    orphanControlObservations = orphanPauseCandidate ? orphanControlObservations + 1 : 0;

    if (
      orphanControlObservations >= ORPHAN_CONTROL_OBSERVATIONS_BEFORE_PAUSE &&
      !endpointPausePerformed
    ) {
      if (!apply) {
        throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_ORPHAN_WORKER_REQUIRES_APPLY");
      }
      if (!expansionApproved) {
        throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_EXPANSION_APPROVED=YES_REQUIRED_FOR_ORPHAN_PAUSE");
      }
      await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
        method: "PATCH",
        body: { workersMin: 0, workersMax: 0 },
      });
      await verifyAudioScaling(endpointId, managementKey, 0);
      endpointPausePerformed = true;
      stableDrainObservations = 0;
      orphanControlObservations = 0;
      console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_ORPHAN_WORKER_PAUSE=APPLIED");
      console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_ENDPOINT_MUTATION=TEMPORARY_WORKERS_MAX_ZERO");
      await sleep(POLL_MS);
      continue;
    }

    if (managementLive.length === 0 && controlLive.length === 0) {
      stableDrainObservations += 1;
      staleHealthCountersTolerated ||= runtimeLive > 0;
      staleControlRowsTolerated ||= toleratedControl.length > 0;
      maxToleratedStaleControlRows = Math.max(maxToleratedStaleControlRows, toleratedControl.length);
    } else {
      stableDrainObservations = 0;
    }

    console.log(
      `AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_OBSERVE=health_workers:${runtimeLive}:management_workers:${managementLive.length}:control_workers:${controlLive.length}:tolerated_stale_control_rows:${toleratedControl.length}:orphan_observations:${orphanControlObservations}/${ORPHAN_CONTROL_OBSERVATIONS_BEFORE_PAUSE}:paused:${endpointPausePerformed}:stable:${stableDrainObservations}/${REQUIRED_STABLE_DRAIN_OBSERVATIONS}:elapsed_ms:${elapsedMs}`,
    );

    if (stableDrainObservations >= REQUIRED_STABLE_DRAIN_OBSERVATIONS) {
      finalHealth = health;
      finalHealthCredentialSource = healthRead.credential_source;
      finalControlCredentialSource = controlRead.credential_source;
      finalControlWorkers = safeControlWorkers(controlRead.body);
      finalConsumers = consumers;
      console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN=PASS");
      console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_OBSERVATIONS=${observations}`);
      console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_WAITED_MS=${elapsedMs}`);
      console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_STALE_HEALTH_COUNTERS_TOLERATED=${staleHealthCountersTolerated}`);
      console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_STALE_CONTROL_ROWS_TOLERATED=${staleControlRowsTolerated}`);
      break;
    }

    if (elapsedMs >= DRAIN_TIMEOUT_MS) {
      throw new Error(
        `AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_TIMEOUT:health_workers=${runtimeLive}:management_workers=${managementLive.length}:control_workers=${controlLive.length}:tolerated_stale_control_rows=${toleratedControl.length}:orphan_observations=${orphanControlObservations}:paused=${endpointPausePerformed}:stable=${stableDrainObservations}:elapsed_ms=${elapsedMs}`,
      );
    }
    await sleep(POLL_MS);
  }

  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    operation_main_sha: operationMainSha,
    endpoint_id: endpointId,
    shared_volume_id: volumeId,
    shared_volume_group: SHARED_GROUP.id,
    management_credential_source: managementCredentialSource,
    management_credential_fallback_used: managementCredentialRead.fallback_used,
    health: finalHealth,
    health_credential_source: finalHealthCredentialSource,
    control_credential_source: finalControlCredentialSource,
    control_workers: finalControlWorkers,
    attached_endpoints: finalConsumers,
    control_worker_scale_to_zero_verified: true,
    management_worker_scale_to_zero_verified: true,
    health_worker_counters_observational_only: true,
    stale_health_worker_counters_tolerated: staleHealthCountersTolerated,
    stale_control_rows_tolerated: staleControlRowsTolerated,
    max_tolerated_stale_control_rows: maxToleratedStaleControlRows,
    orphan_worker_pause_performed: endpointPausePerformed,
    stable_drain_observations: stableDrainObservations,
    safety: {
      drain_read_only_until_orphan_pause: true,
      direct_force_stop_performed: false,
      temporary_endpoint_scale_pause_performed: endpointPausePerformed,
      generation_submitted: false,
      production_deploy_performed: false,
      secret_values_printed: false,
    },
  }, null, 2));

  const child = spawnSync(process.execPath, [EXPANSION_SCRIPT, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      RUNPOD_MANAGEMENT_API_KEY: managementKey,
      AVANTIQO_AUDIO_VOICE_VOLUME_OPERATION_MAIN_SHA: operationMainSha,
    },
    stdio: "inherit",
  });
  if (child.error) throw child.error;
  childStatus = child.status;
  if (child.status !== 0) {
    throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_EXPANSION_DELEGATE_FAILED:exit=${child.status ?? "UNKNOWN"}`);
  }
} catch (error) {
  operationFailure = error;
}

let restoreFailure = null;
if (endpointPausePerformed) {
  try {
    await rest(`/endpoints/${encodeURIComponent(endpointId)}`, managementKey, {
      method: "PATCH",
      body: { workersMin: 0, workersMax: initialWorkersMax },
    });
    await verifyAudioScaling(endpointId, managementKey, initialWorkersMax);
    endpointRestorePerformed = true;
    console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_ENDPOINT_RESTORE=PASS:workers_max=${initialWorkersMax}`);
  } catch (error) {
    restoreFailure = error;
    console.error(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_ENDPOINT_RESTORE=FAILED:${text(error?.message || error)}`);
  }
}

console.log(JSON.stringify({
  contract: CONTRACT,
  operation_main_sha: operationMainSha,
  endpoint_id: endpointId,
  temporary_endpoint_pause_performed: endpointPausePerformed,
  endpoint_restore_performed: endpointRestorePerformed,
  original_workers_min: initialWorkersMin,
  original_workers_max: initialWorkersMax,
  expansion_child_exit_status: childStatus,
  generation_submitted: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));

if (restoreFailure) {
  const prior = operationFailure ? `:prior=${text(operationFailure?.message || operationFailure)}` : "";
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_ENDPOINT_RESTORE_FAILED:${text(restoreFailure?.message || restoreFailure)}${prior}`);
}
if (operationFailure) throw operationFailure;
