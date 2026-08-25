import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { sharedVolumeGroup } from "./lib/avantiqo-runpod-shared-volumes.mjs";

const REST_BASE = "https://rest.runpod.io/v1";
const QUEUE_BASE = "https://api.runpod.ai/v2";
const CONTRACT = "AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_AND_EXPAND_V1";
const AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1";
const RETIRED_AUDIO_ENDPOINT_NAME = "avantiqo-audio-v1-github-retired";
const SHARED_GROUP = sharedVolumeGroup("AUDIO_VOICE");
const EXPANSION_SCRIPT = resolve("scripts/expand-avantiqo-audio-voice-volume-local.mjs");
const POLL_MS = 3_000;
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
function inferenceCandidates() {
  const raw = [
    { source: "AUDIO_DEDICATED", credential: text(process.env.RUNPOD_AVANTIQO_AUDIO_API_KEY) },
    { source: "ACCOUNT", credential: text(process.env.RUNPOD_API_KEY) },
  ].filter((entry) => entry.credential);
  const seen = new Set();
  return raw.filter((entry) => {
    if (seen.has(entry.credential)) return false;
    seen.add(entry.credential);
    return true;
  });
}
async function queueHealth(endpointId, candidates) {
  const attempts = [];
  for (const candidate of candidates) {
    try {
      const body = await parseResponse(
        await fetch(`${QUEUE_BASE}/${encodeURIComponent(endpointId)}/health`, {
          headers: { Authorization: `Bearer ${candidate.credential}`, Accept: "application/json" },
          signal: AbortSignal.timeout(30_000),
        }),
        "RUNPOD_QUEUE_HEALTH",
      );
      return { body, credential_source: candidate.source };
    } catch (error) {
      attempts.push(`${candidate.source}:${text(error?.message || error)}`);
    }
  }
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_HEALTH_UNREACHABLE:${attempts.join("|")}`);
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

const managementKey = required("RUNPOD_MANAGEMENT_API_KEY");
const endpointId = required("RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID");
const candidates = inferenceCandidates();
if (!candidates.length) throw new Error("RUNPOD_AUDIO_INFERENCE_API_KEY_REQUIRED");

console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_CONTRACT=${CONTRACT}`);
console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_TIMEOUT_MS=${DRAIN_TIMEOUT_MS}`);
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_FORCE_STOP_PERFORMED=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_ENDPOINT_MUTATION_PERFORMED=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_GENERATION_SUBMITTED=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_SECRETS_PRINTED=false");

const initialEndpoints = await rest("/endpoints?includeTemplate=true&includeWorkers=true", managementKey);
if (!Array.isArray(initialEndpoints)) throw new Error("AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_ENDPOINT_LIST_INVALID");
const initialAudio = resolveAudioEndpoint(initialEndpoints, endpointId);
const volumeIds = endpointVolumeIds(initialAudio);
if (volumeIds.length !== 1) {
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_SINGLE_VOLUME_REQUIRED:count=${volumeIds.length}`);
}
const volumeId = volumeIds[0];

const startedAt = Date.now();
let observations = 0;
let finalHealth = null;
let finalCredentialSource = null;
let finalConsumers = null;
while (true) {
  observations += 1;
  const [healthRead, endpoints] = await Promise.all([
    queueHealth(endpointId, candidates),
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
  const runtimeLive = activeRuntimeWorkers(health);
  const elapsedMs = Date.now() - startedAt;

  if (runtimeLive === 0 && managementLive.length === 0) {
    finalHealth = health;
    finalCredentialSource = healthRead.credential_source;
    finalConsumers = consumers;
    console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN=PASS`);
    console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_OBSERVATIONS=${observations}`);
    console.log(`AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_WAITED_MS=${elapsedMs}`);
    break;
  }

  console.log(
    `AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_WAIT=runtime_workers:${runtimeLive}:management_workers:${managementLive.length}:elapsed_ms:${elapsedMs}`,
  );
  if (elapsedMs >= DRAIN_TIMEOUT_MS) {
    throw new Error(
      `AVANTIQO_AUDIO_VOICE_VOLUME_DRAIN_TIMEOUT:runtime_workers=${runtimeLive}:management_workers=${managementLive.length}:elapsed_ms=${elapsedMs}`,
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
  health: finalHealth,
  health_credential_source: finalCredentialSource,
  attached_endpoints: finalConsumers,
  worker_scale_to_zero_verified: true,
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
  env: process.env,
  stdio: "inherit",
});
if (child.error) throw child.error;
if (child.status !== 0) {
  throw new Error(`AVANTIQO_AUDIO_VOICE_VOLUME_EXPANSION_DELEGATE_FAILED:exit=${child.status ?? "UNKNOWN"}`);
}
