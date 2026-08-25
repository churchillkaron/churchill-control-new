import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { sharedVolumeGroup } from "./lib/avantiqo-runpod-shared-volumes.mjs";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const REST_BASE = "https://rest.runpod.io/v1";
const CONTROL_BASE = "https://api.runpod.io/v2";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_AND_EXPAND_V3";
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const RETIRED_AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1-github-retired";
const SHARED_GROUP = sharedVolumeGroup("AUDIO_VOICE");
const EXPANSION_SCRIPT = resolve("scripts/expand-avantiqo-audio-voice-volume-local.mjs");
const POLL_MS = 3_000;
const REQUIRED_STABLE_DRAIN_OBSERVATIONS = 2;
const DEFAULT_DRAIN_TIMEOUT_MS = 120_000;
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
function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
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
    is_stale: worker?.isStale === true,
  }));
}
function activeControlWorkers(body = {}) {
  return safeControlWorkers(body).filter(
    (worker) => !["EXITED", "STOPPED", "TERMINATED", "DELETED"].includes(worker.status || ""),
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
async function rest(path, credential) {
  return parseResponse(
    await fetch(`${REST_BASE}${path}`, {
      headers: { Authorization: `Bearer ${credential}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
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

const endpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
const managementCredentialRead = await proveManagementCredential(managementCandidates());
const managementKey = managementCredentialRead.credential;
const managementCredentialSource = managementCredentialRead.credential_source;
const candidates = inferenceCandidates();

console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_TIMEOUT_MS=${DRAIN_TIMEOUT_MS}`);
console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_STABLE_OBSERVATIONS_REQUIRED=${REQUIRED_STABLE_DRAIN_OBSERVATIONS}`);
console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_MANAGEMENT_CREDENTIAL_SOURCE=${managementCredentialSource}`);
console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_MANAGEMENT_CREDENTIAL_FALLBACK=${managementCredentialRead.fallback_used}`);
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_FORCE_STOP_PERFORMED=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_ENDPOINT_MUTATION_PERFORMED=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_SECRETS_PRINTED=false");

const initialEndpoints = managementCredentialRead.body;
const initialAudio = resolveAudioEndpoint(initialEndpoints, endpointId);
const volumeIds = endpointVolumeIds(initialAudio);
if (volumeIds.length !== 1) {
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_SINGLE_VOLUME_REQUIRED:count=${volumeIds.length}`);
}
const volumeId = volumeIds[0];

const startedAt = Date.now();
let observations = 0;
let stableDrainObservations = 0;
let finalHealth = null;
let finalHealthCredentialSource = null;
let finalControlCredentialSource = null;
let finalControlWorkers = null;
let finalConsumers = null;
let staleHealthCountersTolerated = false;
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
  const runtimeLive = activeRuntimeWorkers(health);
  const elapsedMs = Date.now() - startedAt;

  if (managementLive.length === 0 && controlLive.length === 0) {
    stableDrainObservations += 1;
    staleHealthCountersTolerated ||= runtimeLive > 0;
  } else {
    stableDrainObservations = 0;
  }

  console.log(
    `AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_OBSERVE=health_workers:${runtimeLive}:management_workers:${managementLive.length}:control_workers:${controlLive.length}:stable:${stableDrainObservations}/${REQUIRED_STABLE_DRAIN_OBSERVATIONS}:elapsed_ms:${elapsedMs}`,
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
    break;
  }

  if (elapsedMs >= DRAIN_TIMEOUT_MS) {
    throw new Error(
      `AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_TIMEOUT:health_workers=${runtimeLive}:management_workers=${managementLive.length}:control_workers=${controlLive.length}:stable=${stableDrainObservations}:elapsed_ms=${elapsedMs}`,
    );
  }
  await sleep(POLL_MS);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
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
  stable_drain_observations: stableDrainObservations,
  safety: {
    read_only_drain: true,
    force_stop_performed: false,
    endpoint_mutation_performed: false,
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
  },
  stdio: "inherit",
});
if (child.error) throw child.error;
if (child.status !== 0) {
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_EXPANSION_DELEGATE_FAILED:exit=${child.status ?? "UNKNOWN"}`);
}
